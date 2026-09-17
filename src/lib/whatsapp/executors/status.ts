// "COM VA EL BLOG?" — the status answer (P4, 2026-09-17).
//
// Founder: "rethink and dramatically expand the types of interactions and commands
// the user can have with the Carma agent on WhatsApp."
//
// This is the interaction people tried FIRST and never got: an owner who
// publishes from their phone has no dashboard open, and "how is it going" was
// answered by a language model guessing from a site name.
//
// EVERY NUMBER HERE IS READ, NEVER GENERATED. The router acknowledges warmly and
// this executor appends the figures, the same contract the account answer uses —
// a model that is allowed to say "uns 300 visitants" will eventually say it about
// a blog with four.

import { fetchSiteStats } from '@/lib/analytics/read'
import { publicSiteUrl } from '@/lib/sites/domain'
import type { ExecutorCtx } from './shared'

/** "fa 3 dies" / "avui" / "ahir" — the only rendering the model is spared. */
function ago(days: number | null): string {
  if (days === null) return 'encara cap'
  if (days === 0) return 'avui'
  if (days === 1) return 'ahir'
  if (days < 7) return `fa ${days} dies`
  if (days < 30) return `fa ${Math.round(days / 7)} setmanes`
  return `fa ${Math.round(days / 30)} mesos`
}

export async function executeStatus(ctx: ExecutorCtx): Promise<void> {
  const { admin, t, siteCtx } = ctx

  if (!siteCtx) {
    await ctx.say('Encara no tens cap blog connectat 🤔 Crea’l a carma.cat i després t’explico com va.')
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  // 30 days: long enough to mean something for a blog that publishes weekly,
  // short enough that "this month" is what the owner is actually asking about.
  let views: number | null = null
  let visitors: number | null = null
  let topTitle: string | null = null
  try {
    const stats = await fetchSiteStats(admin, siteCtx.siteId, 30)
    views = stats.totalViews
    visitors = stats.uniqueVisitors
    topTitle = stats.topPosts[0]?.title ?? null
  } catch {
    /* pre-015 / analytics unreachable → the rest of the answer still stands */
  }

  const lines: string[] = [`📊 *${siteCtx.siteName}*`]
  lines.push(`· ${siteCtx.publishedCount} article${siteCtx.publishedCount === 1 ? '' : 's'} publicat${siteCtx.publishedCount === 1 ? '' : 's'}`)
  if (siteCtx.draftCount > 0) {
    lines.push(`· ${siteCtx.draftCount} esborrany${siteCtx.draftCount === 1 ? '' : 's'} esperant-te`)
  }
  lines.push(`· L’últim, ${ago(siteCtx.lastPublishedDaysAgo)}`)
  if (views !== null) {
    lines.push(`· ${views} visita${views === 1 ? '' : 'es'} els últims 30 dies${visitors ? ` (${visitors} persones)` : ''}`)
  }
  if (topTitle) lines.push(`· El més llegit: «${topTitle}»`)
  if (siteCtx.modulesOn.length) {
    lines.push('', `Funcionalitats actives: ${siteCtx.modulesOn.map(m => m.name).join(', ')}`)
  }
  lines.push('', publicSiteUrl({ id: siteCtx.siteId, subdomain: siteCtx.subdomain }))

  // The most useful next sentence depends entirely on the shape of the answer.
  const nudge =
    siteCtx.draftCount > 0 ? 'Vols que repassem algun esborrany?'
    : siteCtx.lastPublishedDaysAgo !== null && siteCtx.lastPublishedDaysAgo > 14 ? 'Fa dies que no publiques. Et ve de gust escriure’n un?'
    : 'Envia’m una idea i en tenim un de nou en un minut.'
  lines.push('', nudge)

  await ctx.say(lines.join('\n'))
  await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
  return ctx.finish('done')
}
