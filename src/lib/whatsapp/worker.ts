// WhatsApp Agent — the async worker (T4, server-only).
//
// Drains generation_jobs one claimed job at a time. Per job (E1 async tier):
//   inbound message → (audio) safeFetchBinary + Whisper → text
//   → resolve the target site (1 auto / >1 ask "per a quin client?")
//   → OpenAI agent (Turn-Budget-1): clarify OR draft
//   → save the draft (admin insert, is_published:false), mint a review token,
//     capture the outcome record, update thread cost/turn/state
//   → Twilio reply: the clarification OR "draft ready → /review/<token>".
//
// Fail-safe (req 4): transient failures (Whisper/OpenAI timeout, media download)
// retry up to WA_JOB_MAX_ATTEMPTS, then the job is marked 'error' and the owner
// gets a localized apology — never an infinite retry. The worker never throws to
// its caller; every job ends 'done' or 'error'.

import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_LOCALE, LOCALE_META, normalizeLocale } from '@/lib/i18n/config'
import {
  WA_JOB_LEASE_MIN, WA_JOB_MAX_ATTEMPTS, WA_REVIEW_TOKEN_TTL_HOURS,
  WA_THREAD_COST_CENTS_CEILING, WA_THREAD_MAX_TURNS, WA_TURN_BUDGET,
} from './config'
import { WA_TABLES, type GenerationJobRow, type WaAgentState, type WaThreadRow, type WaMessageRow } from './types'
import { mintReviewToken, reviewTokenExpiry } from './tokens'
import { downloadKapsoMedia, transcribeAudio } from './transcribe'
import { runAgent, type AgentUsage } from './agent'
import { sendWhatsApp, reviewUrl } from './kapso'

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

async function siteMeta(admin: Admin, siteId: string): Promise<{ name: string; locale: string }> {
  const { data: site } = await admin.from('sites').select('name').eq('id', siteId).maybeSingle()
  let locale: string = DEFAULT_LOCALE
  try {
    const { data: theme } = await admin.from('site_themes').select('default_locale').eq('site_id', siteId).maybeSingle()
    if (theme?.default_locale) locale = normalizeLocale(theme.default_locale)
  } catch {
    /* column may not exist on an old env — fall back to the default locale */
  }
  return { name: site?.name ?? '', locale }
}

async function existingCategories(admin: Admin, siteId: string): Promise<string[]> {
  try {
    const { data } = await admin.from('posts').select('categories').eq('site_id', siteId).limit(50)
    const set = new Set<string>()
    for (const row of data ?? []) {
      for (const c of (row.categories as string[] | null) ?? []) if (c?.trim()) set.add(c.trim())
    }
    return [...set].slice(0, 12)
  } catch {
    return []
  }
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
    await sendWhatsApp(phone, "Has arribat al límit d'aquest fil 🙌 Comença'n un de nou quan vulguis.", pnid)
    return finishJob(admin, job.id, 'done')
  }

  const { data: msgRow } = await admin.from(WA_TABLES.messages).select('*').eq('id', job.message_id).maybeSingle()
  if (!msgRow) return finishJob(admin, job.id, 'error', { error: 'message missing' })
  const msg = msgRow as WaMessageRow

  const state: WaAgentState = (t.agent_state as WaAgentState) ?? { phase: 'await_brief' }

  // ── Transparency beat 1: acknowledge receipt the moment we pick the job up, so
  // the owner always knows Carma got it and is on it. Once per inbound message
  // (guarded by ack_for) so a transient retry never re-sends. No LLM spend. ──
  if (state.ack_for !== job.message_id) {
    const ackMsg = msg.msg_type === 'audio'
      ? "🎧 He rebut la teva nota de veu! L'estic escoltant…"
      : '📝 He rebut el teu missatge! M’hi poso…'
    await sendWhatsApp(phone, ackMsg, pnid)
    state.ack_for = job.message_id ?? undefined
    await updateThread(admin, t.id, { agent_state: { ...state } })
  }

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

  // ── Empty / unintelligible input → casual re-ask, NO LLM spend (req 4 voice tone).
  // Skip during a site pick ('resolving_site'), where an empty reply is just a failed
  // number parse handled below. We can't draft from nothing, so this ignores mustDraft.
  if (!inboundText.trim() && state.phase !== 'resolving_site') {
    const reask = usedAudio
      ? "M'has passat un àudio buit o no s'entén! 😅 Torna-m'ho a enviar amb el tema i m'hi poso."
      : "No m'ha arribat cap tema! 😅 Escriu-me o envia'm un àudio de què vols l'article i m'hi poso."
    await sendWhatsApp(phone, reask, pnid)
    await updateThread(admin, t.id, {
      turn_count: t.turn_count + 1,
      agent_state: { ...state, phase: 'await_brief', clarification_used: true },
    })
    return finishJob(admin, job.id, 'done')
  }

  // ── Site resolution (G2): one auto-routes, many asks which client ──
  let siteId = t.site_id
  let brief = inboundText
  if (!siteId) {
    const candidates = Array.isArray(payload.candidate_site_ids) ? payload.candidate_site_ids : []

    if (state.phase === 'resolving_site') {
      // This message is the owner's pick. Parse a number; draft from the held brief.
      const picks = state.candidate_site_ids ?? candidates
      const n = Number.parseInt(inboundText.replace(/[^\d]/g, ''), 10)
      if (Number.isFinite(n) && n >= 1 && n <= picks.length) {
        siteId = picks[n - 1]
        brief = (state.pending_brief ?? '').trim()
        await updateThread(admin, t.id, { site_id: siteId })
      } else {
        await sendWhatsApp(phone, "Ups, no t'he entès 😅 Respon-me només amb el número del client.", pnid)
        await updateThread(admin, t.id, { turn_count: t.turn_count + 1 })
        return finishJob(admin, job.id, 'done')
      }
    } else if (candidates.length === 0) {
      await sendWhatsApp(phone, "Encara no tens cap blog connectat a aquest número 📲 Connecta'l al teu compte de Carma i ja podrem començar.", pnid)
      return finishJob(admin, job.id, 'done')
    } else if (candidates.length === 1) {
      siteId = candidates[0]
      await updateThread(admin, t.id, { site_id: siteId })
    } else {
      // >1 candidates → ask which client (routing, not a content clarification).
      const { data: sites } = await admin.from('sites').select('id, name').in('id', candidates)
      const ordered = (sites ?? []) as { id: string; name: string }[]
      const list = ordered.map((s, i) => `${i + 1}) ${s.name}`).join('\n')
      await sendWhatsApp(phone, `Per a quin client és? Respon-me amb el número:\n${list}`, pnid)
      await updateThread(admin, t.id, {
        turn_count: t.turn_count + 1,
        agent_state: { ...state, phase: 'resolving_site', candidate_site_ids: ordered.map((s) => s.id), pending_brief: inboundText },
      })
      return finishJob(admin, job.id, 'done')
    }
  }

  // siteId is set now.
  const { name: siteName, locale } = await siteMeta(admin, siteId!)
  const cats = await existingCategories(admin, siteId!)

  // ── Transparency beat 2: name the destination + signal the working phase before
  // the (slow) generation, so the wait is never silent. Neutral wording so it fits
  // whether the agent drafts or asks a clarification. Once per message. ──
  if (state.writing_for !== job.message_id) {
    await sendWhatsApp(phone, `🪄 Estic preparant l'article per a ${siteName || 'el teu blog'}… Et responc en un momentet.`, pnid)
    state.writing_for = job.message_id ?? undefined
    await updateThread(admin, t.id, { agent_state: { ...state } })
  }

  // Turn-Budget-1: once we've spent our one clarification (or budget is 0), draft.
  const mustDraft = !!state.clarification_used || WA_TURN_BUDGET <= 0

  const result = await runAgent({
    brief,
    articleLanguage: LOCALE_META[normalizeLocale(locale)].native,
    siteName,
    existingCategories: cats,
    mustDraft,
  })

  const cost = estimateCostCents(result.usage, usedAudio)

  if (result.kind === 'clarify') {
    await sendWhatsApp(phone, result.message, pnid)
    await updateThread(admin, t.id, {
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + cost,
      agent_state: { ...state, phase: 'await_brief', clarification_used: true, pending_brief: undefined },
    })
    return finishJob(admin, job.id, 'done')
  }

  // ── Draft → post + token + outcome record + reply ──
  const d = result.draft
  const postId = await saveDraft(admin, siteId!, normalizeLocale(locale), d)

  const { raw, hash } = mintReviewToken()
  await admin.from(WA_TABLES.reviewTokens).insert({
    token_hash: hash,
    post_id: postId,
    site_id: siteId,
    thread_id: t.id,
    action: 'publish',
    status: 'active',
    expires_at: reviewTokenExpiry(WA_REVIEW_TOKEN_TTL_HOURS).toISOString(),
  })

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
    agent_state: { ...state, phase: 'awaiting_review', pending_brief: undefined },
  })

  const link = reviewUrl(raw)
  // Local testing aid: the raw token lives ONLY in this reply (we persist just its
  // hash), so in dev — where Kapso delivery may not reach you — echo the link to the
  // server console. Never logs in production.
  if (process.env.NODE_ENV !== 'production') console.log(`[wa/dev] review link → ${link}`)
  const reply = `Ja tens l'esborrany: «${d.title}» ✍️ ${d.strategy} Fes-hi un cop d'ull i publica'l aquí: ${link}`
  const sent = await sendWhatsApp(phone, reply, pnid)
  // The draft + token already exist, so we must NOT retry here (that would mint a
  // duplicate draft on the next tick). But a failed delivery must never masquerade as
  // success: record it on the job so a silent send failure — e.g. a stale
  // KAPSO_PHONE_NUMBER_ID (Kapso 404 'WhatsApp configuration not found') or a closed
  // 24h window — is visible in the queue instead of looking 'done'.
  if (!sent) {
    console.error(`[wa/worker] job ${job.id}: draft ${postId} saved but the WhatsApp reply FAILED to send — check KAPSO_PHONE_NUMBER_ID / 24h window. Review link: ${link}`)
    return finishJob(admin, job.id, 'done', { error: 'reply send failed (draft saved)' })
  }
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
