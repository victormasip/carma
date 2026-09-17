// publish executor — the same transaction the ✅ Publicar button uses. The link beat
// is deterministic because the LLM must never invent a URL. For an edit-published
// post, publishThreadDraft applies the staged pending_content → content in place (E-11).
import { publishThreadDraft } from '../publish'
import { maybeNudge } from '../nudge'
import { offerGeneratedCover } from './image'
import { coverImageEnabled } from '../coverImage'
import type { ExecutorCtx } from './shared'

export async function executePublish(ctx: ExecutorCtx): Promise<void> {
  const postId = ctx.t.current_post_id
  const res = await publishThreadDraft(ctx.admin, ctx.t.id)
  if (res.ok) {
    // A published article is a natural "what's next?" moment → maybe one throttled nudge.
    const nudge = await maybeNudge(ctx)
    const head = res.already ? `✅ Ja era online:\n${res.url}` : res.applied ? `✅ Actualitzat i online:\n${res.url}` : `🎉 ${res.url}`
    await ctx.say(nudge ? `${head}\n\n${nudge.text}` : head)

    // THE COVER OFFER (founder, 2026-09-17: "if no image is provided, proactively
    // suggest generating one after publishing"). It goes out AFTER the link, as
    // its own buttons message, and only when the article genuinely has no image —
    // so it reads as a helpful second thought, not as a form to fill in. Nothing
    // is spent until they tap; the webhook's coverYes path owns that charge.
    if (postId && coverImageEnabled()) await offerGeneratedCover(ctx, postId)
    await ctx.patchThread({
      turn_count: ctx.t.turn_count + 1,
      cost_cents: ctx.t.cost_cents + ctx.cost,
      agent_state: { ...ctx.state, phase: 'done', ...(nudge ? { last_nudge: { key: nudge.key, at: new Date().toISOString() } } : {}) },
    })
  } else {
    const sorry = res.reason === 'expired'
      ? "Aquest esborrany ja ha caducat 😕 Envia'm el tema un altre cop i te'n preparo un de nou."
      : res.reason === 'no_draft'
        ? "No tinc cap esborrany pendent 🤔 Envia'm un tema i te'n preparo un."
        : "Ups, no l'he pogut publicar 😕 Torna-ho a provar d'aquí un moment."
    await ctx.say(sorry)
    await ctx.patchThread({ turn_count: ctx.t.turn_count + 1, cost_cents: ctx.t.cost_cents + ctx.cost })
  }
  return ctx.finish('done')
}
