// Shared HTTP + URL helpers for the scraping subsystems
// (article import: discover/crawl/preview/articles, and theme analysis).
//
// Previously these were copy-pasted into every route handler with subtly
// different timeouts and naming. Centralised here so behaviour is consistent
// and the SSRF guard lives in one place.

export const SCRAPER_UA = 'Carma-CMS-Bot/1.0 (content & theme importer)'
export const DEFAULT_TIMEOUT = 12_000

/** Supported language codes detected from URLs (path segment or ?lang=). */
export const LANG_CODES = [
  'en', 'es', 'ca', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'zh', 'ja', 'ar', 'da', 'sv', 'no', 'fi',
]

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Best-effort SSRF guard: reject obvious loopback / private / link-local hosts.
 *
 * Note: this is a literal-hostname check and does NOT resolve DNS, so a public
 * hostname that resolves to a private IP is not caught here. Full protection
 * would require DNS pinning; that is out of scope for the current threat model
 * (superadmin-only, trusted operators).
 */
export function isSafeUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!host) return false

    // IPv4 + hostname ranges
    const blockedV4OrName = [
      /^localhost$/, /\.localhost$/, /\.local$/,
      /^127\./, /^0\.0\.0\.0$/, /^10\./,
      /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
    ]
    if (blockedV4OrName.some(r => r.test(host))) return false

    // IPv6: loopback / unspecified / link-local (fe80::/10) / unique-local (fc00::/7)
    if (host.includes(':')) {
      if (host === '::1' || host === '::') return false
      if (/^fe80:/.test(host)) return false
      if (/^f[cd][0-9a-f]{2}:/.test(host) || /^f[cd]:/.test(host)) return false
    }

    return true
  } catch {
    return false
  }
}

type FetchOpts = { accept?: string; timeout?: number }

/** Fetch a URL with a timeout. Returns body + headers, or null on any failure. */
export async function safeFetch(
  url: string,
  opts: FetchOpts = {},
): Promise<{ body: string; headers: Headers } | null> {
  const { accept = 'text/html,application/xml,*/*', timeout = DEFAULT_TIMEOUT } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': SCRAPER_UA, Accept: accept },
    })
    if (!res.ok) return null
    return { body: await res.text(), headers: res.headers }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Convenience wrapper returning only the response body text. */
export async function safeFetchText(url: string, opts: FetchOpts = {}): Promise<string | null> {
  const res = await safeFetch(url, opts)
  return res?.body ?? null
}

/** Fetch + parse JSON with a timeout. Returns null on any failure. */
export async function safeFetchJson(url: string, opts: { timeout?: number } = {}): Promise<unknown> {
  const { timeout = DEFAULT_TIMEOUT } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': SCRAPER_UA, Accept: 'application/json' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Detect a language code from a URL's ?lang= param or first path segment. */
export function detectLangFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const lang = u.searchParams.get('lang')?.toLowerCase()
    if (lang && LANG_CODES.includes(lang)) return lang
    const firstSeg = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase()
    if (firstSeg && LANG_CODES.includes(firstSeg)) return firstSeg
  } catch {
    /* ignore */
  }
  return null
}
