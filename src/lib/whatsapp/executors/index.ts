// Intent dispatch table (P3, E-13) — the worker builds an ExecutorCtx after routing
// and hands it here. Keeps worker.ts out of god-module territory.
import type { ExecutorCtx } from './shared'
import { executeWrite } from './write'
import { executeEdit } from './edit'
import { executePublish } from './publish'
import { executeAccount } from './account'
import { executeChat } from './chat'
import { executeStatus } from './status'
import { executeList } from './list'
import { executeModules } from './modules'
import { executeCover } from './cover'
import { executeHelp } from './help'

export type { ExecutorCtx } from './shared'

export async function dispatchIntent(ctx: ExecutorCtx): Promise<void> {
  switch (ctx.route.intent) {
    case 'account':
      return executeAccount(ctx)
    // ── The 2026-09-17 expansion. Each one answers from the DATABASE and pays
    //    nothing to a model: the router already spoke, and these append the
    //    truth underneath it.
    case 'status':
      return executeStatus(ctx)
    case 'list':
      return executeList(ctx)
    case 'modules':
      return executeModules(ctx)
    case 'cover':
      return executeCover(ctx)
    case 'help':
      return executeHelp(ctx)
    case 'publish':
      return executePublish(ctx)
    case 'edit':
      return executeEdit(ctx)
    case 'write':
      return executeWrite(ctx)
    case 'chat':
    default:
      return executeChat(ctx)
  }
}
