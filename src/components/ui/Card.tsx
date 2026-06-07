import { cn } from '@/lib/cn'

type Props = React.HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'section' | 'article'
  elevated?: boolean
  interactive?: boolean
  padded?: boolean
  /** Adds the animated gold tracing border (on hover) for important cards. */
  glow?: boolean
}

export default function Card({
  as: Tag = 'div',
  elevated = false,
  interactive = false,
  padded = true,
  glow = false,
  className,
  children,
  ...rest
}: Props) {
  return (
    <Tag
      className={cn(
        'bg-surface border border-border rounded-xl',
        padded && 'p-6',
        elevated && 'shadow-card',
        // Interactive cards lift with a warm gold glow (the `.lift` utility).
        interactive && 'lift hover:border-border-strong',
        // Important cards also trace a gold border on hover.
        glow && 'gold-trace gold-trace-hover lift',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
