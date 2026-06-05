// Single source of truth for the platform's supported locales.
//
// Used by BOTH content localization (article i18n) and the dashboard UI
// dictionary. Add a locale here and it automatically appears as an editor
// language tab, a public blog switcher option, and a dashboard UI language.

export const LOCALES = ['ca', 'es', 'en'] as const
export type Locale = (typeof LOCALES)[number]

// Catalan-first product: the base/default app + generation locale is Catalan.
// Per-site this can be overridden by the language detected when capturing the
// client's site (stored on site_themes.default_locale).
export const DEFAULT_LOCALE: Locale = 'ca'

// Cookie the dashboard reads to pick the UI language (set by the switcher).
export const LOCALE_COOKIE = 'carma_locale'

type LocaleMeta = { label: string; native: string; flag: string }

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { label: 'English', native: 'English', flag: 'GB' },
  es: { label: 'Spanish', native: 'Español', flag: 'ES' },
  ca: { label: 'Catalan', native: 'Català', flag: 'CA' },
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

// Coerce any candidate (param, cookie, header) to a supported locale.
export function normalizeLocale(v: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (isLocale(v)) return v
  // Accept region-tagged values like "es-ES" → "es".
  if (typeof v === 'string') {
    const base = v.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return fallback
}
