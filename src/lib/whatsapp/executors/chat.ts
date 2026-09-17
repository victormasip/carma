// chat executor — the reply WAS the turn (1 punt, grace if the balance just hit 0).
import { spendKarma } from '@/lib/karma/karma'
import type { ExecutorCtx } from './shared'

export async function executeChat(ctx: ExecutorCtx): Promise<void> {
  await spendKarma(ctx.ownerId, 'agent_chat', { ref: ctx.job.id, dedupeKey: `job:${ctx.job.id}:chat` }, ctx.admin)
  await ctx.patchThread({ turn_count: ctx.t.turn_count + 1, cost_cents: ctx.t.cost_cents + ctx.cost, agent_state: { ...ctx.state } })
  return ctx.finish('done')
}
