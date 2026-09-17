'use client'

// Front-loaded Punts rewards, surfaced during onboarding (Fase 2).
//
// THE PROBLEM
// ───────────
// Free is 100 punts a month and an article costs 100 (80 draft + 20 revision). So
// a free owner gets ONE article, and if they spend it badly they meet the wall
// before they have felt the product work. That is the worst possible order of
// events: the limit arrives before the magic.
//
// THE FIX
// ───────
// The rewards already exist in the economy (karma/config.ts) — welcome +25, first
// article +50 — but they were only discoverable on /dashboard/karma, which a new
// owner has no reason to visit. Showing them HERE, at the moment the account is
// born, changes the arithmetic from "one article" to "two articles and change",
// and it frames the limit as fuel rather than as a paywall.
//
// Deliberately calm: a strip, not a popup. Nobody has to dismiss it.

import { Sparkles } from 'lucide-react'
import { KARMA_ALLOCATIONS, KARMA_REWARDS } from '@/lib/karma/config'
import EndlessKnot from '@/components/ui/EndlessKnot'

/** The two an owner can genuinely claim in their first session. */
const FIRST_SESSION = ['benvinguda', 'primer_article'] as const

export default function RewardTicker() {
  const rewards = FIRST_SESSION
    .map(key => KARMA_REWARDS.find(r => r.key === key))
    .filter((r): r is NonNullable<typeof r> => !!r)
  if (rewards.length === 0) return null

  const bonus = rewards.reduce((sum, r) => sum + r.amount, 0)
  const total = KARMA_ALLOCATIONS.free + bonus

  return (
    <div className="rounded-2xl border border-border bg-surface-subtle p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
          <EndlessKnot size={16} glow />
        </span>
        <p className="text-sm font-bold text-text">
          Comences amb {total} punts
        </p>
        <span className="text-xs text-subtle">
          {KARMA_ALLOCATIONS.free} del pla gratuït · {bonus} de regal
        </span>
      </div>

      <ul className="mt-3.5 grid gap-2 sm:grid-cols-2">
        {rewards.map(r => (
          <li key={r.key} className="flex items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5">
            <span className="mt-0.5 flex h-5 shrink-0 items-center gap-1 rounded-full bg-accent px-1.5 text-[0.65rem] font-extrabold text-on-accent">
              <Sparkles className="h-2.5 w-2.5" />+{r.amount}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-text">{r.title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{r.description}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-subtle">
        Un article complet en costa 100. Amb això en tens per a dos — i cada mes se&apos;t renoven.
      </p>
    </div>
  )
}
