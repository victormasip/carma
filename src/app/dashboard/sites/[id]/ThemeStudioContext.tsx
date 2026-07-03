'use client'

// Real-time theme studio state — the single source of truth shared by the
// "Tema" editor tab and the "Connexió" embed tab. There is NO save button:
// every edit flows into this state and a debounced effect persists it via the
// saveTheme server action. The live embed snippet reads the same tokens, so it
// updates the instant the editor does.

import {
  createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode,
} from 'react'
import { saveTheme, deleteTheme, incrementThemeRegen, translateChrome as translateChromeAction, type ThemeData } from '@/lib/actions/theme'
import { setSiteDefaultLocale } from '@/lib/actions/locales'
import { enableModules } from '@/lib/actions/modules'
import { getStudioArticle, getPostContent, updatePostFields, seedSamplePosts } from '@/lib/actions/posts'
import { DEFAULT_LOCALE, LOCALES, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import type { BlogSignature } from '@/lib/scrape/blogDetect'
import {
  CAPTURE_STEP_IDS, parseSseFrame,
  type AnalyzeResult, type CaptureEvent, type CaptureStepId, type CaptureStepStatus,
} from '@/lib/render/captureProgress'
import { templateChromeJson, type BlogTemplate } from '@/lib/render/templates'

type ChromeI18n = Record<string, { header?: string; footer?: string; section_title?: string }>

export type Theme = {
  site_id?: string
  reference_url?: string | null
  reference_url_home?: string | null
  extracted_head?: string | null
  extracted_header?: string | null
  extracted_footer?: string | null
  extracted_body_attrs?: string | null
  extracted_card?: string | null
  extracted_scripts?: string | null
  external_styles?: string[] | null
  external_scripts?: string[] | null
  font_links?: string[] | null
  base_url?: string | null
  detected_framework?: string | null
  detected_hosting?: string | null
  design_tokens?: Partial<DesignTokens> | null
  section_title?: string | null
  default_locale?: string | null
  chrome_i18n?: ChromeI18n | null
  blog_signature?: BlogSignature | null
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Live capture (Magic Wand) progress, surfaced to the progressive modal ──
export type CapturePhase = 'idle' | 'running' | 'success' | 'error'

// Out-of-band notice (e.g. "complex chrome — best-effort reconstruction").
// Shown in the capture modal so the user can decide whether to keep going.
export type CaptureNotice = {
  severity: 'info' | 'warning'
  code: string
  message: string
}

export type CaptureState = {
  open: boolean
  phase: CapturePhase
  pct: number
  steps: Record<CaptureStepId, CaptureStepStatus>
  stepDetail: Partial<Record<CaptureStepId, string>>
  activeStep: CaptureStepId | null
  error: string | null
  notices: CaptureNotice[]
}

const initialSteps = (): Record<CaptureStepId, CaptureStepStatus> =>
  Object.fromEntries(CAPTURE_STEP_IDS.map(id => [id, 'pending'])) as Record<CaptureStepId, CaptureStepStatus>

const IDLE_CAPTURE: CaptureState = {
  open: false, phase: 'idle', pct: 0,
  steps: initialSteps(), stepDetail: {}, activeStep: null, error: null, notices: [],
}

// Abort the stream only after this long with NO event at all — a genuine hang,
// not mere slowness. While progress events keep arriving (the LLM heartbeats
// every ~300ms) the capture never times out, however heavy the site.
const CAPTURE_STALL_MS = 60_000

type ThemeStudio = {
  siteId: string
  // identity / lifecycle
  hasTheme: boolean
  saveStatus: SaveStatus
  // Timestamp of the last SUCCESSFUL persist — bumped per save so the live
  // preview can reload to pick up structural (header/footer/title) changes
  // without a setState-in-render or impure Date.now() at the consumer.
  savedAt: number
  // ── Undo / redo over the editable slice (tokens + chrome + section title) ──
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  // capture
  url: string
  setUrl: (v: string) => void
  // Optional user-provided Blog URL — guides card cloning when auto-detection is
  // unsure (BUG 2 fallback). Sent with the capture; seeded from the saved signature.
  blogUrl: string
  setBlogUrl: (v: string) => void
  analyzing: boolean
  error: string | null
  grab: (overrideUrl?: string) => Promise<void>
  removeTheme: () => Promise<void>
  // ── Freemium theme-regeneration quota ──
  // The onboarding capture is free; free clients then get FREE_REGENS re-captures
  // before the Premium lock. Superadmin/Premium = unlimited.
  isPremium: boolean
  regenCount: number
  freeRegens: number
  canRegenerate: boolean
  // Set when a free user tries to re-capture past their quota (the UI shows an
  // upsell instead of capturing). Cleared via clearPremiumBlock.
  premiumBlocked: boolean
  clearPremiumBlock: () => void
  // apply a from-scratch starter template (onboarding "template" path)
  applyTemplate: (tpl: BlogTemplate, siteName: string) => Promise<void>
  // live capture progress (progressive modal)
  capture: CaptureState
  closeCapture: () => void
  cancelCapture: () => void
  // Explicit "I've seen the result, take me to the next step" — fired by the
  // success CTA. Closes the modal AND advances onboarding (import / layout
  // picker). Kept separate from closeCapture so dismissing via the X does NOT
  // auto-advance — the user stays in control of the flow.
  proceedFromCapture: () => void
  // ── Canvas view: the live feed, or a single article (premium article-layout
  //    preview + inline headline/lede editing) ──
  view: 'feed' | 'article'
  setView: (v: 'feed' | 'article') => void
  // The post the Article view previews + inline-edits (newest published). null when
  // the site has no article yet → the Article view shows a sample (preview only).
  editableArticle: { id: string; slug: string; title: string } | null
  // Persist an inline edit of the previewed article's headline or lede. No-op when
  // there's no real article (sample preview). Bumps savedAt so the canvas refreshes.
  saveArticleField: (field: 'title' | 'excerpt', value: string) => Promise<void>
  // Persist an inline edit of ANY feed card's post (title/excerpt), keyed by post
  // id (the render tags each real card with `data-carma-post`). The card already
  // shows the edit live, so this is a silent persist — no preview reload.
  saveCardField: (postId: string, field: 'title' | 'excerpt', value: string) => Promise<void>
  // Body editing (TipTap): load the article's content HTML on entering edit mode,
  // and persist the serialized+sanitized HTML on save (bumps savedAt → preview reload).
  loadArticleBody: () => Promise<string>
  saveArticleBody: (html: string) => Promise<boolean>
  // tokens
  tokens: DesignTokens
  setToken: <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => void
  // content (the values below reflect the ACTIVE edit locale)
  sectionTitle: string
  setSectionTitle: (v: string) => void
  extractedHeader: string
  setExtractedHeader: (v: string) => void
  extractedFooter: string
  setExtractedFooter: (v: string) => void
  // The captured client <head> assets (CSS/fonts/scripts), injected at render so
  // the light-DOM header/footer look 1:1. Base-locale only (head is not localized).
  extractedHead: string
  setExtractedHead: (v: string) => void
  // captured article-card template (read-only; '' when using native cards)
  extractedCard: string
  // multilingual chrome
  editLocale: Locale
  setEditLocale: (l: Locale) => void
  editLocales: Locale[]
  chromeDefaultLocale: Locale
  canTranslateChrome: boolean
  translatingChrome: boolean
  translateChrome: (to: Locale) => Promise<{ error?: string }>
  // detection (read-only after grab)
  detectedFramework: string | null
  detectedHosting: string | null
  externalStyles: string[]
  externalScripts: string[]
  fontLinks: string[]
  // Register an extra font stylesheet (e.g. a Google Fonts URL picked in the
  // typography panel) so the public render loads it. Deduped; autosaved.
  addFontLink: (href: string) => void
  // native card replication (GOAL 2): true when the feed mirrors the client's
  // detected blog cards; clearNativeCard reverts to our premium default layout.
  nativeCardActive: boolean
  nativeCardColumns: number | null
  clearNativeCard: () => void
}

const Ctx = createContext<ThemeStudio | null>(null)

const AUTOSAVE_MS = 700

// Free clients may re-capture (regenerate) their theme this many times for free
// before the Premium lock. The initial onboarding capture does NOT count.
const FREE_REGENS = 1

export function ThemeStudioProvider({
  siteId, initialTheme, children, defaultLocale: defaultLocaleProp, canTranslate = false,
  isPremium = false, initialRegenCount = 0,
  onCaptureSuccess, onCaptureProceed,
}: {
  siteId: string
  initialTheme: Theme | null
  children: ReactNode
  defaultLocale?: string
  canTranslate?: boolean
  /** Premium (today: superadmin) → unlimited theme regeneration. */
  isPremium?: boolean
  /** How many re-captures this site has already consumed (site_themes.regen_count). */
  initialRegenCount?: number
  // Fired (from the capture stream's `result` event, not an effect) once a Magic
  // Wand capture lands — lets the host coordinate the post-capture flow (e.g.
  // jump to the Theme tab, offer WordPress article import).
  onCaptureSuccess?: (info: { framework: string | null; url: string; siteName: string | null; logoUrl: string | null }) => void
  // Fired when the user EXPLICITLY clicks the success CTA ("Comencem" / "Importa
  // els articles" / "Editar el tema") — the moment to advance the onboarding.
  onCaptureProceed?: (info: { framework: string | null }) => void
}) {
  // Latest-ref so grab()'s memoized callback always sees the current handler
  // without taking it as a dependency.
  const onCaptureSuccessRef = useRef(onCaptureSuccess)
  onCaptureSuccessRef.current = onCaptureSuccess
  const onCaptureProceedRef = useRef(onCaptureProceed)
  onCaptureProceedRef.current = onCaptureProceed

  const [active, setActive] = useState(!!initialTheme)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState(0)

  // ── Canvas view + inline article editing ──
  const [view, setView] = useState<'feed' | 'article'>('feed')
  const [editableArticle, setEditableArticle] = useState<{ id: string; slug: string; title: string } | null>(null)
  useEffect(() => {
    let alive = true
    void getStudioArticle(siteId).then((a) => { if (alive) setEditableArticle(a) }).catch(() => {})
    return () => { alive = false }
  }, [siteId])
  const saveArticleField = useCallback(async (field: 'title' | 'excerpt', value: string) => {
    const art = editableArticle
    if (!art) return // sample preview — nothing to persist
    const fields = field === 'title' ? { title: value } : { excerpt: value }
    const res = await updatePostFields(art.id, siteId, fields)
    if (!res.error) {
      if (field === 'title') setEditableArticle((a) => (a ? { ...a, title: value } : a))
      setSavedAt(Date.now()) // refresh the canvas to show the persisted state
    }
  }, [editableArticle, siteId])
  const saveCardField = useCallback(async (postId: string, field: 'title' | 'excerpt', value: string) => {
    if (!postId) return
    const fields = field === 'title' ? { title: value } : { excerpt: value }
    await updatePostFields(postId, siteId, fields)
  }, [siteId])
  const loadArticleBody = useCallback(async (): Promise<string> => {
    const art = editableArticle
    if (!art) return ''
    const res = await getPostContent(art.id, siteId)
    return res?.html ?? ''
  }, [editableArticle, siteId])
  const saveArticleBody = useCallback(async (html: string): Promise<boolean> => {
    const art = editableArticle
    if (!art) return false
    const res = await updatePostFields(art.id, siteId, { content: html })
    if (res.error) return false
    setSavedAt(Date.now())
    return true
  }, [editableArticle, siteId])

  // ── Freemium regeneration quota ──
  const [regenCount, setRegenCount] = useState(initialRegenCount)
  const [premiumBlocked, setPremiumBlocked] = useState(false)
  const canRegenerate = isPremium || regenCount < FREE_REGENS
  // Latest-refs so grab() (memoized) reads current values without taking them as
  // deps — same pattern as onCaptureSuccessRef/blogUrlRef below.
  const activeRef = useRef(active)
  activeRef.current = active
  const regenCountRef = useRef(regenCount)
  regenCountRef.current = regenCount
  const isPremiumRef = useRef(isPremium)
  isPremiumRef.current = isPremium

  // The locale the BASE chrome (extracted_* / section_title) represents. Other
  // locales live in chromeI18n. editLocale is which one the UI is editing.
  // Seeded from the site's configured default, but a capture that detects a
  // different site language ADOPTS it (see applyResult) — so the header/footer/
  // global strings localize to the site's TRUE language instead of pinning to
  // Catalan. This is state (not a const) precisely so the capture can update it.
  const [chromeDefaultLocale, setChromeDefaultLocale] = useState<Locale>(
    normalizeLocale(defaultLocaleProp ?? initialTheme?.default_locale, DEFAULT_LOCALE),
  )
  const [editLocale, setEditLocale] = useState<Locale>(chromeDefaultLocale)
  const [chromeI18n, setChromeI18n] = useState<ChromeI18n>(initialTheme?.chrome_i18n ?? {})
  const [translatingChrome, setTranslatingChrome] = useState(false)

  const [url, setUrl] = useState(initialTheme?.reference_url ?? initialTheme?.reference_url_home ?? '')
  const [blogUrl, setBlogUrl] = useState(initialTheme?.blog_signature?.blogUrl ?? '')
  const blogUrlRef = useRef(blogUrl)
  blogUrlRef.current = blogUrl
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capture, setCapture] = useState<CaptureState>(IDLE_CAPTURE)
  const captureAbort = useRef<AbortController | null>(null)
  const captureCancelled = useRef(false)

  const [extractedHead, setExtractedHead] = useState(initialTheme?.extracted_head ?? '')
  const [extractedHeader, setExtractedHeader] = useState(initialTheme?.extracted_header ?? '')
  const [extractedFooter, setExtractedFooter] = useState(initialTheme?.extracted_footer ?? '')
  // The source <body>'s attributes (class/style/data-*); reapplied at render so the
  // page's global background/typography match. Not localized, not user-edited.
  const [extractedBodyAttrs, setExtractedBodyAttrs] = useState(initialTheme?.extracted_body_attrs ?? '')
  const [extractedCard, setExtractedCard] = useState(initialTheme?.extracted_card ?? '')
  const [extractedScripts, setExtractedScripts] = useState(initialTheme?.extracted_scripts ?? '')
  const [externalStyles, setExternalStyles] = useState<string[]>(initialTheme?.external_styles ?? [])
  const [externalScripts, setExternalScripts] = useState<string[]>(initialTheme?.external_scripts ?? [])
  const [fontLinks, setFontLinks] = useState<string[]>(initialTheme?.font_links ?? [])
  const [baseUrl, setBaseUrl] = useState(initialTheme?.base_url ?? '')
  const [detectedFramework, setDetectedFramework] = useState<string | null>(initialTheme?.detected_framework ?? null)
  // Latest-ref mirror so proceedFromCapture (memoized, [] deps) reads the current
  // framework without re-creating the callback on every capture.
  const detectedFrameworkRef = useRef(detectedFramework)
  detectedFrameworkRef.current = detectedFramework
  const [detectedHosting, setDetectedHosting] = useState<string | null>(initialTheme?.detected_hosting ?? null)
  const [tokens, setTokens] = useState<DesignTokens>({ ...DEFAULT_TOKENS, ...(initialTheme?.design_tokens ?? {}) })
  const [sectionTitle, setSectionTitle] = useState(initialTheme?.section_title ?? '')
  // Detected blog/native-card signature (auto-derived at capture; persisted so the
  // render can replicate the client's card design). Not user-edited.
  const [blogSignature, setBlogSignature] = useState<BlogSignature | null>(initialTheme?.blog_signature ?? null)

  const setToken = useCallback(
    <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) =>
      setTokens(t => ({ ...t, [key]: value })),
    [],
  )

  const addFontLink = useCallback(
    (href: string) => setFontLinks(prev => (prev.includes(href) ? prev : [...prev, href])),
    [],
  )

  const buildThemeData = useCallback((): ThemeData => ({
    reference_url: url || null,
    extracted_head: extractedHead || null,
    extracted_header: extractedHeader || null,
    extracted_footer: extractedFooter || null,
    extracted_body_attrs: extractedBodyAttrs || null,
    extracted_card: extractedCard || null,
    extracted_scripts: extractedScripts || null,
    external_styles: externalStyles,
    external_scripts: externalScripts,
    font_links: fontLinks,
    base_url: baseUrl || null,
    detected_framework: detectedFramework,
    detected_hosting: detectedHosting,
    design_tokens: tokens,
    section_title: sectionTitle.trim() || null,
    chrome_i18n: chromeI18n,
    blog_signature: blogSignature,
  }), [
    url, extractedHead, extractedHeader, extractedFooter, extractedBodyAttrs, extractedCard, extractedScripts,
    externalStyles, externalScripts, fontLinks, baseUrl, detectedFramework,
    detectedHosting, tokens, sectionTitle, chromeI18n, blogSignature,
  ])

  // ── Debounced real-time autosave ──
  // We serialize the payload and persist it AUTOSAVE_MS after the last change.
  // We save only when the payload DIFFERS from what was last loaded/saved, so
  // merely opening an existing theme doesn't write — but the FIRST capture or
  // template on a brand-new site DOES persist. (The old first-run skip never got
  // consumed while active was false, so it silently dropped that first save —
  // the cause of "captured the theme but it wasn't saved".)
  const serialized = JSON.stringify(buildThemeData())
  const lastSavedRef = useRef(serialized)
  const reqId = useRef(0)

  useEffect(() => {
    if (!active) return
    if (serialized === lastSavedRef.current) return

    setSaveStatus('saving')
    const id = ++reqId.current
    const handle = setTimeout(async () => {
      const payload = serialized
      const result = await saveTheme(siteId, JSON.parse(payload) as ThemeData)
      // Ignore a stale response if a newer edit superseded this save.
      if (id !== reqId.current) return
      if (!result.error) { lastSavedRef.current = payload; setSavedAt(Date.now()) }
      setSaveStatus(result.error ? 'error' : 'saved')
    }, AUTOSAVE_MS)

    return () => clearTimeout(handle)
  }, [serialized, active, siteId])

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  // A bounded history of `serialized` snapshots, recorded on a settle debounce so
  // one "finished" edit = one undo step. Kept fully INDEPENDENT of the autosave
  // effect above (which stays untouched) — restoring just calls the base setters,
  // and the autosave persists the restored state like any other change.
  const historyRef = useRef<string[]>([])
  const [histIndex, setHistIndex] = useState(-1)
  const histIndexRef = useRef(-1)
  histIndexRef.current = histIndex
  const restoringRef = useRef(false)

  useEffect(() => {
    if (!active) return
    // Seed the baseline (the loaded/captured theme) as the first undo point.
    if (historyRef.current.length === 0) {
      historyRef.current = [serialized]
      setHistIndex(0)
      return
    }
    // A restore caused this change — don't record it as a new step.
    if (restoringRef.current) { restoringRef.current = false; return }
    if (historyRef.current[histIndexRef.current] === serialized) return
    const t = setTimeout(() => {
      if (historyRef.current[histIndexRef.current] === serialized) return
      const next = historyRef.current.slice(0, histIndexRef.current + 1)
      next.push(serialized)
      while (next.length > 60) next.shift()
      historyRef.current = next
      setHistIndex(next.length - 1)
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [serialized, active])

  const restoreFromSnapshot = useCallback((snap: string) => {
    try {
      const d = JSON.parse(snap) as ThemeData
      restoringRef.current = true
      setTokens({ ...DEFAULT_TOKENS, ...(d.design_tokens ?? {}) })
      setSectionTitle(d.section_title ?? '')
      setExtractedHeader(d.extracted_header ?? '')
      setExtractedFooter(d.extracted_footer ?? '')
      setExtractedHead(d.extracted_head ?? '')
      setChromeI18n((d.chrome_i18n as ChromeI18n) ?? {})
    } catch { /* malformed snapshot — ignore */ }
  }, [])

  const undo = useCallback(() => {
    const i = histIndexRef.current
    if (i <= 0) return
    setHistIndex(i - 1)
    restoreFromSnapshot(historyRef.current[i - 1])
  }, [restoreFromSnapshot])

  const redo = useCallback(() => {
    const i = histIndexRef.current
    if (i < 0 || i >= historyRef.current.length - 1) return
    setHistIndex(i + 1)
    restoreFromSnapshot(historyRef.current[i + 1])
  }, [restoreFromSnapshot])

  const canUndo = histIndex > 0
  const canRedo = histIndex >= 0 && histIndex < historyRef.current.length - 1

  // Apply a finished capture to the live theme state (identical to the old
  // single-response handler — just driven by the streamed `result` event).
  const applyResult = useCallback((data: AnalyzeResult) => {
    setExtractedHead(data.extracted_head)
    setExtractedHeader(data.extracted_header)
    setExtractedFooter(data.extracted_footer)
    setExtractedBodyAttrs(data.extracted_body_attrs ?? '')
    setExtractedCard(data.extracted_card ?? '')
    setExtractedScripts(data.extracted_scripts ?? '')
    setExternalStyles(data.external_styles ?? [])
    setExternalScripts(data.external_scripts ?? [])
    setFontLinks(data.font_links ?? [])
    setBaseUrl(data.base_url)
    setDetectedFramework(data.detection?.framework ?? null)
    setDetectedHosting(data.detection?.hosting ?? null)
    // Preserve any layout the user already chose; refresh the visual tokens.
    setTokens(prev => ({ ...DEFAULT_TOKENS, ...(data.tokens ?? {}), layout: prev.layout, columns: prev.columns, feedLayout: prev.feedLayout }))
    setSectionTitle(data.section_title ?? '')
    setBlogSignature(data.blog_signature ?? null)
    setBlogUrl(data.blog_signature?.blogUrl ?? '')
    // A fresh capture replaces the base chrome → old translations are stale.
    setChromeI18n({})
    setActive(true)
    // Respect the site's TRUE language: when the capture detects a supported
    // locale (from <html lang> / og:locale), ADOPT it as the chrome's base and
    // persist it as the site default — instead of blindly leaving Catalan. The
    // header/footer/section-title strings then localize to the real language.
    // Falls back to the current base when nothing reliable was detected.
    const detected = data.detected_locale ? normalizeLocale(data.detected_locale) : null
    const nextBase = detected ?? chromeDefaultLocale
    setChromeDefaultLocale(nextBase)
    setEditLocale(nextBase)
    // setSiteDefaultLocale also adds the locale to the site's available set, so
    // this replaces the previous addSiteLocale-only call.
    if (detected) void setSiteDefaultLocale(siteId, detected).catch(() => {})
    // Feature parity with the source: enable the modules the capture detected
    // (searcher, newsletter, share…). Merge-only + best-effort — it never
    // blocks the apply, and the owner can flip any of them off in Mòduls.
    const mods = data.detected_modules ?? []
    if (mods.length > 0) void enableModules(siteId, mods.map((m) => m.id)).catch(() => {})
  }, [siteId, chromeDefaultLocale])

  // Stream the capture pipeline over SSE, surfacing every step to the modal.
  // There is NO arbitrary total timeout: we abort only if the stream goes
  // completely silent for CAPTURE_STALL_MS (a real hang).
  const grab = useCallback(async (overrideUrl?: string) => {
    const target = (overrideUrl ?? url).trim()
    if (!target) return

    // A RE-capture (a theme already exists) is the regenerable action. The first
    // onboarding capture is always free and never gated. Free clients past their
    // quota get the Premium upsell instead of a capture.
    const isRecapture = activeRef.current
    if (isRecapture && !isPremiumRef.current && regenCountRef.current >= FREE_REGENS) {
      setPremiumBlocked(true)
      return
    }

    if (overrideUrl !== undefined) setUrl(overrideUrl)

    captureAbort.current?.abort()
    const controller = new AbortController()
    captureAbort.current = controller
    captureCancelled.current = false

    setError(null)
    setAnalyzing(true)
    // Open the modal the instant the user clicks — immediate, tangible feedback.
    setCapture({
      open: true, phase: 'running', pct: 0,
      steps: initialSteps(), stepDetail: {}, activeStep: null, error: null, notices: [],
    })

    let stallTimer: ReturnType<typeof setTimeout> | null = null
    const bumpStall = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => controller.abort(), CAPTURE_STALL_MS)
    }

    const onEvent = (evt: CaptureEvent) => {
      if (evt.type === 'progress') {
        setCapture(c => ({
          ...c,
          pct: Math.max(c.pct, evt.pct), // monotonic — never jump backwards
          activeStep: evt.status === 'running' ? evt.step : c.activeStep,
          steps: { ...c.steps, [evt.step]: evt.status },
          stepDetail: evt.detail ? { ...c.stepDetail, [evt.step]: evt.detail } : c.stepDetail,
        }))
      } else if (evt.type === 'notice') {
        setCapture(c => ({
          ...c,
          notices: [...c.notices, { severity: evt.severity, code: evt.code, message: evt.message }],
        }))
      } else if (evt.type === 'result') {
        applyResult(evt.data)
        // A successful free re-capture consumes one regeneration of the quota.
        if (isRecapture && !isPremiumRef.current) {
          setRegenCount(c => c + 1)
          void incrementThemeRegen(siteId).catch(() => {})
        }
        setCapture(c => ({
          ...c,
          phase: 'success',
          pct: 100,
          activeStep: null,
          steps: Object.fromEntries(
            CAPTURE_STEP_IDS.map(id => [id, c.steps[id] === 'skipped' ? 'skipped' : 'done']),
          ) as Record<CaptureStepId, CaptureStepStatus>,
        }))
        onCaptureSuccessRef.current?.({ framework: evt.data.detection?.framework ?? null, url: target, siteName: evt.data.site_name ?? null, logoUrl: evt.data.logo_url ?? null })
        // The success state now PERSISTS until the user acts. The modal used to
        // auto-close after 1.3s, which yanked the "Comencem" CTA away before the
        // user could read what happened or click it — the onboarding then felt
        // like it skipped ahead. The user now advances on their own click
        // (proceedFromCapture) or dismisses with the X (closeCapture).
      } else {
        setError(evt.error)
        setCapture(c => ({
          ...c,
          phase: 'error',
          error: evt.error,
          steps: evt.step ? { ...c.steps, [evt.step]: 'error' } : c.steps,
        }))
      }
    }

    try {
      const res = await fetch('/api/theme/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ url: target, blogUrl: blogUrlRef.current.trim() || undefined }),
        signal: controller.signal,
      })

      // Auth / validation failures arrive as ordinary JSON, not a stream.
      if (!res.ok || !res.body) {
        const data = res.body ? await res.json().catch(() => null) : null
        const message = (data as { error?: string } | null)?.error ?? `Error del servidor (${res.status}).`
        setError(message)
        setCapture(c => ({ ...c, phase: 'error', error: message }))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      bumpStall()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bumpStall()
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const evt = parseSseFrame(frame)
          if (evt) onEvent(evt)
        }
      }
    } catch (e) {
      // An explicit user cancel aborts the stream too — but that's not an error.
      if (captureCancelled.current) return
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      const message = aborted
        ? 'La captura s’ha aturat: el servidor ha deixat de respondre. Torna-ho a provar.'
        : 'Error de xarxa. Comprova la connexió i torna-ho a provar.'
      setError(message)
      setCapture(c => (c.phase === 'success' ? c : { ...c, phase: 'error', error: message }))
    } finally {
      if (stallTimer) clearTimeout(stallTimer)
      setAnalyzing(false)
      if (captureAbort.current === controller) captureAbort.current = null
    }
  }, [url, applyResult, siteId])

  // Dismiss the modal after the stream has ended (success or error).
  const closeCapture = useCallback(() => setCapture(c => ({ ...c, open: false })), [])

  // The user clicked the success CTA: close the modal AND advance the onboarding.
  const proceedFromCapture = useCallback(() => {
    setCapture(c => ({ ...c, open: false }))
    onCaptureProceedRef.current?.({ framework: detectedFrameworkRef.current })
  }, [])

  // Abort an in-flight capture and close the modal — no error UI, the user
  // chose to stop.
  const cancelCapture = useCallback(() => {
    captureCancelled.current = true
    captureAbort.current?.abort()
    setAnalyzing(false)
    setCapture(IDLE_CAPTURE)
  }, [])

  // Apply a from-scratch starter template: write its tokens + native chrome into
  // the live state (base/default locale) and activate. The debounced autosave
  // persists it, exactly like a capture — no LLM, no server round-trip here.
  const applyTemplate = useCallback(async (tpl: BlogTemplate, name: string) => {
    const { header, footer } = templateChromeJson(tpl, name)
    setExtractedHead('')
    setExtractedHeader(header)
    setExtractedFooter(footer)
    setExtractedBodyAttrs('') // starter templates are self-contained — no client body

    setExtractedCard('') // templates use our native token-driven cards
    setExtractedScripts('')
    setExternalStyles([])
    setExternalScripts([])
    setFontLinks(tpl.fontLinks ?? [])
    setBaseUrl('')
    setDetectedFramework(null)
    setDetectedHosting(null)
    setTokens(prev => ({
      ...DEFAULT_TOKENS,
      ...tpl.tokens,
      layout: tpl.tokens.layout ?? prev.layout,
      columns: tpl.tokens.columns ?? prev.columns,
    }))
    setSectionTitle(tpl.sectionTitle)
    setBlogSignature(null) // starter templates use OUR premium card design
    setChromeI18n({})
    setEditLocale(chromeDefaultLocale)
    setActive(true)
    // Each look ships with its matching Smart Modules ON (search, newsletter…)
    // — merge-only + best-effort, adjustable from the Mòduls tab.
    if (tpl.modules?.length) void enableModules(siteId, tpl.modules).catch(() => {})
    // Born ALIVE: seed the starter articles (real, published, localized) so the
    // feed and the article pages are full from the very first second. Awaited —
    // the host refreshes the route right after, and the posts must be there.
    try { await seedSamplePosts(siteId, chromeDefaultLocale) } catch { /* best-effort */ }
  }, [chromeDefaultLocale, siteId])

  const removeTheme = useCallback(async () => {
    const result = await deleteTheme(siteId)
    if (result.error) { setSaveStatus('error'); return }
    // Reset to a pristine, inactive studio; the autosave guard (active=false)
    // prevents this reset from writing anything back.
    setActive(false)
    setSaveStatus('idle')
    setExtractedHead(''); setExtractedHeader(''); setExtractedFooter(''); setExtractedBodyAttrs(''); setExtractedCard(''); setExtractedScripts('')
    setExternalStyles([]); setExternalScripts([]); setFontLinks([]); setBaseUrl('')
    setDetectedFramework(null); setDetectedHosting(null)
    setTokens({ ...DEFAULT_TOKENS })
    setSectionTitle('')
    setBlogSignature(null)
    setChromeI18n({})
    setEditLocale(chromeDefaultLocale)
  }, [siteId, chromeDefaultLocale])

  // ── Per-locale chrome accessors ──
  // The default-locale chrome lives in the base states; other locales overlay
  // via chromeI18n. The exposed getters/setters route to the right place so the
  // visual editor + code editors keep working unchanged.
  const isDefaultEdit = editLocale === chromeDefaultLocale
  const headerForLocale = isDefaultEdit ? extractedHeader : (chromeI18n[editLocale]?.header ?? '')
  const footerForLocale = isDefaultEdit ? extractedFooter : (chromeI18n[editLocale]?.footer ?? '')
  const sectionForLocale = isDefaultEdit ? sectionTitle : (chromeI18n[editLocale]?.section_title ?? '')

  const setHeaderForLocale = (v: string) => {
    if (isDefaultEdit) setExtractedHeader(v)
    else setChromeI18n(p => ({ ...p, [editLocale]: { ...p[editLocale], header: v } }))
  }
  const setFooterForLocale = (v: string) => {
    if (isDefaultEdit) setExtractedFooter(v)
    else setChromeI18n(p => ({ ...p, [editLocale]: { ...p[editLocale], footer: v } }))
  }
  const setSectionForLocale = (v: string) => {
    if (isDefaultEdit) setSectionTitle(v)
    else setChromeI18n(p => ({ ...p, [editLocale]: { ...p[editLocale], section_title: v } }))
  }

  const translateChrome = useCallback(async (to: Locale): Promise<{ error?: string }> => {
    setTranslatingChrome(true)
    try {
      const res = await translateChromeAction(siteId, chromeDefaultLocale, to, {
        header: extractedHeader || null,
        footer: extractedFooter || null,
        section_title: sectionTitle || null,
      })
      if (res.error || !res.result) return { error: res.error ?? 'No s\'ha pogut traduir el chrome' }
      const r = res.result
      setChromeI18n(prev => ({
        ...prev,
        [to]: { header: r.header ?? undefined, footer: r.footer ?? undefined, section_title: r.section_title ?? undefined },
      }))
      return {}
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error de traducció' }
    } finally {
      setTranslatingChrome(false)
    }
  }, [siteId, chromeDefaultLocale, extractedHeader, extractedFooter, sectionTitle])

  const value: ThemeStudio = {
    siteId,
    hasTheme: active,
    saveStatus,
    savedAt,
    undo, redo, canUndo, canRedo,
    url, setUrl, blogUrl, setBlogUrl, analyzing, error, grab, removeTheme,
    isPremium, regenCount, freeRegens: FREE_REGENS, canRegenerate,
    premiumBlocked, clearPremiumBlock: () => setPremiumBlocked(false),
    applyTemplate,
    capture, closeCapture, cancelCapture, proceedFromCapture,
    view, setView, editableArticle, saveArticleField, saveCardField, loadArticleBody, saveArticleBody,
    tokens, setToken,
    sectionTitle: sectionForLocale, setSectionTitle: setSectionForLocale,
    extractedHeader: headerForLocale, setExtractedHeader: setHeaderForLocale,
    extractedFooter: footerForLocale, setExtractedFooter: setFooterForLocale,
    extractedHead, setExtractedHead,
    extractedCard,
    editLocale, setEditLocale, editLocales: [...LOCALES], chromeDefaultLocale,
    canTranslateChrome: canTranslate, translatingChrome, translateChrome,
    detectedFramework, detectedHosting,
    externalStyles, externalScripts, fontLinks, addFontLink,
    nativeCardActive: !!blogSignature?.card,
    nativeCardColumns: blogSignature?.card?.columns ?? null,
    clearNativeCard: () => setBlogSignature(null),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useThemeStudio(): ThemeStudio {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useThemeStudio must be used within ThemeStudioProvider')
  return ctx
}
