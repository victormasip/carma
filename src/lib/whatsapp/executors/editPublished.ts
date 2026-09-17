// Edit an already-PUBLISHED post — staged, never live-mutated (E-11/E-5).
//
// The router passes deterministic hints (date/title/content); this resolver finds the
// post (accent-folded, site-scoped), the reviser writes the revision into
// posts.pending_content (NOT the live content), and a POST-SCOPED review token (action
// 'apply_edit') is issued. Approval copies pending_content → content in place — same
// row, same slug/URL, is_published never flips. A live post is never edited by an
// unconfirmed LLM output.

import { spendKarma } from '@/lib/karma/karma'
import { runAgent } from '../agent'
import { reviewUrl, sendWhatsAppButtons, sendWhatsApp } from '../kapso'
import { WA_BUTTON } from '../types'
import { buildSiteContext } from '../persona'
import { parseDateRef, matchPosts, type TargetHints, type PostMatch } from '../resolve'
import { issueReviewToken, writingContextFor, buildUpsell, estimateCostCents, logOutbound, type ExecutorCtx } from './shared'

// ─── DB resolver ──────────────────────────────────────────────────────────────
type Admin = ExecutorCtx['admin']

async function resolvePosts(admin: Admin, siteId: string, hints: TargetHints & { dateRef: string | null }): Promise<PostMatch[]> {
  let q = admin.from('posts').select('id, title, slug, content, created_at').eq('site_id', siteId).eq('is_published', true)
  const window = parseDateRef(hints.dateRef)
  if (window) q = q.gte('created_at', window.from).lte('created_at', window.to)
  const { data } = await q.order('created_at', { ascending: false }).limit(40)
  const rows: PostMatch[] = (data ?? []).map((r) => ({
    id: r.id as string,
    title: String(r.title ?? ''),
    slug: String(r.slug ?? ''),
    created_at: r.created_at as string,
    html: String(((r.content as { html?: unknown } | null)?.html ?? '')),
  }))
  return matchPosts(rows, hints).slice(0, 5)
}

async function recentTitles(admin: Admin, siteId: string, n: number): Promise<string[]> {
  const { data } = await admin
    .from('posts').select('title').eq('site_id', siteId).eq('is_published', true)
    .order('created_at', { ascending: false }).limit(n)
  return (data ?? []).map((r) => String(r.title ?? '')).filter(Boolean)
}

/**
 * Resolve + handle an edit to a published post. Returns true when the turn was handled
 * (match/ambiguous/miss), false to let the caller fall through to a fresh write.
 */
export async function resolveEditPublished(ctx: ExecutorCtx): Promise<boolean> {
  const { admin, t, state } = ctx
  const siteId = ctx.siteId!
  const hints = ctx.route.targetPost!
  const matches = await resolvePosts(admin, siteId, hints)

  if (matches.length === 0) {
    const recent = await recentTitles(admin, siteId, 5)
    const tail = recent.length ? ` Els últims que tens són:\n${recent.map((r, i) => `${i + 1}) «${r}»`).join('\n')}\nDigues-me’n un i el retoco.` : ''
    await ctx.say(`No trobo cap article publicat que encaixi amb això 🤔${tail}`)
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    await ctx.finish('done')
    return true
  }

  if (matches.length > 1) {
    const top = matches.slice(0, 3)
    await ctx.say(`N’hi ha uns quants que hi encaixen 🤔 Quin retoco?\n${top.map((m, i) => `${i + 1}) «${m.title}»`).join('\n')}`)
    await ctx.patchThread({
      turn_count: t.turn_count + 1,
      cost_cents: t.cost_cents + ctx.cost,
      agent_state: {
        ...state,
        pending_action: { kind: 'edit', payload: ctx.inboundText, missing: 'target_post', candidates: top.map((m) => m.id), site_id: siteId, held_at: new Date().toISOString() },
      },
    })
    await ctx.finish('done')
    return true
  }

  return stageEdit(ctx, matches[0].id, ctx.inboundText)
}

/**
 * Revise a published post into posts.pending_content (staging) + issue an apply_edit
 * review token. Points current_post_id at the post so a bare "publica'l" applies it.
 */
export async function stageEdit(ctx: ExecutorCtx, postId: string, instructions: string): Promise<boolean> {
  const { admin, t, state, job, ownerId, karmaNow, ownerName } = ctx
  const siteId = ctx.siteId!

  const spend = await spendKarma(ownerId, 'article_revision', { ref: job.id, dedupeKey: `job:${job.id}:editpub` }, admin)
  if (!spend.ok) {
    await ctx.say(await buildUpsell(admin, ownerId, karmaNow, ownerName, { variant: 'mid_flow' }))
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    await ctx.finish('done')
    return true
  }

  const { data: post } = await admin.from('posts').select('title, content, excerpt').eq('id', postId).eq('site_id', siteId).maybeSingle()
  if (!post) {
    await ctx.say('Ui, no he pogut obrir aquest article 😕 Torna-ho a provar d’aquí un moment.')
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    await ctx.finish('done')
    return true
  }
  const html = String(((post.content as { html?: unknown } | null)?.html ?? ''))
  const siteCtx = ctx.siteCtx ?? (await buildSiteContext(admin, siteId))

  const res = await runAgent({
    brief: '',
    articleLanguage: siteCtx.localeNative,
    siteName: siteCtx.siteName,
    siteContext: await writingContextFor(admin, siteId, siteCtx),
    mustDraft: true,
    editInstructions: instructions,
    currentDraft: { title: String(post.title ?? ''), contentHtml: html, excerpt: String(post.excerpt ?? '') },
  })
  ctx.cost += estimateCostCents(res.usage, false)
  if (res.kind !== 'draft') {
    await ctx.say(res.message)
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    await ctx.finish('done')
    return true
  }
  const ed = res.draft

  // STAGE (E-11): write the revision to pending_content, NOT the live content.
  await admin.from('posts').update({
    pending_content: {
      title: ed.title, html: ed.contentHtml, excerpt: ed.excerpt,
      seo_title: ed.seoTitle, seo_description: ed.seoDescription,
      categories: ed.categories, tags: ed.tags, focus_keyword: ed.focusKeyword,
    },
  }).eq('id', postId).eq('site_id', siteId)

  const raw = await issueReviewToken(admin, postId, siteId, t.id, 'apply_edit')
  const link = reviewUrl(raw)
  const body = `He preparat el canvi a «${ed.title}» ✍️\nL’article publicat NO canvia fins que ho aprovis. Revisa’l i confirma: ${link}`
  const okBtn = await sendWhatsAppButtons(ctx.phone, body, [{ id: WA_BUTTON.approve, title: '✅ Aplicar' }, { id: WA_BUTTON.edit, title: '✏️ Retocar' }], ctx.pnid)
  const sent = okBtn || (await sendWhatsApp(ctx.phone, body, ctx.pnid))
  if (sent) await logOutbound(admin, t.id, body)

  await ctx.patchThread({
    current_post_id: postId,
    turn_count: t.turn_count + 1,
    cost_cents: t.cost_cents + ctx.cost,
    agent_state: { ...state, phase: 'awaiting_review', pending_action: undefined },
  })
  if (!sent) {
    await ctx.finish('done', { error: 'staged-edit reply send failed (revision staged)' })
    return true
  }
  await ctx.finish('done')
  return true
}
