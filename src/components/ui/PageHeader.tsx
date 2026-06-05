import { cn } from '@/lib/cn'

type Props = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export default function PageHeader({ title, description, actions, className }: Props) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-text">{title}</h1>
        {description && (
          <p className="text-sm text-muted mt-1.5 leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}
