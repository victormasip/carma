'use client'

// Cmd/Ctrl+K command palette for the article editor. A single searchable list of
// every high-value action — insert a block, change format, publish, translate,
// open a drawer tab, run the AI — so the whole editor is reachable from the
// keyboard without hunting through menus. Commands are supplied by the parent
// (PostEditorClient) so each one closes over the live editor instance + handlers.
//
// Mounted only while open (the parent gates it), so each invocation starts fresh
// with no reset effect; the active row is clamped at read-time, not via state.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

export type Command = {
  id: string
  label: string
  hint?: string
  section: string
  keywords?: string
  icon?: React.ReactNode
  run: () => void
  disabled?: boolean
}

// Accent/case-insensitive so "targeta" matches "Targeta" and "cita" matches "Citació".
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function CommandPalette({
  onClose,
  commands,
}: {
  onClose: () => void
  commands: Command[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // Reset the highlight to the top whenever the query changes (render-time sync —
  // no setState-in-effect).
  const [prevQuery, setPrevQuery] = useState('')
  if (query !== prevQuery) { setPrevQuery(query); setActive(0) }

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = fold(query.trim())
    const usable = commands.filter(c => !c.disabled)
    if (!q) return usable
    const terms = q.split(/\s+/)
    return usable.filter(c => {
      const hay = fold(`${c.label} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.section}`)
      return terms.every(t => hay.includes(t))
    })
  }, [query, commands])

  // The highlight can never point past the current results.
  const activeIdx = results.length ? Math.min(active, results.length - 1) : 0

  // Focus the searcher on mount so the user types straight away.
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll the highlighted row into view during keyboard nav (DOM side effect).
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const run = (c: Command | undefined) => {
    if (!c) return
    onClose()
    // Defer so the palette unmounts before the command mutates the editor/focus.
    requestAnimationFrame(() => c.run())
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIdx + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[activeIdx]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  // Group the (already filtered) results by section, preserving first-seen order.
  const groups: { section: string; items: { cmd: Command; idx: number }[] }[] = []
  results.forEach((cmd, idx) => {
    let g = groups.find(x => x.section === cmd.section)
    if (!g) { g = { section: cmd.section, items: [] }; groups.push(g) }
    g.items.push({ cmd, idx })
  })

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px] animate-in fade-in duration-150"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-pop animate-in zoom-in-95 slide-in-from-top-2 duration-150"
        role="dialog"
        aria-label="Paleta d'ordres"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cerca una acció o insereix un bloc…"
            aria-label="Cerca una acció"
            className="h-12 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle"
          />
          <kbd className="hidden rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold text-subtle sm:inline">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-subtle">Cap acció coincideix.</p>
          ) : (
            groups.map(g => (
              <div key={g.section} className="px-1.5 py-1">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-subtle">{g.section}</p>
                {g.items.map(({ cmd, idx }) => (
                  <button
                    key={cmd.id}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => run(cmd)}
                    className={cn(
                      'group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      idx === activeIdx ? 'bg-accent-soft text-accent' : 'text-text hover:bg-surface-hover',
                    )}
                  >
                    <span className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                      idx === activeIdx ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-subtle',
                    )}>
                      {cmd.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-tight">{cmd.label}</span>
                      {cmd.hint && <span className={cn('block truncate text-xs leading-tight', idx === activeIdx ? 'text-accent/70' : 'text-subtle')}>{cmd.hint}</span>}
                    </span>
                    {idx === activeIdx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
