// Brand Brain — website intake (server-only).
//
// The existing capture pipeline (`/api/theme/analyze`) reads a site to CLONE ITS
// LOOK. This reads the same site to understand what it SAYS: who they are, who
// they serve, and — most valuable of all — the exact sentences they write.
//
// It is deliberately a separate pass rather than a bolt-on to the clone: the clone
// needs one page's markup and its stylesheets, this needs the prose of several
// pages and none of the CSS. Merging them would make both slower and neither
// better.

import { parse, type HTMLElement } from 'node-html-parser'
import { safeFetch, isSafeUrl, isValidHttpUrl, decodeEntities } from '@/lib/scrape/http'
import type { BrandSource, BrandVisual } from './types'
import { emptyBrandVisual } from './types'

/** Home plus at most this many deep pages. Enough to learn a voice, cheap enough
 *  to finish while the owner is still watching the progress bar. */
const MAX_DEEP_PAGES = 5
const PER_PAGE_CHARS = 12_000
const TOTAL_CHARS = 60_000
const FETCH_TIMEOUT = 12_000

/** Elements that are chrome or furniture, never brand prose. */
const BOILERPLATE_SELECTOR =
  'script,style,noscript,nav,header,footer,aside,form,iframe,svg,button,select,[role="navigation"],[role="banner"],[role="contentinfo"],[aria-hidden="true"],.cookie,.cookies,#cookie,#cookies,.menu,.breadcrumb,.sidebar,.widget'

/**
 * Link text that means "this page explains who we are". Ordered by how much brand
 * voice such a page usually carries. Multilingual because the dataset is Catalan,
 * Spanish and English first.
 */
const ABOUT_PATTERNS: { re: RegExp; weight: number }[] = [
  { re: /\b(qui\s*som|quienes\s*somos|qui[eé]nes\s*somos|about\s*us|about|sobre\s*(nosaltres|nosotros)|nosaltres|nosotros)\b/i, weight: 10 },
  { re: /\b(hist[oò]ria|historia|our\s*story|story|filosofia|filosof[ií]a|valors|valores|values|manifest)\b/i, weight: 8 },
  { re: /\b(serveis|servicios|services|qu[eè]\s*fem|qu[eé]\s*hacemos|what\s*we\s*do|solucions|soluciones)\b/i, weight: 6 },
  { re: /\b(equip|equipo|team|clients|clientes|casos|projectes|proyectos|projects)\b/i, weight: 4 },
  { re: /\b(contacte|contacto|contact)\b/i, weight: 1 },
]

export type ScrapedPage = { url: string; title: string | null; text: string }

export type BrandScrapeResult = {
  pages: ScrapedPage[]
  sources: BrandSource[]
  visual: BrandVisual
  detectedLocale: string | null
  siteName: string | null
}

function absolute(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

/** Prose only: strip furniture, then read the blocks that carry sentences. */
function extractProse(root: HTMLElement): string {
  for (const el of root.querySelectorAll(BOILERPLATE_SELECTOR)) el.remove()
  const blocks: string[] = []
  for (const el of root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,figcaption,dd')) {
    const t = decodeEntities(el.text || '').replace(/\s+/g, ' ').trim()
    // Single words and nav crumbs are noise; a real sentence has some length.
    if (t.length < 25) continue
    blocks.push(t)
  }
  // De-duplicate: the same call-to-action often appears on every page.
  const seen = new Set<string>()
  const out: string[] = []
  for (const b of blocks) {
    const key = b.slice(0, 80).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(b)
  }
  return out.join('\n').slice(0, PER_PAGE_CHARS)
}

function metaContent(root: HTMLElement, names: string[]): string | null {
  for (const name of names) {
    const el =
      root.querySelector(`meta[property="${name}"]`) ??
      root.querySelector(`meta[name="${name}"]`)
    const v = el?.getAttribute('content')?.trim()
    if (v) return decodeEntities(v)
  }
  return null
}

/** Font families and brand colours, as HINTS for the distiller — not a spec. The
 *  authoritative visual tokens come from the clone pipeline. */
function visualHints(html: string, root: HTMLElement, base: URL): BrandVisual {
  const fonts = new Set<string>()
  for (const m of html.matchAll(/font-family\s*:\s*([^;}"']+)/gi)) {
    const first = m[1].split(',')[0]?.replace(/['"]/g, '').trim()
    if (first && first.length < 40 && !/^(inherit|initial|unset|var\()/i.test(first)) fonts.add(first)
    if (fonts.size >= 4) break
  }

  const counts = new Map<string, number>()
  for (const m of html.matchAll(/#[0-9a-f]{6}\b/gi)) {
    const c = m[0].toLowerCase()
    if (/^#(f{6}|0{6}|e{6}|c{6})$/.test(c)) continue
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c)

  const themeColor = metaContent(root, ['theme-color'])
  if (themeColor && /^#[0-9a-f]{3,8}$/i.test(themeColor)) colors.unshift(themeColor.toLowerCase())

  const logoEl =
    root.querySelector('header img[src], .logo img[src], [class*="logo"] img[src], img[alt*="logo" i]') ??
    root.querySelector('link[rel="apple-touch-icon"]')
  const logoRaw = logoEl?.getAttribute('src') ?? logoEl?.getAttribute('href') ?? null
  const logoUrl = logoRaw ? absolute(logoRaw, base) : (metaContent(root, ['og:image']) ?? null)

  return {
    fonts: [...fonts].slice(0, 4),
    colors: [...new Set(colors)].slice(0, 5),
    logoUrl,
    imageryStyle: null, // filled by the distiller from the prose, not guessed here
  }
}

/** Rank internal links by how likely the page is to explain the brand. */
function pickDeepLinks(root: HTMLElement, base: URL): string[] {
  const scored = new Map<string, number>()
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')
    if (!href) continue
    const abs = absolute(href, base)
    if (!abs) continue
    let u: URL
    try { u = new URL(abs) } catch { continue }
    // Same host only. A brand's voice is on their own site.
    if (u.hostname !== base.hostname) continue
    if (u.pathname === base.pathname || u.pathname === '/') continue
    // Skip obvious non-prose endpoints.
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|mp4|mp3)$/i.test(u.pathname)) continue
    if (/\/(wp-admin|wp-login|cart|checkout|account|login|privac|cookie|legal|avis|aviso)/i.test(u.pathname)) continue

    const label = `${a.text || ''} ${u.pathname}`
    let score = 0
    for (const { re, weight } of ABOUT_PATTERNS) if (re.test(label)) score = Math.max(score, weight)
    if (score === 0) continue
    // Shallow paths beat deep ones at the same score — /qui-som over /a/b/c/qui-som.
    const depth = u.pathname.split('/').filter(Boolean).length
    const key = u.toString()
    scored.set(key, Math.max(scored.get(key) ?? 0, score * 10 - depth))
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DEEP_PAGES)
    .map(([url]) => url)
}

async function fetchPage(url: string): Promise<{ html: string; root: HTMLElement } | null> {
  if (!isValidHttpUrl(url) || !isSafeUrl(url)) return null
  try {
    const res = await safeFetch(url, { timeout: FETCH_TIMEOUT })
    if (!res) return null
    const html = res.body
    if (!html || html.length < 200) return null
    return { html, root: parse(html) as unknown as HTMLElement }
  } catch {
    return null
  }
}

/**
 * Read a brand's website: home plus the pages that actually explain them.
 *
 * Every failure is survivable — an unreachable deep page just contributes nothing.
 * A completely unreachable home page returns an empty result and the caller falls
 * back to whatever the owner typed or said.
 */
export async function scrapeBrandSite(rawUrl: string): Promise<BrandScrapeResult> {
  const empty: BrandScrapeResult = {
    pages: [], sources: [], visual: emptyBrandVisual(), detectedLocale: null, siteName: null,
  }

  let base: URL
  try { base = new URL(rawUrl) } catch { return empty }

  const home = await fetchPage(base.toString())
  if (!home) return empty

  const title = decodeEntities(home.root.querySelector('title')?.text?.trim() ?? '') || null
  const siteName = metaContent(home.root, ['og:site_name', 'application-name']) ?? title
  const detectedLocale =
    home.root.querySelector('html')?.getAttribute('lang')?.slice(0, 2).toLowerCase() ??
    metaContent(home.root, ['og:locale'])?.slice(0, 2).toLowerCase() ??
    null

  // Visual hints come from the home page's markup BEFORE prose extraction strips
  // the header (which is where the logo lives).
  const visual = visualHints(home.html, parse(home.html) as unknown as HTMLElement, base)

  const deepLinks = pickDeepLinks(home.root, base)
  const homeText = extractProse(home.root)

  const pages: ScrapedPage[] = []
  const sources: BrandSource[] = []
  let budget = TOTAL_CHARS

  if (homeText) {
    pages.push({ url: base.toString(), title, text: homeText })
    sources.push({ kind: 'url', label: base.hostname, chars: homeText.length })
    budget -= homeText.length
  }

  // Sequential, not parallel: these are someone else's servers, and five polite
  // requests are worth more than five simultaneous ones that get rate-limited.
  for (const link of deepLinks) {
    if (budget <= 0) break
    const page = await fetchPage(link)
    if (!page) continue
    const text = extractProse(page.root).slice(0, budget)
    if (text.length < 200) continue
    const pageTitle = decodeEntities(page.root.querySelector('title')?.text?.trim() ?? '') || null
    pages.push({ url: link, title: pageTitle, text })
    let label: string
    try { label = new URL(link).pathname } catch { label = link }
    sources.push({ kind: 'url', label, chars: text.length })
    budget -= text.length
  }

  return { pages, sources, visual, detectedLocale, siteName }
}

// ─── Candidate verbatim sentences ─────────────────────────────────────────────

/** Sentences that are legal/UI furniture rather than brand voice. */
const NON_VOICE =
  /(cookie|privacitat|privacidad|privacy|termes|términos|terms|copyright|tots els drets|todos los derechos|all rights|pol[ií]tica|subscriu|suscr[ií]b|newsletter|accept[ao]|llegir m[eé]s|leer m[aá]s|read more|clica|haz clic|click here|javascript|\{\{|\}\})/i

/**
 * Pull sentences worth quoting VERBATIM, so the distiller only has to CHOOSE
 * rather than invent — which is what stops it paraphrasing the brand's own words
 * into generic marketing copy.
 *
 * A good exemplar is a complete sentence, long enough to carry rhythm, short
 * enough to be a few-shot example, and not legal boilerplate.
 */
export function candidateSentences(text: string, limit = 60): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split('\n')) {
    // Split on sentence enders, keeping the punctuation.
    for (const raw of rawLine.split(/(?<=[.!?])\s+/)) {
      const s = raw.replace(/\s+/g, ' ').trim()
      if (s.length < 45 || s.length > 240) continue
      if (NON_VOICE.test(s)) continue
      // Needs a verb-ish middle: a comma-separated list of services is not voice.
      if (!/\s[a-zà-ÿ]{2,}\s/i.test(s)) continue
      // Mostly-uppercase lines are headings or banners.
      const letters = s.replace(/[^a-zà-ÿ]/gi, '')
      if (letters.length > 0 && (s.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length) > 0.4) continue
      const key = s.slice(0, 60).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
      if (out.length >= limit) return out
    }
  }
  return out
}
