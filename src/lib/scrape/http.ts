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

// ─── Charset-aware decoding ───────────────────────────────────────────────────
// Per the Fetch spec, Response.text() ALWAYS decodes as UTF-8, ignoring the
// page's declared charset — so a Latin-1 / Windows-1252 site (still common on
// older CMSs and many Catalan/Spanish SMB sites) comes back as mojibake ("Ã©"
// instead of "é"). We read the raw bytes and decode with the real charset,
// sniffed in spec order: a BOM, then the Content-Type header, then a
// <meta charset> in the first bytes.

function normalizeCharsetLabel(cs: string): string {
  const c = cs.toLowerCase().trim().replace(/["']/g, '')
  if (c === 'latin1' || c === 'iso8859-1' || c === 'iso_8859-1' || c === 'iso-8859-1' || c === 'cp1252') return 'windows-1252'
  if (c === 'utf8') return 'utf-8'
  return c
}

function sniffCharset(bytes: Uint8Array, contentType: string | null): string {
  // 1. Byte-order mark
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  // 2. Content-Type response header
  const fromHeader = contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
  if (fromHeader) return normalizeCharsetLabel(fromHeader)
  // 3. <meta charset> / <meta http-equiv> in the first few KB (read as latin1)
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096))
  const metaCharset = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]
  if (metaCharset) return normalizeCharsetLabel(metaCharset)
  const httpEquiv = head.match(/<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset=([\w-]+)/i)?.[1]
  if (httpEquiv) return normalizeCharsetLabel(httpEquiv)
  return 'utf-8'
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    // Unknown/unsupported label → fall back to a lenient UTF-8 decode.
    return new TextDecoder('utf-8').decode(bytes)
  }
}

// Classic UTF-8-misread-as-Windows-1252 mojibake: `é` (UTF-8 bytes C3 A9) was
// decoded as Latin-1, producing the literal two-char sequence "Ã©". This
// happens when a site emits UTF-8 bytes but mis-declares its charset (or has
// none and the sniffer fell back wrong). Cheap, idempotent recovery: bytes ←
// chars, then decode-as-UTF-8 in fatal mode; if it round-trips cleanly, the
// bug is real and the fixed text replaces the original.
const MOJIBAKE_RE = /Ã[©¨¡­³ºñÑç§«¬®¯°±´µ¶·¸¹¼½¾¿-]|Â[ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]|â[-]/

export function looksLikeMojibake(s: string): boolean {
  return MOJIBAKE_RE.test(s)
}

export function fixMojibake(s: string): string {
  if (!looksLikeMojibake(s)) return s
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i)
    if (cp > 0xff) return s // contains chars outside Latin-1 — not single-pass mojibake
    bytes[i] = cp
  }
  try {
    const recovered = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // Only accept the recovery if it actually removed the mojibake pattern.
    return looksLikeMojibake(recovered) ? s : recovered
  } catch {
    return s
  }
}

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
    const bytes = new Uint8Array(await res.arrayBuffer())
    const raw = decodeBytes(bytes, sniffCharset(bytes, res.headers.get('content-type')))
    // Defense-in-depth: if the page mis-declared its charset and we ended up
    // with "Ã©"-style mojibake, recover it (UTF-8 bytes-as-Latin-1 → re-decode
    // as UTF-8). No-op when the text is already clean.
    const body = fixMojibake(raw)
    return { body, headers: res.headers }
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

// ─── HTML entity decoding ─────────────────────────────────────────────────────
// Plain-text fields pulled from sources (WordPress REST `title.rendered` /
// `excerpt.rendered`, RSS titles, etc.) arrive HTML-entity-encoded ("Comuni&#243;",
// "Mar&iacute;a", "&amp;", "&#8217;"). Stored and shown as TEXT they'd display the
// raw entity, so we decode them. Covers numeric (decimal + hex) entities plus the
// common named ones.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', minus: '−',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', prime: '′', Prime: '″',
  copy: '©', reg: '®', trade: '™', deg: '°', euro: '€', pound: '£', cent: '¢', yen: '¥',
  middot: '·', bull: '•', times: '×', divide: '÷', frac12: '½', frac14: '¼', frac34: '¾',
  // Common accented letters (most sources emit these as literal UTF-8, but a few encode them).
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç',
  uuml: 'ü', Uuml: 'Ü', ouml: 'ö', Ouml: 'Ö', auml: 'ä', Auml: 'Ä',
  iuml: 'ï', Iuml: 'Ï', euml: 'ë', Euml: 'Ë', acirc: 'â', ecirc: 'ê', ocirc: 'ô',
  ordf: 'ª', ordm: 'º', iexcl: '¡', iquest: '¿', shy: '­',
}

function codePointToString(cp: number): string | null {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return null
  // Windows-1252 mis-numbered "entities" (e.g. &#146; for ’) — remap the gap.
  const W1252: Record<number, number> = {
    128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026, 134: 0x2020,
    135: 0x2021, 136: 0x02c6, 137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152,
    142: 0x017d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022,
    150: 0x2013, 151: 0x2014, 152: 0x02dc, 153: 0x2122, 154: 0x0161, 155: 0x203a,
    156: 0x0153, 158: 0x017e, 159: 0x0178,
  }
  const real = W1252[cp] ?? cp
  try { return String.fromCodePoint(real) } catch { return null }
}

// HTML entity names we MUST keep encoded — they're structural markup, not
// accent/text characters. Decoding `&amp;` in `<a href="?a=1&amp;b=2">` would
// break the URL, etc. Everything else (named accents, numeric ≥0x80) is fair
// game because it never serves a structural purpose.
const STRUCTURAL_ENTITY_NAMES = new Set(['amp', 'lt', 'gt', 'quot', 'apos'])

/**
 * Decode ONLY accent/text entities in an HTML fragment — leave structural ones
 * (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`) intact. Use on LLM output where the
 * model has serialized accented letters as numeric entities (`&#xe9;`) or
 * named entities (`&eacute;`) instead of literal UTF-8.
 */
export function decodeAccentEntitiesInHtml(s: string): string {
  if (!s || s.indexOf('&') === -1) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, ent: string) => {
    if (ent[0] === '#') {
      const cp = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10)
      // Only touch chars outside the structural-ASCII range — keep &#34;, &#38; etc.
      if (cp < 0x80) return m
      return codePointToString(cp) ?? m
    }
    if (STRUCTURAL_ENTITY_NAMES.has(ent)) return m
    return NAMED_ENTITIES[ent] ?? m
  })
}

/** Decode HTML entities (numeric decimal/hex + common named) in a plain-text string. */
export function decodeEntities(s: string): string {
  if (!s || s.indexOf('&') === -1) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, ent: string) => {
    if (ent[0] === '#') {
      const cp = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10)
      return codePointToString(cp) ?? m
    }
    return NAMED_ENTITIES[ent] ?? m
  })
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
