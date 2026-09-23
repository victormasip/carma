'use client'

// W5 — AND WHAT WE'D BUILD. The right half of the Door's reveal.
//
// Three LIVE blogs — the real renderer, fed each variant's genome, headlined by
// the three pitches — behind three tabs, plus a quiet line while the art director
// works in the background. All state lives in useProgressiveDesign; this file only
// draws it and reports what the frames did (loaded, faded in).
//
// Loaded on demand (next/dynamic from Door.tsx): a visitor who never gets a design
// reveal never downloads a byte of it.
//
// THE FRAMES. Each variant owns a slot; the three slots are stacked in one stage
// and only the open tab's is visible, so switching tabs is instant after the first
// load. Inside a slot, pages form a stack (see FrameLayer): when the art director's
// version arrives it loads UNDER the current page, takes over its scroll position,
// then fades in over it. The visitor sees their blog get better, not reload.

import { useRef, useState, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { REVEAL_ORDER, type RevealVariant, type RevealVariantName } from '@/lib/design/revealTypes'
import type { ProgressiveDesign } from './useProgressiveDesign'
import type { LandingCopy } from './copy'
import { cn } from '@/lib/cn'

/** How long a replaced page stays underneath while the new one fades in. */
const FADE_MS = 480

export default function DesignReveal({ c, pd }: { c: LandingCopy['door']; pd: ProgressiveDesign }) {
  const { design, active, phase, frames } = pd.state
  // The other two tabs start loading once the open one has painted — never all
  // three at once, which would put three documents on the main thread together.
  const [warm, setWarm] = useState(false)
  const iframes = useRef(new Map<string, HTMLIFrameElement>())
  const tabs = useRef(new Map<RevealVariantName, HTMLButtonElement>())

  if (!design) return null
  const byName = Object.fromEntries(design.variants.map(v => [v.variant, v])) as Record<RevealVariantName, RevealVariant>
  const current = byName[active]

  const onLoaded = (variant: RevealVariantName, id: string) => {
    const stack = frames[variant]
    const idx = stack.findIndex(l => l.id === id)
    // Carry the reader's place across the swap: same-origin frames, so the new
    // page can be scrolled to wherever the old one was before it becomes visible.
    const below = idx > 0 ? iframes.current.get(`${variant}:${stack[idx - 1]!.id}`) : undefined
    const mine = iframes.current.get(`${variant}:${id}`)
    try {
      const y = below?.contentWindow?.scrollY ?? 0
      if (y > 0) mine?.contentWindow?.scrollTo(0, y)
    } catch { /* not ours to read — then it simply starts at the top */ }
    pd.loaded(variant, id)
    if (idx > 0) setTimeout(() => pd.retire(variant, id), FADE_MS + 60)
    setWarm(true)
  }

  // Tabs pattern: arrows move between tabs, focus follows selection.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = REVEAL_ORDER.indexOf(active)
    const next = e.key === 'ArrowRight' ? REVEAL_ORDER[(i + 1) % 3]
      : e.key === 'ArrowLeft' ? REVEAL_ORDER[(i + 2) % 3]
      : e.key === 'Home' ? REVEAL_ORDER[0]
      : e.key === 'End' ? REVEAL_ORDER[2]
      : null
    if (!next) return
    e.preventDefault()
    pd.choose(next)
    tabs.current.get(next)?.focus()
  }

  const ratio = design.advice ? design.advice.ratio.toFixed(1).replace('.', c.decimalMark) : ''
  const advice = design.advice && active === 'elevated'
    ? (design.advice.kind === 'body' ? c.adviceBody : c.adviceLink).replace('{n}', ratio)
    : null

  return (
    <section className="design-reveal min-w-0" aria-labelledby="design-reveal-title">
      <p id="design-reveal-title" className="font-display text-xl leading-tight text-text">{c.designTitle}</p>
      <p className="mt-1 text-sm text-muted">{c.designLead}</p>

      {/* ── The three designs ─────────────────────────────────────────────── */}
      <div role="tablist" aria-label={c.designTabs} onKeyDown={onKey} className="@container mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
        {REVEAL_ORDER.map(name => {
          const v = byName[name]
          const selected = name === active
          return (
            <button
              key={name}
              ref={el => { if (el) tabs.current.set(name, el); else tabs.current.delete(name) }}
              type="button"
              role="tab"
              id={`design-tab-${name}`}
              aria-selected={selected}
              aria-controls="design-stage"
              tabIndex={selected ? 0 : -1}
              onClick={() => pd.choose(name)}
              className={cn(
                'design-tab min-w-0 cursor-pointer rounded-2xl border px-2 py-2.5 text-left transition-colors sm:px-3',
                selected ? 'border-accent bg-accent-soft/60' : 'border-border bg-surface hover:border-accent/50',
              )}
            >
              {/* The name owns its line, and on a phone it scales with the tab row
                  (4cqi, capped at 13px). Measured: the longest label, "Reimaginado",
                  needs 93px at 15px; a tab offers ~83px at 390px and ~73px at 360px.
                  Beside the swatches it had been cut to "R…". */}
              <span className="block truncate text-[min(0.8125rem,4cqi)] font-extrabold text-text sm:text-sm">{c.variants[name].name}</span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5">
                <span className="flex shrink-0 -space-x-1" aria-hidden>
                  {v.swatches.map((col, i) => (
                    <span key={i} className="h-3 w-3 rounded-full border border-black/15" style={{ background: col }} />
                  ))}
                </span>
                <span className="truncate text-[0.7rem] font-semibold text-subtle">
                  {c.registers[v.register]} · {v.heading}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* ── The art director, working in the background ────────────────────
          Polite and small on purpose: the visitor is already looking at three
          finished designs. This line says they are about to get better — it is
          not a loading state, and it disappears without a word if they don't. */}
      <p className="mt-3 flex min-h-[1.5rem] items-center gap-2 text-xs font-semibold text-muted" aria-live="polite">
        {phase === 'polishing' && (
          <>
            <span className="knot-thinking inline-flex shrink-0"><EndlessKnot size={16} /></span>
            <span>{c.polishing}</span>
          </>
        )}
        {phase === 'polished' && (
          <>
            <Check className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={3} />
            <span>{c.polished}</span>
          </>
        )}
      </p>

      {/* ── The blog, live ────────────────────────────────────────────────── */}
      <div
        id="design-stage"
        role="tabpanel"
        aria-labelledby={`design-tab-${active}`}
        className="mt-1.5 overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
      >
        <div className="flex items-center gap-2 border-b border-border bg-bg-elevated px-3.5 py-2" aria-hidden>
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          </span>
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[0.66rem] font-extrabold uppercase tracking-[0.12em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {c.previewLabel}
          </span>
          <span className="truncate text-xs font-semibold text-subtle">{c.variants[active].name}</span>
        </div>
        <div className="design-stage relative h-[460px] sm:h-[560px]">
          {REVEAL_ORDER.map(name => {
            const isActive = name === active
            if (!isActive && !warm) return null
            return (
              <div key={name} className="design-slot" data-active={isActive || undefined} aria-hidden={!isActive}>
                {frames[name].map((layer, i) => (
                  <iframe
                    key={layer.id}
                    ref={el => {
                      const k = `${name}:${layer.id}`
                      if (el) iframes.current.set(k, el); else iframes.current.delete(k)
                    }}
                    src={layer.src}
                    title={c.previewTitle.replace('{name}', c.variants[name].name)}
                    className="design-frame"
                    // A replacement waits invisible until it has painted; the page
                    // under it stays on screen meanwhile. The first never waits.
                    data-pending={(i > 0 && !layer.shown) || undefined}
                    tabIndex={isActive ? 0 : -1}
                    loading="eager"
                    // Same-origin so the reader's scroll position can follow the
                    // swap; every link inside is inert (see previewGuard).
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={() => onLoaded(name, layer.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Why this one ──────────────────────────────────────────────────── */}
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {current.why
          ? <><span className="font-bold text-text">{c.directorSays}: </span>{current.why}</>
          : c.variants[active].line}
      </p>
      <p className="mt-1 text-xs font-semibold text-subtle">
        {current.heading}{current.body !== current.heading ? ` + ${current.body}` : ''}
      </p>
      {advice && (
        <p className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/40 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-text">
          {advice}
        </p>
      )}
    </section>
  )
}
