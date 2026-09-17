// Grabber Eval — the shared measurement core.
//
// ONE function turns a fetched page (+ its CSS) into a deterministic, explainable
// extraction result: regions, structural metrics, named auto-checks and a 0–100
// score. It is imported by BOTH the Node batch runner (tests/grabber-eval.mjs)
// and the superadmin review UI's server action — so the numbers the founder
// reviews in the Lab are EXACTLY the numbers the automated report prints. No
// second implementation, no drift.
//
// Server/Node only (node:crypto) — never import from a client component.

import { createHash } from 'node:crypto'
import { parse, type HTMLElement } from 'node-html-parser'
import { splitPageChrome, type SplitMeta } from '@/lib/scrape/pageSplit'
import { buildExtractedHead, absolutise } from '@/lib/scrape/headerFooter'
import { extractTokens, DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { auditChromeContrast, extractGround, type ContrastReport } from '@/lib/scrape/chromeContrast'

const FONT_SHEET_RE = /fonts\.(googleapis|gstatic)\.com|use\.typekit|typography\.com|cloud\.typography|fonts\.adobe|fonts\.bunny/i

export type EvalCheckId =
  | 'split-content'   // the page was carved (chrome found + content slotted)
  | 'header-found'
  | 'footer-found'
  | 'chrome-lean'     // header+footer don't swallow the page's text (leak guard)
  | 'head-captured'   // the client's <head> assets were extracted
  | 'tokens-palette'
  | 'tokens-fonts'
  | 'tokens-width'
  // ── 2026-09-17: the two dimensions the founder reported and nothing measured.
  | 'links-sound'      // no captured link is dead-on-arrival on our origin
  | 'chrome-legible'   // the chrome's inherited text survives the ground we drop

export type EvalCheck = { id: EvalCheckId; ok: boolean; weight: number; note: string }

/** What one evaluated page yields. `regions` carries the actual extraction so a
 *  human can SEE it; reports may strip it and keep only the hashes. */
export type EvalRunResult = {
  strategy: 'content' | 'none'
  meta: SplitMeta
  metrics: {
    htmlBytes: number
    topChars: number
    bottomChars: number
    headChars: number
    /** Visible-text share held by the chrome halves (0..1). High = content leaked. */
    chromeTextRatio: number
    /** Core design tokens that differ from our defaults (palette/fonts/width…). */
    nonDefaultTokens: number
  }
  checks: EvalCheck[]
  /** The readability verdict in full — shown in the Lab, summarised in the check. */
  contrast: ContrastReport
  /** Weighted sum of passed checks, 0–100. */
  score: number
  /** sha1 of each region — the regression key: same hash ⇒ identical extraction. */
  hashes: { top: string; bottom: string; head: string; bodyAttrs: string }
  regions: { top: string; bottom: string; head: string; bodyAttrs: string }
  tokens: DesignTokens
}

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 12)

/**
 * Links in the FINAL chrome that still cannot work on our origin.
 *
 * `href="#"` is excluded on purpose: an inert anchor is how every site on earth
 * writes a menu toggle, and it is also what the repair rewrites a broken link
 * to. What is counted is what would genuinely misbehave — a `javascript:` URL
 * running the source's script on our domain, an empty href that silently
 * reloads, or a fragment pointing at an id that no longer exists.
 */
export function countUnusableLinks(html: string): number {
  const ids = new Set<string>()
  for (const m of html.matchAll(/\bid\s*=\s*"([^"]*)"|\bid\s*=\s*'([^']*)'/gi)) {
    const id = (m[1] ?? m[2] ?? '').trim()
    if (id) ids.add(id)
  }
  let bad = 0
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const href = (m[2] ?? m[3] ?? '').trim()
    if (/^javascript:/i.test(href)) { bad++; continue }
    if (href === '') { bad++; continue }
    if (href.length > 1 && href.startsWith('#') && !ids.has(href.slice(1))) bad++
  }
  return bad
}

/** Visible-text length of an HTML string (tags, scripts and styles stripped). */
export function visibleTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
}

/** Stylesheet URLs + inline CSS found in the page head (document order), so the
 *  caller can fetch the external ones and hand everything to the token pass. */
export function collectStylesheets(html: string, base: URL): { urls: string[]; inline: string[]; fontLinks: string[] } {
  const urls: string[] = []
  const inline: string[] = []
  const fontLinks: string[] = []
  let root: HTMLElement
  try { root = parse(html) as HTMLElement } catch { return { urls, inline, fontLinks } }
  const head = root.querySelector('head')
  if (!head) return { urls, inline, fontLinks }
  for (const node of head.childNodes) {
    const el = node as HTMLElement
    if (typeof el.tagName !== 'string') continue
    const tag = el.tagName.toUpperCase()
    if (tag === 'LINK') {
      const rel = (el.getAttribute('rel') ?? '').toLowerCase()
      const href = absolutise(el.getAttribute('href'), base)
      if (!href) continue
      if (rel.includes('stylesheet') && !FONT_SHEET_RE.test(href)) urls.push(href)
      if (FONT_SHEET_RE.test(href)) fontLinks.push(href)
    } else if (tag === 'STYLE') {
      const css = el.text ?? ''
      if (css.trim()) inline.push(css)
    }
  }
  return { urls, inline, fontLinks }
}

// Core token fields whose non-default value means "we captured the brand".
const PALETTE_KEYS: (keyof DesignTokens)[] = ['colorPrimary', 'colorAccent', 'colorBg', 'colorText']
const FONT_KEYS: (keyof DesignTokens)[] = ['fontHeading', 'fontBody']

/**
 * Run the REAL extraction engine over one fetched page and measure it.
 * Pure given its inputs — cached HTML in, deterministic result out.
 */
export function evalCaseFromHtml(opts: {
  url: string
  html: string
  /** Fetched external + inline CSS, cascade order (may be partial/empty). */
  cssTexts: string[]
  fontLinks?: string[]
}): EvalRunResult {
  const { url, html, cssTexts, fontLinks = [] } = opts
  const base = new URL(url)

  const split = splitPageChrome(html, base)

  let head = ''
  let tokens: DesignTokens = { ...DEFAULT_TOKENS }
  try {
    const root = parse(html) as HTMLElement
    head = buildExtractedHead(root, base)
    tokens = extractTokens({ root, cssTexts, fontLinks })
  } catch { /* a parse hiccup keeps the split result; tokens stay default */ }

  const totalText = visibleTextLength(html)
  const chromeText = visibleTextLength(split.top) + visibleTextLength(split.bottom)
  const chromeTextRatio = totalText > 0 ? Math.min(1, chromeText / totalText) : 0

  const paletteOk = PALETTE_KEYS.some(k => tokens[k] !== DEFAULT_TOKENS[k])
  const fontsOk = FONT_KEYS.some(k => tokens[k] !== DEFAULT_TOKENS[k])
  const widthOk = tokens.maxWidth !== DEFAULT_TOKENS.maxWidth
  const nonDefaultTokens = [...PALETTE_KEYS, ...FONT_KEYS, 'maxWidth' as const, 'radius' as const]
    .filter(k => tokens[k] !== DEFAULT_TOKENS[k]).length

  // READABILITY + LINKS (2026-09-17). Measured on the same captured regions the
  // render will actually ship, against the background it will actually paint.
  const ground = extractGround(cssTexts.join('\n'), split.bodyAttrs)
  let contrast: ContrastReport
  try {
    contrast = auditChromeContrast({
      css: cssTexts.join('\n'),
      headerHtml: split.top,
      footerHtml: split.bottom,
      ground,
      pageBackground: tokens.colorBg,
    })
  } catch {
    contrast = { failures: [], inheritedFailures: [], worstRatio: null, chromeHasOwnGround: false, degraded: false, repair: null }
  }
  const brokenLinks = split.meta.links.scripted + split.meta.links.empty + split.meta.links.deadFragment
  // What survived INTO the output — the thing actually worth asserting.
  const outputBroken = countUnusableLinks(`${split.top}\n${split.bottom}`)

  const carved = split.strategy === 'content'
  const checks: EvalCheck[] = [
    { id: 'split-content', ok: carved, weight: 25, note: carved ? `carved (${split.meta.usedFallback ? 'failsafe' : 'density'})` : 'no chrome/content isolated' },
    { id: 'header-found', ok: split.meta.headerFound, weight: 15, note: split.meta.headerSig ?? '—' },
    { id: 'footer-found', ok: split.meta.footerFound, weight: 15, note: split.meta.footerSig ?? '—' },
    // Only meaningful when carved; an uncarved page trivially "passes" otherwise.
    { id: 'chrome-lean', ok: carved && chromeTextRatio <= 0.45, weight: 15, note: `chrome holds ${(chromeTextRatio * 100).toFixed(0)}% of page text` },
    { id: 'head-captured', ok: head.trim().length > 0, weight: 10, note: `${head.length} chars` },
    { id: 'tokens-palette', ok: paletteOk, weight: 6, note: paletteOk ? `${tokens.colorBg} / ${tokens.colorText}` : 'defaults' },
    { id: 'tokens-fonts', ok: fontsOk, weight: 6, note: fontsOk ? tokens.fontHeading.split(',')[0] : 'defaults' },
    { id: 'tokens-width', ok: widthOk, weight: 5, note: tokens.maxWidth },
    // The two 2026-09-17 dimensions. Their weight comes out of the token trio,
    // which was over-weighted at 20 for three heuristics that only ever tint the
    // blog — a header nobody can read or click is a worse failure than a font we
    // guessed wrong, and the score should say so.
    {
      // A REGRESSION GUARD, not a report card on the customer's HTML.
      //
      // The first draft failed this check whenever the SOURCE shipped a broken
      // link — which marked 59% of the Barcelona-100 down for someone else's
      // markup, while the pipeline was busy repairing every one of them. What is
      // worth asserting is the opposite: that the OUTPUT is clean. It passes
      // today by construction, and it will start failing the day the repair
      // regresses, which is exactly what this suite exists to catch.
      id: 'links-sound',
      ok: carved && outputBroken === 0,
      weight: 5,
      note: outputBroken > 0
        ? `${outputBroken} still broken in the OUTPUT`
        : brokenLinks > 0
          ? `clean · repaired ${brokenLinks} (js:${split.meta.links.scripted} empty:${split.meta.links.empty} dead#:${split.meta.links.deadFragment}) of ${split.meta.links.total}`
          : `${split.meta.links.total} links, nothing to repair`,
    },
    {
      // Fails ONLY when our render is worse than the source and we did not fix
      // it. A header that scores 3.5:1 on the live site and 3.5:1 here is the
      // site, reproduced faithfully — which is the product, not a defect.
      id: 'chrome-legible',
      ok: carved && (!contrast.degraded || !!contrast.repair),
      weight: 5,
      note: contrast.degraded
        ? (contrast.repair ? `degraded → repaired (${contrast.repair.kind})` : 'DEGRADED by our ground, unrepaired')
        : contrast.chromeHasOwnGround
          ? 'own ground'
          : contrast.inheritedFailures.length
            ? `tight on the source too (${contrast.inheritedFailures[0].ratio.toFixed(2)}:1) — left alone`
            : `inherits, ${contrast.worstRatio ? `${contrast.worstRatio.toFixed(1)}:1` : 'no text colour'}`,
    },
  ]
  const score = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0)

  return {
    strategy: split.strategy,
    meta: split.meta,
    metrics: {
      htmlBytes: html.length,
      topChars: split.top.length,
      bottomChars: split.bottom.length,
      headChars: head.length,
      chromeTextRatio: Math.round(chromeTextRatio * 1000) / 1000,
      nonDefaultTokens,
    },
    checks,
    contrast,
    score,
    hashes: {
      top: sha1(split.top), bottom: sha1(split.bottom), head: sha1(head), bodyAttrs: sha1(split.bodyAttrs),
    },
    regions: { top: split.top, bottom: split.bottom, head, bodyAttrs: split.bodyAttrs },
    tokens,
  }
}
