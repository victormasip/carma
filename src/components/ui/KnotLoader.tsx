import { cn } from '@/lib/cn'
import { KNOT_PATH, KNOT_VIEWBOX } from './EndlessKnot'

/**
 * The single, premium loading state for the whole app: the Endless Knot drawing
 * itself in gold. A faint static knot outline acts as the "track", while a
 * gold-gradient strand traces the same outline via animated `stroke-dashoffset`
 * (normalised with `pathLength={100}`, so the maths is independent of the real
 * geometry), glowing as it goes. Use it for route transitions, AI waits and fetches.
 *
 * `tone="ink"` swaps the gold for `currentColor` — use it on gold surfaces (e.g.
 * the "Article SEO màgic" panel) where a gold-on-gold mark would vanish.
 *
 * Server-safe (no hooks) so it can be a `loading.tsx` / `<Suspense>` fallback.
 */
export default function KnotLoader({
  size = 76,
  label,
  className,
  tone = 'gold',
}: {
  size?: number
  label?: string
  className?: string
  tone?: 'gold' | 'ink'
}) {
  const ink = tone === 'ink'
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-5', ink && 'text-current', className)}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {/* Soft breathing gold halo behind the mark — a warm, larger wash that
            softly illuminates the loader's container as the strand draws (gold
            tone only). Two layers: a wide ambient bloom + a tighter core glow. */}
        {!ink && (
          <>
            <div
              aria-hidden
              className="knot-halo absolute -inset-5 -z-10 rounded-full bg-accent/25 blur-3xl"
            />
            <div
              aria-hidden
              className="knot-halo absolute -inset-1 -z-10 rounded-full bg-accent/20 blur-xl"
              style={{ animationDelay: '-1.2s' }}
            />
          </>
        )}
        <svg viewBox={KNOT_VIEWBOX} width={size} height={size} aria-hidden style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="carma-knot-loader" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a87f00" />
              <stop offset="30%" stopColor="#f5bc00" />
              <stop offset="50%" stopColor="#fff7d6" />
              <stop offset="70%" stopColor="#f5bc00" />
              <stop offset="100%" stopColor="#a87f00" />
            </linearGradient>
          </defs>
          {/* Faint track — the full knot outline at rest. */}
          <path
            d={KNOT_PATH}
            fill="none"
            className={ink ? 'opacity-25' : 'text-accent/15'}
            stroke="currentColor"
            strokeWidth={0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* The strand that draws itself. */}
          <path
            d={KNOT_PATH}
            pathLength={100}
            fill="none"
            stroke={ink ? 'currentColor' : 'url(#carma-knot-loader)'}
            strokeWidth={0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="knot-draw"
            style={ink ? { filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.22))' } : undefined}
          />
        </svg>
      </div>
      {label ? (
        <p className={cn('text-sm font-semibold', ink ? 'opacity-90' : 'text-muted')}>{label}</p>
      ) : null}
      <span className="sr-only">{label || 'Carregant…'}</span>
    </div>
  )
}
