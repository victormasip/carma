import { cn } from '@/lib/cn'
import EndlessKnot from './EndlessKnot'

/**
 * The Carma wordmark — single source of truth. The Endless Knot mark (gold, with a
 * soft glow) sits beside "Carma" extrabold and the signature gold dot. Used in the
 * marketing nav, login, registration and onboarding. The knot scales with the text
 * (`1.05em`), so a single `size` prop keeps mark + text in proportion.
 */
export default function Wordmark({
  className,
  size = 'text-2xl',
  as: Tag = 'span',
  /** Show the "Carma." text alongside the mark. Set false for an icon-only lockup. */
  showText = true,
  /** Give the mark the serene "endless" rotation. Defaults ON — the founder loves
   *  the spinning mark, so every wordmark lockup (nav, auth, onboarding, preview)
   *  rotates by default. Pass `spin={false}` for the rare static lockup. */
  spin = true,
}: {
  className?: string
  /** Tailwind text-size class controlling the wordmark scale. */
  size?: string
  as?: 'span' | 'div' | 'h1'
  showText?: boolean
  spin?: boolean
}) {
  return (
    <Tag
      className={cn(
        'inline-flex items-center gap-2 font-extrabold tracking-tight leading-none select-none',
        size,
        className,
      )}
    >
      <EndlessKnot size="1.2em" glow spin={spin} className="shrink-0" />
      {showText && (
        <span>
          Carma<span className="text-accent">.</span>
        </span>
      )}
    </Tag>
  )
}
