'use client'

// Selector de llocs del sidebar (patró popover Vercel/Linear) — substitueix la
// llista plana que feia scroll infinit amb dotzenes de llocs (agències).
//
//   · Disparador compacte: el lloc ACTIU (avatar/logo + nom + subdomini) o el
//     recompte total quan no n'hi ha cap d'actiu.
//   · Popover amb cerca auto-enfocada (sense accents, multi-terme), grup de
//     "Recents" (localStorage — es registra cada visita/selecció), llista
//     completa en un contenidor d'alçada fixa (max-h-64) i una fila d'accions
//     enganxada a sota ("Clona un nou lloc").
//   · Teclat: ↑/↓ per moure't, Enter per obrir, Escape per tancar.
//
// El lloc actiu es deriva del pathname (/dashboard/sites/[id] o /edit/[id]) —
// zero estat duplicat; navegar JA és seleccionar.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Clock, Globe, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/LocaleProvider'

export type SwitcherSite = {
  id: string
  name: string
  subdomain?: string | null
  logo_url?: string | null
}

const RECENTS_KEY = 'carma:recent-sites'
const RECENTS_SHOWN = 3

/** Cerca sense accents ni majúscules, tots els termes han de coincidir. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function matches(site: SwitcherSite, query: string): boolean {
  const hay = fold(`${site.name} ${site.subdomain ?? ''}`)
  return query.split(/\s+/).filter(Boolean).every((term) => hay.includes(term))
}

function readRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
function pushRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, 8)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch { /* localStorage ple/bloquejat: els recents són cosmètics */ }
}

export default function SiteSwitcher({ sites, isSuperAdmin }: { sites: SwitcherSite[]; isSuperAdmin: boolean }) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [recentIds, setRecentIds] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Lloc actiu segons la ruta (el switcher mai té una "selecció" pròpia).
  const activeId = pathname.match(/^\/dashboard\/sites\/([^/]+)/)?.[1]
    ?? pathname.match(/^\/edit\/([^/]+)/)?.[1]
    ?? null
  const active = sites.find((s) => s.id === activeId) ?? null

  // Visitar un lloc el fa "recent" — encara que s'hi arribi per enllaç directe.
  useEffect(() => {
    if (activeId && sites.some((s) => s.id === activeId)) pushRecent(activeId)
  }, [activeId, sites])

  const openPopover = () => {
    setRecentIds(readRecents())
    setQuery('')
    setCursor(0)
    setOpen(true)
  }

  // Enfoca la cerca en obrir; tanca amb clic fora.
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = fold(query.trim())
  const filtered = useMemo(
    () => (q ? sites.filter((s) => matches(s, q)) : sites),
    [sites, q],
  )
  // Recents només quan NO s'està cercant (cercar ja és una intenció concreta).
  const recents = useMemo(
    () => (q ? [] : recentIds.map((id) => sites.find((s) => s.id === id)).filter((s): s is SwitcherSite => !!s).slice(0, RECENTS_SHOWN)),
    [q, recentIds, sites],
  )
  // La llista navegable pel teclat = recents + resta (sense duplicats visuals:
  // la secció "tots" els mostra igualment — mantenim l'ordre visual real).
  const rest = useMemo(
    () => (q ? filtered : filtered.filter((s) => !recents.some((r) => r.id === s.id))),
    [q, filtered, recents],
  )
  const flat = useMemo(() => [...recents, ...rest], [recents, rest])

  const select = (site: SwitcherSite) => {
    pushRecent(site.id)
    setOpen(false)
    router.push(`/dashboard/sites/${site.id}`)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && flat[cursor]) { e.preventDefault(); select(flat[cursor]) }
  }

  // Mantén l'element del cursor a la vista quan es navega amb fletxes.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (sites.length === 0) return null

  return (
    <div ref={rootRef} className="relative">
      {/* ── Disparador compacte ── */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors',
          open ? 'border-accent/40 bg-surface-hover' : 'border-border bg-bg-elevated hover:bg-surface-hover',
        )}
      >
        <SiteAvatar site={active} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold leading-tight text-text">
            {active ? active.name : (isSuperAdmin ? t('nav.allSites') : t('nav.yourSites'))}
          </span>
          <span className="block truncate text-xs leading-tight text-subtle">
            {active
              ? (active.subdomain ? `${active.subdomain} · ` : '') + (isSuperAdmin ? t('role.superadmin') : t('role.client'))
              : `${sites.length} ${sites.length === 1 ? 'lloc' : 'llocs'}`}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle" />
      </button>

      {/* ── Popover ── */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-pop"
          role="listbox"
          onKeyDown={onKey}
        >
          {/* Cerca */}
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
              placeholder="Cerca un lloc…"
              className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-text outline-none placeholder:text-subtle"
            />
          </div>

          {/* Llista (recents + tots) — alçada fixa, MAI creix amb el compte */}
          <div ref={listRef} className="max-h-64 overflow-y-auto p-1">
            {recents.length > 0 && (
              <>
                <GroupLabel icon={<Clock className="h-3 w-3" />} label="Recents" />
                {recents.map((s, i) => (
                  <SiteOption key={`r-${s.id}`} site={s} idx={i} cursor={cursor} activeId={activeId} onSelect={select} onHover={setCursor} />
                ))}
                {rest.length > 0 && <GroupLabel icon={<Globe className="h-3 w-3" />} label={isSuperAdmin ? 'Tots els llocs' : 'Els teus llocs'} />}
              </>
            )}
            {rest.map((s, i) => (
              <SiteOption key={s.id} site={s} idx={recents.length + i} cursor={cursor} activeId={activeId} onSelect={select} onHover={setCursor} />
            ))}
            {flat.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">Cap lloc no coincideix amb «{query}»</p>
            )}
          </div>

          {/* Accions ràpides — enganxades a sota */}
          <div className="border-t border-border bg-surface-subtle p-1">
            <Link
              href="/benvinguda"
              onClick={() => setOpen(false)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted no-underline transition-colors hover:bg-surface-hover hover:text-text"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border-strong">
                <Plus className="h-3.5 w-3.5" />
              </span>
              Clona un nou lloc
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[0.62rem] font-extrabold uppercase tracking-wider text-subtle">
      {icon} {label}
    </p>
  )
}

function SiteOption({ site, idx, cursor, activeId, onSelect, onHover }: {
  site: SwitcherSite
  idx: number
  cursor: number
  activeId: string | null
  onSelect: (s: SwitcherSite) => void
  onHover: (i: number) => void
}) {
  const isActive = site.id === activeId
  return (
    <button
      type="button"
      data-idx={idx}
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(site)}
      onMouseMove={() => onHover(idx)}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        idx === cursor ? 'bg-surface-hover' : '',
      )}
    >
      <SiteAvatar site={site} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm leading-tight', isActive ? 'font-bold text-accent' : 'font-medium text-text')}>
          {site.name}
        </span>
        {site.subdomain && <span className="block truncate text-xs leading-tight text-subtle">{site.subdomain}</span>}
      </span>
      {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
    </button>
  )
}

/** Logo del lloc, o la inicial sobre or suau quan no n'hi ha. */
function SiteAvatar({ site }: { site: SwitcherSite | null }) {
  if (site?.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- favicons/logos externs de mida fixa; next/image no aporta res aquí
      <img src={site.logo_url} alt="" className="h-7 w-7 shrink-0 rounded-lg border border-border bg-white object-contain p-0.5" />
    )
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-extrabold text-accent">
      {site ? site.name.trim().charAt(0).toUpperCase() || '?' : <Globe className="h-3.5 w-3.5" />}
    </span>
  )
}
