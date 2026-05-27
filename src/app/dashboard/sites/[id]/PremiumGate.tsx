'use client'

import { Crown, Lock, Check } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { ReactNode } from 'react'

/** Small crown chip shown on locked tab buttons. */
export function LockBadge() {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm" title="Funció Premium">
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
    <div className="relative overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-10 shadow-sm animate-in fade-in duration-300">
      <div className="absolute -top-16 -right-16 w-72 h-72 bg-amber-300/20 blur-[90px] pointer-events-none rounded-full" />
      <div className="relative z-10 max-w-xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Crown className="w-6 h-6" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
            Premium
          </span>
        </div>

        <h3 className="text-2xl font-extrabold text-neutral-900 tracking-tight">{feature}</h3>
        <p className="text-sm text-neutral-500 mt-2 leading-relaxed">{description}</p>

        <ul className="mt-6 space-y-2.5">
          {perks.map(perk => (
            <li key={perk} className="flex items-center gap-2.5 text-sm font-medium text-neutral-700">
              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              {perk}
            </li>
          ))}
        </ul>

        <button
          onClick={() => toast('La facturació encara no està disponible. Contacta amb el teu administrador per passar a Premium.', 'info')}
          className="cursor-pointer mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-bold shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-amber-700 transition-all"
        >
          <Crown className="w-4 h-4" />
          Passa a Premium
        </button>
      </div>
    </div>
  )
}

/**
 * Wraps a feature in a "locked" treatment: dims and disables the children
 * (pointer-events off) and overlays a crown + tooltip. Used for the
 * Re-capture grabber, which free users can see but not use.
 */
export function PremiumLockOverlay({ label, locked = true, children }: { label: string; locked?: boolean; children: ReactNode }) {
  if (!locked) return <>{children}</>
  return (
    <div className="relative group/lock">
      <div className="pointer-events-none select-none opacity-50 blur-[1px]">{children}</div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/40 backdrop-blur-[2px]">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-amber-200 shadow-lg">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shrink-0">
            <Lock className="w-3.5 h-3.5" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-bold text-neutral-900">{label}</p>
            <p className="text-xs font-medium text-amber-700">Funció Premium</p>
          </div>
        </div>
      </div>
    </div>
  )
}
