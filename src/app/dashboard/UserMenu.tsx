'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronUp, LogOut, Check } from 'lucide-react'
import { LOCALES, LOCALE_META } from '@/lib/i18n/config'
import { useLocale, useT } from '@/lib/i18n/LocaleProvider'
import { useTheme, type ThemeMode } from '@/lib/theme/ThemeProvider'
import { Sun, Moon, Monitor } from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
import { cn } from '@/lib/cn'

type Props = {
  userEmail: string
  isSuperAdmin: boolean
}

/**
 * Sidebar footer "user pill" — collapses the previous theme+locale+signout stack
 * into a single popover. One click on the user info, one popover with every
 * account-scoped control.
 */
export default function UserMenu({ userEmail, isSuperAdmin }: Props) {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const { mode, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Initials from the email local-part — fallback "·" if it's somehow empty.
  const initials = (userEmail.split('@')[0] ?? '')
    .replace(/[._-]/g, ' ').trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]?.toUpperCase()).join('') || '·'

  const themeOptions: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { mode: 'light',  label: t('nav.theme.light'),  Icon: Sun },
    { mode: 'system', label: t('nav.theme.system'), Icon: Monitor },
    { mode: 'dark',   label: t('nav.theme.dark'),   Icon: Moon },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="cursor-pointer w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-hover transition-colors"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent text-xs font-bold uppercase">
          {initials}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-xs font-semibold text-text truncate">{userEmail}</span>
          <span className="block text-[11px] text-subtle">
            {isSuperAdmin ? t('role.superadmin') : t('role.client')}
          </span>
        </span>
        <ChevronUp className={cn('w-4 h-4 text-subtle transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute bottom-full left-0 right-0 mb-2 bg-bg-elevated border border-border rounded-xl shadow-pop overflow-hidden z-20"
        >
          {/* Theme */}
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1.5 px-1">
              {t('nav.theme')}
            </p>
            <div role="radiogroup" className="flex items-center gap-0.5 rounded-lg bg-surface-subtle border border-border p-0.5">
              {themeOptions.map(({ mode: m, label, Icon }) => {
                const active = m === mode
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m)}
                    title={label}
                    className={cn(
                      'flex h-7 flex-1 items-center justify-center rounded-md text-xs font-semibold transition-colors cursor-pointer',
                      active ? 'bg-surface text-text shadow-card' : 'text-subtle hover:text-text',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="sr-only">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Locale */}
          <div className="px-3 pt-2 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1 px-1">
              {t('nav.language')}
            </p>
            <ul className="space-y-0.5">
              {LOCALES.map(loc => {
                const active = loc === locale
                return (
                  <li key={loc}>
                    <button
                      type="button"
                      onClick={() => { setLocale(loc); setOpen(false) }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer',
                        active ? 'text-accent bg-accent-soft font-semibold' : 'text-muted hover:text-text hover:bg-surface-hover font-medium',
                      )}
                    >
                      <span aria-hidden>{LOCALE_META[loc].flag}</span>
                      <span className="flex-1 text-left">{LOCALE_META[loc].native}</span>
                      {active && <Check className="w-3.5 h-3.5 text-accent" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Sign out */}
          <div className="border-t border-border p-1.5">
            <form action={signOut}>
              <button
                type="submit"
                className="cursor-pointer flex w-full items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium text-muted hover:text-danger hover:bg-danger-soft transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t('common.signOut')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
