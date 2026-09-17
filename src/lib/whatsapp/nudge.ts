// WhatsApp Agent — proactive nudges (§2.4.7 / E-21, server-only).
//
// After confirming an action, the agent MAY add ONE short contextual suggestion drawn
// from the site's SEO snapshot ("fa temps que no toques «receptes» — en fem un?"). The
// throttle is deterministic and persisted in agent_state.last_nudge:
//   · at most one nudge per turn,
//   · never the same key within WA_NUDGE_COOLDOWN_DAYS,
//   · never two turns running (quiet for WA_NUDGE_MIN_GAP_HOURS after any nudge),
//   · degrade OFF silently when there's no fresh SEO snapshot.
// The nudge states a fact from our own data, so the worker (not the model) fills it —
// no LLM spend, no invented numbers.

import { WA_BRAIN_V2, WA_NUDGE_COOLDOWN_DAYS, WA_NUDGE_MIN_GAP_HOURS } from './config'
import { readBrainProfile } from './profile'
import type { ExecutorCtx } from './executors/shared'

export type Nudge = { key: string; text: string }
export type LastNudge = { key: string; at: string } | null | undefined

function slugKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Pick a nudge from the SEO "opportunities" (quiet topics), or null. Pure so the
 * throttle rules are unit-tested. Skips the whole turn if a nudge went out too
 * recently, and skips any key still inside its cooldown.
 */
export function pickNudge(
  opportunities: string[],
  lastNudge: LastNudge,
  opts: { now?: Date; cooldownDays?: number; minGapHours?: number } = {},
): Nudge | null {
  const now = opts.now ?? new Date()
  const cooldownDays = opts.cooldownDays ?? WA_NUDGE_COOLDOWN_DAYS
  const minGapHours = opts.minGapHours ?? WA_NUDGE_MIN_GAP_HOURS

  // Never two turns running: quiet for a while after ANY nudge.
  if (lastNudge?.at) {
    const ageH = (now.getTime() - new Date(lastNudge.at).getTime()) / 3_600_000
    if (Number.isFinite(ageH) && ageH < minGapHours) return null
  }

  for (const opp of opportunities) {
    const label = (opp ?? '').trim()
    const key = slugKey(label)
    if (!key) continue
    if (lastNudge?.key === key && lastNudge.at) {
      const ageD = (now.getTime() - new Date(lastNudge.at).getTime()) / 86_400_000
      if (Number.isFinite(ageD) && ageD < cooldownDays) continue // same key within cooldown
    }
    return { key, text: `Per cert — fa temps que no toques «${label}». Si vols, en fem un aviat ✍️` }
  }
  return null
}

/**
 * The DB-aware wrapper an executor calls after a confirmed action. Reads the active
 * site's persisted SEO snapshot and applies pickNudge with the thread's throttle
 * state. Returns null (silently) whenever nudging isn't appropriate.
 */
export async function maybeNudge(ctx: ExecutorCtx): Promise<Nudge | null> {
  if (!WA_BRAIN_V2 || !ctx.siteId) return null
  try {
    const profile = await readBrainProfile(ctx.admin, ctx.siteId)
    const opportunities = profile?.seo?.opportunities ?? []
    if (!opportunities.length) return null
    return pickNudge(opportunities, ctx.state.last_nudge ?? null)
  } catch {
    return null
  }
}
