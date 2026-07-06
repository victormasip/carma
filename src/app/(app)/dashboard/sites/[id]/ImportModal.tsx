'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Globe, Search, CheckCircle2, XCircle, AlertCircle, Check,
  Upload, RotateCcw, Link2, Minimize2, Maximize2, StopCircle,
  Eye, RefreshCw, Filter, Newspaper, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { isLocale, LOCALE_META } from '@/lib/i18n/config'
import Button from '@/components/ui/Button'
import KnotLoader from '@/components/ui/KnotLoader'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { cn } from '@/lib/cn'

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

// Friendly language label for the discovery chips — native name when we support
// the locale, else the bare uppercase code (so an unmapped code still reads).
const langLabel = (code: string): string => (isLocale(code) ? LOCALE_META[code].native : code.toUpperCase())

// How many single-article import requests run in parallel for a monolingual set.
// Each request is one article (the DB-aware i18n merge depends on that), so the
// pool just shrinks wall-time for large imports while keeping the UI responsive.
const IMPORT_CONCURRENCY = 4

const INPUT = 'w-full h-10 px-3 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text placeholder:text-subtle transition-colors'
const INPUT_MONO = INPUT.replace('text-sm', 'text-xs font-mono')

export default function ImportModal({ siteId, onClose, autoDiscoverUrl, isSuperAdmin = false }: { siteId: string; onClose: () => void; autoDiscoverUrl?: string; isSuperAdmin?: boolean }) {
  const [phase, setPhase] = useState<Phase>('input')

  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<'sitemap' | 'rss' | 'wordpress' | 'crawl' | null>(null)
  const [wpApiBase, setWpApiBase] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<DiscoveredArticle[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overwrite, setOverwrite] = useState(false)
  // Imported articles are published automatically by default (opt-out below).
  const [publish, setPublish] = useState(true)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [langFilter, setLangFilter] = useState<string>('all')

  const [crawlUrl, setCrawlUrl] = useState('')
  const [linkSelector, setLinkSelector] = useState('')
  const [crawlLoading, setCrawlLoading] = useState(false)
  const [crawlError, setCrawlError] = useState<string | null>(null)
  const [showCrawlSelectors, setShowCrawlSelectors] = useState(false)

  const [manualUrl, setManualUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)

  const [customSelectors, setCustomSelectors] = useState<Record<string, string>>({})

  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [results, setResults] = useState<ImportResult[]>([])
  const [isMinimized, setIsMinimized] = useState(false)

  const cancelRef = useRef(false)
  const router = useRouter()
  const { toast } = useToast()

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
    : method === 'crawl' ? 'Pàgina rastrejada'
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

  const handleDiscover = async (target: string = url) => {
    const u = target.trim()
    if (!u) return
    setPhase('discovering')
    setDiscoverError(null)
    try {
      const res = await fetch('/api/import/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
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

  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current || !autoDiscoverUrl) return
    autoRan.current = true
    setUrl(autoDiscoverUrl)
    void handleDiscover(autoDiscoverUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDiscoverUrl])

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
    const total = urlsToImport.length
    setProgress({ done: 0, total, current: '' })
    setResults([])
    const allResults: ImportResult[] = []

    // Each article is still one request (the DB-aware i18n merge relies on it).
    // To import unlimited articles without freezing or taking forever, we run a
    // bounded pool of these requests in parallel. EXCEPTION: a multilingual set
    // is imported sequentially so language siblings can't race each other and
    // both miss the merge (which would create a duplicate per language).
    const isMultilingual = new Set(discovered.map(a => a.language).filter(Boolean)).size > 1
    const concurrency = isMultilingual ? 1 : Math.min(IMPORT_CONCURRENCY, total)

    let done = 0
    let cursor = 0

    const importOne = async (articleUrl: string) => {
      const articleTitle = discovered.find(a => a.url === articleUrl)?.title ?? articleUrl
      setProgress(p => ({ done: p.done, total, current: articleTitle }))
      try {
        const res = await fetch('/api/import/articles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: [articleUrl], siteId, overwrite, publish,
            ...(wpApiBase ? { wpApiBase } : {}),
            ...(hasCustomSelectors ? { selectors: customSelectors } : {}),
          }),
        })
        const data = await res.json()
        allResults.push(data.results?.[0] ?? { url: articleUrl, success: false, error: 'Sense resposta' })
      } catch {
        allResults.push({ url: articleUrl, success: false, error: 'Error de xarxa' })
      }
      done += 1
      setProgress({ done, total, current: articleTitle })
      setResults([...allResults])
    }

    const worker = async () => {
      for (;;) {
        if (cancelRef.current) return
        const i = cursor++
        if (i >= total) return
        await importOne(urlsToImport[i])
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()))

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
          urls: [manualUrl.trim()], siteId, overwrite: false, publish,
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
      <div className="fixed bottom-6 right-6 z-50 bg-bg-elevated rounded-xl shadow-premium border border-border p-4 flex items-center gap-4 min-w-[280px] max-w-sm">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text mb-1.5">Importació en curs · {progress.done}/{progress.total}</p>
          <div className="bg-surface-subtle rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          {progress.current && <p className="text-xs text-subtle mt-1 truncate">{progress.current}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setIsMinimized(false)} title="Tornar al primer pla" className="cursor-pointer p-1.5 text-subtle hover:text-text hover:bg-surface-hover rounded-md transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={() => { cancelRef.current = true; onClose() }} title="Cancel·lar i tancar" className="cursor-pointer p-1.5 text-subtle hover:text-danger hover:bg-danger-soft rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-bg-elevated border border-border rounded-2xl shadow-premium flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-4 p-6 pb-4 shrink-0 border-b border-border">
          <div className="w-11 h-11 bg-accent-soft text-accent rounded-xl flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text">Importar Articles</h2>
            <p className="text-xs text-muted mt-0.5 truncate">
              {phase === 'input' && (isSuperAdmin ? 'Tria el mètode d\'importació' : 'Enganxa la teva web i tria què vols importar')}
              {phase === 'discovering' && 'Detectant articles…'}
              {phase === 'preview' && `${discovered.length} articles detectats via ${methodLabel}`}
              {phase === 'preview-manual' && `Vista prèvia · ${manualUrl}`}
              {phase === 'importing' && `${progress.done} / ${progress.total} · ${progress.current}`}
              {phase === 'done' && `Finalitzat · ${importedCount} importats · ${skippedCount} omesos · ${failedCount} errors`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {phase === 'importing' && (
              <button onClick={() => setIsMinimized(true)} title="Passar a segon pla" className="cursor-pointer p-2 text-subtle hover:text-text hover:bg-surface-hover rounded-md transition-colors">
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="cursor-pointer p-2 text-subtle hover:text-text bg-surface-subtle hover:bg-surface-hover rounded-md transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── FASE: Input ── */}
          {(phase === 'input' || phase === 'discovering') && (
            <>
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-subtle">
                  {isSuperAdmin ? 'Descoberta automàtica (WordPress · Sitemap · RSS)' : 'La teva pàgina web'}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
                    <input
                      type="url" value={url} onChange={e => setUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleDiscover()}
                      placeholder="https://example.com" disabled={phase === 'discovering'}
                      className={`${INPUT} pl-9 disabled:opacity-60`}
                    />
                  </div>
                  <Button
                    glow
                    onClick={() => handleDiscover()} disabled={!url.trim() || phase === 'discovering'}
                    iconLeft={phase === 'discovering' ? <KnotSpinner className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                  >
                    {phase === 'discovering' ? 'Descobrint…' : 'Descobrir'}
                  </Button>
                </div>
                {discoverError && <ErrorRow msg={discoverError} />}
              </div>

              {/* Advanced discovery (crawl-by-selector) — operator-only, to keep the
                  client import flow simple and uncluttered. */}
              {isSuperAdmin && (
                <>
                  <Divider />

                  {/* Crawl */}
                  <div className="space-y-3 bg-surface-subtle border border-border rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-muted" />
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                    Pàgina d&apos;articles · Rastreig per selector CSS
                  </label>
                </div>
                <p className="text-xs text-subtle leading-relaxed">
                  Per a webs sense WordPress ni feed. Indica la pàgina de llistats i el selector CSS que apunta als links dels articles.
                </p>

                <div className="space-y-2">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
                    <input
                      type="url" value={crawlUrl} onChange={e => setCrawlUrl(e.target.value)}
                      placeholder="https://example.com/noticies" disabled={crawlLoading}
                      className={`${INPUT} pl-9 disabled:opacity-60`}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle pointer-events-none" />
                      <input
                        type="text" value={linkSelector} onChange={e => setLinkSelector(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCrawl()}
                        placeholder=".article-list a.title  ·  article h2 > a"
                        disabled={crawlLoading}
                        className={`${INPUT_MONO} pl-9 disabled:opacity-60`}
                      />
                    </div>
                    <Button
                      onClick={handleCrawl} disabled={!crawlUrl.trim() || !linkSelector.trim() || crawlLoading}
                      variant="secondary"
                      iconLeft={crawlLoading ? <KnotSpinner className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                    >
                      Rastrejar
                    </Button>
                  </div>
                </div>

                {crawlError && <ErrorRow msg={crawlError} small />}

                <button
                  onClick={() => setShowCrawlSelectors(v => !v)}
                  className="cursor-pointer flex items-center gap-2 text-xs font-semibold text-subtle hover:text-text uppercase tracking-wider transition-colors"
                >
                  {showCrawlSelectors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Selectors per camps (opcional)
                </button>

                {showCrawlSelectors && (
                  <div className="space-y-2 pt-1">
                    {SELECTOR_FIELDS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted w-20 shrink-0">{label}</span>
                        <input
                          type="text"
                          value={customSelectors[key] ?? ''}
                          onChange={e => setCustomSelectors(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={`Selector per a ${label.toLowerCase()}…`}
                          className={`${INPUT_MONO} flex-1 h-9`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                  </div>
                </>
              )}

              <Divider />

              {/* Manual */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-subtle">
                  {isSuperAdmin ? 'URL manual · Article únic' : 'O importa un sol article'}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
                    <input
                      type="url" value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handlePreview()}
                      placeholder="https://example.com/nom-de-larticle" disabled={previewLoading}
                      className={`${INPUT} pl-9 disabled:opacity-60`}
                    />
                  </div>
                  <Button
                    onClick={handlePreview} disabled={!manualUrl.trim() || previewLoading}
                    variant="secondary"
                    iconLeft={previewLoading ? <KnotSpinner className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  >
                    Previsualitzar
                  </Button>
                </div>
                {previewError && <ErrorRow msg={previewError} small />}
              </div>
            </>
          )}

          {/* ── FASE: Preview manual ── */}
          {phase === 'preview-manual' && (
            <>
              {previewLoading && (
                <div className="flex items-center justify-center py-10">
                  <KnotLoader size={56} />
                </div>
              )}
              {!previewLoading && previewData && (
                <div className="space-y-5">
                  <div className="bg-surface-subtle border border-border rounded-xl p-4 space-y-3">
                    {previewData.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewData.image} alt="" className="w-full h-32 object-cover rounded-lg" />
                    )}
                    <FieldRow label="Títol">
                      {previewData.title ? <p className="text-sm font-semibold text-text">{previewData.title}</p> : <p className="text-sm text-subtle italic">No detectat</p>}
                    </FieldRow>
                    {previewData.author && <FieldRow label="Autor"><p className="text-xs text-text">{previewData.author}</p></FieldRow>}
                    {previewData.date && <FieldRow label="Data"><p className="text-xs text-text">{previewData.date}</p></FieldRow>}
                    {previewData.categories.length > 0 && (
                      <FieldRow label="Categories">
                        <div className="flex flex-wrap gap-1">
                          {previewData.categories.map(c => (
                            <span key={c} className="px-2 py-0.5 bg-accent-soft text-accent rounded text-xs font-semibold">{c}</span>
                          ))}
                        </div>
                      </FieldRow>
                    )}
                    {previewData.contentPreview && (
                      <FieldRow label={`Contingut (${previewData.contentLength} car.)`}>
                        <p className="text-xs text-muted line-clamp-3 leading-relaxed">{previewData.contentPreview}</p>
                      </FieldRow>
                    )}
                  </div>

                  {isSuperAdmin && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">Selectors CSS</p>
                    <div className="space-y-2.5">
                      {SELECTOR_FIELDS.map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-medium text-text shrink-0">{label}</label>
                            {previewData.selectorsUsed[key] && (
                              <span className="text-xs font-mono text-subtle bg-surface-subtle px-2 py-0.5 rounded truncate max-w-[220px]">{previewData.selectorsUsed[key]}</span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={customSelectors[key] ?? ''}
                            onChange={e => setCustomSelectors(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={previewData.selectorsUsed[key] ? `Sobreescriu: ${previewData.selectorsUsed[key]}` : `Selector per a ${label.toLowerCase()}…`}
                            className={`${INPUT_MONO} h-9`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setPhase('input')} iconLeft={<RotateCcw className="w-3.5 h-3.5" />}>Tornar</Button>
                    <Button variant="secondary" size="sm" onClick={handlePreview} disabled={previewLoading} iconLeft={<RefreshCw className="w-3.5 h-3.5" />}>Re-analitzar</Button>
                    <Button glow onClick={handleManualImport} iconLeft={<Upload className="w-4 h-4" />}>Importar</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── FASE: Preview (llista descoberta) ── */}
          {phase === 'preview' && (
            <div className="space-y-4">
              {availableLangs.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-subtle shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-subtle shrink-0">Idioma:</span>
                  <LangChip active={langFilter === 'all'} onClick={() => { setLangFilter('all'); setSelected(new Set(discovered.map(a => a.url))) }}>
                    Tots ({discovered.length})
                  </LangChip>
                  {availableLangs.map(lang => (
                    <LangChip key={lang} active={langFilter === lang} onClick={() => { setLangFilter(lang); setSelected(new Set(discovered.filter(a => a.language === lang).map(a => a.url))) }}>
                      {langLabel(lang)} ({discovered.filter(a => a.language === lang).length})
                    </LangChip>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <label className="cursor-pointer flex items-center gap-2">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="w-4 h-4 accent-accent rounded cursor-pointer" />
                  <span className="text-sm font-medium text-text">Tots ({selectedInFilter} / {filteredDiscovered.length})</span>
                </label>
                <div className="flex items-center gap-4">
                  <label className="cursor-pointer flex items-center gap-2">
                    <input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} className="w-4 h-4 accent-accent rounded cursor-pointer" />
                    <span className="text-xs font-medium text-muted">Publicar automàticament</span>
                  </label>
                  {isSuperAdmin && (
                    <label className="cursor-pointer flex items-center gap-2">
                      <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="w-4 h-4 accent-accent rounded cursor-pointer" />
                      <span className="text-xs font-medium text-muted">Sobreescriure existents</span>
                    </label>
                  )}
                </div>
              </div>

              {method === 'crawl' && (
                <div className="bg-warning-soft border border-warning/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-warning">
                    Mode rastreig: s&apos;aplicaran {hasCustomSelectors ? 'els selectors configurats' : 'els selectors automàtics'} a cada article.
                  </p>
                  {!hasCustomSelectors && (
                    <button
                      onClick={() => { setPhase('input'); setShowCrawlSelectors(true) }}
                      className="cursor-pointer text-xs font-semibold text-warning underline hover:no-underline mt-1"
                    >
                      Configurar selectors CSS
                    </button>
                  )}
                </div>
              )}

              <div className="grid max-h-[22rem] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredDiscovered.map(article => (
                  <ArticleCard
                    key={article.url}
                    article={article}
                    selected={selected.has(article.url)}
                    onToggle={() => toggleOne(article.url)}
                  />
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setPhase('input'); setDiscoverError(null) }} iconLeft={<RotateCcw className="w-4 h-4" />}>
                  Nova cerca
                </Button>
                <Button glow onClick={() => handleImport([...selected])} disabled={selected.size === 0} iconLeft={<Upload className="w-4 h-4" />}>
                  Importar {selected.size} article{selected.size !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}

          {/* ── FASE: Importing ── */}
          {phase === 'importing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-text">{progress.done} / {progress.total} processats</span>
                <span className="font-semibold text-accent">{progressPct}%</span>
              </div>
              <div className="bg-surface-subtle rounded-full h-2 overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              {progress.current && (
                <p className="text-xs text-muted truncate font-medium flex items-center gap-2">
                  <KnotSpinner className="w-3 h-3 shrink-0 text-accent" />{progress.current}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { cancelRef.current = true }} iconLeft={<StopCircle className="w-4 h-4" />} className="!text-danger !border-danger/30">
                  Cancel·lar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsMinimized(true)} iconLeft={<Minimize2 className="w-4 h-4" />}>
                  Segon pla
                </Button>
              </div>
              {results.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {results.map((r, i) => <ResultRow key={r.url} r={r} divider={i > 0} />)}
                </div>
              )}
            </div>
          )}

          {/* ── FASE: Done ── */}
          {phase === 'done' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat tone="success" value={importedCount} label="Importats" />
                <Stat tone="neutral" value={skippedCount} label="Omesos" />
                <Stat tone={failedCount > 0 ? 'danger' : 'neutral'} value={failedCount} label="Errors" />
              </div>
              {results.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {results.map((r, i) => <ResultRow key={r.url} r={r} divider={i > 0} highlightFail />)}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                {importedCount === 0 && (
                  <Button variant="ghost" onClick={() => { setPhase('input'); setResults([]); setDiscoverError(null) }} iconLeft={<RotateCcw className="w-4 h-4" />}>
                    Tornar a intentar
                  </Button>
                )}
                <Button onClick={onClose}>Tancar</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Small atoms ──────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-semibold uppercase tracking-wider text-subtle">o</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function ErrorRow({ msg, small = false }: { msg: string; small?: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 ${small ? 'p-2.5' : 'p-3'} bg-danger-soft border border-danger/20 rounded-lg`}>
      <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
      <p className={`${small ? 'text-xs' : 'text-sm'} text-danger font-medium`}>{msg}</p>
    </div>
  )
}

// A selectable article card — the heart of the new card-based discovery view.
// The whole surface is the toggle (aria-pressed), with a clear gold selected
// state, so picking which articles to import feels tactile, not like a form.
function ArticleCard({ article, selected, onToggle }: { article: DiscoveredArticle; selected: boolean; onToggle: () => void }) {
  let path = article.url
  try {
    const u = new URL(article.url)
    path = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname)
  } catch { /* keep raw url */ }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'group flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
        selected
          ? 'border-accent bg-accent-soft ring-1 ring-accent/25'
          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-hover',
      )}
    >
      <span className={cn(
        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
        selected ? 'border-accent bg-accent text-on-accent' : 'border-border-strong text-transparent group-hover:border-accent',
      )}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">{article.title || 'Sense títol'}</span>
        <span className="mt-0.5 block truncate text-xs text-subtle">{path}</span>
      </span>
      {article.language && (
        <span title={langLabel(article.language)} className="shrink-0 rounded bg-surface-subtle px-1.5 py-0.5 text-xs font-semibold uppercase text-muted">{article.language}</span>
      )}
    </button>
  )
}

function LangChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
        active ? 'bg-text text-bg-elevated' : 'bg-surface-subtle text-muted hover:text-text hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle mb-1">{label}</p>
      {children}
    </div>
  )
}

function ResultRow({ r, divider, highlightFail = false }: { r: ImportResult; divider: boolean; highlightFail?: boolean }) {
  const failBg = highlightFail && !r.success && !r.skipped ? 'bg-danger-soft/40' : ''
  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 ${divider ? 'border-t border-border' : ''} ${failBg}`}>
      {r.success ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
       : r.skipped ? <AlertCircle className="w-4 h-4 text-subtle shrink-0 mt-0.5" />
       : <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text truncate">{r.title ?? r.url}</p>
        {r.error && !r.skipped && <p className="text-xs text-danger mt-0.5">{r.error}</p>}
      </div>
    </div>
  )
}

function Stat({ tone, value, label }: { tone: 'success' | 'neutral' | 'danger'; value: number; label: string }) {
  const toneCls = tone === 'success' ? 'bg-success-soft border-success/20 text-success'
    : tone === 'danger' ? 'bg-danger-soft border-danger/20 text-danger'
    : 'bg-surface-subtle border-border text-muted'
  return (
    <div className={`border rounded-xl p-4 text-center ${toneCls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-semibold mt-1">{label}</p>
    </div>
  )
}
