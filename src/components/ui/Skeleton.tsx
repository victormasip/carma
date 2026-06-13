import { cn } from '@/lib/cn'

/**
 * Premium loading placeholder. A neutral surface with a soft light band that
 * sweeps across it (`.skeleton` in globals.css), so async content never causes
 * a layout jump. Size it with width/height/rounded utilities via `className`.
 *
 *   <Skeleton className="h-4 w-40 rounded-lg" />
 *
 * Decorative by design — hidden from assistive tech.
 */
export default function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden style={style} className={cn('skeleton rounded-lg', className)} />
}
