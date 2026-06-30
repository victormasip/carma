'use client'

// Carma Studio — the inline control primitives used by the inspector. Every one
// is a small, premium, controlled widget that edits a single token live (the
// ThemeStudio autosaves). Kept self-contained so the studio doesn't depend on the
// retired ThemeManager internals.

import { type ReactNode, useState, useRef, useEffect, useMemo } from 'react'
import { Search, Check, ChevronDown, Sparkles } from 'lucide-react'
import { LOOK_PRESETS } from '@/lib/render/lookPresets'
import type { DesignTokens } from '@/lib/scrape/tokens'
import {
  GOOGLE_FONTS, searchFonts, fontStack, googleFontCssUrl, primaryFamily, findGoogleFont,
  type GoogleFont,
} from '@/lib/render/googleFonts'
import { cn } from '@/lib/cn'

// Load a Google font into the DASHBOARD document on demand, so the picker can
// preview each family in its own typeface. Deduped across the session.
const loadedFonts = new Set<string>()
function ensureFontLoaded(family: string) {
  if (typeof document === 'undefined' || !family || loadedFonts.has(family)) return
  loadedFonts.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = googleFontCssUrl(family)
  document.head.appendChild(link)
}

export const FONT_PAIRS: { id: string; name: string; heading: string; body: string }[] = [
  { id: 'system',    name: 'Sistema',   heading: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'modern',    name: 'Modern',    heading: '"Inter", system-ui, sans-serif', body: '"Inter", system-ui, sans-serif' },
  { id: 'editorial', name: 'Editorial', heading: '"Playfair Display", Georgia, serif', body: '"Source Sans 3", system-ui, sans-serif' },
  { id: 'classic',   name: 'Clàssic',   heading: '"Lora", Georgia, serif', body: '"Open Sans", system-ui, sans-serif' },
  { id: 'bold',      name: 'Bold',      heading: '"Space Grotesk", system-ui, sans-serif', body: '"Inter", system-ui, sans-serif' },
]

function toHex(v: string): string {
  const s = (v || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  const m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  return '#888888'
}
const pxNum = (v: string | undefined, fallback = 0) => {
  const n = Math.round(parseFloat(String(v ?? '')))
  return Number.isFinite(n) ? n : fallback
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-text">{label}</span>
        {hint && <span className="text-[0.7rem] text-subtle">{hint}</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

export function ColorField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void
}) {
  const v = value || '#000000'
  return (
    <Field label={label} hint={hint}>
      <span className="flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-2 py-1.5">
        <span className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border-strong shadow-sm" style={{ background: v }}>
          <input type="color" value={toHex(v)} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </span>
        <input
          value={v}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-text outline-none"
        />
      </span>
    </Field>
  )
}

export function TextField({ label, hint, value, onChange, placeholder, mono, type = 'text' }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          'h-9 w-full rounded-lg border border-border bg-surface-subtle px-2.5 text-sm text-text outline-none transition-colors focus:border-accent placeholder:text-subtle',
          mono && 'font-mono text-xs',
        )}
      />
    </Field>
  )
}

export function SelectField({ label, hint, value, onChange, options }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-surface-subtle px-2 text-sm text-text outline-none transition-colors focus:border-accent"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

export function SegmentedField<T extends string>({ label, hint, value, onChange, options }: {
  label: string; hint?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: ReactNode }[]
}) {
  return (
    <Field label={label} hint={hint}>
      <span className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-subtle p-0.5">
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              title={o.label}
              className={cn(
                'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer',
                active ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
              )}
            >
              {o.icon}{o.label}
            </button>
          )
        })}
      </span>
    </Field>
  )
}

export function SliderField({ label, value, onChange, min, max, unit = 'px' }: {
  label: string; value: string | undefined; onChange: (v: string) => void; min: number; max: number; unit?: string
}) {
  const n = pxNum(value)
  return (
    <Field label={label}>
      <span className="flex items-center gap-3">
        <input
          type="range" min={min} max={max} value={n}
          onChange={(e) => onChange(`${e.target.value}${unit}`)}
          className="h-1.5 flex-1 cursor-pointer accent-accent"
        />
        <span className="w-12 text-right text-xs font-semibold tabular-nums text-muted">{n}{unit}</span>
      </span>
    </Field>
  )
}

export function FontPairField({ heading, body, onChange }: {
  heading: string; body: string; onChange: (heading: string, body: string) => void
}) {
  const activeId = FONT_PAIRS.find((p) => p.heading === heading && p.body === body)?.id
  return (
    <Field label="Tipografia">
      <span className="grid grid-cols-2 gap-2">
        {FONT_PAIRS.map((p) => {
          const active = activeId === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.heading, p.body)}
              className={cn(
                'cursor-pointer rounded-lg border p-2.5 text-left transition-colors',
                active ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-hover',
              )}
            >
              <span className="block truncate text-sm font-bold text-text" style={{ fontFamily: p.heading }}>{p.name}</span>
            </button>
          )
        })}
      </span>
    </Field>
  )
}

// Searchable Google Fonts picker. Previews each family in its own typeface,
// loads the chosen font into the live render (via onPick's css url → font_links),
// and lets the user replace the auto-detected typography in two clicks.
export function GoogleFontField({ label, hint, value, onPick }: {
  label: string
  hint?: string
  value: string
  onPick: (stack: string, cssUrl: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const currentFamily = primaryFamily(value)
  const known = !!findGoogleFont(value)

  useEffect(() => { if (known) ensureFontLoaded(currentFamily) }, [known, currentFamily])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const results = useMemo(() => searchFonts(query).slice(0, 60), [query])
  useEffect(() => { if (open) results.slice(0, 30).forEach((f) => ensureFontLoaded(f.family)) }, [open, results])

  const pick = (f: GoogleFont) => { onPick(fontStack(f), googleFontCssUrl(f.family)); setOpen(false); setQuery('') }

  return (
    <Field label={label} hint={hint}>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface-subtle px-2.5 text-left transition-colors hover:border-border-strong"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-text" style={{ fontFamily: value || undefined }}>
            {currentFamily || 'Tria una tipografia'}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-pop">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca a Google Fonts…"
                  className="h-8 w-full rounded-lg border border-border bg-surface-subtle pl-8 pr-2 text-sm text-text outline-none focus:border-accent placeholder:text-subtle"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {results.length === 0 && <p className="px-3 py-6 text-center text-xs text-subtle">Cap tipografia coincideix.</p>}
              {results.map((f) => {
                const active = f.family.toLowerCase() === currentFamily.toLowerCase()
                return (
                  <button
                    key={f.family}
                    type="button"
                    onClick={() => pick(f)}
                    className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer', active ? 'bg-accent-soft' : 'hover:bg-surface-hover')}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-text" style={{ fontFamily: `"${f.family}", sans-serif` }}>{f.family}</span>
                    <span className="shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-subtle">{f.category}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Field>
  )
}

export function LookGallery({ active, onPick }: {
  active: string | undefined
  onPick: (patch: Partial<DesignTokens>) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Estil del blog</p>
      <div className="grid grid-cols-1 gap-2">
        {LOOK_PRESETS.map((look) => {
          const isActive = (active ?? 'standard') === look.id
          return (
            <button
              key={look.id}
              type="button"
              onClick={() => onPick(look.patch)}
              className={cn(
                'group flex items-start gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                isActive ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-hover',
              )}
            >
              <span className={cn('mt-0.5 grid h-9 w-12 shrink-0 grid-cols-2 gap-0.5 rounded-md p-1', isActive ? 'bg-accent/15' : 'bg-surface-subtle')} aria-hidden>
                {[0, 1, 2, 3].map((i) => <span key={i} className={cn('rounded-[2px]', isActive ? 'bg-accent/70' : 'bg-border-strong')} />)}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-text">{look.name}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{look.tagline}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
