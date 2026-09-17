'use client'

// SCENE 5 — THE STUDIO. The real one, full width, on the landing page.
//
// Four rounds to get here. Three toggles under a picture; then a small mock you
// could recolour; then a real-website demo in a narrow column with a sidebar;
// then the centred, full-width page this file draws. The founder's notes, in
// order: "no funciona", "no tan petitet i limitat", "ha d'estar centrat i ocupar
// tot… eliminar lo de la floristeria, web real no serveix de res", and now
// (2026-09-17) "make the interactive Studio richer. Add more toggles, make the
// other template archetypes modifiable, and use realistic stock images instead
// of basic placeholders."
//
// THE THREE THINGS THAT CHANGED IN ROUND FOUR
//
// 1. THE ARCHETYPES ARE MODIFIABLE. Picking one used to set the look AND the
//    modules — and then the very next edit set `arch: ''`, which emptied the
//    module list, because "which modules are on" was derived from the archetype
//    name rather than stored. So the moment you touched anything, half the page
//    vanished and the demo became the plain blog again. Modules are now their
//    own state: an archetype SEEDS them, and after that every one of them is a
//    switch you can flip. That is what an archetype is in the product, too.
//
// 2. REAL PHOTOGRAPHS. Eight CSS gradients were the last obviously-fake thing
//    on this page. They are now eight real photos, vendored into /public and
//    re-encoded to ~20 KB apiece (scripts/fetch-studio-photos.mjs), lazy — with
//    the old gradient kept underneath each one as the loading tint and the
//    offline fallback.
//
// 3. THE PAGE PAINTS ITS OWN COLOURS. It used to borrow Carma's semantic
//    classes (bg-surface, text-text, border-border), so "your blog" was always
//    wearing our theme — and a dark/light switch would have been a no-op. Every
//    surface now comes from a GROUND, which the visitor can flip.
//
// TWO IMPLEMENTATION NOTES THAT STILL MATTER
//
// 1. Text editing is an inline <input>/<textarea>, NOT contentEditable. React
//    reconciling children around a live caret drops characters; an input that
//    inherits the font is visually identical and simply does not.
// 2. The saved document is read through `useSyncExternalStore`, never an effect
//    that calls setState — localStorage IS external state.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, PenLine, RotateCcw, Pointer, ChevronUp } from 'lucide-react'
import type { LandingCopy } from './copy'
import { cn } from '@/lib/cn'

// v5: `mods` (the editable module set) and `dark`/`wide` did not exist in v4, and
// a v4 document rehydrated into this shape would come back with no modules at
// all — the exact bug this round exists to kill.
const STORE_KEY = 'carma.studio.demo.v5'

const SWATCHES = ['#f5bc00', '#be873d', '#2f6f5e', '#c2410c', '#1e3a8a', '#7c2d63'] as const

/** The vendored WebPs are all 520 x 325 (scripts/fetch-studio-photos.mjs). */
const IMG_W = 520
const IMG_H = 325

/**
 * The eight photographs.
 *
 * `tint` is not decoration: it is what the box is painted while the WebP is
 * still arriving, what it stays if the file 404s, and what a printed page shows.
 * Each one is sampled from its photo, so the swap is a sharpening rather than a
 * flash of a different colour.
 */
const IMAGES = [
  { src: '/studio/taula.webp',      tint: 'linear-gradient(135deg,#c9a06a,#6b4a2f)' },
  { src: '/studio/botiga.webp',     tint: 'linear-gradient(135deg,#cfd8dc,#8d9aa3)' },
  { src: '/studio/taller.webp',     tint: 'linear-gradient(135deg,#d8c3a5,#8a7256)' },
  { src: '/studio/equip.webp',      tint: 'linear-gradient(135deg,#dfe7ef,#9aa8b8)' },
  { src: '/studio/plat.webp',       tint: 'linear-gradient(135deg,#efd9b4,#a97f4f)' },
  { src: '/studio/oficina.webp',    tint: 'linear-gradient(135deg,#e6eaed,#97a3ad)' },
  { src: '/studio/edifici.webp',    tint: 'linear-gradient(135deg,#dcd6cc,#7d766c)' },
  { src: '/studio/escriptori.webp', tint: 'linear-gradient(135deg,#e8e2d8,#8e8578)' },
] as const

/** Every module the demo can actually DRAW. A switch that changes nothing on the
 *  page would be worse than no switch, so this list and the JSX below move
 *  together — nothing is offered here that the page does not render. */
const MODULE_IDS = [
  'announcementBar', 'featuredHero', 'search', 'categoryFilters', 'readingProgress',
  'tableOfContents', 'keyTakeaways', 'pullQuote', 'paywall',
  'authorCard', 'socialShare', 'whatsappShare', 'likes',
  'relatedPosts', 'readNext', 'prevNext', 'comments', 'newsletter', 'backToTop',
] as const

type Post = { title: string; excerpt: string; img: number }

/** Light and dark, as real palettes rather than two Tailwind classes. */
const GROUNDS = {
  light: { bg: '#ffffff', surface: '#fafaf9', text: '#1c1917', muted: '#6d655c', border: '#e7e5e4', subtle: '#a8a29e' },
  dark: { bg: '#0f0d0a', surface: '#181410', text: '#f7f3ea', muted: '#a8a096', border: '#2b251d', subtle: '#7d756a' },
} as const

/**
 * One archetype, flattened to exactly what this island needs to draw.
 *
 * Derived on the SERVER from `ARCHETYPES` + its template's real design tokens
 * (see LandingPage.tsx). The island must never import lib/render/archetypes
 * itself: that would pull templates.ts and the whole module registry into the
 * landing's client bundle for the sake of six colours.
 */
export type DemoArchetype = {
  id: 'essencial' | 'revista' | 'creador'
  name: string
  tier: 'free' | 'premium' | 'gold' | 'agency'
  accent: string
  serif: boolean
  round: number
  grid: boolean
  card: 'border' | 'shadow' | 'flat'
  /** Registry ids of the modules this archetype ships switched ON. */
  modules: string[]
}

type Doc = {
  /** Which archetype this started from, or '' once it stops matching one. */
  arch: string
  brand: string
  nav: string[]
  section: string
  posts: Post[]
  accent: string
  serif: boolean
  /** 0 = compact, 1 = default, 2 = generous. Drives type scale AND spacing. */
  scale: number
  round: number
  grid: boolean
  card: 'border' | 'shadow' | 'flat'
  centred: boolean
  /** NEW — the modules that are switched on. Seeded by an archetype, then owned
   *  by the visitor. This is the whole "make the archetypes modifiable" fix. */
  mods: string[]
  dark: boolean
  wide: boolean
}

function baseDoc(c: LandingCopy['estudi'], first?: DemoArchetype): Doc {
  return {
    arch: first?.id ?? '',
    brand: c.demoBrand,
    nav: c.demoNav,
    section: c.demoSection,
    posts: c.demoPosts.map((p, i) => ({ title: p.title, excerpt: p.excerpt, img: i })),
    accent: first?.accent ?? SWATCHES[0],
    serif: first?.serif ?? true,
    scale: 1,
    round: first?.round ?? 14,
    grid: first?.grid ?? true,
    card: first?.card ?? 'border',
    centred: false,
    mods: first?.modules.filter(m => (MODULE_IDS as readonly string[]).includes(m)) ?? [],
    dark: false,
    wide: true,
  }
}

/* ── The saved document, as a real external store ─────────────────────────── */

let cache: Doc | undefined
const listeners = new Set<() => void>()

function readDoc(fallback: Doc): Doc {
  if (cache !== undefined) return cache
  let next = fallback
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const o = JSON.parse(raw) as Partial<Doc>
      const num = (v: unknown, lo: number, hi: number, d: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d
      next = {
        arch: typeof o.arch === 'string' ? o.arch.slice(0, 20) : fallback.arch,
        brand: typeof o.brand === 'string' ? o.brand.slice(0, 60) : fallback.brand,
        nav: Array.isArray(o.nav) ? o.nav.filter(x => typeof x === 'string').slice(0, 4) : fallback.nav,
        section: typeof o.section === 'string' ? o.section.slice(0, 60) : fallback.section,
        posts: Array.isArray(o.posts) && o.posts.length === 3
          ? o.posts.map((raw2, i) => {
              const q = (raw2 ?? {}) as Partial<Post>
              return {
                title: typeof q.title === 'string' ? q.title.slice(0, 120) : fallback.posts[i]!.title,
                excerpt: typeof q.excerpt === 'string' ? q.excerpt.slice(0, 220) : fallback.posts[i]!.excerpt,
                img: num(q.img, 0, IMAGES.length - 1, i),
              }
            })
          : fallback.posts,
        accent: typeof o.accent === 'string' ? o.accent : fallback.accent,
        serif: typeof o.serif === 'boolean' ? o.serif : fallback.serif,
        scale: num(o.scale, 0, 2, fallback.scale),
        round: num(o.round, 0, 26, fallback.round),
        grid: typeof o.grid === 'boolean' ? o.grid : fallback.grid,
        card: o.card === 'shadow' || o.card === 'flat' ? o.card : fallback.card,
        centred: typeof o.centred === 'boolean' ? o.centred : fallback.centred,
        // Unknown ids are dropped rather than trusted: this array drives which
        // branches render, and it comes back from a store the page does not own.
        mods: Array.isArray(o.mods)
          ? o.mods.filter((m): m is string => typeof m === 'string' && (MODULE_IDS as readonly string[]).includes(m))
          : fallback.mods,
        dark: typeof o.dark === 'boolean' ? o.dark : fallback.dark,
        wide: typeof o.wide === 'boolean' ? o.wide : fallback.wide,
      }
    }
  } catch { /* private mode or blocked storage: the demo just starts fresh */ }
  cache = next
  return cache
}

function subscribeDoc(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function writeDoc(next: Doc): void {
  cache = next
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* nothing to persist to */ }
  for (const fn of listeners) fn()
}

function clearDoc(fallback: Doc): void {
  cache = fallback
  try { localStorage.removeItem(STORE_KEY) } catch { /* already gone */ }
  for (const fn of listeners) fn()
}

/* ── Selection ────────────────────────────────────────────────────────────── */

type Sel =
  | { k: 'brand' }
  | { k: 'nav' }
  | { k: 'section' }
  | { k: 'title'; i: number }
  | { k: 'excerpt'; i: number }
  | { k: 'img'; i: number }
  | { k: 'page' }
  | null

export default function StudioDemo({ c, archetypes = [] }: {
  c: LandingCopy['estudi']
  /** The real ARCHETYPES, flattened server-side. Empty = no switcher. */
  archetypes?: DemoArchetype[]
}) {
  const fallbackRef = useRef<Doc | null>(null)
  if (fallbackRef.current === null) fallbackRef.current = baseDoc(c, archetypes[0])
  const fallback = fallbackRef.current

  const doc = useSyncExternalStore(subscribeDoc, () => readDoc(fallback), () => fallback)
  const [sel, setSel] = useState<Sel>(null)
  const [saved, setSaved] = useState(false)

  const mods = new Set(doc.mods)
  const has = (id: string) => mods.has(id)

  const edit = useCallback((patch: Partial<Doc>) => {
    // A manual edit means this is no longer a NAMED archetype — but it keeps
    // every module the archetype switched on, which is what makes it editable
    // rather than merely resettable. `arch` is a label, not the source of truth.
    const next = { ...readDoc(fallback), ...patch }
    if (!('arch' in patch)) next.arch = ''
    writeDoc(next)
    setSaved(true)
  }, [fallback])

  const toggleMod = useCallback((id: string) => {
    const cur = readDoc(fallback)
    const on = cur.mods.includes(id)
    writeDoc({
      ...cur,
      arch: '',
      mods: on ? cur.mods.filter(m => m !== id) : [...cur.mods, id],
    })
    setSaved(true)
  }, [fallback])

  const pickArchetype = useCallback((a: DemoArchetype) => {
    setSel(null)
    writeDoc({
      ...readDoc(fallback),
      arch: a.id, accent: a.accent, serif: a.serif,
      round: a.round, grid: a.grid, card: a.card,
      mods: a.modules.filter(m => (MODULE_IDS as readonly string[]).includes(m)),
    })
    setSaved(true)
  }, [fallback])

  const editPost = useCallback((i: number, patch: Partial<Post>) => {
    const cur = readDoc(fallback)
    writeDoc({ ...cur, posts: cur.posts.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
    setSaved(true)
  }, [fallback])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(t)
  }, [saved, doc])

  const face = doc.serif
    ? 'var(--font-fraunces), Georgia, serif'
    : 'var(--font-ubuntu), ui-sans-serif, system-ui, sans-serif'
  const radius = `${doc.round}px`
  const SCALE = [0.88, 1, 1.14][doc.scale] ?? 1
  const PAD = [0.75, 1, 1.4][doc.scale] ?? 1
  const g = doc.dark ? GROUNDS.dark : GROUNDS.light
  const is = (what: Sel) => JSON.stringify(sel) === JSON.stringify(what)

  const ring = (what: Sel) => cn(
    'cursor-pointer rounded-[6px] outline-2 outline-offset-4 transition-[outline-color] duration-150',
    is(what) ? 'outline outline-accent' : 'outline outline-transparent hover:outline-accent/40',
  )

  const cardStyle: React.CSSProperties =
    doc.card === 'shadow' ? { border: '1px solid transparent', boxShadow: '0 14px 36px -22px rgba(0,0,0,0.5)' }
    : doc.card === 'flat' ? { border: '1px solid transparent' }
    : { border: `1px solid ${g.border}` }

  const label =
    sel === null ? null
    : sel.k === 'brand' ? c.selBrand
    : sel.k === 'nav' ? c.selNav
    : sel.k === 'section' ? c.selSection
    : sel.k === 'title' ? c.selTitle
    : sel.k === 'excerpt' ? c.selExcerpt
    : sel.k === 'img' ? c.selImage
    : c.selPage

  /** Everything below the feed lives in the article region. */
  const section = (node: React.ReactNode) => (
    <div style={{ marginTop: `${1.3 * PAD}rem` }}>{node}</div>
  )

  return (
    <div className="relative">
      <div
        className="halo -inset-12 opacity-[0.1]"
        style={{ background: `radial-gradient(circle, ${doc.accent}, transparent 62%)` }}
        aria-hidden
      />

      {/* ══ THE ARCHETYPES ═══════════════════════════════════════════════════
          Not a theme picker. Each one switches the LOOK *and* seeds the modules
          that are on, so what the visitor sees below is the blog that arrives —
          the same three, from the same file, the dashboard applies. And then
          every part of it is theirs to change. */}
      {archetypes.length > 0 && (
        <div className="relative mb-5">
          <p className="text-center text-xs font-extrabold uppercase tracking-[0.16em] text-subtle">{c.arch.label}</p>
          <div className="mt-3 flex flex-wrap items-stretch justify-center gap-2.5">
            {archetypes.map(a => {
              const on = doc.arch === a.id
              const tier = a.tier === 'free' ? c.arch.tierFree : a.tier === 'premium' ? c.arch.tierPremium : c.arch.tierGold
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickArchetype(a)}
                  aria-pressed={on}
                  className={cn(
                    'group flex w-[15.5rem] max-w-full cursor-pointer flex-col gap-1 rounded-2xl border p-3.5 text-left transition-colors',
                    on ? 'border-accent bg-accent-soft/40' : 'border-border bg-bg-elevated hover:border-accent/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.accent }} aria-hidden />
                    <span className="text-sm font-extrabold text-text">{a.name}</span>
                    <span className={cn(
                      'ml-auto rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wider',
                      on ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-subtle',
                    )}>
                      {tier}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-muted">{c.arch.pitch[a.id]}</span>
                  <span className="text-[0.68rem] font-bold tabular-nums text-subtle">
                    {a.modules.length} {c.arch.mod.count}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-center text-xs text-subtle">{c.arch.note}</p>
        </div>
      )}

      {/* ══ THE MODULES — the archetype, opened up ═══════════════════════════
          This rail is the answer to "make the other archetypes modifiable". It
          is not a settings screen: it is nineteen switches, every one of which
          changes something you can see without scrolling to find it. */}
      <div className="relative mb-5 rounded-2xl border border-border bg-bg-elevated/70 p-4">
        <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-subtle">
            {c.modLabel}
            {!doc.arch && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-accent">{c.archCustom}</span>}
          </p>
          <p className="text-xs font-bold tabular-nums text-accent">{doc.mods.length} {c.modOn}</p>
        </div>
        <p className="mt-1 text-center text-xs text-subtle">{c.modHint}</p>

        <div className="mt-3.5 flex flex-wrap justify-center gap-1.5">
          {MODULE_IDS.map(id => {
            const on = has(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleMod(id)}
                aria-pressed={on}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-colors',
                  on
                    ? 'border-accent/50 bg-accent-soft text-accent'
                    : 'border-border bg-surface text-subtle hover:border-accent/30 hover:text-text',
                )}
              >
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-accent' : 'bg-border-strong')}
                  aria-hidden
                />
                {c.modNames[id] ?? id}
              </button>
            )
          })}
        </div>
      </div>

      {/* ══ THE PAGE — centred, full width, in ITS OWN colours ═══════════════ */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl shadow-2xl"
        style={{ border: `1px solid ${g.border}`, background: g.bg }}
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-2.5"
          style={{ borderColor: g.border, background: g.surface }}
        >
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span
            className="mx-auto truncate rounded-md px-3 py-0.5 text-[0.68rem] font-semibold"
            style={{ background: g.bg, color: g.subtle }}
          >
            {c.browserUrl}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wider transition-opacity duration-300',
              saved ? 'bg-success-soft text-success opacity-100' : 'opacity-0',
            )}
            aria-live="polite"
          >
            <Check className="h-3 w-3" strokeWidth={3} /> {c.saved}
          </span>
        </div>

        {/* announcementBar */}
        {has('announcementBar') && (
          <div
            className="flex items-center justify-center gap-2 px-4 py-2 text-[0.72rem] font-bold text-white"
            style={{ background: `linear-gradient(120deg, ${doc.accent}, ${doc.accent}cc)` }}
          >
            {c.arch.mod.announce}
          </div>
        )}

        {/* readingProgress */}
        {has('readingProgress') && (
          <div className="h-[3px] w-full" style={{ background: `${doc.accent}26` }} aria-hidden>
            <span className="block h-full w-1/3" style={{ background: doc.accent }} />
          </div>
        )}

        {/* header */}
        <div
          className="flex items-center gap-4 border-b"
          style={{ padding: `${0.9 * PAD}rem ${1.5 * PAD}rem`, borderColor: g.border }}
        >
          <Editable
            value={doc.brand}
            onCommit={v => edit({ brand: v || doc.brand })}
            what={{ k: 'brand' }}
            sel={sel}
            setSel={setSel}
            className="truncate font-bold"
            style={{ fontFamily: face, color: doc.accent, fontSize: `${1.25 * SCALE}rem` }}
          />
          <button
            type="button"
            onClick={() => setSel({ k: 'nav' })}
            className={cn(ring({ k: 'nav' }), 'ml-auto hidden gap-5 sm:flex')}
            aria-label={c.selNav}
          >
            {doc.nav.map(n => (
              <span key={n} className="whitespace-nowrap font-semibold" style={{ fontSize: `${0.9 * SCALE}rem`, color: g.muted }}>{n}</span>
            ))}
          </button>
        </div>

        {/* the blog */}
        <div
          className={cn('relative mx-auto', doc.centred && 'text-center')}
          style={{
            padding: `${1.6 * PAD}rem ${1.5 * PAD}rem`,
            maxWidth: doc.wide ? '100%' : '46rem',
            color: g.text,
          }}
        >
          <Editable
            value={doc.section}
            onCommit={v => edit({ section: v || doc.section })}
            what={{ k: 'section' }}
            sel={sel}
            setSel={setSel}
            className="font-extrabold tracking-tight"
            style={{ fontFamily: face, fontSize: `${1.9 * SCALE}rem`, color: g.text }}
          />

          {/* search */}
          {has('search') && (
            <div
              className="flex items-center gap-2 rounded-full px-3.5 py-2 text-left"
              style={{ marginTop: `${0.9 * PAD}rem`, borderRadius: radius, border: `1px solid ${g.border}`, background: g.surface }}
              aria-hidden
            >
              <span className="text-sm" style={{ color: g.subtle }}>⌕</span>
              <span style={{ fontSize: `${0.85 * SCALE}rem`, color: g.subtle }}>{c.arch.mod.search}</span>
            </div>
          )}

          {/* categoryFilters */}
          {has('categoryFilters') && (
            <div className="flex flex-wrap items-center gap-4 border-b" style={{ marginTop: `${0.9 * PAD}rem`, borderColor: g.border }} aria-hidden>
              {[c.arch.mod.all, ...doc.nav.slice(0, 2)].map((t, i) => (
                <span
                  key={t}
                  className="pb-2 text-xs font-bold"
                  style={{
                    color: i === 0 ? doc.accent : g.muted,
                    borderBottom: `2px solid ${i === 0 ? doc.accent : 'transparent'}`,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* featuredHero */}
          {has('featuredHero') && (
            <article
              className="flex flex-col overflow-hidden text-left sm:flex-row"
              style={{ ...cardStyle, borderRadius: radius, marginTop: `${1.1 * PAD}rem`, background: g.surface }}
            >
              <Photo i={doc.posts[0]!.img} className="aspect-[16/10] w-full shrink-0 sm:w-1/2" />
              <div className="flex min-w-0 flex-col justify-center gap-2" style={{ padding: `${1.1 * PAD}rem` }}>
                <span
                  className="w-fit rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wider text-white"
                  style={{ background: doc.accent }}
                >
                  {c.arch.mod.featured}
                </span>
                <p className="font-bold leading-snug" style={{ fontFamily: face, fontSize: `${1.35 * SCALE}rem`, color: g.text }}>
                  {doc.posts[0]!.title}
                </p>
                <p className="leading-relaxed" style={{ fontSize: `${0.9 * SCALE}rem`, color: g.muted }}>
                  {doc.posts[0]!.excerpt}
                </p>
              </div>
            </article>
          )}

          <div
            className={cn(doc.grid ? 'grid sm:grid-cols-3' : 'flex flex-col')}
            style={{ gap: `${1 * PAD}rem`, marginTop: `${1.4 * PAD}rem` }}
          >
            {doc.posts.map((post, i) => (
              <article
                key={i}
                className={cn('text-left', doc.grid ? 'overflow-hidden' : 'flex gap-4 overflow-hidden')}
                style={{ ...cardStyle, borderRadius: radius, background: g.surface }}
              >
                <button
                  type="button"
                  onClick={() => setSel({ k: 'img', i })}
                  aria-label={c.selImage}
                  className={cn(ring({ k: 'img', i }), doc.grid ? 'block w-full' : 'block w-32 shrink-0')}
                  style={{ borderRadius: `calc(${radius} - 2px)` }}
                >
                  <Photo i={post.img} className="aspect-[16/10] w-full" radius={`calc(${radius} - 2px)`} />
                </button>
                <div className="min-w-0 flex-1" style={{ padding: `${0.85 * PAD}rem` }}>
                  <Editable
                    value={post.title}
                    onCommit={v => editPost(i, { title: v || post.title })}
                    what={{ k: 'title', i }}
                    sel={sel}
                    setSel={setSel}
                    className="font-bold leading-snug"
                    style={{ fontFamily: face, fontSize: `${1.02 * SCALE}rem`, color: g.text }}
                  />
                  <Editable
                    value={post.excerpt}
                    onCommit={v => editPost(i, { excerpt: v || post.excerpt })}
                    what={{ k: 'excerpt', i }}
                    sel={sel}
                    setSel={setSel}
                    multiline
                    className="mt-1.5 leading-relaxed"
                    style={{ fontSize: `${0.86 * SCALE}rem`, color: g.muted }}
                  />
                </div>
              </article>
            ))}
          </div>

          {/* ── The article region: everything a reader meets INSIDE a post ── */}

          {/* tableOfContents */}
          {has('tableOfContents') && section(
            <div style={{ ...cardStyle, borderRadius: radius, background: g.surface, padding: `${0.95 * PAD}rem` }} aria-hidden>
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em]" style={{ color: doc.accent }}>
                {c.modNames.tableOfContents}
              </p>
              <ol className="mt-2 space-y-1.5 text-left">
                {doc.nav.slice(0, 3).map((n, i) => (
                  <li key={n} className="flex items-baseline gap-2" style={{ fontSize: `${0.82 * SCALE}rem`, color: i === 0 ? g.text : g.muted }}>
                    <span className="font-extrabold tabular-nums" style={{ color: doc.accent }}>{i + 1}</span>
                    <span className="font-medium">{n}</span>
                  </li>
                ))}
              </ol>
            </div>,
          )}

          {/* keyTakeaways */}
          {has('keyTakeaways') && section(
            <div
              style={{ borderRadius: radius, padding: `${1 * PAD}rem`, background: `${doc.accent}12`, border: `1px solid ${doc.accent}40` }}
              aria-hidden
            >
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em]" style={{ color: doc.accent }}>
                {c.modNames.keyTakeaways}
              </p>
              <ul className="mt-2 space-y-1.5 text-left">
                {doc.posts.map(p => (
                  <li key={p.title} className="flex items-start gap-2" style={{ fontSize: `${0.82 * SCALE}rem`, color: g.text }}>
                    <Check className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={3} style={{ color: doc.accent }} />
                    <span className="font-medium">{p.title}</span>
                  </li>
                ))}
              </ul>
            </div>,
          )}

          {/* pullQuote */}
          {has('pullQuote') && section(
            <blockquote
              className="text-left leading-snug"
              style={{
                fontFamily: face,
                fontSize: `${1.4 * SCALE}rem`,
                color: g.text,
                borderLeft: `3px solid ${doc.accent}`,
                paddingLeft: `${0.9 * PAD}rem`,
              }}
              aria-hidden
            >
              {doc.posts[0]!.excerpt}
            </blockquote>,
          )}

          {/* paywall */}
          {has('paywall') && section(
            <div
              className="p-4 text-center"
              style={{ borderRadius: radius, border: `1px dashed ${doc.accent}66`, background: `${doc.accent}0d` }}
              aria-hidden
            >
              <p className="text-xs font-semibold" style={{ color: g.muted }}>{c.arch.mod.locked}</p>
              <span
                className="mt-2.5 inline-block rounded-full px-3.5 py-1.5 text-[0.7rem] font-extrabold text-white"
                style={{ background: doc.accent }}
              >
                {c.arch.mod.unlock}
              </span>
            </div>,
          )}

          {/* authorCard */}
          {has('authorCard') && section(
            <div
              className="flex items-center gap-3 text-left"
              style={{ ...cardStyle, borderRadius: radius, background: g.surface, padding: `${0.85 * PAD}rem` }}
              aria-hidden
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                style={{ background: `${doc.accent}24`, color: doc.accent }}
              >
                {doc.brand.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold" style={{ fontSize: `${0.9 * SCALE}rem`, color: g.text, fontFamily: face }}>
                  {doc.brand}
                </span>
                <span className="block truncate" style={{ fontSize: `${0.78 * SCALE}rem`, color: g.muted }}>{doc.section}</span>
              </span>
            </div>,
          )}

          {/* socialShare + whatsappShare — one row when both are on */}
          {(has('socialShare') || has('whatsappShare')) && section(
            <div className={cn('flex flex-wrap items-center gap-2', doc.centred && 'justify-center')} aria-hidden>
              {has('socialShare') && ['X', 'in', 'f', '↗'].map(n => (
                <span
                  key={n}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[0.7rem] font-extrabold"
                  style={{ border: `1px solid ${g.border}`, color: g.muted, background: g.surface }}
                >
                  {n}
                </span>
              ))}
              {has('whatsappShare') && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1.5 text-[0.72rem] font-extrabold text-white">
                  WhatsApp
                </span>
              )}
            </div>,
          )}

          {/* likes */}
          {has('likes') && section(
            <div className={cn('flex', doc.centred && 'justify-center')} aria-hidden>
              <span
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold"
                style={{ borderColor: doc.accent, color: doc.accent, background: `${doc.accent}14` }}
              >
                <span>{has('comments') ? '👏' : '♥'}</span> {c.arch.mod.clap} <span className="tabular-nums opacity-70">27</span>
              </span>
            </div>,
          )}

          {/* relatedPosts */}
          {has('relatedPosts') && section(
            <div className="text-left" aria-hidden>
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em]" style={{ color: g.subtle }}>
                {c.modNames.relatedPosts}
              </p>
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                {doc.posts.map(p => (
                  <span
                    key={p.title}
                    className="block overflow-hidden"
                    style={{ ...cardStyle, borderRadius: radius, background: g.surface }}
                  >
                    <Photo i={p.img} className="aspect-[16/9] w-full" />
                    <span className="block p-2.5 text-[0.78rem] font-bold leading-snug" style={{ color: g.text, fontFamily: face }}>
                      {p.title}
                    </span>
                  </span>
                ))}
              </div>
            </div>,
          )}

          {/* readNext */}
          {has('readNext') && section(
            <div
              className="flex items-center gap-3 text-left"
              style={{ borderRadius: radius, background: `${doc.accent}0f`, border: `1px solid ${doc.accent}33`, padding: `${0.85 * PAD}rem` }}
              aria-hidden
            >
              <Photo i={doc.posts[1]!.img} className="h-12 w-16 shrink-0" radius={`calc(${radius} - 4px)`} />
              <span className="min-w-0">
                <span className="block text-[0.62rem] font-extrabold uppercase tracking-[0.14em]" style={{ color: doc.accent }}>
                  {c.modNames.readNext}
                </span>
                <span className="mt-0.5 block truncate font-bold" style={{ fontSize: `${0.88 * SCALE}rem`, color: g.text, fontFamily: face }}>
                  {doc.posts[1]!.title}
                </span>
              </span>
            </div>,
          )}

          {/* prevNext */}
          {has('prevNext') && section(
            <div className="flex items-center justify-between gap-3 text-left" aria-hidden>
              {[doc.posts[2]!, doc.posts[0]!].map((p, i) => (
                <span
                  key={i}
                  className={cn('min-w-0 flex-1', i === 1 && 'text-right')}
                  style={{ color: g.muted }}
                >
                  <span className="block text-[0.7rem] font-bold" style={{ color: doc.accent }}>{i === 0 ? '←' : '→'}</span>
                  <span className="block truncate text-[0.8rem] font-semibold" style={{ color: g.text }}>{p.title}</span>
                </span>
              ))}
            </div>,
          )}

          {/* comments */}
          {has('comments') && section(
            <div className="border-t pt-5 text-left" style={{ borderColor: g.border }} aria-hidden>
              <p className="font-bold" style={{ fontFamily: face, fontSize: `${1.05 * SCALE}rem`, color: g.text }}>
                {c.arch.mod.comments} <span className="font-semibold" style={{ color: g.subtle }}>3</span>
              </p>
              <div
                className="mt-3 flex items-start gap-3"
                style={{ ...cardStyle, borderRadius: radius, background: g.surface, padding: `${0.85 * PAD}rem` }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-extrabold"
                  style={{ background: `${doc.accent}24`, color: doc.accent }}
                >
                  MT
                </span>
                <p className="leading-relaxed" style={{ fontSize: `${0.85 * SCALE}rem`, color: g.muted }}>
                  {c.arch.mod.commentBody}
                </p>
              </div>
            </div>,
          )}

          {/* newsletter */}
          {has('newsletter') && section(
            <div
              className="text-left"
              style={{ ...cardStyle, borderRadius: radius, background: g.surface, padding: `${1.2 * PAD}rem` }}
              aria-hidden
            >
              <p className="font-bold" style={{ fontFamily: face, fontSize: `${1.05 * SCALE}rem`, color: g.text }}>
                {c.arch.mod.newsTitle}
              </p>
              <p className="mt-1 leading-relaxed" style={{ fontSize: `${0.85 * SCALE}rem`, color: g.muted }}>
                {c.arch.mod.newsBody}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className="flex-1 basis-40 px-3 py-2 text-xs"
                  style={{ borderRadius: `calc(${radius} - 4px)`, border: `1px solid ${g.border}`, background: g.bg, color: g.subtle }}
                >
                  {c.arch.mod.newsEmail}
                </span>
                <span
                  className="px-4 py-2 text-xs font-extrabold text-white"
                  style={{ background: doc.accent, borderRadius: `calc(${radius} - 4px)` }}
                >
                  {c.arch.mod.newsCta}
                </span>
              </div>
            </div>,
          )}

          <button
            type="button"
            onClick={() => setSel({ k: 'page' })}
            className="mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold text-white"
            style={{ background: doc.accent, boxShadow: `0 10px 24px -8px ${doc.accent}` }}
          >
            <PenLine className="h-3 w-3" /> {c.cta}
          </button>

          {/* backToTop — floating, inside the frame where it belongs */}
          {has('backToTop') && (
            <span
              className="pointer-events-none absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full shadow-lg"
              style={{ background: doc.accent }}
              aria-hidden
            >
              <ChevronUp className="h-4 w-4 text-white" strokeWidth={3} />
            </span>
          )}
        </div>
      </div>

      {/* ══ THE FLOATING TOOLBAR — only the selection's controls ═════════════
          Sticky at the bottom of the viewport while the section is on screen,
          which is where the real Studio puts it. */}
      <div className="sticky bottom-4 z-20 mt-5 flex justify-center px-2">
        <div className="flex max-w-full flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-border bg-bg-elevated/95 px-4 py-3 shadow-pop backdrop-blur-xl">
          {sel === null ? (
            <p className="inline-flex items-center gap-2 text-sm font-medium text-muted">
              <Pointer className="h-4 w-4 text-accent" />
              {c.selectHint}
              <button
                type="button"
                onClick={() => setSel({ k: 'page' })}
                className="cursor-pointer font-bold text-accent underline underline-offset-2"
              >
                {c.selPage}
              </button>
            </p>
          ) : (
            <>
              <span className="text-xs font-extrabold uppercase tracking-wider text-accent">{label}</span>

              {(sel.k === 'brand' || sel.k === 'section' || sel.k === 'title' || sel.k === 'excerpt') && (
                <span className="text-xs font-medium text-subtle">{c.editHint}</span>
              )}

              {(sel.k === 'brand' || sel.k === 'nav' || sel.k === 'page') && (
                <Field label={c.colorLabel}>
                  <div className="flex gap-1.5">
                    {SWATCHES.map(sw => (
                      <button
                        key={sw}
                        onClick={() => edit({ accent: sw })}
                        aria-label={sw}
                        aria-pressed={doc.accent === sw}
                        className={cn(
                          'h-6 w-6 cursor-pointer rounded-full border-2 transition-transform',
                          doc.accent === sw ? 'scale-110 border-text' : 'border-transparent hover:scale-105',
                        )}
                        style={{ background: sw }}
                      />
                    ))}
                  </div>
                </Field>
              )}

              {(sel.k === 'brand' || sel.k === 'section' || sel.k === 'title' || sel.k === 'page') && (
                <Field label={c.fontLabel}>
                  <Seg options={[[true, c.fontSerif], [false, c.fontSans]]} value={doc.serif} set={v => edit({ serif: v })} />
                </Field>
              )}

              {sel.k === 'img' && (
                <Field label={c.imageLabel}>
                  <div className="flex gap-1.5">
                    {IMAGES.map((img, gi) => (
                      <button
                        key={img.src}
                        onClick={() => editPost(sel.i, { img: gi })}
                        aria-label={`${c.selImage} ${gi + 1}`}
                        aria-pressed={doc.posts[sel.i]!.img === gi}
                        className={cn(
                          'h-7 w-9 cursor-pointer overflow-hidden rounded-md border-2 transition-transform',
                          doc.posts[sel.i]!.img === gi ? 'scale-105 border-accent' : 'border-transparent hover:scale-105',
                        )}
                        style={{ background: img.tint }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt="" width={36} height={28} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {sel.k === 'page' && (
                <>
                  <Field label={c.groundLabel}>
                    <Seg options={[[false, c.groundLight], [true, c.groundDark]]} value={doc.dark} set={v => edit({ dark: v })} />
                  </Field>
                  <Field label={c.widthLabel}>
                    <Seg options={[[false, c.widthNarrow], [true, c.widthWide]]} value={doc.wide} set={v => edit({ wide: v })} />
                  </Field>
                  <Field label={c.layoutLabel}>
                    <Seg options={[[true, c.layoutGrid], [false, c.layoutList]]} value={doc.grid} set={v => edit({ grid: v })} />
                  </Field>
                  <Field label={c.sizeLabel}>
                    <Seg
                      options={[[0, c.sizeS], [1, c.sizeM], [2, c.sizeL]]}
                      value={doc.scale}
                      set={v => edit({ scale: v })}
                    />
                  </Field>
                  <Field label={c.cardLabel}>
                    <Seg
                      options={[['border', c.cardBorder], ['shadow', c.cardShadow], ['flat', c.cardFlat]]}
                      value={doc.card}
                      set={v => edit({ card: v })}
                    />
                  </Field>
                  <Field label={c.alignLabel}>
                    <Seg options={[[false, c.alignLeft], [true, c.alignCenter]]} value={doc.centred} set={v => edit({ centred: v })} />
                  </Field>
                  <Field label={c.radiusLabel}>
                    <input
                      type="range" min={0} max={26} step={2}
                      value={doc.round}
                      onChange={e => edit({ round: Number(e.target.value) })}
                      aria-label={c.radiusLabel}
                      className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-border accent-accent"
                    />
                  </Field>
                </>
              )}

              <button
                type="button"
                onClick={() => setSel(null)}
                className="cursor-pointer text-xs font-semibold text-subtle hover:text-text"
              >
                {c.done}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => { clearDoc(fallback); setSel(null); setSaved(false) }}
            className="inline-flex cursor-pointer items-center gap-1.5 border-l border-border pl-4 text-xs font-semibold text-subtle transition-colors hover:text-text"
          >
            <RotateCcw className="h-3 w-3" /> {c.reset}
          </button>
        </div>
      </div>

      <p className="mt-3 text-center text-xs font-medium text-subtle">{c.persistNote}</p>
    </div>
  )
}

/**
 * One photograph.
 *
 * The tint is painted on the WRAPPER and the photo sits on top of it, so the box
 * is the right colour before the WebP arrives, stays the right colour if it
 * never does (an offline preview, a blocked request), and never flashes white.
 * `loading="lazy"` because the Studio is four screens down; `aria-hidden`
 * because these are illustrations of a fictional blog, not content.
 */
function Photo({ i, className, radius }: { i: number; className?: string; radius?: string }) {
  const img = IMAGES[i] ?? IMAGES[0]
  return (
    <span
      className={cn('relative block overflow-hidden', className)}
      style={{ background: img.tint, borderRadius: radius }}
      aria-hidden
    >
      {/* The intrinsic size of the vendored WebP. The wrapper's aspect-ratio
          already reserves the box, so width/height change no layout here — they
          are what stops a reflow if a style ever fails to apply, and what the
          landing gate checks for. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.src}
        alt=""
        width={IMG_W}
        height={IMG_H}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-[0.66rem] font-extrabold uppercase tracking-wider text-subtle">{label}</span>
      {children}
    </div>
  )
}

/** A generic segmented control — any value type, so one component covers them all. */
function Seg<T extends string | number | boolean>({ options, value, set }: {
  options: [T, string][]
  value: T
  set: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl border border-border p-0.5">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          onClick={() => set(v)}
          aria-pressed={value === v}
          className={cn(
            'cursor-pointer rounded-[10px] px-2.5 py-1 text-xs font-bold transition-colors',
            value === v ? 'bg-accent-soft text-accent' : 'text-subtle hover:text-text',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * An editable piece of the page.
 *
 * MODULE SCOPE, DELIBERATELY. Defined inside StudioDemo it would be a new type
 * on every render, so React would unmount and remount it — and an <input> that
 * remounts on every keystroke loses its caret to the end of the line.
 * react-hooks/static-components catches exactly this, and it was right.
 *
 * Not contentEditable either: React reconciling children around a live caret is
 * a well-known source of dropped characters. An input that inherits the font,
 * size and colour looks identical and simply does not have the problem.
 * ══════════════════════════════════════════════════════════════════════════ */

type EditableProps = {
  value: string
  onCommit: (v: string) => void
  what: Sel
  sel: Sel
  setSel: (s: Sel) => void
  multiline?: boolean
  className?: string
  style?: React.CSSProperties
}

function Editable({ value, onCommit, what, sel, setSel, multiline = false, className, style }: EditableProps) {
  const active = JSON.stringify(sel) === JSON.stringify(what)

  if (!active) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => setSel(what)}
        onKeyDown={e => { if (e.key === 'Enter') setSel(what) }}
        className={cn(
          'block cursor-pointer rounded-[6px] outline-2 outline-offset-4 outline-transparent transition-[outline-color] duration-150 hover:outline hover:outline-accent/40',
          className,
        )}
        style={style}
      >
        {value}
      </span>
    )
  }

  const shared = {
    autoFocus: true,
    // defaultValue, not value: while the caret is in here React must not be
    // rewriting the contents underneath it. The store is updated on blur.
    defaultValue: value,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => onCommit(e.currentTarget.value),
    className: cn('block w-full resize-none rounded-[6px] bg-accent-soft/50 outline outline-2 outline-accent', className),
    style,
  }

  return multiline
    ? <textarea {...shared} rows={2} onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur() }} />
    : <input {...shared} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} />
}
