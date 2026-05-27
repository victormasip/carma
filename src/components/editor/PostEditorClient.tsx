'use client'

import { useState, useCallback, useMemo, useTransition, useEffect, useRef, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Eye, EyeOff, Loader2, Tag, X, ImageIcon,
  User, FileText, Globe, CalendarDays, Settings2, Search, Target,
  CheckCircle2, AlertCircle, ExternalLink, Languages, Sparkles, Plus, Crown,
} from 'lucide-react'
import { createPost, updatePost, translateArticle, type PostData, type LocalizedContent } from '@/lib/actions/posts'
import { addSiteLocale } from '@/lib/actions/locales'
import { LOCALES, DEFAULT_LOCALE, LOCALE_META, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { useToast } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { PremiumPanel, LockBadge } from '@/app/dashboard/sites/[id]/PremiumGate'
import Link from 'next/link'

// Code-split the heavy rich-text editor (TipTap + ProseMirror + extensions) so
// it doesn't bloat the initial bundle; it loads on demand with a skeleton.
const TipTapEditor = lazy(() => import('./TipTapEditor'))

// Debounce a fast-changing value so expensive derived work (SEO analysis,
// Google preview) only recomputes when typing pauses — not on every keystroke.
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

type SidebarTab = 'settings' | 'seo'

// Per-locale, localizable fields. Everything else (cover image, taxonomy,
// publish state, author, dates, canonical) is shared across all languages.
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
      if (loc === defaultLocale) continue // default lives in the flat columns
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

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (vals: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const trimmed = input.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInput('')
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">{label}</label>
      <div className="flex flex-wrap gap-1.5 p-2 border border-neutral-200 rounded-xl bg-neutral-50/50 min-h-[44px] focus-within:border-carma-400 focus-within:bg-white transition-colors">
        {values.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-carma-100 text-carma-700 rounded-lg text-xs font-semibold">
            {tag}
            <button type="button" onClick={() => onChange(values.filter(t => t !== tag))} className="cursor-pointer hover:text-red-600 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
            if (e.key === 'Backspace' && !input && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={addTag}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-xs font-medium outline-none placeholder:text-neutral-400"
        />
      </div>
    </div>
  )
}

// ── SEO scoring (RankMath-style) ──────────────────────────────────────────────
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
  if (pct >= 80) return { text: 'text-green-700', bg: 'bg-green-500', ring: 'text-green-500', label: 'Bo' }
  if (pct >= 50) return { text: 'text-amber-700', bg: 'bg-amber-500', ring: 'text-amber-500', label: 'Millorable' }
  return { text: 'text-red-700', bg: 'bg-red-500', ring: 'text-red-500', label: 'Fluix' }
}

function counterTone(len: number, min: number, max: number): string {
  if (len === 0) return 'text-neutral-400'
  if (len > max) return 'text-red-500'
  if (len < min) return 'text-amber-500'
  return 'text-green-600'
}

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

  // ── Per-locale text state ──
  const [localeData, setLocaleData] = useState<Record<Locale, LocaleFields>>(() => initLocaleData(post, defaultLocale))
  const [activeLocale, setActiveLocale] = useState<Locale>(defaultLocale)

  // The language tabs shown — seeded from the site's configured locales + any
  // the article already has content in. NOT hardcoded; extend it with the "+".
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
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const [premiumOpen, setPremiumOpen] = useState(false)

  // Bumped to force-remount the TipTap editor when content is replaced
  // programmatically (e.g. after auto-translation) so it picks up the new HTML.
  const [editorNonce, setEditorNonce] = useState(0)
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    if (!addMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [addMenuOpen])

  const availableToAdd = LOCALES.filter(l => !shownLocales.includes(l))

  const addLanguage = (loc: Locale) => {
    setShownLocales(prev => LOCALES.filter(l => prev.includes(l) || l === loc))
    setActiveLocale(loc)
    setAddMenuOpen(false)
    // Persist to the site's supported languages (best-effort; tab works regardless).
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

  // ── Shared (non-localized) state ──
  const [featuredImage, setFeaturedImage] = useState(post?.featured_image ?? '')
  const [categories, setCategories] = useState<string[]>(post?.categories ?? [])
  const [tags, setTags] = useState<string[]>(post?.tags ?? [])
  const [focusKeyword, setFocusKeyword] = useState(post?.meta?.focus_keyword ?? '')
  const [canonical, setCanonical] = useState(post?.meta?.canonical ?? '')
  const [noindex, setNoindex] = useState(post?.meta?.noindex ?? false)
  const [authorName, setAuthorName] = useState(post?.author_name ?? '')
  const [isPublished, setIsPublished] = useState(post?.is_published ?? false)
  const [date, setDate] = useState(post?.created_at ? post.created_at.slice(0, 10) : '')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('settings')
  const [error, setError] = useState<string | null>(null)

  const handleTitleChange = (val: string) => {
    patchLocale(activeLocale, { title: val, ...(cur.slugTouched ? {} : { slug: generateSlug(val) }) })
  }

  const handleContentChange = useCallback((html: string) => {
    setLocaleData(prev => ({ ...prev, [activeLocale]: { ...prev[activeLocale], contentHtml: html } }))
  }, [activeLocale])

  const localeHasContent = (loc: Locale) => {
    const f = localeData[loc]
    return !!(f.title.trim() || f.contentHtml.trim())
  }

  // SEO analysis reads a debounced copy of the active locale's content so it
  // doesn't recompute (regex over the whole document) on every keystroke. Saving
  // still uses the live content, so nothing is lost.
  const debouncedContent = useDebouncedValue(cur.contentHtml, 400)
  const checks = useMemo(
    () => runSeoChecks({ title: cur.title, seoTitle: cur.seoTitle, seoDescription: cur.seoDescription, slug: cur.slug, focusKeyword, contentHtml: debouncedContent, featuredImage }),
    [cur.title, cur.seoTitle, cur.seoDescription, cur.slug, focusKeyword, debouncedContent, featuredImage],
  )
  const passed = checks.filter(c => c.pass).length
  const scorePct = checks.length ? Math.round((passed / checks.length) * 100) : 0
  const score = scoreColor(scorePct)

  const handleTranslate = async () => {
    if (translating || isDefault) return
    // Freemium gate: AI translation is a Premium feature. Free users get the
    // upgrade modal instead of an LLM call.
    if (!canTranslate) { setPremiumOpen(true); return }
    const src = localeData[defaultLocale]
    if (!src.title.trim() && !src.contentHtml.trim()) {
      toast(`Escriu primer el contingut en ${LOCALE_META[defaultLocale].native}`, 'error')
      return
    }
    const target = activeLocale
    // Already translated → confirm before overwriting (don't blindly re-run).
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
      // Always clear the spinner — even on a hang/timeout/rejection.
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
      let result: { error?: string; id?: string }

      if (isNew) {
        result = await createPost(siteId, data)
      } else {
        result = await updatePost(post.id, siteId, data)
      }

      if (result.error) {
        setError(result.error)
        return
      }

      toast(isNew ? `Article creat${isPublished ? ' i publicat' : ' com a esborrany'}` : 'Article desat correctament', 'success')
      router.push(`/dashboard/sites/${siteId}`)
    })
  }

  const fieldClass = "w-full px-4 py-3 bg-neutral-50/50 border border-neutral-200/80 rounded-xl focus:outline-none focus:border-carma-400 focus:bg-white text-sm font-medium transition-all"
  const labelClass = "block text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1 mb-1.5"

  const SIDEBAR_TABS: { key: SidebarTab; label: string; icon: typeof Settings2 }[] = [
    { key: 'settings', label: 'Ajustos', icon: Settings2 },
    { key: 'seo', label: 'SEO', icon: Search },
  ]

  const headerTitle = localeData[defaultLocale].title
  const previewTitle = (cur.seoTitle || cur.title || 'Títol del teu article').slice(0, 60)
  const previewDesc = (cur.seoDescription || cur.excerpt || 'Afegeix una meta descripció per controlar com es mostra aquest article als resultats de cerca de Google.').slice(0, 160)
  const previewUrl = `${siteName.toLowerCase().replace(/\s+/g, '')}.carma.cat › ${cur.slug || 'article'}`

  return (
    <div className="fixed inset-0 z-20 overflow-auto bg-[#F9F8F6]">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/dashboard/sites/${siteId}`}
              className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-1.5 text-sm text-neutral-500 min-w-0">
              <span className="truncate font-medium hidden sm:inline">{siteName}</span>
              <span className="text-neutral-300 hidden sm:inline">/</span>
              <span className="font-semibold text-neutral-900 truncate">
                {isNew ? 'Nou article' : (headerTitle || 'Editar article')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${isPublished ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
              {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {isPublished ? 'Publicat' : 'Esborrany'}
            </span>

            <a
              href={isNew ? `/render/${siteId}?lang=${activeLocale}` : `/render/${siteId}/${cur.slug || localeData[defaultLocale].slug}?lang=${activeLocale}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Veure al lloc"
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-neutral-600 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-lg transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Veure</span>
            </a>

            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !localeData[defaultLocale].title.trim()}
              className="cursor-pointer flex items-center gap-2 px-4 py-1.5 bg-carma-500 hover:bg-carma-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Desar
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">

        {/* Left: content */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          {error && (
            <div className="p-3 text-sm rounded-xl bg-red-50 border border-red-100 text-red-600 font-medium">{error}</div>
          )}

          {/* Language tabs — dynamic, seeded from the site's languages */}
          <div className="flex flex-wrap items-center gap-2 bg-white border border-neutral-100 rounded-2xl p-2 shadow-sm">
            <span className="hidden sm:inline-flex items-center gap-1.5 pl-2 pr-1 text-xs font-bold text-neutral-400 uppercase tracking-widest">
              <Languages className="w-3.5 h-3.5" /> Idioma
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {shownLocales.map(loc => {
                const isActive = loc === activeLocale
                const filled = localeHasContent(loc)
                const removable = loc !== defaultLocale && !filled
                return (
                  <div
                    key={loc}
                    className={`flex items-center rounded-lg transition-colors ${isActive ? 'bg-carma-500 shadow-sm' : 'hover:bg-neutral-100'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveLocale(loc)}
                      className={`cursor-pointer flex items-center gap-1.5 pl-3 ${removable ? 'pr-1.5' : 'pr-3'} py-1.5 rounded-lg text-xs font-bold transition-all ${isActive ? 'text-white' : 'text-neutral-500'}`}
                      title={LOCALE_META[loc].label}
                    >
                      <span>{LOCALE_META[loc].flag}</span>
                      <span>{LOCALE_META[loc].native}</span>
                      {loc === defaultLocale && (
                        <span className={`text-[10px] font-extrabold uppercase ${isActive ? 'text-white/80' : 'text-neutral-300'}`}>·&nbsp;def</span>
                      )}
                      <span className={`w-1.5 h-1.5 rounded-full ${filled ? (isActive ? 'bg-white' : 'bg-green-500') : (isActive ? 'bg-white/40' : 'bg-neutral-200')}`} />
                    </button>
                    {removable && (
                      <button
                        type="button"
                        onClick={() => removeLanguage(loc)}
                        title="Treure idioma"
                        aria-label={`Treure ${LOCALE_META[loc].label}`}
                        className={`cursor-pointer mr-1 rounded p-0.5 transition-colors ${isActive ? 'text-white/70 hover:text-white' : 'text-neutral-300 hover:text-red-500'}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Add Language (+) */}
              {availableToAdd.length > 0 && (
                <div ref={addMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAddMenuOpen(o => !o)}
                    aria-haspopup="menu"
                    aria-expanded={addMenuOpen}
                    title="Afegir idioma"
                    className="cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-neutral-500 border border-dashed border-neutral-300 hover:border-carma-400 hover:text-carma-600 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Idioma
                  </button>
                  {addMenuOpen && (
                    <div role="menu" className="absolute top-full left-0 mt-1 z-20 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150">
                      {availableToAdd.map(loc => (
                        <button
                          key={loc}
                          type="button"
                          role="menuitem"
                          onClick={() => addLanguage(loc)}
                          className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors"
                        >
                          <span>{LOCALE_META[loc].flag}</span>
                          <span className="flex-1 text-left">{LOCALE_META[loc].native}</span>
                          <Plus className="w-3 h-3 text-neutral-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Translate with AI — Premium-gated */}
            {!isDefault && (
              <button
                type="button"
                onClick={() => { void handleTranslate() }}
                disabled={translating}
                className={`cursor-pointer ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  canTranslate
                    ? 'text-carma-700 bg-carma-50 border border-carma-100 hover:bg-carma-100'
                    : 'text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                }`}
                title={canTranslate ? `Tradueix des de ${LOCALE_META[defaultLocale].native} amb IA` : 'Funció Premium — millora el teu pla'}
              >
                {translating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : canTranslate ? <Sparkles className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
                {translating
                  ? 'Traduint…'
                  : localeHasContent(activeLocale) ? 'Re-traduir amb IA' : 'Traduir amb IA'}
                {!canTranslate && <LockBadge />}
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label className={labelClass}>Títol</label>
            <input
              type="text"
              value={cur.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="El títol del teu article..."
              className="w-full px-0 py-2 bg-transparent border-0 border-b border-neutral-200 focus:outline-none focus:border-carma-400 text-2xl font-extrabold text-neutral-900 placeholder:text-neutral-300 transition-colors"
            />
          </div>

          {/* Slug */}
          <div>
            <label className={labelClass}>Slug (URL)</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400 font-mono shrink-0">/</span>
              <input
                type="text"
                value={cur.slug}
                onChange={e => patchLocale(activeLocale, { slugTouched: true, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') })}
                className="flex-1 px-3 py-2 bg-neutral-50/50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                placeholder="el-teu-article"
              />
            </div>
          </div>

          {/* TipTap content (code-split + crash-isolated). Keyed by locale + nonce
              so switching language or auto-translating remounts with fresh HTML. */}
          <div>
            <label className={labelClass}>Contingut</label>
            <ErrorBoundary label="L'editor ha tingut un error">
              <Suspense fallback={<div className="h-[480px] rounded-2xl border border-neutral-200 bg-neutral-50/60 animate-pulse" />}>
                <TipTapEditor
                  key={`${activeLocale}-${editorNonce}`}
                  initialHtml={cur.contentHtml}
                  onChange={handleContentChange}
                  placeholder="Comença a escriure, o prem '/' per inserir blocs..."
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>

        {/* Right: tabbed sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">

          {/* Tab switcher */}
          <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl">
            {SIDEBAR_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSidebarTab(key)}
                className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  sidebarTab === key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Settings tab ── */}
          {sidebarTab === 'settings' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Publish state */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Publicació</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPublished(false)}
                    className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-bold transition-all ${!isPublished ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:border-neutral-300'}`}
                  >
                    <EyeOff className="w-4 h-4" />
                    Esborrany
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublished(true)}
                    className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-bold transition-all ${isPublished ? 'bg-green-600 text-white border-green-600' : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:border-neutral-300'}`}
                  >
                    <Eye className="w-4 h-4" />
                    Publicat
                  </button>
                </div>
              </div>

              {/* Publish date */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-neutral-400" />
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Data de publicació</p>
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className={fieldClass + ' text-xs'}
                />
                <p className="text-xs text-neutral-400 pl-1">
                  {isNew ? "Si la deixes buida, s'usa la data actual." : "Controla la data mostrada i l'ordre al llistat."}
                </p>
              </div>

              {/* Author */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-neutral-400" />
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Autor</p>
                </div>
                <input
                  type="text"
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="Nom de l'autor"
                  className={fieldClass + ' text-xs'}
                />
              </div>

              {/* Categories & Tags */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-neutral-400" />
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Categories i Etiquetes</p>
                </div>
                <TagInput label="Categories" values={categories} onChange={setCategories} placeholder="Afegeix una categoria..." />
                <TagInput label="Etiquetes" values={tags} onChange={setTags} placeholder="Afegeix una etiqueta..." />
              </div>

              {/* Excerpt */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-neutral-400" />
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Extracte</p>
                </div>
                <textarea
                  value={cur.excerpt}
                  onChange={e => patchLocale(activeLocale, { excerpt: e.target.value })}
                  rows={3}
                  placeholder="Breu descripció de l'article..."
                  className={fieldClass + ' resize-none text-xs'}
                />
              </div>

              {/* Featured image (cover / social). In-content media is handled
                  natively in the editor via drag-and-drop or the "/" menu. */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Imatge destacada</p>
                </div>
                {featuredImage ? (
                  <div className="relative rounded-xl overflow-hidden aspect-video bg-neutral-100 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={featuredImage} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFeaturedImage('')}
                      className="cursor-pointer absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Treure imatge"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center aspect-video rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-neutral-300">
                    <ImageIcon className="w-7 h-7" />
                    <span className="text-xs font-semibold mt-1">Cap imatge</span>
                  </div>
                )}
                <input
                  type="url"
                  value={featuredImage}
                  onChange={e => setFeaturedImage(e.target.value)}
                  placeholder="https://example.com/imatge.jpg"
                  className={fieldClass + ' text-xs'}
                />
                <p className="text-xs text-neutral-400 pl-1">
                  Portada de l&apos;article i imatge per a xarxes socials. Compartida per a tots els idiomes.
                </p>
              </div>
            </div>
          )}

          {/* ── SEO tab ── */}
          {sidebarTab === 'seo' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Score + Google preview */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <ScoreRing pct={scorePct} ring={score.ring} />
                  <div>
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Puntuació SEO · {LOCALE_META[activeLocale].native}</p>
                    <p className={`text-sm font-extrabold ${score.text}`}>{score.label} · {passed}/{checks.length}</p>
                  </div>
                </div>

                {/* Google preview */}
                <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
                  <p className="text-xs font-bold text-neutral-300 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Vista prèvia a Google
                  </p>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                      <Globe className="w-3 h-3 text-neutral-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-neutral-800 font-medium leading-tight truncate">{siteName}</p>
                      <p className="text-xs text-neutral-500 leading-tight truncate">{previewUrl}</p>
                    </div>
                  </div>
                  <p className="text-[#1a0dab] text-[17px] leading-snug font-medium truncate hover:underline cursor-pointer">{previewTitle}</p>
                  <p className="text-[13px] text-neutral-600 leading-snug line-clamp-2 mt-0.5">{previewDesc}</p>
                </div>
              </div>

              {/* Focus keyword */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-carma-500" />
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Paraula clau objectiu</p>
                </div>
                <input
                  type="text"
                  value={focusKeyword}
                  onChange={e => setFocusKeyword(e.target.value)}
                  placeholder="ex. marketing digital"
                  className={fieldClass + ' text-xs'}
                />
              </div>

              {/* Meta title + description */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <label className={labelClass}>Meta títol</label>
                  <input
                    type="text"
                    value={cur.seoTitle}
                    onChange={e => patchLocale(activeLocale, { seoTitle: e.target.value })}
                    placeholder={cur.title || 'Títol per a cercadors'}
                    className={fieldClass + ' text-xs'}
                  />
                  <p className={`text-xs mt-1 pl-1 font-semibold ${counterTone((cur.seoTitle || cur.title).length, 30, 60)}`}>
                    {(cur.seoTitle || cur.title).length} / 60 caràcters
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Meta descripció</label>
                  <textarea
                    value={cur.seoDescription}
                    onChange={e => patchLocale(activeLocale, { seoDescription: e.target.value })}
                    rows={3}
                    placeholder={cur.excerpt || 'Descripció per a cercadors'}
                    className={fieldClass + ' resize-none text-xs'}
                  />
                  <p className={`text-xs mt-1 pl-1 font-semibold ${counterTone(cur.seoDescription.length, 120, 160)}`}>
                    {cur.seoDescription.length} / 160 caràcters
                  </p>
                </div>
              </div>

              {/* Social / Open Graph preview */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Vista prèvia social</p>
                <div className="rounded-xl border border-neutral-200 overflow-hidden">
                  {featuredImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={featuredImage} alt="" className="w-full aspect-[1.91/1] object-cover bg-neutral-100" />
                  ) : (
                    <div className="aspect-[1.91/1] bg-neutral-100 flex items-center justify-center text-neutral-300">
                      <ImageIcon className="w-7 h-7" />
                    </div>
                  )}
                  <div className="p-3 bg-neutral-50">
                    <p className="text-xs uppercase text-neutral-400 tracking-wide truncate">{previewUrl.split(' ›')[0]}</p>
                    <p className="text-sm font-bold text-neutral-800 truncate mt-0.5">{previewTitle}</p>
                    <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{previewDesc}</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-400 pl-0.5">S&apos;usa la imatge destacada com a imatge social (Open Graph).</p>
              </div>

              {/* Advanced */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Avançat</p>
                <div>
                  <label className={labelClass}>URL canònica</label>
                  <input
                    type="url"
                    value={canonical}
                    onChange={e => setCanonical(e.target.value)}
                    placeholder="https://… (opcional)"
                    className={fieldClass + ' text-xs'}
                  />
                </div>
                <div className="flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-xs font-bold text-neutral-700">No indexar (noindex)</p>
                    <p className="text-xs text-neutral-400">Amaga l&apos;article dels cercadors</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={noindex}
                    onClick={() => setNoindex(v => !v)}
                    className={`cursor-pointer relative w-11 h-6 rounded-full transition-colors shrink-0 ${noindex ? 'bg-red-500' : 'bg-neutral-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${noindex ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Checklist */}
              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-2.5">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Anàlisi</p>
                {checks.map(c => (
                  <div key={c.label} className="flex items-start gap-2">
                    {c.pass
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-px" />
                      : <AlertCircle className="w-4 h-4 text-neutral-300 shrink-0 mt-px" />}
                    <span className={`text-xs font-medium leading-snug ${c.pass ? 'text-neutral-700' : 'text-neutral-400'}`}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Premium upsell — shown when a free user taps "Translate with AI" */}
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
    </div>
  )
}

function ScoreRing({ pct, ring }: { pct: number; ring: string }) {
  const r = 18
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#f0efec" strokeWidth="4" />
        <circle
          cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          className={ring} stroke="currentColor"
          strokeDasharray={circ} strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-neutral-700">{pct}</span>
    </div>
  )
}
