// Reader interactions on a published blog — comments and applause.
//
// Modelled on /api/leads, and for the same reason: this is blog traffic, not app
// traffic. It is open, unauthenticated, rate-limited per IP, and persisted with
// the service role. Two differences that matter:
//
//   · IT IS ALSO A READ. The public blog document is CACHED (`use cache`, tagged
//     `site:<id>`), so comments and like counts can NOT be baked into it — a new
//     comment would have to wait for a publish to appear. Instead the render
//     ships an empty shell and this endpoint fills it in on load. The cached page
//     stays pure; the conversation stays live.
//   · NO EMAIL EVER LEAVES. A comment stores an email so the owner can reply and
//     so "verified" means something, but the public GET returns only name, body
//     and date. The column is never selected on the read path.
//
// Pre-migration-036 (42P01) is a NO-OP, not an error: a blog whose owner has
// switched the module on before the migration ran shows an empty, working
// section rather than a red box.

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/analytics/track'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { createHash } from 'node:crypto'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MISSING_TABLE = '42P01'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_COMMENTS = 200

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * A stable-but-anonymous handle for one browser on one site.
 *
 * It exists ONLY to stop the same visitor clapping a thousand times. The inputs
 * (IP + user agent) are hashed together with the site id and never stored, so
 * the row cannot be walked back to a person, and the same reader on two
 * different blogs is two different keys.
 */
function readerKey(req: NextRequest, siteId: string): string {
  const raw = `${clientIp(req)}|${req.headers.get('user-agent') ?? ''}|${siteId}`
  return createHash('sha256').update(raw).digest('base64url').slice(0, 32)
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS })
}

function sumCounts(rows: unknown[] | null | undefined): number {
  return (rows ?? []).reduce<number>((n, r) => n + (Number((r as { count?: number }).count) || 0), 0)
}

// ─── GET: everything the article's interaction modules need, in one round trip ─
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const siteId = sp.get('siteId')
  const postId = sp.get('postId')
  if (!isUuid(siteId) || !isUuid(postId)) return json({ ok: false, error: 'Bad request' }, 400)

  const admin = createAdminClient()
  const key = readerKey(request, siteId)

  const [likesRes, mineRes, commentsRes] = await Promise.all([
    admin.from('post_likes').select('count').eq('post_id', postId),
    admin.from('post_likes').select('count').eq('post_id', postId).eq('reader_key', key).maybeSingle(),
    // NOTE the column list: no `email`. Ever.
    admin.from('post_comments')
      .select('id, author, body, created_at')
      .eq('post_id', postId).eq('approved', true).eq('reported', false)
      .order('created_at', { ascending: false })
      .limit(MAX_COMMENTS),
  ])

  // Migration 036 not applied → an empty, working section.
  if (likesRes.error?.code === MISSING_TABLE || commentsRes.error?.code === MISSING_TABLE) {
    return json({ ok: true, likes: 0, mine: 0, comments: [] })
  }

  return json({
    ok: true,
    likes: sumCounts(likesRes.data),
    mine: Number((mineRes.data as { count?: number } | null)?.count ?? 0),
    comments: (commentsRes.data ?? []) as unknown as { id: string; author: string; body: string; created_at: string }[],
  })
}

// ─── POST: clap, or say something ────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Comments are the expensive, abusable half; one window covers both actions.
  const rl = rateLimit(`interactions:${clientIp(request)}`, 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Massa peticions. Espera un moment i torna-ho a provar.' },
      { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return json({ ok: false, error: 'Bad request' }, 400)

  const siteId = body.siteId
  const postId = body.postId
  if (!isUuid(siteId) || !isUuid(postId)) return json({ ok: false, error: 'Bad request' }, 400)

  const admin = createAdminClient()

  // The post must exist, be published, and belong to the site the caller claims.
  // Without this check any UUID pair would mint rows against someone else's blog.
  const { data: post, error: postErr } = await admin
    .from('posts').select('id').eq('id', postId).eq('site_id', siteId).eq('is_published', true).maybeSingle()
  if (postErr || !post) return json({ ok: false, error: 'Article no disponible' }, 404)

  if (body.action === 'like') {
    const key = readerKey(request, siteId)
    const max = Math.max(1, Math.min(50, Number(body.max) || 1))
    const want = Math.max(1, Math.min(max, Number(body.count) || 1))

    const { data: existing, error: readErr } = await admin
      .from('post_likes').select('count').eq('post_id', postId).eq('reader_key', key).maybeSingle()
    if (readErr?.code === MISSING_TABLE) return json({ ok: true, likes: 0, mine: 0 })

    // Monotonic: a reader's own tally only ever goes up, and never past `max`.
    const mine = Math.min(max, Math.max(want, Number((existing as { count?: number } | null)?.count ?? 0)))
    const { error } = await admin.from('post_likes').upsert(
      { post_id: postId, site_id: siteId, reader_key: key, count: mine },
      { onConflict: 'post_id,reader_key' },
    )
    if (error?.code === MISSING_TABLE) return json({ ok: true, likes: 0, mine: 0 })
    if (error) return json({ ok: false, error: 'No s’ha pogut registrar' }, 503)

    const { data: all } = await admin.from('post_likes').select('count').eq('post_id', postId)
    return json({ ok: true, likes: sumCounts(all), mine })
  }

  if (body.action === 'comment') {
    // A honeypot field no human ever fills in. Bots do, constantly. Answer 200
    // so the bot believes it worked and doesn't come back with a variation.
    if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true, pending: true })

    const author = typeof body.author === 'string' ? body.author.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : ''
    const text = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : ''

    if (author.length < 2) return json({ ok: false, error: 'Digues-nos com et dius.' }, 400)
    if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'Correu no vàlid.' }, 400)
    if (text.length < 2) return json({ ok: false, error: 'El comentari és buit.' }, 400)

    // `approved` defaults to false: the owner moderates. The render only sends
    // `autoApprove` when the module's requireApproval option is explicitly off.
    const approved = body.autoApprove === true
    const { error } = await admin.from('post_comments').insert({
      post_id: postId, site_id: siteId, author, email, body: text, approved,
    })
    if (error?.code === MISSING_TABLE) {
      console.error(
        '[CRITICAL] /api/interactions: the "post_comments" table is missing (Postgres 42P01) — ' +
        'migration 036_community_interactions.sql has NOT been applied. ' +
        `Comment DROPPED (site=${String(siteId)}).`,
      )
      return json({ ok: false, error: 'Els comentaris encara no estan actius en aquest blog.' }, 503)
    }
    if (error) return json({ ok: false, error: 'No s’ha pogut publicar. Torna-ho a provar.' }, 503)

    return json({ ok: true, pending: !approved })
  }

  return json({ ok: false, error: 'Acció desconeguda' }, 400)
}
