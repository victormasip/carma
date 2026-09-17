// account executor — the reply (acknowledgement + real numbers, folded in during
// pre-dispatch setup) WAS the turn. Cost 0 (C-8): never charge to ask about the bill.
import type { ExecutorCtx } from './shared'

export async function executeAccount(ctx: ExecutorCtx): Promise<void> {
  await ctx.patchThread({ turn_count: ctx.t.turn_count + 1, cost_cents: ctx.t.cost_cents + ctx.cost, agent_state: { ...ctx.state } })
  return ctx.finish('done')
}
