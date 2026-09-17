// WhatsApp Agent — the async worker (T4, server-only).
//
// Drains generation_jobs one claimed job at a time (SERIALIZED PER THREAD — ./claim.ts,
// §2.7/E-20). Per job: inbound message → (audio) download + Whisper → text → routeTurn
// (brain.ts) decides the intent + speaks Carma's immediate reply → the matching
// executor (executors/*.ts, E-13) runs it. Deterministic ON PURPOSE: signatures,
// identity gating, cost/turn/daily ceilings, dedupe, the lease queue, token consumption
// and the publish transaction. The LLM decides WHAT; the worker decides whether it's
// ALLOWED and executes it atomically.
//
// Fail-safe: transient failures retry up to WA_JOB_MAX_ATTEMPTS, then the job is marked
// 'error' with an apology + a refund. The worker never throws to its caller.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  WA_JOB_MAX_ATTEMPTS, WA_THREAD_COST_CENTS_CEILING, WA_THREAD_MAX_TURNS, WA_DAILY_GEN_CAP,
  WA_MESSAGE_RETENTION_DAYS, WA_JOB_RETENTION_DAYS, WA_BRAIN_V2, WA_MEMORY_MAX_FACTS,
} from './config'
import { WA_TABLES, type GenerationJobRow, type WaAgentState, type WaThreadRow, type WaMessageRow, type WaOwnerMemory } from './types'
import { downloadKapsoMedia, transcribeAudio } from './transcribe'
import { routeTurn, type HistoryTurn } from './brain'
import { spendKarma, getKarma, refundJobSpends } from '@/lib/karma/karma'
import { accountSummary } from '@/lib/whatsapp/upsell'
import { applyRemember, applyForget, factsToStrings } from './memory'
import { buildSiteContext, formatSiteContext, type SiteContext, buildLightContext, formatLightContext } from './persona'
import { normalizeUnsupportedKind, unsupportedMediaReply, lowConfidenceEcho } from './media'
import { offerPhotoAsCover, holdPhotoForNextIdea } from './executors/image'
import { resolveHeldAction } from './transition'
import { sendWhatsApp } from './kapso'
import { claimNextJob } from './claim'
import { say, updateThread, finishJob, estimateCostCents, buildUpsell, type ExecutorCtx } from './executors/shared'
import { dispatchIntent } from './executors'

// The router's conversation memory needs every outbound logged — re-exported from the
// executor toolbox so the webhook (which imports it from here) keeps working.
export { logOutbound } from './executors/shared'

type Admin = ReturnType<typeof createAdminClient>

// ─── Living Brain (v2) — owner name for the greeting (E-4) ────────────────────
// display_name → email local-part → null (no name ⇒ no "Marta,"). 42703-safe.
async function fetchOwnerName(admin: Admin, ownerId: string): Promise<string | null> {
  try {
    let res = await admin.from('profiles').select('display_name, email').eq('id', ownerId).maybeSingle()
    if (res.error?.code === '42703') {
      res = await admin.from('profiles').select('display_name').eq('id', ownerId).maybeSingle() as typeof res
    }
    const row = (res.data ?? {}) as { display_name?: string | null; email?: string | null }
    const dn = row.display_name?.trim()
    if (dn) return dn
    const email = row.email?.trim()
    if (email && email.includes('@')) return email.split('@')[0]
    return null
  } catch {
    return null
  }
}

/** Last N conversation turns (both directions), oldest first, for the router. */
async function recentHistory(admin: Admin, threadId: string, excludeMessageId: string, limit = 10): Promise<HistoryTurn[]> {
  const { data } = await admin
    .from(WA_TABLES.messages)
    .select('id, direction, msg_type, text, transcript')
    .eq('thread_id', threadId)
    .neq('id', excludeMessageId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? [])
    .reverse()
    .map((r) => ({
      role: (r.direction === 'in' ? 'owner' : 'carma') as HistoryTurn['role'],
      text: String(r.transcript || r.text || `[${r.msg_type}]`).slice(0, 400),
    }))
}

// ─── One job ──────────────────────────────────────────────────────────────────
async function processJob(admin: Admin, job: GenerationJobRow): Promise<void> {
  // Permanent guards: a missing message/thread can never succeed → 'error', no retry.
  if (!job.message_id) return finishJob(admin, job.id, 'error', { error: 'job has no message_id' })

  const { data: thread } = await admin.from(WA_TABLES.threads).select('*').eq('id', job.thread_id).maybeSingle()
  if (!thread) return finishJob(admin, job.id, 'error', { error: 'thread missing' })
  const t = thread as WaThreadRow

  const { data: identity } = await admin
    .from(WA_TABLES.identities).select('phone_e164, status, user_id').eq('id', t.identity_id).maybeSingle()
  if (!identity || identity.status !== 'active') return finishJob(admin, job.id, 'done') // gate changed; drop
  const phone = identity.phone_e164 as string
  const ownerId = identity.user_id as string

  const payload = (job.payload ?? {}) as {
    candidate_site_ids?: string[]
    media_id?: string | null
    media_url?: string | null
    phone_number_id?: string | null
    kapso_type?: string | null
  }
  const pnid = payload.phone_number_id ?? undefined

  // Cost / loop ceilings (also enforced before any LLM spend).
  if (t.cost_cents >= WA_THREAD_COST_CENTS_CEILING || t.turn_count >= WA_THREAD_MAX_TURNS) {
    await say(admin, t.id, phone, "Has arribat al límit d'aquest fil 🙌 Comença'n un de nou quan vulguis.", pnid)
    return finishJob(admin, job.id, 'done')
  }

  // Daily generation cap (E-22): count only DRAFT-PRODUCING turns, not every inbound —
  // a support/account/chat question no longer trips "límit d'articles". Proxy = the
  // owner's article_draft ledger spends in the last 24h. Fail-open (pre-028 → no cap).
  if (WA_DAILY_GEN_CAP > 0) {
    try {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      const { count } = await admin
        .from('karma_ledger').select('id', { count: 'exact', head: true })
        .eq('user_id', ownerId).eq('action', 'article_draft').eq('kind', 'spend').gte('created_at', since)
      if ((count ?? 0) >= WA_DAILY_GEN_CAP) {
        await say(admin, t.id, phone, "Has arribat al límit d'articles per avui 🙌 Torna-m'ho a enviar demà i seguim.", pnid)
        return finishJob(admin, job.id, 'done')
      }
    } catch { /* pre-028 → fail-open, no cap */ }
  }

  const { data: msgRow } = await admin.from(WA_TABLES.messages).select('*').eq('id', job.message_id).maybeSingle()
  if (!msgRow) return finishJob(admin, job.id, 'error', { error: 'message missing' })
  const msg = msgRow as WaMessageRow

  const state: WaAgentState = (t.agent_state as WaAgentState) ?? { phase: 'await_brief' }

  // ── Media we can't act on (B5) → friendly, ZERO-LLM reply, BEFORE the punts
  // pre-flight so even a 0-balance owner gets a warm answer. ──
  if (msg.msg_type === 'unsupported') {
    const kind = normalizeUnsupportedKind(String(payload.kapso_type ?? ''))
    await say(admin, t.id, phone, unsupportedMediaReply(kind), pnid)
    await updateThread(admin, t.id, { turn_count: t.turn_count + 1 })
    return finishJob(admin, job.id, 'done')
  }
  // ── A PHOTO (founder, 2026-09-17) ───────────────────────────────────────────
  // The old answer was "encara no sé escriure a partir d'imatges", which was the
  // worst of both worlds: we stored the media reference and then did nothing
  // with it. Now the photo is held on the thread and one of three things happens,
  // all of them free (no router, no LLM, no punts):
  //
  //   · there IS a draft on the table  → ask, with buttons, whether it is the cover
  //   · there is a caption             → that caption is the brief; the photo rides
  //                                      along and becomes the cover of the draft
  //   · neither                        → hold it and ask what it is about
  //
  // Only the middle case continues into the router, because only the middle case
  // contains something to write about.
  if (msg.msg_type === 'image') {
    const caption = (msg.text ?? '').trim()
    const photo = {
      media_id: payload.media_id ?? null,
      media_url: payload.media_url ?? null,
      phone_number_id: payload.phone_number_id ?? null,
      caption: caption || undefined,
      at: new Date().toISOString(),
    }
    state.pending_image = photo

    // "Is a draft on the table?" — the same condition the punts pre-flight uses
    // below, hoisted here because the photo branch runs first.
    const draftOnTable = !!(t.current_post_id && (state.phase === 'awaiting_review' || state.phase === 'awaiting_edit'))
    if (draftOnTable) {
      await offerPhotoAsCover({ admin, threadId: t.id, phone, pnid, state, turnCount: t.turn_count })
      return finishJob(admin, job.id, 'done')
    }
    if (!caption) {
      await holdPhotoForNextIdea({ admin, threadId: t.id, phone, pnid, state, turnCount: t.turn_count })
      return finishJob(admin, job.id, 'done')
    }
    // A caption: fall through. The article is written from it, and the write
    // executor finds `pending_image` on the state and uses it as the cover.
  }

  // ── Punts pre-flight at zero cost: with 0 balance the turn never reaches an LLM.
  // Exception: a pending draft passes (≤1 router punt) so "publica'l" as TEXT keeps
  // working — it's already paid; publishing is never blocked. (Superadmin = infinite.)
  const draftPendingNow = !!(t.current_post_id && (state.phase === 'awaiting_review' || state.phase === 'awaiting_edit'))
  const karmaNow = await getKarma(ownerId, admin)
  const ownerName = WA_BRAIN_V2 ? await fetchOwnerName(admin, ownerId) : null
  // Owner memory (§2.3) — V2 only. Best-effort read kept out of the identity gate select.
  let ownerMemory: WaOwnerMemory | null = null
  if (WA_BRAIN_V2) {
    try {
      const { data } = await admin.from(WA_TABLES.identities).select('memory').eq('id', t.identity_id).maybeSingle()
      ownerMemory = (data?.memory as WaOwnerMemory | null) ?? null
    } catch { ownerMemory = null }
  }
  if (karmaNow.balance !== null && karmaNow.balance <= 0 && !draftPendingNow) {
    const heldText = (msg.text ?? '').trim()
    if (heldText && !state.pending_brief) state.pending_brief = heldText
    const upsell = await buildUpsell(admin, ownerId, karmaNow, ownerName, { heldIdea: !!(state.pending_brief || heldText) })
    await say(admin, t.id, phone, upsell, pnid)
    await updateThread(admin, t.id, { turn_count: t.turn_count + 1, agent_state: { ...state } })
    return finishJob(admin, job.id, 'done')
  }

  // ── Input text: transcribe audio (T3) or use the text body ──
  let inboundText = (msg.text ?? '').trim()
  let usedAudio = false
  if (msg.msg_type === 'audio' && (payload.media_id || payload.media_url)) {
    const audioSpend = await spendKarma(ownerId, 'voice_note', { ref: job.id, dedupeKey: `job:${job.id}:audio` }, admin)
    if (!audioSpend.ok) {
      await say(admin, t.id, phone, await buildUpsell(admin, ownerId, karmaNow, ownerName), pnid)
      await updateThread(admin, t.id, { turn_count: t.turn_count + 1 })
      return finishJob(admin, job.id, 'done')
    }
    const media = await downloadKapsoMedia({
      mediaId: payload.media_id ?? null,
      phoneNumberId: payload.phone_number_id ?? null,
      mediaUrl: payload.media_url ?? null,
    }) // null = transient → throw to retry
    if (!media) throw new Error('kapso media download failed')
    const tr = await transcribeAudio(media.body, media.contentType)
    const transcript = tr.text.trim()
    usedAudio = true
    inboundText = transcript
    await admin.from(WA_TABLES.messages).update({ transcript }).eq('id', msg.id)

    // C1/§3.5: a shaky transcript (Whisper logprobs, E-16) → echo back to confirm
    // instead of drafting about noise. The voice_note is charged; NO draft spend. (V2)
    if (WA_BRAIN_V2 && transcript && tr.confidence.lowConfidence) {
      await say(admin, t.id, phone, lowConfidenceEcho(transcript), pnid)
      await updateThread(admin, t.id, { turn_count: t.turn_count + 1, agent_state: { ...state } })
      return finishJob(admin, job.id, 'done')
    }
  }

  // ── Empty / unintelligible input → casual re-ask, NO LLM spend. ──
  if (!inboundText.trim()) {
    const reask = usedAudio
      ? "M'has passat un àudio buit o no s'entén! 😅 Torna-m'ho a enviar i m'hi poso."
      : "No m'ha arribat res! 😅 Escriu-me o envia'm un àudio i m'hi poso."
    await say(admin, t.id, phone, reask, pnid)
    await updateThread(admin, t.id, { turn_count: t.turn_count + 1, agent_state: { ...state } })
    return finishJob(admin, job.id, 'done')
  }

  // ── Context for the brain: conversation memory, candidate sites, pending draft ──
  const history = await recentHistory(admin, t.id, msg.id)

  const payloadCandidates = Array.isArray(payload.candidate_site_ids) ? payload.candidate_site_ids : []
  const heldCandidates = state.candidate_site_ids ?? []
  let siteId = t.site_id
  const candidateIds = siteId ? [] : heldCandidates.length ? heldCandidates : payloadCandidates

  if (!siteId && candidateIds.length === 1) {
    siteId = candidateIds[0]
    await updateThread(admin, t.id, { site_id: siteId })
  }

  let candidates: { id: string; name: string }[] = []
  if (!siteId && candidateIds.length > 1) {
    const { data: sites } = await admin.from('sites').select('id, name').in('id', candidateIds)
    const byId = new Map((sites ?? []).map((s) => [s.id as string, String(s.name ?? '')]))
    candidates = candidateIds.map((id) => ({ id, name: byId.get(id) ?? '' })).filter((c) => c.name)
  }

  const sitePlan = karmaNow.superadmin ? 'agency' : karmaNow.plan
  let siteCtx: SiteContext | null = siteId ? await buildSiteContext(admin, siteId, sitePlan) : null

  let hasPendingDraft = false
  let pendingDraftTitle: string | null = null
  if (t.current_post_id && (state.phase === 'awaiting_review' || state.phase === 'awaiting_edit')) {
    const { data: cur } = await admin.from('posts').select('title, is_published, pending_content').eq('id', t.current_post_id).maybeSingle()
    // A pending draft (unpublished) OR a published post with a staged edit both count.
    if (cur && (cur.is_published !== true || cur.pending_content)) {
      hasPendingDraft = true
      pendingDraftTitle = String(cur.title ?? '') || null
    }
  }

  // ── Tier-1 OWNER CONTEXT (§2.1), reusing the karma already fetched (E-1). ──
  let ownerContext: string | null = null
  if (WA_BRAIN_V2) {
    try {
      const lightCtx = await buildLightContext(admin, {
        ownerName,
        karma: { plan: karmaNow.plan, balance: karmaNow.balance, available: karmaNow.available, superadmin: karmaNow.superadmin },
        siteIds: siteId ? [siteId] : candidateIds,
        pendingDraftTitle,
      })
      ownerContext = formatLightContext(lightCtx)
    } catch {
      ownerContext = null
    }
  }

  // ── The brain: one cheap call decides the intent and speaks the reply ──
  const route = await routeTurn({
    message: inboundText,
    history,
    ownerContext,
    userPreferences: WA_BRAIN_V2 ? factsToStrings(ownerMemory) : null,
    siteContext: siteCtx ? formatSiteContext(siteCtx) : null,
    candidateSites: candidates.map((c) => c.name),
    noSites: !siteId && candidateIds.length === 0,
    hasPendingDraft,
    pendingDraftTitle,
    awaitingEdit: state.phase === 'awaiting_edit',
    pendingBrief: state.pending_brief ?? null,
  })
  const cost = estimateCostCents(route.usage, usedAudio)

  // Site pick resolved by the router (by number or by name).
  if (!siteId && route.siteIndex && route.siteIndex <= candidates.length) {
    siteId = candidates[route.siteIndex - 1].id
    await updateThread(admin, t.id, { site_id: siteId })
    siteCtx = await buildSiteContext(admin, siteId, sitePlan)
  }

  // ── Owner memory (§2.3) + account numbers — applied BEFORE the reply is sent so
  // both fold into that single message (V2 only). ──
  if (WA_BRAIN_V2 && (route.remember || route.forget)) {
    let mem = ownerMemory
    let evicted: string | null = null
    if (route.remember) {
      const r = applyRemember(mem, route.remember, { sourceMsg: msg.id ?? undefined, max: WA_MEMORY_MAX_FACTS })
      mem = r.memory
      evicted = r.evicted
    }
    if (route.forget) mem = applyForget(mem, route.forget).memory
    try {
      await admin.from(WA_TABLES.identities).update({ memory: mem }).eq('id', t.identity_id)
    } catch { /* pre-030 → memory just isn't persisted; the turn still works */ }
    ownerMemory = mem
    if (evicted) route.reply = `${route.reply}\n\n(Per no acumular-ho tot, he deixat de recordar allò de «${evicted}».)`.trim()
  }
  if (WA_BRAIN_V2 && route.intent === 'account') {
    const summary = accountSummary({ balance: karmaNow.balance, plan: karmaNow.plan, allocation: karmaNow.allocation, superadmin: karmaNow.superadmin })
    route.reply = route.reply ? `${route.reply}\n\n${summary}` : summary
  }

  // The immediate reply — deduped on transient retries via writing_for.
  if (route.reply && state.writing_for !== job.message_id) {
    await say(admin, t.id, phone, route.reply, pnid)
    state.writing_for = job.message_id ?? undefined
    await updateThread(admin, t.id, { agent_state: { ...state } })
  }

  // ── Everything an executor needs, assembled once after routing. ──
  const ctx: ExecutorCtx = {
    admin, job, t, state, msg, phone, pnid, ownerId, ownerName, ownerMemory, karmaNow, route,
    inboundText, usedAudio, cost, siteId, siteCtx, candidates, candidateIds,
    say: (body: string) => say(admin, t.id, phone, body, pnid),
    finish: (status, extra) => finishJob(admin, job.id, status, extra),
    patchThread: (patch) => updateThread(admin, t.id, patch),
  }

  // Held-action resume (§2.6, E-14): the worker (not mini) decides resume vs drop.
  if (await maybeResumeHeldAction(ctx)) return

  // Dispatch to the intent executor (executors/*.ts, E-13).
  return dispatchIntent(ctx)
}

// ── Resume a held pending_action deterministically (§2.6 transition table). Returns
// true when the turn was consumed by the resume/drop path. ──
async function maybeResumeHeldAction(ctx: ExecutorCtx): Promise<boolean> {
  const held = ctx.state.pending_action
  if (!held) return false
  const decision = resolveHeldAction(held, ctx.route, ctx.inboundText, ctx.usedAudio)
  if (decision.action !== 'resume') {
    // Drop-with-ack is implicit: we simply clear the stale held action and let the new
    // intent proceed through the normal dispatch below (belt: only clears here).
    ctx.state.pending_action = undefined
    return false
  }
  // Resume: currently only target_post (edit-published ambiguity) is resumable here.
  if (held.missing === 'target_post' && held.candidates?.length && held.site_id) {
    const idx = decision.pickIndex
    const postId = idx != null && idx >= 1 && idx <= held.candidates.length ? held.candidates[idx - 1] : null
    if (postId) {
      ctx.siteId = held.site_id
      ctx.state.pending_action = undefined
      const { stageEdit } = await import('./executors/editPublished')
      await stageEdit(ctx, postId, held.payload)
      return true
    }
  }
  return false
}

// ─── Public entry: drain due jobs ─────────────────────────────────────────────
/**
 * Claim and process up to `limit` due jobs. Each ends 'done' or 'error'; transient
 * failures requeue until WA_JOB_MAX_ATTEMPTS. A soft time budget stops claiming near
 * the function timeout.
 */
export async function runDueJobs(limit = 5, budgetMs = 20_000): Promise<number> {
  const admin = createAdminClient()
  const start = Date.now()
  let processed = 0

  for (let i = 0; i < limit; i++) {
    if (Date.now() - start > budgetMs) break
    const job = await claimNextJob(admin)
    if (!job) break

    try {
      await processJob(admin, job)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[wa/worker] job ${job.id} failed (attempt ${job.attempts}/${WA_JOB_MAX_ATTEMPTS}): ${message}`)
      }
      if ((job.attempts ?? 1) >= WA_JOB_MAX_ATTEMPTS) {
        await finishJob(admin, job.id, 'error', { error: message })
        try {
          const { data: th } = await admin.from(WA_TABLES.threads).select('identity_id').eq('id', job.thread_id).maybeSingle()
          if (th) {
            const { data: id } = await admin.from(WA_TABLES.identities).select('phone_e164, user_id').eq('id', th.identity_id).maybeSingle()
            if (id?.user_id) await refundJobSpends(admin, id.user_id as string, job.id)
            if (id?.phone_e164) await sendWhatsApp(id.phone_e164 as string, "Uf, se m'ha embolicat preparant l'article 😅 Torna-m'ho a enviar d'aquí una estona.")
          }
        } catch { /* best-effort notify */ }
      } else {
        await finishJob(admin, job.id, 'queued', { error: message })
      }
    }
    processed++
  }

  return processed
}

// ─── Retention purge (B1, GDPR + table bloat) ─────────────────────────────────
export async function purgeExpiredWaData(): Promise<{ messages: number; jobs: number }> {
  const admin = createAdminClient()
  let messages = 0
  let jobs = 0
  try {
    if (WA_MESSAGE_RETENTION_DAYS > 0) {
      const cutoff = new Date(Date.now() - WA_MESSAGE_RETENTION_DAYS * 86_400_000).toISOString()
      const { data } = await admin.from(WA_TABLES.messages).delete().lt('created_at', cutoff).select('id')
      messages = data?.length ?? 0
    }
    if (WA_JOB_RETENTION_DAYS > 0) {
      const cutoff = new Date(Date.now() - WA_JOB_RETENTION_DAYS * 86_400_000).toISOString()
      const { data } = await admin.from(WA_TABLES.jobs).delete().in('status', ['done', 'error']).lt('updated_at', cutoff).select('id')
      jobs = data?.length ?? 0
    }
  } catch (e) {
    console.error('[wa/purge] failed:', e instanceof Error ? e.message : e)
  }
  return { messages, jobs }
}
