'use client'

// Pre-flight cost disclosure (Fase 2).
//
// THE PROBLEM
// ───────────
// Every AI action spends Punts de Carma, and the owner found out how many AFTER
// the fact — or worse, found out by being refused with a 402 mid-flow. A price
// that only appears when you cannot afford it is not a price, it is a trap, and it
// is the fastest way to make a generous free tier feel stingy.
//
// THE FIX
// ───────
// The cost rides on the button. "Escriure article · 80 punts" before you press it,
// every time, from the single source of truth in karma/config.ts — so the number
// on screen can never drift from the number charged.
//
// Tone matters as much as placement: this is a fuel gauge, not a paywall. It stays
// quiet (subtle text) until the owner cannot afford the action, and only then does
// it go warm — at which point it says what to do about it, not just "no".

import Link from 'next/link'
import { Sparkles, AlertCircle } from 'lucide-react'
import { KARMA_COSTS, type KarmaAction } from '@/lib/karma/config'
import { cn } from '@/lib/cn'

export type CostBadgeProps = {
  action: KarmaAction
  /** Current balance; null = unlimited (superadmin) or unknown (pre-028). */
  balance?: number | null
  /** Hide entirely when the economy isn't live yet (migration 028 pending). */
  available?: boolean
  /** Multiply the base cost — e.g. translating into 4 languages. */
  quantity?: number
  className?: string
}

/** Human label for what the owner is about to spend on. */
const ACTION_LABELS: Record<KarmaAction, string> = {
  article_draft: 'Escriure article',
  article_revision: 'Revisar article',
  agent_chat: 'Conversa',
  voice_note: 'Nota de veu',
  cover_image: 'Imatge de portada',
  peer_review: 'Demanar revisió',
  site_clone: 'Clonar el web',
}

export function costOf(action: KarmaAction, quantity = 1): number {
  return (KARMA_COSTS[action] ?? 0) * Math.max(1, quantity)
}

export default function CostBadge({
  action, balance, available = true, quantity = 1, className,
}: CostBadgeProps) {
  const cost = costOf(action, quantity)
  // Free actions say nothing. Cloning is deliberately 0 punts, and announcing
  // "0 punts" would plant the idea that it might one day cost something.
  if (!available || cost === 0) return null

  const unlimited = balance === null || balance === undefined
  const short = !unlimited && balance < cost

  if (short) {
    return (
      <Link
        href="/dashboard/karma"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg bg-warning-soft px-2 py-1 text-xs font-semibold text-warning no-underline transition-opacity hover:opacity-85',
          className,
        )}
      >
        <AlertCircle className="h-3 w-3 shrink-0" />
        Et falten {cost - (balance ?? 0)} punts
        <span className="font-medium opacity-80">· com aconseguir-ne</span>
      </Link>
    )
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium text-subtle', className)}
      title={`${ACTION_LABELS[action]} · ${cost} punts de Carma`}
    >
      <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden />
      <span className="tabular-nums">{cost}</span> punts
    </span>
  )
}

/**
 * The same disclosure inline in a sentence, for confirm dialogs and drawers where
 * a floating badge would read as decoration rather than as a price.
 */
export function CostLine({ action, balance, available = true, quantity = 1 }: CostBadgeProps) {
  const cost = costOf(action, quantity)
  if (!available || cost === 0) return null
  const unlimited = balance === null || balance === undefined
  const after = unlimited ? null : (balance ?? 0) - cost

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden />
      <span>
        <span className="font-semibold text-text">{ACTION_LABELS[action]}</span>
        {' · '}
        <span className="tabular-nums font-semibold text-text">{cost}</span> punts
        {after !== null && (
          <span className="text-subtle">
            {' · '}et quedaran <span className="tabular-nums">{Math.max(0, after)}</span>
          </span>
        )}
      </span>
    </p>
  )
}
