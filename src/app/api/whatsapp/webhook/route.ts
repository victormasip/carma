// WhatsApp inbound webhook (T2) — Twilio WhatsApp, cycle-one B/D.
//
// Twilio posts inbound WhatsApp messages as application/x-www-form-urlencoded.
// This route does the cheap, LLM-free front door and nothing else:
//   1. Verify the Twilio signature over the raw body (reject forgeries).
//   2. Dedupe on MessageSid (WhatsApp delivers at-least-once → never double-spend).
//   3. Identity-gate: map the sender's phone → an ACTIVE wa_identities owner + their
//      candidate sites. Unbound/blocked numbers reach NO LLM (cost guard, E4).
//   4. Enqueue one generation_jobs row and return 200 fast (well under Netlify's
//      ~10s synchronous function cap). The Background Function worker (T4) does the
//      160s generation; the 1-min Scheduled re-driver (T4) guarantees at-least-once.
//
// Provider note: the agent/generation worker (T4) runs on OpenAI (WA_AGENT_MODEL),
// not Anthropic. This route is provider-agnostic — it touches no model.

import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/ratelimit'
import { WA_WINDOW_HOURS } from '@/lib/whatsapp/config'
import type { WaMsgType } from '@/lib/whatsapp/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Twilio accepts an empty TwiML 200 as "handled, send no reply." Outbound replies
// (acks, drafts, clarifications) are sent by the worker via the Twilio REST API.
const TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
function ack() {
  return new NextResponse(TWIML_OK, { status: 200, headers: { 'Content-Type': 'text/xml' } })
}

// ─── Twilio signature (HMAC-SHA1 over the request URL + sorted POST params) ────
function twilioBaseString(url: string, params: URLSearchParams): string {
  // Sort by key, then append key+value for each entry, exactly like twilio-node's
  // validateRequest. Values are the decoded form values URLSearchParams gives us.
  const entries = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  let data = url
  for (const [k, v] of entries) data += k + v
  return data
}

// The signature is computed over the URL Twilio actually called. Behind Netlify's
// proxy that is the forwarded host; allow an explicit override for reliability.
function publicWebhookUrl(req: NextRequest): string {
  const override = process.env.TWILIO_WEBHOOK_URL
  if (override) return override
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  return `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`
}

function verifyTwilio(req: NextRequest, params: URLSearchParams): boolean {
  const sig = req.headers.get('x-twilio-signature')
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sig || !token) return false
  const expected = createHmac('sha1', token)
    .update(Buffer.from(twilioBaseString(publicWebhookUrl(req), params), 'utf-8'))
    .digest('base64')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mediaType(contentType: string): WaMsgType {
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('image/')) return 'image'
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

export async function POST(request: NextRequest) {
  // 1. Read the RAW body ONCE and parse it ourselves (signature must see the exact
  //    params; consuming formData() first would make the raw form unavailable).
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return new NextResponse('bad request', { status: 400 })
  }
  const params = new URLSearchParams(rawBody)

  // 2. Verify the signature. Fail closed (no retry storm on a missing token).
  if (!verifyTwilio(request, params)) {
    return new NextResponse('forbidden', { status: 403 })
  }

  const sid = params.get('MessageSid')?.trim()
  const fromRaw = params.get('From')?.trim() ?? ''
  const phone = fromRaw.replace(/^whatsapp:/, '').trim()
  if (!sid || !phone.startsWith('+')) {
    // Signed but malformed — ack so Twilio does not retry a payload we can't use.
    return ack()
  }

  const admin = createAdminClient()

  // 3. Identity gate — map phone → ACTIVE owner. No active binding ⇒ zero LLM work
  //    (the bind-link onboarding reply is T7; the outbound send is wired in T4).
  const { data: identity } = await admin
    .from('wa_identities')
    .select('id, user_id, status')
    .eq('phone_e164', phone)
    .maybeSingle()
  if (!identity || identity.status !== 'active') return ack()

  // Cheap per-phone ceiling on enqueues (defense; the DB cost-gate in the worker is
  // the real spend guard). Over the limit ⇒ ack and drop, never 429 (no retries).
  if (!rateLimit(`wa:${phone}`, 30, 60_000).ok) return ack()

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

  // 4. Resolve the active thread (cycle one: one active thread per identity) and
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
      return new NextResponse('error', { status: 500 }) // let Twilio retry; dedupe protects us
    }
    threadId = created.id as string
  }

  // Message payload. Media (audio/image) is referenced now; the worker downloads it
  // to the private bucket via safeFetchBinary (T3). Store the full Twilio payload
  // in `raw` for debugging/observability.
  const numMedia = Number.parseInt(params.get('NumMedia') ?? '0', 10) || 0
  const mediaUrl = numMedia > 0 ? params.get('MediaUrl0') : null
  const msgType: WaMsgType = numMedia > 0 ? mediaType(params.get('MediaContentType0') ?? '') : 'text'
  const text = params.get('Body') ?? null
  const rawObj = Object.fromEntries(params.entries())
  const jobPayload = { candidate_site_ids: candidateSiteIds, msg_type: msgType, media_url: mediaUrl }

  // 2 (cont.) Idempotent insert: UNIQUE(wa_message_id) is the dedupe guard.
  const { data: msgRow, error: mErr } = await admin
    .from('wa_messages')
    .insert({
      thread_id: threadId,
      direction: 'in',
      wa_message_id: sid,
      msg_type: msgType,
      text,
      raw: rawObj,
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
      return ack()
    }
    console.error('[wa/webhook] message insert failed:', mErr.message)
    return new NextResponse('error', { status: 500 })
  }

  // Enqueue the agent turn. On failure return 500 so Twilio retries; the retry hits
  // the 23505 path above, which enqueues the (still missing) job.
  const { error: jErr } = await enqueueAgentTurn(admin, threadId, msgRow.id as string, jobPayload)
  if (jErr) {
    console.error('[wa/webhook] job enqueue failed:', jErr.message)
    return new NextResponse('error', { status: 500 })
  }

  // The worker is kicked by the 1-min Scheduled re-driver (T4); no synchronous
  // trigger here keeps the webhook fast and within the function timeout.
  return ack()
}
