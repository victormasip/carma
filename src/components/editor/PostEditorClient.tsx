'use client'

// "Notion-tier" article editor.
//
// Layout:
//   · Slim sticky top bar: back + breadcrumb · LANGUAGE BAR · AI translate ·
//     preview · settings/SEO drawer toggle · save.
//   · Full-bleed centered writing canvas: huge title, auto slug, then the
//     distraction-free TipTap canvas. No always-on toolbar, no fixed sidebar.
//   · Right slide-over for everything contextual (Ajustos / SEO / AI). The
//     canvas reclaims the viewport when the drawer is closed.

import { useState, useCallback, useMemo, useTransition, useEffect, useRef, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Eye, EyeOff, Loader2, Tag, X, ImageIcon,
  User, FileText, Globe, CalendarDays, Settings2, Search, Target,
  CheckCircle2, AlertCircle, ExternalLink, Sparkles, Plus, Crown,
  RefreshCw, PanelRight, Bot, Languages, Upload,
} from 'lucide-react'
import { uploadImage } from '@/lib/upload'
import { createPost, updatePost, translateArticle, analyzeArticleWriting, generateSeoArticle, type PostData, type LocalizedContent } from '@/lib/actions/posts'
import type { WritingAnalysis } from '@/lib/writing/coach'
import { addSiteLocale } from '@/lib/actions/locales'
import { LOCALES, DEFAULT_LOCALE, LOCALE_META, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { detectLocale } from '@/lib/i18n/detect'
import { useToast } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { PremiumPanel } from '@/app/dashboard/sites/[id]/PremiumGate'
import SegmentedTabs from '@/components/ui/SegmentedTabs'
import { cn } from '@/lib/cn'
import Link from 'next/link'

// Code-split the heavy rich-text editor so it doesn't bloat the initial bundle.
const TipTapEditor = lazy(() => import('./TipTapEditor'))

// Debounce so SEO analysis only runs when typing pauses (not on every keystroke).
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

type Post = {
  id: string
  title: string
  slug: string
  content: { html?: string } | Record<string, unknown>
  excerpt?: string | null
  featured_image?: string | null
  categories?: string[]
  tags?: string[]
  seo_title?: string | null
  seo_description?: string | null
  author_name?: string | null
  is_published: boolean
  created_at?: string | null
  meta?: { canonical?: string; noindex?: boolean; focus_keyword?: string } | null
  default_locale?: string | null
  i18n?: Record<string, Partial<LocalizedContent>> | null
}

type Props = {
  siteId: string
  siteName: string
  post?: Post
  siteLocales?: string[]
  siteDefaultLocale?: string
  canTranslate?: boolean
}

type DrawerTab = 'settings' | 'seo' | 'ai'

type LocaleFields = {
  title: string
  slug: string
  slugTouched: boolean
  contentHtml: string
  excerpt: string
  seoTitle: string
  seoDescription: string
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100) || 'article'
}

function htmlOf(content: unknown): string {
  if (content && typeof content === 'object' && 'html' in content) {
    const h = (content as { html?: unknown }).html
    if (typeof h === 'string') return h
  }
  return ''
}

function emptyFields(): LocaleFields {
  return { title: '', slug: '', slugTouched: false, contentHtml: '', excerpt: '', seoTitle: '', seoDescription: '' }
}

function fieldsCompletionPct(f: LocaleFields): number {
  const checks: [number, boolean][] = [
    [3, !!f.title.trim()],
    [3, f.contentHtml.replace(/<[^>]+>/g, '').trim().length >= 50],
    [1, !!f.slug.trim()],
    [1, !!f.excerpt.trim()],
    [1, !!f.seoTitle.trim()],
    [1, !!f.seoDescription.trim()],
  ]
  const total = checks.reduce((s, [w]) => s + w, 0)
  const got = checks.reduce((s, [w, ok]) => s + (ok ? w : 0), 0)
  return Math.round((got / total) * 100)
}

function initLocaleData(post: Post | undefined, defaultLocale: Locale): Record<Locale, LocaleFields> {
  const out = {} as Record<Locale, LocaleFields>
  for (const loc of LOCALES) out[loc] = emptyFields()
  if (post) {
    out[defaultLocale] = {
      title: post.title ?? '',
      slug: post.slug ?? '',
      slugTouched: true,
      contentHtml: htmlOf(post.content),
      excerpt: post.excerpt ?? '',
      seoTitle: post.seo_title ?? '',
      seoDescription: post.seo_description ?? '',
    }
    for (const [loc, v] of Object.entries(post.i18n ?? {})) {
      if (loc === defaultLocale) continue
      if (!(LOCALES as readonly string[]).includes(loc) || !v) continue
      out[loc as Locale] = {
        title: v.title ?? '',
        slug: v.slug ?? '',
        slugTouched: !!(v.slug ?? '').trim(),
        contentHtml: htmlOf(v.content),
        excerpt: v.excerpt ?? '',
        seoTitle: v.seo_title ?? '',
        seoDescription: v.seo_description ?? '',
      }
    }
  }
  return out
}

// ── SEO scoring ──────────────────────────────────────────────────────────────
type SeoInput = {
  title: string; seoTitle: string; seoDescription: string; slug: string
  focusKeyword: string; contentHtml: string; featuredImage: string
}
type SeoCheck = { label: string; pass: boolean }

function runSeoChecks(i: SeoInput): SeoCheck[] {
  const effTitle = (i.seoTitle || i.title).trim()
  const kw = i.focusKeyword.trim().toLowerCase()
  const plain = i.contentHtml.replace(/<[^>]+>/g, ' ').toLowerCase()
  const words = plain.split(/\s+/).filter(Boolean).length

  const checks: SeoCheck[] = [
    { label: 'Títol SEO entre 30 i 60 caràcters', pass: effTitle.length >= 30 && effTitle.length <= 60 },
    { label: 'Meta descripció entre 120 i 160 caràcters', pass: i.seoDescription.length >= 120 && i.seoDescription.length <= 160 },
    { label: 'Slug curt i net', pass: !!i.slug && i.slug.length <= 75 },
    { label: 'Imatge destacada definida', pass: !!i.featuredImage },
    { label: 'Contingut amb 300+ paraules', pass: words >= 300 },
  ]
  if (kw) {
    checks.push(
      { label: 'Paraula clau al títol', pass: effTitle.toLowerCase().includes(kw) },
      { label: 'Paraula clau a la meta descripció', pass: i.seoDescription.toLowerCase().includes(kw) },
      { label: 'Paraula clau al slug', pass: i.slug.includes(kw.replace(/\s+/g, '-')) },
      { label: 'Paraula clau al contingut', pass: plain.includes(kw) },
    )
  }
  return checks
}

function scoreColor(pct: number): { text: string; bg: string; ring: string; label: string } {
  if (pct >= 80) return { text: 'text-success', bg: 'bg-success', ring: 'text-success', label: 'Bo' }
  if (pct >= 50) return { text: 'text-warning', bg: 'bg-warning', ring: 'text-warning', label: 'Millorable' }
  return { text: 'text-danger', bg: 'bg-danger', ring: 'text-danger', label: 'Fluix' }
}

function counterTone(len: number, min: number, max: number): string {
  if (len === 0) return 'text-subtle'
  if (len > max) return 'text-danger'
  if (len < min) return 'text-warning'
  return 'text-success'
}

// ── AI chatbot analysis ──────────────────────────────────────────────────────
//
// Predicts how the article will appear to LLM browsers (ChatGPT, Perplexity,
// Claude). They strip tags, summarize the first ~2000 chars, lean on JSON-LD
// `Article` fields, and cite by description. So we score on those signals.

type AiInsight = { kind: 'good' | 'warn'; label: string; hint?: string }

function detectFaqShape(html: string): number {
  if (!html) return 0
  // Count H2/H3 ending with "?" — those become FAQ entries automatically at render.
  const m = html.match(/<h[23][^>]*>[^<]*\?\s*<\/h[23]>/gi)
  return m ? m.length : 0
}

function runAiAnalysis(i: { title: string; description: string; contentHtml: string; featuredImage: string; categories: string[]; authorName: string }): AiInsight[] {
  const plain = i.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const words = plain.split(/\s+/).filter(Boolean).length
  const faqCount = detectFaqShape(i.contentHtml)

  const out: AiInsight[] = []

  if (i.title.length >= 30 && i.title.length <= 70) out.push({ kind: 'good', label: 'Títol clar i citable per chatbots' })
  else out.push({ kind: 'warn', label: 'Títol massa curt o massa llarg', hint: 'Els LLMs prefereixen 30–70 caràcters quan citen' })

  if (i.description.trim().length >= 80) out.push({ kind: 'good', label: 'Descripció rica per a la citació' })
  else out.push({ kind: 'warn', label: 'Afegeix una descripció (excerpt o meta) ≥ 80 caràcters', hint: 'És el que ChatGPT/Perplexity citen literalment' })

  if (words >= 600) out.push({ kind: 'good', label: `${words} paraules — suficient per resumir` })
  else out.push({ kind: 'warn', label: 'Massa curt per generar resums citables', hint: 'Apunta a ≥ 600 paraules per a articles informatius' })

  if (faqCount >= 2) out.push({ kind: 'good', label: `${faqCount} preguntes detectades — emetrem FAQ JSON-LD` })
  else out.push({ kind: 'warn', label: 'Cap secció FAQ detectada', hint: 'Si fas H2/H3 acabats en "?", els emetrem com a FAQ schema (millora ChatGPT/Perplexity)' })

  if (i.featuredImage) out.push({ kind: 'good', label: 'Imatge destacada — apareixerà a les targetes de cita' })
  else out.push({ kind: 'warn', label: 'Sense imatge destacada', hint: 'Les eines amb panell de citacions (ChatGPT) la mostren si existeix' })

  if (i.authorName) out.push({ kind: 'good', label: 'Autoria definida (Article schema)' })
  else out.push({ kind: 'warn', label: 'Sense autor', hint: 'Augmenta la confiança per a E-E-A-T i les eines d\'IA' })

  return out
}

function buildLlmsExcerpt(input: { title: string; description: string; contentHtml: string; siteName: string; locale: Locale; categories: string[] }): string {
  const plain = input.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const firstChunk = plain.slice(0, 480).trim() + (plain.length > 480 ? '…' : '')
  return [
    `# ${input.title || 'Sense títol'}`,
    `> ${input.description || firstChunk.slice(0, 220)}`,
    '',
    `_Publicat per ${input.siteName} · ${input.locale.toUpperCase()}${input.categories.length ? ` · ${input.categories[0]}` : ''}_`,
    '',
    firstChunk,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PostEditorClient({ siteId, siteName, post, siteLocales, siteDefaultLocale, canTranslate = false }: Props) {
  const isNew = !post
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()

  const defaultLocale = useMemo(
    () => normalizeLocale(post?.default_locale ?? siteDefaultLocale, DEFAULT_LOCALE),
    [post?.default_locale, siteDefaultLocale],
  )

  // Per-locale text state
  const [localeData, setLocaleData] = useState<Record<Locale, LocaleFields>>(() => initLocaleData(post, defaultLocale))
  // ONE-SHOT initial language detection: if the article is an existing post
  // whose content is clearly in a non-default language (e.g. Spanish content on
  // a Catalan-default site), jump straight to that tab. Lazy initializer so we
  // don't have to setState in an effect (forbidden in React 19 strict).
  const [activeLocale, setActiveLocale] = useState<Locale>(() => {
    if (!post) return defaultLocale
    const src = initLocaleData(post, defaultLocale)[defaultLocale]
    const sample = `${src.title}\n${src.contentHtml}`
    const { locale } = detectLocale(sample)
    if (locale && locale !== defaultLocale) return locale
    return defaultLocale
  })
  const [shownLocales, setShownLocales] = useState<Locale[]>(() => {
    const set = new Set<Locale>([defaultLocale])
    for (const l of siteLocales ?? []) if ((LOCALES as readonly string[]).includes(l)) set.add(l as Locale)
    if (post) {
      for (const loc of LOCALES) {
        if (loc === defaultLocale) continue
        const v = post.i18n?.[loc]
        if (v && ((v.title ?? '').trim() || htmlOf(v.content).trim())) set.add(loc)
      }
    }
    return LOCALES.filter(l => set.has(l))
  })

  const [addLangOpen, setAddLangOpen] = useState(false)
  const addLangRef = useRef<HTMLDivElement>(null)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [editorNonce, setEditorNonce] = useState(0)
  const [translating, setTranslating] = useState(false)

  // Language detection — surfaced as a pill the user can confirm or dismiss.
  // The detected locale is derived (useMemo) from debounced content, so we
  // don't have to setState-in-effect. The "dismissed" flag resets via the
  // render-time sync pattern below whenever the user switches tabs.
  const [dismissedFor, setDismissedFor] = useState<Locale | null>(null)

  const pickLocale = useCallback((loc: Locale) => {
    setActiveLocale(loc)
  }, [])

  useEffect(() => {
    if (!addLangOpen) return
    const onClick = (e: MouseEvent) => {
      if (addLangRef.current && !addLangRef.current.contains(e.target as Node)) setAddLangOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddLangOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [addLangOpen])

  const availableToAdd = LOCALES.filter(l => !shownLocales.includes(l))

  const addLanguage = (loc: Locale) => {
    setShownLocales(prev => LOCALES.filter(l => prev.includes(l) || l === loc))
    setActiveLocale(loc)
    setAddLangOpen(false)
    void addSiteLocale(siteId, loc).catch(() => {})
  }

  const removeLanguage = (loc: Locale) => {
    if (loc === defaultLocale) return
    setShownLocales(prev => prev.filter(l => l !== loc))
    setLocaleData(prev => ({ ...prev, [loc]: emptyFields() }))
    if (activeLocale === loc) setActiveLocale(defaultLocale)
  }

  const cur = localeData[activeLocale]
  const isDefault = activeLocale === defaultLocale

  const patchLocale = useCallback((locale: Locale, patch: Partial<LocaleFields>) => {
    setLocaleData(prev => ({ ...prev, [locale]: { ...prev[locale], ...patch } }))
  }, [])

  // Shared (non-localized) state
  const [featuredImage, setFeaturedImage] = useState(post?.featured_image ?? '')
  const [categories, setCategories] = useState<string[]>(post?.categories ?? [])
  const [tags, setTags] = useState<string[]>(post?.tags ?? [])
  const [focusKeyword, setFocusKeyword] = useState(post?.meta?.focus_keyword ?? '')
  const [canonical, setCanonical] = useState(post?.meta?.canonical ?? '')
  const [noindex, setNoindex] = useState(post?.meta?.noindex ?? false)
  const [authorName, setAuthorName] = useState(post?.author_name ?? '')
  const [isPublished, setIsPublished] = useState(post?.is_published ?? false)
  const [date, setDate] = useState(post?.created_at ? post.created_at.slice(0, 10) : '')
  const [drawerOpen, setDrawerOpen] = useState(true)
  // New posts open straight to the AI tab so "Genera un article SEO" is right
  // there; existing posts open on Ajustos.
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(isNew ? 'ai' : 'settings')
  const [error, setError] = useState<string | null>(null)
  // Transient "Desat" confirmation shown on the Save button after an in-place save.
  const [savedFlash, setSavedFlash] = useState(false)

  // Writing coach state. The analysis is per-language, so we key it by the
  // locale it was computed for and treat it as null whenever the user has
  // switched to a different tab (render-time sync, no setState-in-effect).
  const [writingAnalysisByLocale, setWritingAnalysisByLocale] = useState<{ locale: Locale; data: WritingAnalysis } | null>(null)
  const [writingLoading, setWritingLoading] = useState(false)
  const [writingErrorByLocale, setWritingErrorByLocale] = useState<{ locale: Locale; msg: string } | null>(null)

  // Magic SEO Article state. Premium-gated to the same tier as AI translate /
  // writing coach (the expensive Opus call is a paid feature for free clients).
  const canGenerate = canTranslate
  const [generatingArticle, setGeneratingArticle] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generatePremiumOpen, setGeneratePremiumOpen] = useState(false)
  const writingAnalysis = writingAnalysisByLocale?.locale === activeLocale ? writingAnalysisByLocale.data : null
  const writingError = writingErrorByLocale?.locale === activeLocale ? writingErrorByLocale.msg : null

  const runWritingCoach = async () => {
    if (writingLoading) return
    if (!canTranslate) { setPremiumOpen(true); return }
    const target = activeLocale
    setWritingErrorByLocale(null)
    setWritingLoading(true)
    try {
      const res = await analyzeArticleWriting(siteId, target, { title: cur.title, html: cur.contentHtml })
      if (res.error || !res.result) {
        setWritingErrorByLocale({ locale: target, msg: res.error ?? 'Error analitzant' })
        return
      }
      setWritingAnalysisByLocale({ locale: target, data: res.result })
    } catch (err) {
      setWritingErrorByLocale({ locale: target, msg: err instanceof Error ? err.message : 'Error analitzant' })
    } finally {
      setWritingLoading(false)
    }
  }

  // ── MAGIC SEO ARTICLE ────────────────────────────────────────────────────
  // Backend analyzes the site URL → niche/tone → writes a complete article. We
  // drop the result straight into the ACTIVE locale's fields + the shared
  // category/tag/keyword fields, no reload. If the locale already has content we
  // confirm first so we never silently overwrite the user's work.
  const handleGenerateArticle = async () => {
    if (generatingArticle) return
    if (!canGenerate) { setGeneratePremiumOpen(true); return }
    const target = activeLocale
    if (localeHasContent(target)) {
      const ok = await confirm({
        title: `Substituir el contingut en ${LOCALE_META[target].native}?`,
        message: 'La IA generarà un article nou i reemplaçarà el títol i el contingut d’aquest idioma. Aquesta acció no es pot desfer.',
        confirmLabel: 'Genera i substitueix',
        cancelLabel: 'Cancel·la',
      })
      if (!ok) return
    }
    setGenerateError(null)
    setGeneratingArticle(true)
    try {
      const res = await generateSeoArticle(siteId, { locale: target })
      if (res.error || !res.result) {
        setGenerateError(res.error ?? 'No s’ha pogut generar l’article')
        return
      }
      const a = res.result
      setLocaleData(prev => ({
        ...prev,
        [target]: {
          ...prev[target],
          title: a.title,
          slug: a.slug || generateSlug(a.title),
          slugTouched: !!a.slug,
          contentHtml: a.contentHtml,
          excerpt: a.excerpt,
          seoTitle: a.seoTitle,
          seoDescription: a.seoDescription,
        },
      }))
      // Shared (non-localized) fields — only fill when empty so we don't stomp
      // existing choices; the focus keyword always reflects the new article.
      if (a.focusKeyword) setFocusKeyword(a.focusKeyword)
      if (a.categories.length) setCategories(prev => (prev.length ? prev : a.categories))
      if (a.tags.length) setTags(prev => (prev.length ? prev : a.tags))
      // Remount TipTap so it picks up the generated body under the active locale.
      setEditorNonce(n => n + 1)
      toast(`Article generat en ${LOCALE_META[target].native}`, 'success')
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Error generant l’article')
    } finally {
      setGeneratingArticle(false)
    }
  }

  // Replace the first plain-text occurrence of `before` in the active locale's
  // content HTML with `after`. We only replace inside text nodes (a simple regex
  // over the HTML risks hitting tag attributes / class names; instead we walk
  // text-nodes via a DOMParser fallback to a guarded string replace).
  const applyWritingSuggestion = (before: string, after: string) => {
    const html = cur.contentHtml
    const trimmedBefore = before.trim()
    if (!trimmedBefore) return
    // Fast path: an exact substring match in the HTML. Skip if `before` looks
    // like it could appear in a tag (contains < or >).
    if (!/[<>]/.test(trimmedBefore) && html.includes(trimmedBefore)) {
      const next = html.replace(trimmedBefore, after)
      patchLocale(activeLocale, { contentHtml: next })
      setEditorNonce(n => n + 1)
      return
    }
    // Fallback: walk the DOM and replace inside the first text node containing it.
    try {
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
      let node: Node | null = walker.nextNode()
      while (node) {
        const text = node.nodeValue ?? ''
        if (text.includes(trimmedBefore)) {
          node.nodeValue = text.replace(trimmedBefore, after)
          patchLocale(activeLocale, { contentHtml: doc.body.innerHTML })
          setEditorNonce(n => n + 1)
          return
        }
        node = walker.nextNode()
      }
    } catch { /* ignore */ }
    // No match → toast and leave content alone.
    toast('No s’ha trobat el fragment exacte a l’article. Aplica el canvi manualment.', 'info')
  }

  const handleTitleChange = (val: string) => {
    patchLocale(activeLocale, { title: val, ...(cur.slugTouched ? {} : { slug: generateSlug(val) }) })
  }

  const regenerateSlug = () => {
    patchLocale(activeLocale, { slug: generateSlug(cur.title), slugTouched: false })
  }

  const handleContentChange = useCallback((html: string) => {
    setLocaleData(prev => ({ ...prev, [activeLocale]: { ...prev[activeLocale], contentHtml: html } }))
  }, [activeLocale])

  const localeHasContent = (loc: Locale) => {
    const f = localeData[loc]
    return !!(f.title.trim() || f.contentHtml.trim())
  }

  const debouncedContent = useDebouncedValue(cur.contentHtml, 400)

  // Derive the detected locale from debounced content + title (no state →
  // no setState-in-effect). The pill renders when the detection disagrees with
  // the active tab AND the user hasn't dismissed the suggestion for this tab.
  const detectedLocale = useMemo<Locale | null>(() => {
    const { locale } = detectLocale(`${cur.title}\n${debouncedContent}`)
    return locale && locale !== activeLocale ? locale : null
  }, [debouncedContent, cur.title, activeLocale])

  const detectionDismissed = dismissedFor === activeLocale

  const acceptDetection = () => {
    if (!detectedLocale) return
    if (!shownLocales.includes(detectedLocale)) {
      setShownLocales(prev => LOCALES.filter(l => prev.includes(l) || l === detectedLocale))
      void addSiteLocale(siteId, detectedLocale).catch(() => {})
    }
    pickLocale(detectedLocale)
    setDismissedFor(null)
  }

  // Detection is ADVISORY ONLY. It never silently moves content between locale
  // tabs: franc-min confuses Catalan↔Spanish on short text, so an auto-switch
  // would hijack the very tab you're typing in (the "doesn't know what language
  // I'm editing" bug). The active language is whatever the user picked in the
  // language bar; `detectedLocale` only feeds the dismissible suggestion pill.

  const checks = useMemo(
    () => runSeoChecks({ title: cur.title, seoTitle: cur.seoTitle, seoDescription: cur.seoDescription, slug: cur.slug, focusKeyword, contentHtml: debouncedContent, featuredImage }),
    [cur.title, cur.seoTitle, cur.seoDescription, cur.slug, focusKeyword, debouncedContent, featuredImage],
  )
  const passed = checks.filter(c => c.pass).length
  const scorePct = checks.length ? Math.round((passed / checks.length) * 100) : 0
  const score = scoreColor(scorePct)

  const aiInsights = useMemo(
    () => runAiAnalysis({
      title: cur.title,
      description: cur.seoDescription || cur.excerpt,
      contentHtml: debouncedContent,
      featuredImage,
      categories,
      authorName,
    }),
    [cur.title, cur.seoDescription, cur.excerpt, debouncedContent, featuredImage, categories, authorName],
  )

  const handleTranslate = async () => {
    if (translating || isDefault) return
    if (!canTranslate) { setPremiumOpen(true); return }
    const src = localeData[defaultLocale]
    if (!src.title.trim() && !src.contentHtml.trim()) {
      toast(`Escriu primer el contingut en ${LOCALE_META[defaultLocale].native}`, 'error')
      return
    }
    const target = activeLocale
    if (localeHasContent(target)) {
      const ok = await confirm({
        title: `Ja hi ha contingut en ${LOCALE_META[target].native}`,
        message: 'Vols sobreescriure’l amb una traducció nova generada per IA? Es perdran els canvis manuals d’aquest idioma.',
        confirmLabel: 'Tradueix de nou',
        cancelLabel: 'Cancel·la',
      })
      if (!ok) return
    }
    setError(null)
    setTranslating(true)
    try {
      const res = await translateArticle(siteId, defaultLocale, target, {
        title: src.title,
        html: src.contentHtml,
        excerpt: src.excerpt,
        seoTitle: src.seoTitle,
        seoDescription: src.seoDescription,
      })
      if (res.error || !res.result) {
        const msg = res.error ?? 'No s\'ha pogut traduir'
        setError(msg)
        toast(msg, 'error')
        return
      }
      const r = res.result
      setLocaleData(prev => {
        const existing = prev[target]
        return {
          ...prev,
          [target]: {
            ...existing,
            title: r.title,
            contentHtml: r.html,
            excerpt: r.excerpt,
            seoTitle: r.seoTitle,
            seoDescription: r.seoDescription,
            slug: existing.slugTouched && existing.slug ? existing.slug : generateSlug(r.title),
          },
        }
      })
      setEditorNonce(n => n + 1)
      toast(`Traduït a ${LOCALE_META[target].native}`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de traducció'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setTranslating(false)
    }
  }

  const buildData = (): PostData => {
    const dl = localeData[defaultLocale]
    const i18n: Record<string, LocalizedContent> = {}
    for (const loc of LOCALES) {
      if (loc === defaultLocale) continue
      const f = localeData[loc]
      if (f.title.trim() || f.contentHtml.trim() || f.excerpt.trim()) {
        i18n[loc] = {
          title: f.title,
          slug: f.slug || undefined,
          content: { html: f.contentHtml },
          excerpt: f.excerpt || undefined,
          seo_title: f.seoTitle || undefined,
          seo_description: f.seoDescription || undefined,
        }
      }
    }
    return {
      title: dl.title,
      slug: dl.slug,
      content: { html: dl.contentHtml },
      excerpt: dl.excerpt || undefined,
      featured_image: featuredImage || undefined,
      categories,
      tags,
      seo_title: dl.seoTitle || undefined,
      seo_description: dl.seoDescription || undefined,
      seo_canonical: canonical || undefined,
      seo_noindex: noindex,
      focus_keyword: focusKeyword || undefined,
      author_name: authorName || undefined,
      is_published: isPublished,
      created_at: date ? new Date(date + 'T12:00:00').toISOString() : undefined,
      default_locale: defaultLocale,
      i18n,
    }
  }

  // Real-time save (SPA — never reload the editor).
  //   · Existing post → update IN PLACE; the user stays exactly where they are,
  //     with a transient "Desat" confirmation on the Save button. No navigation.
  //   · New post → create, then replace the URL with the article's edit route
  //     ONCE (so the next save updates instead of creating a duplicate). We don't
  //     bounce back to the site list anymore.
  const handleSave = () => {
    setError(null)
    if (!localeData[defaultLocale].title.trim()) {
      const msg = `El títol en ${LOCALE_META[defaultLocale].native} és obligatori`
      setError(msg)
      if (activeLocale !== defaultLocale) setActiveLocale(defaultLocale)
      return
    }
    startTransition(async () => {
      const data = buildData()
      if (isNew) {
        const result = await createPost(siteId, data)
        if (result.error || !result.id) { setError(result.error ?? 'No s\'ha pogut crear l\'article'); return }
        toast(`Article creat${isPublished ? ' i publicat' : ' com a esborrany'}`, 'success')
        // Promote the new-post editor into the edit route for this id, keeping the
        // user in the editor. `replace` so Back doesn't return to the empty form.
        router.replace(`/dashboard/sites/${siteId}/posts/${result.id}/edit`)
        return
      }
      const result = await updatePost(post!.id, siteId, data)
      if (result.error) { setError(result.error); return }
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2000)
      toast('Article desat', 'success')
    })
  }

  const headerTitle = localeData[defaultLocale].title
  const previewTitle = (cur.seoTitle || cur.title || 'Títol del teu article').slice(0, 60)
  const previewDesc = (cur.seoDescription || cur.excerpt || 'Afegeix una meta descripció per controlar com es mostra aquest article als resultats de cerca.').slice(0, 160)
  const previewHost = `${siteName.toLowerCase().replace(/\s+/g, '')}.carma.cat`

  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-bg flex flex-col">
      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-bg-elevated/95 backdrop-blur border-b border-border z-30">
        <div className="px-3 sm:px-5 h-14 flex items-center justify-between gap-3">
          {/* Left: back + breadcrumb */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              href={`/dashboard/sites/${siteId}`}
              aria-label="Tornar al lloc"
              className="w-9 h-9 flex items-center justify-center text-subtle hover:text-text hover:bg-surface-hover rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-1.5 text-sm text-muted min-w-0">
              <span className="truncate font-medium hidden sm:inline">{siteName}</span>
              <span className="text-subtle hidden sm:inline">/</span>
              <span className="font-semibold text-text truncate">
                {isNew ? 'Nou article' : (headerTitle || 'Editar article')}
              </span>
            </div>
          </div>

          {/* Center: LANGUAGE BAR — primary surface for multi-locale editing */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-0.5 bg-surface-subtle border border-border rounded-lg p-0.5">
              {shownLocales.map(loc => {
                const isActive = loc === activeLocale
                const filled = localeHasContent(loc)
                const pct = fieldsCompletionPct(localeData[loc])
                const removable = loc !== defaultLocale && !filled
                const dotColor = pct >= 80 ? 'bg-success' : pct > 0 ? 'bg-warning' : 'bg-border-strong'
                return (
                  <div key={loc} className="relative group/lang">
                    <button
                      type="button"
                      onClick={() => pickLocale(loc)}
                      title={`${LOCALE_META[loc].label} · ${pct}% complet${loc === defaultLocale ? ' · idioma per defecte' : ''}`}
                      className={cn(
                        'cursor-pointer flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-semibold transition-colors',
                        isActive ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
                      )}
                    >
                      <span className="text-sm leading-none">{LOCALE_META[loc].flag}</span>
                      <span className="uppercase tracking-wider">{loc}</span>
                      <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} aria-hidden />
                      {loc === defaultLocale && (
                        <span className={cn('text-[9px] font-bold', isActive ? 'text-accent' : 'text-subtle')}>·def</span>
                      )}
                    </button>
                    {removable && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeLanguage(loc) }}
                        title={`Treure ${LOCALE_META[loc].native}`}
                        aria-label={`Treure ${LOCALE_META[loc].native}`}
                        className="cursor-pointer absolute -top-1 -right-1 w-4 h-4 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-subtle hover:text-danger hover:border-danger/40 opacity-0 group-hover/lang:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                )
              })}

              {availableToAdd.length > 0 && (
                <div ref={addLangRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAddLangOpen(o => !o)}
                    aria-label="Afegir idioma"
                    title="Afegir idioma"
                    className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-md text-subtle hover:text-text hover:bg-surface-hover transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {addLangOpen && (
                    <div role="menu" className="absolute top-full right-0 mt-1.5 z-40 bg-bg-elevated border border-border rounded-xl shadow-pop overflow-hidden w-44">
                      <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-subtle">Afegir idioma</p>
                      {availableToAdd.map(loc => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => addLanguage(loc)}
                          className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-hover transition-colors text-left"
                        >
                          <span className="text-base leading-none">{LOCALE_META[loc].flag}</span>
                          <span className="flex-1 font-medium text-text">{LOCALE_META[loc].native}</span>
                          <Plus className="w-3 h-3 text-subtle" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AI Translate — only on non-default locales */}
            {!isDefault && (
              <button
                type="button"
                onClick={() => { void handleTranslate() }}
                disabled={translating}
                title={canTranslate ? `Traduir de ${LOCALE_META[defaultLocale].native} amb IA` : 'Funció Premium'}
                className={cn(
                  'cursor-pointer hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60',
                  canTranslate
                    ? 'text-accent bg-accent-soft hover:opacity-90'
                    : 'text-warning bg-warning-soft hover:opacity-90',
                )}
              >
                {translating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : canTranslate ? <Sparkles className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
                {translating ? 'Traduint…' : 'Traduir'}
              </button>
            )}
          </div>

          {/* Right: state pill + preview + drawer toggle + save */}
          <div className="flex items-center gap-1.5 shrink-0 flex-1 justify-end">
            <span className={cn(
              'hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold',
              isPublished ? 'bg-success-soft text-success' : 'bg-surface-hover text-muted',
            )}>
              {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {isPublished ? 'Publicat' : 'Esborrany'}
            </span>

            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                const localizedSlug = cur.slug?.trim()
                const fallbackSlug = localeData[defaultLocale]?.slug?.trim() || ''
                const slug = localizedSlug || fallbackSlug
                const path = isNew || !slug ? `/render/${siteId}` : `/render/${siteId}/${slug}`
                const needsLang = !localizedSlug && activeLocale !== defaultLocale
                const qs = `v=${Date.now()}${needsLang ? `&lang=${activeLocale}` : ''}${isNew && activeLocale !== defaultLocale ? `&lang=${activeLocale}` : ''}`
                window.open(`${path}?${qs}`, '_blank', 'noopener,noreferrer')
              }}
              title={`Veure en ${LOCALE_META[activeLocale].native}`}
              className="cursor-pointer flex items-center gap-1.5 h-8 px-2.5 text-xs font-semibold text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Veure</span>
            </a>

            <button
              type="button"
              onClick={() => setDrawerOpen(o => !o)}
              aria-pressed={drawerOpen}
              title={drawerOpen ? 'Amagar panell' : 'Mostrar panell'}
              className={cn(
                'cursor-pointer flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                drawerOpen ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text hover:bg-surface-hover',
              )}
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !localeData[defaultLocale].title.trim()}
              className={cn(
                'cursor-pointer flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                savedFlash && !isPending
                  ? 'bg-success text-on-accent'
                  : 'bg-accent hover:bg-accent-hover text-on-accent',
              )}
            >
              {isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : savedFlash
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <Save className="w-3.5 h-3.5" />}
              {isPending ? 'Desant…' : savedFlash ? 'Desat' : 'Desar'}
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN AREA ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas — scrolls independently */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[800px] mx-auto px-5 sm:px-10 py-10">
            {error && (
              <div className="mb-6 p-3 text-sm rounded-xl bg-danger-soft border border-danger/20 text-danger font-medium">
                {error}
              </div>
            )}

            {/* Title — borderless, oversized, prosey */}
            <input
              type="text"
              value={cur.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Títol de l'article"
              className="w-full px-0 py-2 bg-transparent border-0 focus:outline-none text-4xl sm:text-5xl font-bold tracking-tight text-text placeholder:text-subtle"
              style={{ lineHeight: 1.1 }}
            />

            {/* Slug — minimal monospace hint under the title; pen icon to manually edit */}
            {cur.title.trim() && (
              <div className="mt-3 flex items-center gap-2 text-xs text-subtle">
                <Globe className="w-3 h-3 shrink-0" />
                <span className="font-mono truncate">{previewHost}/<span className="text-muted">{cur.slug || 'article'}</span></span>
                <input
                  type="text"
                  value={cur.slug}
                  onChange={e => patchLocale(activeLocale, { slugTouched: true, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') })}
                  className="sr-only"
                  aria-label="Slug de l'article"
                />
                {cur.slugTouched && (
                  <button
                    type="button"
                    onClick={regenerateSlug}
                    title="Regenerar des del títol"
                    className="cursor-pointer text-subtle hover:text-accent transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Language detection pill — suggests the locale the IA thinks the text
                is in, when it differs from the one currently being edited. */}
            {detectedLocale && !detectionDismissed && (
              <div className="mt-4 inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-full bg-info-soft border border-info/20 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                <Languages className="w-3.5 h-3.5 text-info shrink-0" />
                <span className="text-text">
                  Detectat: <span className="font-semibold">{LOCALE_META[detectedLocale].native}</span>
                  <span className="text-subtle ml-1">· ara estàs editant en {LOCALE_META[activeLocale].native}</span>
                </span>
                <button
                  type="button"
                  onClick={acceptDetection}
                  className="cursor-pointer ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-info text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Canviar a {LOCALE_META[detectedLocale].flag} {detectedLocale.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedFor(activeLocale)}
                  aria-label="Tancar"
                  className="cursor-pointer inline-flex items-center justify-center w-5 h-5 rounded-full text-subtle hover:text-text hover:bg-bg-elevated transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Editor — full-bleed, no border. Margin to clear the slug strip. */}
            <div className="mt-8">
              <ErrorBoundary label="L'editor ha tingut un error">
                <Suspense fallback={
                  <div className="space-y-3">
                    <div className="h-5 w-2/3 bg-surface-hover rounded animate-pulse" />
                    <div className="h-5 w-1/2 bg-surface-hover rounded animate-pulse" />
                    <div className="h-5 w-5/6 bg-surface-hover rounded animate-pulse" />
                  </div>
                }>
                  <TipTapEditor
                    key={`${activeLocale}-${editorNonce}`}
                    initialHtml={cur.contentHtml}
                    onChange={handleContentChange}
                    placeholder="Comença a escriure, o prem '/' per inserir blocs…"
                    siteId={siteId}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </main>

        {/* ── DRAWER ────────────────────────────────────────────────────── */}
        {drawerOpen && (
          <aside className="hidden lg:flex w-[360px] shrink-0 border-l border-border bg-bg-elevated flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer tabs — animated segmented control */}
            <div className="shrink-0 border-b border-border px-3 py-2">
              <SegmentedTabs
                aria-label="Panells de l'editor"
                size="sm"
                fluid
                value={drawerTab}
                onChange={setDrawerTab}
                segments={[
                  { key: 'settings', label: 'Ajustos', icon: <Settings2 className="w-3.5 h-3.5" /> },
                  { key: 'seo', label: 'SEO', icon: <Search className="w-3.5 h-3.5" /> },
                  { key: 'ai', label: 'IA', icon: <Bot className="w-3.5 h-3.5" /> },
                ]}
              />
            </div>

            {/* Drawer content — scrolls */}
            <div className="flex-1 overflow-y-auto px-4 py-5">
              {drawerTab === 'settings' && (
                <SettingsPanel
                  siteId={siteId}
                  isPublished={isPublished} setIsPublished={setIsPublished}
                  date={date} setDate={setDate}
                  authorName={authorName} setAuthorName={setAuthorName}
                  categories={categories} setCategories={setCategories}
                  tags={tags} setTags={setTags}
                  cur={cur} patchLocale={patchLocale} activeLocale={activeLocale}
                  featuredImage={featuredImage} setFeaturedImage={setFeaturedImage}
                />
              )}

              {drawerTab === 'seo' && (
                <SeoPanel
                  cur={cur} patchLocale={patchLocale} activeLocale={activeLocale}
                  focusKeyword={focusKeyword} setFocusKeyword={setFocusKeyword}
                  canonical={canonical} setCanonical={setCanonical}
                  noindex={noindex} setNoindex={setNoindex}
                  featuredImage={featuredImage}
                  previewTitle={previewTitle} previewDesc={previewDesc} previewHost={previewHost}
                  scorePct={scorePct} score={score} checks={checks} passed={passed}
                />
              )}

              {drawerTab === 'ai' && (
                <AiPanel
                  cur={cur}
                  activeLocale={activeLocale}
                  insights={aiInsights}
                  llmsExcerpt={buildLlmsExcerpt({
                    title: cur.title,
                    description: cur.seoDescription || cur.excerpt,
                    contentHtml: cur.contentHtml,
                    siteName,
                    locale: activeLocale,
                    categories,
                  })}
                  canTranslate={canTranslate}
                  analysis={writingAnalysis}
                  loading={writingLoading}
                  error={writingError}
                  onRun={() => { void runWritingCoach() }}
                  onApply={applyWritingSuggestion}
                  canGenerate={canGenerate}
                  generating={generatingArticle}
                  generateError={generateError}
                  onGenerate={() => { void handleGenerateArticle() }}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Premium upsell */}
      <Modal open={premiumOpen} onClose={() => setPremiumOpen(false)} size="lg">
        <PremiumPanel
          feature="Traducció automàtica amb IA"
          description="Tradueix els teus articles a tots els idiomes amb un sol clic. La IA conserva el format, els blocs i l'SEO — només has de revisar i publicar."
          perks={[
            'Traducció instantània EN · ES · CA i més',
            'Manté el format, els blocs i els enllaços',
            'Tradueix també títol, extracte i metadades SEO',
            'Idiomes il·limitats per article',
          ]}
        />
      </Modal>

      {/* Magic SEO Article upsell */}
      <Modal open={generatePremiumOpen} onClose={() => setGeneratePremiumOpen(false)} size="lg">
        <PremiumPanel
          feature="Article SEO màgic amb IA"
          description="La IA analitza el teu web, dedueix el teu nínxol i la teva competència, i escriu un article complet i optimitzat per a SEO, llest per publicar."
          perks={[
            'Analitza el teu web i el teu sector automàticament',
            'Article complet de 700–1100 paraules, optimitzat per SEO',
            'Títol, metadades, paraula clau, categories i etiquetes',
            "S'escriu directament a l'editor en l'idioma actiu",
          ]}
        />
      </Modal>
    </div>
  )
}

// ── Settings panel ──────────────────────────────────────────────────────────

function SettingsPanel({
  siteId,
  isPublished, setIsPublished, date, setDate, authorName, setAuthorName,
  categories, setCategories, tags, setTags,
  cur, patchLocale, activeLocale,
  featuredImage, setFeaturedImage,
}: {
  siteId: string
  isPublished: boolean; setIsPublished: (v: boolean) => void
  date: string; setDate: (v: string) => void
  authorName: string; setAuthorName: (v: string) => void
  categories: string[]; setCategories: (v: string[]) => void
  tags: string[]; setTags: (v: string[]) => void
  cur: LocaleFields; patchLocale: (l: Locale, p: Partial<LocaleFields>) => void; activeLocale: Locale
  featuredImage: string; setFeaturedImage: (v: string) => void
}) {
  const { toast } = useToast()
  const [uploadingFeatured, setUploadingFeatured] = useState(false)
  const featuredFileRef = useRef<HTMLInputElement>(null)
  const uploadFeatured = async (file: File | undefined) => {
    if (!file) return
    setUploadingFeatured(true)
    try {
      const url = await uploadImage(file, siteId)
      setFeaturedImage(url)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No s’ha pogut pujar la imatge', 'error')
    } finally {
      setUploadingFeatured(false)
    }
  }
  return (
    <div className="space-y-5">
      <PanelSection title="Publicació" kind="shared">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsPublished(false)}
            className={cn(
              'cursor-pointer flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-semibold transition-all',
              !isPublished ? 'bg-text text-bg-elevated border-text' : 'bg-surface-subtle text-muted border-border hover:border-border-strong',
            )}
          >
            <EyeOff className="w-3.5 h-3.5" /> Esborrany
          </button>
          <button
            type="button"
            onClick={() => setIsPublished(true)}
            className={cn(
              'cursor-pointer flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-semibold transition-all',
              isPublished ? 'bg-success text-white border-success' : 'bg-surface-subtle text-muted border-border hover:border-border-strong',
            )}
          >
            <Eye className="w-3.5 h-3.5" /> Publicat
          </button>
        </div>
      </PanelSection>

      <PanelSection title="Data" icon={CalendarDays} kind="shared">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent text-text"
        />
      </PanelSection>

      <PanelSection title="Autor" icon={User} kind="shared">
        <input
          type="text"
          value={authorName}
          onChange={e => setAuthorName(e.target.value)}
          placeholder="Nom de l'autor"
          className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors"
        />
      </PanelSection>

      <PanelSection title="Categories i etiquetes" icon={Tag} kind="shared">
        <div className="space-y-2.5">
          <TagInput label="Categories" values={categories} onChange={setCategories} placeholder="Afegeix una categoria…" />
          <TagInput label="Etiquetes" values={tags} onChange={setTags} placeholder="Afegeix una etiqueta…" />
        </div>
      </PanelSection>

      <PanelSection title="Extracte" icon={FileText} kind="localized">
        <textarea
          value={cur.excerpt}
          onChange={e => patchLocale(activeLocale, { excerpt: e.target.value })}
          rows={3}
          placeholder="Breu descripció de l'article…"
          className="w-full px-2.5 py-2 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors resize-none"
        />
      </PanelSection>

      <PanelSection title="Imatge destacada" icon={ImageIcon} kind="shared">
        {featuredImage ? (
          <div className="relative rounded-lg overflow-hidden aspect-video bg-surface-hover group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={featuredImage} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => setFeaturedImage('')}
              title="Treure imatge"
              className="cursor-pointer absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center aspect-video rounded-lg border border-dashed border-border-strong bg-surface-subtle text-subtle">
            <ImageIcon className="w-6 h-6" />
            <span className="text-xs font-medium mt-1">Cap imatge</span>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            type="url"
            value={featuredImage}
            onChange={e => setFeaturedImage(e.target.value)}
            placeholder="Enganxa una URL o puja…"
            className="flex-1 min-w-0 h-9 px-2.5 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors"
          />
          <button
            type="button"
            onClick={() => featuredFileRef.current?.click()}
            disabled={uploadingFeatured}
            title="Pujar imatge"
            className="cursor-pointer shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface-subtle text-muted hover:text-text hover:border-border-strong transition-colors disabled:opacity-60"
          >
            {uploadingFeatured ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          </button>
          <input
            ref={featuredFileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={e => { void uploadFeatured(e.target.files?.[0]); e.target.value = '' }}
          />
        </div>
      </PanelSection>
    </div>
  )
}

// ── SEO panel ───────────────────────────────────────────────────────────────

function SeoPanel({
  cur, patchLocale, activeLocale,
  focusKeyword, setFocusKeyword, canonical, setCanonical, noindex, setNoindex,
  featuredImage, previewTitle, previewDesc, previewHost,
  scorePct, score, checks, passed,
}: {
  cur: LocaleFields; patchLocale: (l: Locale, p: Partial<LocaleFields>) => void; activeLocale: Locale
  focusKeyword: string; setFocusKeyword: (v: string) => void
  canonical: string; setCanonical: (v: string) => void
  noindex: boolean; setNoindex: (v: boolean) => void
  featuredImage: string
  previewTitle: string; previewDesc: string; previewHost: string
  scorePct: number; score: { text: string; bg: string; ring: string; label: string }
  checks: SeoCheck[]; passed: number
}) {
  return (
    <div className="space-y-5">
      {/* Score + Google preview */}
      <div className="bg-surface-subtle border border-border rounded-xl p-4 space-y-3.5">
        <div className="flex items-center gap-3">
          <ScoreRing pct={scorePct} ring={score.ring} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Puntuació · {LOCALE_META[activeLocale].native}</p>
            <p className={cn('text-sm font-semibold', score.text)}>{score.label} · {passed}/{checks.length}</p>
          </div>
        </div>

        <div className="rounded-lg bg-bg-elevated border border-border p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-full bg-surface-hover flex items-center justify-center shrink-0">
              <Globe className="w-2.5 h-2.5 text-subtle" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text font-medium leading-tight truncate">{previewHost}</p>
            </div>
          </div>
          <p className="text-[#1a0dab] text-[16px] leading-snug font-medium truncate">{previewTitle}</p>
          <p className="text-[12px] text-muted leading-snug line-clamp-2 mt-0.5">{previewDesc}</p>
        </div>
      </div>

      <PanelSection title="Paraula clau objectiu" icon={Target} kind="shared">
        <input
          type="text"
          value={focusKeyword}
          onChange={e => setFocusKeyword(e.target.value)}
          placeholder="ex. marketing digital"
          className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors"
        />
      </PanelSection>

      <PanelSection title="Metadades de cerca" kind="localized">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-subtle mb-1">Meta títol</label>
            <input
              type="text"
              value={cur.seoTitle}
              onChange={e => patchLocale(activeLocale, { seoTitle: e.target.value })}
              placeholder={cur.title || 'Títol per a cercadors'}
              className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors"
            />
            <p className={cn('text-xs mt-1 font-semibold', counterTone((cur.seoTitle || cur.title).length, 30, 60))}>
              {(cur.seoTitle || cur.title).length} / 60
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-subtle mb-1">Meta descripció</label>
            <textarea
              value={cur.seoDescription}
              onChange={e => patchLocale(activeLocale, { seoDescription: e.target.value })}
              rows={3}
              placeholder={cur.excerpt || 'Descripció per a cercadors'}
              className="w-full px-2.5 py-2 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors resize-none"
            />
            <p className={cn('text-xs mt-1 font-semibold', counterTone(cur.seoDescription.length, 120, 160))}>
              {cur.seoDescription.length} / 160
            </p>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Vista prèvia social">
        <div className="rounded-lg border border-border overflow-hidden bg-bg-elevated">
          {featuredImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featuredImage} alt="" className="w-full aspect-[1.91/1] object-cover bg-surface-hover" />
          ) : (
            <div className="aspect-[1.91/1] bg-surface-hover flex items-center justify-center text-subtle">
              <ImageIcon className="w-6 h-6" />
            </div>
          )}
          <div className="p-3 bg-surface-subtle">
            <p className="text-xs uppercase text-subtle tracking-wide truncate">{previewHost}</p>
            <p className="text-xs font-semibold text-text truncate mt-0.5">{previewTitle}</p>
            <p className="text-xs text-muted line-clamp-2 mt-0.5">{previewDesc}</p>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Avançat" kind="shared">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-subtle mb-1">URL canònica</label>
            <input
              type="url"
              value={canonical}
              onChange={e => setCanonical(e.target.value)}
              placeholder="https://…"
              className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg text-xs focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors"
            />
          </div>
          <ToggleRow
            label="No indexar (noindex)"
            hint="Amaga l'article dels cercadors"
            checked={noindex}
            onChange={setNoindex}
            tone={noindex ? 'danger' : 'default'}
          />
        </div>
      </PanelSection>

      <PanelSection title="Anàlisi">
        <ul className="space-y-1.5">
          {checks.map(c => (
            <li key={c.label} className="flex items-start gap-2">
              {c.pass
                ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-px" />
                : <AlertCircle className="w-3.5 h-3.5 text-subtle shrink-0 mt-px" />}
              <span className={cn('text-xs font-medium leading-snug', c.pass ? 'text-text' : 'text-subtle')}>{c.label}</span>
            </li>
          ))}
        </ul>
      </PanelSection>
    </div>
  )
}

// ── AI chatbot panel ────────────────────────────────────────────────────────

function AiPanel({
  cur, activeLocale, insights, llmsExcerpt,
  canTranslate, analysis, loading, error, onRun, onApply,
  canGenerate, generating, generateError, onGenerate,
}: {
  cur: LocaleFields
  activeLocale: Locale
  insights: AiInsight[]
  llmsExcerpt: string
  canTranslate: boolean
  analysis: WritingAnalysis | null
  loading: boolean
  error: string | null
  onRun: () => void
  onApply: (before: string, after: string) => void
  canGenerate: boolean
  generating: boolean
  generateError: string | null
  onGenerate: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(llmsExcerpt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const goodCount = insights.filter(i => i.kind === 'good').length

  return (
    <div className="space-y-6">
      {/* ── MAGIC SEO ARTICLE ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl p-4 space-y-3 bg-gradient-to-br from-accent to-accent-hover text-on-accent shadow-pop">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-on-accent/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Article SEO màgic</p>
            <p className="text-xs opacity-90">Generat per IA · {LOCALE_META[activeLocale].native}</p>
          </div>
          {!canGenerate && <Crown className="w-3.5 h-3.5 shrink-0" />}
        </div>
        <p className="text-xs opacity-90 leading-relaxed">
          La IA analitza el teu web, dedueix el teu nínxol i escriu un article complet i optimitzat, llest per publicar.
        </p>
        {generateError && (
          <div className="p-2.5 rounded-lg bg-on-accent/15 text-xs font-medium">{generateError}</div>
        )}
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="cursor-pointer w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-on-accent text-accent text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generant l’article…</>
            : <><Sparkles className="w-4 h-4" /> Genera un article SEO</>}
        </button>
        {generating && (
          <p className="text-xs opacity-90 leading-snug text-center">
            Pot trigar fins a un minut. No tanquis l’editor.
          </p>
        )}
      </div>

      {/* ── WRITING COACH ─────────────────────────────────────────────── */}
      <div className="bg-accent-soft border border-accent/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent text-on-accent flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Coach de redacció</p>
            <p className="text-xs text-muted">Suggeriments en {LOCALE_META[activeLocale].native}</p>
          </div>
          {!canTranslate && <Crown className="w-3.5 h-3.5 text-warning shrink-0" />}
        </div>

        {!analysis && !loading && !error && (
          <p className="text-xs text-muted leading-relaxed">
            La IA llegeix el teu article i et proposa reescriptures concretes per a millorar la claredat, la longitud i el to.
          </p>
        )}

        {error && (
          <div className="p-2.5 rounded-lg bg-danger-soft border border-danger/20 text-danger text-xs font-medium">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className={cn(
            'cursor-pointer w-full flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
            canTranslate ? 'bg-accent text-on-accent hover:bg-accent-hover' : 'bg-warning-soft text-warning hover:opacity-90 border border-warning/30',
          )}
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analitzant…</>
            : canTranslate
              ? <><Sparkles className="w-3.5 h-3.5" /> {analysis ? 'Tornar a analitzar' : 'Analitzar amb el coach'}</>
              : <><Crown className="w-3.5 h-3.5" /> Funció Premium</>}
        </button>
      </div>

      {analysis && (
        <>
          <PanelSection title="Llegibilitat">
            <div className="flex items-center gap-3">
              <ScoreRing pct={analysis.readabilityScore} ring={analysis.readabilityScore >= 70 ? 'text-success' : analysis.readabilityScore >= 50 ? 'text-warning' : 'text-danger'} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{analysis.readabilityLabel}</p>
                <p className="text-xs text-muted leading-snug">{analysis.summary}</p>
              </div>
            </div>
          </PanelSection>

          <PanelSection title={`Suggeriments (${analysis.suggestions.length})`}>
            {analysis.suggestions.length === 0 ? (
              <p className="text-xs text-muted">L&apos;article ja està prou ben escrit — cap canvi recomanat.</p>
            ) : (
              <ul className="space-y-3">
                {analysis.suggestions.map((s, i) => (
                  <li key={i} className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SeverityChip severity={s.severity} />
                      <CategoryChip category={s.category} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-subtle line-through line-clamp-3 leading-snug">{s.before}</p>
                      <p className="text-xs text-text font-medium leading-snug">{s.after}</p>
                    </div>
                    {s.why && <p className="text-xs text-muted italic leading-snug">{s.why}</p>}
                    <button
                      type="button"
                      onClick={() => onApply(s.before, s.after)}
                      className="cursor-pointer w-full flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-semibold text-accent hover:bg-accent-soft transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Aplicar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>
        </>
      )}

      {/* ── AI-CHATBOT VISIBILITY ────────────────────────────────────── */}
      <div className="bg-bg-elevated border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-surface-subtle text-muted flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">Visibilitat als chatbots</p>
            <p className="text-xs text-muted">ChatGPT · Perplexity · Claude · Copilot</p>
          </div>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Aquests senyals fan que el teu article aparegui i sigui citat correctament.
          <span className="text-success font-semibold"> {goodCount}/{insights.length}</span> a punt.
        </p>
      </div>

      <PanelSection title="Senyals detectats">
        <ul className="space-y-2">
          {insights.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              {it.kind === 'good'
                ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-px" />
                : <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-px" />}
              <div className="min-w-0">
                <p className="text-xs font-medium leading-snug text-text">{it.label}</p>
                {it.hint && <p className="text-xs text-subtle mt-0.5 leading-snug">{it.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection title="Esquemes que emetrem">
        <div className="space-y-1.5 text-xs text-muted">
          <Badge label="schema.org/Article" detail="Titular, descripció, imatge, autor, data, idioma" ok />
          <Badge label="schema.org/BreadcrumbList" detail="Listing → article (navegació)" ok />
          <Badge label="schema.org/FAQPage" detail="Auto-detectat si tens H2/H3 que acaben en «?»" ok={cur.contentHtml.includes('?')} />
        </div>
      </PanelSection>

      <PanelSection title="Vista prèvia per a chatbots">
        <div className="rounded-lg border border-border bg-surface-subtle p-3 max-h-48 overflow-y-auto">
          <pre className="text-xs text-muted leading-snug whitespace-pre-wrap font-mono">{llmsExcerpt}</pre>
        </div>
        <button
          type="button"
          onClick={copy}
          className="cursor-pointer mt-2 w-full flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border text-xs font-semibold text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <FileText className="w-3.5 h-3.5" />}
          {copied ? 'Copiat' : 'Copiar resum estil llms.txt'}
        </button>
        <p className="text-xs text-subtle mt-1.5 leading-snug">
          Un resum compacte com el que els crawlers d&apos;IA esperen. Útil per a llms.txt o per testar prompts.
        </p>
      </PanelSection>
    </div>
  )
}

function SeverityChip({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const styles = severity === 'high'
    ? 'bg-danger-soft text-danger'
    : severity === 'medium'
      ? 'bg-warning-soft text-warning'
      : 'bg-surface-hover text-muted'
  const label = severity === 'high' ? 'Important' : severity === 'medium' ? 'Mig' : 'Lleu'
  return <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider', styles)}>{label}</span>
}

function CategoryChip({ category }: { category: 'clarity' | 'length' | 'jargon' | 'flow' | 'tone' }) {
  const map: Record<typeof category, string> = {
    clarity: 'Claredat', length: 'Longitud', jargon: 'Argot', flow: 'Flux', tone: 'To',
  }
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-surface-subtle text-subtle border border-border">{map[category]}</span>
}

function Badge({ label, detail, ok }: { label: string; detail: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0 mt-1.5',
        ok ? 'bg-success' : 'bg-border-strong',
      )} />
      <div className="min-w-0">
        <p className="text-xs font-semibold font-mono text-text">{label}</p>
        <p className="text-xs text-subtle leading-snug">{detail}</p>
      </div>
    </div>
  )
}

// ── Shared primitives ───────────────────────────────────────────────────────

function PanelSection({
  title, icon: Icon, kind, children,
}: {
  title: string
  icon?: typeof Settings2
  kind?: 'localized' | 'shared'
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="w-3 h-3 text-subtle" />}
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle truncate">{title}</p>
        </div>
        {kind && (
          <span className={cn(
            'text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
            kind === 'localized' ? 'bg-accent-soft text-accent' : 'bg-surface-hover text-muted',
          )}>
            {kind === 'localized' ? 'Per idioma' : 'Compartit'}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function ToggleRow({ label, hint, checked, onChange, tone }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; tone?: 'danger' | 'default' }) {
  return (
    <div className="flex items-start justify-between gap-3 px-2.5 py-2 bg-surface-subtle border border-border rounded-lg">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-text">{label}</p>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'cursor-pointer relative w-10 h-5 rounded-full transition-colors shrink-0',
          checked ? (tone === 'danger' ? 'bg-danger' : 'bg-accent') : 'bg-border-strong',
        )}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}

function TagInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('')
  const add = () => {
    const t = input.trim()
    if (t && !values.includes(t)) onChange([...values, t])
    setInput('')
  }
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold uppercase tracking-wider text-subtle">{label}</label>
      <div className="flex flex-wrap gap-1.5 p-1.5 border border-border rounded-lg bg-surface-subtle min-h-9 focus-within:border-accent focus-within:bg-surface transition-colors">
        {values.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-soft text-accent rounded text-xs font-semibold">
            {t}
            <button type="button" onClick={() => onChange(values.filter(x => x !== t))} className="cursor-pointer hover:text-danger transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
            if (e.key === 'Backspace' && !input && values.length > 0) onChange(values.slice(0, -1))
          }}
          onBlur={add}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent text-xs font-medium outline-none placeholder:text-subtle"
        />
      </div>
    </div>
  )
}

function ScoreRing({ pct, ring }: { pct: number; ring: string }) {
  const r = 16
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="relative w-10 h-10 shrink-0">
      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" className="text-surface-hover" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          className={ring} stroke="currentColor"
          strokeDasharray={circ} strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text">{pct}</span>
    </div>
  )
}
