// WhatsApp inbound webhook (T2) — Kapso provider, cycle-one B/D.
//
// Provider pivot (founder directive 2026-06-26): Twilio → Kapso. Kapso's Platform
// webhook delivers inbound WhatsApp messages as JSON ({ event, data }) and signs the
// body with HMAC-SHA256. This route is the cheap, LLM-free front door and nothing else:
//   1. Verify the Kapso signature over the RAW body (reject forgeries).
//   2. Process only `whatsapp.message.received`; ack every other event (sent/
//      delivered/read/failed/conversation.*) with a fast 200 so Kapso won't retry.
//   3. Dedupe on the WhatsApp message id (message.id, a wamid) — WhatsApp delivers
//      at-least-once → never double-spend.
//   4. Identity-gate: map the sender's phone → an ACTIVE wa_identities owner + their
//      candidate sites. Unbound/blocked numbers reach NO LLM (cost guard, E4).
//   5. Enqueue one generation_jobs row and return 200 fast (well under Netlify's
//      ~10s synchronous function cap). The Background Function worker (T4) does the
//      generation; the 1-min Scheduled re-driver (T4) guarantees at-least-once.
//
// Provider note: the agent/generation worker (T4) runs on OpenAI (WA_AGENT_MODEL),
// not Anthropic. This route is LLM-agnostic — it touches no model.

import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/ratelimit'
import { WA_WINDOW_HOURS } from '@/lib/whatsapp/config'
import type { WaMsgType } from '@/lib/whatsapp/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Kapso expects a 200 within 10s. Outbound replies (drafts, clarifications) are sent
// later by the worker via the Kapso REST API — never synchronously here.
function ok() {
  return NextResponse.json({ success: true })
}

// Dev-only request tracing so an inbound POST — and WHY it is accepted or dropped —
// is visible in the `next dev` console. Never logs in production; never logs the secret.
const DEV = process.env.NODE_ENV !== 'production'

// ─── Kapso signature (HMAC-SHA256 hex over the raw body, `X-Webhook-Signature`) ──
// We sign the RAW request body string exactly as received: that string IS the JSON
// Kapso stringified and signed, so re-parsing/re-stringifying (which could reorder
// keys or change spacing) would be wrong. Fail closed.
function verifyKapso(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET
  if (!signatureHeader || !secret) return false
  const signature = signatureHeader.replace(/^sha256=/i, '').trim()
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toMsgType(kapsoType: string): WaMsgType {
  if (kapsoType === 'audio' || kapsoType === 'voice') return 'audio'
  if (kapsoType === 'image') return 'image'
  return 'text'
}

type Admin = ReturnType<typeof createAdminClient>

async function enqueueAgentTurn(
  admin: Admin,
  threadId: string,
  messageId: string,
  payload: Record<string, unknown>,
) {
  return admin.from('generation_jobs').insert({
    thread_id: threadId,
    message_id: messageId,
    kind: 'agent_turn',
    status: 'queued',
    payload,
  })
}

// Kapso (and most webhook platforms) probe the endpoint with a GET to verify it is
// reachable BEFORE enabling delivery. A 405 here can make the platform mark the hook
// unhealthy and never POST events. Answer 200, echoing a verification challenge if one
// is sent (Meta-style hub.challenge, or a plain ?challenge=).
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const challenge =
    q.get('challenge') || q.get('hub.challenge') || q.get('verify_token') || q.get('hub.verify_token')
  if (challenge) return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  if (DEV) console.log(`[wa/webhook] GET probe from host=${request.headers.get('host')} → 200`)
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest) {
  // 1. Read the RAW body ONCE (the signature is computed over these exact bytes;
  //    consuming json() first would make the raw form unavailable).
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return new NextResponse('bad request', { status: 400 })
  }

  const sigHeader = request.headers.get('x-webhook-signature')
  if (DEV) {
    console.log(`[wa/webhook] POST host=${request.headers.get('host')} bytes=${rawBody.length} sig=${(sigHeader ?? '∅').slice(0, 10)}…`)
  }

  // 2. Verify the signature. Fail closed (no retry storm on a missing secret).
  if (!verifyKapso(rawBody, sigHeader)) {
    if (DEV) {
      const secret = process.env.KAPSO_WEBHOOK_SECRET
      const recv = (sigHeader ?? '').replace(/^sha256=/i, '').trim()
      const expected = secret ? createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex') : ''
      console.warn(
        `[wa/webhook] 403 signature rejected · secretLoaded=${!!secret} · recv=${recv.slice(0, 12)}… · expected=${expected.slice(0, 12) || '(no secret)'}… ` +
          '→ check KAPSO_WEBHOOK_SECRET matches the Kapso dashboard, then RESTART `next dev` (env is read at boot).',
      )
    }
    return new NextResponse('forbidden', { status: 403 })
  }

  // 3. Parse + event-gate. Only inbound messages enqueue work; ack everything else.
  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return ok()
  }
  const event = request.headers.get('x-webhook-event') || String(body.event ?? '')
  if (event !== 'whatsapp.message.received') {
    if (DEV) console.log(`[wa/webhook] ignored event=${event || '(none)'}`)
    return ok()
  }

  const data = ((body.data as Record<string, unknown>) ?? body) ?? {}
  const message = data.message as Record<string, unknown> | undefined
  if (!message || typeof message !== 'object') return ok()

  const sid = String(message.id ?? '').trim()
  const fromRaw = String(message.from ?? '').trim()
  const phone = fromRaw ? (fromRaw.startsWith('+') ? fromRaw : '+' + fromRaw.replace(/[^\d]/g, '')) : ''
  if (!sid || !phone.startsWith('+') || phone.length < 8) {
    // Signed but unusable — ack so Kapso does not retry a payload we can't act on.
    return ok()
  }

  const kapsoType = String(message.type ?? 'text')
  const msgType = toMsgType(kapsoType)
  const phoneNumberId = String(data.phone_number_id ?? '') || null

  const admin = createAdminClient()

  // 4. Identity gate — map phone → ACTIVE owner. No active binding ⇒ zero LLM work
  //    (the bind-link onboarding reply is T7; the outbound send is wired in T4).
  const { data: identity } = await admin
    .from('wa_identities')
    .select('id, user_id, status')
    .eq('phone_e164', phone)
    .maybeSingle()
  if (!identity || identity.status !== 'active') {
    if (DEV) console.log(`[wa/webhook] dropped: no ACTIVE wa_identities row for ${phone} (status=${identity?.status ?? 'none'})`)
    return ok()
  }

  // Cheap per-phone ceiling on enqueues (defense; the DB cost-gate in the worker is
  // the real spend guard). Over the limit ⇒ ack and drop, never 429 (no retries).
  if (!rateLimit(`wa:${phone}`, 30, 60_000).ok) return ok()

  // Candidate sites for the worker's G2 resolver: the per-phone allow-list if set,
  // else every site the owner is a member of. 1 ⇒ auto-route; >1 ⇒ agent asks.
  let candidateSiteIds: string[] = []
  const { data: scoped } = await admin
    .from('wa_identity_sites')
    .select('site_id')
    .eq('identity_id', identity.id)
  if (scoped && scoped.length) {
    candidateSiteIds = scoped.map((r) => r.site_id as string)
  } else {
    const { data: memberships } = await admin
      .from('site_users')
      .select('site_id')
      .eq('user_id', identity.user_id)
    candidateSiteIds = (memberships ?? []).map((r) => r.site_id as string)
  }

  // 5. Resolve the active thread (cycle one: one active thread per identity) and
  //    refresh the 24h window.
  const nowIso = new Date().toISOString()
  const windowExpIso = new Date(Date.now() + WA_WINDOW_HOURS * 3600_000).toISOString()

  let threadId: string
  const { data: openThread } = await admin
    .from('wa_threads')
    .select('id')
    .eq('identity_id', identity.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (openThread) {
    threadId = openThread.id as string
    await admin
      .from('wa_threads')
      .update({ last_inbound_at: nowIso, window_expires_at: windowExpIso })
      .eq('id', threadId)
  } else {
    const { data: created, error: tErr } = await admin
      .from('wa_threads')
      .insert({ identity_id: identity.id, last_inbound_at: nowIso, window_expires_at: windowExpIso })
      .select('id')
      .single()
    if (tErr || !created) {
      console.error('[wa/webhook] thread create failed:', tErr?.message)
      return new NextResponse('error', { status: 500 }) // let Kapso retry; dedupe protects us
    }
    threadId = created.id as string
  }

  // Message payload. Media (audio/image) is referenced now by its Meta media id; the
  // worker downloads it via Kapso (safeFetchBinary, T3). Store the full Kapso payload
  // in `raw` for debugging/observability.
  const mediaNode = (message[kapsoType] as Record<string, unknown> | undefined) ?? undefined
  const mediaId = mediaNode && typeof mediaNode.id === 'string' ? (mediaNode.id as string) : null
  const kapso = message.kapso as Record<string, unknown> | undefined
  const mediaData = kapso?.media_data as Record<string, unknown> | undefined
  const mediaUrl =
    (typeof kapso?.media_url === 'string' ? (kapso.media_url as string) : null) ??
    (typeof mediaData?.url === 'string' ? (mediaData.url as string) : null)
  const text = typeof (message.text as Record<string, unknown> | undefined)?.body === 'string'
    ? ((message.text as Record<string, unknown>).body as string)
    : null
  const jobPayload = {
    candidate_site_ids: candidateSiteIds,
    msg_type: msgType,
    media_id: mediaId,
    media_url: mediaUrl,
    phone_number_id: phoneNumberId,
  }

  // 3 (cont.) Idempotent insert: UNIQUE(wa_message_id) is the dedupe guard.
  const { data: msgRow, error: mErr } = await admin
    .from('wa_messages')
    .insert({
      thread_id: threadId,
      direction: 'in',
      wa_message_id: sid,
      msg_type: msgType,
      text,
      raw: body,
    })
    .select('id')
    .single()

  if (mErr) {
    if (mErr.code === '23505') {
      // Duplicate redelivery. Recover from a prior partial failure (message landed
      // but the job did not) by ensuring exactly one job exists, then ack.
      const { data: existing } = await admin
        .from('wa_messages')
        .select('id')
        .eq('wa_message_id', sid)
        .maybeSingle()
      if (existing) {
        const { data: job } = await admin
          .from('generation_jobs')
          .select('id')
          .eq('message_id', existing.id)
          .maybeSingle()
        if (!job) await enqueueAgentTurn(admin, threadId, existing.id as string, jobPayload)
      }
      return ok()
    }
    console.error('[wa/webhook] message insert failed:', mErr.message)
    return new NextResponse('error', { status: 500 })
  }

  // Enqueue the agent turn. On failure return 500 so Kapso retries; the retry hits
  // the 23505 path above, which enqueues the (still missing) job.
  const { error: jErr } = await enqueueAgentTurn(admin, threadId, msgRow.id as string, jobPayload)
  if (jErr) {
    console.error('[wa/webhook] job enqueue failed:', jErr.message)
    return new NextResponse('error', { status: 500 })
  }

  if (DEV) console.log(`[wa/webhook] enqueued agent_turn for ${phone} (${msgType}) → wake the worker: GET /api/whatsapp/cron`)

  // The worker is kicked by the 1-min Scheduled re-driver (T4); no synchronous
  // trigger here keeps the webhook fast and within the function timeout.
  return ok()
}
