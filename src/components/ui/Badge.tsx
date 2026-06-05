import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: 'bg-surface-subtle',  fg: 'text-muted',   dot: 'bg-subtle' },
  accent:  { bg: 'bg-accent-soft',     fg: 'text-accent',  dot: 'bg-accent' },
  success: { bg: 'bg-success-soft',    fg: 'text-success', dot: 'bg-success' },
  warning: { bg: 'bg-warning-soft',    fg: 'text-warning', dot: 'bg-warning' },
  danger:  { bg: 'bg-danger-soft',     fg: 'text-danger',  dot: 'bg-danger' },
  info:    { bg: 'bg-info-soft',       fg: 'text-info',    dot: 'bg-info' },
}

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
  dot?: boolean
  size?: 'sm' | 'md'
}

export default function Badge({
  tone = 'neutral',
  dot = false,
  size = 'md',
  className,
  children,
  ...rest
}: Props) {
  const t = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold rounded-md whitespace-nowrap',
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        t.bg, t.fg,
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  )
}
