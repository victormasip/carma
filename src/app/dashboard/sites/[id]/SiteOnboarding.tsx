'use client'

// Full-page onboarding shown on a brand-new site (no theme, no posts). It offers
// the two ways to build a blog:
//   1. Magic Wand — replicate an existing site from its URL (then, if WordPress,
//      the host offers a one-click article import).
//   2. Template — apply one of several hand-designed modern looks, from scratch.
//
// It lives INSIDE the ThemeStudioProvider so it can drive grab()/applyTemplate()
// directly; the host (SiteDetailClient) coordinates dismissal, tab switching and
// the post-capture import via callbacks.

import { useState, useRef, useEffect } from 'react'
import { Wand2, Palette, Globe, ArrowRight, ArrowLeft, Sparkles, Check, X } from 'lucide-react'
import { BLOG_TEMPLATES, type BlogTemplate } from '@/lib/render/templates'
import { useThemeStudio } from './ThemeStudioContext'
import Button from '@/components/ui/Button'

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

export default function SiteOnboarding({
  siteName, onMagicWandStarted, onTemplateApplied, onDismiss,
}: {
  siteName: string
  onMagicWandStarted: () => void
  onTemplateApplied: (templateName: string) => void
  onDismiss: () => void
}) {
  const { grab, applyTemplate } = useThemeStudio()
  const [view, setView] = useState<'choose' | 'templates'>('choose')
  const [url, setUrl] = useState('')

  const startMagicWand = () => {
    const target = normalizeUrl(url)
    if (!target) return
    onMagicWandStarted()
    void grab(target)
  }

  const pickTemplate = (tpl: BlogTemplate) => {
    applyTemplate(tpl, siteName)
    onTemplateApplied(tpl.name)
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

          {view === 'choose' ? (
            <>
              <div className="text-center mb-9">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-soft text-accent text-[11px] font-semibold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3.5 h-3.5" /> Nou lloc
                </span>
                <h1 className="text-3xl sm:text-4xl font-bold text-text tracking-tight">
                  Com vols començar amb <span className="text-accent">{siteName}</span>?
                </h1>
                <p className="text-sm text-muted mt-3 max-w-xl mx-auto leading-relaxed">
                  Replica el disseny d’una web que ja existeix amb la nostra eina màgica, o arrenca des d’una plantilla moderna. Sempre podràs personalitzar-ho després.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                {/* Magic Wand */}
                <div className="relative bg-surface border border-border rounded-2xl p-8 shadow-card hover:border-border-strong hover:shadow-pop transition-all flex flex-col">
                  <div className="w-11 h-11 rounded-xl bg-accent text-on-accent flex items-center justify-center">
                    <Wand2 className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-semibold text-text mt-4">Replica una web existent</h2>
                  <p className="text-sm text-muted mt-1.5 flex-1 leading-relaxed">
                    Enganxa la URL del lloc del client. Injectem la seva capçalera i el seu peu originals tal qual (amb els seus estils) al voltant del blog, i n’extreiem colors i tipografies. Si és WordPress, t’oferim importar-ne els articles.
                  </p>
                  <div className="mt-5 space-y-2.5">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
                      <input
                        type="url"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && startMagicWand()}
                        placeholder="https://www.elmeuclient.com"
                        className="w-full h-10 pl-9 pr-3 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text placeholder:text-subtle transition-colors"
                      />
                    </div>
                    <Button
                      onClick={startMagicWand}
                      disabled={!url.trim()}
                      fullWidth
                      iconLeft={<Wand2 className="w-4 h-4" />}
                    >
                      Capturar amb la vareta màgica
                    </Button>
                  </div>
                </div>

                {/* Template */}
                <div className="relative bg-surface border border-border rounded-2xl p-8 shadow-card hover:border-border-strong hover:shadow-pop transition-all flex flex-col">
                  <div className="w-11 h-11 rounded-xl bg-text text-bg-elevated flex items-center justify-center">
                    <Palette className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-semibold text-text mt-4">Comença des d’una plantilla</h2>
                  <p className="text-sm text-muted mt-1.5 flex-1 leading-relaxed">
                    Tria un dels nostres dissenys moderns —editorial, magazine, minimal o fosc— i tindràs un blog espectacular a l’instant, llest per editar.
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
          ) : (
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
