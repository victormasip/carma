'use client'

// THE HEADER — a floating, premium navigation bar.
//
// It condenses as you scroll: wide and weightless at the top of the page, then
// a smaller, denser, brighter pill once you move. That transition is driven by a
// native scroll timeline (`.nav-bar` in landing.css), so it costs no scroll
// listener, no state and no re-render — the thing every "shrinking header" on
// the internet pays for with a rAF loop.
//
// THE MAP, 2026-09-17. It carried four links for a page with nine scenes, so the
// Studio, the community and the FAQ were invisible unless you scrolled past them
// (founder: "it currently has too few items and doesn't reflect the full depth of
// the landing page"). Every destination is now listed; `tier` decides which ones
// survive the squeeze, and the mobile sheet always shows the whole map.
//
// This stays a client island for exactly three reasons: the mobile sheet, the
// language switch (which writes the same cookie the dashboard reads, so the
// choice follows the visitor into the app), and the start fork. Everything else
// is CSS.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, X, ArrowRight } from 'lucide-react'
import Wordmark from '@/components/ui/Wordmark'
import { LOCALE_COOKIE, UI_LOCALES, type UiLocale } from '@/lib/i18n/config'
import StartModal, { goToDoor } from './StartModal'
import type { LandingCopy } from './copy'

export default function Nav({ c, locale }: { c: LandingCopy['nav']; locale: UiLocale }) {
  const [open, setOpen] = useState(false)
  const [fork, setFork] = useState(false)
  const router = useRouter()

  const pick = (l: UiLocale) => {
    if (l === locale) return
    // Cookie write in an event handler is intentional: no React state involved,
    // and the server reads this on the next request.
    document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=31536000;samesite=lax`
    router.refresh()
  }

  // tier 1 = always in the bar · 2 = from lg · 3 = from xl. The sheet ignores it.
  const links: { href: string; label: string; tier: 1 | 2 | 3 }[] = [
    { href: '#com-funciona', label: c.how, tier: 1 },
    { href: '#estudi', label: c.estudi, tier: 1 },
    { href: '#la-veu', label: c.voice, tier: 1 },
    { href: '#comunitat', label: c.comunitat, tier: 2 },
    { href: '#punts', label: c.punts, tier: 2 },
    { href: '#preguntes', label: c.faq, tier: 3 },
    { href: '/blog', label: c.blog, tier: 3 },
  ]
  const tierClass = { 1: 'md:inline-flex', 2: 'lg:inline-flex', 3: 'xl:inline-flex' } as const

  return (
    <div className="nav-shell">
      <header className="nav-bar">
        {/* THE WORDMARK COMPONENT, not a hand-rolled lockup.
            A previous pass rebuilt this inline and set it in the landing's
            display face — which quietly changed the logo's typography. The logo
            is Ubuntu, everywhere, and `Wordmark` is the single source of truth
            for the mark + text + gold dot proportions. It already spins. */}
        <Link href="/" className="shrink-0 no-underline" aria-label="Carma">
          <Wordmark size="text-xl" />
        </Link>

        <nav className="ml-2 hidden items-center gap-0.5 md:flex">
          {links.map(l => (
            <a key={l.href} href={l.href} className={`nav-link hidden ${tierClass[l.tier]}`}>{l.label}</a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* <div>, not <span>: LangSwitch's root IS a <div role="group">, and a
              <span> may only contain phrasing content (a11y audit, 2026-09-18). */}
          <div className="hidden xl:block"><LangSwitch locale={locale} onPick={pick} /></div>

          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-sm font-semibold text-muted no-underline transition-colors hover:text-text sm:inline-block"
          >
            {c.login}
          </Link>

          {/* THE FORK, not a jump. See StartModal.tsx. */}
          <button
            type="button"
            onClick={() => setFork(true)}
            className="btn-gold gold-trace [--gold-trace-w:1.5px] hidden cursor-pointer rounded-full px-4 py-2.5 text-sm font-extrabold sm:inline-flex"
          >
            <span className="relative z-[1] inline-flex items-center gap-1.5">
              {c.signup} <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>

          <button
            onClick={() => setOpen(o => !o)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border text-text transition-colors hover:bg-surface-hover md:hidden"
            aria-label={open ? c.close : c.menu}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {open && (
        <div className="pointer-events-auto mx-auto mt-2 max-h-[calc(100dvh-7rem)] max-w-6xl overflow-y-auto rounded-3xl border border-border bg-bg-elevated/95 p-3 shadow-pop backdrop-blur-xl md:hidden">
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-3 text-base font-semibold text-text no-underline hover:bg-surface-hover"
            >
              {l.label}
            </a>
          ))}
          <div className="mt-2 flex justify-center"><LangSwitch locale={locale} onPick={pick} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/login" className="rounded-xl border border-border px-3 py-3 text-center text-sm font-semibold text-text no-underline">
              {c.login}
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); goToDoor() }}
              className="btn-gold gold-trace [--gold-trace-w:1.5px] cursor-pointer rounded-xl px-3 py-3 text-center text-sm font-extrabold"
            >
              <span className="relative z-[1]">{c.signupShort}</span>
            </button>
          </div>
        </div>
      )}

      <StartModal c={c.start} open={fork} onClose={() => setFork(false)} />
    </div>
  )
}

function LangSwitch({ locale, onPick }: { locale: UiLocale; onPick: (l: UiLocale) => void }) {
  return (
    <div className="flex items-center rounded-full border border-border p-0.5" role="group" aria-label="Idioma / Language">
      {UI_LOCALES.map(l => (
        <button
          key={l}
          onClick={() => onPick(l)}
          aria-pressed={l === locale}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-extrabold uppercase transition-colors ${
            l === locale ? 'bg-accent-soft text-accent' : 'text-subtle hover:text-text'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
