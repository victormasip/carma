'use client'

// Animated segmented control — Vercel / Linear style.
//
// A single highlight pill sits behind the segments and slides (transform +
// width) to the active one with a smooth spring-ish ease. The highlight is
// transform-animated (never width/height/left in the animation path that would
// thrash layout — we set width/transform together but the browser composites the
// transition), respects prefers-reduced-motion, and is fully keyboard-accessible
// (role=tablist with arrow-key navigation + roving focus).
//
// React-19 note: we measure the active segment's box with useLayoutEffect and
// store it in state. Reading DOM geometry is the sanctioned use of a layout
// effect (you cannot compute pixel offsets during render); it is NOT
// setState-from-derived-props. The highlight is positioned from that measurement.

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Segment<K extends string = string> = {
  key: K
  label: ReactNode
  icon?: ReactNode
  /** Optional trailing element, e.g. a count badge or a premium lock. */
  trailing?: ReactNode
}

type Props<K extends string> = {
  segments: Segment<K>[]
  value: K
  onChange: (key: K) => void
  className?: string
  /** Visual size. `sm` for dense drawers, `md` for primary surfaces. */
  size?: 'sm' | 'md'
  /** Stretch segments to fill the container width (equal columns). */
  fluid?: boolean
  'aria-label'?: string
}

export default function SegmentedTabs<K extends string>({
  segments, value, onChange, className, size = 'md', fluid = false, ...rest
}: Props<K>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const groupId = useId()
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const activeIndex = Math.max(0, segments.findIndex(s => s.key === value))

  // Measure the active segment and position the highlight. Runs after layout and
  // whenever the selection or the segment set changes; a ResizeObserver keeps it
  // correct across container resizes (responsive, font swaps, drawer open).
  useLayoutEffect(() => {
    const measure = () => {
      const el = btnRefs.current[value]
      const container = containerRef.current
      if (!el || !container) return
      const cRect = container.getBoundingClientRect()
      const bRect = el.getBoundingClientRect()
      setPill({ left: bRect.left - cRect.left, width: bRect.width })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [value, segments])

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (activeIndex + 1) % segments.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (activeIndex - 1 + segments.length) % segments.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = segments.length - 1
    if (next >= 0) {
      e.preventDefault()
      const k = segments[next].key
      onChange(k)
      btnRefs.current[k]?.focus()
    }
  }

  const pad = size === 'sm' ? 'p-0.5' : 'p-1'
  const btnH = size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-sm'

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={rest['aria-label']}
      onKeyDown={onKeyDown}
      className={cn(
        'relative items-center rounded-lg bg-surface-subtle border border-border',
        fluid ? 'flex w-full' : 'inline-flex',
        pad, className,
      )}
    >
      {/* Sliding highlight. Positioned absolutely; transitions left+width.
          Hidden until measured to avoid a flash at 0,0. */}
      <span
        aria-hidden
        className={cn(
          'absolute top-1 bottom-1 rounded-md bg-surface shadow-card',
          'motion-safe:transition-[transform,width] motion-safe:duration-200 motion-safe:ease-out',
          pill ? 'opacity-100' : 'opacity-0',
        )}
        style={pill ? { width: pill.width, transform: `translateX(${pill.left - (size === 'sm' ? 2 : 4)}px)` } : undefined}
      />
      {segments.map(seg => {
        const active = seg.key === value
        return (
          <button
            key={seg.key}
            ref={el => { btnRefs.current[seg.key] = el }}
            type="button"
            role="tab"
            id={`${groupId}-${seg.key}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(seg.key)}
            className={cn(
              'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap cursor-pointer',
              'transition-colors',
              btnH,
              fluid && 'flex-1',
              active ? 'text-text' : 'text-muted hover:text-text',
            )}
          >
            {seg.icon}
            {seg.label}
            {seg.trailing}
          </button>
        )
      })}
    </div>
  )
}
