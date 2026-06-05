'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export type Tab = {
  key: string
  label: string
  href?: string
  icon?: React.ReactNode
  count?: number
  trailing?: React.ReactNode  // e.g. a LockBadge for premium-gated tabs
  title?: string
}

type Props = {
  tabs: Tab[]
  activeKey: string
  onSelect?: (key: string) => void  // click-based mode; ignored if href is set
  className?: string
}

/**
 * Segmented tabs with an ANIMATED underline indicator that slides between the
 * active tab (Vercel/Linear feel). Two modes:
 * - href on each tab → renders as Link (server-driven tab routing)
 * - onSelect callback → renders as button (client-state tab switching)
 *
 * The indicator is positioned from a layout measurement of the active tab
 * (useLayoutEffect reads geometry → state; the sanctioned layout-effect use, not
 * derived-state-in-effect) and transitions transform+width. Respects
 * prefers-reduced-motion (the transition is motion-safe only).
 */
export default function Tabs({ tabs, activeKey, onSelect, className }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const el = itemRefs.current[activeKey]
      const list = listRef.current
      if (!el || !list) return
      const lRect = list.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      // Inset the bar slightly so it sits under the label, not the full padding.
      const inset = 8
      setBar({ left: eRect.left - lRect.left + list.scrollLeft + inset, width: Math.max(0, eRect.width - inset * 2) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (listRef.current) ro.observe(listRef.current)
    return () => ro.disconnect()
  }, [activeKey, tabs])

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn(
        'relative flex items-center gap-1 border-b border-border overflow-x-auto',
        className,
      )}
    >
      {tabs.map(t => {
        const active = t.key === activeKey
        const cls = cn(
          'relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer',
          active ? 'text-text' : 'text-muted hover:text-text',
        )
        const inner = (
          <>
            {t.icon}
            {t.label}
            {typeof t.count === 'number' && (
              <span className={cn(
                'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md text-xs font-semibold',
                active ? 'bg-accent-soft text-accent' : 'bg-surface-subtle text-subtle',
              )}>
                {t.count}
              </span>
            )}
            {t.trailing}
          </>
        )

        if (t.href) {
          return (
            <Link
              key={t.key}
              ref={el => { itemRefs.current[t.key] = el }}
              href={t.href}
              role="tab"
              aria-selected={active}
              title={t.title}
              className={cls}
            >
              {inner}
            </Link>
          )
        }
        return (
          <button
            key={t.key}
            ref={el => { itemRefs.current[t.key] = el }}
            type="button"
            role="tab"
            aria-selected={active}
            title={t.title}
            onClick={() => onSelect?.(t.key)}
            className={cls}
          >
            {inner}
          </button>
        )
      })}

      {/* Sliding active-indicator. Hidden until measured. */}
      <span
        aria-hidden
        className={cn(
          'absolute bottom-0 h-0.5 bg-accent rounded-t-full',
          'motion-safe:transition-[transform,width] motion-safe:duration-200 motion-safe:ease-out',
          bar ? 'opacity-100' : 'opacity-0',
        )}
        style={bar ? { width: bar.width, transform: `translateX(${bar.left}px)` } : undefined}
      />
    </div>
  )
}
