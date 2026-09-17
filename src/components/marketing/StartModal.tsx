'use client'

// THE FORK — what "Comença gratis" actually opens (founder, 2026-09-17).
//
// The button used to be an anchor to `#la-porta`. Scrolling somewhere is not an
// answer to "how do I start?", and it silently assumed the visitor already had a
// website to paste: the other half of the market — the ones with nothing online
// yet, the ones this product is arguably FOR — hit a URL field and left.
//
// So the top-right CTA now asks the only question that matters first, and both
// answers are real front doors:
//
//   · "Ja tinc marca"   → back to the Door, focused, with the page scrolled so
//                         the card sits under the nav. The brand read runs
//                         logged-out and THEN asks for an email (see Door.tsx).
//   · "Començo de zero" → straight into /registre?nova=1, the template path.
//
// BUDGET. The landing has four client islands and this one is tiny on purpose:
// no dialog library, no focus-trap package, no animation library. A portal, two
// listeners, and the same `.door-ring`/`zen-*` motion classes the rest of the
// page already ships.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ArrowRight, Check, Globe, Palette, X } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import type { LandingCopy } from './copy'

/**
 * Put the visitor in front of the Door and give them the caret.
 *
 * Exported because the mobile sheet uses the same move without opening the
 * modal, and because "scroll to the thing AND focus its input" is exactly the
 * kind of two-step that drifts apart when it is written twice.
 */
export function goToDoor() {
  const card = document.getElementById('la-porta')
  if (!card) { window.location.hash = '#la-porta'; return }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const top = window.scrollY + card.getBoundingClientRect().top - 72
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' })
  // After the scroll settles: focus the input, so the next keystroke lands in it.
  // A plain timeout rather than scrollend — Safari still doesn't fire that event.
  window.setTimeout(() => {
    const input = card.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
    input?.focus({ preventScroll: true })
  }, reduce ? 0 : 520)
}

export default function StartModal({ c, open, onClose }: {
  c: LandingCopy['nav']['start']
  open: boolean
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape closes; the body is locked so the page behind cannot scroll away
  // underneath the card. Both are undone on close, including on unmount.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.setProperty('overflow', 'hidden')
    // Move the caret inside the dialog so Tab cycles here, not through the page.
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous) document.body.style.setProperty('overflow', previous)
      else document.body.style.removeProperty('overflow')
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const brand = () => { onClose(); goToDoor() }

  return createPortal(
    <div
      className="start-veil fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto overscroll-contain p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-title"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="start-card relative my-auto w-full max-w-3xl rounded-[1.75rem] border border-border bg-bg-elevated p-6 shadow-pop outline-none sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-subtle transition-colors hover:bg-surface-hover hover:text-text"
          aria-label={c.title}
        >
          <X className="h-4.5 w-4.5" />
        </button>

        <div className="text-center">
          <span className="knot-rotate-fast inline-flex"><EndlessKnot size={34} /></span>
          <h2 id="start-title" className="font-display display-md mt-3 text-balance text-text">{c.title}</h2>
          <p className="mx-auto mt-2 max-w-md text-base font-medium text-muted">{c.sub}</p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {/* ── I have a brand: the Door, which is already on this page ──────
              A button, not a link: the whole point is that nothing navigates —
              the brand read happens here, logged out, before any account. */}
          <Choice
            icon={<Globe className="h-5 w-5" />}
            title={c.brandTitle}
            body={c.brandBody}
            points={c.brandPoints}
            cta={c.brandCta}
            featured
            onClick={brand}
          />

          {/* ── Nothing yet: the template path, which needs an account ────── */}
          <Choice
            icon={<Palette className="h-5 w-5" />}
            title={c.scratchTitle}
            body={c.scratchBody}
            points={c.scratchPoints}
            cta={c.scratchCta}
            href="/registre?nova=1"
          />
        </div>

        <p className="mt-6 text-center text-xs font-semibold text-subtle">{c.foot}</p>
      </div>
    </div>,
    document.body,
  )
}

function Choice({ icon, title, body, points, cta, featured = false, onClick, href }: {
  icon: React.ReactNode
  title: string
  body: string
  points: string[]
  cta: string
  featured?: boolean
  onClick?: () => void
  href?: string
}) {
  const inner = (
    <>
      <span
        className={
          featured
            ? 'flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-on-accent'
            : 'flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent'
        }
      >
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-extrabold tracking-tight text-text">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
      <ul className="mt-4 flex-1 space-y-2">
        {points.map(p => (
          <li key={p} className="flex items-start gap-2.5 text-sm font-medium leading-snug text-text">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <span
        className={
          featured
            ? 'btn-gold gold-trace [--gold-trace-w:1.5px] mt-5 inline-flex h-12 items-center justify-center rounded-2xl text-sm font-extrabold'
            : 'mt-5 inline-flex h-12 items-center justify-center rounded-2xl border border-border-strong text-sm font-extrabold text-text transition-colors group-hover:border-accent/60 group-hover:bg-surface-hover'
        }
      >
        <span className="relative z-[1] inline-flex items-center gap-2">{cta}<ArrowRight className="h-4 w-4" /></span>
      </span>
    </>
  )

  const cls =
    'group flex h-full cursor-pointer flex-col rounded-[1.4rem] border p-5 text-left no-underline transition-colors ' +
    (featured ? 'border-accent/45 bg-surface' : 'border-border bg-surface hover:border-accent/40')

  return href
    ? <Link href={href} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}
