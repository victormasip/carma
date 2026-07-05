// WhatsApp Agent — the async worker (T4, server-only).
//
// Drains generation_jobs one claimed job at a time. Per job (brain overhaul,
// founder directive 2026-07-05):
//   inbound message → (audio) safeFetchBinary + Whisper → text
//   → routeTurn (brain.ts): ONE cheap LLM call understands the intent — write /
//     edit / publish / chat — and speaks Carma's immediate reply in the owner's
//     language (no more canned progress strings, no more phase machine driving
//     the conversation)
//   → execute the intent: draft via runAgent (with the dynamic BLOG CONTEXT),
//     revise the pending draft, publish it, or just talk
//   → persist outcomes (draft row, review token, outcome record, thread cost) and
//     log every outbound message so the router has real conversation memory.
//
// What stayed deterministic ON PURPOSE (safety, not rigidity): signature checks,
// identity gating, cost/turn/daily ceilings, dedupe, the lease-based queue, token
// consumption and the publish transaction. The LLM decides WHAT to do; the worker
// alone decides whether it is ALLOWED and executes it atomically.
//
// Fail-safe (req 4): transient failures (Whisper/OpenAI timeout, media download)
// retry up to WA_JOB_MAX_ATTEMPTS, then the job is marked 'error' and the owner
// gets an apology — never an infinite retry. The worker never throws to its
// caller; every job ends 'done' or 'error'.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  WA_JOB_LEASE_MIN, WA_JOB_MAX_ATTEMPTS, WA_REVIEW_TOKEN_TTL_HOURS,
  WA_THREAD_COST_CENTS_CEILING, WA_THREAD_MAX_TURNS, WA_TURN_BUDGET, WA_DAILY_GEN_CAP,
  WA_MESSAGE_RETENTION_DAYS, WA_JOB_RETENTION_DAYS,
} from './config'
import { WA_TABLES, WA_BUTTON, type GenerationJobRow, type WaAgentState, type WaThreadRow, type WaMessageRow } from './types'
import { mintReviewToken, reviewTokenExpiry } from './tokens'
import { downloadKapsoMedia, transcribeAudio } from './transcribe'
import { runAgent, type AgentUsage, type AgentDraft } from './agent'
import { routeTurn, type HistoryTurn } from './brain'
import { buildSiteContext, formatSiteContext, type SiteContext } from './persona'
import { publishThreadDraft } from './publish'
import { sendWhatsApp, sendWhatsAppButtons, reviewUrl } from './kapso'

type Admin = ReturnType<typeof createAdminClient>

// ─── Job claim (optimistic, lease-based) ──────────────────────────────────────
// Claimable = queued, or running with an expired lease (crashed worker). The
// conditional update re-checks the same predicate so two workers never both win.
async function claimNextJob(admin: Admin): Promise<GenerationJobRow | null> {
  const nowIso = new Date().toISOString()
  const claimable = `status.eq.queued,and(status.eq.running,lease_until.lt.${nowIso})`

  const { data: cand } = await admin
    .from(WA_TABLES.jobs)
    .select('id, attempts')
    .or(claimable)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!cand) return null

  const leaseIso = new Date(Date.now() + WA_JOB_LEASE_MIN * 60_000).toISOString()
  const { data: claimed } = await admin
    .from(WA_TABLES.jobs)
    .update({ status: 'running', lease_until: leaseIso, attempts: (cand.attempts ?? 0) + 1 })
    .eq('id', cand.id)
    .or(claimable) // lost the race if someone already flipped it
    .select('*')
    .maybeSingle()

  return (claimed as GenerationJobRow | null) ?? null
}

async function finishJob(admin: Admin, jobId: string, status: 'done' | 'error' | 'queued', extra: Record<string, unknown> = {}) {
  await admin.from(WA_TABLES.jobs).update({ status, lease_until: null, ...extra }).eq('id', jobId)
}

// ─── Cost (rough guardrail, not billing) ──────────────────────────────────────
function estimateCostCents(usage: AgentUsage, audio: boolean): number {
  // gpt-4o ballpark: $2.50 / 1M input, $10 / 1M output.
  const cents = (usage.in / 1_000_000) * 250 + (usage.out / 1_000_000) * 1000
  return Math.max(1, Math.ceil(cents) + (audio ? 1 : 0)) // +1c flat for a Whisper call
}

// ─── Small DB helpers ─────────────────────────────────────────────────────────
async function updateThread(admin: Admin, threadId: string, patch: Record<string, unknown>) {
  await admin.from(WA_TABLES.threads).update(patch).eq('id', threadId)
}

/**
 * Record an outbound message so the router has real conversation memory on the
 * next turn. Best-effort — a logging miss must never fail a send or a job.
 */
export async function logOutbound(admin: Admin, threadId: string, text: string): Promise<void> {
  try {
    await admin.from(WA_TABLES.messages).insert({
      thread_id: threadId, direction: 'out', msg_type: 'text', text: text.slice(0, 2000),
    })
  } catch { /* best-effort */ }
}

/** Send + log in one beat — the default way the worker talks to the owner. */
async function say(admin: Admin, threadId: string, phone: string, body: string, pnid?: string): Promise<boolean> {
  const ok = await sendWhatsApp(phone, body, pnid)
  if (ok) await logOutbound(admin, threadId, body)
  return ok
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

// Insert a draft post via the admin client (the worker has no user session, so it
// cannot call the 'use server' createPost — E7). Mirrors createPost's row shape;
// retries on a slug collision; degrades past the i18n columns (42703) if needed.
async function saveDraft(
  admin: Admin,
  siteId: string,
  locale: string,
  d: { title: string; slug: string; excerpt: string; contentHtml: string; seoTitle: string; seoDescription: string; focusKeyword: string; categories: string[]; tags: string[] },
): Promise<string> {
  let slug = d.slug
  for (let attempt = 0; attempt < 4; attempt++) {
    const baseRow: Record<string, unknown> = {
      site_id: siteId,
      title: d.title,
      slug,
      content: { html: d.contentHtml },
      meta: {
        seo_title: d.seoTitle, seo_description: d.seoDescription,
        canonical: '', noindex: false, focus_keyword: d.focusKeyword,
      },
      excerpt: d.excerpt || null,
      featured_image: null,
      categories: d.categories,
      tags: d.tags,
      seo_title: d.seoTitle || null,
      seo_description: d.seoDescription || null,
      author_name: null,
      is_published: false,
    }
    const i18nRow = { ...baseRow, i18n: {}, default_locale: locale }

    let { data, error } = await admin.from('posts').insert(i18nRow).select('id').single()
    if (error?.code === '42703') {
      ;({ data, error } = await admin.from('posts').insert(baseRow).select('id').single())
    }
    if (!error && data) return data.id as string
    if (error?.code === '23505') {
      // slug collision (UNIQUE site_id, slug) — disambiguate and retry
      slug = `${d.slug}-${Math.random().toString(36).slice(2, 6)}`
      continue
    }
    throw new Error(error?.message ?? 'draft insert failed')
  }
  throw new Error('draft insert failed after slug retries')
}

// Mint a fresh single-use review token for a post, superseding any prior ACTIVE
// token on the same thread, so an edit re-issues exactly one live link + button set.
async function issueReviewToken(admin: Admin, postId: string, siteId: string, threadId: string): Promise<string> {
  await admin
    .from(WA_TABLES.reviewTokens)
    .update({ status: 'revoked' })
    .eq('thread_id', threadId)
    .eq('action', 'publish')
    .eq('status', 'active')
  const { raw, hash } = mintReviewToken()
  await admin.from(WA_TABLES.reviewTokens).insert({
    token_hash: hash,
    post_id: postId,
    site_id: siteId,
    thread_id: threadId,
    action: 'publish',
    status: 'active',
    expires_at: reviewTokenExpiry(WA_REVIEW_TOKEN_TTL_HOURS).toISOString(),
  })
  return raw
}

// The draft-ready reply: interactive Publicar/Editar buttons with the review link
// in the body. Falls back to a plain text+link send when interactive is unavailable
// so the owner always has a working way to publish (the web link still approves).
async function sendDraftReady(
  admin: Admin,
  threadId: string,
  phone: string,
  d: Pick<AgentDraft, 'title' | 'strategy'>,
  link: string,
  pnid?: string,
  revised = false,
): Promise<boolean> {
  const lead = revised ? '📝 Esborrany actualitzat' : 'Ja tens l’esborrany'
  const body = `${lead}: «${d.title}» ✍️\n${d.strategy}\n\nTambé el pots revisar aquí: ${link}`
  const ok = await sendWhatsAppButtons(
    phone,
    body,
    [
      { id: WA_BUTTON.approve, title: '✅ Publicar' },
      { id: WA_BUTTON.edit, title: '✏️ Editar' },
    ],
    pnid,
  )
  const sent = ok || (await sendWhatsApp(phone, body, pnid))
  if (sent) await logOutbound(admin, threadId, body)
  return sent
}

// Free-flow step (founder directive 2026-06-30): after the draft, proactively offer
// to generate a cover image. A dedicated Yes/No interactive message — the owner taps
// "Sí" and the webhook runs generateNanoBananaCover. Best-effort (never blocks/fails
// the job); falls back to a plain prompt if interactive is unavailable.
async function sendCoverOffer(admin: Admin, threadId: string, phone: string, pnid?: string): Promise<void> {
  const body = '🖼️ Vols que generi una imatge de portada per a aquest article?'
  const ok = await sendWhatsAppButtons(
    phone,
    body,
    [
      { id: WA_BUTTON.coverYes, title: '✨ Sí, fes-la' },
      { id: WA_BUTTON.coverNo, title: 'No cal' },
    ],
    pnid,
  )
  if (!ok) await sendWhatsApp(phone, `${body} Respon "sí" o "no".`, pnid)
  await logOutbound(admin, threadId, body)
}

// ─── One job ──────────────────────────────────────────────────────────────────
async function processJob(admin: Admin, job: GenerationJobRow): Promise<void> {
  // Permanent guards: a missing message/thread can never succeed → 'error', no retry.
  if (!job.message_id) return finishJob(admin, job.id, 'error', { error: 'job has no message_id' })

  const { data: thread } = await admin.from(WA_TABLES.threads).select('*').eq('id', job.thread_id).maybeSingle()
  if (!thread) return finishJob(admin, job.id, 'error', { error: 'thread missing' })
  const t = thread as WaThreadRow

  const { data: identity } = await admin
    .from(WA_TABLES.identities).select('phone_e164, status').eq('id', t.identity_id).maybeSingle()
  if (!identity || identity.status !== 'active') return finishJob(admin, job.id, 'done') // gate changed; drop
  const phone = identity.phone_e164 as string

  const payload = (job.payload ?? {}) as {
    candidate_site_ids?: string[]
    media_id?: string | null
    media_url?: string | null
    phone_number_id?: string | null
  }
  const pnid = payload.phone_number_id ?? undefined

  // Cost / loop ceilings (also enforced before any LLM spend).
  if (t.cost_cents >= WA_THREAD_COST_CENTS_CEILING || t.turn_count >= WA_THREAD_MAX_TURNS) {
    await say(admin, t.id, phone, "Has arribat al límit d'aquest fil 🙌 Comença'n un de nou quan vulguis.", pnid)
    return finishJob(admin, job.id, 'done')
  }

  // Daily per-IDENTITY generation cap (A1) — a hard backstop across ALL the owner's
  // threads, checked BEFORE any transcription/OpenAI spend. We proxy a "generation"
  // by INBOUND messages in the last 24h (outbound logging never counts against the
  // owner), so a bound user can never burn the budget. Cheap (indexed columns).
  if (WA_DAILY_GEN_CAP > 0) {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { data: idThreads } = await admin.from(WA_TABLES.threads).select('id').eq('identity_id', t.identity_id)
    const threadIds = (idThreads ?? []).map((r) => r.id as string)
    if (threadIds.length) {
      const { count } = await admin
        .from(WA_TABLES.messages)
        .select('id', { count: 'exact', head: true })
        .in('thread_id', threadIds)
        .eq('direction', 'in')
        .gte('created_at', since)
      if ((count ?? 0) > WA_DAILY_GEN_CAP) {
        await say(admin, t.id, phone, "Has arribat al límit d'articles per avui 🙌 Torna-m'ho a enviar demà i seguim.", pnid)
        return finishJob(admin, job.id, 'done')
      }
    }
  }

  const { data: msgRow } = await admin.from(WA_TABLES.messages).select('*').eq('id', job.message_id).maybeSingle()
  if (!msgRow) return finishJob(admin, job.id, 'error', { error: 'message missing' })
  const msg = msgRow as WaMessageRow

  const state: WaAgentState = (t.agent_state as WaAgentState) ?? { phase: 'await_brief' }

  // ── Input text: transcribe audio (T3) or use the text body ──
  let inboundText = (msg.text ?? '').trim()
  let usedAudio = false
  if (msg.msg_type === 'audio' && (payload.media_id || payload.media_url)) {
    const media = await downloadKapsoMedia({
      mediaId: payload.media_id ?? null,
      phoneNumberId: payload.phone_number_id ?? null,
      mediaUrl: payload.media_url ?? null,
    }) // null = transient → throw to retry
    if (!media) throw new Error('kapso media download failed')
    const transcript = (await transcribeAudio(media.body, media.contentType)).trim()
    usedAudio = true
    inboundText = transcript
    await admin.from(WA_TABLES.messages).update({ transcript }).eq('id', msg.id)
  }

  // ── Empty / unintelligible input → casual re-ask, NO LLM spend. The only
  // pre-LLM canned reply left, kept because its whole point is costing zero.
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

  // Exactly one candidate auto-routes — no need to make the owner choose.
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

  let siteCtx: SiteContext | null = siteId ? await buildSiteContext(admin, siteId) : null

  let hasPendingDraft = false
  let pendingDraftTitle: string | null = null
  if (t.current_post_id && (state.phase === 'awaiting_review' || state.phase === 'awaiting_edit')) {
    const { data: cur } = await admin.from('posts').select('title, is_published').eq('id', t.current_post_id).maybeSingle()
    if (cur && cur.is_published !== true) {
      hasPendingDraft = true
      pendingDraftTitle = String(cur.title ?? '') || null
    }
  }

  // ── The brain: one cheap call decides the intent and speaks the reply ──
  const route = await routeTurn({
    message: inboundText,
    history,
    siteContext: siteCtx ? formatSiteContext(siteCtx) : null,
    candidateSites: candidates.map((c) => c.name),
    noSites: !siteId && candidateIds.length === 0,
    hasPendingDraft,
    pendingDraftTitle,
    awaitingEdit: state.phase === 'awaiting_edit',
    pendingBrief: state.pending_brief ?? null,
  })
  let cost = estimateCostCents(route.usage, usedAudio)

  // Site pick resolved by the router (by number or by name).
  if (!siteId && route.siteIndex && route.siteIndex <= candidates.length) {
    siteId = candidates[route.siteIndex - 1].id
    await updateThread(admin, t.id, { site_id: siteId })
    siteCtx = await buildSiteContext(admin, siteId)
  }

  // The immediate reply — Carma's voice, owner's language. Deduped on transient
  // retries via writing_for (same guard the old canned progress beat used).
  if (route.reply && state.writing_for !== job.message_id) {
    await say(admin, t.id, phone, route.reply, pnid)
    state.writing_for = job.message_id ?? undefined
    await updateThread(admin, t.id, { agent_state: { ...state } })
  }

  // ── chat: the reply WAS the turn ──
  if (route.intent === 'chat') {
    await updateThread(admin, t.id, {
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + cost,
      agent_state: { ...state },
    })
    return finishJob(admin, job.id, 'done')
  }

  // ── publish: same transaction the button uses; the link beat is deterministic
  // because the LLM must never invent a URL ──
  if (route.intent === 'publish') {
    const res = await publishThreadDraft(admin, t.id)
    if (res.ok) {
      await say(admin, t.id, phone, res.already ? `✅ Ja era online:\n${res.url}` : `🎉 ${res.url}`, pnid)
      await updateThread(admin, t.id, {
        turn_count: t.turn_count + 1, cost_cents: t.cost_cents + cost,
        agent_state: { ...state, phase: 'done' },
      })
    } else {
      const sorry = res.reason === 'expired'
        ? "Aquest esborrany ja ha caducat 😕 Envia'm el tema un altre cop i te'n preparo un de nou."
        : res.reason === 'no_draft'
          ? "No tinc cap esborrany pendent 🤔 Envia'm un tema i te'n preparo un."
          : "Ups, no l'he pogut publicar 😕 Torna-ho a provar d'aquí un moment."
      await say(admin, t.id, phone, sorry, pnid)
      await updateThread(admin, t.id, { turn_count: t.turn_count + 1, cost_cents: t.cost_cents + cost })
    }
    return finishJob(admin, job.id, 'done')
  }

  // ── edit: revise the pending draft in place, re-issue the review link ──
  if (route.intent === 'edit' && t.current_post_id && siteId && siteCtx) {
    const { data: cur } = await admin
      .from('posts').select('title, content, excerpt').eq('id', t.current_post_id).maybeSingle()
    const curContent = cur?.content as { html?: unknown } | null
    const currentHtml = curContent && typeof curContent === 'object' ? String(curContent.html ?? '') : ''

    const editResult = await runAgent({
      brief: '',
      articleLanguage: siteCtx.localeNative,
      siteName: siteCtx.siteName,
      siteContext: formatSiteContext(siteCtx),
      mustDraft: true,
      editInstructions: inboundText,
      currentDraft: { title: String(cur?.title ?? ''), contentHtml: currentHtml, excerpt: String(cur?.excerpt ?? '') },
    })
    cost += estimateCostCents(editResult.usage, false)
    if (editResult.kind !== 'draft') {
      await say(admin, t.id, phone, editResult.message, pnid)
      await updateThread(admin, t.id, { turn_count: t.turn_count + 1, cost_cents: t.cost_cents + cost })
      return finishJob(admin, job.id, 'done')
    }
    const ed = editResult.draft
    await admin.from('posts').update({
      title: ed.title,
      content: { html: ed.contentHtml },
      excerpt: ed.excerpt || null,
      seo_title: ed.seoTitle || null,
      seo_description: ed.seoDescription || null,
      categories: ed.categories,
      tags: ed.tags,
      meta: { seo_title: ed.seoTitle, seo_description: ed.seoDescription, canonical: '', noindex: false, focus_keyword: ed.focusKeyword },
    }).eq('id', t.current_post_id).eq('site_id', siteId)

    const editRaw = await issueReviewToken(admin, t.current_post_id, siteId, t.id)
    const sent = await sendDraftReady(admin, t.id, phone, ed, reviewUrl(editRaw), pnid, true)
    await updateThread(admin, t.id, {
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + cost,
      agent_state: { ...state, phase: 'awaiting_review' },
    })
    if (!sent) return finishJob(admin, job.id, 'done', { error: 'edit reply send failed (post updated)' })
    return finishJob(admin, job.id, 'done')
  }
  // (an 'edit' with nothing pending falls through and is treated as a fresh brief —
  // belt and braces; the router is told not to produce it)

  // ── write: a new article ──
  // Brief precedence: the router's distilled topic → a brief held while the owner
  // picked a blog → the raw message.
  const brief = (route.topic || state.pending_brief || inboundText).trim()

  if (!siteId) {
    if (candidateIds.length === 0) {
      // No connected blog — the router already explained the onboarding path.
      await updateThread(admin, t.id, { turn_count: t.turn_count + 1, cost_cents: t.cost_cents + cost })
      return finishJob(admin, job.id, 'done')
    }
    // >1 candidates without a clear pick — the router asked which blog; hold the
    // brief so the next turn (the pick) can draft immediately. Store the SAME
    // filtered list the router numbered, so site_index always maps 1:1.
    await updateThread(admin, t.id, {
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + cost,
      agent_state: {
        ...state,
        phase: 'resolving_site',
        candidate_site_ids: candidates.length ? candidates.map((c) => c.id) : candidateIds,
        pending_brief: brief,
      },
    })
    return finishJob(admin, job.id, 'done')
  }

  // Turn-Budget-1: once we've spent our one clarification (or budget is 0), draft.
  const mustDraft = !!state.clarification_used || WA_TURN_BUDGET <= 0

  const result = await runAgent({
    brief,
    articleLanguage: siteCtx!.localeNative,
    siteName: siteCtx!.siteName,
    existingCategories: siteCtx!.categories,
    siteContext: formatSiteContext(siteCtx!),
    mustDraft,
  })
  cost += estimateCostCents(result.usage, false)

  if (result.kind === 'clarify') {
    await say(admin, t.id, phone, result.message, pnid)
    await updateThread(admin, t.id, {
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + cost,
      agent_state: { ...state, phase: 'await_brief', clarification_used: true, pending_brief: undefined },
    })
    return finishJob(admin, job.id, 'done')
  }

  // ── Draft → post + token + outcome record + reply ──
  const d = result.draft
  const postId = await saveDraft(admin, siteId, siteCtx!.locale, d)

  const raw = await issueReviewToken(admin, postId, siteId, t.id)

  // G3: capture the front of the outcome loop now (published_at fills on approve).
  await admin.from(WA_TABLES.outcomes).insert({
    post_id: postId,
    site_id: siteId,
    thread_id: t.id,
    transcript: brief || null,
  })

  await updateThread(admin, t.id, {
    current_post_id: postId,
    turn_count: t.turn_count + 1,
    cost_cents: t.cost_cents + cost,
    agent_state: { ...state, phase: 'awaiting_review', pending_brief: undefined, cover_offered_for: postId },
  })

  const link = reviewUrl(raw)
  // Local testing aid: the raw token lives ONLY in this reply (we persist just its
  // hash), so in dev — where Kapso delivery may not reach you — echo the link to the
  // server console. Never logs in production.
  if (process.env.NODE_ENV !== 'production') console.log(`[wa/dev] review link → ${link}`)
  // Interactive Publicar/Editar buttons (text+link fallback inside sendDraftReady).
  const sent = await sendDraftReady(admin, t.id, phone, d, link, pnid)
  // The draft + token already exist, so we must NOT retry here (that would mint a
  // duplicate draft on the next tick). But a failed delivery must never masquerade as
  // success: record it on the job so a silent send failure — e.g. a stale
  // KAPSO_PHONE_NUMBER_ID (Kapso 404 'WhatsApp configuration not found') or a closed
  // 24h window — is visible in the queue instead of looking 'done'.
  if (!sent) {
    console.error(`[wa/worker] job ${job.id}: draft ${postId} saved but the WhatsApp reply FAILED to send — check KAPSO_PHONE_NUMBER_ID / 24h window. Review link: ${link}`)
    return finishJob(admin, job.id, 'done', { error: 'reply send failed (draft saved)' })
  }
  // Free-flow multi-step: proactively offer a cover image (separate Yes/No message).
  await sendCoverOffer(admin, t.id, phone, pnid)
  return finishJob(admin, job.id, 'done')
}

// ─── Public entry: drain due jobs ─────────────────────────────────────────────
/**
 * Claim and process up to `limit` due jobs. Returns the count processed. Each job
 * ends 'done' or 'error'; transient failures requeue until WA_JOB_MAX_ATTEMPTS.
 * A soft time budget stops claiming new jobs near the function timeout.
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
        // Out of retries → fail safe. Apologize to the owner, stop the loop.
        await finishJob(admin, job.id, 'error', { error: message })
        try {
          const { data: th } = await admin.from(WA_TABLES.threads).select('identity_id').eq('id', job.thread_id).maybeSingle()
          if (th) {
            const { data: id } = await admin.from(WA_TABLES.identities).select('phone_e164').eq('id', th.identity_id).maybeSingle()
            if (id?.phone_e164) await sendWhatsApp(id.phone_e164 as string, "Uf, se m'ha embolicat preparant l'article 😅 Torna-m'ho a enviar d'aquí una estona.")
          }
        } catch { /* best-effort notify */ }
      } else {
        // Transient → requeue (lease cleared) for the re-driver to retry.
        await finishJob(admin, job.id, 'queued', { error: message })
      }
    }
    processed++
  }

  return processed
}

// ─── Retention purge (B1, GDPR + table bloat) ─────────────────────────────────
/**
 * Delete data past its retention window: WhatsApp messages (which carry the voice
 * transcript + the raw provider payload) older than WA_MESSAGE_RETENTION_DAYS, and
 * finished jobs older than WA_JOB_RETENTION_DAYS. Date-filtered + idempotent (safe
 * to call repeatedly); the cron gates it to roughly hourly. The 60-day outcome loop
 * is unaffected — it reads `wa_article_outcomes.transcript`, a snapshot copied at
 * draft time, not `wa_messages`.
 */
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
