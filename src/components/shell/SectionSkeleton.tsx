/**
 * Content-area skeletons for dashboard route transitions (Super MVP Fase 3).
 *
 * THE PROBLEM THESE REPLACE
 * ─────────────────────────
 * Every dashboard segment had a `loading.tsx` rendering `RouteLoader` — a
 * `fixed inset-0 z-20 bg-bg` OPAQUE FULL-VIEWPORT OVERLAY. Fourteen of them. So
 * every route change blanked the whole content area behind a gold knot, whether
 * the data behind it was 40ms or 4s away. That is what "the loading screens last
 * too long" actually was: not a slow query, a blunt fallback.
 *
 * THE MODEL NOW (three tiers)
 * ───────────────────────────
 *   · INSTANT   the PPR static shell — sidebar, header, card frames — paints
 *               immediately, with no fallback at all.
 *   · SKELETON  this file. A shape that matches the page about to arrive, INSIDE
 *               the content column. The sidebar never flickers, because it is
 *               never covered.
 *   · CEREMONY  RouteLoader survives for the two places where the wait IS the
 *               product: the fullscreen Studio boot and the Magic Wand capture.
 *
 * All motion is the shared `.skeleton` sweep (a compositor-only transform on a
 * pseudo-element), which respects the global reduced-motion policy.
 */

type Props = {
  /** Show the page-header block (title + subtitle + action). Default true. */
  header?: boolean
  /** Body shape. Pick the one that matches the real page. */
  variant?: 'bento' | 'list' | 'form' | 'split'
}

export default function SectionSkeleton({ header = true, variant = 'bento' }: Props) {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregant…</span>
      {header && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2.5">
            <div className="skeleton h-8 w-52 rounded-lg" aria-hidden />
            <div className="skeleton h-4 w-72 rounded" aria-hidden />
          </div>
          <div className="skeleton h-10 w-36 rounded-xl" aria-hidden />
        </div>
      )}
      {variant === 'bento' && <BentoBody />}
      {variant === 'list' && <ListBody />}
      {variant === 'form' && <FormBody />}
      {variant === 'split' && <SplitBody />}
    </div>
  )
}

/** Metric strip + card grid — the dashboard home and site detail. */
function BentoBody() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="skeleton col-span-2 h-[168px] rounded-2xl" aria-hidden />
        <div className="skeleton h-[168px] rounded-2xl" aria-hidden />
        <div className="skeleton h-[168px] rounded-2xl" aria-hidden />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-44 rounded-2xl" aria-hidden />)}
      </div>
    </>
  )
}

/** Stacked rows — users, articles, the karma ledger. */
function ListBody() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className="skeleton h-[72px] rounded-2xl" aria-hidden />
      ))}
    </div>
  )
}

/** Labelled fields in a card — settings. */
function FormBody() {
  return (
    <div className="max-w-2xl space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-card">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-3.5 w-32 rounded" aria-hidden />
          <div className="skeleton h-11 w-full rounded-xl" aria-hidden />
        </div>
      ))}
      <div className="skeleton h-11 w-40 rounded-xl" aria-hidden />
    </div>
  )
}

/** A wide primary panel beside a narrow rail — the agent console. */
function SplitBody() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="skeleton h-[420px] rounded-2xl" aria-hidden />
      <div className="space-y-4">
        <div className="skeleton h-40 rounded-2xl" aria-hidden />
        <div className="skeleton h-56 rounded-2xl" aria-hidden />
      </div>
    </div>
  )
}
