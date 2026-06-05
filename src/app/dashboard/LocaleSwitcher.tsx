'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { LOCALES, LOCALE_META } from '@/lib/i18n/config'
import { useLocale, useT } from '@/lib/i18n/LocaleProvider'

export default function LocaleSwitcher() {
  const { locale, setLocale } = useLocale()
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-muted hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
      >
        <Languages className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{LOCALE_META[locale].native}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 right-0 mb-1.5 bg-bg-elevated border border-border rounded-xl shadow-pop overflow-hidden z-10"
        >
          {LOCALES.map(loc => {
            const active = loc === locale
            return (
              <button
                key={loc}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { setLocale(loc); setOpen(false) }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer ${
                  active
                    ? 'text-accent bg-accent-soft font-semibold'
                    : 'text-muted hover:text-text hover:bg-surface-hover font-medium'
                }`}
              >
                <span>{LOCALE_META[loc].flag}</span>
                <span className="flex-1 text-left">{LOCALE_META[loc].native}</span>
                {active && <Check className="w-3.5 h-3.5 text-accent" />}
              </button>
            )
          })}
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle border-t border-border">
            {t('nav.language')}
          </p>
        </div>
      )}
    </div>
  )
}
