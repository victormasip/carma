// edit executor — revise the pending draft in place and re-issue the review link.
// (Editing an already-PUBLISHED post is staged into pending_content — see the
// resolver branch below, added in P3.) With nothing pending and no resolvable target,
// falls through to a fresh write (belt and braces; the router is told not to do this).
import { spendKarma } from '@/lib/karma/karma'
import { runAgent } from '../agent'
import { reviewUrl } from '../kapso'
import { issueReviewToken, sendDraftReady, writingContextFor, buildUpsell, estimateCostCents, type ExecutorCtx } from './shared'
import { executeWrite } from './write'
import { resolveEditPublished, stageEdit } from './editPublished'

export async function executeEdit(ctx: ExecutorCtx): Promise<void> {
  const { admin, t, state, job, ownerId, karmaNow, ownerName } = ctx

  // No pending draft on a resolved site → maybe the owner wants to edit an OLDER,
  // already-published post (P3 staging). If the router gave target hints and the site
  // is known, run the deterministic resolver; otherwise treat as a fresh brief.
  const hasPendingDraft = !!(t.current_post_id && ctx.siteId && ctx.siteCtx)
  if (!hasPendingDraft) {
    if (ctx.siteId && ctx.route.targetPost) {
      const handled = await resolveEditPublished(ctx)
      if (handled) return
    }
    return executeWrite(ctx)
  }

  const siteId = ctx.siteId!
  const siteCtx = ctx.siteCtx!

  // If current_post_id points at an already-PUBLISHED post (a staged edit in flight),
  // re-stage into pending_content — NEVER live-mutate a published post (E-11).
  const { data: curMeta } = await admin.from('posts').select('is_published').eq('id', t.current_post_id!).maybeSingle()
  if (curMeta?.is_published === true) {
    await stageEdit(ctx, t.current_post_id!, ctx.inboundText)
    return
  }

  // Revision = punts, charged BEFORE the LLM. Dedupe per job; the mid-flow variant
  // reassures the draft is still publishable free.
  const editSpend = await spendKarma(ownerId, 'article_revision', { ref: job.id, dedupeKey: `job:${job.id}:edit` }, admin)
  if (!editSpend.ok) {
    await ctx.say(await buildUpsell(admin, ownerId, karmaNow, ownerName, { variant: 'mid_flow' }))
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  const { data: cur } = await admin.from('posts').select('title, content, excerpt').eq('id', t.current_post_id).maybeSingle()
  const curContent = cur?.content as { html?: unknown } | null
  const currentHtml = curContent && typeof curContent === 'object' ? String(curContent.html ?? '') : ''

  const editResult = await runAgent({
    brief: '',
    articleLanguage: siteCtx.localeNative,
    siteName: siteCtx.siteName,
    siteContext: await writingContextFor(admin, siteId, siteCtx),
    mustDraft: true,
    editInstructions: ctx.inboundText,
    currentDraft: { title: String(cur?.title ?? ''), contentHtml: currentHtml, excerpt: String(cur?.excerpt ?? '') },
  })
  ctx.cost += estimateCostCents(editResult.usage, false)
  if (editResult.kind !== 'draft') {
    await ctx.say(editResult.message)
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
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

  const editRaw = await issueReviewToken(admin, t.current_post_id!, siteId, t.id)
  const sent = await sendDraftReady(admin, t.id, ctx.phone, ed, reviewUrl(editRaw), ctx.pnid, { revised: true })
  await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost, agent_state: { ...state, phase: 'awaiting_review' } })
  if (!sent) return ctx.finish('done', { error: 'edit reply send failed (post updated)' })
  return ctx.finish('done')
}
