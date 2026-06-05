// Smart blog detection + native "article card" cloning.
//
// GOAL 2 of the Theme Grabber: make the clone aware of the client's EXISTING
// content design.
//   · Detect whether the site has a blog/news index (and where it is).
//   · Find the repeating "article card" pattern on that index — a set of ≥3
//     structurally-identical sibling elements that each wrap a link + image +
//     heading (the hallmark of a post card, NOT a nav menu).
//   · Derive a CardStyle spec from the matched classes' CSS + the cards' own
//     markup (columns, gap, radius, border, shadow, image aspect ratio, title
//     type). The render then styles OUR feed to mirror it 1:1.
//
// Honest scope: with NO headless browser (a deliberate project constraint) we
// can't read *computed* styles. We approximate from the fetched CSS (matched by
// class) + structural signals (img width/height → aspect ratio, card count →
// columns). Anything we can't read cleanly is omitted and the renderer falls back
// to its premium defaults / design tokens. Pure + dependency-light (node-html-
// parser), so it's unit-testable with no network.

import { type HTMLElement } from 'node-html-parser'

export type CardStyle = {
  columns?: number          // desktop column count (1..4)
  gap?: string              // grid gap, e.g. '1.5rem'
  radius?: string           // card border-radius
  border?: string           // card border shorthand
  shadow?: string           // card box-shadow
  background?: string       // card background
  padding?: string          // card inner padding
  imageAspect?: string      // media aspect-ratio, e.g. '16/9'
  titleSize?: string        // card title font-size
  titleWeight?: string      // card title font-weight
  titleColor?: string       // card title color
}

export type BlogSignature = {
  hasBlog: boolean
  blogUrl: string | null
  card: CardStyle | null
}

export const EMPTY_BLOG_SIGNATURE: BlogSignature = { hasBlog: false, blogUrl: null, card: null }

// ─── DOM helpers (node-html-parser) ────────────────────────────────────────────

const isEl = (n: unknown): n is HTMLElement =>
  !!n && typeof (n as HTMLElement).tagName === 'string'

const tagOf = (el: HTMLElement): string => (el.tagName || '').toLowerCase()
const classesOf = (el: HTMLElement): string[] =>
  (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

function elementChildren(el: HTMLElement): HTMLElement[] {
  return (el.childNodes as unknown[]).filter(isEl) as HTMLElement[]
}

function walkEls(root: HTMLElement, visit: (el: HTMLElement) => void): void {
  for (const c of elementChildren(root)) { visit(c); walkEls(c, visit) }
}

// First descendant whose tag is in `tags` (depth-first), or null.
function firstByTag(el: HTMLElement, tags: Set<string>): HTMLElement | null {
  let hit: HTMLElement | null = null
  walkEls(el, n => { if (!hit && tags.has(tagOf(n))) hit = n })
  return hit
}
const hasByTag = (el: HTMLElement, tags: Set<string>): boolean => firstByTag(el, tags) !== null

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const MEDIA = new Set(['img', 'picture', 'figure', 'svg'])

function inChrome(el: HTMLElement): boolean {
  let p = el.parentNode as HTMLElement | null
  while (p && isEl(p)) {
    const t = tagOf(p)
    if (t === 'header' || t === 'footer' || t === 'nav') return true
    p = p.parentNode as HTMLElement | null
  }
  return false
}

// Structural signature of a child: tag + its two most distinctive classes. Cards
// in a grid share this exactly; we group siblings by it to find the repeat.
function signatureOf(el: HTMLElement): string {
  const cls = classesOf(el)
    .filter(c => !/^(active|current|first|last|odd|even|selected)$/i.test(c))
    .slice(0, 2)
    .sort()
    .join('.')
  return cls ? `${tagOf(el)}.${cls}` : tagOf(el)
}

// ─── Blog index URL detection ───────────────────────────────────────────────

// A blog word as a WHOLE path segment (strongest signal — "/blog", "/noticies").
const BLOG_SEG =
  /^(blog|bloc|news|noticies|not[ií]cies|noticias|actualitat|actualidad|articles?|art[ií]culos?|premsa|prensa|press|journal|magazine|revista|stories|insights|updates|novetats|novedades)$/i
// The same words as a nav-link LABEL (short, exact-ish).
const BLOG_WORD =
  /^(blog|bloc|news|not[ií]cies|noticias|actualitat|actualidad|articles?|art[ií]culos?|premsa|prensa|press|journal|magazine|revista|stories|insights|el blog|notícies|the blog)$/i

function inHeaderNav(el: HTMLElement): boolean {
  let p = el.parentNode as HTMLElement | null
  while (p && isEl(p)) {
    const t = tagOf(p)
    if (t === 'header' || t === 'nav') return true
    p = p.parentNode as HTMLElement | null
  }
  return false
}

/**
 * STRICT blog/news index URL detection — tightened so it stops guessing wrong
 * pages. A candidate must clear a real threshold built from strong signals only:
 * a blog word as a WHOLE path segment, a clean top-level path, an exact nav-link
 * label, and living in the primary nav. Article-looking URLs (dated or deep) are
 * penalised hard, and the homepage is never the index. Returns null when nothing
 * is confident enough — the caller then relies on the user-provided Blog URL.
 */
export function findBlogIndexUrl(root: HTMLElement, base: URL): string | null {
  const anchors = root.querySelectorAll('a')
  let best: { url: string; score: number } | null = null
  for (const a of anchors) {
    const href = a.getAttribute('href')
    if (!href) continue
    let u: URL
    try { u = new URL(href, base) } catch { continue }
    if (u.origin !== base.origin) continue                 // same-site only
    if (!/^https?:/.test(u.protocol)) continue
    const segs = u.pathname.toLowerCase().split('/').filter(Boolean)
    if (segs.length === 0) continue                         // the homepage isn't an index
    const text = (a.text || '').replace(/\s+/g, ' ').trim().toLowerCase()

    // Reject obvious ARTICLE permalinks (a date segment, or a deep/sluggy path).
    const looksLikeArticle =
      segs.some(s => /^\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s)) || segs.length >= 3

    let score = 0
    if (segs.some(s => BLOG_SEG.test(s))) score += 5        // whole-segment blog word
    if (segs.length === 1 && BLOG_SEG.test(segs[0])) score += 4 // clean top-level /blog
    if (text && BLOG_WORD.test(text)) score += 3            // exact nav label
    if (inHeaderNav(a)) score += 2                          // a real primary-nav section link
    if (looksLikeArticle) score -= 6

    // Threshold 6 ⇒ needs at least a segment match + a corroborating signal; a
    // random page link can never reach it (no hallucinated guesses).
    if (score >= 6 && (!best || score > best.score)) best = { url: u.toString(), score }
  }
  return best?.url ?? null
}

// ─── Card pattern detection ───────────────────────────────────────────────────

type CardPattern = {
  container: HTMLElement
  cards: HTMLElement[]
  containerClass: string | null
  cardClass: string | null
  titleEl: HTMLElement | null
  imageEl: HTMLElement | null
}

const firstClass = (el: HTMLElement | null): string | null => (el ? classesOf(el)[0] ?? null : null)

/**
 * Find the dominant repeating article-card grid: the container whose children
 * share a signature, appear ≥3 times, and each look like a post card (link +
 * media + heading). Scored by repeat count × richness; chrome is excluded.
 */
export function detectCardPattern(root: HTMLElement): CardPattern | null {
  const body = root.querySelector('body') ?? root
  const candidates: Array<{ pattern: CardPattern; score: number }> = []
  const consider = (pattern: CardPattern, score: number) => { candidates.push({ pattern, score }) }

  walkEls(body, container => {
    if (inChrome(container)) return
    const kids = elementChildren(container)
    if (kids.length < 3) return

    // Group children by signature.
    const groups = new Map<string, HTMLElement[]>()
    for (const k of kids) {
      const sig = signatureOf(k)
      const g = groups.get(sig) ?? []
      g.push(k)
      groups.set(sig, g)
    }
    for (const [, group] of groups) {
      if (group.length < 3) continue
      // Each card should wrap a link AND (media OR heading) AND some text.
      const rich = group.filter(c =>
        hasByTag(c, new Set(['a'])) &&
        (hasByTag(c, MEDIA) || hasByTag(c, HEADINGS)) &&
        (c.text || '').trim().length > 0,
      )
      if (rich.length < 3) continue
      const sample = rich[0]
      const withMedia = rich.filter(c => hasByTag(c, MEDIA)).length
      const withHeading = rich.filter(c => hasByTag(c, HEADINGS)).length
      // Score: more cards is better; media + headings strongly signal post cards.
      const score = rich.length * (1 + withMedia / rich.length) * (1 + (withHeading / rich.length) * 0.6)
      consider({
        container,
        cards: rich,
        containerClass: firstClass(container),
        cardClass: firstClass(sample),
        titleEl: firstByTag(sample, HEADINGS),
        imageEl: firstByTag(sample, new Set(['img'])),
      }, score)
    }
  })

  if (!candidates.length) return null
  return candidates.reduce((a, b) => (b.score > a.score ? b : a)).pattern
}

// ─── CSS-based style extraction (heuristic) ────────────────────────────────────

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// The LAST rule block whose selector text references `.class` (later rules tend to
// win the cascade). Naive — ignores specificity/media — but solid for a heuristic.
function lastRuleBlock(css: string, cls: string): string | null {
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\.${esc}(?![\\w-])[^{}]*\\{([^{}]*)\\}`, 'gi')
  let m: RegExpExecArray | null
  let last: string | null = null
  while ((m = re.exec(css)) !== null) last = m[1]
  return last
}

function decl(block: string | null, prop: string): string | null {
  if (!block) return null
  const m = block.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))
  return m ? m[1].trim().replace(/!important/i, '').trim() : null
}

// Reduce e.g. 1600/900 → 16/9 for a tidy aspect-ratio.
function ratio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(w, h) || 1
  return `${w / g}/${h / g}`
}

function imageAspect(card: HTMLElement, imageEl: HTMLElement | null, css: string): string | undefined {
  // 1. <img width height> attributes — the most reliable signal.
  if (imageEl) {
    const w = parseInt(imageEl.getAttribute('width') ?? '', 10)
    const h = parseInt(imageEl.getAttribute('height') ?? '', 10)
    if (w > 0 && h > 0 && w < 10000 && h < 10000) return ratio(w, h)
  }
  // 2. aspect-ratio declared on the card's media class.
  for (const c of classesOf(card)) {
    const ar = decl(lastRuleBlock(css, c), 'aspect-ratio')
    if (ar && /^[\d.]+\s*[/ ]\s*[\d.]+$/.test(ar)) return ar.replace(/\s+/g, '').replace('/', '/')
  }
  return undefined
}

const isNum = (v: string | null): v is string => !!v && /^-?[\d.]+(px|rem|em|%|vw|vh)?$/.test(v.trim())

/** Derive a CardStyle from the detected pattern + the site's CSS. */
export function extractCardStyle(pattern: CardPattern, cssTexts: string[]): CardStyle {
  const css = stripComments(cssTexts.join('\n'))
  const style: CardStyle = {}

  // ── Container layout (grid columns + gap) ──
  const contBlock = pattern.containerClass ? lastRuleBlock(css, pattern.containerClass) : null
  const cols = decl(contBlock, 'grid-template-columns')
  if (cols) {
    const rep = cols.match(/repeat\(\s*(\d+)/i)
    if (rep) style.columns = Math.min(4, Math.max(1, parseInt(rep[1], 10)))
    else {
      const tracks = cols.trim().split(/\s+/).filter(Boolean).length
      if (tracks >= 1 && tracks <= 6) style.columns = Math.min(4, tracks)
    }
  }
  // Fall back to the observed card count (capped) when CSS has no explicit columns.
  if (!style.columns) style.columns = Math.min(4, Math.max(1, pattern.cards.length >= 4 ? 3 : pattern.cards.length))
  const gap = decl(contBlock, 'gap') ?? decl(contBlock, 'grid-gap') ?? decl(contBlock, 'column-gap')
  if (gap && isNum(gap.split(/\s+/)[0])) style.gap = gap.split(/\s+/)[0]

  // ── Card box (border / radius / shadow / background / padding) ──
  const cardBlock = pattern.cardClass ? lastRuleBlock(css, pattern.cardClass) : null
  const radius = decl(cardBlock, 'border-radius')
  if (radius && isNum(radius.split(/\s+/)[0])) style.radius = radius.split(/\s+/)[0]
  const border = decl(cardBlock, 'border')
  if (border && /\d/.test(border) && /solid|dashed|dotted/i.test(border)) style.border = border
  const shadow = decl(cardBlock, 'box-shadow')
  if (shadow && shadow.toLowerCase() !== 'none' && shadow.length < 120) style.shadow = shadow
  const bg = decl(cardBlock, 'background-color') ?? decl(cardBlock, 'background')
  if (bg && /^(#|rgb|hsl)/i.test(bg)) style.background = bg
  const padding = decl(cardBlock, 'padding')
  if (padding && isNum(padding.split(/\s+/)[0])) style.padding = padding

  // ── Media aspect ratio ──
  const aspect = imageAspect(pattern.cards[0], pattern.imageEl, css)
  if (aspect) style.imageAspect = aspect

  // ── Title typography ──
  if (pattern.titleEl) {
    const tClass = classesOf(pattern.titleEl)[0]
    const tBlock = tClass ? lastRuleBlock(css, tClass) : null
    const size = decl(tBlock, 'font-size')
    if (size && isNum(size)) style.titleSize = size
    const weight = decl(tBlock, 'font-weight')
    if (weight && /^[1-9]00$|^(bold|normal|bolder|lighter)$/i.test(weight.trim())) {
      style.titleWeight = weight.toLowerCase() === 'bold' ? '700' : weight.toLowerCase() === 'normal' ? '400' : weight
    }
    const color = decl(tBlock, 'color')
    if (color && /^(#|rgb|hsl)/i.test(color)) style.titleColor = color
  }

  return style
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Build the blog signature for a captured page. `root` is the parsed reference
 * page; `cssTexts` the CSS already fetched for token extraction. `blogRoot`, when
 * provided, is the separately-fetched blog index (so cards are detected there if
 * the reference page itself isn't a listing).
 */
export function detectBlogSignature(opts: {
  root: HTMLElement
  cssTexts: string[]
  base: URL
  blogRoot?: HTMLElement | null
  /** User-supplied Blog URL — trusted over the heuristic guess (the fallback the
   *  scraper relies on when auto-detection is unsure). */
  blogUrlOverride?: string | null
}): BlogSignature {
  const { root, cssTexts, base, blogRoot, blogUrlOverride } = opts
  const override = (blogUrlOverride ?? '').trim()
  const blogUrl = override || findBlogIndexUrl(root, base)

  // Prefer detecting cards on the blog index (when we fetched one), else the page.
  const pattern = (blogRoot && detectCardPattern(blogRoot)) || detectCardPattern(root)
  const card = pattern ? extractCardStyle(pattern, cssTexts) : null

  return {
    hasBlog: !!blogUrl || !!pattern,
    blogUrl: blogUrl || null,
    card,
  }
}
