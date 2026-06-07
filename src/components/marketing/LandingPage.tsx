'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wand2, PenLine, Languages, Plug, Palette, BarChart3, ArrowRight, Check,
  Sparkles, Menu, X, Globe, Boxes,
} from 'lucide-react'
import Wordmark from '@/components/ui/Wordmark'
import UrlInput from './UrlInput'
import { WaitlistHero } from '@/components/ui/waitlist-hero'
import { normalizeUrl } from '@/lib/onboarding/url'

export default function LandingPage() {
  const router = useRouter()

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
      <Nav />
      <main className="overflow-x-clip">
        <Hero onGenerate={onGenerate} />
        <HowItWorks />
        <FeatureBento />
        <Pricing />
        <WaitlistHero variant="section" />
      </main>
      <Footer />
    </>
  )
}

/* ───────────────────────────── Nav ───────────────────────────── */
function Nav() {
  const [open, setOpen] = useState(false)
  const links = [
    { href: '#com-funciona', label: 'Com funciona' },
    { href: '#funcions', label: 'Funcions' },
    { href: '/blog', label: 'Blog' },
    { href: '#preus', label: 'Preus' },
  ]
  return (
    <header className="fixed inset-x-0 top-0 z-50">
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
          <Link href="/login" className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-text no-underline transition-colors hover:bg-surface-hover sm:inline-block">
            Entra
          </Link>
          <Link href="/registre" className="btn-gold gold-trace [--gold-trace-w:1.5px] hidden rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline sm:inline-flex">
            <span className="relative z-[1]">Comença gratis</span>
          </Link>
          <button onClick={() => setOpen((o) => !o)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text md:hidden" aria-label="Menú">
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
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link href="/login" className="rounded-xl border border-border px-3 py-2.5 text-center text-sm font-semibold text-text no-underline">Entra</Link>
            <Link href="/registre" className="btn-gold gold-trace [--gold-trace-w:1.5px] rounded-xl px-3 py-2.5 text-center text-sm font-extrabold no-underline"><span className="relative z-[1]">Comença</span></Link>
          </div>
        </div>
      )}
    </header>
  )
}

/* ───────────────────────────── Hero ───────────────────────────── */
function Hero({ onGenerate }: { onGenerate: (u: string) => void }) {
  return (
    <section className="relative px-4 pb-12 pt-32 sm:pb-16 sm:pt-40">
      <div className="halo halo-drift-a -top-[10%] left-[8%] h-[420px] w-[420px] bg-accent opacity-[0.12]" />
      <div className="halo halo-drift-b top-[15%] right-[5%] h-[360px] w-[360px] bg-carma-300 opacity-[0.10]" />

      <div className="relative mx-auto max-w-4xl text-center">
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-text sm:text-6xl">
          <span className="hero-word inline-block" style={{ animationDelay: '0ms' }}>Enganxa</span>{' '}
          <span className="hero-word inline-block" style={{ animationDelay: '70ms' }}>una</span>{' '}
          <span className="hero-word inline-block" style={{ animationDelay: '140ms' }}>URL.</span>{' '}
          <span className="hero-word shimmer-gold inline-block" style={{ animationDelay: '230ms' }}>Tindràs&nbsp;un&nbsp;blog</span>{' '}
          <span className="hero-word inline-block" style={{ animationDelay: '320ms' }}>idèntic</span>{' '}
          <span className="hero-word inline-block" style={{ animationDelay: '390ms' }}>a</span>{' '}
          <span className="hero-word inline-block" style={{ animationDelay: '460ms' }}>la</span>{' '}
          <span className="hero-word inline-block" style={{ animationDelay: '530ms' }}>teva</span>{' '}
          <span className="hero-word inline-block" style={{ animationDelay: '600ms' }}>web.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg font-medium leading-relaxed text-muted" data-reveal style={{ '--reveal-delay': '120ms' } as React.CSSProperties}>
          Carma clona la identitat visual del teu lloc i et lliura un blog amb editor modern en 30 segons. Sense codi.
        </p>

        <div className="mt-9" data-reveal style={{ '--reveal-delay': '200ms' } as React.CSSProperties}>
          <UrlInput onSubmit={onGenerate} />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-subtle">
            <Link href="/registre" className="inline-flex items-center gap-1.5 font-semibold text-muted no-underline transition-colors hover:text-accent">
              <Boxes className="h-4 w-4" /> No tinc web · crear un blog amb plantilles
            </Link>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-subtle" data-reveal style={{ '--reveal-delay': '280ms' } as React.CSSProperties}>
          {['Gratis per començar', 'Sense targeta', 'Multi-idioma', 'API i embed'].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-accent" /> {t}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── How it works ───────────────────────── */
function HowItWorks() {
  const steps = [
    { icon: Globe, title: 'Enganxa la URL', body: 'Donem un cop d’ull a la teva web pública: capçalera, peu, colors i tipografies.' },
    { icon: Wand2, title: 'Clonem la identitat', body: 'Reconstruïm el teu disseny de forma nativa i, si tens un blog, n’importem els articles.' },
    { icon: PenLine, title: 'Escriu i publica', body: 'Edita amb un editor d’estil Notion i publica al teu domini. Tu controles cada paraula.' },
  ]
  return (
    <section id="com-funciona" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Com funciona" title="De la teva web a un blog viu, en tres passos." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="lift relative rounded-3xl border border-border bg-bg-elevated p-7 shadow-card" data-reveal style={{ '--reveal-delay': `${i * 110}ms` } as React.CSSProperties}>
              <span className="absolute right-6 top-6 text-5xl font-extrabold text-border">{i + 1}</span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <s.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-xl font-extrabold tracking-tight text-text">{s.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── Feature bento ──────────────────────── */
function FeatureBento() {
  return (
    <section id="funcions" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Tot el que necessites" title="Un CMS premium, sense la complexitat." />
        <div className="mt-14 grid auto-rows-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          <BentoCard className="md:col-span-2 md:row-span-2" featured icon={Wand2} title="Clonació amb la vareta màgica" body="Capturem la teva capçalera i el teu peu originals, n’extraiem la paleta i les tipografies exactes, i envoltem el teu blog amb la teva identitat real. Zero col·lisions de CSS.">
            <div className="mt-6 flex gap-1.5">
              {['#1a2138', '#f5bc00', '#f0e6c8', '#e94b4b', '#5b8a72', '#fafaf6'].map((c) => (
                <div key={c} className="h-9 flex-1 rounded-lg border border-white/30 shadow-sm" style={{ background: c }} />
              ))}
            </div>
          </BentoCard>
          <BentoCard icon={PenLine} title="Editor d’estil Notion" body="Comandes «/», blocs rics, galeries i callouts. Escriure és un plaer." />
          <BentoCard icon={Languages} title="Multi-idioma real" body="Detectem l’idioma i gestionem traduccions amb un selector elegant." />
          <BentoCard icon={Palette} title="Theme Studio en directe" body="Ajusta colors, radis i tipografies i mira-ho canviar a l’instant." />
          <BentoCard icon={Plug} title="API i embed" body="Connecta el blog al teu frontend amb JSON o un embed aïllat." />
          <BentoCard icon={BarChart3} title="Estadístiques" body="Vistes, articles i creixement, sense cookies invasives." />
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
      <p className="mt-2 flex-1 text-base leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  )
}

/* ───────────────────────────── Pricing ─────────────────────────── */
function Pricing() {
  const free = ['1 blog clonat', 'Editor complet', 'Theme Studio', 'Subdomini Carma']
  const premium = ['Tot el del pla Free', 'Blogs il·limitats', 'API i embed en directe', 'Domini propi', 'Múltiples editors', 'Suport prioritari']
  return (
    <section id="preus" className="px-4 py-24">
      <div className="mx-auto max-w-5xl">
        <SectionHead eyebrow="Preus" title="Comença gratis. Creix quan vulguis." />
        <div className="mx-auto mt-14 grid max-w-3xl gap-5 sm:grid-cols-2">
          <div className="flex flex-col rounded-[2rem] border border-border bg-bg-elevated p-8 shadow-card" data-reveal>
            <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-subtle">Free</h3>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-5xl font-extrabold tracking-tight text-text">0€</span>
              <span className="mb-1.5 text-sm font-medium text-subtle">/ per sempre</span>
            </div>
            <ul className="mt-6 flex-1 space-y-3">
              {free.map((f) => <Perk key={f}>{f}</Perk>)}
            </ul>
            <Link href="/registre" className="mt-7 inline-flex h-12 items-center justify-center rounded-xl border border-border-strong text-sm font-bold text-text no-underline transition-colors hover:bg-surface-hover">
              Comença gratis
            </Link>
          </div>

          <div className="gold-ring rounded-[2rem]" data-reveal style={{ '--reveal-delay': '110ms' } as React.CSSProperties}>
            <div className="relative flex flex-col rounded-[2rem] bg-bg-elevated p-8 shadow-premium">
              <span className="absolute right-7 top-8 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-on-accent">
                <Sparkles className="h-3 w-3" /> Popular
              </span>
              <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-accent">Premium</h3>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-text">19€</span>
                <span className="mb-1.5 text-sm font-medium text-subtle">/ mes</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {premium.map((f) => <Perk key={f} gold>{f}</Perk>)}
              </ul>
              <Link href="/registre" className="btn-gold gold-trace [--gold-trace-w:1.5px] mt-7 inline-flex h-12 items-center justify-center rounded-xl text-sm font-extrabold no-underline">
                <span className="relative z-[1] inline-flex items-center gap-2">Prova Premium <ArrowRight className="h-4 w-4" /></span>
              </Link>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-xs font-medium text-subtle">Preus de llançament orientatius · es confirmaran abans del cobrament.</p>
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

/* ───────────────────────────── Final CTA ───────────────────────── */
/* ───────────────────────────── Footer ──────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-border px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <Wordmark size="text-lg" />
          <span className="text-sm font-medium text-subtle">© {new Date().getFullYear()} · Fet amb daurat a Catalunya</span>
        </div>
        <div className="flex items-center gap-5 text-sm font-semibold text-muted">
          <a href="/blog" className="no-underline transition-colors hover:text-accent">Blog</a>
          <Link href="/login" className="no-underline transition-colors hover:text-accent">Entra</Link>
          <Link href="/registre" className="no-underline transition-colors hover:text-accent">Comença</Link>
          <a href="#funcions" className="no-underline transition-colors hover:text-accent">Funcions</a>
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
