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
        className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 rounded-xl transition-colors cursor-pointer"
      >
        <Languages className="w-5 h-5 shrink-0" />
        <span className="flex-1 text-left">{LOCALE_META[locale].native}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150 z-10"
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
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                  active ? 'text-carma-700 bg-carma-50/60' : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <span>{LOCALE_META[loc].flag}</span>
                <span className="flex-1 text-left">{LOCALE_META[loc].native}</span>
                {active && <Check className="w-4 h-4 text-carma-500" />}
              </button>
            )
          })}
          <p className="px-4 py-2 text-xs text-neutral-300 border-t border-neutral-100">{t('nav.language')}</p>
        </div>
      )}
    </div>
  )
}
