import { cn } from '@/lib/cn'
import { KNOT_PATH, KNOT_VIEWBOX } from './EndlessKnot'

/**
 * The compact, inline "busy" mark — a spinning Endless Knot for async buttons and
 * small loaders. It fills with `currentColor`, so it inherits the surrounding text
 * colour (dark on a gold button, muted on a ghost, accent on a tinted chip) and is
 * always visible. Spins via the global `.animate-spin` (0.8s, survives reduced
 * motion), so it reads as a true spinner rather than the serene brand rotation.
 *
 * Size it like any icon: `<KnotSpinner className="w-4 h-4" />`.
 */
export default function KnotSpinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox={KNOT_VIEWBOX}
      className={cn('animate-spin shrink-0', className ?? 'w-4 h-4')}
      fill="currentColor"
      aria-hidden
      role="img"
    >
      <path d={KNOT_PATH} />
    </svg>
  )
}
