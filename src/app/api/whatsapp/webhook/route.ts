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
//   5. Enqueue one generation_jobs row, return 200 fast, and DRAIN THE QUEUE in this
//      same invocation via after() — see "Serverless execution model" below.
//
// Serverless execution model (founder directive 2026-07-05): in production there is
// NO always-on worker process — a background loop dies the moment the serverless
// function returns. So this route is the engine, not just the front door:
//   · ACK 200 immediately (Meta/Kapso drop the hook as unhealthy after ~3s).
//   · after() → processInbound() → runDueJobs(): the platform keeps the invocation
//     alive after the response is flushed (Vercel/Netlify waitUntil), so the job we
//     just enqueued is generated NOW, with maxDuration as the ceiling.
//   · Delivery/read receipts for every message we send arrive seconds later as
//     signed webhook events → each one opportunistically re-drains the queue, so a
//     transiently-failed (requeued) job is retried without any platform cron.
//   · /api/whatsapp/cron stays as the slow safety sweep (vercel.json, daily) for
//     retention purges and any job orphaned while its lease expired.
//
// Provider note: the agent/generation worker (T4) runs on OpenAI (WA_AGENT_MODEL),
// not Anthropic. This route is LLM-agnostic — it touches no model directly.

import { NextResponse, type NextRequest, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/ratelimit'
import { WA_WINDOW_HOURS } from '@/lib/whatsapp/config'
import { sendWhatsApp } from '@/lib/whatsapp/kapso'
import { publishThreadDraft } from '@/lib/whatsapp/publish'
import { generateNanoBananaCover, coverImageEnabled } from '@/lib/whatsapp/coverImage'
import { spendKarma, outOfPuntsMessage } from '@/lib/karma/karma'
import { inboundMatchesCode } from '@/lib/whatsapp/verify'
import { runDueJobs, logOutbound } from '@/lib/whatsapp/worker'
import { WA_BUTTON, type WaMsgType } from '@/lib/whatsapp/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// after() work counts against maxDuration. 300s fits Vercel Fluid on every plan and
// leaves room for one full generation (OpenAI timeout 160s) plus the pipeline.
export const maxDuration = 300

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

// Read an interactive postback (the owner tapped an Approve/Edit/… button). Covers
// both Meta interactive replies (button_reply / list_reply) and template quick-reply
// buttons (button.payload). Returns null for an ordinary text/audio/image message.
function readButton(message: Record<string, unknown>): { id: string; title: string } | null {
  const interactive = message.interactive as Record<string, unknown> | undefined
  if (interactive && typeof interactive === 'object') {
    const reply = (interactive.button_reply ?? interactive.list_reply) as Record<string, unknown> | undefined
    if (reply && typeof reply.id === 'string' && reply.id.trim()) {
      return { id: reply.id.trim(), title: typeof reply.title === 'string' ? reply.title : '' }
    }
  }
  const button = message.button as Record<string, unknown> | undefined
  if (button && typeof button === 'object') {
    const id = String(button.payload ?? button.text ?? '').trim()
    if (id) return { id, title: typeof button.text === 'string' ? button.text : id }
  }
  return null
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
  //    This is the ONLY synchronous DB-free step before the 200 — it's microseconds.
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

  // 3. Parse + event-gate. Only inbound messages do work; ack everything else. All of
  //    this is pure (no I/O), so it stays before the 200.
  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return ok()
  }
  const event = request.headers.get('x-webhook-event') || String(body.event ?? '')
  if (event !== 'whatsapp.message.received') {
    if (DEV) console.log(`[wa/webhook] event=${event || '(none)'} → ack + opportunistic drain`)
    // Free re-driver: every message WE send comes back seconds later as a signed
    // sent/delivered/read event. Re-draining here retries any requeued job without
    // a platform cron. Cheap no-op when the queue is empty (one indexed SELECT).
    after(() => drainQueue('receipt'))
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
  // Header values must be captured NOW (request isn't safe to read inside after()).
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? undefined

  // ── CRITICAL (founder directive 2026-06-30): WhatsApp/Meta drops the connection
  // and marks the webhook unhealthy if it doesn't get an HTTP 200 within ~3 seconds.
  // Interactive button taps were "doing nothing" because the handler did up to ~8
  // sequential DB round-trips (identity → thread → insert → publish → …) before
  // responding — slow over a local tunnel. So we ACK 200 IMMEDIATELY and run the
  // ENTIRE pipeline (identity gate, verification, button postbacks, publish, enqueue,
  // every outbound send) in the background via after(), which the platform keeps
  // alive after the response is flushed (Netlify/Vercel waitUntil). Provider, tunnel
  // and DB latency can never time out the webhook again. ──
  after(async () => {
    try {
      await processInbound({ body, message, sid, phone, msgType, kapsoType, phoneNumberId, host })
    } catch (e) {
      console.error('[wa/webhook] background processing failed:', e instanceof Error ? e.message : e)
    }
    // Same-invocation execution: the job processInbound just enqueued is generated
    // NOW — production needs no separate worker process for the happy path.
    await drainQueue('inbound')
  })
  return ok()
}

// Drain due generation_jobs inside this (post-response) invocation. Budget 120s for
// CLAIMING: a job claimed at t=119s still has the full 160s OpenAI timeout ahead of
// it and finishes inside maxDuration=300. Lease-based claiming makes concurrent
// webhook invocations draining at once safe (at-most-one winner per job).
async function drainQueue(trigger: 'inbound' | 'receipt'): Promise<void> {
  try {
    const processed = await runDueJobs(3, 120_000)
    if (DEV && processed) console.log(`[wa/webhook] drained ${processed} job(s) (trigger=${trigger})`)
  } catch (e) {
    console.error(`[wa/webhook] queue drain failed (trigger=${trigger}):`, e instanceof Error ? e.message : e)
  }
}

// ─── Background pipeline (runs AFTER the 200 is flushed) ───────────────────────
// Everything below was previously inline in POST; moving it here is the structural
// fix for the 3s timeout. Each early exit is a plain `return` (the 200 already went
// out). Idempotency (UNIQUE wa_message_id) still guards the rare provider duplicate.
type Inbound = {
  body: Record<string, unknown>
  message: Record<string, unknown>
  sid: string
  phone: string
  msgType: WaMsgType
  kapsoType: string
  phoneNumberId: string | null
  host?: string
}

async function processInbound(i: Inbound): Promise<void> {
  const { body, message, sid, phone, msgType, kapsoType, phoneNumberId, host } = i
  const admin = createAdminClient()

  // 4. Identity gate — map phone → ACTIVE owner. No active binding ⇒ zero LLM work.
  const { data: identity } = await admin
    .from('wa_identities')
    .select('id, user_id, status, verify_code, verify_expires_at')
    .eq('phone_e164', phone)
    .maybeSingle()

  // 4a. Phone-binding verification (T7). A still-PENDING number that texts its
  //     6-digit code activates here — that inbound is also the GDPR opt-in.
  if (identity && identity.status === 'pending') {
    if (!rateLimit(`wa-verify:${phone}`, 6, 60_000).ok) return
    const bodyText =
      typeof (message.text as Record<string, unknown> | undefined)?.body === 'string'
        ? ((message.text as Record<string, unknown>).body as string)
        : ''
    const notExpired = identity.verify_expires_at
      ? new Date(identity.verify_expires_at).getTime() > Date.now()
      : false
    const verified = notExpired && inboundMatchesCode(bodyText, identity.verify_code)
    if (verified) {
      const nowIso = new Date().toISOString()
      await admin
        .from('wa_identities')
        .update({ status: 'active', verified_at: nowIso, opt_in_at: nowIso, verify_code: null, verify_expires_at: null })
        .eq('id', identity.id)
      if (DEV) console.log(`[wa/webhook] verified ${phone} → active`)
    }
    const reply = verified
      ? '✅ Número verificat! Ja em pots enviar una nota de veu o un text amb la idea i et prepararé un esborrany.'
      : 'Per connectar el teu número, envia\'m el codi de 6 xifres que veus a Carma › Configuració › Agent de WhatsApp.'
    await sendWhatsApp(phone, reply, phoneNumberId)
    return
  }

  if (!identity || identity.status !== 'active') {
    if (DEV) console.log(`[wa/webhook] dropped: no ACTIVE wa_identities row for ${phone} (status=${identity?.status ?? 'none'})`)
    return
  }

  // Cheap per-phone ceiling (defense; the DB cost-gate in the worker is the real spend guard).
  if (!rateLimit(`wa:${phone}`, 30, 60_000).ok) return

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

  // 5. Resolve the active thread (one active thread per identity) + refresh the window.
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
      return
    }
    threadId = created.id as string
  }

  // ── Interactive postback (Approve / Edit / Cover …) ──
  const button = readButton(message)
  if (button) {
    const { error: bErr } = await admin.from('wa_messages').insert({
      thread_id: threadId, direction: 'in', wa_message_id: sid,
      msg_type: 'text', text: button.title || button.id, raw: body,
    })
    if (bErr) {
      if (bErr.code !== '23505') console.error('[wa/webhook] button insert failed:', bErr.message)
      return // duplicate tap (23505) or insert error → already handled / nothing to do
    }
    await handleButton(admin, { button, threadId, phone, phoneNumberId, host })
    return
  }

  // Message payload. Media (audio/image) referenced by its Meta media id; the worker
  // downloads it via Kapso. Store the full Kapso payload in `raw` for observability.
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

  // Idempotent insert: UNIQUE(wa_message_id) is the dedupe guard.
  const { data: msgRow, error: mErr } = await admin
    .from('wa_messages')
    .insert({ thread_id: threadId, direction: 'in', wa_message_id: sid, msg_type: msgType, text, raw: body })
    .select('id')
    .single()

  if (mErr) {
    if (mErr.code === '23505') {
      // Duplicate redelivery — ensure exactly one job exists, then stop.
      const { data: existing } = await admin
        .from('wa_messages').select('id').eq('wa_message_id', sid).maybeSingle()
      if (existing) {
        const { data: job } = await admin
          .from('generation_jobs').select('id').eq('message_id', existing.id).maybeSingle()
        if (!job) await enqueueAgentTurn(admin, threadId, existing.id as string, jobPayload)
      }
      return
    }
    console.error('[wa/webhook] message insert failed:', mErr.message)
    return
  }

  const { error: jErr } = await enqueueAgentTurn(admin, threadId, msgRow.id as string, jobPayload)
  if (jErr) {
    console.error('[wa/webhook] job enqueue failed:', jErr.message)
    return
  }
  if (DEV) console.log(`[wa/webhook] enqueued agent_turn for ${phone} (${msgType}) → drained in this same invocation`)

  // Brain overhaul (2026-07-05): the real reply is LLM-authored by the intent
  // router seconds from now (this invocation drains the queue itself), so text
  // turns get no canned ack. Voice notes keep a minimal, language-neutral receipt
  // because download + transcription add a noticeably silent stretch.
  if (msgType === 'audio') await sendWhatsApp(phone, '🎧', phoneNumberId)
}

// ─── Interactive button postbacks (Approve / Edit / Cover) ────────────────────
async function handleButton(
  admin: Admin,
  ctx: { button: { id: string; title: string }; threadId: string; phone: string; phoneNumberId: string | null; host?: string },
): Promise<void> {
  const { button, threadId, phone, phoneNumberId, host } = ctx
  const { data: th } = await admin
    .from('wa_threads').select('agent_state, current_post_id, site_id, identity_id').eq('id', threadId).maybeSingle()
  const stateNow = (th?.agent_state as Record<string, unknown> | null) ?? {}

  // Send + log: button outcomes are part of the conversation, so the intent
  // router's memory (recentHistory) must see them on later turns.
  const say = async (text: string) => {
    await sendWhatsApp(phone, text, phoneNumberId)
    await logOutbound(admin, threadId, text)
  }

  if (button.id === WA_BUTTON.approve) {
    const res = await publishThreadDraft(admin, threadId, host)
    const reply = res.ok
      ? (res.already ? `Aquest article ja és online 🎉\n${res.url}` : `Publicat! 🎉 Ja és online:\n${res.url}`)
      : res.reason === 'expired'
        ? 'Aquest esborrany ja ha caducat 😕 Envia’m el tema un altre cop i te’n preparo un de nou.'
        : res.reason === 'no_draft'
          ? 'No tinc cap esborrany pendent per publicar 🤔 Envia’m un tema i te’n preparo un.'
          : 'Ups, no he pogut publicar-lo 😕 Torna-ho a provar d’aquí un moment.'
    if (res.ok) await admin.from('wa_threads').update({ agent_state: { ...stateNow, phase: 'done' } }).eq('id', threadId)
    await say(reply)
    return
  }

  if (button.id === WA_BUTTON.edit) {
    await admin.from('wa_threads')
      .update({ agent_state: { ...stateNow, phase: 'awaiting_edit', writing_for: undefined } })
      .eq('id', threadId)
    await say('Què vols canviar? ✏️ Escriu-me (o envia’m un àudio amb) els canvis — to, longitud, què afegir o treure — i el reescric.')
    return
  }

  // Free-flow cover image (founder directive 2026-06-30): "Vols una portada?" Yes/No.
  if (button.id === WA_BUTTON.coverYes) {
    const postId = (th?.current_post_id as string | null) ?? null
    if (!postId) {
      await say('No tinc cap article actiu per a la portada 🤔 Envia’m un tema i te’n preparo un.')
      return
    }
    // Punts de Carma: la portada només es cobra quan el proveïdor d'imatges és
    // REAL (mentre el flux està mockejat, cap càrrec per un no-op). Dedupe per
    // post: regenerar la portada del mateix article no torna a cobrar.
    if (coverImageEnabled() && th?.identity_id) {
      const { data: ident } = await admin
        .from('wa_identities').select('user_id').eq('id', th.identity_id).maybeSingle()
      if (ident?.user_id) {
        const coverSpend = await spendKarma(ident.user_id as string, 'cover_image', {
          ref: postId, dedupeKey: `cover:${postId}`,
        }, admin)
        if (!coverSpend.ok) {
          await say(outOfPuntsMessage())
          return
        }
      }
    }
    await say('✨ Perfecte! Estic preparant la portada…')
    const res = await generateNanoBananaCover(admin, postId, { siteId: (th?.site_id as string | null) ?? null })
    const reply = res.ok
      ? (res.mocked
          ? '🖼️ Portada encarregada! (mode de proves — quan activem el generador d’imatges apareixerà a l’article). Pots publicar quan vulguis.'
          : `🖼️ Ja tens la portada a l’article! Fes-hi un cop d’ull i publica quan vulguis.`)
      : 'Ara mateix no he pogut preparar la portada 😕 La pots afegir des del Carma.'
    await say(reply)
    return
  }
  if (button.id === WA_BUTTON.coverNo) {
    await say('Cap problema! 👍 La pots afegir més tard des del Carma.')
    return
  }

  if (button.id === WA_BUTTON.translate) {
    await say('🌍 Les traduccions automàtiques arriben molt aviat! De moment, aprova l’article i el podràs traduir des del Carma.')
    return
  }

  await say('Rebut! 👍')
}
