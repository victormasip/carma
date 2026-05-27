'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Globe, Search, Loader2, CheckCircle2, XCircle, AlertCircle,
  Upload, RotateCcw, Link2, Minimize2, Maximize2, StopCircle,
  Eye, RefreshCw, Filter, Newspaper, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

type DiscoveredArticle = { url: string; title: string; language?: string | null }
type ImportResult = { url: string; success: boolean; title?: string; slug?: string; error?: string; skipped?: boolean }
type PreviewData = {
  title: string; contentPreview: string; contentLength: number
  image: string; author: string; date: string; categories: string[]
  selectorsUsed: Record<string, string>; language: string | null
}

type Phase = 'input' | 'discovering' | 'preview' | 'preview-manual' | 'importing' | 'done'

const SELECTOR_FIELDS = [
  { key: 'title',      label: 'Títol' },
  { key: 'content',    label: 'Contingut' },
  { key: 'image',      label: 'Imatge' },
  { key: 'author',     label: 'Autor' },
  { key: 'date',       label: 'Data' },
  { key: 'categories', label: 'Categories' },
]

export default function ImportModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('input')

  // Auto-discover state
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<'sitemap' | 'rss' | 'wordpress' | 'crawl' | null>(null)
  const [wpApiBase, setWpApiBase] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<DiscoveredArticle[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overwrite, setOverwrite] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [langFilter, setLangFilter] = useState<string>('all')

  // Crawl mode state
  const [crawlUrl, setCrawlUrl] = useState('')
  const [linkSelector, setLinkSelector] = useState('')
  const [crawlLoading, setCrawlLoading] = useState(false)
  const [crawlError, setCrawlError] = useState<string | null>(null)
  const [showCrawlSelectors, setShowCrawlSelectors] = useState(false)

  // Manual preview state
  const [manualUrl, setManualUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)

  // Shared field selectors (used by both crawl and manual modes)
  const [customSelectors, setCustomSelectors] = useState<Record<string, string>>({})

  // Import state
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [results, setResults] = useState<ImportResult[]>([])
  const [isMinimized, setIsMinimized] = useState(false)

  const cancelRef = useRef(false)
  const router = useRouter()
  const { toast } = useToast()

  // Derived
  const availableLangs = [...new Set(discovered.map(a => a.language).filter(Boolean))] as string[]
  const filteredDiscovered = langFilter === 'all' ? discovered : discovered.filter(a => a.language === langFilter)
  const selectedInFilter = filteredDiscovered.filter(a => selected.has(a.url)).length
  const allFilteredSelected = filteredDiscovered.length > 0 && filteredDiscovered.every(a => selected.has(a.url))
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const importedCount = results.filter(r => r.success).length
  const skippedCount = results.filter(r => r.skipped).length
  const failedCount = results.filter(r => !r.success && !r.skipped).length
  const hasCustomSelectors = Object.keys(customSelectors).some(k => customSelectors[k]?.trim())

  const methodLabel = method === 'wordpress' ? 'WordPress API'
    : method === 'rss' ? 'RSS Feed'
    : method === 'crawl' ? 'Pàgina rastreijada'
    : 'Sitemap XML'

  const toggleAll = () => {
    const urls = filteredDiscovered.map(a => a.url)
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) urls.forEach(u => next.delete(u))
      else urls.forEach(u => next.add(u))
      return next
    })
  }

  const toggleOne = (u: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(u)) next.delete(u)
      else next.add(u)
      return next
    })
  }

  const handleDiscover = async () => {
    if (!url.trim()) return
    setPhase('discovering')
    setDiscoverError(null)
    try {
      const res = await fetch('/api/import/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setDiscoverError(data.error ?? 'Error desconegut'); setPhase('input'); return }
      setDiscovered(data.articles ?? [])
      setMethod(data.method)
      setWpApiBase(data.wpApiBase ?? null)
      setLangFilter('all')
      setSelected(new Set((data.articles ?? []).map((a: DiscoveredArticle) => a.url)))
      setPhase('preview')
    } catch {
      setDiscoverError('Error de xarxa. Comprova la connexió.')
      setPhase('input')
    }
  }

  const handleCrawl = async () => {
    if (!crawlUrl.trim() || !linkSelector.trim()) return
    setCrawlLoading(true)
    setCrawlError(null)
    try {
      const res = await fetch('/api/import/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: crawlUrl.trim(), linkSelector: linkSelector.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setCrawlError(data.error ?? 'Error desconegut'); return }
      setDiscovered(data.articles ?? [])
      setMethod('crawl')
      setWpApiBase(null)
      setLangFilter('all')
      setSelected(new Set((data.articles ?? []).map((a: DiscoveredArticle) => a.url)))
      setPhase('preview')
    } catch {
      setCrawlError('Error de xarxa')
    } finally {
      setCrawlLoading(false)
    }
  }

  const handleImport = async (urlsToImport: string[]) => {
    if (urlsToImport.length === 0) return
    cancelRef.current = false
    setPhase('importing')
    setProgress({ done: 0, total: urlsToImport.length, current: '' })
    setResults([])
    const allResults: ImportResult[] = []

    for (let i = 0; i < urlsToImport.length; i++) {
      if (cancelRef.current) break
      const articleUrl = urlsToImport[i]
      const articleTitle = discovered.find(a => a.url === articleUrl)?.title ?? articleUrl
      setProgress({ done: i, total: urlsToImport.length, current: articleTitle })

      try {
        const res = await fetch('/api/import/articles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: [articleUrl], siteId, overwrite,
            ...(wpApiBase ? { wpApiBase } : {}),
            ...(hasCustomSelectors ? { selectors: customSelectors } : {}),
          }),
        })
        const data = await res.json()
        const result = data.results?.[0] ?? { url: articleUrl, success: false, error: 'Sense resposta' }
        allResults.push(result)
        setResults([...allResults])
      } catch {
        allResults.push({ url: articleUrl, success: false, error: 'Error de xarxa' })
        setResults([...allResults])
      }
      setProgress({ done: i + 1, total: urlsToImport.length, current: articleTitle })
    }

    setPhase('done')
    setIsMinimized(false)
    const imported = allResults.filter(r => r.success).length
    const skipped = allResults.filter(r => r.skipped).length
    if (imported > 0) { toast(`${imported} article${imported > 1 ? 's' : ''} importat${imported > 1 ? 's' : ''} correctament`, 'success'); router.refresh() }
    if (skipped > 0) toast(`${skipped} article${skipped > 1 ? 's' : ''} omès${skipped > 1 ? 'os' : ''} (ja existien)`, 'info')
  }

  const handlePreview = async () => {
    if (!manualUrl.trim()) return
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewData(null)
    try {
      const res = await fetch('/api/import/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: manualUrl.trim(), selectors: customSelectors }),
      })
      const data = await res.json()
      if (!res.ok) { setPreviewError(data.error ?? 'Error desconegut'); return }
      setPreviewData(data)
      setPhase('preview-manual')
    } catch {
      setPreviewError('Error de xarxa')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleManualImport = async () => {
    if (!manualUrl.trim()) return
    cancelRef.current = false
    setPhase('importing')
    setProgress({ done: 0, total: 1, current: previewData?.title ?? manualUrl })
    setResults([])
    try {
      const res = await fetch('/api/import/articles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: [manualUrl.trim()], siteId, overwrite: false,
          ...(hasCustomSelectors ? { selectors: customSelectors } : {}),
        }),
      })
      const data = await res.json()
      const result = data.results?.[0] ?? { url: manualUrl, success: false, error: 'Sense resposta' }
      setResults([result])
      setProgress({ done: 1, total: 1, current: result.title ?? manualUrl })
      setPhase('done')
      if (result.success) { toast(`"${result.title}" importat correctament`, 'success'); router.refresh() }
    } catch {
      setResults([{ url: manualUrl, success: false, error: 'Error de xarxa' }])
      setPhase('done')
    }
  }

  // ── Minimized floating pill ───────────────────────────────────────────────────
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-premium border border-neutral-100 p-4 flex items-center gap-4 min-w-[280px] max-w-sm">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-neutral-900 mb-1.5">Importació en curs · {progress.done}/{progress.total}</p>
          <div className="bg-neutral-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-carma-500 to-carma-400 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          {progress.current && <p className="text-xs text-neutral-400 mt-1 truncate">{progress.current}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setIsMinimized(false)} title="Tornar al primer pla" className="cursor-pointer p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={() => { cancelRef.current = true; onClose() }} title="Cancel·lar i tancar" className="cursor-pointer p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-premium flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-4 p-8 pb-5 shrink-0">
          <div className="w-12 h-12 bg-carma-50 text-carma-500 rounded-2xl flex items-center justify-center shrink-0">
            <Upload className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-neutral-900">Importar Articles</h2>
            <p className="text-xs font-medium text-neutral-500 mt-0.5 truncate">
              {phase === 'input' && 'Tria el mètode d\'importació'}
              {phase === 'discovering' && 'Detectant articles...'}
              {phase === 'preview' && `${discovered.length} articles detectats via ${methodLabel}`}
              {phase === 'preview-manual' && `Vista prèvia · ${manualUrl}`}
              {phase === 'importing' && `${progress.done} / ${progress.total} · ${progress.current}`}
              {phase === 'done' && `Finalitzat · ${importedCount} importats · ${skippedCount} omesos · ${failedCount} errors`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {phase === 'importing' && (
              <button onClick={() => setIsMinimized(true)} title="Passar a segon pla" className="cursor-pointer p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-colors">
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="cursor-pointer p-2 text-neutral-400 hover:text-neutral-900 bg-neutral-50 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-5">

          {/* ── FASE: Input ── */}
          {(phase === 'input' || phase === 'discovering') && (
            <>
              {/* 1. Auto-discover */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Descoberta automàtica (WordPress · Sitemap · RSS)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    <input
                      type="url" value={url} onChange={e => setUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleDiscover()}
                      placeholder="https://example.com" disabled={phase === 'discovering'}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-sm font-medium transition-all disabled:opacity-60"
                    />
                  </div>
                  <button
                    onClick={handleDiscover} disabled={!url.trim() || phase === 'discovering'}
                    className="cursor-pointer px-5 py-3 bg-carma-500 hover:bg-carma-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {phase === 'discovering' ? <><Loader2 className="w-4 h-4 animate-spin" />Descobrint...</> : <><Search className="w-4 h-4" />Descobrir</>}
                  </button>
                </div>
                {discoverError && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 font-medium">{discoverError}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-neutral-100" />
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">o</span>
                <div className="flex-1 h-px bg-neutral-100" />
              </div>

              {/* 2. Pàgina d'articles (crawl) */}
              <div className="space-y-3 bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-neutral-500" />
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest">
                    Pàgina d&apos;articles · Rastreig per selector CSS
                  </label>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Per a webs sense WordPress ni feed. Indica la pàgina de llistats i el selector CSS que apunta als links dels articles.
                </p>

                <div className="space-y-2">
                  <div className="relative">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    <input
                      type="url" value={crawlUrl} onChange={e => setCrawlUrl(e.target.value)}
                      placeholder="https://example.com/noticies" disabled={crawlLoading}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-sm font-medium transition-all disabled:opacity-60"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
                      <input
                        type="text" value={linkSelector} onChange={e => setLinkSelector(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCrawl()}
                        placeholder=".article-list a.title  ·  article h2 > a  ·  .post-preview a"
                        disabled={crawlLoading}
                        className="w-full pl-9 pr-4 py-3 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-xs font-mono transition-all disabled:opacity-60"
                      />
                    </div>
                    <button
                      onClick={handleCrawl} disabled={!crawlUrl.trim() || !linkSelector.trim() || crawlLoading}
                      className="cursor-pointer px-4 py-3 bg-neutral-800 hover:bg-neutral-900 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {crawlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Rastrejar
                    </button>
                  </div>
                </div>

                {crawlError && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 font-medium">{crawlError}</p>
                  </div>
                )}

                {/* Selectors CSS per als camps (expandible) */}
                <button
                  onClick={() => setShowCrawlSelectors(v => !v)}
                  className="cursor-pointer flex items-center gap-2 text-xs font-bold text-neutral-400 hover:text-neutral-600 uppercase tracking-widest transition-colors"
                >
                  {showCrawlSelectors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Selectors per camps (opcional)
                </button>

                {showCrawlSelectors && (
                  <div className="space-y-2 pt-1">
                    {SELECTOR_FIELDS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-neutral-500 w-20 shrink-0">{label}</span>
                        <input
                          type="text"
                          value={customSelectors[key] ?? ''}
                          onChange={e => setCustomSelectors(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={`Selector per a ${label.toLowerCase()}...`}
                          className="flex-1 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 text-xs font-mono transition-all"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-neutral-100" />
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">o</span>
                <div className="flex-1 h-px bg-neutral-100" />
              </div>

              {/* 3. Manual URL */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  URL manual · Article únic
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    <input
                      type="url" value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handlePreview()}
                      placeholder="https://example.com/nom-de-larticle" disabled={previewLoading}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-sm font-medium transition-all disabled:opacity-60"
                    />
                  </div>
                  <button
                    onClick={handlePreview} disabled={!manualUrl.trim() || previewLoading}
                    className="cursor-pointer px-5 py-3 bg-neutral-800 hover:bg-neutral-900 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    Previsualitzar
                  </button>
                </div>
                {previewError && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 font-medium">{previewError}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── FASE: Preview manual ── */}
          {phase === 'preview-manual' && (
            <>
              {previewLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-carma-500" />
                </div>
              )}
              {!previewLoading && previewData && (
                <div className="space-y-5">
                  <div className="bg-neutral-50 rounded-2xl p-4 space-y-3">
                    {previewData.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewData.image} alt="" className="w-full h-32 object-cover rounded-xl" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Títol</p>
                      {previewData.title ? <p className="text-sm font-bold text-neutral-900">{previewData.title}</p> : <p className="text-sm text-neutral-400 italic">No detectat</p>}
                    </div>
                    {previewData.author && <div><p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Autor</p><p className="text-xs text-neutral-700">{previewData.author}</p></div>}
                    {previewData.date && <div><p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Data</p><p className="text-xs text-neutral-700">{previewData.date}</p></div>}
                    {previewData.categories.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Categories</p>
                        <div className="flex flex-wrap gap-1">{previewData.categories.map(c => <span key={c} className="px-2 py-0.5 bg-carma-100 text-carma-700 rounded text-xs font-semibold">{c}</span>)}</div>
                      </div>
                    )}
                    {previewData.contentPreview && (
                      <div>
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Contingut ({previewData.contentLength} car.)</p>
                        <p className="text-xs text-neutral-600 line-clamp-3 leading-relaxed">{previewData.contentPreview}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Selectors CSS</p>
                    <div className="space-y-2.5">
                      {SELECTOR_FIELDS.map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-semibold text-neutral-600 shrink-0">{label}</label>
                            {previewData.selectorsUsed[key] && (
                              <span className="text-xs font-mono text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded truncate max-w-[220px]">{previewData.selectorsUsed[key]}</span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={customSelectors[key] ?? ''}
                            onChange={e => setCustomSelectors(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={previewData.selectorsUsed[key] ? `Sobreescriu: ${previewData.selectorsUsed[key]}` : `Selector per a ${label.toLowerCase()}...`}
                            className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setPhase('input')} className="cursor-pointer flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-neutral-500 hover:bg-neutral-100 rounded-xl transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" />Tornar
                    </button>
                    <button onClick={handlePreview} disabled={previewLoading} className="cursor-pointer flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-100 border border-neutral-200 rounded-xl transition-colors disabled:opacity-50">
                      <RefreshCw className="w-3.5 h-3.5" />Re-analitzar
                    </button>
                    <button onClick={handleManualImport} className="cursor-pointer flex-1 bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400 text-white py-2.5 rounded-xl font-bold text-sm flex justify-center items-center gap-2 transition-all">
                      <Upload className="w-4 h-4" />Importar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── FASE: Preview (llista descoberta) ── */}
          {phase === 'preview' && (
            <div className="space-y-4">
              {/* Filtre idioma */}
              {availableLangs.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest shrink-0">Idioma:</span>
                  <button onClick={() => { setLangFilter('all'); setSelected(new Set(discovered.map(a => a.url))) }}
                    className={`cursor-pointer px-3 py-1 rounded-lg text-xs font-bold transition-all ${langFilter === 'all' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                    Tots ({discovered.length})
                  </button>
                  {availableLangs.map(lang => (
                    <button key={lang}
                      onClick={() => { setLangFilter(lang); setSelected(new Set(discovered.filter(a => a.language === lang).map(a => a.url))) }}
                      className={`cursor-pointer px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${langFilter === lang ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                      {lang} ({discovered.filter(a => a.language === lang).length})
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="cursor-pointer flex items-center gap-2">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="w-4 h-4 accent-carma-500 rounded cursor-pointer" />
                  <span className="text-sm font-semibold text-neutral-700">Tots ({selectedInFilter} / {filteredDiscovered.length})</span>
                </label>
                <label className="cursor-pointer flex items-center gap-2">
                  <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="w-4 h-4 accent-carma-500 rounded cursor-pointer" />
                  <span className="text-xs font-semibold text-neutral-500">Sobreescriure existents</span>
                </label>
              </div>

              {/* Selector de camps per al mode crawl */}
              {method === 'crawl' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-2">
                    Mode rastreig: s&apos;aplicaran {hasCustomSelectors ? 'els selectors configurats' : 'els selectors automàtics'} a cada article.
                  </p>
                  {!hasCustomSelectors && (
                    <button
                      onClick={() => { setPhase('input'); setShowCrawlSelectors(true) }}
                      className="cursor-pointer text-xs font-bold text-amber-700 underline hover:no-underline"
                    >
                      Configurar selectors CSS
                    </button>
                  )}
                </div>
              )}

              <div className="border border-neutral-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {filteredDiscovered.map((article, i) => (
                  <label key={article.url} className={`cursor-pointer flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50 ${i > 0 ? 'border-t border-neutral-50' : ''}`}>
                    <input type="checkbox" checked={selected.has(article.url)} onChange={() => toggleOne(article.url)} className="cursor-pointer w-4 h-4 accent-carma-500 rounded mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-800 truncate">{article.title || 'Sense títol'}</p>
                      <p className="text-xs text-neutral-400 truncate font-mono mt-0.5">{article.url}</p>
                    </div>
                    {article.language && (
                      <span className="text-xs font-bold uppercase bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded shrink-0 self-center">{article.language}</span>
                    )}
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setPhase('input'); setDiscoverError(null) }} className="cursor-pointer flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-neutral-500 hover:bg-neutral-100 rounded-xl transition-colors">
                  <RotateCcw className="w-4 h-4" />Nova cerca
                </button>
                <button onClick={() => handleImport([...selected])} disabled={selected.size === 0}
                  className="cursor-pointer flex-1 bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400 text-white py-2.5 rounded-xl font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  <Upload className="w-4 h-4" />
                  Importar {selected.size} article{selected.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* ── FASE: Importing ── */}
          {phase === 'importing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-neutral-800">{progress.done} / {progress.total} processats</span>
                <span className="font-bold text-carma-600">{progressPct}%</span>
              </div>
              <div className="bg-neutral-100 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-carma-500 to-carma-400 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              {progress.current && (
                <p className="text-xs text-neutral-500 truncate font-medium flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0 text-carma-500" />{progress.current}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => { cancelRef.current = true }} className="cursor-pointer flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-red-200">
                  <StopCircle className="w-4 h-4" />Cancel·lar
                </button>
                <button onClick={() => setIsMinimized(true)} className="cursor-pointer flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-100 rounded-xl transition-colors">
                  <Minimize2 className="w-4 h-4" />Segon pla
                </button>
              </div>
              {results.length > 0 && (
                <div className="border border-neutral-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={r.url} className={`flex items-center gap-3 px-4 py-2 ${i > 0 ? 'border-t border-neutral-50' : ''}`}>
                      {r.success ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : r.skipped ? <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      <p className="text-xs font-medium text-neutral-700 truncate flex-1">{r.title ?? r.url}</p>
                      {r.error && !r.skipped && <p className="text-xs text-red-400 shrink-0">{r.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FASE: Done ── */}
          {phase === 'done' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-extrabold text-green-700">{importedCount}</p>
                  <p className="text-xs font-bold text-green-600 mt-1">Importats</p>
                </div>
                <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-extrabold text-neutral-500">{skippedCount}</p>
                  <p className="text-xs font-bold text-neutral-400 mt-1">Omesos</p>
                </div>
                <div className={`border rounded-2xl p-4 text-center ${failedCount > 0 ? 'bg-red-50 border-red-100' : 'bg-neutral-50 border-neutral-100'}`}>
                  <p className={`text-2xl font-extrabold ${failedCount > 0 ? 'text-red-600' : 'text-neutral-500'}`}>{failedCount}</p>
                  <p className={`text-xs font-bold mt-1 ${failedCount > 0 ? 'text-red-500' : 'text-neutral-400'}`}>Errors</p>
                </div>
              </div>
              {results.length > 0 && (
                <div className="border border-neutral-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={r.url} className={`flex items-start gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-neutral-50' : ''} ${!r.success && !r.skipped ? 'bg-red-50/30' : ''}`}>
                      {r.success ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> : r.skipped ? <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-neutral-700 truncate">{r.title ?? r.url}</p>
                        {r.error && <p className="text-xs text-red-500 mt-0.5">{r.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                {importedCount === 0 && (
                  <button onClick={() => { setPhase('input'); setResults([]); setDiscoverError(null) }} className="cursor-pointer flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">
                    <RotateCcw className="w-4 h-4" />Tornar a intentar
                  </button>
                )}
                <button onClick={onClose} className="cursor-pointer flex-1 bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white py-3 rounded-xl font-bold text-sm transition-all">
                  Tancar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
