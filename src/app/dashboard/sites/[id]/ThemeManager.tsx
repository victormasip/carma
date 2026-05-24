'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Palette, Globe, Loader2, Search, Save, AlertCircle, ExternalLink,
  Layout, FileType, Type, ChevronDown, ChevronUp, Trash2, Power, PowerOff,
  Home, List, FileText, CheckCircle2, Sparkles, Plug,
} from 'lucide-react'
import { saveTheme, deleteTheme, type ThemeData } from '@/lib/actions/theme'
import { useToast } from '@/components/ui/Toast'

export type Theme = ThemeData & { site_id?: string }

type Detection = {
  framework: string
  version?: string
  hosting: string | null
  confidence: 'high' | 'medium' | 'low'
}

type AnalyzeResponse = {
  extracted_head: string
  extracted_header: string
  extracted_footer: string
  extracted_scripts: string
  external_styles: string[]
  external_scripts: string[]
  font_links: string[]
  detected_classes: {
    article_wrapper?: string
    article_title?: string
    article_content?: string
    card?: string
    card_grid?: string
    main_wrapper?: string
  }
  detection: Detection
  base_url: string
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

type RefKey = 'home' | 'listing' | 'article'

const REF_CONFIG: Record<RefKey, { label: string; description: string; icon: typeof Home; placeholder: string }> = {
  home: {
    label: 'Pàgina d\'inici',
    description: 'Per extreure el head, header i footer globals (CSS, fonts, navegació).',
    icon: Home,
    placeholder: 'https://www.example.com',
  },
  listing: {
    label: 'Llistat d\'articles',
    description: 'Per detectar les classes del grid i les targetes (.news-grid, .card...).',
    icon: List,
    placeholder: 'https://www.example.com/noticies',
  },
  article: {
    label: 'Article individual',
    description: 'Per detectar les classes de l\'article (wrapper, títol, contingut, meta).',
    icon: FileText,
    placeholder: 'https://www.example.com/noticies/exemple-darticle',
  },
}

export default function ThemeManager({ siteId, initialTheme }: { siteId: string; initialTheme: Theme | null }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  // 3 reference URLs
  const [urls, setUrls] = useState<Record<RefKey, string>>({
    home:    initialTheme?.reference_url_home    ?? '',
    listing: initialTheme?.reference_url_listing ?? '',
    article: initialTheme?.reference_url_article ?? '',
  })

  // Shared theme state (built up by analyzing the 3 pages)
  const [rawCss, setRawCss] = useState(initialTheme?.raw_css ?? '')
  const [extractedHead, setExtractedHead] = useState(initialTheme?.extracted_head ?? '')
  const [extractedHeader, setExtractedHeader] = useState(initialTheme?.extracted_header ?? '')
  const [extractedFooter, setExtractedFooter] = useState(initialTheme?.extracted_footer ?? '')
  const [extractedScripts, setExtractedScripts] = useState(initialTheme?.extracted_scripts ?? '')
  const [externalStyles, setExternalStyles] = useState<string[]>(initialTheme?.external_styles ?? [])
  const [externalScripts, setExternalScripts] = useState<string[]>(initialTheme?.external_scripts ?? [])
  const [fontLinks, setFontLinks] = useState<string[]>(initialTheme?.font_links ?? [])
  const [baseUrl, setBaseUrl] = useState(initialTheme?.base_url ?? '')
  const [isEnabled, setIsEnabled] = useState(initialTheme?.is_enabled ?? false)

  const [classes, setClasses] = useState({
    article_wrapper: initialTheme?.class_article_wrapper ?? '',
    article_title:   initialTheme?.class_article_title ?? '',
    article_content: initialTheme?.class_article_content ?? '',
    article_meta:    initialTheme?.class_article_meta ?? '',
    card_grid:       initialTheme?.class_card_grid ?? '',
    card:            initialTheme?.class_card ?? '',
    main_wrapper:    initialTheme?.class_main_wrapper ?? '',
  })

  // Detection (framework + hosting)
  const [detectedFramework, setDetectedFramework] = useState<string | null>(initialTheme?.detected_framework ?? null)
  const [detectedHosting, setDetectedHosting] = useState<string | null>(initialTheme?.detected_hosting ?? null)

  // Per-ref analysis state
  const [analyzing, setAnalyzing] = useState<RefKey | null>(null)
  const [errors, setErrors] = useState<Record<RefKey, string | null>>({ home: null, listing: null, article: null })
  const [analyzed, setAnalyzed] = useState<Record<RefKey, boolean>>({
    home:    !!initialTheme?.extracted_head,
    listing: !!initialTheme?.class_card,
    article: !!initialTheme?.class_article_content,
  })

  const [showAdvanced, setShowAdvanced] = useState(false)

  const hasTheme = !!initialTheme
  const anyAnalyzed = analyzed.home || analyzed.listing || analyzed.article
  const renderUrl = `/render/${siteId}`

  const handleAnalyze = async (ref: RefKey) => {
    const url = urls[ref].trim()
    if (!url) return
    setAnalyzing(ref)
    setErrors(prev => ({ ...prev, [ref]: null }))
    try {
      const res = await fetch('/api/theme/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data: AnalyzeResponse = await res.json()
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [ref]: data.error ?? 'Error desconegut' }))
        return
      }

      // Framework/hosting detection: home is most reliable; others fill if missing
      if (data.detection) {
        if (ref === 'home' || !detectedFramework) setDetectedFramework(data.detection.framework)
        if (ref === 'home' || !detectedHosting)   setDetectedHosting(data.detection.hosting)
      }

      // Apply different parts depending on which reference page was analyzed
      if (ref === 'home') {
        setExtractedHead(data.extracted_head)
        setExtractedHeader(data.extracted_header)
        setExtractedFooter(data.extracted_footer)
        setExtractedScripts(data.extracted_scripts ?? '')
        setExternalStyles(data.external_styles)
        setExternalScripts(data.external_scripts ?? [])
        setFontLinks(data.font_links)
        setBaseUrl(data.base_url)
        if (data.detected_classes.main_wrapper) {
          setClasses(c => ({ ...c, main_wrapper: data.detected_classes.main_wrapper! }))
        }
      } else if (ref === 'listing') {
        setClasses(c => ({
          ...c,
          card_grid: data.detected_classes.card_grid ?? c.card_grid,
          card:      data.detected_classes.card      ?? c.card,
        }))
        // Backfills if home wasn't analyzed yet
        if (!extractedHead && data.extracted_head)       setExtractedHead(data.extracted_head)
        if (!extractedHeader && data.extracted_header)   setExtractedHeader(data.extracted_header)
        if (!extractedFooter && data.extracted_footer)   setExtractedFooter(data.extracted_footer)
        if (!extractedScripts && data.extracted_scripts) setExtractedScripts(data.extracted_scripts)
        if (externalStyles.length === 0)                 setExternalStyles(data.external_styles)
        if (externalScripts.length === 0)                setExternalScripts(data.external_scripts ?? [])
        if (!baseUrl)                                    setBaseUrl(data.base_url)
      } else {
        setClasses(c => ({
          ...c,
          article_wrapper: data.detected_classes.article_wrapper ?? c.article_wrapper,
          article_title:   data.detected_classes.article_title   ?? c.article_title,
          article_content: data.detected_classes.article_content ?? c.article_content,
        }))
        if (!extractedHead && data.extracted_head)       setExtractedHead(data.extracted_head)
        if (!extractedHeader && data.extracted_header)   setExtractedHeader(data.extracted_header)
        if (!extractedFooter && data.extracted_footer)   setExtractedFooter(data.extracted_footer)
        if (!extractedScripts && data.extracted_scripts) setExtractedScripts(data.extracted_scripts)
        if (externalStyles.length === 0)                 setExternalStyles(data.external_styles)
        if (externalScripts.length === 0)                setExternalScripts(data.external_scripts ?? [])
        if (!baseUrl)                                    setBaseUrl(data.base_url)
      }

      setAnalyzed(prev => ({ ...prev, [ref]: true }))
      toast(`${REF_CONFIG[ref].label} analitzada correctament`)
    } catch {
      setErrors(prev => ({ ...prev, [ref]: 'Error de xarxa' }))
    } finally {
      setAnalyzing(null)
    }
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveTheme(siteId, {
        reference_url_home:    urls.home || null,
        reference_url_listing: urls.listing || null,
        reference_url_article: urls.article || null,
        raw_css: rawCss || null,
        extracted_head: extractedHead || null,
        extracted_header: extractedHeader || null,
        extracted_footer: extractedFooter || null,
        extracted_scripts: extractedScripts || null,
        external_styles: externalStyles,
        external_scripts: externalScripts,
        font_links: fontLinks,
        base_url: baseUrl || null,
        class_article_wrapper: classes.article_wrapper || null,
        class_article_title:   classes.article_title || null,
        class_article_content: classes.article_content || null,
        class_article_meta:    classes.article_meta || null,
        class_card_grid:       classes.card_grid || null,
        class_card:            classes.card || null,
        class_main_wrapper:    classes.main_wrapper || null,
        detected_framework: detectedFramework,
        detected_hosting: detectedHosting,
        is_enabled: isEnabled,
      })
      if (result.error) { toast(result.error, 'error'); return }
      toast('Tema desat correctament')
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (!confirm('Eliminar el tema configurat? Les pàgines de render quedaran desactivades.')) return
    startTransition(async () => {
      const result = await deleteTheme(siteId)
      if (result.error) { toast(result.error, 'error'); return }
      toast('Tema eliminat')
      router.refresh()
    })
  }

  // Decide what each ref summary should say
  const refSummary = (ref: RefKey): string | null => {
    if (!analyzed[ref]) return null
    if (ref === 'home') {
      const parts: string[] = []
      if (extractedHead)   parts.push('head')
      if (extractedHeader) parts.push('header')
      if (extractedFooter) parts.push('footer')
      if (externalStyles.length > 0) parts.push(`${externalStyles.length} CSS`)
      if (fontLinks.length > 0)      parts.push(`${fontLinks.length} fonts`)
      return parts.length > 0 ? `Detectat: ${parts.join(' · ')}` : 'No s\'ha pogut extreure cap part'
    }
    if (ref === 'listing') {
      const parts: string[] = []
      if (classes.card_grid) parts.push(`grid ${classes.card_grid}`)
      if (classes.card)      parts.push(`card ${classes.card}`)
      return parts.length > 0 ? `Detectat: ${parts.join(' · ')}` : 'No s\'han detectat classes de card'
    }
    const parts: string[] = []
    if (classes.article_wrapper) parts.push(`wrapper ${classes.article_wrapper}`)
    if (classes.article_title)   parts.push(`títol ${classes.article_title}`)
    if (classes.article_content) parts.push(`contingut ${classes.article_content}`)
    return parts.length > 0 ? `Detectat: ${parts.join(' · ')}` : 'No s\'han detectat classes'
  }

  const CLASS_FIELDS: { key: keyof typeof classes; label: string; placeholder: string; icon: typeof Layout }[] = [
    { key: 'main_wrapper',    label: 'Wrapper principal', placeholder: '.container · main', icon: Layout },
    { key: 'card_grid',       label: 'Grid de cards',     placeholder: '.news-grid · .posts', icon: Layout },
    { key: 'card',            label: 'Card individual',   placeholder: '.news-card · article.post', icon: FileType },
    { key: 'article_wrapper', label: 'Article wrapper',   placeholder: '.single-post · article.entry', icon: FileType },
    { key: 'article_title',   label: 'Títol article',     placeholder: '.post-title · h1.entry-title', icon: Type },
    { key: 'article_content', label: 'Contingut article', placeholder: '.post-content · .entry-content', icon: Type },
    { key: 'article_meta',    label: 'Meta article',      placeholder: '.post-meta · .byline (opcional)', icon: Type },
  ]

  return (
    <div className="space-y-5">
      {/* Header card with status + actions */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-carma-500/10 blur-[80px] pointer-events-none rounded-full" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-carma-500/20 text-carma-300 rounded-2xl flex items-center justify-center">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                Tema visual del client
                {isEnabled && (
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-green-500/20 text-green-300 px-2 py-0.5 rounded">
                    Actiu
                  </span>
                )}
              </h3>
              <p className="text-xs font-medium text-neutral-400 mt-1 max-w-md">
                Analitza 3 pàgines de la web original i Carma replicarà el seu look & feel a les rutes de render.
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

      {/* Detected framework + hosting banner */}
      {detectedFramework && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-500 text-white rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-700">Framework detectat</span>
            </div>
            <p className="text-sm font-bold text-neutral-900 mt-1">
              {FRAMEWORK_LABELS[detectedFramework] ?? detectedFramework}
              {detectedHosting && (
                <span className="font-normal text-neutral-500"> · hosting {HOSTING_LABELS[detectedHosting] ?? detectedHosting}</span>
              )}
            </p>
            <p className="text-xs text-neutral-600 mt-0.5">
              La pestanya <strong>Connexió</strong> ja té instruccions personalitzades per a aquest stack.
            </p>
          </div>
          <Link
            href={`/dashboard/sites/${siteId}?tab=connexio`}
            className="cursor-pointer flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shrink-0"
          >
            <Plug className="w-3.5 h-3.5" />
            Veure Connexió
          </Link>
        </div>
      )}

      {/* 3 reference page analyzers */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">1</span>
          <h4 className="text-sm font-bold text-neutral-900">Analitzar pàgines de referència</h4>
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed -mt-1 ml-8">
          Posa una URL per cada tipus de pàgina i clica Analitzar. Cada analisi popula uns camps diferents del tema.
        </p>

        {(['home', 'listing', 'article'] as RefKey[]).map(ref => {
          const cfg = REF_CONFIG[ref]
          const Icon = cfg.icon
          const isLoading = analyzing === ref
          const err = errors[ref]
          const summary = refSummary(ref)
          const done = analyzed[ref]
          return (
            <div key={ref} className={`border rounded-xl p-4 transition-colors ${done ? 'bg-green-50/30 border-green-100' : 'bg-neutral-50/40 border-neutral-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${done ? 'bg-green-100 text-green-700' : 'bg-white text-neutral-400 border border-neutral-200'}`}>
                  {done ? <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-neutral-900">{cfg.label}</p>
                  <p className="text-[11px] text-neutral-500 leading-tight">{cfg.description}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
                  <input
                    type="url"
                    value={urls[ref]}
                    onChange={e => setUrls(prev => ({ ...prev, [ref]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAnalyze(ref)}
                    placeholder={cfg.placeholder}
                    disabled={isLoading}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-500 text-xs font-medium transition-all disabled:opacity-60"
                  />
                </div>
                <button
                  onClick={() => handleAnalyze(ref)}
                  disabled={!urls[ref].trim() || isLoading}
                  className="cursor-pointer px-3 py-2 bg-carma-500 hover:bg-carma-600 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 min-w-[110px] justify-center"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {done ? 'Re-analitzar' : 'Analitzar'}
                </button>
              </div>

              {summary && (
                <p className="text-[11px] font-medium text-green-700 mt-2 ml-1">{summary}</p>
              )}
              {err && (
                <div className="mt-2 flex items-start gap-2 p-2 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-700 font-medium">{err}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Recursos extrets — fulls d'estil, scripts, fonts */}
      {(externalStyles.length > 0 || externalScripts.length > 0 || fontLinks.length > 0 || extractedScripts) && (
        <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-4">
          <p className="text-sm font-bold text-neutral-900">Recursos extrets del client</p>

          {externalStyles.length > 0 && (
            <ResourceList
              label="Fulls d'estil externs"
              count={externalStyles.length}
              urls={externalStyles}
              color="blue"
            />
          )}

          {externalScripts.length > 0 && (
            <ResourceList
              label="Scripts externs (jQuery, vendors, etc.)"
              count={externalScripts.length}
              urls={externalScripts}
              color="purple"
            />
          )}

          {fontLinks.length > 0 && (
            <ResourceList
              label="Tipografies"
              count={fontLinks.length}
              urls={fontLinks}
              color="amber"
            />
          )}

          {extractedScripts && (
            <div className="pt-1">
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
                JavaScript inline · {extractedScripts.length.toLocaleString()} chars
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Carma injectarà aquests scripts al final del <code className="bg-neutral-100 px-1 rounded">{'<body>'}</code> al render perquè menús, carousels, etc. del client funcionin.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Class mapping */}
      {(anyAnalyzed || hasTheme) && (
        <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">2</span>
            <h4 className="text-sm font-bold text-neutral-900">Mapping de classes CSS</h4>
          </div>
          <p className="text-xs text-neutral-500 mb-4 leading-relaxed ml-8">
            Carma usarà aquestes classes als elements renderitzats perquè el CSS original els estilitzi. Pots editar-les si la detecció no és correcta.
          </p>

          <div className="space-y-2.5">
            {CLASS_FIELDS.map(({ key, label, placeholder, icon: Icon }) => (
              <div key={key} className="flex items-center gap-3">
                <Icon className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                <label className="text-xs font-semibold text-neutral-500 w-36 shrink-0">{label}</label>
                <input
                  type="text"
                  value={classes[key]}
                  onChange={e => setClasses(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced editing */}
      {(anyAnalyzed || hasTheme) && (
        <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="cursor-pointer w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-neutral-100 text-neutral-600 text-xs font-bold rounded-full flex items-center justify-center">3</span>
              <h4 className="text-sm font-bold text-neutral-900">Editar HTML/CSS extret (avançat)</h4>
            </div>
            {showAdvanced ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
          </button>

          {showAdvanced && (
            <div className="px-6 pb-6 space-y-4 border-t border-neutral-100 pt-5">
              <CodeArea
                label={`<head> · ${extractedHead.length.toLocaleString()} chars`}
                value={extractedHead}
                onChange={setExtractedHead}
                rows={20}
              />
              <CodeArea
                label={`<header> HTML · ${extractedHeader.length.toLocaleString()} chars`}
                value={extractedHeader}
                onChange={setExtractedHeader}
                rows={12}
              />
              <CodeArea
                label={`<footer> HTML · ${extractedFooter.length.toLocaleString()} chars`}
                value={extractedFooter}
                onChange={setExtractedFooter}
                rows={12}
              />
              <CodeArea
                label={`<script> tags · ${extractedScripts.length.toLocaleString()} chars`}
                value={extractedScripts}
                onChange={setExtractedScripts}
                rows={14}
              />
              <CodeArea
                label="CSS addicional (inline, sobreescriu)"
                value={rawCss}
                onChange={setRawCss}
                rows={10}
              />
            </div>
          )}
        </div>
      )}

      {/* Footer: save bar */}
      {(anyAnalyzed || hasTheme) && (
        <div className="sticky bottom-0 bg-white/90 backdrop-blur border border-neutral-200 rounded-2xl p-4 shadow-lg flex items-center gap-3 z-10">
          <button
            onClick={() => setIsEnabled(v => !v)}
            className={`cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors border ${
              isEnabled
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-neutral-50 border-neutral-200 text-neutral-500'
            }`}
          >
            {isEnabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            {isEnabled ? 'Tema actiu' : 'Tema desactivat'}
          </button>

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

          <div className="flex-1" />

          <button
            onClick={handleSave}
            disabled={isPending}
            className="cursor-pointer flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400 text-white rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Desar tema
          </button>
        </div>
      )}
    </div>
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

function ResourceList({ label, count, urls, color }: {
  label: string
  count: number
  urls: string[]
  color: 'blue' | 'purple' | 'amber'
}) {
  const colorClass = {
    blue:   'bg-blue-50 text-blue-700 border-blue-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
  }[color]
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${colorClass}`}>
          {count}
        </span>
        <p className="text-[11px] font-bold text-neutral-600">{label}</p>
      </div>
      <div className="space-y-1 pl-1 max-h-32 overflow-y-auto">
        {urls.map(u => (
          <code key={u} className="block text-[10px] font-mono text-neutral-500 truncate" title={u}>{u}</code>
        ))}
      </div>
    </div>
  )
}
