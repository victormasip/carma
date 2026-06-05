'use client'

import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme, type ThemeMode } from '@/lib/theme/ThemeProvider'
import { useT } from '@/lib/i18n/LocaleProvider'

export default function ThemeToggle() {
  const { mode, setMode } = useTheme()
  const t = useT()

  const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { mode: 'light',  label: t('nav.theme.light'),  Icon: Sun },
    { mode: 'system', label: t('nav.theme.system'), Icon: Monitor },
    { mode: 'dark',   label: t('nav.theme.dark'),   Icon: Moon },
  ]

  return (
    <div
      role="radiogroup"
      aria-label={t('nav.theme')}
      className="flex items-center gap-0.5 rounded-xl bg-surface-subtle border border-border p-1"
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = m === mode
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m)}
            title={label}
            className={`flex h-8 flex-1 items-center justify-center rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              active
                ? 'bg-surface text-text shadow-card'
                : 'text-subtle hover:text-text'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
