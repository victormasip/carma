// "QUÈ HE PUBLICAT?" — the owner's own articles, with real links (P4).
//
// The agent could write an article and publish it and then had no way to answer
// "what did I publish last week". The links are built with `publicSiteUrl`, never
// by the model and never as `/render/<uuid>` — the engine path is not an address.

import { publicSiteUrl } from '@/lib/sites/domain'
import type { ExecutorCtx } from './shared'

const MAX = 5

export async function executeList(ctx: ExecutorCtx): Promise<void> {
  const { admin, t, siteCtx } = ctx

  if (!siteCtx) {
    await ctx.say('Encara no tens cap blog connectat 🤔 Crea’l a carma.cat i t’hi poso el primer article.')
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  // Drafts are listed too, and separately: "what am I sitting on" is the other
  // half of the question, and the one that actually moves the blog forward.
  let published: { title: string; slug: string; when: string | null }[] = []
  let drafts: string[] = []
  try {
    const { data } = await admin
      .from('posts')
      .select('title, slug, is_published, published_at, created_at')
      .eq('site_id', siteCtx.siteId)
      .order('created_at', { ascending: false })
      .limit(40)
    for (const row of data ?? []) {
      const title = String(row.title ?? '').trim()
      if (!title) continue
      if (row.is_published === true) {
        if (published.length < MAX) {
          published.push({
            title,
            slug: String(row.slug ?? ''),
            when: (row.published_at as string | null) ?? (row.created_at as string | null),
          })
        }
      } else if (drafts.length < 3) {
        drafts.push(title)
      }
    }
  } catch {
    published = []
    drafts = []
  }

  if (!published.length && !drafts.length) {
    await ctx.say('Encara no hi ha res publicat 🌱 Envia’m una idea i estrenem el blog ara mateix.')
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  const lines: string[] = []
  if (published.length) {
    lines.push(`📰 *Els últims de ${siteCtx.siteName}*`, '')
    for (const p of published) {
      const url = publicSiteUrl({ id: siteCtx.siteId, subdomain: siteCtx.subdomain }, { path: p.slug ? `/${p.slug}` : '/' })
      const date = p.when
        ? new Date(p.when).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })
        : null
      lines.push(`· «${p.title}»${date ? ` — ${date}` : ''}`, `  ${url}`)
    }
  }
  if (drafts.length) {
    lines.push('', `✏️ Esborranys esperant: ${drafts.map(d => `«${d}»`).join(', ')}`)
  }
  lines.push('', 'Digue’m quin vols canviar i m’hi poso.')

  await ctx.say(lines.join('\n'))
  await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
  return ctx.finish('done')
}
