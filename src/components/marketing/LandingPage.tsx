'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wand2, PenLine, Languages, BarChart3, ArrowRight, Check,
  Sparkles, Menu, X, Globe, Boxes, MessageCircle, Mic,
} from 'lucide-react'
import Wordmark from '@/components/ui/Wordmark'
import UrlInput from './UrlInput'
import AgentPhoneMock from './AgentPhoneMock'
import { WaitlistHero } from '@/components/ui/waitlist-hero'
import { normalizeUrl } from '@/lib/onboarding/url'
import { LANDING, type LandingCopy } from './copy'
import { LOCALE_COOKIE, UI_LOCALES, type UiLocale } from '@/lib/i18n/config'

export default function LandingPage({ locale = 'ca' }: { locale?: UiLocale }) {
  const router = useRouter()
  const c = LANDING[locale] ?? LANDING.ca

  // Paste a URL → go to the full-page preview (a real clone of the site), which
  // then gates the result behind registration.
  const onGenerate = (raw: string) => {
    const url = normalizeUrl(raw)
    if (!url) return
    router.push(`/preview?url=${encodeURIComponent(url)}`)
  }

  // Reveal-on-scroll for anything tagged [data-reveal].
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]:not(.in-view)')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -60px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <>
      <Nav c={c} locale={locale} />
      <main className="overflow-x-clip">
        <Hero c={c} />
        <HowItWorks c={c} />
        <FeatureBento c={c} />
        <StudioShowcase c={c} />
        <CloneSection c={c} onGenerate={onGenerate} />
        <Pricing c={c} />
        <Faq c={c} />
        <WaitlistHero
          variant="section"
          copy={{ title: c.waitlist.title, sub: c.waitlist.sub, cloning: c.waitlist.cloning, placeholder: c.urlInput.placeholder, cta: c.urlInput.cta }}
        />
      </main>
      <Footer c={c} />
    </>
  )
}

/* ─────────────────────── Language switcher ─────────────────────── */
// Writes the same cookie the dashboard reads, so the choice follows the visitor
// into the app. router.refresh() re-runs the server page → new dictionary.
function LangSwitch({ locale }: { locale: UiLocale }) {
  const router = useRouter()
  const pick = (l: UiLocale) => {
    if (l === locale) return
    // Cookie write in an event handler is intentional (no React state involved);
    // react-hooks v6 immutability flags any `document.*` assignment.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=31536000;samesite=lax`
    router.refresh()
  }
  return (
    <div className="flex items-center rounded-xl border border-border p-0.5" role="group" aria-label="Idioma / Language">
      {UI_LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => pick(l)}
          aria-pressed={l === locale}
          className={`rounded-[10px] px-2 py-1 text-xs font-extrabold uppercase transition-colors ${
            l === locale ? 'bg-accent-soft text-accent' : 'text-subtle hover:text-text'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/* ───────────────────────────── Nav ───────────────────────────── */
function Nav({ c, locale }: { c: LandingCopy; locale: UiLocale }) {
  const [open, setOpen] = useState(false)
  const links = [
    { href: '#com-funciona', label: c.nav.how },
    { href: '#funcions', label: c.nav.features },
    { href: '/blog', label: c.nav.blog },
    { href: '#preus', label: c.nav.pricing },
  ]
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 sm:px-4">
      <div className="mx-auto mt-3 flex max-w-6xl items-center justify-between gap-4 rounded-2xl border border-border bg-bg-elevated/80 px-4 py-2.5 shadow-card backdrop-blur-xl sm:mt-4 sm:px-5">
        <Link href="/" className="no-underline"><Wordmark size="text-xl" /></Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted no-underline transition-colors hover:bg-surface-hover hover:text-text">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden md:block"><LangSwitch locale={locale} /></span>
          <Link href="/login" className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-text no-underline transition-colors hover:bg-surface-hover sm:inline-block">
            {c.nav.login}
          </Link>
          <Link href="/registre" className="btn-gold gold-trace [--gold-trace-w:1.5px] hidden rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline sm:inline-flex">
            <span className="relative z-[1]">{c.nav.signup}</span>
          </Link>
          <button onClick={() => setOpen((o) => !o)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text md:hidden" aria-label={c.nav.menu}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-border bg-bg-elevated p-3 shadow-pop backdrop-blur-xl md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-text no-underline hover:bg-surface-hover">
              {l.label}
            </a>
          ))}
          <div className="mt-2 flex justify-center"><LangSwitch locale={locale} /></div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link href="/login" className="rounded-xl border border-border px-3 py-2.5 text-center text-sm font-semibold text-text no-underline">{c.nav.login}</Link>
            <Link href="/registre" className="btn-gold gold-trace [--gold-trace-w:1.5px] rounded-xl px-3 py-2.5 text-center text-sm font-extrabold no-underline"><span className="relative z-[1]">{c.nav.signupShort}</span></Link>
          </div>
        </div>
      )}
    </header>
  )
}

/* ───────────────────────────── Hero ───────────────────────────── */
// Agent-first: the story is "your blog writes itself over WhatsApp". The clone
// magic keeps its own stage further down (#clona) — this fold sells the agent.
function Hero({ c }: { c: LandingCopy }) {
  // Word-staggered headline: plain words first, gold shimmer on the payoff.
  const wordsA = c.hero.h1a.split(' ')
  const wordsB = c.hero.h1b.split(' ')
  return (
    <section className="relative px-4 pb-16 pt-32 sm:pt-36 lg:pb-24">
      {/* Soft radial gradients, NOT blur() — see .halo in globals.css (perf). */}
      <div className="halo halo-drift-a -top-[10%] left-[8%] h-[420px] w-[420px] opacity-[0.12]" style={{ '--halo-c': '#f5bc00' } as React.CSSProperties} />
      <div className="halo halo-drift-b top-[15%] right-[5%] h-[360px] w-[360px] opacity-[0.10]" style={{ '--halo-c': '#ffe066' } as React.CSSProperties} />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent">
            <MessageCircle className="h-3.5 w-3.5" /> {c.hero.badge}
          </span>

          <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-text sm:text-6xl">
            {wordsA.map((w, i) => (
              <span key={`a${i}`}>
                <span className="hero-word inline-block" style={{ animationDelay: `${i * 70}ms` }}>{w}</span>{' '}
              </span>
            ))}
            {wordsB.map((w, i) => (
              <span key={`b${i}`}>
                <span className="hero-word shimmer-gold inline-block" style={{ animationDelay: `${240 + i * 80}ms` }}>{w}</span>{' '}
              </span>
            ))}
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg font-medium leading-relaxed text-muted lg:mx-0" data-reveal style={{ '--reveal-delay': '120ms' } as React.CSSProperties}>
            {c.hero.sub}
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start" data-reveal style={{ '--reveal-delay': '200ms' } as React.CSSProperties}>
            <Link href="/registre" className="btn-gold gold-trace [--gold-trace-w:1.5px] inline-flex h-13 items-center justify-center rounded-2xl px-7 py-3.5 text-base font-extrabold no-underline">
              <span className="relative z-[1] inline-flex items-center gap-2"><Sparkles className="h-4.5 w-4.5" /> {c.hero.cta1}</span>
            </Link>
            <a href="#clona" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border-strong px-7 py-3.5 text-base font-bold text-text no-underline transition-colors hover:border-accent/50 hover:bg-surface-hover">
              <Wand2 className="h-4.5 w-4.5 text-accent" /> {c.hero.cta2}
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-subtle lg:justify-start" data-reveal style={{ '--reveal-delay': '280ms' } as React.CSSProperties}>
            {c.hero.chips.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-accent" /> {t}</span>
            ))}
          </div>
        </div>

        <AgentPhoneMock phone={c.phone} />
      </div>
    </section>
  )
}

/* ───────────────────────── How it works ───────────────────────── */
function HowItWorks({ c }: { c: LandingCopy }) {
  const icons = [Globe, MessageCircle, Mic]
  return (
    <section id="com-funciona" className="cv-auto px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={c.how.eyebrow} title={c.how.title} />
        <div className="relative mt-14 grid gap-5 md:grid-cols-3">
          {/* Gold thread connecting the three steps (desktop only). */}
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-[3.4rem] hidden h-px bg-gradient-to-r from-accent/0 via-accent/45 to-accent/0 md:block" aria-hidden />
          {c.how.steps.map((s, i) => {
            const Icon = icons[i] ?? Globe
            return (
              <div key={s.title} className="lift relative rounded-3xl border border-border bg-bg-elevated p-7 shadow-card" data-reveal style={{ '--reveal-delay': `${i * 110}ms` } as React.CSSProperties}>
                <span className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd769] to-[#e6ad00] text-sm font-extrabold text-[#1a1400] shadow-[0_6px_18px_-6px_rgba(245,188,0,0.6)]">
                  {i + 1}
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-xl font-extrabold tracking-tight text-text">{s.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted">{s.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── Feature bento ──────────────────────── */
function FeatureBento({ c }: { c: LandingCopy }) {
  const b = c.bento
  return (
    <section id="funcions" className="cv-auto px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={b.eyebrow} title={b.title} />
        <div className="mt-14 grid auto-rows-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          <BentoCard className="md:col-span-2 md:row-span-2" featured icon={MessageCircle} title={b.agentTitle} body={b.agentBody}>
            <div className="mt-6 flex flex-1 flex-col justify-center gap-2.5">
              <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-sm font-medium text-text">
                {b.chatUser}
              </div>
              <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2 text-sm text-muted">
                {b.chatDraftLead} <span className="font-bold text-text">{b.chatDraftTitle}</span>
              </div>
              <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-sm font-bold text-text">
                {b.chatApprove}
              </div>
              <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2 text-sm text-muted">
                <span className="font-bold text-success">{b.chatPublished}</span>{' '}
                <span className="font-semibold text-accent underline decoration-accent/40 underline-offset-2">{b.chatUrl}</span>
              </div>
            </div>
          </BentoCard>
          <BentoCard icon={Wand2} title={b.cloneTitle} body={b.cloneBody}>
            <div className="mt-4 flex gap-1.5">
              {['#1a2138', '#f5bc00', '#f0e6c8', '#e94b4b', '#5b8a72', '#fafaf6'].map((col) => (
                <div key={col} className="h-7 flex-1 rounded-lg border border-white/30 shadow-sm" style={{ background: col }} />
              ))}
            </div>
          </BentoCard>
          <BentoCard icon={PenLine} title={b.editorTitle} body={b.editorBody} />
          <BentoCard icon={Boxes} title={b.modulesTitle} body={b.modulesBody} />
          <BentoCard icon={Languages} title={b.langTitle} body={b.langBody} />
          <BentoCard icon={BarChart3} title={b.statsTitle} body={b.statsBody} />
        </div>
      </div>
    </section>
  )
}

function BentoCard({ icon: Icon, title, body, children, className = '', featured = false }: {
  icon: typeof Wand2; title: string; body: string; children?: React.ReactNode; className?: string; featured?: boolean
}) {
  return (
    <div
      className={`lift group relative flex flex-col rounded-3xl border p-7 shadow-card ${featured ? 'gold-trace gold-trace-aura [--gold-trace-w:1px] border-transparent bg-bg-elevated' : 'border-border bg-bg-elevated'} ${className}`}
      data-reveal
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${featured ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <h3 className={`mt-4 font-extrabold tracking-tight text-text ${featured ? 'text-2xl' : 'text-lg'}`}>{title}</h3>
      {/* In the tall featured tile the CHILDREN (chat mock) absorb the extra
          height, centred; in small tiles the body does, as before. */}
      <p className={`mt-2 text-base leading-relaxed text-muted ${featured ? '' : 'flex-1'}`}>{body}</p>
      {children}
    </div>
  )
}

/* ─────────────────────── Carma Studio showcase ─────────────────────── */
// Pure-CSS browser mock: a mini blog with a selected card + floating contextual
// toolbar — the Studio's direct-manipulation promise, shown instead of told.
function StudioShowcase({ c }: { c: LandingCopy }) {
  const s = c.studio
  return (
    <section className="cv-auto px-4 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Copy */}
        <div data-reveal>
          <span className="eyebrow mb-4">{s.eyebrow}</span>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
            {s.title}
          </h2>
          <p className="mt-4 text-pretty text-lg font-medium leading-relaxed text-muted">
            {s.sub}
          </p>
          <ul className="mt-6 space-y-3">
            {s.bullets.map((t) => (
              <li key={t} className="flex items-start gap-3 text-base font-medium text-text">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <Link href="/registre" className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-border-strong px-6 py-3 text-base font-bold text-text no-underline transition-colors hover:border-accent/50 hover:bg-surface-hover">
            {s.cta} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Browser mock */}
        <div className="relative" data-reveal style={{ '--reveal-delay': '140ms' } as React.CSSProperties}>
          <div className="halo -inset-8 opacity-[0.12]" style={{ background: 'radial-gradient(circle, #f5bc00, transparent 65%)' }} aria-hidden />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </span>
              <span className="mx-auto rounded-md bg-bg-elevated px-3 py-0.5 text-[0.68rem] font-semibold text-subtle">
                {s.browserUrl}
              </span>
            </div>
            {/* Mini blog */}
            <div className="relative p-5">
              {/* Site header strip */}
              <div className="flex items-center justify-between rounded-lg bg-surface-subtle px-3 py-2">
                <span className="h-2.5 w-14 rounded-full bg-gradient-to-r from-[#ffd769] to-[#e6ad00]" />
                <span className="flex gap-2" aria-hidden>
                  <span className="h-2 w-8 rounded-full bg-border" />
                  <span className="h-2 w-8 rounded-full bg-border" />
                  <span className="h-2 w-8 rounded-full bg-border" />
                </span>
              </div>
              {/* Cards grid — middle one selected, toolbar floating next to it */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`rounded-xl border bg-surface p-2.5 ${i === 1 ? 'border-accent outline outline-2 outline-offset-2 outline-accent/60' : 'border-border'}`}
                  >
                    <div className={`aspect-[16/10] rounded-lg ${i === 1 ? 'bg-gradient-to-br from-[#ffe9a3] to-[#f5bc00]/60' : 'bg-surface-subtle'}`} />
                    <span className="mt-2 block h-2 w-4/5 rounded-full bg-border-strong" />
                    <span className="mt-1.5 block h-1.5 w-full rounded-full bg-border" />
                    <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-border" />
                  </div>
                ))}
              </div>
              {/* Floating contextual toolbar — anchored beside the SELECTED card */}
              <div className="absolute right-[27%] top-[4.4rem] flex items-center gap-1 rounded-xl border border-border bg-bg-elevated px-1.5 py-1 shadow-pop">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-on-accent"><Palette2 /></span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md text-muted"><TypeGlyph /></span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md text-muted"><GridGlyph /></span>
              </div>
              {/* Floating gold edit button (the live-site entry point) */}
              <div className="absolute bottom-4 right-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#ffd769] to-[#e6ad00] px-3.5 py-1.5 text-[0.7rem] font-extrabold text-[#1a1400] shadow-[0_10px_24px_-8px_rgba(245,188,0,0.7)]">
                <PenLine className="h-3 w-3" /> {s.editBtn}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Tiny inline glyphs for the mock toolbar (lucide at 12px reads muddy here).
function Palette2() { return <span className="block h-3 w-3 rounded-full border-2 border-current" /> }
function TypeGlyph() { return <span className="text-[0.7rem] font-extrabold leading-none">Aa</span> }
function GridGlyph() {
  return (
    <span className="grid grid-cols-2 gap-[2px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => <span key={i} className="h-[4.5px] w-[4.5px] rounded-[1.5px] bg-current" />)}
    </span>
  )
}

/* ─────────────────────── Clone (the magic wand keeps its stage) ─────────────────────── */
function CloneSection({ c, onGenerate }: { c: LandingCopy; onGenerate: (u: string) => void }) {
  return (
    <section id="clona" className="cv-auto px-4 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <SectionHead eyebrow={c.clone.eyebrow} title={c.clone.title} />
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base font-medium leading-relaxed text-muted" data-reveal>
          {c.clone.sub}
        </p>
        <div className="mt-9" data-reveal style={{ '--reveal-delay': '120ms' } as React.CSSProperties}>
          <UrlInput onSubmit={onGenerate} labels={c.urlInput} />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-subtle">
            <Link href="/registre" className="inline-flex items-center gap-1.5 font-semibold text-muted no-underline transition-colors hover:text-accent">
              <Boxes className="h-4 w-4" /> {c.clone.noSite}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────────── Pricing ─────────────────────────── */
function Pricing({ c }: { c: LandingCopy }) {
  const p = c.pricing
  return (
    <section id="preus" className="cv-auto px-4 py-24">
      <div className="mx-auto max-w-5xl">
        <SectionHead eyebrow={p.eyebrow} title={p.title} />
        <div className="mx-auto mt-14 grid max-w-3xl gap-5 sm:grid-cols-2">
          <div className="flex flex-col rounded-[2rem] border border-border bg-bg-elevated p-8 shadow-card" data-reveal>
            <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-subtle">{p.freeName}</h3>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-5xl font-extrabold tracking-tight text-text">{p.freePrice}</span>
              <span className="mb-1.5 text-sm font-medium text-subtle">{p.freePeriod}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-3">
              {p.freePerks.map((f) => <Perk key={f}>{f}</Perk>)}
            </ul>
            <Link href="/registre" className="mt-7 inline-flex h-12 items-center justify-center rounded-xl border border-border-strong text-sm font-bold text-text no-underline transition-colors hover:bg-surface-hover">
              {p.freeCta}
            </Link>
          </div>

          <div className="gold-ring rounded-[2rem]" data-reveal style={{ '--reveal-delay': '110ms' } as React.CSSProperties}>
            <div className="relative flex flex-col rounded-[2rem] bg-bg-elevated p-8 shadow-premium">
              <span className="absolute right-7 top-8 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-on-accent">
                <Sparkles className="h-3 w-3" /> {p.premiumBadge}
              </span>
              <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-accent">{p.premiumName}</h3>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-text">{p.premiumPrice}</span>
                <span className="mb-1.5 text-sm font-medium text-subtle">{p.premiumPeriod}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {p.premiumPerks.map((f) => <Perk key={f} gold>{f}</Perk>)}
              </ul>
              <Link href="/registre" className="btn-gold gold-trace [--gold-trace-w:1.5px] mt-7 inline-flex h-12 items-center justify-center rounded-xl text-sm font-extrabold no-underline">
                <span className="relative z-[1] inline-flex items-center gap-2">{p.premiumCta} <ArrowRight className="h-4 w-4" /></span>
              </Link>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-xs font-medium text-subtle">{p.note}</p>
      </div>
    </section>
  )
}

function Perk({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-base font-medium text-text">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${gold ? 'bg-accent text-on-accent' : 'bg-success-soft text-success'}`}>
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      {children}
    </li>
  )
}

/* ───────────────────────────── FAQ ─────────────────────────── */
function Faq({ c }: { c: LandingCopy }) {
  return (
    <section className="cv-auto px-4 pb-24">
      <div className="mx-auto max-w-3xl">
        <SectionHead eyebrow={c.faq.eyebrow} title={c.faq.title} />
        <div className="mt-10 space-y-3">
          {c.faq.items.map((it, i) => (
            <details
              key={it.q}
              className="group rounded-2xl border border-border bg-bg-elevated px-5 shadow-card open:pb-5"
              data-reveal
              style={{ '--reveal-delay': `${i * 70}ms` } as React.CSSProperties}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-base font-bold text-text [&::-webkit-details-marker]:hidden">
                {it.q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-muted transition-transform group-open:rotate-45">
                  <PlusGlyph />
                </span>
              </summary>
              <p className="text-base leading-relaxed text-muted">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/* ───────────────────────────── Footer ──────────────────────────── */
function Footer({ c }: { c: LandingCopy }) {
  return (
    <footer className="border-t border-border px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <Wordmark size="text-lg" />
          <span className="text-sm font-medium text-subtle">© {new Date().getFullYear()} · {c.footer.tagline}</span>
        </div>
        <div className="flex items-center gap-5 text-sm font-semibold text-muted">
          <a href="/blog" className="no-underline transition-colors hover:text-accent">{c.footer.blog}</a>
          <Link href="/login" className="no-underline transition-colors hover:text-accent">{c.footer.login}</Link>
          <Link href="/registre" className="no-underline transition-colors hover:text-accent">{c.footer.signup}</Link>
          <a href="#funcions" className="no-underline transition-colors hover:text-accent">{c.footer.features}</a>
        </div>
      </div>
    </footer>
  )
}

/* ───────────────────────────── Shared ──────────────────────────── */
function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center" data-reveal>
      <span className="eyebrow mb-4">{eyebrow}</span>
      <h2 className="text-balance text-3xl font-extrabold tracking-tight text-text sm:text-4xl">{title}</h2>
    </div>
  )
}
