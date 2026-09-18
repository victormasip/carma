'use client'

// Full-page onboarding shown on a brand-new site.
//
// ONE DOOR (Fase 1, 2026-09-16)
// ─────────────────────────────
// It used to be a two-card fork: "clone my web" (a URL field) beside "start from a
// template". Two decisions before the owner had told us anything about themselves,
// and a Brand Brain that stayed empty either way — so their agent met them knowing
// nothing, which is exactly when knowing something matters most.
//
// Now there is one question — "Explica'ns qui sou" — and every answer is valid: a
// URL, documents dropped anywhere on the surface, a voice note, or just typing.
// Whatever they give goes into the Brand Brain BEFORE the first article, and the
// template path survives as the honest escape hatch it always was ("I don't have a
// website yet").
//
// SEQUENCING NOTE: the brand capture runs to completion BEFORE the visual clone
// starts, rather than in parallel. Parallel would be ~20s faster, but the clone
// owns its own full-screen progress modal (ThemeCaptureModal) and running both at
// once puts two progress UIs on screen fighting each other. So each phase gets the
// screen — and the brand phase earns it: it narrates real findings and ends by
// quoting the owner's own sentences back to them.
//
// It lives INSIDE the ThemeStudioProvider so it can drive grab()/applyTemplate()
// directly; the host (SiteDetailClient) coordinates dismissal, tab switching and
// the post-capture flow via callbacks.

import { useCallback, useState, useRef, useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Wand2, Globe, ArrowRight, ArrowLeft, Check, X, Newspaper } from 'lucide-react'
import { BLOG_TEMPLATES, type BlogTemplate } from '@/lib/render/templates'
import { archetypeForTemplate } from '@/lib/render/archetypes'
import { useThemeStudio } from './ThemeStudioContext'
import Button from '@/components/ui/Button'
import Wordmark from '@/components/ui/Wordmark'
import BrandIntake, { type BrandIntakeValue } from '@/components/onboarding/BrandIntake'
import {
  clearDoorCarry, doorCarrySnapshot, doorCarryServerSnapshot, subscribeDoorCarry,
} from '@/lib/onboarding/glimpse'

/** The subset of the glimpse the capture actually needs. */
type BrandSeedCarry = {
  prose: string; siteName: string | null; locale: string | null
  palette: string[]; fonts: string[]; pages: number
}
import BrandCaptureView from '@/components/onboarding/BrandCaptureView'
import RewardTicker from '@/components/onboarding/RewardTicker'
import { cn } from '@/lib/cn'

/**
 * True once we are running in the browser.
 *
 * useSyncExternalStore rather than an effect: the server snapshot is false and
 * the client snapshot is true, which is exactly the shape this hook wants — and
 * it keeps the component free of the setState-in-effect that react-hooks v6
 * rejects.
 */
const noopSubscribe = () => () => {}
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

// Mirror of /api/onboarding/detect's payload (the fields this flow reads).
type Detected = {
  ok: boolean
  url: string
  displayUrl: string
  title: string | null
  isBlog: boolean
  blogUrl: string | null
  framework: string | null
  error?: string
}

export default function SiteOnboarding({
  siteId, siteName, initialUrl, autoStart, startOnTemplates = false,
  onMagicWandStarted, onTemplateApplied, onDismiss,
}: {
  siteId: string
  siteName: string
  /** Prefill the intake (carried from the public landing funnel). */
  initialUrl?: string
  /** Immediately fire the capture on mount (seamless funnel from registration). */
  autoStart?: boolean
  /** "Encara no tinc web" (?nova=1): skip the intake, open the gallery. */
  startOnTemplates?: boolean
  onMagicWandStarted: (opts?: { importArticles?: boolean; afterBrandRead?: boolean }) => void
  onTemplateApplied: (templateName: string) => void
  onDismiss: () => void
}) {
  const { grab, applyTemplate, setBlogUrl } = useThemeStudio()

  // NO MICRO-FLASH ON THE SEAMLESS FUNNEL (founder, 2026-09-17: "fix the glitch
  // where the 'explica'ns qui sou' screen flashes briefly during the 'estem
  // coneixent qui sou' loading phase").
  //
  // The flash was structural, not a timing accident. `view` started at 'intake'
  // and an effect called handleIntake() to move it on — so the first COMMITTED
  // frame of a funnel arrival was always the question we already had the answer
  // to, and 'capturing' only arrived one paint later.
  //
  // The fix is to boot into the phase the props already describe: when we were
  // handed a URL and told to auto-start, the intake is DECIDED before the first
  // render, so it is initial state rather than an effect's side effect. The
  // effect that remains does only the things that genuinely cannot be synchronous
  // (a network detect, clearing the carry).
  //
  // Reading the carry inside a lazy initializer is safe: the component renders
  // null until `isClient`, so no server HTML depends on it, and readDoorCarry()
  // is already guarded against sessionStorage not existing.
  const bootUrl = autoStart && initialUrl && !startOnTemplates ? normalizeUrl(initialUrl) : ''
  const boot = !!bootUrl
  const [view, setView] = useState<'intake' | 'capturing' | 'confirm' | 'templates'>(
    boot ? 'capturing' : startOnTemplates ? 'templates' : 'intake',
  )
  const [intake, setIntake] = useState<BrandIntakeValue | null>(() => {
    if (!boot) return null
    const carry = doorCarrySnapshot()
    return { url: bootUrl, text: carry?.text ?? '', files: [], audio: null }
  })
  const [detected, setDetected] = useState<Detected | null>(null)
  // Preselected so "Continua" is live the moment the gallery opens. It used to
  // start null, which meant the primary CTA greeted every owner disabled.
  const [selectedTpl, setSelectedTpl] = useState<string>(BLOG_TEMPLATES[0]?.id ?? '')
  const [applying, setApplying] = useState(false)
  const [busy, setBusy] = useState(false)

  // THE DOOR'S CARRY. On the landing page the visitor already answered this exact
  // question — pasted a URL, dropped a document, or talked. All of that was
  // reduced to strings and left in sessionStorage (see lib/onboarding/glimpse),
  // so the only sin left to commit would be asking them again.
  //
  // Read through useSyncExternalStore rather than an effect: the value exists
  // only in the browser, it never changes after load, and setState-in-an-effect
  // is both a wasted render and a react-hooks v6 error.
  const carried = useSyncExternalStore(subscribeDoorCarry, doorCarrySnapshot, doorCarryServerSnapshot)

  // The seed has to OUTLIVE the carry. clearDoorCarry() nulls the module
  // snapshot, and useSyncExternalStore re-reads it on the very next render —
  // so without this the glimpse would disappear between 'I accept the intake'
  // and 'I render the capture view that needs it', which is one render apart.
  const [seed, setSeed] = useState<BrandSeedCarry | null>(() => {
    if (!boot) return null
    const g = doorCarrySnapshot()?.glimpse
    return g ? { prose: g.prose, siteName: g.siteName, locale: g.locale, palette: g.palette, fonts: g.fonts, pages: g.pages } : null
  })

  // One quick look at the site, purely to learn whether their articles can ride
  // along. Cheap, and it runs while the owner is still reading the screen.
  // useCallback so the seamless-funnel effect below can depend on it honestly
  // instead of silencing the exhaustive-deps rule: it closes over nothing.
  const runDetect = useCallback(async (url: string): Promise<Detected | null> => {
    try {
      const res = await fetch('/api/onboarding/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = (await res.json()) as Detected
      return res.ok && data.ok ? data : null
    } catch {
      return null
    }
  }, [])

  /**
   * THE DETECT IS A PROMISE, NOT A HOPE.
   *
   * What this one round trip decides is not cosmetic: `detected.blogUrl` is what
   * `startClone` hands to the capture as `importArticles`, and `detected.isBlog`
   * is what the confirmation screen says out loud. Both used to READ `detected`
   * — a piece of state that starts null — from code paths that can run before
   * the request has landed:
   *
   *   · on the seamless funnel the detect fires in an effect while the brand
   *     capture runs, and a capture seeded by the Door finishes in ~10s. Beat
   *     the detect and `blogUrl` is '' — the owner's articles are silently not
   *     imported, with nothing anywhere saying why;
   *   · on the confirm screen the copy flips from "la teva identitat" to "el
   *     teu disseny" mid-read when the answer arrives late.
   *
   * So the in-flight request is kept as a promise and every consumer AWAITS it.
   * A ref (not state): it is a handle to work, never something to render, and it
   * is written from an effect or an event handler, never during a render.
   */
  const detecting = useRef<{ url: string; run: Promise<Detected | null> } | null>(null)
  const detectOnce = useCallback((url: string): Promise<Detected | null> => {
    // Keyed on the URL, so a second one can never be answered by the first
    // one's promise — and a repeat of the same URL is never a second request.
    if (detecting.current?.url !== url) {
      detecting.current = { url, run: runDetect(url).then(d => { setDetected(d); return d }) }
    }
    return detecting.current.run
  }, [runDetect])

  const handleIntake = async (value: BrandIntakeValue) => {
    setBusy(true)
    // Anything carried from the landing Door joins what they typed here. It is
    // consumed once and cleared, so a second site does not inherit the first
    // one's story.
    const merged: BrandIntakeValue = carried?.text
      ? { ...value, text: [value.text, carried.text].filter(Boolean).join('\n\n') }
      : value
    // NOTE: the carry is cleared from storage here, but `carried` is the
    // module-level snapshot, so the seed handed to BrandCaptureView below is
    // still the one the Door wrote. Clearing storage stops a SECOND site from
    // inheriting this one's story; it must not erase this site's own.
    if (carried?.glimpse) {
      const g = carried.glimpse
      setSeed({ prose: g.prose, siteName: g.siteName, locale: g.locale, palette: g.palette, fonts: g.fonts, pages: g.pages })
    }
    clearDoorCarry()
    setIntake(merged)
    if (merged.url) await detectOnce(merged.url)
    setBusy(false)
    setView('capturing')
  }

  // The Brand Brain is written. Now the LOOK: clone their site, or — if they never
  // gave us one — let them pick a template.
  /**
   * After the Brand Brain, the LOOK.
   *
   * When the owner came through the landing Door we already know their URL, we
   * already read their site, and they already said yes once — so asking "shall
   * we clone it?" is asking the same question a second time. Founder, 2026-09-16:
   * "si dones continuar va a clonar la web quan ja hauria d'estar fet". It cannot
   * already be done (the visual capture is a different pass from the brand read),
   * but it can start without another click.
   *
   * The confirmation screen survives for everyone who typed a URL here, inside
   * the app, where they have not agreed to anything yet.
   */
  const afterCapture = () => {
    const url = intake?.url
    if (!url) { setView('templates'); return }
    // ONE YES IS ENOUGH. Two paths arrive here having already agreed: the landing
    // Door (we carry its glimpse) and the registration funnel (we were handed the
    // URL and told to start). Showing either of them "shall we clone it?" is
    // asking the same question a second time — the redundant screen the founder
    // kept hitting on the way to the QR. Someone who typed a URL INSIDE the app
    // has agreed to nothing yet, so they still get the confirmation.
    if (boot || seed) { startClone(); return }
    // The confirmation screen is entirely ABOUT what we detected — its heading,
    // its bullet list and its button all change on `isBlog`. Rendering it before
    // the answer arrives is what made the copy rewrite itself mid-read. It is
    // only ever shown with a settled verdict now (in practice instant: the
    // request has been in flight since the intake was accepted).
    setBusy(true)
    void detectOnce(url).then(() => { setBusy(false); setView('confirm') })
  }

  const startClone = () => {
    const target = intake?.url
    if (!target) return
    setBusy(true)
    // AWAIT the detect rather than reading whatever state happens to be there.
    // On the seamless funnel this resolves instantly (it has been running since
    // mount); when it does not, waiting a moment is the difference between
    // importing the owner's articles and quietly not.
    void detectOnce(target).then(d => {
      const blog = d?.blogUrl ?? ''
      setBlogUrl(blog)
      // `afterBrandRead` is how the capture modal knows not to introduce itself
      // ("Visitant el teu lloc") to someone who watched us read that very site
      // thirty seconds ago. See CONTINUED_COPY in ZenCaptureModal.
      onMagicWandStarted({ importArticles: !!blog, afterBrandRead: view === 'capturing' || !!seed })
      setBusy(false)
      void grab(target)
    })
  }

  // Seamless funnel: the capture is ALREADY running (see the `boot` note above —
  // it is the first committed frame). All this effect still owns is the work
  // that cannot happen during render: the one-shot blog detect, and retiring the
  // carry so a second site never inherits this one's story.
  const fired = useRef(false)
  useEffect(() => {
    if (!bootUrl || fired.current) return
    fired.current = true
    clearDoorCarry()
    void detectOnce(bootUrl)
  }, [bootUrl, detectOnce])

  // Applying a template also SEEDS the starter articles (awaited inside
  // applyTemplate), so the CTA shows progress until the blog is truly alive.
  const confirmTemplate = async () => {
    const tpl = BLOG_TEMPLATES.find(t => t.id === selectedTpl)
    if (!tpl || applying) return
    setApplying(true)
    try {
      await applyTemplate(tpl, siteName)
      onTemplateApplied(tpl.name)
    } finally {
      setApplying(false)
    }
  }

  // THE OVERLAY GOES IN A PORTAL, ON document.body.
  //
  // Founder, 2026-09-16: "scroll de pàgina onboarding mostra fragments del fons
  // i no ocupa del tot la pàgina". Two causes, and the portal kills both:
  //
  //   · `position: fixed` is relative to the VIEWPORT only while no ancestor
  //     establishes a containing block. Any transform, filter, perspective or
  //     `contain: paint` anywhere up the dashboard tree — today or in six
  //     months — silently re-anchors it, and the overlay stops covering the
  //     page. On document.body there is no ancestor left that can do that.
  //   · the page behind kept its own scrollbar, so the wheel chained straight
  //     through to the dashboard. Locking the body while this is open is what
  //     stops the background moving underneath.
  //
  // `h-dvh` rather than a bare inset: on mobile the dynamic viewport unit
  // follows the browser chrome as it collapses, which is the other way a strip
  // of what is behind leaks into view.
  const isClient = useIsClient()

  useEffect(() => {
    const body = document.body
    const previous = body.style.overflow
    body.style.setProperty('overflow', 'hidden')
    return () => {
      if (previous) body.style.setProperty('overflow', previous)
      else body.style.removeProperty('overflow')
    }
  }, [])

  if (!isClient) return null

  return createPortal(
    // overflow-x-clip: no decorative element or card can create sideways scroll.
    <div className="fixed inset-0 z-[70] h-dvh w-screen overflow-y-auto overflow-x-clip bg-bg">
      {/* fixed, not absolute: the halos must stay put while the panel scrolls,
          or they slide away and leave a bare band at the bottom. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="halo halo-drift-a" style={{ width: 480, height: 480, background: 'rgba(245,188,0,0.13)', top: -140, left: -100 }} />
        <div className="halo halo-drift-b" style={{ width: 420, height: 420, background: 'rgba(245,188,0,0.09)', bottom: -150, right: -80 }} />
      </div>

      <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-10 sm:px-5 sm:py-12">
        <div className="w-full max-w-4xl">
          {/* Skip — always available, never a dead end. Hidden mid-capture, where
              abandoning would leave a half-written profile. */}
          {view !== 'capturing' && (
            <div className="mb-2 flex justify-end">
              <button
                onClick={onDismiss}
                className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-subtle transition-colors hover:bg-surface-hover hover:text-text"
              >
                Ho configuraré després <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {view === 'intake' && (
            <>
              <BrandIntake
                // Remounts once the carry lands, so a URL pasted on the landing
                // is already in the field rather than arriving after the input
                // has initialised its own state.
                key={carried ? 'carried' : 'fresh'}
                siteName={siteName}
                initialUrl={initialUrl || carried?.url || undefined}
                busy={busy}
                onSubmit={(v) => { void handleIntake(v) }}
                onNoWebsite={() => setView('templates')}
              />
              {/* Punts are front-loaded ON PURPOSE (Fase 2): the free tier is 100
                  punts a month, and an owner who meets the wall before the magic
                  churns. Surfacing the welcome + first-article rewards here means
                  they publish twice in month one. */}
              <div className="mx-auto mt-8 max-w-2xl">
                <RewardTicker />
              </div>
            </>
          )}

          {view === 'capturing' && intake && (
            <BrandCaptureView
              seed={seed}
              siteId={siteId}
              siteName={siteName}
              input={intake}
              onContinue={afterCapture}
            />
          )}

          {view === 'confirm' && (
            <>
              <div className="mb-7 flex items-center justify-center">
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1">
                    <Globe className="h-3 w-3 shrink-0 text-subtle" />
                    <span className="truncate">{detected?.displayUrl ?? intake?.url}</span>
                  </span>
                  {detected?.framework && (
                    <span className="hidden rounded-full bg-accent-soft px-2.5 py-1 text-accent sm:inline">{detected.framework}</span>
                  )}
                </div>
              </div>

              <div className="mb-8 text-center">
                <Wordmark size="text-lg" />
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-text sm:text-3xl">
                  {detected?.isBlog
                    ? <>Ara, el teu disseny<span className="text-accent">.</span></>
                    : <>Ara, la teva identitat<span className="text-accent">.</span></>}
                </h1>
                <p className="mx-auto mt-2.5 max-w-xl text-sm leading-relaxed text-muted">
                  {detected?.isBlog
                    ? 'Et clonem el disseny sencer i hi portem els teus articles.'
                    : 'Clonem la identitat de la teva web i el blog neix nou, a joc amb tot el que ja tens.'}
                </p>
              </div>

              <div className="mx-auto max-w-xl space-y-4">
                <div className="gold-trace gold-trace-aura [--gold-trace-w:1px] lift relative flex flex-col rounded-2xl border border-transparent bg-surface p-7 shadow-card">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-on-accent">
                    {detected?.isBlog ? <Newspaper className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-text">
                    {detected?.isBlog ? 'Clona el teu blog sencer' : 'Crea el blog amb la identitat de la teva web'}
                  </h2>
                  <ul className="mt-3 flex-1 space-y-2">
                    {(detected?.isBlog
                      ? ['El disseny i la capçalera, idèntics', 'Les funcionalitats detectades, com a mòduls', 'Els teus articles, importats']
                      : ['Capçalera i peu, clonats', 'Colors i tipografies exactes', 'Funcionalitats detectades, com a mòduls']
                    ).map(t => (
                      <li key={t} className="flex items-start gap-2.5 text-sm text-muted">
                        <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <Button glow size="lg" fullWidth className="mt-5" onClick={startClone} iconLeft={<Wand2 className="h-4 w-4" />}>
                    {detected?.isBlog ? 'Clonar-ho tot' : 'Crear el meu blog'}
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setView('templates')}
                  className="mx-auto block cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
                >
                  Prefereixo començar amb una plantilla
                </button>
              </div>
            </>
          )}

          {view === 'templates' && (
            <>
              <div className="mb-7 flex items-center justify-between">
                {/* Arriving straight from "no tinc web" there is nowhere to go
                    back TO — the intake was never shown. Offer it forward
                    instead, so the owner who does have a site can still say so. */}
                <Button
                  onClick={() => setView(intake?.url ? 'confirm' : 'intake')}
                  variant="ghost"
                  size="sm"
                  disabled={applying}
                  iconLeft={startOnTemplates && !intake ? undefined : <ArrowLeft className="h-4 w-4" />}
                >
                  {startOnTemplates && !intake ? 'Sí que en tinc, de web' : 'Enrere'}
                </Button>
                <h2 className="text-lg font-semibold text-text">Tria una plantilla</h2>
                <span className="w-20" />
              </div>

              {/* Card = the choice. One tap selects; the single CTA below confirms. */}
              <div className="grid gap-5 pb-28 sm:grid-cols-2">
                {BLOG_TEMPLATES.map(tpl => (
                  <TemplateCard
                    key={tpl.id}
                    tpl={tpl}
                    siteName={siteName}
                    selected={selectedTpl === tpl.id}
                    disabled={applying}
                    onPick={() => setSelectedTpl(tpl.id)}
                  />
                ))}
              </div>

              <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg/85 backdrop-blur-md">
                <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                  <p className="min-w-0 truncate text-sm text-muted">
                    Plantilla: <span className="font-bold text-text">{BLOG_TEMPLATES.find(t => t.id === selectedTpl)?.name}</span>
                  </p>
                  <Button
                    glow
                    size="lg"
                    onClick={() => void confirmTemplate()}
                    loading={applying}
                    disabled={!selectedTpl}
                    iconRight={<ArrowRight className="h-4 w-4" />}
                    className="shrink-0"
                  >
                    {applying ? 'Preparant el teu blog…' : 'Continua'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// A TRUE live preview: an iframe rendering the exact HTML the public blog would
// ship for this template (real header + feed + footer), scaled to fit the card.
function TemplatePreview({ tpl, siteName }: { tpl: BlogTemplate; siteName: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.32)
  const DESIGN_W = 1280
  const DESIGN_H = 760

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / DESIGN_W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const src = `/api/theme/template-preview?tpl=${encodeURIComponent(tpl.id)}&name=${encodeURIComponent(siteName)}`
  const h = Math.round(DESIGN_H * scale)
  return (
    <div
      ref={wrapRef}
      // content-visibility: an off-screen preview in the gallery costs nothing to
      // render until it scrolls in. Eight live iframes is otherwise real work for a
      // screen where the owner looks at two of them.
      className="relative w-full overflow-hidden border-b border-border [content-visibility:auto]"
      style={{ height: h, background: tpl.swatch.bg, containIntrinsicSize: `auto ${h}px` }}
    >
      <iframe
        src={src}
        title={`Vista prèvia · ${tpl.name}`}
        loading="lazy"
        scrolling="no"
        tabIndex={-1}
        aria-hidden
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
      {/* Subtle top sheen so the scaled frame reads as a device, not a flat image. */}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
    </div>
  )
}

// The whole card is the toggle (aria-pressed): tap to choose, gold ring + badge
// confirm the selection. No per-card buttons — one global "Continua" proceeds.
function TemplateCard({ tpl, siteName, selected, disabled, onPick }: {
  tpl: BlogTemplate
  siteName: string
  selected: boolean
  disabled: boolean
  onPick: () => void
}) {
  const arch = archetypeForTemplate(tpl.id)
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl border bg-surface text-left shadow-card transition-all flex flex-col',
        selected
          ? 'border-accent ring-2 ring-accent/30 shadow-pop'
          : 'border-border hover:border-border-strong hover:shadow-pop hover:-translate-y-0.5',
        disabled && !selected && 'opacity-60',
      )}
    >
      <TemplatePreview tpl={tpl} siteName={siteName} />

      {/* Selection badge — pops in over the preview's corner. */}
      <span
        aria-hidden
        className={cn(
          'absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all',
          selected
            ? 'zen-pop border-accent bg-accent text-on-accent shadow-[0_4px_14px_-4px_rgba(245,188,0,0.7)]'
            : 'border-border-strong bg-bg-elevated/80 text-transparent backdrop-blur-sm group-hover:border-accent/60',
        )}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>

      {/* <span>, not <div>: a <button> may only contain phrasing content. */}
      <span className="flex flex-1 items-center gap-2.5 p-4">
        <span className="w-3.5 h-3.5 shrink-0 rounded-full ring-2 ring-bg-elevated shadow-sm" style={{ background: tpl.swatch.accent }} aria-hidden />
        <span className="min-w-0">
          <span className={cn('block text-base font-semibold', selected ? 'text-accent' : 'text-text')}>{tpl.name}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{tpl.tagline}</span>
          {/* A look that backs one of the three archetypes says so: picking it
              brings that whole module set, configured — not a bare skin. */}
          {arch && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wider text-accent">
              {arch.name} · {Object.keys(arch.modules).length} mòduls
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
