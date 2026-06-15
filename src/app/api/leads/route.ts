// Lead capture — the Newsletter module's signups AND the Paywall's email unlock.
//
// Open + public by design (it's blog traffic, exactly like /api/track): we
// validate shape and store the lead via the service role, then (for the paywall)
// return an HttpOnly unlock cookie that the render route reads to serve the full
// article (the locked remainder is otherwise stripped server-side, so it never
// reaches an unauthorized reader).
//
// IMPORTANT: lead persistence is NO LONGER best-effort/silent. A duplicate email
// is the one expected non-error (ignoreDuplicates -> no-op). Any OTHER failure —
// most commonly 42P01 because migration 025_leads.sql was never applied — is
// logged loudly and returns an error WITHOUT unlocking. Silently unlocking on a
// failed insert hands the gated content over with zero capture, which is a
// monetization leak, not graceful degradation.

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/analytics/track'
import { rateLimit, clientIp } from '@/lib/ratelimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  // Public, unauthenticated write surface → per-IP rate limit to curb spam/abuse.
  const rl = rateLimit(`leads:${clientIp(request)}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Massa peticions. Espera un moment i torna-ho a provar.' },
      { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfter) } },
    )
  }
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400, headers: CORS })

    const siteId = body.siteId
    if (!isUuid(siteId)) return NextResponse.json({ ok: false, error: 'Site no vàlid' }, { status: 400, headers: CORS })

    const source = body.source === 'paywall' ? 'paywall' : 'newsletter'
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : ''
    const postId = isUuid(body.postId) ? (body.postId as string) : null
    const anon = body.anon === true

    // Newsletter always needs a valid email; the paywall accepts an anonymous
    // unlock click (no lead recorded, just the cookie).
    if (!anon && !EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: 'Correu no vàlid' }, { status: 400, headers: CORS })
    }

    // Persist the lead. A duplicate (same site_id+email) is expected and fine —
    // `ignoreDuplicates` makes it a no-op, not an error. Any OTHER error is a
    // real failure (most commonly 42P01: the `leads` table does not exist
    // because migration 025 was never applied) and must NOT be hidden: we log it
    // and fail closed instead of unlocking with nothing captured.
    if (email) {
      const admin = createAdminClient()
      const { error } = await admin.from('leads').upsert(
        { site_id: siteId, email, source, post_id: postId },
        { onConflict: 'site_id,email', ignoreDuplicates: true },
      )

      if (error) {
        if (error.code === '42P01') {
          console.error(
            '[CRITICAL] /api/leads: the "leads" table is missing (Postgres 42P01) — ' +
              'migration 025_leads.sql has NOT been applied. ' +
              `Lead DROPPED (site=${String(siteId)}, source=${source}). ` +
              'No leads are being captured until the migration runs.',
          )
        } else {
          console.error(
            `[ERROR] /api/leads: failed to persist lead (site=${String(siteId)}, source=${source}): ` +
              `${error.code ?? '?'} ${error.message}`,
          )
        }

        // Fail loud, fail closed: the reader gave us their email but we could
        // not record it. Do NOT set the unlock cookie — unlocking here would
        // give the gated content away with zero capture. Return a retryable
        // error so the failure is visible to the reader and in the logs.
        return NextResponse.json(
          { ok: false, error: 'No hem pogut completar la subscripció. Torna-ho a provar.' },
          { status: 503, headers: CORS },
        )
      }
    }

    const message = source === 'paywall' ? 'Desbloquejat!' : 'Subscripció confirmada!'
    const res = NextResponse.json({ ok: true, message }, { status: 200, headers: CORS })

    // Paywall unlock cookie — HttpOnly so it can't be tampered client-side; read
    // by the render route to serve the full article to this reader.
    if (source === 'paywall') {
      res.cookies.set(`carma_unlock_${siteId}`, '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
    }
    return res
  } catch {
    return NextResponse.json({ ok: false, error: 'Error' }, { status: 500, headers: CORS })
  }
}
