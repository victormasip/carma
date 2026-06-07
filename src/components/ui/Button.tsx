'use client'

import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
  /** Adds the animated gold border that traces the perimeter (hero/primary CTAs). */
  glow?: boolean
}

const VARIANTS: Record<Variant, string> = {
  // Signature gold CTA — a wide gold gradient that slides on hover (.btn-gold).
  // Dark text keeps it legible and premium.
  primary:   'btn-gold font-extrabold',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-hover',
  outline:   'bg-transparent text-text border border-border-strong hover:bg-surface-hover',
  ghost:     'bg-transparent text-muted hover:text-text hover:bg-surface-hover',
  danger:    'bg-danger text-white hover:opacity-90 shadow-card',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8  px-3   text-xs    gap-1.5  rounded-lg',
  md: 'h-10 px-4   text-sm    gap-2    rounded-xl',
  lg: 'h-12 px-5   text-base  gap-2    rounded-xl',
}

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, iconLeft, iconRight, fullWidth, glow, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'group relative inline-flex items-center justify-center font-semibold cursor-pointer',
        'transition-[background-position,box-shadow,transform,color] duration-300',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        glow && 'gold-trace [--gold-trace-w:1.5px]',
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      <span className="relative z-[1] inline-flex items-center justify-center gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : iconLeft}
        {children}
        {!loading && iconRight}
      </span>
    </button>
  )
})

export default Button
