import { cn } from '@/lib/cn'

type Props = React.HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'section' | 'article'
  elevated?: boolean
  interactive?: boolean
  padded?: boolean
}

export default function Card({
  as: Tag = 'div',
  elevated = false,
  interactive = false,
  padded = true,
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
        interactive && 'transition-all duration-200 hover:border-border-strong hover:shadow-pop',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
