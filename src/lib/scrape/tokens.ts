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
  return m ? m[1].trim() : null
}

function collectVars(css: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    map.set(m[1].toLowerCase().trim(), m[2].trim())
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

function mostFrequentBrandColor(css: string): string | null {
  const counts = new Map<string, number>()
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    const hex = normalizeHex(m[0])
    if (!/^#[0-9a-f]{6}$/.test(hex)) continue
    if (!isBrandColor(hex)) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [hex, n] of counts) {
    if (n > bestN) { best = hex; bestN = n }
  }
  return best
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
export function familiesFromFontLinks(fontLinks: string[]): string[] {
  const out: string[] = []
  for (const link of fontLinks) {
    try {
      const u = new URL(link)
      const families = u.searchParams.getAll('family')
      for (const fam of families) {
        const name = fam.split(':')[0].replace(/\+/g, ' ').trim()
        if (name) out.push(name)
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

  const freqBrand = mostFrequentBrandColor(css)

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
  const bodyFamily =
    (varBodyFont && cleanFontFamily(resolveVar(varBodyFont, vars))) ||
    (bodyDecl && cleanFontFamily(bodyDecl)) ||
    (googleFamilies[0] ? cleanFontFamily(googleFamilies[0]) : null)

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
  const containerMax = ruleFor(s => /\b(container|wrapper|content|main|site)\b/.test(s), 'max-width')
  if (containerMax && /^[\d.]+(px|rem)$/.test(containerMax.trim())) tokens.maxWidth = containerMax.trim()

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

  return tokens
}
