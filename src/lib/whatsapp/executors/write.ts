// write executor — a new article. Brief precedence: router topic → held brief → raw
// message. Pre-charges the draft (atomic, refunded to clarify-net on a question), then
// drafts, saves, mints a post-scoped review token, attaches a REAL cover (P2.5) and
// sends the Publicar/Editar buttons.
import { spendKarma, refundKarma } from '@/lib/karma/karma'
import { KARMA_COSTS, KARMA_CLARIFY_NET } from '@/lib/karma/config'
import { runAgent } from '../agent'
import { reviewUrl } from '../kapso'
import { WA_TABLES } from '../types'
import { WA_TURN_BUDGET, WA_COVER_AUTO } from '../config'
import { generateAndAttachCover, coverImageEnabled } from '../coverImage'
import { attachHeldPhoto } from './image'
import { setModulesAsAdmin } from '@/lib/modules/apply'
import { saveDraft, issueReviewToken, sendDraftReady, writingContextFor, buildUpsell, estimateCostCents, type ExecutorCtx } from './shared'

export async function executeWrite(ctx: ExecutorCtx): Promise<void> {
  const { admin, t, state, job, phone, pnid, ownerId, karmaNow, ownerName, route, inboundText } = ctx
  const brief = (route.topic || state.pending_brief || inboundText).trim()

  // No resolved site yet.
  if (!ctx.siteId) {
    if (ctx.candidateIds.length === 0) {
      // No connected blog — the router already explained the onboarding path.
      await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
      return ctx.finish('done')
    }
    // >1 candidates without a clear pick — hold the brief so the next turn (the pick)
    // drafts immediately. Store the SAME filtered list the router numbered (1:1 map).
    await ctx.patchThread({
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + ctx.cost,
      agent_state: {
        ...state,
        phase: 'resolving_site',
        candidate_site_ids: ctx.candidates.length ? ctx.candidates.map((c) => c.id) : ctx.candidateIds,
        pending_brief: brief,
      },
    })
    return ctx.finish('done')
  }
  const siteId = ctx.siteId
  const siteCtx = ctx.siteCtx!

  // Pre-charge the draft (atomic, never negative). A clarify refunds the difference.
  const draftSpend = await spendKarma(ownerId, 'article_draft', { ref: job.id, dedupeKey: `job:${job.id}:draft` }, admin)
  if (!draftSpend.ok) {
    if (brief && !state.pending_brief) state.pending_brief = brief
    await ctx.say(await buildUpsell(admin, ownerId, karmaNow, ownerName, { heldIdea: true }))
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost, agent_state: { ...state } })
    return ctx.finish('done')
  }

  // Turn-Budget-1: once we've spent our one clarification (or budget is 0), draft.
  const mustDraft = !!state.clarification_used || WA_TURN_BUDGET <= 0
  const result = await runAgent({
    brief,
    articleLanguage: siteCtx.localeNative,
    siteName: siteCtx.siteName,
    existingCategories: siteCtx.categories,
    siteContext: await writingContextFor(admin, siteId, siteCtx),
    mustDraft,
  })
  ctx.cost += estimateCostCents(result.usage, false)

  if (result.kind === 'clarify') {
    await refundKarma(ownerId, KARMA_COSTS.article_draft - KARMA_CLARIFY_NET, 'clarify_refund', { ref: job.id, dedupeKey: `job:${job.id}:draft:clarify` }, admin)
    await ctx.say(result.message)
    await ctx.patchThread({
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + ctx.cost,
      agent_state: { ...state, phase: 'await_brief', clarification_used: true, pending_brief: undefined },
    })
    return ctx.finish('done')
  }

  // Draft → post + token + outcome record.
  const d = result.draft
  const postId = await saveDraft(admin, siteId, siteCtx.locale, d)
  const raw = await issueReviewToken(admin, postId, siteId, t.id)
  await admin.from(WA_TABLES.outcomes).insert({ post_id: postId, site_id: siteId, thread_id: t.id, transcript: brief || null })

  // ── THE COVER (rewritten 2026-09-17) ────────────────────────────────────────
  //
  // Order of preference, and it is the whole point of the change:
  //
  //   1. THE OWNER'S OWN PHOTO. If they sent one with (or just before) this idea,
  //      it wins outright. It is their business, photographed by them; nothing a
  //      model generates competes with that. It is downloaded, EXIF-corrected,
  //      cropped to the cover box with attention, upscaled if small, sharpened
  //      and re-encoded (see lib/whatsapp/inboundImage.ts).
  //   2. NOTHING, and an offer at publish time. P2.5 generated an image for every
  //      single draft, silently — spending on an illustration nobody asked for
  //      and pre-empting the photo they were about to send. The offer now lands
  //      the moment the article goes live, where a missing image is obvious and
  //      one tap fixes it.
  //   3. WA_COVER_AUTO=1 restores the old always-generate behaviour.
  //
  // Best-effort throughout: a provider hiccup or an unreadable photo never blocks
  // the draft, it just ships without a cover and says so.
  let withCover = false
  let coverNote: string | null = null
  const photo = await attachHeldPhoto(admin, state, postId, siteId)
  if (photo) {
    withCover = photo.ok
    coverNote = photo.ok ? photo.note : photo.note
  } else if (WA_COVER_AUTO && coverImageEnabled()) {
    const cover = await generateAndAttachCover(admin, postId, { siteId, title: d.title, excerpt: d.excerpt, brandHint: siteCtx.siteName })
    withCover = cover.ok
  }

  await ctx.patchThread({
    current_post_id: postId,
    turn_count: t.turn_count + 1,
    cost_cents: t.cost_cents + ctx.cost,
    // `cover_offered_for` is NOT pre-set any more: with no auto-generated cover,
    // the publish beat has a real offer to make and must be allowed to make it.
    agent_state: { ...state, phase: 'awaiting_review', pending_brief: undefined },
  })

  // ── DYNAMIC MODULES (founder, 2026-09-17: "articles must be perfectly formatted
  //    based on what fits the specific content best — quotes, highlights, dynamic
  //    modules"). The editor named the features THIS piece earns; we switch on
  //    the ones the plan allows and say so. Merge-only, so nothing the owner
  //    already configured is disturbed, and a feature already on is a no-op.
  //
  //    Deliberately additive only: an article never switches a feature OFF. One
  //    long piece wanting an index must not strip the index from the blog the
  //    week a short one follows it.
  let modulesNote = ''
  if (d.suggestedModules.length) {
    try {
      const plan = karmaNow.superadmin ? 'agency' : karmaNow.plan
      const res = await setModulesAsAdmin(admin, siteId, d.suggestedModules, plan, true)
      if (res.changed.length) {
        modulesNote = `
Hi he encès ${res.changed.map(c => c.name).join(' i ')} — li esqueia.`
      }
    } catch { /* a feature we could not switch on never blocks a draft */ }
  }

  const link = reviewUrl(raw)
  if (process.env.NODE_ENV !== 'production') console.log(`[wa/dev] review link → ${link}`)
  const sent = await sendDraftReady(admin, t.id, phone, d, link, pnid, {
    withCover,
    coverNote: [coverNote, modulesNote.trim() || null].filter(Boolean).join(' ') || null,
  })
  if (!sent) {
    // Draft + token already exist → NEVER retry (would mint a duplicate). Record the
    // send failure so a silent drop is visible in the queue instead of looking 'done'.
    console.error(`[wa/worker] job ${job.id}: draft ${postId} saved but the WhatsApp reply FAILED to send — check KAPSO_PHONE_NUMBER_ID / 24h window. Review link: ${link}`)
    return ctx.finish('done', { error: 'reply send failed (draft saved)' })
  }
  return ctx.finish('done')
}
