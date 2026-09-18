// EL FIL D'OR — the Carma landing page.
// Plan: docs/plans/2026-09-16-landing-and-community-vision.md
//
// THE PAGE IS A SERVER COMPONENT.
// It used to be `'use client'` from the first line, which meant every section —
// nav, hero, bento, pricing, FAQ, footer — shipped as JavaScript and hydrated on
// a visitor's phone to render text that never changes. There are exactly four
// things on this page that need a browser, and they are the only four client
// islands: <Nav> (menu + language), <Door> (the ask), <EstudiToy> (three
// toggles). Everything else here is HTML.
//
// THE STRUCTURE IS THE ARGUMENT.
//   0  the thread      one gold line, drawn by the visitor's scroll
//   1  L'ENTRADA       the promise, and the only real ask
//   2  LA CONVERSA     "how it works", performed instead of listed
//   3  LA FIDELITAT    one band: the blog lives inside the site you have
//   4  L'ESTUDI        a working toy, not a screenshot — and now the 4th thing
//                      you see, not the 6th (founder: "l'estudi més amunt")
//   5  LA VEU          the moat: she reads you before she writes
//   6  QUÈ NO ÉS       three denials nobody else has the nerve to print
//   7  LA COMUNITAT    a deal, not a group chat
//   8  ELS PUNTS       pricing as the economy it actually is, + FAQ
//   9  EL NUS ES TANCA the knot ties, and the Door is asked once more
//
// WHAT WAS CUT, 2026-09-17. "EL CLON" was a mock browser whose header and footer
// stayed put while the middle re-flowed. It was the most expensive scene here
// and the founder read it twice without getting it ("la part de s'assembla a la
// teva web tampoc [s'entén] i sobra bastant"). The claim inside it was true and
// worth one sentence, so it is now one sentence — <Fidelitat> — and the mock is
// gone. The eyebrow pills went with it: a category label above every heading is
// the single most machine-written tic on a landing page.
//
// Law III of the plan: ONE ask, stated TWICE. The Door opens the page and closes
// it, and nothing else on the page asks for anything.

import Link from 'next/link'
import { Fraunces } from 'next/font/google'
import { ArrowRight, Check, FileText, Globe, Mic, Palette, ShieldCheck } from 'lucide-react'
import Wordmark from '@/components/ui/Wordmark'
import EndlessKnot, { KNOT_PATH, KNOT_VIEWBOX, KNOT_GRADIENT_ID } from '@/components/ui/EndlessKnot'
import { getTemplate } from '@/lib/render/templates'
import { ARCHETYPES } from '@/lib/render/archetypes'
import { KARMA_ALLOCATIONS } from '@/lib/karma/config'
import type { UiLocale } from '@/lib/i18n/config'
import { LANDING, type LandingCopy } from './copy'
import Nav from './Nav'
import Door from './Door'
import PhoneScene, { PhoneEditScene } from './PhoneScene'
import StudioDemo, { type DemoArchetype } from './StudioDemo'

/**
 * The display face — Fraunces, landing-only (founder decision, 2026-09-16).
 *
 * Ubuntu stays the product's UI voice everywhere else; this is the editorial
 * counterpart that only the marketing page pays for. Notes on the config:
 *
 *   · No `weight` → next/font fetches the VARIABLE font, one file covering the
 *     whole weight range instead of one request per weight.
 *   · SOFT and WONK are the two axes that make Fraunces Fraunces — soft
 *     terminals and the wonky alternates. Without them we would be shipping a
 *     generic old-style serif and paying the same bytes for it.
 *   · `latin` covers every Catalan and Spanish diacritic (they live in Latin-1);
 *     see the typography note in copy.ts about never using the precomposed ŀ.
 *   · Imported HERE rather than in the root layout so the preload hint is scoped
 *     to this route and the dashboard never downloads it.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
})

export default function LandingPage({ locale = 'ca', wall }: {
  locale?: UiLocale
  /** THE REAL MEMBER BLOGS, streamed in from an uncached boundary.
   *
   *  This page is cached with `cacheLife('max')` — marketing copy changes when
   *  we deploy, and never otherwise. The community wall is the one thing on it
   *  that is alive, so it arrives as a SLOT: passed through the cached component
   *  without joining its cache entry (Cache Components' documented composition
   *  rule), carrying its own hourly cache and its own Suspense boundary.
   *  See app/page.tsx and components/marketing/CommunityWall.tsx. */
  wall?: React.ReactNode
}) {
  const c = LANDING[locale] ?? LANDING.ca

  return (
    <div className={fraunces.variable}>
      <Thread />
      <Nav c={c.nav} locale={locale} />

      <main className="overflow-x-clip">
        {/* ── The overture: ink, from the hero through the Brand Brain ─────── */}
        <div className="scene-ink">
          <Entrada c={c} />
          <Conversa c={c} />
          <Fidelitat c={c} />
        </div>
        <div className="scene-seam" aria-hidden />

        {/* ── Paper, for the rest ──────────────────────────────────────────── */}
        <Estudi c={c} />
        <Veu c={c} />
        <NoEs c={c} />
        <Comunitat c={c} wall={wall} />
        <Punts c={c} />
        <Faq c={c} />
        <Tancament c={c} />
      </main>

      <Footer c={c} />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 0 — EL FIL
 * A fixed 3px column in the left gutter, grown by `scroll(root)`. The knot turns
 * at the top of it, and the thread is literally what comes out of the mark.
 *
 * This is the piece that was reported "broken", and it was: every rule that
 * drove it lived inside `prefers-reduced-motion: no-preference`, so on a machine
 * with OS animations off — the founder's — the thread never moved once. The
 * reduced-motion contract at the foot of landing.css now keeps scroll-LINKED
 * motion alive and stills only what moves on its own.
 * ══════════════════════════════════════════════════════════════════════════ */
function Thread() {
  return (
    <div className="fil" aria-hidden>
      <span className="fil__knot knot-rotate"><EndlessKnot size={32} /></span>
      <span className="fil__rail" />
      <span className="fil__lit" />
      <span className="fil__spark" />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1 — L'ENTRADA
 * The headline states the promise; the Door is how you take it. The phone is
 * cropped by the right edge and tilted: an object in the room, not a product
 * shot. It does not animate — the Door has to win this fold.
 * ══════════════════════════════════════════════════════════════════════════ */
function Entrada({ c }: { c: LandingCopy }) {
  return (
    <section id="la-porta" className="relative px-4 pb-20 pt-28 sm:pt-32 lg:pb-28">
      <div className="halo halo-drift-a -top-[12%] left-[4%] h-[440px] w-[440px] opacity-[0.16]" style={{ ['--halo-c' as string]: '#f5bc00' }} aria-hidden />
      <div className="halo halo-drift-b top-[18%] right-[2%] h-[380px] w-[380px] opacity-[0.12]" style={{ ['--halo-c' as string]: '#ffe066' }} aria-hidden />

      {/* THE HERO KNOT. Enormous, turning, behind everything — the "massive
          visual presence" the mark was always supposed to have. sheen={false}
          because a gradient sweep at this size is a full-surface repaint every
          frame; the rotation is compositor-only and costs nothing. */}
      <span className="knot-hero knot-rotate -right-[18%] top-[6%] hidden lg:block" aria-hidden>
        <EndlessKnot size={860} sheen={false} />
      </span>
      <span className="knot-hero knot-rotate-rev left-1/2 top-[38%] -translate-x-1/2 lg:hidden" aria-hidden>
        <EndlessKnot size={560} sheen={false} />
      </span>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10">
        <div className="text-center lg:text-left">
          {/* LCP DISCIPLINE: line one is static and paints on the first frame.
              Only the payoff line is allowed to arrive. */}
          <h1 className="font-display display-xl text-balance text-text">
            <span className="block">{c.hero.h1a}</span>
            <span className="display-gold block" data-reveal>{c.hero.h1b}</span>
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-pretty text-lg font-medium leading-relaxed text-muted lg:mx-0" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
            {c.hero.sub}
          </p>

          <div className="mt-9" data-reveal style={{ ['--reveal-i' as string]: 2 }}>
            <Door c={c.door} variant="hero" />
          </div>

          <p className="mt-5 text-sm font-semibold text-subtle" data-reveal style={{ ['--reveal-i' as string]: 3 }}>
            {c.hero.trust}
          </p>
        </div>

        {/* The phone, tilted off the right edge, PLAYING. The founder's note was
            "alive mobile mockups": the demo runs itself on a 12s loop so the
            product is already moving before the visitor touches anything, and it
            survives reduced motion the same way the old scene did. On a phone it
            drops below the Door instead of beside it — a picture of a phone on a
            phone still earns its place when it is the thing demonstrating the
            product. */}
        <div className="relative mx-auto w-full max-w-[330px] lg:mx-0 lg:max-w-none" aria-hidden>
          <div className="lg:pointer-events-none lg:absolute lg:-right-16 lg:top-1/2 lg:w-[340px] lg:-translate-y-1/2 lg:rotate-[5deg]">
            <PhoneScene p={c.conversa.phone} mode="live" />
          </div>
          {/* Reserves the cell the tilted phone is centred in. Sized to the
              device now that the device has real proportions (340px × 19.5:9
              ≈ 736px); it is deliberately a little shorter, so the phone still
              runs past the fold the way an object in a room does. */}
          <div className="hidden lg:block lg:h-[620px]" />
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2 — LA CONVERSA
 * The phone pins and the article writes itself as you scroll. This scene is the
 * whole of "how it works": three numbered cards explaining a product whose pitch
 * is "there is nothing to learn" was the most self-defeating thing on the page.
 * ══════════════════════════════════════════════════════════════════════════ */
function Conversa({ c }: { c: LandingCopy }) {
  return (
    <section id="com-funciona" className="sc-conversa relative px-4">
      <div className="sc-conversa__stage">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <h2 className="font-display display-lg text-balance text-text">{c.conversa.title}</h2>
            <p className="mt-4 text-base font-medium text-muted">{c.conversa.sub}</p>

            {/* On desktop these cross-fade in the pinned stage; everywhere else
                they are simply the five steps, as a list. */}
            <div className="wa-lines mt-9">
              {c.conversa.beats.map((b, i) => (
                <div key={b.lead} className="wa-line" data-beat={String(i + 1)}>
                  <p className="font-display display-md text-text">{b.lead}</p>
                  <p className="mt-1 text-base leading-relaxed text-muted">{b.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="sc-conversa__phone--drift order-1 mx-auto w-full max-w-[330px] lg:order-2">
            {/* NOT the hero's conversation again. The hero shows the happy path;
                this one shows the path that actually sells the product — a draft
                already exists, and you change it by typing what you want, the
                way you would text a colleague. See PhoneEditScene. */}
            <PhoneEditScene e={c.conversa.phoneEdit} mode="scrub" />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3 — LA FIDELITAT
 * What is left of "EL CLON" after the mock browser was cut: the claim itself.
 *
 * The scene it replaces spent a full screen animating a fake site's middle into
 * article cards while two "this stays" tags pointed at the chrome. It read as a
 * puzzle. The claim underneath it — your header and footer survive, only the
 * middle is ours — is one sentence, and one sentence is what it now gets, on the
 * last panel of ink before the page turns to paper.
 *
 * It also carries the OTHER front door. A visitor with no website read four
 * scenes about cloning theirs and never saw an alternative offered; the founder
 * had to go looking for it ("opcio de començar sense web falta o esta molt
 * amagada a tot arreeu"). Here it is stated, in the one place the question
 * naturally occurs to them.
 * ══════════════════════════════════════════════════════════════════════════ */
function Fidelitat({ c }: { c: LandingCopy }) {
  return (
    <section id="fidelitat" className="relative px-4 pb-24 pt-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display display-lg text-balance text-text" data-reveal>{c.fidelitat.title}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg font-medium leading-relaxed text-muted" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
          {c.fidelitat.body}
        </p>

        <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-bold text-accent" data-reveal style={{ ['--reveal-i' as string]: 2 }}>
          <Check className="h-4 w-4" strokeWidth={3} /> {c.fidelitat.proof}
        </p>

        {/* The other front door. Not a footnote — a line and a button. */}
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row" data-reveal style={{ ['--reveal-i' as string]: 3 }}>
          <span className="text-base font-semibold text-text">{c.fidelitat.noWeb}</span>
          <Link
            href="/registre?nova=1"
            className="group inline-flex items-center gap-2 rounded-2xl border border-border-strong bg-bg-elevated px-5 py-3 text-sm font-extrabold text-text no-underline transition-colors hover:border-accent/60 hover:bg-surface-hover"
          >
            <Palette className="h-4 w-4 text-accent" />
            {c.fidelitat.noWebCta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 5 — LA VEU
 * The moat, and the scene that has been rewritten the most times.
 *
 * Round one invented two quotes ("Fem pa de forn de llenya des del 1954…") and
 * printed them as though a real bakery had said them. Round two cut the fakes
 * but kept the CLAIM behind them: "es guarda frases teves, literals". Founder,
 * 2026-09-17: the explanation "is confusing/weird", and the literal-phrases idea
 * goes "completely".
 *
 * They were right twice over. It was confusing because it described a mechanism
 * (we store sentences) instead of an outcome (it sounds like you). And it was
 * self-defeating: the one section promising never to put words in your mouth was
 * bragging about keeping a file of your words.
 *
 * So the scene is now one sentence of argument and one OBJECT: three inputs, an
 * arrow, and a voice sheet — four decisions, taken once, held to the end. The
 * guarantee ("nothing is copied; the sentences are written fresh") is printed
 * where the boast used to be.
 * ══════════════════════════════════════════════════════════════════════════ */
function Veu({ c }: { c: LandingCopy }) {
  const icons = [Globe, FileText, Mic]
  // Each source enters from its own direction; one keyframe, three variables.
  const from = [
    { ['--veu-x' as string]: '-40px', ['--veu-r' as string]: '-7deg' },
    { ['--veu-x' as string]: '0px', ['--veu-y' as string]: '34px' },
    { ['--veu-x' as string]: '40px', ['--veu-r' as string]: '7deg' },
  ]

  return (
    <section id="la-veu" className="cv-auto relative overflow-hidden px-4 py-28">
      <span className="knot-mark knot-mark--parallax left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <span className="knot-rotate inline-flex"><EndlessKnot size={760} sheen={false} /></span>
      </span>

      <div className="relative mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display display-lg text-balance text-text" data-reveal>{c.veu.title}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg font-medium leading-relaxed text-muted" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
            {c.veu.body}
          </p>
        </div>

        {/* ── IN: three sources, each with the one thing it is good for ───── */}
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {c.veu.sources.map((src, i) => {
            const Icon = icons[i] ?? Globe
            return (
              <div
                key={src.label}
                className="veu-src rounded-3xl border border-border bg-bg-elevated p-5 shadow-card"
                style={from[i]}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-3.5 text-base font-extrabold tracking-tight text-text">{src.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{src.body}</p>
              </div>
            )
          })}
        </div>

        {/* The three converge on the mark, and the mark hands back one thing. */}
        <div className="relative mt-8 flex flex-col items-center" aria-hidden>
          <span className="veu-stem" />
          <span className="knot-rotate-fast inline-flex"><EndlessKnot size={72} /></span>
          <span className="veu-stem" />
        </div>

        {/* ── OUT: the voice sheet. A THING, with a name. ─────────────────── */}
        <div
          className="gold-trace gold-trace-aura [--gold-trace-w:1px] relative mx-auto mt-8 max-w-3xl rounded-[1.75rem] border border-transparent bg-bg-elevated p-6 shadow-card sm:p-8"
          data-reveal
        >
          <div className="text-center">
            <p className="font-display display-md text-text">{c.veu.cardTitle}</p>
            <p className="mt-1.5 text-sm font-semibold text-subtle">{c.veu.cardSub}</p>
          </div>

          {/* A <dl> may only contain <dt>/<dd> — or a <div> wrapping exactly one
              group of them. The first version wrapped each pair in a flex row
              that ALSO held the number badge and a second nested <div>, which is
              invalid and reaches assistive tech as a broken term/definition list
              (the a11y audit, 2026-09-18). The badge now lives inside its own
              <dt>, where it belongs — it is part of the term — and the indent
              that used to come from the flex row is an explicit margin on the
              <dd> (1.75rem badge + 0.875rem gap = 2.625rem). */}
          <dl className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {c.veu.keeps.map((k, i) => (
              <div key={k.label} role="presentation" className="min-w-0">
                <dt className="flex items-start gap-3.5 text-base font-extrabold tracking-tight text-text">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[0.7rem] font-extrabold text-on-accent" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="min-w-0">{k.label}</span>
                </dt>
                <dd className="ms-[2.625rem] mt-1 text-sm leading-relaxed text-muted">{k.body}</dd>
              </div>
            ))}
          </dl>

          {/* The line that replaces the boast. */}
          <p className="mt-7 flex items-start gap-2.5 rounded-2xl border border-accent/25 bg-accent-soft/40 px-4 py-3 text-sm font-semibold leading-relaxed text-text">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            {c.veu.guarantee}
          </p>
        </div>

        <p className="mt-9 text-center text-base font-medium leading-relaxed text-muted" data-reveal>
          {c.veu.caption}
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-center text-base font-bold text-text" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
          <a href="#la-porta" className="text-accent no-underline underline-offset-4 hover:underline">{c.veu.foot}</a>
        </p>
      </div>
    </section>
  )
}


/* ════════════════════════════════════════════════════════════════════════════
 * 5 — L'ESTUDI
 * ══════════════════════════════════════════════════════════════════════════ */
/**
 * The three archetypes, flattened for the client island.
 *
 * Done HERE, on the server, and deliberately. StudioDemo is one of only three
 * client components on this page; importing `ARCHETYPES` inside it would drag
 * templates.ts (eight full stylesheets) and the whole module registry into the
 * landing's JS budget. Reading them here costs zero bytes and keeps the demo
 * honest: its colours and its module list are the ones the dashboard applies.
 */
function demoArchetypes(): DemoArchetype[] {
  return ARCHETYPES.map(a => {
    const t = getTemplate(a.templateId)
    const heading = t?.tokens.fontHeading ?? ''
    return {
      id: a.id,
      name: a.name,
      tier: a.tier,
      accent: t?.swatch.accent ?? '#f5bc00',
      serif: /serif|fraunces|georgia|playfair/i.test(heading),
      round: Math.max(0, Math.min(26, parseInt(t?.tokens.radius ?? '14', 10) || 14)),
      grid: (t?.tokens.layout ?? 'grid') === 'grid',
      card: t?.tokens.feedLayout === 'minimal' ? 'flat' : t?.tokens.feedLayout === 'gridxl' ? 'shadow' : 'border',
      modules: Object.entries(a.modules).filter(([, cfg]) => cfg.enabled).map(([id]) => id),
    }
  })
}

function Estudi({ c }: { c: LandingCopy }) {
  return (
    <section id="estudi" className="cv-auto px-4 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display display-lg text-balance text-text" data-reveal>{c.estudi.title}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg font-medium leading-relaxed text-muted" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
          {c.estudi.body}
        </p>
      </div>

      {/* FULL WIDTH, and the biggest thing on the page after the hero. The
          Studio is not an illustration next to a paragraph — it is the second
          product, and it gets the room to behave like one. */}
      <div className="mx-auto mt-12 w-full max-w-[74rem]" data-reveal style={{ ['--reveal-i' as string]: 2 }}>
        <StudioDemo c={c.estudi} archetypes={demoArchetypes()} />
      </div>

      <p className="mx-auto mt-8 max-w-3xl text-center text-base leading-relaxed text-subtle" data-reveal>
        {c.estudi.more}
      </p>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 6 — QUÈ NO ÉS LA CARMA
 * Thirty seconds to read, and it does more anti-generic work than any amount of
 * WebGL. A page that says what it is NOT cannot have come out of a template.
 * ══════════════════════════════════════════════════════════════════════════ */
function NoEs({ c }: { c: LandingCopy }) {
  return (
    <section className="cv-auto relative overflow-hidden px-4 py-24">
      <span className="knot-mark knot-mark--parallax -right-40 top-1/2 -translate-y-1/2" aria-hidden>
        <span className="knot-rotate-rev inline-flex"><EndlessKnot size={640} sheen={false} /></span>
      </span>
      <div className="relative mx-auto max-w-4xl">
        <h2 className="font-display display-lg text-balance text-text" data-reveal>{c.noEs.title}</h2>
        <div className="mt-14 space-y-12">
          {c.noEs.items.map((d, i) => (
            <div key={d.claim} data-reveal style={{ ['--reveal-i' as string]: i }}>
              <p className="font-display display-md text-pretty text-text">{d.claim}</p>
              <p className="mt-2 max-w-2xl text-lg font-medium leading-relaxed text-muted">{d.truth}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 7 — LA COMUNITAT
 * Founder pivot, 2026-09-16: a "points spent globally" ticker is vanity, not
 * community. Community is INTERACTION. So this scene sells the loop — read a
 * peer, say something real, earn the points you write with — and the wall shows
 * identities rather than logos. No invented counters live on this page: the
 * numbers arrive when the members do.
 * ══════════════════════════════════════════════════════════════════════════ */
function Comunitat({ c, wall }: { c: LandingCopy; wall?: React.ReactNode }) {
  return (
    <section id="comunitat" className="cv-auto px-4 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display display-lg text-balance text-text" data-reveal>{c.comunitat.title}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg font-medium leading-relaxed text-muted" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
          {c.comunitat.body}
        </p>
      </div>

      {/* The deal */}
      <div className="mx-auto mt-16 max-w-5xl">
        <p className="text-center font-display display-md text-text" data-reveal>{c.comunitat.loopTitle}</p>
        <div className="relative mt-10 grid gap-5 md:grid-cols-3">
          <div className="pointer-events-none absolute left-[14%] right-[14%] top-[2.9rem] hidden h-px bg-gradient-to-r from-accent/0 via-accent/45 to-accent/0 md:block" aria-hidden />
          {c.comunitat.loop.map((s, i) => (
            <div key={s.title} className="lift relative rounded-3xl border border-border bg-bg-elevated p-7 shadow-card" data-reveal style={{ ['--reveal-i' as string]: i }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-sm font-extrabold text-accent">
                {i + 1}
              </span>
              <h3 className="mt-5 text-xl font-extrabold tracking-tight text-text">{s.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-base font-semibold leading-relaxed text-text" data-reveal>
          {c.comunitat.loopFoot}
        </p>
      </div>

      {/* ── THE WALL ──────────────────────────────────────────────────────
          It used to paint the eight starter TEMPLATES under the heading "Fet
          amb Carma", which is a claim about members made out of our own design
          files. It is now the real ones, live, streamed in from its own cache
          boundary (CommunityWall.tsx) because member blogs change and marketing
          copy does not. */}
      <div className="mt-20">
        <p className="text-center text-xs font-extrabold uppercase tracking-[0.18em] text-subtle">{c.comunitat.wallTitle}</p>
        {wall}
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 8 — ELS PUNTS
 * A fuel gauge, not a pricing table. It teaches the economy BEFORE signup, so
 * the first paywall is never a surprise, and it makes the community loop above
 * a real earning path instead of a gimmick.
 * ══════════════════════════════════════════════════════════════════════════ */
function Punts({ c }: { c: LandingCopy }) {
  const p = c.punts
  return (
    <section id="punts" className="cv-auto px-4 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display display-lg text-balance text-text" data-reveal>{p.title}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg font-medium leading-relaxed text-muted" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
          {p.body}
        </p>
      </div>

      {/* ALL FOUR TIERS. The page used to show two, which is not a ladder — and
          the punt figures come from KARMA_ALLOCATIONS, not from the copy, so the
          landing and the wallet can never quote different numbers. */}
      <div className="mx-auto mt-14 grid max-w-6xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {p.plans.map((plan, i) => (
          <Gauge
            key={plan.id}
            name={plan.name}
            price={plan.price}
            period={plan.period}
            allowance={`${KARMA_ALLOCATIONS[plan.id].toLocaleString('ca-ES')} ${p.allowanceUnit}`}
            fill={KARMA_ALLOCATIONS[plan.id] / KARMA_ALLOCATIONS.agency}
            perks={plan.perks}
            cta={plan.cta}
            value={plan.id === 'free' ? null : `${(parseFloat(plan.price.replace(/[^\d.,]/g, '').replace(',', '.')) / KARMA_ALLOCATIONS[plan.id] * 100).toFixed(2).replace('.', ',')} € / 100 punts`}
            featured={!!plan.featured}
            i={i}
            total={p.plans.length}
          />
        ))}
      </div>

      {/* What things cost — from the same catalogue the product charges against */}
      <div className="mx-auto mt-12 max-w-2xl rounded-3xl border border-border bg-bg-elevated p-6 shadow-card" data-reveal>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-subtle">{p.costsTitle}</p>
        <ul className="mt-4 divide-y divide-border">
          {p.costs.map(row => (
            <li key={row.label} className="flex items-center justify-between py-2.5 text-base">
              <span className="font-medium text-muted">{row.label}</span>
              <span className="font-extrabold tabular-nums text-text">{row.punts}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-center text-xs font-medium text-subtle">{p.note}</p>
    </section>
  )
}

/**
 * One plan.
 *
 * Founder, 2026-09-16: "plans de menys a mes mes atractius, be premium com a
 * defecte ressaltat pero la resta de plans es cars queden mes amagats". The
 * first version gave Premium a gold ring, a premium shadow and a gold button,
 * and left the other three as thin outlines — so the ladder read as one real
 * product plus three things you were being talked out of.
 *
 * Now every card carries the same weight: same elevation, same padding, same
 * button. What ASCENDS instead is the gold — a hairline on Gratis, a full ring
 * on Agència — so climbing the ladder looks like climbing, and Premium keeps a
 * small "recomanat" tag rather than the whole card shouting.
 *
 * And each card states its VALUE (€ per 100 punts), which falls as you go up.
 * Nothing answers "aquests plans són cars" like the arithmetic saying otherwise.
 */
function Gauge({ name, price, period, allowance, value, perks, cta, fill, featured = false, i = 0, total = 4 }: {
  name: string; price: string; period: string; allowance: string
  value: string | null; perks: string[]; cta: string; fill: number
  featured?: boolean; i?: number; total?: number
}) {
  // Gold rises with the tier: 0 → a hairline, 1 → the last card is a full ring.
  const climb = total > 1 ? i / (total - 1) : 1

  return (
    <div
      data-reveal
      style={{
        ['--reveal-i']: Math.min(i, 3),
        // One border, getting more golden. No card is "the plain one".
        borderColor: `color-mix(in oklab, var(--color-accent) ${18 + climb * 62}%, var(--color-border))`,
        boxShadow: `0 18px 44px -28px rgba(0,0,0,0.30), 0 0 0 ${climb > 0.6 ? 1 : 0}px color-mix(in oklab, var(--color-accent) 45%, transparent)`,
      } as React.CSSProperties}
      className="relative flex h-full flex-col rounded-[1.75rem] border bg-bg-elevated p-6"
    >
      {featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-wider text-on-accent">
          {name === 'Premium' ? 'Recomanat' : 'Popular'}
        </span>
      )}

      <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-subtle">{name}</h3>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold tracking-tight text-text">{price}</span>
        <span className="text-xs font-medium text-subtle">{period}</span>
      </div>

      {/* Scaled against the biggest plan, so the four bars read as one ladder
          rather than four full tanks. */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
        <div
          className="punts-fill h-full rounded-full"
          style={{
            width: `${Math.max(5, fill * 100)}%`,
            background: `linear-gradient(90deg, color-mix(in oklab, var(--color-accent) ${55 + climb * 45}%, #ffffff), var(--color-accent))`,
          }}
        />
      </div>
      <p className="mt-2 text-sm font-bold text-text">{allowance}</p>
      {value && <p className="mt-0.5 text-xs font-medium text-subtle">{value}</p>}

      <ul className="mt-5 flex-1 space-y-2.5">
        {perks.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm font-medium leading-snug text-text">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <a
        href="#la-porta"
        className={
          featured
            ? 'btn-gold gold-trace [--gold-trace-w:1.5px] mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-extrabold no-underline'
            : 'mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-border-strong text-sm font-bold text-text no-underline transition-colors hover:border-accent/60 hover:bg-surface-hover'
        }
      >
        <span className="relative z-[1] inline-flex items-center gap-2">{cta}<ArrowRight className="h-4 w-4" /></span>
      </a>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * FAQ — objection handling, next to the price where it belongs.
 * ══════════════════════════════════════════════════════════════════════════ */
function Faq({ c }: { c: LandingCopy }) {
  return (
    <section id="preguntes" className="cv-auto px-4 pb-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h2 className="font-display display-lg text-balance text-text" data-reveal>{c.faq.title}</h2>
        </div>
        <div className="mt-10 space-y-3">
          {c.faq.items.map((it, i) => (
            <details key={it.q} className="group rounded-2xl border border-border bg-bg-elevated px-5 shadow-card open:pb-5" data-reveal style={{ ['--reveal-i' as string]: Math.min(i, 3) }}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-base font-bold text-text [&::-webkit-details-marker]:hidden">
                {it.q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-muted transition-transform group-open:rotate-45">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
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

/* ════════════════════════════════════════════════════════════════════════════
 * 9 — EL NUS ES TANCA
 * The thread has run the whole page. Here it ties: the closing knot draws itself
 * with the last screen of scroll, then fills, then becomes the wordmark — and
 * the Door is asked for the second and final time.
 * ══════════════════════════════════════════════════════════════════════════ */
function Tancament({ c }: { c: LandingCopy }) {
  return (
    <section className="relative px-4 pb-28 pt-8">
      <div className="mx-auto max-w-3xl text-center">
        <div className="flex justify-center">
          <KnotTie />
        </div>

        <h2 className="font-display display-lg mt-8 text-balance text-text" data-reveal>{c.close.title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-lg font-medium text-muted" data-reveal style={{ ['--reveal-i' as string]: 1 }}>
          {c.close.sub}
        </p>

        <div className="mt-10" data-reveal style={{ ['--reveal-i' as string]: 2 }}>
          <Door c={c.door} variant="close" />
        </div>

        <p className="mx-auto mt-5 max-w-lg text-sm font-medium leading-relaxed text-subtle" data-reveal style={{ ['--reveal-i' as string]: 3 }}>
          {c.close.micro}
        </p>
      </div>
    </section>
  )
}

/**
 * The closing knot. Two copies of the same path: one stroked and drawn by the
 * scroll, one filled and faded in behind it once the line has closed.
 *
 * This is the ONE paint-bound animation on the page (stroke-dashoffset is not a
 * compositor property). It is allowed because it is a 220px box that only
 * animates while the last screen of the page is visible — and because it is the
 * single moment the whole design is built around.
 */
function KnotTie() {
  return (
    <span className="relative block h-[240px] w-[240px]" aria-hidden>
      {/* TWO ELEMENTS, TWO ANIMATIONS. `.knot-tie__fill` fades in on the scroll
          timeline and the child turns on the clock. They used to be one element
          wearing both classes, and `.knot-rotate`'s !important shorthand simply
          deleted the fade (see landing.css). */}
      <span className="knot-tie__fill absolute inset-0">
        <span className="knot-rotate block h-full w-full">
          <EndlessKnot size={240} />
        </span>
      </span>
      <svg className="knot-tie absolute inset-0" viewBox={KNOT_VIEWBOX} width={240} height={240} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${KNOT_GRADIENT_ID}-tie`} x1="0" y1="0" x2="0.72" y2="0.72" spreadMethod="reflect">
            <stop offset="0%" stopColor="#9a7409" />
            <stop offset="50%" stopColor="#fff7d6" />
            <stop offset="100%" stopColor="#9a7409" />
          </linearGradient>
        </defs>
        <path d={KNOT_PATH} pathLength={100} stroke={`url(#${KNOT_GRADIENT_ID}-tie)`} />
      </svg>
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * Shared
 * ══════════════════════════════════════════════════════════════════════════ */

function Footer({ c }: { c: LandingCopy }) {
  return (
    <footer className="border-t border-border px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Wordmark size="text-lg" />
          <span className="text-sm font-medium text-subtle">© {new Date().getFullYear()} · {c.footer.tagline}</span>
        </div>
        <div className="flex flex-col items-center gap-3 sm:items-end">
          <div className="flex items-center gap-5 text-sm font-semibold text-muted">
            <a href="/blog" className="no-underline transition-colors hover:text-accent">{c.footer.blog}</a>
            <Link href="/login" className="no-underline transition-colors hover:text-accent">{c.footer.login}</Link>
            <a href="#la-porta" className="no-underline transition-colors hover:text-accent">{c.footer.signup}</a>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-subtle">
            <span className="knot-rotate-fast inline-flex"><EndlessKnot size={13} /></span> {c.footer.madeIn}
          </span>
        </div>
      </div>
    </footer>
  )
}
