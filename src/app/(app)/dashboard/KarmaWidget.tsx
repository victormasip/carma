'use client'

// Punts de Carma — the sidebar indicator.
//
// FUEL, NOT A PAYWALL (Fase 2)
// ────────────────────────────
// It used to show a bare number. A number alone answers "how many" but not the
// question the owner actually has, which is "how much is left" — 40 punts means
// nothing until you know it started at 100 and an article costs 100.
//
// So it is a gauge now: a thin bar against the plan's monthly allocation, with the
// number still there for anyone who wants the exact figure. Calm at rest, warm
// only when genuinely low, and it never nags — clicking it goes to the challenges
// page where punts can be EARNED, not to a pricing table.
//
// The balance is server-rendered from the layout and refreshes with navigation —
// no polling for a number that changes a few times a day. The ONE thing that has
// to beat a navigation is a claim the owner just made two panes away, which is
// what lib/karma/live.ts carries: the challenges page publishes the new figure
// the instant it paints it, and this widget moves with it. Everything about why
// that is a module store rather than a context is documented there.

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Infinity as InfinityIcon } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useT } from '@/lib/i18n/LocaleProvider'
import {
  karmaBalanceServerSnapshot, karmaBalanceSnapshot, resolveKarmaBalance, subscribeKarmaBalance,
} from '@/lib/karma/live'
import { cn } from '@/lib/cn'

export type KarmaWidgetData = {
  /** null = infinit (superadmin). */
  balance: number | null
  allocation: number | null
  superadmin: boolean
  /** false = migració 028 pendent → el widget no s'ensenya (fail-quiet). */
  available: boolean
}

export default function KarmaWidget({ karma }: { karma: KarmaWidgetData }) {
  const t = useT()
  const pathname = usePathname()
  // Read BEFORE the early return: hooks cannot live behind a condition.
  const live = useSyncExternalStore(subscribeKarmaBalance, karmaBalanceSnapshot, karmaBalanceServerSnapshot)
  if (!karma.available && !karma.superadmin) return null

  const active = pathname.startsWith('/dashboard/karma')
  // The live figure while it is still newer than the server's; the server's the
  // moment a fresh render disagrees. See resolveKarmaBalance.
  const shownBalance = resolveKarmaBalance(karma.balance, live)
  const infinite = karma.superadmin || shownBalance === null
  const balance = shownBalance ?? 0
  const allocation = karma.allocation ?? 0
  // A top-up can push the balance above the monthly allocation; the bar clamps
  // rather than overflowing its track.
  const ratio = allocation > 0 ? Math.min(1, Math.max(0, balance / allocation)) : 0
  const low = !infinite && allocation > 0 && ratio <= 0.15
  const empty = !infinite && balance <= 0

  return (
    <Link
      href="/dashboard/karma"
      aria-label={infinite ? t('karma.unlimited') : `${balance} ${t('karma.points')}`}
      className={cn(
        'gold-trace gold-trace-hover group block rounded-xl border px-3 py-2.5 no-underline transition-colors',
        'shadow-[0_0_18px_-6px_rgba(245,188,0,0.45)]',
        active ? 'border-accent/50 bg-accent-soft' : 'border-border bg-bg-elevated hover:bg-surface-hover',
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
          <EndlessKnot size={17} glow />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.62rem] font-extrabold uppercase tracking-wider text-subtle">
            {t('nav.karma')}
          </span>
          <span className={cn('block text-sm font-extrabold leading-tight', low ? 'text-danger' : 'text-text')}>
            {infinite
              ? <span className="inline-flex items-center gap-1 text-accent"><InfinityIcon className="h-4 w-4" /> {t('karma.unlimited')}</span>
              : <>
                  <span className="tabular-nums">{balance}</span>
                  {allocation > 0 && <span className="font-semibold text-subtle"> / {allocation}</span>}
                  <span className="ml-1 font-semibold text-muted">{t('karma.points')}</span>
                </>}
          </span>
        </span>
      </span>

      {/* The gauge. A 3px track — present enough to read at a glance, quiet enough
          to ignore. Width transitions are cheap here: it changes on navigation,
          not per frame. */}
      {!infinite && allocation > 0 && (
        <span
          className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-surface-hover"
          role="progressbar"
          aria-valuenow={balance}
          aria-valuemin={0}
          aria-valuemax={allocation}
        >
          <span
            className={cn(
              'block h-full rounded-full transition-[width] duration-500 ease-out',
              empty ? 'bg-danger' : low ? 'bg-warning' : 'bg-accent',
            )}
            style={{ width: `${Math.max(empty ? 0 : 3, ratio * 100)}%` }}
          />
        </span>
      )}

      {/* Only speaks up when it has something actionable to say. */}
      {empty && (
        <span className="mt-1.5 block text-[0.68rem] font-semibold leading-snug text-warning">
          Sense punts — mira com aconseguir-ne
        </span>
      )}
    </Link>
  )
}
