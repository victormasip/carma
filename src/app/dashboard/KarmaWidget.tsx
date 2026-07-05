'use client'

// Punts de Carma — l'indicador de saldo del sidebar (or subtil, sempre a la
// vista). Clicar-lo porta a /dashboard/karma (reptes + moviments). El saldo
// arriba server-render des del layout; després de gastar es refresca amb la
// navegació — no cal polling per a un número que canvia poques vegades per dia.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Infinity as InfinityIcon } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useT } from '@/lib/i18n/LocaleProvider'
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
  if (!karma.available && !karma.superadmin) return null

  const active = pathname.startsWith('/dashboard/karma')
  const infinite = karma.superadmin || karma.balance === null
  const low = !infinite && karma.allocation !== null && (karma.balance ?? 0) <= karma.allocation * 0.15

  return (
    <Link
      href="/dashboard/karma"
      className={cn(
        'gold-trace gold-trace-hover group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 no-underline transition-colors',
        'shadow-[0_0_18px_-6px_rgba(245,188,0,0.45)]',
        active ? 'border-accent/50 bg-accent-soft' : 'border-border bg-bg-elevated hover:bg-surface-hover',
      )}
    >
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
            : <>{karma.balance} <span className="font-semibold text-muted">{t('karma.points')}</span></>}
        </span>
      </span>
    </Link>
  )
}
