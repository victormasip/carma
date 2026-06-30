'use client'

import { forwardRef } from 'react'
import Link from 'next/link'
import KnotSpinner from './KnotSpinner'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

type CommonProps = {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
  /** Adds the animated gold border that traces the perimeter (hero/primary CTAs). */
  glow?: boolean
}

// A Button is either a real <button> or — when `href` is set — a Next <Link> that
// shares the exact same look (so navigation CTAs like "Escriure Article" match the
// approve/publish button). The two prop shapes are kept distinct so each only
// accepts the attributes that element supports.
type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined }
type ButtonAsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & { href: string }
type Props = ButtonAsButton | ButtonAsLink

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

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, iconLeft, iconRight, fullWidth, glow, className, children, ...rest },
  ref,
) {
  const classes = cn(
    'group relative inline-flex items-center justify-center font-semibold cursor-pointer',
    'transition-[background-position,box-shadow,transform,color] duration-300',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'whitespace-nowrap',
    VARIANTS[variant],
    SIZES[size],
    glow && 'gold-trace [--gold-trace-w:1.5px]',
    fullWidth && 'w-full',
    className,
  )

  const inner = (
    <span className="relative z-[1] inline-flex items-center justify-center gap-2">
      {loading ? <KnotSpinner className="h-4 w-4" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </span>
  )

  // Link variant — same look, navigates. `loading` disables interaction visually.
  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest as ButtonAsLink
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={cn(classes, loading && 'pointer-events-none opacity-50')}
        aria-disabled={loading || undefined}
        {...anchorRest}
      >
        {inner}
      </Link>
    )
  }

  const { disabled, ...buttonRest } = rest as ButtonAsButton
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      disabled={disabled || loading}
      className={classes}
      {...buttonRest}
    >
      {inner}
    </button>
  )
})

export default Button
