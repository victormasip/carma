'use client'

import { Crown, Lock, Check } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import type { ReactNode } from 'react'

/** Small crown chip shown on locked tab buttons. */
export function LockBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-on-accent"
      title="Funció Premium"
    >
      <Crown className="w-2.5 h-2.5" strokeWidth={2.5} />
    </span>
  )
}

/** Full-panel upsell shown when a free user opens a locked tab. */
export function PremiumPanel({
  feature,
  description,
  perks,
}: {
  feature: string
  description: string
  perks: string[]
}) {
  const { toast } = useToast()
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-elevated p-10 shadow-card">
      <div className="absolute -top-16 -right-16 w-72 h-72 bg-accent opacity-[0.08] blur-[90px] pointer-events-none rounded-full" />
      <div className="relative z-10 max-w-xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-accent text-on-accent flex items-center justify-center shadow-card">
            <Crown className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-accent bg-accent-soft px-2.5 py-1 rounded-md">
            Premium
          </span>
        </div>

        <h3 className="text-xl font-bold text-text tracking-tight">{feature}</h3>
        <p className="text-sm text-muted mt-2 leading-relaxed">{description}</p>

        <ul className="mt-6 space-y-2.5">
          {perks.map(perk => (
            <li key={perk} className="flex items-center gap-2.5 text-sm font-medium text-text">
              <span className="w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              {perk}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Button
            onClick={() => toast('La facturació encara no està disponible. Contacta amb el teu administrador per passar a Premium.', 'info')}
            iconLeft={<Crown className="w-4 h-4" />}
          >
            Passa a Premium
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Wraps a feature in a "locked" treatment: dims and disables the children
 * (pointer-events off) and overlays a crown + tooltip.
 */
export function PremiumLockOverlay({ label, locked = true, children }: { label: string; locked?: boolean; children: ReactNode }) {
  if (!locked) return <>{children}</>
  return (
    <div className="relative group/lock">
      <div className="pointer-events-none select-none opacity-50 blur-[1px]">{children}</div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-bg/40 backdrop-blur-[2px]">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-elevated border border-border shadow-pop">
          <span className="w-7 h-7 rounded-lg bg-accent text-on-accent flex items-center justify-center shrink-0">
            <Lock className="w-3.5 h-3.5" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-text">{label}</p>
            <p className="text-xs font-medium text-accent">Funció Premium</p>
          </div>
        </div>
      </div>
    </div>
  )
}
