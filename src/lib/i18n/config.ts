// Single source of truth for the platform's locales.
//
// Two distinct sets, deliberately separated:
//
//   · UI_LOCALES  — the DASHBOARD CHROME languages. Each has a full hand-written
//                   dictionary in messages.ts, so the app UI can render in it.
//   · LOCALES     — the CONTENT locales an article / site can publish in. A
//                   superset of the UI locales: the importer detects these, the
//                   editor offers them as language tabs, the public blog switcher
//                   lists them, and AI translation targets them. They only need a
//                   display name (label/native/code), NOT a UI dictionary.
//
// Conflating the two was the root cause of the importer "only ever detects
// ca/es/en" bug: a French site's correct `<html lang="fr">` was detected and then
// discarded because `fr` wasn't a supported locale. Adding a content locale here
// (plus its LOCALE_META entry and a franc mapping in detect.ts) is all it takes to
// support a new publishing language.

// ── Dashboard UI languages (have a translated dictionary) ─────────────────────
export const UI_LOCALES = ['ca', 'es', 'en'] as const
export type UiLocale = (typeof UI_LOCALES)[number]

// ── Content / publishing languages (superset; Iberian + major EU first) ───────
export const LOCALES = ['ca', 'es', 'en', 'fr', 'de', 'it', 'pt', 'gl', 'eu', 'nl'] as const
export type Locale = (typeof LOCALES)[number]

// Catalan-first product: the base/default app + generation locale is Catalan.
// Per-site this can be overridden by the language detected when capturing the
// client's site (stored on site_themes.default_locale).
export const DEFAULT_LOCALE: Locale = 'ca'

// Cookie the dashboard reads to pick the UI language (set by the switcher).
export const LOCALE_COOKIE = 'carma_locale'

// label  — English name (used in AI translation prompts + tooltips)
// native — endonym, shown in selectors (the clear, unambiguous label)
// code   — short ISO chip text for compact pills (NOT a flag — Catalan, Basque
//          and Galician have no flag emoji, which is why fake "flag" text codes
//          used to leak into the UI as "CA CA")
type LocaleMeta = { label: string; native: string; code: string }

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  ca: { label: 'Catalan', native: 'Català', code: 'CA' },
  es: { label: 'Spanish', native: 'Español', code: 'ES' },
  en: { label: 'English', native: 'English', code: 'EN' },
  fr: { label: 'French', native: 'Français', code: 'FR' },
  de: { label: 'German', native: 'Deutsch', code: 'DE' },
  it: { label: 'Italian', native: 'Italiano', code: 'IT' },
  pt: { label: 'Portuguese', native: 'Português', code: 'PT' },
  gl: { label: 'Galician', native: 'Galego', code: 'GL' },
  eu: { label: 'Basque', native: 'Euskara', code: 'EU' },
  nl: { label: 'Dutch', native: 'Nederlands', code: 'NL' },
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

export function isUiLocale(v: unknown): v is UiLocale {
  return typeof v === 'string' && (UI_LOCALES as readonly string[]).includes(v)
}

// Coerce any candidate (param, cookie, header) to a supported content locale.
export function normalizeLocale(v: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (isLocale(v)) return v
  // Accept region-tagged values like "es-ES" / "fr_FR" → "es" / "fr".
  if (typeof v === 'string') {
    const base = v.toLowerCase().split(/[-_]/)[0]
    if (isLocale(base)) return base
  }
  return fallback
}

// Map any content locale onto the closest dashboard-UI locale, so the chrome
// always has a real dictionary to render even for a French/Italian/… content
// site. Iberian romance → Spanish; everything else → English.
const UI_FALLBACK: Record<Locale, UiLocale> = {
  ca: 'ca', es: 'es', en: 'en',
  gl: 'es', eu: 'es', pt: 'es', it: 'es', fr: 'es',
  de: 'en', nl: 'en',
}

export function uiLocale(v: unknown): UiLocale {
  if (isUiLocale(v)) return v
  const loc = normalizeLocale(v)
  return UI_FALLBACK[loc] ?? 'ca'
}
