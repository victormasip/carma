'use client'

// "Choose your blog layout" — the onboarding step shown right after the clone
// (and any WordPress import). It offers 6 structural feed layouts as TRUE live
// previews: each card is a scaled iframe of the real /render of THIS site with a
// candidate `?feed=` override, so the user sees their own cloned brand (colours +
// fonts) in every layout. Picking one writes `feedLayout` into the live Theme
// Studio state, which autosaves — no extra round-trip.

import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, Check, ArrowRight, X } from 'lucide-react'
import { FEED_LAYOUTS } from '@/lib/render/feedLayouts'
import type { FeedLayout } from '@/lib/scrape/tokens'
import { useThemeStudio } from './ThemeStudioContext'
import Button from '@/components/ui/Button'

export default function FeedLayoutPicker({ onDone }: { onDone: () => void }) {
  const { tokens, setToken } = useThemeStudio()
  const current = (tokens.feedLayout ?? 'standard') as FeedLayout
  const [picked, setPicked] = useState<FeedLayout>(current)

  const choose = (id: FeedLayout) => {
    setPicked(id)
    setToken('feedLayout', id) // autosaves via the studio debounce
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="min-h-full flex flex-col items-center px-5 py-12">
        <div className="w-full max-w-6xl">
          <div className="flex justify-end mb-2">
            <button
              onClick={onDone}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-subtle hover:text-text hover:bg-surface-hover rounded-lg transition-colors"
            >
              Ho decidiré després <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-center mb-9">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-soft text-accent text-xs font-semibold uppercase tracking-wider mb-4">
              <LayoutGrid className="w-3.5 h-3.5" /> Disseny del blog
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold text-text tracking-tight">Tria com es veu el teu blog</h1>
            <p className="text-sm text-muted mt-3 max-w-2xl mx-auto leading-relaxed">
              Aquests dissenys només canvien la <strong className="text-text font-semibold">disposició</strong> dels articles.
              Els <strong className="text-text font-semibold">colors</strong> i les <strong className="text-text font-semibold">tipografies</strong> de la teva marca clonada es mantenen intactes.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEED_LAYOUTS.map(l => (
              <LayoutCard
                key={l.id}
                id={l.id}
                name={l.name}
                tagline={l.tagline}
                active={picked === l.id}
                onPick={() => choose(l.id)}
              />
            ))}
          </div>

          <div className="mt-9 flex justify-center">
            <Button glow onClick={onDone} size="lg" iconRight={<ArrowRight className="w-4 h-4" />}>
              Continuar al meu blog
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LayoutCard({
  id, name, tagline, active, onPick,
}: {
  id: FeedLayout
  name: string
  tagline: string
  active: boolean
  onPick: () => void
}) {
  const { siteId, savedAt } = useThemeStudio()
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`group relative text-left bg-surface border rounded-2xl overflow-hidden transition-all flex flex-col cursor-pointer ${
        active
          ? 'border-accent ring-2 ring-accent/30 shadow-pop -translate-y-0.5'
          : 'border-border shadow-card hover:border-border-strong hover:shadow-pop hover:-translate-y-0.5'
      }`}
    >
      <LayoutPreview siteId={siteId} feed={id} savedAt={savedAt} active={active} />

      {/* Selected badge — a clear gold check on the preview corner, far more
          legible than a small inline radio. */}
      <span
        className={`absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-all ${
          active ? 'bg-accent text-on-accent scale-100 opacity-100' : 'bg-bg-elevated/90 text-subtle scale-90 opacity-0 group-hover:opacity-100'
        }`}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>

      <div className="p-4">
        <h3 className={`text-sm font-bold ${active ? 'text-accent' : 'text-text'}`}>{name}</h3>
        <p className="text-xs text-muted mt-1 leading-relaxed">{tagline}</p>
      </div>
    </button>
  )
}

// A scaled live iframe of the real render with the candidate layout override.
// Loads behind a shimmer skeleton and fades in once ready, so a slow/empty
// first render (6 frames mount at once on a fresh clone) never reads as broken.
function LayoutPreview({ siteId, feed, savedAt, active }: { siteId: string; feed: string; savedAt: number; active: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.34)
  const [loaded, setLoaded] = useState(false)
  const DESIGN_W = 1280
  const DESIGN_H = 720

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / DESIGN_W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // `preview=1` skips analytics; `r=savedAt` reloads once the captured theme is
  // persisted so the preview shows the real cloned brand, not the pre-capture base.
  const src = `/render/${siteId}?feed=${encodeURIComponent(feed)}&preview=1&r=${savedAt}`
  return (
    <div
      ref={wrapRef}
      className={`relative w-full overflow-hidden border-b bg-surface-subtle transition-colors ${active ? 'border-accent/40' : 'border-border'}`}
      style={{ height: Math.round(DESIGN_H * scale) }}
    >
      {/* Shimmer skeleton until the frame paints. */}
      <div className={`skeleton absolute inset-0 transition-opacity duration-500 ${loaded ? 'opacity-0' : 'opacity-100'}`} aria-hidden />

      <iframe
        key={src}
        src={src}
        title={`Vista prèvia · ${feed}`}
        loading="lazy"
        scrolling="no"
        tabIndex={-1}
        aria-hidden
        onLoad={() => setLoaded(true)}
        className={`transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
    </div>
  )
}
