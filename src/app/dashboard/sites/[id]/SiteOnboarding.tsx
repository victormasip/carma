'use client'

// Full-page onboarding shown on a brand-new site (no theme, no posts).
//
// Three entry paths, with AUTO-DETECTION in the middle of the first one:
//   1. "La meva web" — one quick fetch (/api/onboarding/detect) answers whether
//      the site HAS a blog. With a blog → choose "clone my ENTIRE blog"
//      (design + features + article import) or "new blog with my web's styles".
//      Without one → a single clear path (styles clone), plus a manual
//      "my blog lives elsewhere" escape hatch.
//   2. "Un blog que admiro" — clone ANOTHER site's blog design + features
//      (never its content — the articles will be the user's own).
//   3. Templates — hand-designed premium looks, each shipping with its matching
//      feed layout and Smart Modules already on.
//
// It lives INSIDE the ThemeStudioProvider so it can drive grab()/applyTemplate()
// directly; the host (SiteDetailClient) coordinates dismissal, tab switching and
// the post-capture import via callbacks.

import { useState, useRef, useEffect } from 'react'
import {
  Wand2, Palette, Globe, ArrowRight, ArrowLeft, Sparkles, Check, X, Newspaper, Search, FileText,
} from 'lucide-react'
import { BLOG_TEMPLATES, type BlogTemplate } from '@/lib/render/templates'
import { useThemeStudio } from './ThemeStudioContext'
import Button from '@/components/ui/Button'
import Wordmark from '@/components/ui/Wordmark'

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
  siteName, initialUrl, autoStart, onMagicWandStarted, onTemplateApplied, onDismiss,
}: {
  siteName: string
  /** Prefill the Magic Wand URL (carried from the public landing funnel). */
  initialUrl?: string
  /** Immediately fire the clone on mount (seamless funnel from registration). */
  autoStart?: boolean
  onMagicWandStarted: (opts?: { importArticles?: boolean }) => void
  onTemplateApplied: (templateName: string) => void
  onDismiss: () => void
}) {
  const { grab, applyTemplate, setBlogUrl } = useThemeStudio()
  const [view, setView] = useState<'choose' | 'options' | 'templates'>('choose')
  const [url, setUrl] = useState(initialUrl ?? '')
  const [admiredUrl, setAdmiredUrl] = useState('')
  const [manualBlogUrl, setManualBlogUrl] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState('')
  const [detected, setDetected] = useState<Detected | null>(null)

  // Path 1, step 1: ONE quick look at the user's site → adaptive options.
  const analyzeMyWeb = async () => {
    const target = normalizeUrl(url)
    if (!target || detecting) return
    setDetecting(true)
    setDetectError('')
    try {
      const res = await fetch('/api/onboarding/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const data = (await res.json()) as Detected
      if (!res.ok || !data.ok) {
        setDetectError(data.error || 'No hem pogut llegir aquesta web. Comprova l’adreça.')
        return
      }
      setDetected(data)
      setView('options')
    } catch {
      setDetectError('No hem pogut llegir aquesta web. Torna-ho a provar.')
    } finally {
      setDetecting(false)
    }
  }

  // Path 1a — FULL blog clone: design + features + the user's own articles.
  const startFullClone = (blogOverride?: string) => {
    if (!detected) return
    setBlogUrl(blogOverride ?? detected.blogUrl ?? '')
    onMagicWandStarted({ importArticles: true })
    void grab(detected.url)
  }

  // Path 1b — styles only: the web's identity, a blank blog.
  const startStylesOnly = () => {
    if (!detected) return
    setBlogUrl('')
    onMagicWandStarted({ importArticles: false })
    void grab(detected.url)
  }

  // Path 2 — clone a blog the user ADMIRES: design + features, NEVER its content.
  const startAdmiredClone = () => {
    const target = normalizeUrl(admiredUrl)
    if (!target) return
    setBlogUrl('')
    onMagicWandStarted({ importArticles: false })
    void grab(target)
  }

  // Seamless funnel: when arriving from registration with a target URL, kick the
  // Magic Wand automatically so the user watches their site assemble itself.
  const fired = useRef(false)
  useEffect(() => {
    if (autoStart && initialUrl && !fired.current) {
      fired.current = true
      onMagicWandStarted({ importArticles: true })
      void grab(normalizeUrl(initialUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, initialUrl])

  const pickTemplate = (tpl: BlogTemplate) => {
    applyTemplate(tpl, siteName)
    onTemplateApplied(tpl.name)
  }

  // Seamless funnel: the user arrived from signup with a target URL, so the
  // capture has already started on mount. We never flash the chooser behind the
  // Zen capture card — just a calm, breathing backdrop. Nothing to read, nothing
  // to decide.
  if (autoStart && initialUrl) {
    return (
      <div className="fixed inset-0 z-40 overflow-hidden bg-bg">
        <div className="halo halo-drift-a" style={{ width: 460, height: 460, background: 'rgba(245,188,0,0.20)', top: -120, left: -80 }} aria-hidden />
        <div className="halo halo-drift-b" style={{ width: 420, height: 420, background: 'rgba(245,188,0,0.14)', bottom: -140, right: -60 }} aria-hidden />
        <div className="relative flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <Wordmark size="text-2xl" />
          <p className="text-sm text-muted">
            Estem creant <span className="font-semibold text-text">{siteName}</span>…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-4xl">
          {/* Skip */}
          <div className="flex justify-end mb-2">
            <button
              onClick={onDismiss}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-subtle hover:text-text hover:bg-surface-hover rounded-lg transition-colors"
            >
              Ho configuraré després <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {view === 'choose' && (
            <>
              <div className="text-center mb-9">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-soft text-accent text-xs font-semibold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3.5 h-3.5" /> Nou lloc
                </span>
                <h1 className="text-3xl sm:text-4xl font-bold text-text tracking-tight">
                  Com vols començar amb <span className="text-accent">{siteName}</span>?
                </h1>
                <p className="text-sm text-muted mt-3 max-w-xl mx-auto leading-relaxed">
                  Analitzem la teva web i et proposem el millor camí, clonem el disseny d’un blog que admires, o arrenca des d’una plantilla premium.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-5">
                {/* 1 · My web → detect first */}
                <div className="lift relative bg-surface border border-border rounded-2xl p-6 shadow-card hover:border-border-strong flex flex-col">
                  <div className="w-11 h-11 rounded-xl bg-accent text-on-accent flex items-center justify-center">
                    <Wand2 className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-semibold text-text mt-4">La meva web</h2>
                  <p className="text-sm text-muted mt-1.5 flex-1 leading-relaxed">
                    L&apos;analitzem: si ja tens blog, te&apos;l clonem sencer (articles inclosos); si no, creem el blog amb els teus estils.
                  </p>
                  <div className="mt-5 space-y-2.5">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
                      <input
                        type="url"
                        value={url}
                        onChange={e => { setUrl(e.target.value); setDetectError('') }}
                        onKeyDown={e => e.key === 'Enter' && void analyzeMyWeb()}
                        placeholder="la-meva-web.com"
                        className="w-full h-10 pl-9 pr-3 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text placeholder:text-subtle transition-colors"
                      />
                    </div>
                    {detectError && <p className="text-xs font-medium text-danger">{detectError}</p>}
                    <Button
                      glow
                      onClick={() => void analyzeMyWeb()}
                      loading={detecting}
                      disabled={!url.trim()}
                      fullWidth
                      iconLeft={<Search className="w-4 h-4" />}
                    >
                      Analitza la meva web
                    </Button>
                  </div>
                </div>

                {/* 2 · A blog I admire */}
                <div className="lift relative bg-surface border border-border rounded-2xl p-6 shadow-card hover:border-border-strong flex flex-col">
                  <div className="w-11 h-11 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                    <Newspaper className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-semibold text-text mt-4">Un blog que admiro</h2>
                  <p className="text-sm text-muted mt-1.5 flex-1 leading-relaxed">
                    El disseny, les targetes i les funcionalitats (cercador, newsletter…) d&apos;aquell blog — al teu. El contingut serà teu.
                  </p>
                  <div className="mt-5 space-y-2.5">
                    <div className="relative">
                      <Newspaper className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
                      <input
                        type="url"
                        value={admiredUrl}
                        onChange={e => setAdmiredUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && startAdmiredClone()}
                        placeholder="blog-que-admiro.com"
                        className="w-full h-10 pl-9 pr-3 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text placeholder:text-subtle transition-colors"
                      />
                    </div>
                    <Button
                      onClick={startAdmiredClone}
                      disabled={!admiredUrl.trim()}
                      variant="secondary"
                      fullWidth
                      iconLeft={<Sparkles className="w-4 h-4" />}
                    >
                      Clonar aquest blog
                    </Button>
                  </div>
                </div>

                {/* 3 · Templates */}
                <div className="lift relative bg-surface border border-border rounded-2xl p-6 shadow-card hover:border-border-strong flex flex-col">
                  <div className="w-11 h-11 rounded-xl bg-text text-bg-elevated flex items-center justify-center">
                    <Palette className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-semibold text-text mt-4">Comença amb una plantilla</h2>
                  <p className="text-sm text-muted mt-1.5 flex-1 leading-relaxed">
                    {BLOG_TEMPLATES.length} identitats completes — cadascuna amb la seva disposició i mòduls ja activats.
                  </p>
                  <div className="mt-5 flex -space-x-2">
                    {BLOG_TEMPLATES.map(t => (
                      <span
                        key={t.id}
                        className="w-9 h-9 rounded-xl border-2 border-bg-elevated"
                        style={{ background: t.swatch.bg }}
                        title={t.name}
                      >
                        <span className="block w-full h-full rounded-[0.55rem]" style={{ background: `linear-gradient(135deg, ${t.swatch.surface} 55%, ${t.swatch.accent})` }} />
                      </span>
                    ))}
                  </div>
                  <Button
                    onClick={() => setView('templates')}
                    variant="secondary"
                    fullWidth
                    iconRight={<ArrowRight className="w-4 h-4" />}
                    className="mt-5"
                  >
                    Veure plantilles
                  </Button>
                </div>
              </div>
            </>
          )}

          {view === 'options' && detected && (
            <>
              <div className="flex items-center justify-between mb-7">
                <Button onClick={() => setView('choose')} variant="ghost" size="sm" iconLeft={<ArrowLeft className="w-4 h-4" />}>
                  Enrere
                </Button>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1">
                    <Globe className="w-3 h-3 text-subtle" /> {detected.displayUrl}
                  </span>
                  {detected.framework && (
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">{detected.framework}</span>
                  )}
                </div>
                <span className="w-20" />
              </div>

              <div className="text-center mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">
                  {detected.isBlog
                    ? <>Hem trobat el teu blog<span className="text-accent">.</span></>
                    : <>La teva web no té blog — encara<span className="text-accent">.</span></>}
                </h1>
                <p className="text-sm text-muted mt-2.5 max-w-xl mx-auto leading-relaxed">
                  {detected.isBlog
                    ? `${detected.blogUrl ? `L'hem detectat a ${detected.blogUrl.replace(/^https?:\/\//, '')}. ` : ''}Tria què en vols portar a Carma.`
                    : 'Cap problema: clonem la identitat de la teva web i el blog neix nou, a joc amb tot el que ja tens.'}
                </p>
              </div>

              {detected.isBlog ? (
                <div className="grid md:grid-cols-2 gap-5">
                  {/* FULL clone */}
                  <div className="gold-trace gold-trace-aura [--gold-trace-w:1px] lift relative bg-surface border border-transparent rounded-2xl p-7 shadow-card flex flex-col">
                    <div className="w-11 h-11 rounded-xl bg-accent text-on-accent flex items-center justify-center">
                      <Newspaper className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-bold text-text mt-4">Clona el teu blog sencer</h2>
                    <ul className="mt-3 space-y-2 flex-1">
                      {['El disseny i la capçalera, idèntics', 'Les funcionalitats detectades, com a mòduls', 'Els teus articles, importats'].map(t => (
                        <li key={t} className="flex items-start gap-2.5 text-sm text-muted">
                          <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"><Check className="w-2.5 h-2.5" strokeWidth={3.5} /></span>
                          {t}
                        </li>
                      ))}
                    </ul>
                    <Button glow onClick={() => startFullClone()} fullWidth iconLeft={<Wand2 className="w-4 h-4" />} className="mt-5">
                      Clonar-ho tot
                    </Button>
                  </div>

                  {/* Styles only */}
                  <div className="lift relative bg-surface border border-border rounded-2xl p-7 shadow-card hover:border-border-strong flex flex-col">
                    <div className="w-11 h-11 rounded-xl bg-surface-subtle text-muted flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-bold text-text mt-4">Blog nou amb els teus estils</h2>
                    <p className="text-sm text-muted mt-3 flex-1 leading-relaxed">
                      Clonem la identitat de la web (capçalera, colors, tipografies) però el blog comença en blanc — sense importar els articles antics.
                    </p>
                    <Button onClick={startStylesOnly} variant="secondary" fullWidth iconLeft={<Sparkles className="w-4 h-4" />} className="mt-5">
                      Començar de zero amb el meu estil
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="gold-trace gold-trace-aura [--gold-trace-w:1px] lift relative bg-surface border border-transparent rounded-2xl p-7 shadow-card flex flex-col">
                    <div className="w-11 h-11 rounded-xl bg-accent text-on-accent flex items-center justify-center">
                      <Wand2 className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-bold text-text mt-4">Crea el blog amb els estils de la teva web</h2>
                    <ul className="mt-3 space-y-2">
                      {['Capçalera i peu, clonats', 'Colors i tipografies exactes', 'Funcionalitats detectades, com a mòduls'].map(t => (
                        <li key={t} className="flex items-start gap-2.5 text-sm text-muted">
                          <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"><Check className="w-2.5 h-2.5" strokeWidth={3.5} /></span>
                          {t}
                        </li>
                      ))}
                    </ul>
                    <Button glow onClick={startStylesOnly} fullWidth iconLeft={<Wand2 className="w-4 h-4" />} className="mt-5">
                      Crear el meu blog
                    </Button>
                  </div>

                  {/* Escape hatch: the detector missed it / the blog lives on another host. */}
                  <div className="rounded-2xl border border-border bg-surface-subtle p-5">
                    <p className="text-sm font-semibold text-text">El teu blog és en una altra adreça?</p>
                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="url"
                        value={manualBlogUrl}
                        onChange={e => setManualBlogUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && manualBlogUrl.trim() && startFullClone(normalizeUrl(manualBlogUrl))}
                        placeholder="la-meva-web.com/blog"
                        className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent"
                      />
                      <Button
                        onClick={() => startFullClone(normalizeUrl(manualBlogUrl))}
                        disabled={!manualBlogUrl.trim()}
                        variant="secondary"
                        iconLeft={<Newspaper className="w-4 h-4" />}
                      >
                        Clonar-lo sencer
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {view === 'templates' && (
            <>
              <div className="flex items-center justify-between mb-7">
                <Button
                  onClick={() => setView('choose')}
                  variant="ghost"
                  size="sm"
                  iconLeft={<ArrowLeft className="w-4 h-4" />}
                >
                  Enrere
                </Button>
                <h2 className="text-lg font-semibold text-text">Tria una plantilla</h2>
                <span className="w-20" />
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                {BLOG_TEMPLATES.map(tpl => (
                  <TemplateCard key={tpl.id} tpl={tpl} siteName={siteName} onPick={() => pickTemplate(tpl)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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
  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden border-b border-border"
      style={{ height: Math.round(DESIGN_H * scale), background: tpl.swatch.bg }}
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

function TemplateCard({ tpl, siteName, onPick }: { tpl: BlogTemplate; siteName: string; onPick: () => void }) {
  return (
    <div className="group bg-surface border border-border rounded-2xl overflow-hidden shadow-card hover:border-border-strong hover:shadow-pop transition-all flex flex-col">
      <TemplatePreview tpl={tpl} siteName={siteName} />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full ring-2 ring-bg-elevated shadow-sm" style={{ background: tpl.swatch.accent }} aria-hidden />
          <h3 className="text-base font-semibold text-text">{tpl.name}</h3>
        </div>
        <p className="text-xs text-muted mt-1.5 flex-1 leading-relaxed">{tpl.tagline}</p>
        <Button
          onClick={onPick}
          fullWidth
          iconLeft={<Check className="w-4 h-4" />}
          className="mt-4"
        >
          Usar «{tpl.name}»
        </Button>
      </div>
    </div>
  )
}
