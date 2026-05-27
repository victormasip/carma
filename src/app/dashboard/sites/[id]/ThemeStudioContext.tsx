'use client'

// Real-time theme studio state — the single source of truth shared by the
// "Tema" editor tab and the "Connexió" embed tab. There is NO save button:
// every edit flows into this state and a debounced effect persists it via the
// saveTheme server action. The live embed snippet reads the same tokens, so it
// updates the instant the editor does.

import {
  createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode,
} from 'react'
import { saveTheme, deleteTheme, translateChrome as translateChromeAction, type ThemeData } from '@/lib/actions/theme'
import { addSiteLocale } from '@/lib/actions/locales'
import { DEFAULT_LOCALE, LOCALES, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'

type ChromeI18n = Record<string, { header?: string; footer?: string; section_title?: string }>

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
  section_title?: string | null
  default_locale?: string | null
  chrome_i18n?: ChromeI18n | null
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
  section_title?: string | null
  detected_locale?: string | null
  error?: string
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type ThemeStudio = {
  siteId: string
  // identity / lifecycle
  hasTheme: boolean
  saveStatus: SaveStatus
  // capture
  url: string
  setUrl: (v: string) => void
  analyzing: boolean
  error: string | null
  grab: () => Promise<void>
  removeTheme: () => Promise<void>
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
}

const Ctx = createContext<ThemeStudio | null>(null)

const AUTOSAVE_MS = 700

export function ThemeStudioProvider({
  siteId, initialTheme, children, defaultLocale: defaultLocaleProp, canTranslate = false,
}: {
  siteId: string
  initialTheme: Theme | null
  children: ReactNode
  defaultLocale?: string
  canTranslate?: boolean
}) {
  const [active, setActive] = useState(!!initialTheme)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // The locale the BASE chrome (extracted_* / section_title) represents. Other
  // locales live in chromeI18n. editLocale is which one the UI is editing.
  const chromeDefaultLocale = normalizeLocale(defaultLocaleProp ?? initialTheme?.default_locale, DEFAULT_LOCALE)
  const [editLocale, setEditLocale] = useState<Locale>(chromeDefaultLocale)
  const [chromeI18n, setChromeI18n] = useState<ChromeI18n>(initialTheme?.chrome_i18n ?? {})
  const [translatingChrome, setTranslatingChrome] = useState(false)

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
  const [sectionTitle, setSectionTitle] = useState(initialTheme?.section_title ?? '')

  const setToken = useCallback(
    <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) =>
      setTokens(t => ({ ...t, [key]: value })),
    [],
  )

  const buildThemeData = useCallback((): ThemeData => ({
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
    section_title: sectionTitle.trim() || null,
    chrome_i18n: chromeI18n,
  }), [
    url, extractedHead, extractedHeader, extractedFooter, extractedScripts,
    externalStyles, externalScripts, fontLinks, baseUrl, detectedFramework,
    detectedHosting, tokens, sectionTitle, chromeI18n,
  ])

  // ── Debounced real-time autosave ──
  // We serialize the payload and persist it AUTOSAVE_MS after the last change.
  // The first run is skipped so simply opening an existing theme doesn't write.
  const serialized = JSON.stringify(buildThemeData())
  const firstRun = useRef(true)
  const reqId = useRef(0)

  useEffect(() => {
    if (!active) return
    if (firstRun.current) { firstRun.current = false; return }

    setSaveStatus('saving')
    const id = ++reqId.current
    const handle = setTimeout(async () => {
      const result = await saveTheme(siteId, JSON.parse(serialized) as ThemeData)
      // Ignore a stale response if a newer edit superseded this save.
      if (id !== reqId.current) return
      setSaveStatus(result.error ? 'error' : 'saved')
    }, AUTOSAVE_MS)

    return () => clearTimeout(handle)
  }, [serialized, active, siteId])

  const grab = useCallback(async () => {
    const target = url.trim()
    if (!target) return
    setAnalyzing(true)
    setError(null)
    // The LLM reconstruction can take 15-40s; abort if it hangs past 90s so the
    // UI never gets stuck on "analitzant" if the API/scraper stalls.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const res = await fetch('/api/theme/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
        signal: controller.signal,
      })

      // Guard against malformed/empty bodies (e.g. a proxy 502 HTML page).
      let data: AnalyzeResponse
      try {
        data = await res.json()
      } catch {
        setError('La resposta del servidor no és vàlida. Torna-ho a provar d’aquí una estona.')
        return
      }

      if (!res.ok) { setError(data?.error ?? `Error del servidor (${res.status}).`); return }
      // The reconstruction must at least return a header or footer to be usable.
      if (!data || (!data.extracted_header && !data.extracted_footer && !data.tokens)) {
        setError('No s’ha pogut analitzar aquesta web (potser bloqueja els bots). Prova una altra URL.')
        return
      }

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
      // Preserve any layout the user already chose; refresh the visual tokens.
      setTokens(prev => ({ ...DEFAULT_TOKENS, ...(data.tokens ?? {}), layout: prev.layout, columns: prev.columns }))
      setSectionTitle(data.section_title ?? '')
      // A fresh capture replaces the base chrome → old translations are stale.
      setChromeI18n({})
      setEditLocale(chromeDefaultLocale)
      setActive(true)
      // Add the detected site language as an AVAILABLE locale (non-destructive):
      // we don't force it as the default, so a mislabeled <html lang="en"> on a
      // Catalan site can't hijack the base language — Catalan stays the default.
      if (data.detected_locale) void addSiteLocale(siteId, data.detected_locale).catch(() => {})
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'AbortError'
          ? 'La captura ha trigat massa (timeout). Torna-ho a provar.'
          : 'Error de xarxa. Comprova la connexió i torna-ho a provar.',
      )
    } finally {
      clearTimeout(timeout)
      setAnalyzing(false)
    }
  }, [url, siteId, chromeDefaultLocale])

  const removeTheme = useCallback(async () => {
    const result = await deleteTheme(siteId)
    if (result.error) { setSaveStatus('error'); return }
    // Reset to a pristine, inactive studio; the autosave guard (active=false)
    // prevents this reset from writing anything back.
    firstRun.current = true
    setActive(false)
    setSaveStatus('idle')
    setExtractedHead(''); setExtractedHeader(''); setExtractedFooter(''); setExtractedScripts('')
    setExternalStyles([]); setExternalScripts([]); setFontLinks([]); setBaseUrl('')
    setDetectedFramework(null); setDetectedHosting(null)
    setTokens({ ...DEFAULT_TOKENS })
    setSectionTitle('')
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
    url, setUrl, analyzing, error, grab, removeTheme,
    tokens, setToken,
    sectionTitle: sectionForLocale, setSectionTitle: setSectionForLocale,
    extractedHeader: headerForLocale, setExtractedHeader: setHeaderForLocale,
    extractedFooter: footerForLocale, setExtractedFooter: setFooterForLocale,
    editLocale, setEditLocale, editLocales: [...LOCALES], chromeDefaultLocale,
    canTranslateChrome: canTranslate, translatingChrome, translateChrome,
    detectedFramework, detectedHosting,
    externalStyles, externalScripts, fontLinks,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useThemeStudio(): ThemeStudio {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useThemeStudio must be used within ThemeStudioProvider')
  return ctx
}
