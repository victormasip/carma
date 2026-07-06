'use client'

// Selector de llocs del sidebar (patró popover Vercel/Linear) — substitueix la
// llista plana que feia scroll infinit amb dotzenes de llocs (agències).
//
//   · Disparador compacte: el lloc ACTIU (logo + nom + subdomini) o el recompte
//     total quan no n'hi ha cap d'actiu.
//   · Popover amb cerca auto-enfocada (sense accents, multi-terme), grup de
//     "Recents" (localStorage), llista completa en un contenidor d'alçada fixa
//     (max-h-64) i una fila d'accions enganxada a sota.
//   · Accions HONESTES per pla (2026-07-06): si el pla permet més llocs
//     (SITE_LIMITS), "Clona un nou lloc" hi porta de debò; si no, l'acció útil
//     és "Canvia el disseny" (Tema) + una invitació suau a pujar de pla — mai
//     un enllaç que rebota.
//   · Teclat: ↑/↓ per moure't, Enter per obrir, Escape per tancar.
//
// El lloc actiu es deriva del pathname (/dashboard/sites/[id] o /edit/[id]) —
// zero estat duplicat; navegar JA és seleccionar.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Clock, Crown, Globe, Palette, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/LocaleProvider'
import { SITE_LIMITS, type KarmaPlan } from '@/lib/karma/config'

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

export default function SiteSwitcher({ sites, isSuperAdmin, plan = 'free' }: {
  sites: SwitcherSite[]
  isSuperAdmin: boolean
  plan?: KarmaPlan
}) {
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

  // El pla mana: pots crear un lloc més? (superadmin sempre; la resta pel límit)
  const canCreate = isSuperAdmin || sites.length < SITE_LIMITS[plan]
  const designHref = `/dashboard/sites/${(active ?? sites[0]).id}?tab=tema`

  return (
    <div ref={rootRef} className="relative">
      {/* ── Disparador compacte ── */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-200',
          open
            ? 'border-accent/45 bg-surface-hover shadow-[0_0_16px_-7px_rgba(245,188,0,0.55)]'
            : 'border-border bg-bg-elevated hover:border-accent/35 hover:bg-surface-hover hover:shadow-[0_0_14px_-7px_rgba(245,188,0,0.45)]',
        )}
      >
        <SiteAvatar site={active} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold leading-tight text-text">
            {active ? active.name : (isSuperAdmin ? t('nav.allSites') : t('nav.yourSites'))}
          </span>
          <span className="block truncate text-[11px] leading-tight text-subtle">
            {active
              ? (active.subdomain || `${sites.length} ${sites.length === 1 ? 'lloc' : 'llocs'}`)
              : `${sites.length} ${sites.length === 1 ? 'lloc' : 'llocs'}`}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-muted" />
      </button>

      {/* ── Popover ── */}
      {open && (
        <div
          className="absolute -left-0.5 -right-0.5 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-premium"
          role="listbox"
          onKeyDown={onKey}
          style={{ animation: 'toast-in 0.22s cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          {/* Cerca */}
          <div className="relative border-b border-border bg-surface-subtle/60">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
              placeholder="Cerca un lloc…"
              className="w-full bg-transparent py-2.5 pl-10 pr-3 text-sm text-text outline-none placeholder:text-subtle"
            />
          </div>

          {/* Llista (recents + tots) — alçada fixa, MAI creix amb el compte */}
          <div ref={listRef} className="max-h-64 overflow-y-auto p-1.5">
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
              <div className="flex flex-col items-center gap-2 px-3 py-7 text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-subtle text-subtle"><Search className="h-4 w-4" /></span>
                <p className="text-sm text-muted">Cap lloc amb «{query}»</p>
              </div>
            )}
          </div>

          {/* Accions ràpides — enganxades a sota, honestes segons el pla */}
          <div className="space-y-0.5 border-t border-border bg-surface-subtle/60 p-1.5">
            {canCreate ? (
              <Link
                href="/benvinguda"
                onClick={() => setOpen(false)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted no-underline transition-colors hover:bg-surface-hover hover:text-text"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-border-strong text-subtle">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                Clona un nou lloc
              </Link>
            ) : (
              <>
                <Link
                  href={designHref}
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted no-underline transition-colors hover:bg-surface-hover hover:text-text"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Palette className="h-3.5 w-3.5" />
                  </span>
                  Canvia el disseny del blog
                </Link>
                <Link
                  href="/dashboard/karma"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted no-underline transition-colors hover:bg-surface-hover hover:text-text"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-on-accent">
                    <Crown className="h-3.5 w-3.5" />
                  </span>
                  Més blogs? Puja de pla
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function GroupLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-subtle">
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
        isActive && 'bg-accent-soft/60',
      )}
    >
      <SiteAvatar site={site} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm leading-tight', isActive ? 'font-bold text-accent' : 'font-medium text-text')}>
          {site.name}
        </span>
        {site.subdomain && <span className="block truncate text-[11px] leading-tight text-subtle">{site.subdomain}</span>}
      </span>
      {isActive && (
        <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </span>
      )}
    </button>
  )
}

/** Logo del lloc, o la inicial sobre or suau quan no n'hi ha. */
function SiteAvatar({ site, size = 'sm' }: { site: SwitcherSite | null; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-8 w-8' : 'h-7 w-7'
  if (site?.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- favicons/logos externs de mida fixa; next/image no aporta res aquí
      <img src={site.logo_url} alt="" className={cn(box, 'shrink-0 rounded-lg border border-border bg-white object-contain p-0.5 shadow-sm')} />
    )
  }
  return (
    <span className={cn(box, 'flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#ffd769] to-[#e6ad00] text-xs font-extrabold text-[#1a1400] shadow-sm')}>
      {site ? site.name.trim().charAt(0).toUpperCase() || '?' : <Globe className="h-3.5 w-3.5" />}
    </span>
  )
}
