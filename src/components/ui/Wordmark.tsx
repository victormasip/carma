import { cn } from '@/lib/cn'

/**
 * The Carma wordmark — single source of truth. "Carma" extrabold with the
 * signature gold dot. Used in the marketing nav, login, and registration.
 */
export default function Wordmark({
  className,
  size = 'text-2xl',
  as: Tag = 'span',
}: {
  className?: string
  /** Tailwind text-size class controlling the wordmark scale. */
  size?: string
  as?: 'span' | 'div' | 'h1'
}) {
  return (
    <Tag className={cn('font-extrabold tracking-tight leading-none select-none', size, className)}>
      Carma<span className="text-accent">.</span>
    </Tag>
  )
}
