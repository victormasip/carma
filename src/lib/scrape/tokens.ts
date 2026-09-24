// Design-token extraction from a page's HTML + CSS.
//
// We deliberately avoid a headless browser (Puppeteer/Playwright): those are
// heavy, hard to run serverless, and overkill here. Instead we parse the page's
// inline <style> blocks, its CSS custom properties (:root variables, which most
// modern frameworks expose), key element rules (body / headings / links / cards)
// and the <meta name="theme-color">. This is heuristic but produces a solid
// palette + typography set that we feed into our own blog templates.

import type { HTMLElement } from 'node-html-parser'

export type BlogLayout = 'grid' | 'list'
export type BlogColumns = '2' | '3' | '4'
// Structural feed presets (Phase 3). These change ONLY the layout of the article
// feed — grid template, spacing, card frame, image aspect ratio — and NEVER the
// brand: colours + fonts always come from the cloned `--ct-*` tokens. 'standard'
// is the built-in look (no override). See src/lib/render/feedLayouts.ts.
export type FeedLayout =
  | 'standard'
  | 'editorial'
  | 'magazine'
  | 'minimal'
  | 'gridxl'
  | 'overlay'
  | 'compact'

export type DesignTokens = {
  colorPrimary: string
  colorAccent: string
  colorBg: string
  colorSurface: string
  colorText: string
  colorMuted: string
  colorBorder: string
  fontHeading: string
  fontBody: string
  baseFontSize: string
  radius: string
  radiusLg: string
  maxWidth: string
  // Blog feed layout — driven by the visual editor, persisted in design_tokens,
  // and overridable per-embed via query params. Not auto-detected from the
  // source site (always seeded from the defaults below).
  layout: BlogLayout
  columns: BlogColumns
  // Structural feed preset (Phase 3) — layout only, inherits the cloned brand.
  // Optional; absent/'standard' = the built-in look.
  feedLayout?: FeedLayout
  // Blog/news heading styling — all optional, edited from the Theme Studio.
  sectionTitleColor?: string
  sectionTitleSize?: string        // e.g. '1.75rem'
  sectionTitleWeight?: string      // '400'..'900'
  sectionTitleAlign?: 'left' | 'center' | 'right'
  sectionTitleWidth?: string       // e.g. '100%' | '720px'
  sectionTitleHeight?: string
  showBreadcrumb?: boolean
  headingImage?: string
  // ── Article-body typography — captured from the source so the public render
  // inherits the source site's prose rhythm. All optional with sensible
  // fallbacks in the renderer when extraction can't find them.
  bodyLineHeight?: string          // e.g. '1.7'
  paragraphSpacing?: string        // margin-top/bottom on <p>, e.g. '1.15rem'
  linkColor?: string               // overrides accent for body links
  linkUnderline?: 'always' | 'hover' | 'none'
  headingWeight?: string           // h1..h3 weight, '400'..'900'
  headingLineHeight?: string       // e.g. '1.2'
  blockquoteBorderColor?: string   // border-left color, defaults to accent
  blockquoteStyle?: 'italic' | 'normal'
  // ── Buttons — the brand's primary CTA styling, so the blog's buttons
  // (article CTAs, "read more") feel like they were drawn by the same designer.
  // All optional; the renderer falls back to accent-on-white when absent.
  buttonBg?: string                // primary button background
  buttonText?: string              // primary button text color
  buttonRadius?: string            // button border-radius, e.g. '9999px'
  buttonPaddingY?: string          // vertical padding, e.g. '0.75rem'
  buttonPaddingX?: string          // horizontal padding, e.g. '1.5rem'
  buttonWeight?: string            // font-weight, '400'..'900'
  buttonBorder?: string            // border shorthand (outline/ghost buttons)
  buttonShadow?: string            // box-shadow
  buttonTextTransform?: 'uppercase' | 'none' | 'capitalize' | 'lowercase'
  // ── W6: the genome (`g_…`) these tokens were compiled from, when the owner
  // chose a design on the Door. The render adds that genome's own stylesheet only
  // while this still matches the site's active genome — so a template or a
  // re-capture, which replace the tokens, retire the genome's CSS with them.
  genome?: string
}

export const DEFAULT_TOKENS: DesignTokens = {
  colorPrimary: '#1a1a1a',
  colorAccent: '#0066cc',
  colorBg: '#ffffff',
  colorSurface: '#ffffff',
  colorText: '#1f2937',
  colorMuted: '#6b7280',
  colorBorder: '#e5e7eb',
  fontHeading: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontBody: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  baseFontSize: '16px',
  radius: '10px',
  radiusLg: '16px',
  maxWidth: '1200px',
  layout: 'grid',
  columns: '3',
}

const GENERIC_FONTS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'inherit', 'initial',
])

// ─── CSS primitives ─────────────────────────────────────────────────────────

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

type Rule = { selector: string; body: string }

// Naive but effective: matches leaf rule blocks (no nested braces), so rules
// inside @media/@supports are still captured individually.
function iterRules(css: string): Rule[] {
  const rules: Rule[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: m[1].trim().toLowerCase(), body: m[2] })
  }
  return rules
}

function getDecl(body: string, prop: string): string | null {
  const m = body.match(new RegExp(`(?:^|;|\\{)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))
  if (!m) return null
  // `!important` is noise for token extraction — left in place it made every
  // value fail its shape check (isColor/length regexes) and silently dropped
  // the site's real colour/size back to our defaults.
  return m[1].replace(/!\s*important\s*$/i, '').trim()
}

function collectVars(css: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    map.set(m[1].toLowerCase().trim(), m[2].replace(/!\s*important\s*$/i, '').trim())
  }
  return map
}

function resolveVar(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 4) return value
  const m = value.match(/var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)/)
  if (!m) return value
  const replacement = (vars.get(m[1].toLowerCase()) ?? m[2] ?? '').trim()
  return resolveVar(value.replace(m[0], replacement), vars, depth + 1)
}

// ─── Colour helpers ─────────────────────────────────────────────────────────

function isColor(v: string): boolean {
  const s = v.trim().toLowerCase()
  return /^#[0-9a-f]{3,8}$/.test(s) || /^rgba?\(/.test(s) || /^hsla?\(/.test(s)
}

function normalizeHex(v: string): string {
  const s = v.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s.slice(1).split('').map(c => c + c).join('')
  return s
}

// returns [h,s,l] from a hex colour, or null
function hexToHsl(hex: string): [number, number, number] | null {
  const m = normalizeHex(hex).match(/^#([0-9a-f]{6})/)
  if (!m) return null
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s, l]
}

// "Brand-like" = colourful enough and not near-white/black.
function isBrandColor(hex: string): boolean {
  const hsl = hexToHsl(hex)
  if (!hsl) return false
  const [, s, l] = hsl
  return s > 0.25 && l > 0.12 && l < 0.88
}

// ─── Brand-colour prominence (W2, 2026-09-21) ────────────────────────────────
//
// WHAT THIS REPLACED, AND WHY IT WAS WRONG
// ────────────────────────────────────────
// The previous version counted how many times each brand-ish hex appeared in the
// stylesheet and returned the winner. Frequency is a bad proxy for prominence and
// it is biased in a specific, predictable direction: the colours that appear most
// often in a stylesheet are BORDERS, HOVER STATES and SHADOW rgba() — small,
// repeated, low-signal declarations — while the colour a visitor would actually
// name as "their brand colour" is typically declared two or three times, on the
// logo, the header and the primary button.
//
// So this weighs each declaration by how much of the page it is likely to paint:
//
//   · WHAT property it sets      a background is a surface; a border is a line.
//   · WHERE the selector points  header/logo/brand/button/hero are where a brand
//                                lives; :hover and ::selection are not.
//   · HOW MUCH of the DOM it hits  a class used by forty elements is present in a
//                                way a class used once is not.
//
// It is still a heuristic and it is still browser-free — we cannot measure painted
// area without layout. But it is a heuristic about the right quantity, where the
// old one was a precise measurement of the wrong one.

/** Properties that can carry a colour, and what a colour there is worth. */
const COLOR_PROPS: [RegExp, number, string][] = [
  [/^background(-color)?$/, 3.0, 'surface'],
  [/^fill$/, 2.6, 'svg fill (logos live here)'],
  [/^color$/, 2.0, 'text'],
  [/^(border|outline)-?(top|right|bottom|left)?-color$/, 0.6, 'line'],
  [/^border$/, 0.5, 'line'],
  [/^stroke$/, 1.4, 'svg stroke'],
  [/^box-shadow$/, 0.15, 'shadow'],
  [/^text-decoration-color$/, 0.8, 'underline'],
]

/** Where in a page a selector points, and how brand-bearing that place is. */
const SELECTOR_WEIGHTS: [RegExp, number, string][] = [
  [/::?(selection|placeholder|marker|backdrop)/, 0.15, 'pseudo-element'],
  [/:(hover|focus|active|visited|focus-visible|focus-within)/, 0.3, 'interaction state'],
  [/(^|[\s.#[>~+])(logo|brand|site-?title|masthead|wordmark)/, 4.0, 'the brand mark itself'],
  [/(^|[\s.#[>~+])(btn|button|cta|call-to-action|submit|primary|action)/, 3.2, 'primary action'],
  [/(^|[\s.#[>~+])(header|nav|navbar|topbar|menu)/, 2.8, 'header/nav'],
  [/(^|[\s.#[>~+])(hero|banner|jumbotron|cover|splash)/, 2.4, 'hero'],
  [/(^|[\s.#[>~+])(badge|tag|chip|pill|label|highlight)/, 1.4, 'accent chip'],
  [/(^|[\s.#[>~+])(footer)/, 1.1, 'footer'],
  [/(^|[\s.#[>~+])(icon|svg)/, 1.3, 'icon'],
]

type DomHistogram = { classes: Map<string, number>; ids: Set<string>; tags: Map<string, number> }

/** One walk of the DOM, so selector presence is an O(1) lookup per rule. */
function domHistogram(root: HTMLElement | null): DomHistogram {
  const classes = new Map<string, number>()
  const ids = new Set<string>()
  const tags = new Map<string, number>()
  if (!root) return { classes, ids, tags }
  const walk = (el: HTMLElement) => {
    const tag = (el.rawTagName ?? '').toLowerCase()
    if (tag) tags.set(tag, (tags.get(tag) ?? 0) + 1)
    const cls = el.getAttribute?.('class')
    if (cls) for (const c of cls.split(/\s+/)) if (c) classes.set(c.toLowerCase(), (classes.get(c.toLowerCase()) ?? 0) + 1)
    const id = el.getAttribute?.('id')
    if (id) ids.add(id.toLowerCase())
    for (const child of el.childNodes) {
      // node-html-parser marks elements with nodeType 1.
      if ((child as HTMLElement).nodeType === 1) walk(child as HTMLElement)
    }
  }
  try { walk(root) } catch { /* a malformed tree still yields whatever it walked */ }
  return { classes, ids, tags }
}

/**
 * How present a selector is in this particular document.
 *
 * Logarithmic and capped: forty elements is meaningfully more present than one,
 * four hundred is not meaningfully more present than forty, and a utility class
 * sprayed across a page should not be able to out-vote the logo.
 */
function selectorPresence(selector: string, hist: DomHistogram): number {
  let n = 0
  for (const m of selector.matchAll(/\.([a-z0-9_-]+)/gi)) n = Math.max(n, hist.classes.get(m[1].toLowerCase()) ?? 0)
  for (const m of selector.matchAll(/#([a-z0-9_-]+)/gi)) if (hist.ids.has(m[1].toLowerCase())) n = Math.max(n, 3)
  for (const m of selector.matchAll(/(?:^|[\s,>~+])([a-z][a-z0-9]*)/gi)) {
    const t = m[1].toLowerCase()
    if (t === 'important') continue
    n = Math.max(n, Math.min(hist.tags.get(t) ?? 0, 40))
  }
  if (n === 0) return 0.6   // selects nothing we can see — probably dead CSS
  return 1 + Math.min(3, Math.log2(1 + n))
}

function selectorWeight(selector: string): { w: number; why: string } {
  let w = 1
  const whys: string[] = []
  for (const [re, mult, why] of SELECTOR_WEIGHTS) {
    if (re.test(selector)) { w *= mult; whys.push(why) }
  }
  return { w, why: whys.join(' + ') || 'body copy' }
}

export type BrandColorHit = { hex: string; weight: number; why: string }

/**
 * Every brand-like colour in the stylesheet, ranked by how much of the page it
 * probably paints. Exported because `design/evidence.ts` needs the whole ranking
 * and its reasons, not only the winner.
 */
export function rankBrandColors(opts: {
  cssTexts: string[]
  root?: HTMLElement | null
  themeColor?: string | null
}): BrandColorHit[] {
  const css = stripComments(opts.cssTexts.join('\n'))
  const vars = collectVars(css)
  const hist = domHistogram(opts.root ?? null)
  const acc = new Map<string, { w: number; whys: Map<string, number> }>()

  const add = (raw: string, weight: number, why: string) => {
    if (weight <= 0) return
    const hex = normalizeHex(raw)
    if (!/^#[0-9a-f]{6}$/.test(hex) || !isBrandColor(hex)) return
    const e = acc.get(hex) ?? { w: 0, whys: new Map<string, number>() }
    e.w += weight
    e.whys.set(why, (e.whys.get(why) ?? 0) + weight)
    acc.set(hex, e)
  }

  for (const rule of iterRules(css)) {
    const sel = rule.selector
    // `@media`/`@supports` preludes are captured as selectors by iterRules; they
    // carry no element and would otherwise score as anonymous body copy.
    if (sel.startsWith('@')) continue
    const { w: selW, why: selWhy } = selectorWeight(sel)
    const presence = selectorPresence(sel, hist)
    if (selW * presence === 0) continue
    for (const decl of rule.body.split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const prop = decl.slice(0, i).trim().toLowerCase()
      const value = resolveVar(decl.slice(i + 1).trim(), vars)
      const propEntry = COLOR_PROPS.find(([re]) => re.test(prop))
      if (!propEntry) continue
      const [, propW, propWhy] = propEntry
      for (const m of value.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
        add(m[0], propW * selW * presence, `${propWhy} · ${selWhy}`)
      }
    }
  }

  // A declared `--brand` / `--primary` custom property is the site telling us
  // directly. Nothing inferred from a selector should outrank that.
  for (const [name, value] of vars) {
    if (!/(^|[-_])(brand|primary|accent|theme|main)([-_]|$)/.test(name)) continue
    const resolved = resolveVar(value, vars)
    for (const m of resolved.matchAll(/#[0-9a-f]{3,8}\b/gi)) add(m[0], 28, `declared as --${name}`)
  }
  // `<meta name="theme-color">` is the same kind of statement, made in the markup.
  if (opts.themeColor) add(opts.themeColor, 24, 'declared as <meta theme-color>')

  return [...acc.entries()]
    .map(([hex, e]) => ({
      hex,
      weight: Math.round(e.w * 10) / 10,
      why: [...e.whys.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    }))
    .sort((a, b) => b.weight - a.weight)
}

function prominentBrandColor(cssTexts: string[], root: HTMLElement | null, themeColor: string | null): string | null {
  return rankBrandColors({ cssTexts, root, themeColor })[0]?.hex ?? null
}

// ─── Font helpers ─────────────────────────────────────────────────────────

function cleanFontFamily(value: string): string | null {
  const families = value
    .split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
  if (families.length === 0) return null
  // Skip values that are just var()/inherit
  if (families.length === 1 && (families[0].startsWith('var(') || GENERIC_FONTS.has(families[0].toLowerCase()))) {
    return null
  }
  const stack = families.slice(0, 4)
  const hasGeneric = stack.some(f => GENERIC_FONTS.has(f.toLowerCase()))
  if (!hasGeneric) stack.push('sans-serif')
  return stack
    .map(f => (/\s/.test(f) && !GENERIC_FONTS.has(f.toLowerCase()) ? `"${f}"` : f))
    .join(', ')
}

// Family name from a Google/Bunny Fonts URL (?family=Open+Sans:wght@400)
/**
 * Icon fonts, which are loaded exactly like typefaces and are not typefaces.
 *
 * W2 found this on a real site: an architecture studio loaded Material Icons
 * before its text face, so the first `family=` in the link list was "Material
 * Icons" and the whole blog inherited a heading font made of pictograms. The
 * failure is silent — the name looks like a font, the URL looks like a font, and
 * the rendered result is a row of empty boxes.
 */
const ICON_FONTS = /^(material (icons|symbols)|font\s?awesome|fa[-\s]?(solid|regular|brands)|ionicons|glyphicons|dashicons|fontello|themify|elusive|typicons|feather|remixicon|bootstrap-?icons|icomoon|simple-line-icons|linearicons|eicons?)\b/i

export function familiesFromFontLinks(fontLinks: string[]): string[] {
  const out: string[] = []
  for (const link of fontLinks) {
    try {
      const u = new URL(link)
      const families = u.searchParams.getAll('family')
      for (const fam of families) {
        const name = fam.split(':')[0].replace(/\+/g, ' ').trim()
        if (name && !ICON_FONTS.test(name)) out.push(name)
      }
    } catch { /* ignore */ }
  }
  return [...new Set(out)]
}

// ─── Main extractor ─────────────────────────────────────────────────────────

function findVar(vars: Map<string, string>, patterns: RegExp[], predicate: (v: string) => boolean): string | null {
  for (const re of patterns) {
    for (const [key, raw] of vars) {
      if (!re.test(key)) continue
      const val = resolveVar(raw, vars)
      if (predicate(val)) return val.trim()
    }
  }
  return null
}

export function extractTokens(opts: {
  root: HTMLElement
  cssTexts: string[]
  fontLinks: string[]
}): DesignTokens {
  const { root, cssTexts, fontLinks } = opts
  const css = stripComments(cssTexts.join('\n'))
  const rules = iterRules(css)
  const vars = collectVars(css)

  const ruleFor = (selectorTest: (sel: string) => boolean, prop: string): string | null => {
    for (const r of rules) {
      if (!selectorTest(r.selector)) continue
      const v = getDecl(r.body, prop)
      if (v) return resolveVar(v, vars).trim()
    }
    return null
  }

  const has = (sel: string, names: string[]) => names.some(n => sel.split(',').map(s => s.trim()).includes(n))

  const tokens: DesignTokens = { ...DEFAULT_TOKENS }

  // ── Colours ──
  const themeColorMeta = root.querySelector('meta[name="theme-color"]')?.getAttribute('content')
  const bodyBg = ruleFor(s => has(s, ['body', 'html', 'body', ':root']), 'background-color')
            ?? ruleFor(s => has(s, ['body', 'html']), 'background')
  const bodyText = ruleFor(s => has(s, ['body', 'html']), 'color')
  const linkColor = ruleFor(s => has(s, ['a', 'a:link']), 'color')

  const varPrimary = findVar(vars, [/(^|[-_])(primary|brand|main|theme|accent)([-_]|$)/], isColor)
  const varBg = findVar(vars, [/(^|[-_])(background|bg|surface|paper|body[-_]?bg)([-_]|$)/], isColor)
  const varText = findVar(vars, [/(^|[-_])(text|foreground|fg|ink|body[-_]?color|content)([-_]|$)/], isColor)
  const varAccent = findVar(vars, [/(^|[-_])(accent|link|secondary|highlight)([-_]|$)/], isColor)
  const varSurface = findVar(vars, [/(^|[-_])(surface|card|panel|elevated)([-_]|$)/], isColor)
  const varBorder = findVar(vars, [/(^|[-_])(border|divider|line|outline|stroke)([-_]|$)/], isColor)
  const varMuted = findVar(vars, [/(^|[-_])(muted|subtle|secondary[-_]?text|gray|grey|neutral)([-_]|$)/], isColor)

  // W2: prominence, not frequency. Still the LAST fallback in every pick below —
  // an explicit `--brand` variable or a theme-color meta beats any inference.
  const freqBrand = prominentBrandColor(cssTexts, root, themeColorMeta ?? null)

  const pickColor = (...candidates: (string | null | undefined)[]): string | null => {
    for (const c of candidates) {
      if (c && isColor(c)) return c.trim()
    }
    return null
  }

  tokens.colorPrimary = pickColor(varPrimary, themeColorMeta, linkColor, freqBrand) ?? DEFAULT_TOKENS.colorPrimary
  tokens.colorAccent  = pickColor(varAccent, linkColor, varPrimary, themeColorMeta, freqBrand) ?? tokens.colorPrimary
  tokens.colorBg      = pickColor(varBg, bodyBg) ?? DEFAULT_TOKENS.colorBg
  tokens.colorSurface = pickColor(varSurface) ?? DEFAULT_TOKENS.colorSurface
  tokens.colorText    = pickColor(varText, bodyText) ?? DEFAULT_TOKENS.colorText
  tokens.colorMuted   = pickColor(varMuted) ?? DEFAULT_TOKENS.colorMuted
  tokens.colorBorder  = pickColor(varBorder) ?? DEFAULT_TOKENS.colorBorder

  // ── Fonts ──
  const googleFamilies = familiesFromFontLinks(fontLinks)
  const headingDecl = ruleFor(s => has(s, ['h1', 'h2', 'h1,h2', 'h1, h2', '.title', 'heading']), 'font-family')
  const bodyDecl = ruleFor(s => has(s, ['body', 'html', ':root']), 'font-family')
  const varHeadingFont = vars.get('font-heading') ?? vars.get('heading-font') ?? vars.get('font-display')
  const varBodyFont = vars.get('font-body') ?? vars.get('font-sans') ?? vars.get('font-base') ?? vars.get('font-family')

  const headingFamily =
    (varHeadingFont && cleanFontFamily(resolveVar(varHeadingFont, vars))) ||
    (headingDecl && cleanFontFamily(headingDecl)) ||
    (googleFamilies[0] ? cleanFontFamily(googleFamilies[0]) : null)
  // Body fallback: when the site loaded SEVERAL web fonts (the classic display +
  // text pairing, e.g. "Playfair Display" + "Inter"), and no explicit body
  // font-family is found, the body must NOT inherit the heading's display face —
  // pick the first Google family that ISN'T the heading. With a single font they
  // naturally coincide and the pair is shared (as before).
  const bodyGoogle = googleFamilies.find(f => cleanFontFamily(f) !== headingFamily) ?? googleFamilies[0]
  const bodyFamily =
    (varBodyFont && cleanFontFamily(resolveVar(varBodyFont, vars))) ||
    (bodyDecl && cleanFontFamily(bodyDecl)) ||
    (bodyGoogle ? cleanFontFamily(bodyGoogle) : null)

  if (headingFamily) tokens.fontHeading = headingFamily
  if (bodyFamily) tokens.fontBody = bodyFamily
  // If only one was found, share it.
  if (headingFamily && !bodyFamily) tokens.fontBody = headingFamily
  if (bodyFamily && !headingFamily) tokens.fontHeading = bodyFamily

  const bodySize = ruleFor(s => has(s, ['body', 'html', ':root']), 'font-size')
  if (bodySize && /^[\d.]+(px|rem|em|%)$/.test(bodySize.trim())) tokens.baseFontSize = bodySize.trim()

  // ── Radius ──
  const varRadius = vars.get('radius') ?? vars.get('border-radius') ?? vars.get('rounded') ?? vars.get('radii')
  const cardRadius = ruleFor(s => /\b(card|btn|button|post|article|box)\b/.test(s), 'border-radius')
  const radius = (varRadius && resolveVar(varRadius, vars)) || cardRadius
  if (radius && /^[\d.]+(px|rem|em)$/.test(radius.trim())) {
    tokens.radius = radius.trim()
    const n = parseFloat(radius)
    const unit = radius.trim().replace(/^[\d.]+/, '')
    tokens.radiusLg = `${Math.round(n * 1.5 * 100) / 100}${unit}`
  }

  // ── Max width (content container) ──
  // The blog feed must align with the cloned header/footer's inner container. A site
  // typically declares the SAME content max-width on several wrappers (header inner,
  // main, footer inner, .container, .row…), so the MOST FREQUENT container max-width
  // is the true content width — far more reliable than the first match, which could
  // be a narrow aside or a hero-only override (the "too compressed / misaligned"
  // bug). We tally every container-like max-width, normalise rem→px, and pick the
  // mode within a sane 600–1760px range (ties → the wider value, i.e. the site shell
  // rather than an inset column).
  const containerSel = /\b(container|wrapper|content|main|site|inner|row|layout|page|shell)\b/
  const maxWidthToPx = (raw: string): number | null => {
    const m = raw.trim().match(/^([\d.]+)(px|rem|em)$/)
    if (!m) return null
    const px = m[2] === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16
    return px >= 600 && px <= 1760 ? Math.round(px) : null
  }
  const widthTally = new Map<number, number>()
  for (const r of rules) {
    if (!containerSel.test(r.selector)) continue
    const decl = getDecl(r.body, 'max-width')
    if (!decl) continue
    const px = maxWidthToPx(resolveVar(decl, vars))
    if (px != null) widthTally.set(px, (widthTally.get(px) ?? 0) + 1)
  }
  if (widthTally.size) {
    let best = 0, bestCount = 0
    for (const [px, count] of widthTally) {
      if (count > bestCount || (count === bestCount && px > best)) { best = px; bestCount = count }
    }
    tokens.maxWidth = `${best}px`
  } else {
    // Fallback: first container max-width (covers unusual/rem-var-only setups).
    const containerMax = ruleFor(s => containerSel.test(s), 'max-width')
    if (containerMax && /^[\d.]+(px|rem)$/.test(containerMax.trim())) tokens.maxWidth = containerMax.trim()
  }

  // ── Body typography rhythm — line-height, paragraph spacing, link & quote
  //    styling. Captured optimistically (any clean match wins); the renderer
  //    falls back to its own defaults when these aren't set. The point is to
  //    make the public article body "feel" like the client's site visually
  //    without inheriting their actual CSS.

  // Body line-height — sample from body/html/article rules.
  const lineHeight = ruleFor(s => has(s, ['body', 'html', 'article', '.article', '.post', '.content']), 'line-height')
  if (lineHeight) {
    const lh = lineHeight.trim()
    if (/^[\d.]+(rem|em|%|px)?$/.test(lh)) tokens.bodyLineHeight = lh
  }

  // Paragraph spacing — sample <p> margin (top/bottom).
  const pMargin = ruleFor(s => has(s, ['p', 'article p', '.content p']), 'margin')
              ?? ruleFor(s => has(s, ['p', 'article p', '.content p']), 'margin-bottom')
  if (pMargin) {
    const first = pMargin.trim().split(/\s+/)[0]
    if (/^[\d.]+(px|rem|em)$/.test(first)) tokens.paragraphSpacing = first
  }

  // Link styling — color + decoration. Body links often differ from accent.
  if (linkColor && isColor(linkColor)) tokens.linkColor = linkColor.trim()
  const linkDecoration = ruleFor(s => has(s, ['a', 'a:link']), 'text-decoration')
                      ?? ruleFor(s => has(s, ['a', 'a:link']), 'text-decoration-line')
  if (linkDecoration) {
    const d = linkDecoration.toLowerCase()
    if (d.includes('underline')) tokens.linkUnderline = 'always'
    else if (d.includes('none')) {
      // Check :hover for a hover-underline pattern.
      const hover = ruleFor(s => has(s, ['a:hover']), 'text-decoration')
                 ?? ruleFor(s => has(s, ['a:hover']), 'text-decoration-line')
      tokens.linkUnderline = hover && hover.toLowerCase().includes('underline') ? 'hover' : 'none'
    }
  }

  // Headings — weight + line-height. Sample h2 (most representative of in-body
  // headings; h1 is often hero-sized and skews the value).
  const hWeight = ruleFor(s => has(s, ['h1', 'h2', 'h3', 'h1,h2', 'h2,h3']), 'font-weight')
  if (hWeight) {
    const w = hWeight.trim()
    if (/^[1-9]00$/.test(w) || ['bold', 'normal', 'bolder', 'lighter'].includes(w.toLowerCase())) {
      // Map keywords to numeric weights for consistency.
      tokens.headingWeight = w.toLowerCase() === 'bold' ? '700' : w.toLowerCase() === 'normal' ? '400' : w
    }
  }
  const hLine = ruleFor(s => has(s, ['h1', 'h2', 'h3', 'h1,h2', 'h2,h3']), 'line-height')
  if (hLine) {
    const lh = hLine.trim()
    if (/^[\d.]+(rem|em|%|px)?$/.test(lh)) tokens.headingLineHeight = lh
  }

  // Blockquote — border color + italic vs. normal.
  const bqBorder = ruleFor(s => has(s, ['blockquote', '.quote']), 'border-left-color')
                ?? ruleFor(s => has(s, ['blockquote', '.quote']), 'border-color')
  if (bqBorder && isColor(bqBorder)) tokens.blockquoteBorderColor = bqBorder.trim()
  const bqStyle = ruleFor(s => has(s, ['blockquote', '.quote']), 'font-style')
  if (bqStyle && /italic|normal/i.test(bqStyle)) tokens.blockquoteStyle = bqStyle.toLowerCase().includes('italic') ? 'italic' : 'normal'

  // ── Buttons ──
  // Find the site's PRIMARY button and mirror its look on the blog's CTAs. We
  // prefer a "primary/cta/solid" variant (the filled brand button) and fall back
  // to any generic button/.btn rule. Heuristic + solid: we read only clean,
  // self-contained values (a colour, a length, a keyword) — anything ambiguous is
  // skipped so the renderer keeps its on-brand accent default.
  const BTN_PRIMARY = /(\.(btn|button)[-_](primary|cta|main|solid|accent|brand|fill|filled))|(\.(cta|btn-primary|button-primary))/
  const BTN_ANY = /(^|[\s,>+~])(button|\.btn|\.button)(?![\w-])|input\[type=["']?(submit|button)/
  const btnDecl = (prop: string): string | null =>
    ruleFor(s => BTN_PRIMARY.test(s), prop) ?? ruleFor(s => BTN_ANY.test(s), prop)

  const btnBg = btnDecl('background-color') ?? btnDecl('background')
  if (btnBg) {
    const raw = btnBg.trim()
    // A gradient is a legitimate brand button fill; keep it whole. A bare colour
    // (incl. rgb()/hsl() with internal spaces) is used as-is. For the `background`
    // shorthand (colour + image + position) pull just the first colour token —
    // splitting on whitespace would shred an rgb(…) value, so match it directly.
    if (/gradient\(/i.test(raw)) tokens.buttonBg = raw
    else if (isColor(raw)) tokens.buttonBg = raw
    else {
      const m = raw.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i)
      if (m) tokens.buttonBg = m[0]
    }
  }
  const btnColor = btnDecl('color')
  if (btnColor && isColor(btnColor)) tokens.buttonText = btnColor.trim()
  const btnRadius = btnDecl('border-radius')
  if (btnRadius) {
    const r = btnRadius.trim().split(/\s+/)[0]
    if (/^[\d.]+(px|rem|em)$/.test(r) || r === '9999px' || /^\d+%$/.test(r)) tokens.buttonRadius = r
  }
  const btnPadding = btnDecl('padding')
  if (btnPadding) {
    const parts = btnPadding.trim().split(/\s+/).filter(Boolean)
    const okLen = (v: string) => /^[\d.]+(px|rem|em)$/.test(v)
    // padding shorthand: 1 → all; 2 → y x; 3 → t x b; 4 → t r b l.
    const y = parts[0]
    const x = parts.length >= 2 ? parts[1] : parts[0]
    if (y && okLen(y)) tokens.buttonPaddingY = y
    if (x && okLen(x)) tokens.buttonPaddingX = x
  }
  const btnWeight = btnDecl('font-weight')
  if (btnWeight) {
    const w = btnWeight.trim().toLowerCase()
    if (/^[1-9]00$/.test(w)) tokens.buttonWeight = w
    else if (w === 'bold') tokens.buttonWeight = '700'
    else if (w === 'normal') tokens.buttonWeight = '400'
  }
  const btnBorder = btnDecl('border')
  if (btnBorder && /\d/.test(btnBorder) && /solid|dashed|dotted/i.test(btnBorder) && btnBorder.length < 80) tokens.buttonBorder = btnBorder.trim()
  const btnShadow = btnDecl('box-shadow')
  if (btnShadow && btnShadow.toLowerCase() !== 'none' && btnShadow.length < 140) tokens.buttonShadow = btnShadow.trim()
  const btnTransform = btnDecl('text-transform')
  if (btnTransform) {
    const tt = btnTransform.trim().toLowerCase()
    if (tt === 'uppercase' || tt === 'capitalize' || tt === 'lowercase' || tt === 'none') tokens.buttonTextTransform = tt
  }

  return tokens
}
