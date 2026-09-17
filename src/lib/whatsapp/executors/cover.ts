// "POSA-LI UNA FOTO" — the cover, asked for in words rather than tapped (P4).
//
// The Yes/No buttons after publishing cover the common path; this covers the one
// people actually type: "fes-li una portada", "canvia-li la foto", "posa-hi la
// que t'he enviat". Same two sources as everywhere else, in the same order:
//
//   1. a photo the owner sent → theirs wins, and it is free
//   2. otherwise generate one → a real provider bill, so a real punts charge
//
// It works on the draft on the table, and falls back to the most recent article
// when there is none — "posa-li una foto a l'últim" is a sentence people say.

import { spendKarma } from '@/lib/karma/karma'
import { outOfPuntsMessage } from '@/lib/karma/karma'
import { generateAndAttachCover, coverImageEnabled } from '../coverImage'
import { attachHeldPhoto } from './image'
import type { ExecutorCtx } from './shared'

/** The draft on the table, else the newest post on this blog. */
async function targetPost(ctx: ExecutorCtx): Promise<{ id: string; title: string } | null> {
  if (ctx.t.current_post_id) {
    const { data } = await ctx.admin.from('posts').select('id, title').eq('id', ctx.t.current_post_id).maybeSingle()
    if (data) return { id: String(data.id), title: String(data.title ?? '') }
  }
  if (!ctx.siteId) return null
  const { data } = await ctx.admin
    .from('posts').select('id, title')
    .eq('site_id', ctx.siteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { id: String(data.id), title: String(data.title ?? '') } : null
}

export async function executeCover(ctx: ExecutorCtx): Promise<void> {
  const { admin, t, state, ownerId, siteId } = ctx

  const post = await targetPost(ctx)
  if (!post || !siteId) {
    await ctx.say('No tinc cap article a mà per posar-hi la foto 🤔 Envia’m un tema i te’n preparo un.')
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  // 1 — their own photograph, if one is waiting. Free, always.
  const held = await attachHeldPhoto(admin, state, post.id, siteId)
  if (held) {
    await ctx.say(held.ok ? `🖼️ Ja té la teva foto. ${held.note ?? ''}`.trim() : held.note)
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost, agent_state: { ...state } })
    return ctx.finish('done')
  }

  // 2 — generate one. This is a real bill, so it is a real charge, deduped per
  // post so re-asking for the same article's cover never charges twice.
  if (!coverImageEnabled()) {
    await ctx.say('Ara mateix no puc generar imatges 😕 Envia’m una foto teva i te la poso de portada.')
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  const spend = await spendKarma(ownerId, 'cover_image', { ref: post.id, dedupeKey: `cover:${post.id}` }, admin)
  if (!spend.ok) {
    await ctx.say(outOfPuntsMessage())
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  await ctx.say('✨ Marxant, t’estic preparant la portada…')
  const res = await generateAndAttachCover(admin, post.id, {
    siteId,
    title: post.title,
    brandHint: ctx.siteCtx?.siteName,
  })
  await ctx.say(
    res.ok
      ? `🖼️ Ja la té! ${post.title ? `«${post.title}»` : 'L’article'} ja llueix.`
      : 'No me n’he sortit amb la portada 😕 Prova d’enviar-me una foto teva i te la poso.',
  )
  await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
  return ctx.finish('done')
}
