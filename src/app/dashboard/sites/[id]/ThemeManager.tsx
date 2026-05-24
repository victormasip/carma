'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Palette, Globe, Loader2, Wand2, Save, AlertCircle, ExternalLink,
  ChevronDown, ChevronUp, Trash2, Sparkles, Plug, Type, RefreshCw, Monitor,
  PanelTop, PanelBottom, Check,
} from 'lucide-react'
import { saveTheme, deleteTheme, type ThemeData } from '@/lib/actions/theme'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Modal'

export type Theme = {
  site_id?: string
  reference_url?: string | null
  reference_url_home?: string | null
  extracted_head?: string | null
  extracted_header?: string | null
  extracted_footer?: string | null
  extracted_scripts?: string | null
  external_styles?: string[] | null
  external_scripts?: string[] | null
  font_links?: string[] | null
  base_url?: string | null
  detected_framework?: string | null
  detected_hosting?: string | null
  design_tokens?: Partial<DesignTokens> | null
}

type AnalyzeResponse = {
  extracted_head: string
  extracted_header: string
  extracted_footer: string
  extracted_scripts: string
  external_styles: string[]
  external_scripts: string[]
  font_links: string[]
  detection: { framework: string; hosting: string | null }
  base_url: string
  tokens: DesignTokens
  error?: string
}

const FRAMEWORK_LABELS: Record<string, string> = {
  wordpress: 'WordPress', nextjs: 'Next.js', astro: 'Astro', gatsby: 'Gatsby',
  hugo: 'Hugo', jekyll: 'Jekyll', webflow: 'Webflow', squarespace: 'Squarespace',
  wix: 'Wix', shopify: 'Shopify', vue: 'Vue', react: 'React', html: 'HTML estàtic',
}
const HOSTING_LABELS: Record<string, string> = {
  vercel: 'Vercel', netlify: 'Netlify', cloudflare: 'Cloudflare',
  aws: 'AWS', github: 'GitHub Pages', wpengine: 'WP Engine',
}

const COLOR_FIELDS: { key: keyof DesignTokens; label: string }[] = [
  { key: 'colorPrimary', label: 'Primari' },
  { key: 'colorAccent', label: 'Accent / enllaços' },
  { key: 'colorBg', label: 'Fons' },
  { key: 'colorSurface', label: 'Superfície (cards)' },
  { key: 'colorText', label: 'Text' },
  { key: 'colorMuted', label: 'Text secundari' },
  { key: 'colorBorder', label: 'Vores' },
]
const FONT_FIELDS: { key: keyof DesignTokens; label: string }[] = [
  { key: 'fontHeading', label: 'Tipografia títols' },
  { key: 'fontBody', label: 'Tipografia text' },
]
const SCALE_FIELDS: { key: keyof DesignTokens; label: string; placeholder: string }[] = [
  { key: 'baseFontSize', label: 'Mida base', placeholder: '16px' },
  { key: 'radius', label: 'Radi', placeholder: '10px' },
  { key: 'radiusLg', label: 'Radi gran', placeholder: '16px' },
  { key: 'maxWidth', label: 'Amplada màx.', placeholder: '1200px' },
]

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v.trim())

export default function ThemeManager({ siteId, initialTheme }: { siteId: string; initialTheme: Theme | null }) {
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()

  const [url, setUrl] = useState(initialTheme?.reference_url ?? initialTheme?.reference_url_home ?? '')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [extractedHead, setExtractedHead] = useState(initialTheme?.extracted_head ?? '')
  const [extractedHeader, setExtractedHeader] = useState(initialTheme?.extracted_header ?? '')
  const [extractedFooter, setExtractedFooter] = useState(initialTheme?.extracted_footer ?? '')
  const [extractedScripts, setExtractedScripts] = useState(initialTheme?.extracted_scripts ?? '')
  const [externalStyles, setExternalStyles] = useState<string[]>(initialTheme?.external_styles ?? [])
  const [externalScripts, setExternalScripts] = useState<string[]>(initialTheme?.external_scripts ?? [])
  const [fontLinks, setFontLinks] = useState<string[]>(initialTheme?.font_links ?? [])
  const [baseUrl, setBaseUrl] = useState(initialTheme?.base_url ?? '')
  const [detectedFramework, setDetectedFramework] = useState<string | null>(initialTheme?.detected_framework ?? null)
  const [detectedHosting, setDetectedHosting] = useState<string | null>(initialTheme?.detected_hosting ?? null)
  const [tokens, setTokens] = useState<DesignTokens>({ ...DEFAULT_TOKENS, ...(initialTheme?.design_tokens ?? {}) })

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewLoading, setPreviewLoading] = useState(!!initialTheme)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const hasTheme = !!initialTheme
  const grabbed = !!extractedHeader || !!extractedFooter || !!extractedHead || hasTheme
  const renderUrl = `/render/${siteId}`

  const buildThemeData = (): ThemeData => ({
    reference_url: url || null,
    extracted_head: extractedHead || null,
    extracted_header: extractedHeader || null,
    extracted_footer: extractedFooter || null,
    extracted_scripts: extractedScripts || null,
    external_styles: externalStyles,
    external_scripts: externalScripts,
    font_links: fontLinks,
    base_url: baseUrl || null,
    detected_framework: detectedFramework,
    detected_hosting: detectedHosting,
    design_tokens: tokens,
  })

  const refreshPreview = useCallback(async (theme: ThemeData) => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch('/api/theme/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, theme }),
      })
      const data = await res.json()
      if (!res.ok) { setPreviewError(data.error ?? 'Error generant la vista prèvia'); return }
      setPreviewHtml(data.html)
    } catch {
      setPreviewError('Error de xarxa generant la vista prèvia')
    } finally {
      setPreviewLoading(false)
    }
  }, [siteId])

  // Render an initial preview for already-configured themes, built from the
  // stable initialTheme prop. State is only set inside async callbacks (never
  // synchronously in the effect body).
  useEffect(() => {
    if (!initialTheme) return
    let active = true
    const theme: ThemeData = {
      reference_url: initialTheme.reference_url ?? null,
      extracted_head: initialTheme.extracted_head ?? null,
      extracted_header: initialTheme.extracted_header ?? null,
      extracted_footer: initialTheme.extracted_footer ?? null,
      extracted_scripts: initialTheme.extracted_scripts ?? null,
      external_styles: initialTheme.external_styles ?? [],
      external_scripts: initialTheme.external_scripts ?? [],
      font_links: initialTheme.font_links ?? [],
      base_url: initialTheme.base_url ?? null,
      detected_framework: initialTheme.detected_framework ?? null,
      detected_hosting: initialTheme.detected_hosting ?? null,
      design_tokens: { ...DEFAULT_TOKENS, ...(initialTheme.design_tokens ?? {}) },
    }
    fetch('/api/theme/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, theme }),
    })
      .then(res => res.json())
      .then(data => {
        if (!active) return
        if (data?.html) setPreviewHtml(data.html)
        else if (data?.error) setPreviewError(data.error)
      })
      .catch(() => { if (active) setPreviewError('Error de xarxa generant la vista prèvia') })
      .finally(() => { if (active) setPreviewLoading(false) })
    return () => { active = false }
  }, [initialTheme, siteId])

  const handleGrab = async () => {
    const target = url.trim()
    if (!target) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await fetch('/api/theme/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const data: AnalyzeResponse = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error desconegut'); return }

      setExtractedHead(data.extracted_head)
      setExtractedHeader(data.extracted_header)
      setExtractedFooter(data.extracted_footer)
      setExtractedScripts(data.extracted_scripts ?? '')
      setExternalStyles(data.external_styles ?? [])
      setExternalScripts(data.external_scripts ?? [])
      setFontLinks(data.font_links ?? [])
      setBaseUrl(data.base_url)
      setDetectedFramework(data.detection?.framework ?? null)
      setDetectedHosting(data.detection?.hosting ?? null)
      const newTokens = { ...DEFAULT_TOKENS, ...(data.tokens ?? {}) }
      setTokens(newTokens)

      toast('Tema capturat correctament')
      void refreshPreview({
        reference_url: target,
        extracted_head: data.extracted_head || null,
        extracted_header: data.extracted_header || null,
        extracted_footer: data.extracted_footer || null,
        extracted_scripts: data.extracted_scripts || null,
        external_styles: data.external_styles ?? [],
        external_scripts: data.external_scripts ?? [],
        font_links: data.font_links ?? [],
        base_url: data.base_url || null,
        detected_framework: data.detection?.framework ?? null,
        detected_hosting: data.detection?.hosting ?? null,
        design_tokens: newTokens,
      })
    } catch {
      setError('Error de xarxa')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveTheme(siteId, buildThemeData())
      if (result.error) { toast(result.error, 'error'); return }
      toast('Tema desat correctament')
      router.refresh()
    })
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Eliminar el tema',
      message: 'Les pàgines de render tornaran al disseny per defecte. Aquesta acció no es pot desfer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteTheme(siteId)
      if (result.error) { toast(result.error, 'error'); return }
      toast('Tema eliminat')
      router.refresh()
    })
  }

  const setToken = (key: keyof DesignTokens, value: string) => setTokens(t => ({ ...t, [key]: value }))

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-carma-500/10 blur-[80px] pointer-events-none rounded-full" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-carma-500/20 text-carma-300 rounded-2xl flex items-center justify-center">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Theme Grabber</h3>
              <p className="text-xs font-medium text-neutral-400 mt-1 max-w-md">
                Enganxa la URL del lloc del client. Carma replica el header i footer originals i n&apos;extreu els colors i tipografies per vestir el blog amb la seva identitat.
              </p>
            </div>
          </div>
          {hasTheme && (
            <Link
              href={renderUrl}
              target="_blank"
              className="cursor-pointer flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Veure render
            </Link>
          )}
        </div>
      </div>

      {/* URL grabber */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">1</span>
          <h4 className="text-sm font-bold text-neutral-900">Capturar el look &amp; feel</h4>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGrab()}
              placeholder="https://www.elmeuclient.com"
              disabled={analyzing}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-carma-500 text-sm font-medium transition-all disabled:opacity-60"
            />
          </div>
          <button
            onClick={handleGrab}
            disabled={!url.trim() || analyzing}
            className="cursor-pointer px-5 py-2.5 bg-carma-500 hover:bg-carma-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {grabbed ? 'Tornar a capturar' : 'Capturar tema'}
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 font-medium">{error}</p>
          </div>
        )}
      </div>

      {/* Detected framework banner */}
      {detectedFramework && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-500 text-white rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-green-700">Framework detectat</span>
            <p className="text-sm font-bold text-neutral-900 mt-0.5">
              {FRAMEWORK_LABELS[detectedFramework] ?? detectedFramework}
              {detectedHosting && (
                <span className="font-normal text-neutral-500"> · hosting {HOSTING_LABELS[detectedHosting] ?? detectedHosting}</span>
              )}
            </p>
          </div>
          <Link
            href={`/dashboard/sites/${siteId}?tab=connexio`}
            className="cursor-pointer flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shrink-0"
          >
            <Plug className="w-3.5 h-3.5" />
            Connexió
          </Link>
        </div>
      )}

      {grabbed && (
        <>
          {/* Design tokens editor */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">2</span>
              <h4 className="text-sm font-bold text-neutral-900">Design tokens</h4>
            </div>
            <p className="text-xs text-neutral-500 mb-4 ml-8">Colors i tipografies aplicats a les nostres plantilles de blog. Ajusta&apos;ls si la detecció no és perfecta.</p>

            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {COLOR_FIELDS.map(({ key, label }) => {
                const value = String(tokens[key] ?? '')
                return (
                  <div key={key} className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-neutral-500 w-32 shrink-0">{label}</label>
                    <span
                      className="w-7 h-7 rounded-lg border border-neutral-200 shrink-0"
                      style={{ background: value }}
                      aria-hidden
                    />
                    {isHex(value) && (
                      <input
                        type="color"
                        value={value}
                        onChange={e => setToken(key, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-neutral-200 bg-white p-0"
                        aria-label={label}
                      />
                    )}
                    <input
                      type="text"
                      value={value}
                      onChange={e => setToken(key, e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                    />
                  </div>
                )
              })}
            </div>

            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-5 pt-5 border-t border-neutral-100">
              {FONT_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <Type className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                  <label className="text-xs font-semibold text-neutral-500 w-28 shrink-0">{label}</label>
                  <input
                    type="text"
                    value={String(tokens[key] ?? '')}
                    onChange={e => setToken(key, e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                  />
                </div>
              ))}
              {SCALE_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-neutral-500 w-28 shrink-0 pl-5">{label}</label>
                  <input
                    type="text"
                    value={String(tokens[key] ?? '')}
                    onChange={e => setToken(key, e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 min-w-0 px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Structure: header/footer + resources + advanced */}
          <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">3</span>
                <h4 className="text-sm font-bold text-neutral-900">Estructura replicada</h4>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <StructureChip icon={PanelTop} label="Header" ok={!!extractedHeader} detail={extractedHeader ? `${extractedHeader.length.toLocaleString()} chars` : 'No detectat'} />
                <StructureChip icon={PanelBottom} label="Footer" ok={!!extractedFooter} detail={extractedFooter ? `${extractedFooter.length.toLocaleString()} chars` : 'No detectat'} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <ResourcePill label={`${externalStyles.length} fulls CSS`} active={externalStyles.length > 0} />
                <ResourcePill label={`${externalScripts.length} scripts`} active={externalScripts.length > 0} />
                <ResourcePill label={`${fontLinks.length} tipografies`} active={fontLinks.length > 0} />
              </div>
            </div>

            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="cursor-pointer w-full flex items-center justify-between px-6 py-3.5 border-t border-neutral-100 hover:bg-neutral-50 transition-colors"
            >
              <span className="text-xs font-bold text-neutral-600">Editar HTML extret (avançat)</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
            </button>
            {showAdvanced && (
              <div className="px-6 pb-6 space-y-4 border-t border-neutral-100 pt-5">
                <CodeArea label={`<head> · ${extractedHead.length.toLocaleString()} chars`} value={extractedHead} onChange={setExtractedHead} rows={10} />
                <CodeArea label={`<header> · ${extractedHeader.length.toLocaleString()} chars`} value={extractedHeader} onChange={setExtractedHeader} rows={8} />
                <CodeArea label={`<footer> · ${extractedFooter.length.toLocaleString()} chars`} value={extractedFooter} onChange={setExtractedFooter} rows={8} />
                <CodeArea label={`<script> · ${extractedScripts.length.toLocaleString()} chars`} value={extractedScripts} onChange={setExtractedScripts} rows={8} />
              </div>
            )}
          </div>

          {/* Preview canvas */}
          <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-neutral-400" />
                <h4 className="text-sm font-bold text-neutral-900">Vista prèvia de la integració</h4>
              </div>
              <button
                onClick={() => refreshPreview(buildThemeData())}
                disabled={previewLoading}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Actualitzar
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 px-6 pt-3">
              Header i footer clonats + el feed amb les nostres plantilles vestides amb els teus tokens, amb els articles publicats reals d&apos;aquest lloc.
            </p>
            <div className="p-4">
              {previewError ? (
                <div className="flex items-center justify-center h-64 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium">{previewError}</div>
              ) : previewHtml ? (
                <iframe
                  title="Vista prèvia del tema"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  className="w-full h-[620px] bg-white border border-neutral-200 rounded-xl"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-neutral-50 border border-dashed border-neutral-200 rounded-xl text-sm text-neutral-400 gap-2">
                  {previewLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Monitor className="w-6 h-6" />}
                  {previewLoading ? 'Generant vista prèvia…' : 'Captura un tema per veure la vista prèvia'}
                </div>
              )}
            </div>
          </div>

          {/* Save bar */}
          <div className="sticky bottom-0 bg-white/90 backdrop-blur border border-neutral-200 rounded-2xl p-4 shadow-lg flex items-center gap-3 z-10">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
              <Check className="w-4 h-4" /> Tema actiu en desar
            </div>
            <div className="flex-1" />
            {hasTheme && (
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isPending}
              className="cursor-pointer flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400 text-white rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Desar tema
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function StructureChip({ icon: Icon, label, ok, detail }: { icon: typeof PanelTop; label: string; ok: boolean; detail: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${ok ? 'bg-green-50/40 border-green-100' : 'bg-neutral-50 border-neutral-200'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ok ? 'bg-green-100 text-green-700' : 'bg-white text-neutral-400 border border-neutral-200'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-neutral-900">{label}</p>
        <p className={`text-[11px] font-medium ${ok ? 'text-green-700' : 'text-neutral-400'}`}>{detail}</p>
      </div>
    </div>
  )
}

function ResourcePill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${active ? 'bg-carma-50 text-carma-700 border-carma-100' : 'bg-neutral-50 text-neutral-400 border-neutral-200'}`}>
      {label}
    </span>
  )
}

function CodeArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-carma-500 text-[11px] font-mono text-neutral-200 resize-y transition-all leading-relaxed"
        placeholder="(buit)"
      />
    </div>
  )
}
