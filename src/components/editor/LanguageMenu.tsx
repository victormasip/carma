'use client'

// The article language control (Super MVP Fase 5).
//
// WAS: a cramped segmented control wedged into the top bar between the breadcrumb
// and the publish button. Two-letter uppercase codes. A 6px coloured dot whose
// meaning existed only in a `title` attribute. A cryptic `·def` suffix. A
// HOVER-ONLY ✕ to remove a language — unreachable on touch entirely. And an
// unlabeled `+` icon to add one. The founder called it "hidden and highly
// unintuitive", which was an accurate description of the markup.
//
// NOW: a real button with a real language name, sitting at the head of the writing
// canvas where language actually belongs — above the title, next to the thing it
// governs. Everything the dot encoded is spelled out:
//
//   🌐  Català · per defecte  ▾
//        ↓
//      ✓ Català      per defecte   100%  ⋯
//        Español                    40%  ⋯
//        English                     0%  ⋯
//      ────────────────────────────────────
//      ＋ Afegeix un idioma
//      ✨ Tradueix a tots
//
// Every destructive action lives in a per-row ⋯ menu — no hover-only affordances,
// so it works on a phone, which is where half the edits start (a WhatsApp draft
// opened to fix a line).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, Check, ChevronDown, Plus, Sparkles, MoreHorizontal, Trash2, Star, Search } from 'lucide-react'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import { cn } from '@/lib/cn'

export type LanguageMenuProps = {
  shown: Locale[]
  active: Locale
  defaultLocale: Locale
  /** 0–100 completion per locale, for the progress column. */
  completion: Record<Locale, number>
  availableToAdd: Locale[]
  onPick: (l: Locale) => void
  onAdd: (l: Locale) => void
  onRemove: (l: Locale) => void
  onMakeDefault: (l: Locale) => void
  /** Translate every non-default language from the base. Hidden when there's nothing to translate. */
  onTranslateAll?: () => void
  translating?: boolean
  canTranslate?: boolean
}

export default function LanguageMenu({
  shown, active, defaultLocale, completion, availableToAdd,
  onPick, onAdd, onRemove, onMakeDefault, onTranslateAll, translating, canTranslate,
}: LanguageMenuProps) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [rowMenu, setRowMenu] = useState<Locale | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Closing RESETS the sub-panels, so reopening always lands on the language list
  // rather than wherever the last session left off. Done here in one place rather
  // than in an effect body: `setState` synchronously inside an effect triggers a
  // cascading render (react-hooks v6 flags it, and the repo runs at zero).
  const close = useCallback(() => {
    setOpen(false)
    setAdding(false)
    setQuery('')
    setRowMenu(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  useEffect(() => { if (adding) searchRef.current?.focus() }, [adding])

  const filtered = availableToAdd.filter(l => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    const m = LOCALE_META[l]
    return m.native.toLowerCase().includes(q) || m.label.toLowerCase().includes(q) || l.includes(q)
  })

  const activeMeta = LOCALE_META[active]
  const isDefault = active === defaultLocale

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'group flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
          open
            ? 'border-accent bg-accent-soft text-text'
            : 'border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
        )}
      >
        <Globe className="h-4 w-4 shrink-0 text-accent" />
        <span>{activeMeta.native}</span>
        {isDefault && <span className="font-medium text-muted">· per defecte</span>}
        {shown.length > 1 && !isDefault && (
          <span className="font-medium text-muted">· {completion[active] ?? 0}%</span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-[19rem] overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-pop"
        >
          {!adding ? (
            <>
              <ul className="max-h-72 overflow-y-auto py-1.5">
                {shown.map(loc => {
                  const meta = LOCALE_META[loc]
                  const pct = completion[loc] ?? 0
                  const isActive = loc === active
                  const isBase = loc === defaultLocale
                  return (
                    <li key={loc} className="relative">
                      <div
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2 transition-colors',
                          isActive ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                        )}
                      >
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => { onPick(loc); close() }}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            {isActive && <Check className="h-4 w-4 text-accent" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-text">{meta.native}</span>
                            {isBase && <span className="block text-xs font-medium text-muted">per defecte</span>}
                          </span>
                          <CompletionPill pct={pct} />
                        </button>

                        {/* Row actions — a real menu, not a hover-only ✕. */}
                        <button
                          type="button"
                          aria-label={`Accions per a ${meta.native}`}
                          onClick={() => setRowMenu(m => (m === loc ? null : loc))}
                          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-bg-elevated hover:text-text"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>

                      {rowMenu === loc && (
                        <div className="mx-3 mb-2 overflow-hidden rounded-xl border border-border bg-surface">
                          {!isBase && (
                            <button
                              type="button"
                              onClick={() => { onMakeDefault(loc); setRowMenu(null) }}
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-hover"
                            >
                              <Star className="h-3.5 w-3.5 text-accent" />
                              Fer-lo l&apos;idioma per defecte
                            </button>
                          )}
                          {shown.length > 1 && (
                            <button
                              type="button"
                              onClick={() => { onRemove(loc); setRowMenu(null) }}
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-soft"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Treure de l&apos;article
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              <div className="border-t border-border p-1.5">
                {availableToAdd.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-hover"
                  >
                    <Plus className="h-4 w-4 text-accent" />
                    Afegeix un idioma
                  </button>
                )}
                {onTranslateAll && shown.length > 1 && (
                  <button
                    type="button"
                    disabled={translating}
                    onClick={() => { onTranslateAll(); close() }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
                  >
                    <Sparkles className={cn('h-4 w-4', canTranslate ? 'text-accent' : 'text-warning')} />
                    {translating ? 'Traduint…' : 'Tradueix a tots els idiomes'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div>
              <div className="border-b border-border p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && filtered.length) {
                        e.preventDefault()
                        onAdd(filtered[0])
                        close()
                      }
                    }}
                    placeholder="Cerca un idioma…"
                    aria-label="Cerca un idioma"
                    className="h-9 w-full rounded-lg border border-border bg-surface-subtle pl-8 pr-2.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent"
                  />
                </div>
              </div>
              <ul className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2.5 text-sm text-subtle">Cap idioma coincideix.</li>
                ) : filtered.map(loc => (
                  <li key={loc}>
                    <button
                      type="button"
                      onClick={() => { onAdd(loc); close() }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                    >
                      <span className="grid h-5 w-7 shrink-0 place-items-center rounded bg-surface-subtle text-[10px] font-bold tracking-wide text-subtle">
                        {LOCALE_META[loc].code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{LOCALE_META[loc].native}</span>
                        <span className="block truncate text-xs text-subtle">{LOCALE_META[loc].label}</span>
                      </span>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Completion as a NUMBER with a bar, not an undocumented coloured dot. */
function CompletionPill({ pct }: { pct: number }) {
  const tone = pct >= 80 ? 'bg-success' : pct > 0 ? 'bg-warning' : 'bg-border-strong'
  return (
    <span className="flex shrink-0 items-center gap-1.5" title={`${pct}% complet`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-hover">
        <span className={cn('block h-full rounded-full transition-[width]', tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-8 text-right text-xs font-semibold tabular-nums text-muted">{pct}%</span>
    </span>
  )
}
