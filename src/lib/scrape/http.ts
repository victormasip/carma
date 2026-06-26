// Shared HTTP + URL helpers for the scraping subsystems
// (article import: discover/crawl/preview/articles, and theme analysis).
//
// Previously these were copy-pasted into every route handler with subtly
// different timeouts and naming. Centralised here so behaviour is consistent
// and the SSRF guard lives in one place.

// Use a real browser User-Agent. A self-identifying "...Bot..." UA gets blocked
// outright by a large class of sites (WordPress security plugins, naive WAF rules,
// CDN bot filters), which made legitimate "clone my own site" captures fail with a
// 403. A browser UA maximizes capture success. (It does NOT defeat a Cloudflare /
// JS-challenge — those need the headless-browser provider, BROWSER_RENDER_URL.)
export const SCRAPER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
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

// Is a 32-bit IPv4 address (as a single unsigned int) in a private / loopback /
// link-local / reserved range that must never be reachable via SSRF?
function isPrivateIpv4(n: number): boolean {
  const a = (n >>> 24) & 0xff
  const b = (n >>> 16) & 0xff
  return (
    a === 0 ||                          // 0.0.0.0/8 "this network"
    a === 10 ||                         // 10.0.0.0/8 private
    a === 127 ||                        // 127.0.0.0/8 loopback
    (a === 169 && b === 254) ||         // 169.254.0.0/16 link-local (incl. cloud metadata)
    (a === 172 && b >= 16 && b <= 31) ||// 172.16.0.0/12 private
    (a === 192 && b === 168) ||         // 192.168.0.0/16 private
    (a === 100 && b >= 64 && b <= 127) ||// 100.64.0.0/10 CGNAT
    (a === 192 && b === 0) ||           // 192.0.0.0/24 IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
    a >= 224                            // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  )
}

// Parse a host that is an IPv4 literal in ANY of the forms a browser/libc accepts
// (dotted-decimal, dotted-hex/octal, and the 1/2/3-part shorthands, plus a single
// 32-bit decimal/hex), returning the 32-bit value — or null if it isn't IPv4.
// This is what closes the classic SSRF bypass where 169.254.169.254 is written as
// 0xa9fea9fe / 2852039166 / 0251.0376.0251.0376 to slip past a literal blocklist.
function parseIpv4(host: string): number | null {
  const parts = host.split('.')
  if (parts.length === 0 || parts.length > 4) return null

  const nums: number[] = []
  for (const p of parts) {
    if (p === '') return null
    let v: number
    if (/^0x[0-9a-f]+$/i.test(p)) v = parseInt(p, 16)
    else if (/^0[0-7]+$/.test(p)) v = parseInt(p, 8)
    else if (/^[0-9]+$/.test(p)) v = parseInt(p, 10)
    else return null
    if (!Number.isFinite(v) || v < 0) return null
    nums.push(v)
  }

  // The last part absorbs the remaining bytes (inet_aton semantics):
  // a       → 32-bit | a.b → b is 24-bit | a.b.c → c is 16-bit | a.b.c.d → 8-bit each.
  const last = nums[nums.length - 1]
  const lead = nums.slice(0, -1)
  if (lead.some(x => x > 0xff)) return null
  const maxLast = [0xffffffff, 0xffffff, 0xffff, 0xff][lead.length]
  if (last > maxLast) return null

  let n = last >>> 0
  for (let i = 0; i < lead.length; i++) {
    n = (n + (lead[i] * Math.pow(256, 4 - 1 - i))) >>> 0
  }
  return n >>> 0
}

// Extract an embedded IPv4 from an IPv4-mapped/compatible IPv6 host
// (::ffff:127.0.0.1 or its hex form ::ffff:7f00:1, and ::a.b.c.d), if present.
function embeddedIpv4FromIpv6(host: string): number | null {
  // Dotted IPv4 tail, e.g. ::ffff:169.254.169.254
  const dotted = host.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) return parseIpv4(dotted[1])
  // Hextet form ::ffff:a9fe:a9fe — take the final two 16-bit groups.
  const groups = host.split(':').filter(Boolean)
  if (groups.length >= 2) {
    const g1 = groups[groups.length - 2]
    const g2 = groups[groups.length - 1]
    if (/^[0-9a-f]{1,4}$/i.test(g1) && /^[0-9a-f]{1,4}$/i.test(g2)) {
      const hasMapped = /(?:^|:)0*f{4}:/i.test(host) || /^::/.test(host)
      if (hasMapped) return (((parseInt(g1, 16) << 16) >>> 0) + parseInt(g2, 16)) >>> 0
    }
  }
  return null
}

/**
 * SSRF guard: reject loopback / private / link-local / reserved destinations,
 * across every IP-literal encoding (dotted, decimal, hex, octal, IPv4-mapped
 * IPv6) — not just the canonical text form. This matters because several callers
 * are now reachable WITHOUT a trusted session (the public /api/onboarding/detect
 * + /preview funnel) or by any signed-up user (import/analyze), so an attacker
 * could otherwise pivot the server onto internal services or the cloud metadata
 * endpoint (169.254.169.254) by encoding the IP.
 *
 * Note: this is still a literal-host check and does NOT resolve DNS, so a public
 * hostname that resolves to a private IP (DNS rebinding) is not caught here. Full
 * protection would require DNS pinning at fetch time; that remains out of scope.
 */
export function isSafeUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!host) return false

    // Hostname blocklist (non-IP): loopback + mDNS/.local + internal TLDs.
    if (/^localhost$/.test(host) || /\.localhost$/.test(host) || /\.local$/.test(host)) return false
    if (/\.internal$/.test(host) || host === 'metadata' || host === 'metadata.google.internal') return false

    // IPv6 (contains a colon).
    if (host.includes(':')) {
      if (host === '::1' || host === '::') return false       // loopback / unspecified
      if (/^fe80:/.test(host)) return false                    // link-local fe80::/10
      if (/^f[cd][0-9a-f]{2}:/.test(host) || /^f[cd]:/.test(host)) return false // unique-local fc00::/7
      if (/^ff[0-9a-f]{0,2}:/.test(host)) return false         // multicast ff00::/8
      const mapped = embeddedIpv4FromIpv6(host)
      if (mapped !== null && isPrivateIpv4(mapped)) return false
      return true
    }

    // IPv4 in any encoding (dotted/decimal/hex/octal/shorthand).
    const v4 = parseIpv4(host)
    if (v4 !== null) return !isPrivateIpv4(v4)

    // A regular hostname.
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

// ─── Binary fetch (media download, SSRF-guarded, byte-capped) ─────────────────
// safeFetch decodes to text, follows redirects automatically, and reads the whole
// body with no size cap — none of which is safe for downloading media from a third
// party. safeFetchBinary streams with a hard byte cap and resolves redirects
// MANUALLY so the SSRF guard runs on every hop (auto-followed redirects would skip
// it), and it never forwards auth headers across a redirect (so a provider's
// credentials, e.g. Twilio Basic auth, never leak to the CDN/S3 it redirects to).

export type BinaryFetchOpts = {
  /** Sent only on the FIRST request; dropped on every redirect. */
  headers?: Record<string, string>
  /** Hard ceiling; the stream is aborted the instant it is exceeded. */
  maxBytes?: number
  timeout?: number
  /** Optional exact/suffix host allowlist, checked on the INITIAL url only. */
  allowHosts?: string[]
  maxRedirects?: number
}

export type BinaryFetchResult = { body: Uint8Array; contentType: string; finalUrl: string }

const DEFAULT_MAX_BINARY_BYTES = 25 * 1024 * 1024 // 25 MB

function hostAllowed(host: string, allow: string[]): boolean {
  const h = host.toLowerCase()
  return allow.some((a) => {
    const d = a.toLowerCase()
    return h === d || h.endsWith('.' + d)
  })
}

/**
 * Download a binary resource with an SSRF guard on every hop, a byte cap, and a
 * timeout. Returns null on any failure (blocked host, oversize, non-2xx, network).
 */
export async function safeFetchBinary(
  url: string,
  opts: BinaryFetchOpts = {},
): Promise<BinaryFetchResult | null> {
  const {
    headers,
    maxBytes = DEFAULT_MAX_BINARY_BYTES,
    timeout = DEFAULT_TIMEOUT,
    allowHosts,
    maxRedirects = 4,
  } = opts

  if (!isValidHttpUrl(url) || !isSafeUrl(url)) return null
  if (allowHosts?.length) {
    try {
      if (!hostAllowed(new URL(url).hostname, allowHosts)) return null
    } catch {
      return null
    }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    let current = url
    let sendHeaders: Record<string, string> | undefined = headers
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: { 'User-Agent': SCRAPER_UA, ...(sendHeaders ?? {}) },
      })

      // Manual redirect: re-validate the next URL, then drop auth before following.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return null
        let next: string
        try {
          next = new URL(loc, current).toString()
        } catch {
          return null
        }
        if (!isValidHttpUrl(next) || !isSafeUrl(next)) return null
        current = next
        sendHeaders = undefined
        continue
      }

      if (!res.ok || !res.body) return null

      // Cheap early reject when the server declares an oversize Content-Length.
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > maxBytes) return null

      // Stream with a hard cap so an oversize/chunked payload can't blow memory.
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel()
          return null
        }
        chunks.push(value)
      }

      const body = new Uint8Array(total)
      let off = 0
      for (const c of chunks) {
        body.set(c, off)
        off += c.byteLength
      }
      return {
        body,
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        finalUrl: current,
      }
    }
    return null // too many redirects
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
