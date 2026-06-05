'use client'

// Visual navigation-link editor for the cloned header & footer.
//
// Lets the user add / rename / re-point / reorder / remove the menu links in
// their captured header and footer directly from the Theme editor — a clean
// array UI on top of the real chrome markup. It reads the stored region value
// (JSON {html,css,mode}), pulls out the primary nav link set (see navEdit.ts),
// and writes edits back into the SAME markup so the clone's styling is untouched.
//
// State model is React-19-strict safe: the editable list is derived from the
// stored value via a snapshot taken whenever the underlying region changes
// (tracked by a ref + render-time sync, no setState-in-effect). Edits update
// local state immediately (snappy UX) and are committed back to the region —
// and thus the debounced theme autosave — on every change.

import { useState } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, Link2, PanelTop, PanelBottom } from 'lucide-react'
import { navLinksFromRegion, regionWithNavLinks, type NavLink } from '@/lib/render/navEdit'

type Region = 'header' | 'footer'

function RegionNav({
  region, value, onChange,
}: {
  region: Region
  value: string
  onChange: (next: string) => void
}) {
  // Derive the editable list from the stored region. We re-sync whenever the
  // incoming `value` changes from outside (locale switch, recapture, visual
  // edit). This is the React-blessed "adjust state while rendering when a prop
  // changes" pattern — the previous value is held in STATE (not a ref, which
  // can't be read/written during render under this project's strict rules).
  const [links, setLinks] = useState<NavLink[]>(() => navLinksFromRegion(value))
  const [lastValue, setLastValue] = useState<string>(value)

  if (value !== lastValue) {
    setLastValue(value)
    setLinks(navLinksFromRegion(value))
  }

  const hasRegion = !!value.trim()

  const commit = (next: NavLink[]) => {
    setLinks(next)
    // Persist into the region markup (keeps styling) → triggers theme autosave.
    onChange(regionWithNavLinks(value, next))
  }

  const update = (i: number, patch: Partial<NavLink>) => {
    commit(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  const remove = (i: number) => commit(links.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= links.length) return
    const next = links.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    commit(next)
  }
  const add = () => commit([...links, { label: 'Nou enllaç', href: '/' }])

  const Icon = region === 'header' ? PanelTop : PanelBottom
  const title = region === 'header' ? 'Enllaços del header' : 'Enllaços del footer'

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-subtle" />
        <h4 className="text-sm font-semibold text-text">{title}</h4>
        <span className="text-xs text-subtle">({links.length})</span>
      </div>

      {!hasRegion ? (
        <p className="text-xs text-subtle italic">
          Captura primer el tema per editar el menú d’aquesta regió.
        </p>
      ) : links.length === 0 ? (
        <p className="text-xs text-subtle">
          No s’han detectat enllaços de navegació. Afegeix-ne un per començar.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((link, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={link.label}
                  onChange={e => update(i, { label: e.target.value })}
                  placeholder="Text"
                  aria-label={`Text de l'enllaç ${i + 1}`}
                  className="h-8 px-2 rounded-md border border-border bg-surface text-xs text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <div className="relative">
                  <Link2 className="w-3 h-3 text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={link.href}
                    onChange={e => update(i, { href: e.target.value })}
                    placeholder="/ruta o https://…"
                    aria-label={`URL de l'enllaç ${i + 1}`}
                    className="h-8 w-full pl-6 pr-2 rounded-md border border-border bg-surface text-xs text-text font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
              </div>
              <div className="flex items-center shrink-0">
                <button
                  type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  aria-label="Mou amunt" title="Mou amunt"
                  className="w-7 h-8 flex items-center justify-center text-subtle hover:text-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button" onClick={() => move(i, 1)} disabled={i === links.length - 1}
                  aria-label="Mou avall" title="Mou avall"
                  className="w-7 h-8 flex items-center justify-center text-subtle hover:text-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button" onClick={() => remove(i)}
                  aria-label="Elimina l'enllaç" title="Elimina"
                  className="w-7 h-8 flex items-center justify-center text-subtle hover:text-danger cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasRegion && (
        <button
          type="button"
          onClick={add}
          className="cursor-pointer flex items-center gap-1.5 h-8 px-3 rounded-md border border-dashed border-border-strong text-xs font-semibold text-muted hover:text-text hover:border-accent hover:bg-accent-soft transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Afegir enllaç
        </button>
      )}
    </div>
  )
}

/**
 * Header + footer nav-link editors. `header`/`footer` are the stored region JSON
 * values; the setters write the edited markup back (and trigger theme autosave).
 */
export default function NavEditor({
  header, footer, onHeaderChange, onFooterChange,
}: {
  header: string
  footer: string
  onHeaderChange: (next: string) => void
  onFooterChange: (next: string) => void
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <RegionNav region="header" value={header} onChange={onHeaderChange} />
      <RegionNav region="footer" value={footer} onChange={onFooterChange} />
    </div>
  )
}
