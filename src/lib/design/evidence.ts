// THE EYE — W2.
//
// `scrape/tokens.ts` extracts VALUES. An art director needs JUDGEMENTS.
//
// The difference is the whole wave. "fontHeading: 'Fraunces', Georgia, serif" is a
// value; "a high-contrast display serif with an optical-size axis, which needs air
// and cannot carry a compact grid" is a judgement, and only the second one can be
// reasoned with. Same for colour: `#b5451f` is a value, "the brand colour, because
// it paints the logo and the primary button rather than because it appears 41 times
// in a border shorthand" is a judgement.
//
// THE FIELD THAT MAKES THIS PLAN HONEST
// ─────────────────────────────────────
// `sourceQuality`. A grabber that faithfully reproduces a bad 2011 website has
// failed the founder's brief — it has done its job and lost the customer. So the
// evidence carries a scored read of whether the source's DESIGN is worth
// inheriting at all, separate from whether its BRAND is:
//
//   inherit             the design is good. Reproduce it.
//   inherit-brand-only  keep the colour, the name and the voice. Replace the
//                       layout, the type and the spacing.
//   start-fresh         there is nothing here to carry forward but the name.
//
// That verdict is what picks a rung on the chrome ladder (plan §9.1), and it is
// the difference between a clone tool and a design tool.
//
// EVERYTHING HERE IS DETERMINISTIC AND BROWSER-FREE. No model, no network, no
// layout engine. Every number comes from markup and CSS we already parse, which is
// what lets `test:evidence` replay the cached corpus and get the same answer twice.

import { parse, type HTMLElement } from 'node-html-parser'
import {
  DEFAULT_TOKENS, extractTokens, rankBrandColors,
  type BrandColorHit, type DesignTokens,
} from '@/lib/scrape/tokens'
import { auditChromeContrast, extractGround, type ContrastReport } from '@/lib/scrape/chromeContrast'
import { detectBlogSignature, type BlogSignature } from '@/lib/scrape/blogDetect'
import { hexToOklch, ratioOrNull } from '@/lib/design/color'
import { FONT_IDS, font, type FontCategory } from '@/lib/design/fonts'
import type { Density, Register } from '@/lib/design/genome'

// ─── Typeface classification ─────────────────────────────────────────────────

export type TypeRead = {
  /** The first real family in the stack, as the site writes it. */
  family: string
  /** The full stack, unchanged — the renderer still needs it verbatim. */
  stack: string
  category: FontCategory
  /** Stroke contrast. `high` is what makes a face need air at small sizes. */
  contrast: 'low' | 'medium' | 'high'
  /** The catalogue id, when we host this exact face. Null ⇒ we must substitute. */
  catalogueId: string | null
  /** How the classification was reached. `heuristic` is the one to distrust. */
  source: 'catalogue' | 'known' | 'heuristic'
}

/**
 * The faces we recognise by name.
 *
 * Not a font catalogue — a CLASSIFIER. It exists so that a site using Playfair
 * Display and a site using Cormorant get the same judgement ("high-contrast
 * display serif") even though we host one and not the other, and so the art
 * director can reach for a sibling rather than falling back to system-ui.
 */
const KNOWN: Record<string, [FontCategory, 'low' | 'medium' | 'high']> = {
  // Grotesks and neo-grotesks
  helvetica: ['grotesk', 'low'], 'helvetica neue': ['grotesk', 'low'], arial: ['grotesk', 'low'],
  inter: ['sans', 'low'], roboto: ['sans', 'low'], 'open sans': ['sans', 'low'],
  lato: ['sans', 'low'], 'source sans pro': ['sans', 'low'], 'source sans 3': ['sans', 'low'],
  'noto sans': ['sans', 'low'], 'pt sans': ['sans', 'low'], 'ibm plex sans': ['sans', 'low'],
  'space grotesk': ['grotesk', 'low'], archivo: ['grotesk', 'low'], sora: ['grotesk', 'low'],
  'archivo black': ['grotesk', 'low'], oswald: ['grotesk', 'low'], anton: ['grotesk', 'low'],
  barlow: ['sans', 'low'], rubik: ['sans', 'low'], karla: ['sans', 'low'], mulish: ['sans', 'low'],
  manrope: ['sans', 'low'], figtree: ['sans', 'low'], 'work sans': ['sans', 'low'],
  'hanken grotesk': ['grotesk', 'low'], 'plus jakarta sans': ['sans', 'low'],
  'inter tight': ['sans', 'low'], assistant: ['sans', 'low'], 'be vietnam pro': ['sans', 'low'],
  epilogue: ['sans', 'low'], lexend: ['sans', 'low'], onest: ['sans', 'low'], geist: ['sans', 'low'],
  // Geometrics
  futura: ['geometric', 'low'], poppins: ['geometric', 'low'], montserrat: ['geometric', 'low'],
  'dm sans': ['geometric', 'low'], jost: ['geometric', 'low'], outfit: ['geometric', 'low'],
  questrial: ['geometric', 'low'], 'josefin sans': ['geometric', 'low'], quicksand: ['geometric', 'low'],
  nunito: ['geometric', 'low'], 'nunito sans': ['geometric', 'low'], raleway: ['geometric', 'low'],
  'century gothic': ['geometric', 'low'], comfortaa: ['geometric', 'low'],
  // Text serifs
  georgia: ['serif', 'medium'], 'times new roman': ['serif', 'medium'], times: ['serif', 'medium'],
  garamond: ['serif', 'medium'], 'eb garamond': ['serif', 'medium'], lora: ['serif', 'medium'],
  merriweather: ['serif', 'medium'], 'pt serif': ['serif', 'medium'], 'noto serif': ['serif', 'medium'],
  'source serif pro': ['serif', 'medium'], 'source serif 4': ['serif', 'medium'],
  newsreader: ['serif', 'medium'], 'crimson text': ['serif', 'medium'], 'crimson pro': ['serif', 'medium'],
  spectral: ['serif', 'medium'], 'ibm plex serif': ['serif', 'medium'], vollkorn: ['serif', 'medium'],
  cardo: ['serif', 'medium'], 'libre caslon text': ['serif', 'medium'], bitter: ['slab', 'low'],
  // Display serifs — the ones that need air
  'playfair display': ['display-serif', 'high'], playfair: ['display-serif', 'high'],
  didot: ['display-serif', 'high'], bodoni: ['display-serif', 'high'], 'bodoni moda': ['display-serif', 'high'],
  'cormorant garamond': ['display-serif', 'high'], cormorant: ['display-serif', 'high'],
  fraunces: ['display-serif', 'high'], 'libre baskerville': ['serif', 'high'],
  baskerville: ['serif', 'high'], 'instrument serif': ['display-serif', 'high'],
  'abril fatface': ['display-serif', 'high'], 'dm serif display': ['display-serif', 'high'],
  'dm serif text': ['serif', 'high'], prata: ['display-serif', 'high'],
  // Slabs
  rockwell: ['slab', 'low'], 'roboto slab': ['slab', 'low'], 'zilla slab': ['slab', 'low'],
  arvo: ['slab', 'low'], 'josefin slab': ['slab', 'low'],
  // Mono
  'courier new': ['mono', 'low'], courier: ['mono', 'low'], menlo: ['mono', 'low'],
  consolas: ['mono', 'low'], 'jetbrains mono': ['mono', 'low'], 'ibm plex mono': ['mono', 'low'],
  'space mono': ['mono', 'low'], 'roboto mono': ['mono', 'low'], 'fira code': ['mono', 'low'],
}

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', '-apple-system', 'blinkmacsystemfont',
  'segoe ui', 'inherit', 'initial', 'unset'])

function firstRealFamily(stack: string): string {
  for (const raw of stack.split(',')) {
    const f = raw.trim().replace(/^["']|["']$/g, '')
    if (!f) continue
    if (GENERIC.has(f.toLowerCase())) continue
    return f
  }
  return stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? ''
}

/**
 * Classify a font stack into something an art director can reason about.
 *
 * Three tiers, and the tier is reported because their reliability differs by a
 * lot: `catalogue` is a face we host and know everything about, `known` is a name
 * in the table above, `heuristic` is a guess from the generic fallback and the
 * name's own words — which is right often enough to be useful and wrong often
 * enough that the caller should be told.
 */
export function classifyFont(stack: string): TypeRead {
  const family = firstRealFamily(stack)
  const key = family.toLowerCase()

  for (const id of FONT_IDS) {
    const f = font(id)
    if (f.family.toLowerCase() === key) {
      return { family, stack, category: f.category, contrast: f.contrast, catalogueId: id, source: 'catalogue' }
    }
  }
  const known = KNOWN[key]
  if (known) {
    return { family, stack, category: known[0], contrast: known[1], catalogueId: null, source: 'known' }
  }

  // Heuristic: the words in the name, then the generic the stack falls back to.
  const lower = ` ${key} `
  let category: FontCategory = 'sans'
  let contrast: 'low' | 'medium' | 'high' = 'low'
  if (/mono|code|console|typewriter/.test(lower)) category = 'mono'
  else if (/slab/.test(lower)) category = 'slab'
  else if (/display|didone|didot|bodoni|fatface|canela|tiempos headline/.test(lower)) { category = 'display-serif'; contrast = 'high' }
  else if (/grotesk|grotesque|gothic sans|neue haas/.test(lower)) category = 'grotesk'
  else if (/serif|garamond|caslon|baskerville|minion|georgia|times|roman/.test(lower)) { category = 'serif'; contrast = 'medium' }
  else if (/geometric|futura|avenir|circular|poppins|gotham/.test(lower)) category = 'geometric'
  else {
    const generics = stack.toLowerCase()
    if (/\bserif\b/.test(generics) && !/sans-serif/.test(generics)) { category = 'serif'; contrast = 'medium' }
    else if (/monospace/.test(generics)) category = 'mono'
  }
  return { family, stack, category, contrast, catalogueId: null, source: 'heuristic' }
}

// ─── Type-scale sanity ───────────────────────────────────────────────────────

function toPx(value: string, base = 16): number | null {
  const m = /^([\d.]+)\s*(px|rem|em|pt|%)?$/.exec(value.trim())
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  switch (m[2]) {
    case 'rem': case 'em': return n * base
    case 'pt': return n * (4 / 3)
    case '%': return (n / 100) * base
    default: return n
  }
}

/**
 * Do this site's headings form a SCALE, or seven arbitrary numbers?
 *
 * The distinction is the clearest single signal of whether a page was designed or
 * assembled. A designed page has h1 > h2 > h3 with a recognisable ratio between
 * them; an assembled one has 32px, 30px, 24px, 25px because each was nudged until
 * it looked right in isolation.
 *
 * Returns 0..100, and `null` when there is not enough evidence to judge — which is
 * an honest third answer and is scored as neutral rather than as a failure.
 */
export function typeScaleSanity(css: string): { score: number | null; sizes: Record<string, number>; note: string } {
  const sizes: Record<string, number> = {}
  const want = ['h1', 'h2', 'h3', 'h4', 'body']
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().toLowerCase()
    const fs = /(?:^|;|\{)\s*font-size\s*:\s*([^;!]+)/i.exec(m[2])
    if (!fs) continue
    const px = toPx(fs[1].replace(/!\s*important/i, '').trim())
    if (px === null || px < 6 || px > 200) continue
    for (const tag of want) {
      // Only a bare element selector counts. `.card h2` is a local override and
      // says nothing about the document's scale.
      if (sel.split(',').map(s => s.trim()).includes(tag) && sizes[tag] === undefined) sizes[tag] = px
    }
  }

  const ramp = ['h1', 'h2', 'h3', 'h4'].map(t => sizes[t]).filter((n): n is number => typeof n === 'number')
  if (ramp.length < 3) return { score: null, sizes, note: `only ${ramp.length} heading sizes declared — not enough to judge` }

  let score = 100
  const notes: string[] = []
  // Monotone: every step must actually step down.
  for (let i = 1; i < ramp.length; i++) {
    if (ramp[i] >= ramp[i - 1]) { score -= 30; notes.push(`h${i + 1} is not smaller than h${i}`) }
  }
  // Consistent: the ratios between steps should look like one decision.
  const ratios: number[] = []
  for (let i = 1; i < ramp.length; i++) if (ramp[i] > 0) ratios.push(ramp[i - 1] / ramp[i])
  if (ratios.length) {
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    const spread = Math.sqrt(ratios.reduce((a, r) => a + (r - mean) ** 2, 0) / ratios.length)
    if (spread > 0.28) { score -= 25; notes.push(`step ratios scatter by ${spread.toFixed(2)}`) }
    else if (spread > 0.15) { score -= 12; notes.push(`step ratios scatter by ${spread.toFixed(2)}`) }
    if (mean < 1.05) { score -= 20; notes.push('headings barely differ in size') }
    if (mean > 2.2) { score -= 10; notes.push('headings jump violently') }
  }
  // A body size below 15px is a readability decision made against the reader.
  if (sizes.body !== undefined && sizes.body < 15) { score -= 15; notes.push(`body text at ${sizes.body}px`) }

  return {
    score: Math.max(0, Math.min(100, score)),
    sizes,
    note: notes.length ? notes.join('; ') : `clean ramp (${ramp.map(n => Math.round(n)).join(' → ')}px)`,
  }
}

// ─── Palette coherence ───────────────────────────────────────────────────────

/**
 * Does this site have A PALETTE, or just a lot of colours?
 *
 * Counted as distinct HUE CLUSTERS among the colours that actually carry weight —
 * hues more than 28° apart, at chroma high enough to read as a colour rather than
 * as a grey. One or two clusters is a palette. Five is a sitemap of past redesigns.
 */
export function paletteCoherence(hits: BrandColorHit[]): { score: number; hues: number[]; note: string } {
  const top = hits.filter(h => h.weight >= (hits[0]?.weight ?? 0) * 0.12).slice(0, 12)
  const hues: number[] = []
  /** Circular hue distance in degrees: 0 = the same hue, 180 = opposite. */
  const hueDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
  for (const h of top) {
    const o = hexToOklch(h.hex)
    // Below 0.05 chroma a colour reads as a grey, and greys are not a palette
    // decision — every site has them and none of them mean anything.
    if (!o || o.c < 0.05) continue
    if (!hues.some(x => hueDist(x, o.h) < 28)) hues.push(o.h)
  }
  const n = hues.length
  // ZERO HUES IS NOT A PERFECT SCORE, and the first version of this function gave
  // it one — which handed 100/100 to a site whose stylesheet we could barely read.
  // Two different situations hide behind "no hue": a deliberately neutral palette,
  // which is a real and often excellent decision, and a stylesheet we failed to
  // parse, which is an absence of evidence rather than evidence of quality. They
  // are told apart by whether we found any weighted colour at all.
  if (n === 0) {
    return hits.length > 0
      ? { score: 88, hues: [], note: 'a neutral palette — no chromatic colour carries weight' }
      : { score: 55, hues: [], note: 'no brand colour detected — an unreadable stylesheet, not a verdict' }
  }
  const score = n === 1 ? 100 : n === 2 ? 92 : n === 3 ? 72 : n === 4 ? 48 : n === 5 ? 30 : 18
  return {
    score,
    hues: hues.map(h => Math.round(h)),
    note: `${n} hue cluster${n === 1 ? '' : 's'} (${hues.map(h => Math.round(h)).join('°, ')}°)`,
  }
}

// ─── Age signals ─────────────────────────────────────────────────────────────

export type AgeSignal = { id: string; penalty: number; detail: string }

/**
 * Markers that a page was built to a different decade's assumptions.
 *
 * Each is a fact about the markup, not an opinion about the design: a missing
 * viewport meta is not "dated taste", it is a page that will be unusable on the
 * device most of its readers are holding.
 */
export function ageSignals(html: string, css: string, root: HTMLElement | null): AgeSignal[] {
  const out: AgeSignal[] = []
  const push = (id: string, penalty: number, detail: string) => out.push({ id, penalty, detail })

  if (!/<meta[^>]+name=["']?viewport/i.test(html)) push('no-viewport', 12, 'no viewport meta — not built for phones')

  const mediaQueries = (css.match(/@media[^{]*\(/g) ?? []).length
  if (mediaQueries === 0 && css.length > 2000) push('no-media-queries', 10, 'no media query in any stylesheet')

  const hasModernLayout = /display\s*:\s*(flex|grid|inline-flex|inline-grid)/i.test(css)
  const floats = (css.match(/float\s*:\s*(left|right)/gi) ?? []).length
  if (!hasModernLayout && floats > 4) push('float-layout', 9, `${floats} floats and no flex/grid`)

  const tables = root?.querySelectorAll('table') ?? []
  const layoutTables = tables.filter(t =>
    t.getAttribute('width') !== undefined || t.getAttribute('cellpadding') !== undefined
    || t.getAttribute('border') !== undefined || t.querySelectorAll('table').length > 0).length
  if (layoutTables > 0) push('layout-tables', 10, `${layoutTables} table(s) carrying layout attributes`)

  const legacyTags = (html.match(/<(font|center|marquee|blink|big|tt)\b/gi) ?? []).length
  if (legacyTags > 0) push('legacy-tags', 8, `${legacyTags} <font>/<center>/<marquee>`)

  const presentationAttrs = (html.match(/\s(bgcolor|cellspacing|cellpadding|valign|vspace|hspace)=/gi) ?? []).length
  if (presentationAttrs > 3) push('presentation-attrs', 6, `${presentationAttrs} presentational attributes`)

  if (/filter\s*:\s*progid|-ms-filter/i.test(css)) push('ie-filters', 7, 'IE-era filter:progid gradients')

  const fixedWidths = (css.match(/(?:max-)?width\s*:\s*(9[0-9]{2}|1[0-9]{3})px/g) ?? []).length
  if (fixedWidths > 0 && mediaQueries === 0) push('fixed-canvas', 7, `${fixedWidths} fixed desktop width(s), no media queries`)

  if (/\.clearfix|\.row:after|zoom\s*:\s*1/i.test(css)) push('clearfix', 3, 'clearfix-era float scaffolding')

  if (/<\?xml|XHTML 1\.0|HTML 4\.01/i.test(html.slice(0, 600))) push('legacy-doctype', 6, 'XHTML/HTML4 doctype')

  const flashish = /<(embed|object)\b[^>]*(flash|shockwave)/i.test(html)
  if (flashish) push('flash', 10, 'Flash/Shockwave embed')

  return out
}

// ─── Density and rhythm ──────────────────────────────────────────────────────

export type DensityRead = {
  /** Share of STRUCTURAL spacing declarations asking for 40px or more. */
  airRatio: number
  /** The 75th-percentile vertical spacing on structural containers, in px.
   *  This is the number the density verdict is actually made on. */
  structuralSpacingP75: number
  /** False ⇒ too few structural spacings to judge; the verdict is the population
   *  default rather than a reading. Callers that reason about density should say so. */
  measured: boolean
  /** Top-level structural sections in the body. */
  sections: number
  /** Body measure, in ch, implied by container width ÷ font size. */
  measureCh: number | null
  /** Images per 1,000 characters of visible text. */
  imageToText: number
  verdict: Density
  note: string
}

export function readDensity(root: HTMLElement | null, css: string, tokens: DesignTokens): DensityRead {
  const sections = root
    ? (root.querySelectorAll('body > section, body > main section, main > section, body > div > section').length
      || root.querySelectorAll('section, article').length)
    : 0

  // WHITESPACE, MEASURED ON THE RIGHT DENOMINATOR.
  //
  // The first version counted how many of ALL padding/margin declarations asked for
  // 40px or more. It reported 0–5% on essentially every site in the corpus and
  // called them all `compact`, which was obviously wrong — and the reason is that a
  // modern stylesheet contains thousands of tiny utility paddings (`.px-2`, form
  // controls, list items) that drown the handful of declarations which actually set
  // the page's rhythm. A true signal divided by an enormous irrelevant denominator
  // is a zero.
  //
  // So it now looks only at STRUCTURAL selectors — the containers that hold a
  // page's sections — and reports the 75th percentile of the vertical spacing they
  // ask for, in pixels. That is a number a designer would recognise: "this site
  // breathes at 96px" versus "this site breathes at 24px".
  // The corpus is overwhelmingly WordPress, and WordPress page builders do not
  // style a bare `section` — they style `.elementor-section`, `.et_pb_row`,
  // `.wp-block-group`. A structural-selector list that ignores them measures a
  // third of the web and calls the rest unknown, which is what the first version
  // did: 37 of 99 corpus sites came back unmeasurable.
  const STRUCTURAL = /(^|[\s,>~+])(section|main|article|header|footer|aside)\b|\.(container|wrapper|row|inner|content|site|page|hero|block|band|module|panel|section|elementor-(section|container|widget|column)|et_pb_(section|row|column)|vc_(row|section|column)|fl-(row|col|module)|wp-block-(group|columns|cover|column)|uk-section|su-row|entry-content|site-(main|content|header|footer)|main-content|page-(header|section|content))\b/i
  const pads: number[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim()
    if (sel.startsWith('@') || !STRUCTURAL.test(sel)) continue
    for (const d of m[2].matchAll(/\b(padding|margin)(-(top|bottom|block))?\s*:\s*([^;!]+)/gi)) {
      // For a shorthand, the FIRST value is the vertical one — which is the axis
      // that creates a page's rhythm. Horizontal gutters are a different decision.
      const first = d[4].trim().split(/\s+/)[0]
      const px = toPx(first)
      // A zero is a RESET, not a rhythm decision, and 19 of 99 corpus sites had
      // enough of them to drag the percentile to nothing. Excluded.
      if (px !== null && px > 0 && px < 400) pads.push(px)
    }
  }
  pads.sort((a, b) => a - b)
  // Fewer than three structural spacings and we have not measured this page, we
  // have merely failed to find its rhythm — a utility-class stylesheet declares
  // almost nothing on a bare `section`. Unknown must not collapse to `compact`,
  // because `compact` is an extreme and would drag 19 of 99 corpus sites into a
  // density they never chose.
  const measured = pads.length >= 3
  const p75 = measured ? pads[Math.floor((pads.length - 1) * 0.75)] : 0
  const generous = pads.filter(p => p >= 40).length
  const airRatio = pads.length > 0 ? Math.round((generous / pads.length) * 1000) / 1000 : 0

  const basePx = toPx(tokens.baseFontSize) ?? 16
  const maxPx = toPx(tokens.maxWidth)
  // ~0.5em per character is the usual approximation for a mixed-case latin face.
  const measureCh = maxPx ? Math.round(maxPx / (basePx * 0.5)) : null

  const text = root ? root.structuredText.replace(/\s+/g, ' ').trim().length : 0
  const imgs = root ? root.querySelectorAll('img, picture, figure').length : 0
  const imageToText = text > 0 ? Math.round((imgs / (text / 1000)) * 100) / 100 : 0

  // Thresholds in pixels, because that is the unit the decision is made in. 80px
  // of vertical section padding is a page that has been given room; 24px is a page
  // that is trying to fit.
  const verdict: Density = !measured ? 'comfortable'
    : p75 >= 80 ? 'vast' : p75 >= 56 ? 'generous' : p75 >= 28 ? 'comfortable' : 'compact'

  return {
    airRatio, structuralSpacingP75: p75, measured, sections, measureCh, imageToText, verdict,
    note: measured
      ? `sections breathe at ${p75}px (p75 of ${pads.length} structural spacings) · ${sections} sections · ${imageToText} images per 1k chars`
      : `rhythm not measurable (${pads.length} structural spacings) — assuming typical · ${sections} sections · ${imageToText} images per 1k chars`,
  }
}

// ─── Imagery ─────────────────────────────────────────────────────────────────

export type ImageryRead = {
  count: number
  /** Distinct width:height ratios declared in markup, most common first. */
  aspects: string[]
  kind: 'none' | 'people' | 'product' | 'place' | 'abstract' | 'mixed'
  note: string
}

const PEOPLE = /\b(team|equip|staff|persona|people|portrait|retrat|doctor|dentista|professional|client|pacient|family|famil)/i
const PRODUCT = /\b(product|producte|packshot|bottle|ampolla|menu|plat|dish|item|catalog|cataleg|model)/i
const PLACE = /\b(interior|exterior|shop|botiga|clinic|clinica|local|studio|estudi|sala|room|building|edifici|facade|fa[cç]ana)/i

export function readImagery(root: HTMLElement | null): ImageryRead {
  if (!root) return { count: 0, aspects: [], kind: 'none', note: 'no document' }
  const imgs = root.querySelectorAll('img')
  const ratios = new Map<string, number>()
  let people = 0, product = 0, place = 0
  for (const img of imgs) {
    const w = Number(img.getAttribute('width')), h = Number(img.getAttribute('height'))
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      const r = w / h
      const label = r > 2.2 ? '21:9' : r > 1.55 ? '16:9' : r > 1.2 ? '4:3' : r > 0.9 ? '1:1' : '3:4'
      ratios.set(label, (ratios.get(label) ?? 0) + 1)
    }
    // `alt` text is the cheapest description of a photograph that exists, and it
    // was written by someone who could see it. A vision call adds cost and
    // latency for a judgement three regexes get most of the way to.
    const hay = `${img.getAttribute('alt') ?? ''} ${img.getAttribute('src') ?? ''}`
    if (PEOPLE.test(hay)) people++
    if (PRODUCT.test(hay)) product++
    if (PLACE.test(hay)) place++
  }
  const aspects = [...ratios.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const scores: [ImageryRead['kind'], number][] = [['people', people], ['product', product], ['place', place]]
  scores.sort((a, b) => b[1] - a[1])
  const kind: ImageryRead['kind'] = imgs.length === 0 ? 'none'
    : scores[0][1] === 0 ? 'abstract'
      : scores[1][1] > 0 && scores[1][1] >= scores[0][1] * 0.6 ? 'mixed'
        : scores[0][0]
  return {
    count: imgs.length, aspects, kind,
    note: `${imgs.length} images${aspects.length ? ` · ${aspects.join(', ')}` : ''} · ${kind}`,
  }
}

// ─── The verdict ─────────────────────────────────────────────────────────────

export type SourceVerdict = 'inherit' | 'inherit-brand-only' | 'start-fresh'

/**
 * The site's own core reading pair, measured directly.
 *
 * W2 ran the first scorer over the corpus and found the contrast axis contributing
 * almost nothing, because it was reading `auditChromeContrast` — which exists to
 * answer a different question ("would OUR render make their header worse?") and is
 * silent about the page's own body text.
 *
 * Measuring `text on background` and `link on background` directly turned out to be
 * the strongest discriminator in the whole scorer: across the Barcelona-100, 31 of
 * 99 sites put body text below AA against their own background, and 51 of 99 do it
 * with their links. Half the corpus ships a link nobody with average eyesight can
 * comfortably read — which is exactly the defect we had just found in three of our
 * own templates, so the standard is one we hold ourselves to first.
 */
export type ReadingPair = {
  /** null ⇒ we could not read the pair, which is NOT the same as a failure. */
  bodyRatio: number | null
  linkRatio: number | null
  note: string
}

/**
 * Below this, we mis-paired rather than found a defect.
 *
 * No functioning business ships body text at 1.2:1 against its own background —
 * the page would be blank. A ratio that low means the extractor picked a text
 * colour and a background that never meet on screen (a dark overlay's text against
 * the page ground, say). Treating it as "unknown" costs us a signal on a handful of
 * sites; treating it as a defect would have us telling real businesses their website
 * is unreadable because our parser lost track of a nested surface.
 *
 * CALIBRATED AT 1.25, not 1.5. The corpus artefacts cluster at 1.00–1.17 (white on
 * white; `#212529` on `#161a1c`; an `hsl()` with a `calc()` inside that no parser
 * here reads). Genuinely awful but functioning designs — beige on light grey — sit
 * at 1.3–1.5, and those are real findings we should keep. A 1.5 threshold swallowed
 * them along with the artefacts, and dropped the synthetic 1998 fixture's score by
 * 26 points for a defect it really does have.
 */
const MISPAIRED_BELOW = 1.25

export type SourceQuality = {
  score: number
  verdict: SourceVerdict
  reading: ReadingPair
  contrastFailures: number
  typeScaleSanity: number | null
  paletteCoherence: number
  ageSignals: AgeSignal[]
  /** Every deduction, named, so the reveal can quote a number instead of a taste. */
  deductions: { axis: string; points: number; why: string }[]
  /** One line an owner could read without being insulted. */
  summary: string
}

/**
 * THRESHOLDS, and why they sit where they sit.
 *
 * 70 / 45 was calibrated against the Barcelona-100 so the three buckets are all
 * populated and the middle one is the biggest. That matters: `inherit-brand-only`
 * is the DEFAULT outcome for a small business site, because the common case is a
 * real brand wearing a tired template. A scorer that put everything in `inherit`
 * would be flattery; one that put everything in `start-fresh` would be a machine
 * telling every customer their website is bad, which is both rude and usually wrong.
 */
const INHERIT_AT = 70
const BRAND_ONLY_AT = 45

export function scoreSourceQuality(input: {
  contrast: ContrastReport
  reading: ReadingPair
  typeScale: { score: number | null; note: string }
  palette: { score: number; note: string }
  age: AgeSignal[]
}): SourceQuality {
  const deductions: SourceQuality['deductions'] = []
  let score = 100

  // 1. THE READING PAIR — the heaviest axis, because it is the one that decides
  // whether the page can be read at all. Judged on what the SOURCE ships; our
  // repair layer is not evidence in their favour.
  {
    const parts: string[] = []
    let p = 0
    const { bodyRatio, linkRatio } = input.reading
    // `null` deducts NOTHING. An unreadable stylesheet is our problem, not theirs.
    if (bodyRatio !== null) {
      if (bodyRatio < 3) { p += 18; parts.push(`body text at ${bodyRatio.toFixed(2)}:1`) }
      else if (bodyRatio < 4.5) { p += 10; parts.push(`body text at ${bodyRatio.toFixed(2)}:1`) }
    }
    if (linkRatio !== null) {
      if (linkRatio < 3) { p += 12; parts.push(`links at ${linkRatio.toFixed(2)}:1`) }
      else if (linkRatio < 4.5) { p += 7; parts.push(`links at ${linkRatio.toFixed(2)}:1`) }
    }
    if (p > 0) {
      score -= p
      deductions.push({ axis: 'reading', points: p, why: `${parts.join(', ')} — below the 4.5:1 floor` })
    }
  }

  // 2. The chrome audit, which answers a narrower question: does the source's own
  // header/footer already fail before we touch it?
  const failures = input.contrast.inheritedFailures.length
  if (failures > 0) {
    const p = Math.min(10, failures * 3)
    score -= p
    deductions.push({ axis: 'chrome-contrast', points: p, why: `${failures} header/footer pair${failures === 1 ? '' : 's'} below the floor on the source itself` })
  }

  // TYPE SCALE. `null` means we could not tell, which is scored as neutral —
  // punishing a site for not declaring bare `h2 { font-size }` would punish every
  // site built with utility classes, which is most of them now.
  if (input.typeScale.score !== null) {
    const p = Math.round((100 - input.typeScale.score) * 0.25)
    if (p > 0) { score -= p; deductions.push({ axis: 'type-scale', points: p, why: input.typeScale.note }) }
  }

  const pp = Math.round((100 - input.palette.score) * 0.2)
  if (pp > 0) { score -= pp; deductions.push({ axis: 'palette', points: pp, why: input.palette.note }) }

  const ageTotal = Math.min(30, input.age.reduce((a, s) => a + s.penalty, 0))
  if (ageTotal > 0) {
    score -= ageTotal
    deductions.push({ axis: 'age', points: ageTotal, why: input.age.map(s => s.id).join(', ') })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const verdict: SourceVerdict = score >= INHERIT_AT ? 'inherit'
    : score >= BRAND_ONLY_AT ? 'inherit-brand-only' : 'start-fresh'

  const summary = verdict === 'inherit'
    ? 'This site is well built. Reproduce it faithfully and stay out of the way.'
    : verdict === 'inherit-brand-only'
      ? 'The brand is real; the design around it is tired. Keep the colour, the name and the voice, rebuild the rest.'
      : 'There is very little here worth carrying forward except the name and the palette.'

  return {
    score, verdict,
    reading: input.reading,
    contrastFailures: failures,
    typeScaleSanity: input.typeScale.score,
    paletteCoherence: input.palette.score,
    ageSignals: input.age,
    deductions,
    summary,
  }
}

// ─── The register prior ──────────────────────────────────────────────────────

/**
 * Which register this business's evidence points at, with NO model involved.
 *
 * This is rung 3 of the art-director ladder (plan §7.1) reaching into rung 4: it
 * is what the deterministic director will use in W3, and it is what keeps the
 * whole system working when there is no API key. Assigning the register from
 * EVIDENCE rather than letting a model choose it is also the first line of defence
 * against the distinctiveness funnel — a model asked for a register will answer
 * "contemporary" almost every time.
 */
export function registerPrior(input: {
  heading: TypeRead
  body: TypeRead
  density: DensityRead
  bg: string
  accentChroma: number
}): { register: Register; why: string } {
  const bgO = hexToOklch(input.bg)
  const dark = bgO ? bgO.l < 0.45 : false
  const warmPaper = bgO ? bgO.c > 0.012 && bgO.h > 25 && bgO.h < 110 : false
  const h = input.heading

  if (dark) return { register: 'severe', why: 'the site is built on an ink ground' }
  if (h.category === 'display-serif') return { register: 'classic', why: `${h.family} is a display serif` }
  if (h.category === 'serif' || h.category === 'slab') {
    return warmPaper
      ? { register: 'warm', why: `a ${h.category} on warm paper` }
      : { register: 'classic', why: `a ${h.category} heading on neutral paper` }
  }
  if (h.category === 'mono') return { register: 'severe', why: 'a monospaced heading face' }
  if (input.accentChroma > 0.17 && input.density.measured && input.density.verdict === 'compact') {
    return { register: 'bold', why: 'a saturated accent in a dense layout' }
  }
  if (input.density.measured && (input.density.verdict === 'vast' || input.density.verdict === 'generous')) {
    return { register: 'quiet', why: `sections breathing at ${input.density.structuralSpacingP75}px with a sans heading` }
  }
  return { register: 'contemporary', why: 'a sans heading at ordinary density' }
}

/**
 * The three registers the three reveal variants are built in.
 *
 * WHY THIS EXISTS. The prior is CONCENTRATED, and that is not a bug: 84 of the 99
 * sites in the Barcelona corpus set their headings in a sans at ordinary density,
 * so "most small businesses are contemporary-register" is simply true, and a prior
 * that spread itself evenly across six families would be lying about what it saw.
 *
 * But a true prior fed straight into generation is the distinctiveness funnel
 * (plan §5) arriving through the front door: 71% of customers would be offered
 * three contemporary designs. So the prior describes the SOURCE, and this function
 * spreads it across the THREE VARIANTS — which is exactly what the reveal tabs
 * already promise (plan §9.1): Fidel keeps the register the business is already in,
 * Elevat moves it to the nearest family that would flatter it, Reimaginat takes the
 * leap. Three registers, never repeated, by construction.
 */
const VARIANT_LADDER: Record<Register, [Register, Register]> = {
  quiet: ['classic', 'severe'],
  classic: ['warm', 'bold'],
  contemporary: ['quiet', 'bold'],
  bold: ['contemporary', 'severe'],
  warm: ['classic', 'quiet'],
  severe: ['contemporary', 'bold'],
}

export function registerVariants(prior: Register): {
  faithful: Register
  elevated: Register
  reimagined: Register
} {
  const [elevated, reimagined] = VARIANT_LADDER[prior]
  return { faithful: prior, elevated, reimagined }
}

// ─── The one entry point ─────────────────────────────────────────────────────

export type DesignEvidence = {
  url: string
  tokens: DesignTokens
  palette: {
    /** The brand colour, by prominence. */
    brand: string | null
    ranked: BrandColorHit[]
    coherence: { score: number; hues: number[]; note: string }
  }
  type: { heading: TypeRead; body: TypeRead; scale: ReturnType<typeof typeScaleSanity> }
  density: DensityRead
  imagery: ImageryRead
  feed: BlogSignature | null
  sourceQuality: SourceQuality
  registerPrior: { register: Register; why: string }
}

export function readEvidence(opts: {
  url: string
  html: string
  cssTexts: string[]
  fontLinks?: string[]
  /** Pre-split chrome, when the caller already has it (the eval does). */
  chrome?: { top: string; bottom: string; bodyAttrs: string }
}): DesignEvidence {
  const { url, html, cssTexts, fontLinks = [] } = opts
  const css = cssTexts.join('\n')

  let root: HTMLElement | null = null
  try { root = parse(html) as HTMLElement } catch { root = null }

  let tokens: DesignTokens = { ...DEFAULT_TOKENS }
  if (root) {
    try { tokens = extractTokens({ root, cssTexts, fontLinks }) } catch { /* defaults */ }
  }

  const themeColor = root?.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null
  const ranked = rankBrandColors({ cssTexts, root, themeColor })
  const coherence = paletteCoherence(ranked)

  const heading = classifyFont(tokens.fontHeading)
  const body = classifyFont(tokens.fontBody)
  const scale = typeScaleSanity(css)
  const density = readDensity(root, css, tokens)
  const imagery = readImagery(root)

  let feed: BlogSignature | null = null
  if (root) {
    try {
      feed = detectBlogSignature({ root, base: new URL(url), cssTexts })
    } catch { feed = null }
  }

  let contrast: ContrastReport
  try {
    const ground = extractGround(css, opts.chrome?.bodyAttrs ?? null)
    contrast = auditChromeContrast({
      css,
      headerHtml: opts.chrome?.top ?? '',
      footerHtml: opts.chrome?.bottom ?? '',
      ground,
      pageBackground: tokens.colorBg,
    })
  } catch {
    contrast = { failures: [], inheritedFailures: [], worstRatio: null, chromeHasOwnGround: false, degraded: false, repair: null }
  }

  const linkOn = tokens.linkColor || tokens.colorAccent
  const measure = (fg: string): number | null => {
    const r = ratioOrNull(fg, tokens.colorBg)
    if (r === null || r < MISPAIRED_BELOW) return null
    return Math.round(r * 100) / 100
  }
  const bodyRatio = measure(tokens.colorText)
  const linkRatio = measure(linkOn)
  const say = (n: number | null) => (n === null ? 'unreadable pair' : `${n.toFixed(2)}:1`)
  const reading: ReadingPair = {
    bodyRatio, linkRatio,
    note: `text ${say(bodyRatio)} · links ${say(linkRatio)}`,
  }

  const sourceQuality = scoreSourceQuality({
    contrast,
    reading,
    typeScale: scale,
    palette: coherence,
    age: ageSignals(html, css, root),
  })

  const accentO = hexToOklch(tokens.colorAccent)
  const prior = registerPrior({
    heading, body, density,
    bg: tokens.colorBg,
    accentChroma: accentO?.c ?? 0,
  })

  return {
    url,
    tokens,
    palette: { brand: ranked[0]?.hex ?? null, ranked: ranked.slice(0, 8), coherence },
    type: { heading, body, scale },
    density,
    imagery,
    feed,
    sourceQuality,
    registerPrior: prior,
  }
}
