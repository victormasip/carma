'use client'

// Premium phone input with a country-prefix selector (default Spain +34) and
// STRICT national-number formatting. Emits a clean E.164 string ('' while the
// number is incomplete), so callers never re-parse free-text phone strings.
//
// The country picker is a native <select> under custom chrome — bulletproof on
// mobile (system sheet), zero positioning bugs, fully keyboard-accessible.

import { useMemo, useState } from 'react'
import { ChevronDown, Phone } from 'lucide-react'
import { cn } from '@/lib/cn'

type Country = {
  iso: string
  name: string
  prefix: string // digits only, no '+'
  flag: string
  /** National-number length range [min, max]. */
  len: [number, number]
  /** Digit grouping for display, e.g. [3,3,3] → "600 00 00 00". */
  groups: number[]
}

// Curated, Spain-first list — the markets Carma actually serves. Generic
// fallback rules keep any of them working without a libphonenumber dep.
const COUNTRIES: Country[] = [
  { iso: 'ES', name: 'Espanya',        prefix: '34',  flag: '🇪🇸', len: [9, 9],  groups: [3, 3, 3] },
  { iso: 'AD', name: 'Andorra',        prefix: '376', flag: '🇦🇩', len: [6, 9],  groups: [3, 3, 3] },
  { iso: 'FR', name: 'França',         prefix: '33',  flag: '🇫🇷', len: [9, 9],  groups: [1, 2, 2, 2, 2] },
  { iso: 'PT', name: 'Portugal',       prefix: '351', flag: '🇵🇹', len: [9, 9],  groups: [3, 3, 3] },
  { iso: 'IT', name: 'Itàlia',         prefix: '39',  flag: '🇮🇹', len: [9, 11], groups: [3, 3, 4] },
  { iso: 'DE', name: 'Alemanya',       prefix: '49',  flag: '🇩🇪', len: [10, 11], groups: [4, 3, 4] },
  { iso: 'GB', name: 'Regne Unit',     prefix: '44',  flag: '🇬🇧', len: [10, 10], groups: [4, 3, 3] },
  { iso: 'IE', name: 'Irlanda',        prefix: '353', flag: '🇮🇪', len: [9, 9],  groups: [2, 3, 4] },
  { iso: 'NL', name: 'Països Baixos',  prefix: '31',  flag: '🇳🇱', len: [9, 9],  groups: [1, 4, 4] },
  { iso: 'BE', name: 'Bèlgica',        prefix: '32',  flag: '🇧🇪', len: [8, 9],  groups: [3, 2, 2, 2] },
  { iso: 'CH', name: 'Suïssa',         prefix: '41',  flag: '🇨🇭', len: [9, 9],  groups: [2, 3, 2, 2] },
  { iso: 'US', name: 'Estats Units',   prefix: '1',   flag: '🇺🇸', len: [10, 10], groups: [3, 3, 4] },
  { iso: 'MX', name: 'Mèxic',          prefix: '52',  flag: '🇲🇽', len: [10, 10], groups: [2, 4, 4] },
  { iso: 'AR', name: 'Argentina',      prefix: '54',  flag: '🇦🇷', len: [10, 11], groups: [3, 4, 4] },
  { iso: 'CO', name: 'Colòmbia',       prefix: '57',  flag: '🇨🇴', len: [10, 10], groups: [3, 3, 4] },
  { iso: 'CL', name: 'Xile',           prefix: '56',  flag: '🇨🇱', len: [9, 9],  groups: [1, 4, 4] },
  { iso: 'PE', name: 'Perú',           prefix: '51',  flag: '🇵🇪', len: [9, 9],  groups: [3, 3, 3] },
  { iso: 'BR', name: 'Brasil',         prefix: '55',  flag: '🇧🇷', len: [10, 11], groups: [2, 5, 4] },
  { iso: 'MA', name: 'Marroc',         prefix: '212', flag: '🇲🇦', len: [9, 9],  groups: [3, 2, 2, 2] },
]

const DEFAULT_ISO = 'ES'

function formatNational(digits: string, groups: number[]): string {
  const parts: string[] = []
  let i = 0
  for (const g of groups) {
    if (i >= digits.length) break
    parts.push(digits.slice(i, i + g))
    i += g
  }
  if (i < digits.length) parts.push(digits.slice(i))
  return parts.join(' ')
}

/** Spain keeps its stricter mobile/landline shape; the rest validate by length. */
function isValidNational(c: Country, digits: string): boolean {
  if (digits.length < c.len[0] || digits.length > c.len[1]) return false
  if (c.iso === 'ES') return /^[6789]\d{8}$/.test(digits)
  return true
}

export type PhoneInputProps = {
  /** Fired with a clean E.164 string ('+34600000000') — or '' while incomplete. */
  onChange: (e164: string) => void
  onEnter?: () => void
  disabled?: boolean
  autoFocus?: boolean
  id?: string
  /** Visual size — the onboarding step wants the big one. */
  size?: 'md' | 'lg'
  className?: string
}

export default function PhoneInput({
  onChange, onEnter, disabled, autoFocus, id, size = 'md', className,
}: PhoneInputProps) {
  const [iso, setIso] = useState(DEFAULT_ISO)
  const [digits, setDigits] = useState('')
  const country = useMemo(() => COUNTRIES.find(c => c.iso === iso) ?? COUNTRIES[0], [iso])

  const emit = (c: Country, d: string) => {
    onChange(isValidNational(c, d) ? `+${c.prefix}${d}` : '')
  }

  const handleCountry = (nextIso: string) => {
    setIso(nextIso)
    const next = COUNTRIES.find(c => c.iso === nextIso) ?? COUNTRIES[0]
    emit(next, digits)
  }

  const handleNumber = (raw: string) => {
    // STRICT: digits only, hard-capped at the country's max length. A pasted
    // "+34 600..." sheds its own prefix so it can't double up.
    let d = raw.replace(/\D/g, '')
    if (raw.trim().startsWith('+') && d.startsWith(country.prefix)) d = d.slice(country.prefix.length)
    d = d.slice(0, country.len[1])
    setDigits(d)
    emit(country, d)
  }

  const h = size === 'lg' ? 'h-13 sm:h-14' : 'h-11'
  const textCls = size === 'lg' ? 'text-base sm:text-lg' : 'text-sm'

  return (
    <div
      className={cn(
        'flex w-full items-stretch overflow-hidden rounded-xl border border-border bg-surface-subtle transition-colors',
        'focus-within:border-accent focus-within:bg-surface',
        disabled && 'opacity-60',
        className,
      )}
    >
      {/* Country prefix — native select under custom chrome (mobile-perfect). */}
      <label className={cn('relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-border bg-surface px-3', h)}>
        <span aria-hidden className={size === 'lg' ? 'text-xl' : 'text-base'}>{country.flag}</span>
        <span className={cn('font-semibold tabular-nums text-text', textCls)}>+{country.prefix}</span>
        <ChevronDown className="h-3.5 w-3.5 text-subtle" aria-hidden />
        <select
          aria-label="Prefix del país"
          value={iso}
          disabled={disabled}
          onChange={e => handleCountry(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {COUNTRIES.map(c => (
            <option key={c.iso} value={c.iso}>{c.flag} {c.name} (+{c.prefix})</option>
          ))}
        </select>
      </label>

      {/* National number — strictly formatted while typing. */}
      <div className="relative min-w-0 flex-1">
        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          disabled={disabled}
          value={formatNational(digits, country.groups)}
          onChange={e => handleNumber(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onEnter?.() }}
          placeholder={country.iso === 'ES' ? '600 00 00 00' : formatNational('6'.padEnd(country.len[0], '0'), country.groups)}
          className={cn('w-full bg-transparent pl-9 pr-3 tabular-nums text-text outline-none placeholder:text-subtle', h, textCls)}
        />
      </div>
    </div>
  )
}
