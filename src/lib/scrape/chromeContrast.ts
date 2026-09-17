// CHROME CONTRAST — why a captured header comes out unreadable, and the repair.
//
// Founder, 2026-09-17: "the current header/footer capture system struggles with
// bad color contrast and broken links."
//
// THE ROOT CAUSE, and it is one line long
// ───────────────────────────────────────
// We own `<html>` and `<body>` on the render document, so `buildPageResetCss`
// drops the source's `body { background: …; color: … }` and paints our own.
// But a huge number of headers declare NO background of their own: they are
// transparent by design, sitting on the body's. A dark site's header is white
// text on `body{background:#111}` — take the body rule away and it is white text
// on white.
//
// `pageBackground()` in render/theme.ts already tries to mitigate this by using
// the SOURCE's `colorBg` token rather than the readability-forced one. That helps,
// but `colorBg` is picked by `extractTokens` with a CSS-VARIABLE match preferred
// over the body rule — so a site whose `--surface: #fff` names the card colour
// while `body` is `#111` hands the page the wrong ground, and the header goes
// white-on-white anyway.
//
// WHAT THIS MODULE DOES
//   1. Reads the ground we are about to drop: `html`/`body`/`:root` background
//      and color, straight from the source CSS (plus any inline body style).
//   2. Reads the colours the CHROME actually paints with.
//   3. Scores every pair with the real WCAG 2.1 contrast formula — not the
//      Rec.601 luma approximation used elsewhere in the codebase, which is a
//      brightness heuristic and disagrees with WCAG near the middle of the range.
//   4. Emits the SMALLEST repair that fixes it, in order of preference:
//        a. restore the ground (the source's own body background) — a
//           restoration, not an invention, and it fixes the majority;
//        b. only if that still fails, force the chrome's inherited text colour to
//           the accessible extreme.
//
// NOTHING IS REPAIRED THAT ALREADY PASSES. A header that reads fine is left byte
// for byte alone; this file's whole job is to do nothing 90% of the time.
//
// Pure + dependency-free → directly unit-testable and runnable over the cached
// Barcelona-100 (tests/grabber-audit.mjs).

export type Rgb = { r: number; g: number; b: number }

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080',
  maroon: '#800000', olive: '#808000', purple: '#800080', fuchsia: '#ff00ff', aqua: '#00ffff',
  lime: '#00ff00', yellow: '#ffff00', orange: '#ffa500',
}

/** Parse a CSS colour to RGB. Returns null for anything we cannot resolve
 *  statically — a gradient, a var(), currentColor, transparent. */
export function parseColor(input: string | null | undefined): Rgb | null {
  if (!input) return null
  let s = input.trim().toLowerCase()
  if (!s || s === 'transparent' || s === 'inherit' || s === 'currentcolor' || s === 'initial' || s === 'unset') return null
  if (s.startsWith('var(') || s.includes('gradient(')) return null
  if (NAMED[s]) s = NAMED[s]

  if (s.startsWith('#')) {
    let h = s.slice(1)
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    if ([r, g, b].some(Number.isNaN)) return null
    // An 8-digit hex with a low alpha is effectively transparent — not a ground.
    if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 200) return null
    return { r, g, b }
  }

  const rgb = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.%]+))?\s*\)/)
  if (rgb) {
    const a = rgb[4]
    if (a !== undefined) {
      const alpha = a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a)
      if (Number.isFinite(alpha) && alpha < 0.8) return null // see-through: not a ground
    }
    return { r: parseFloat(rgb[1]), g: parseFloat(rgb[2]), b: parseFloat(rgb[3]) }
  }

  const hsl = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/)
  if (hsl) return hslToRgb(parseFloat(hsl[1]), parseFloat(hsl[2]) / 100, parseFloat(hsl[3]) / 100)

  return null
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

/** WCAG 2.1 relative luminance. The sRGB linearisation matters: a Rec.601 luma
 *  approximation gets mid-tones wrong by enough to pass a failing pair. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio, 1:1 (identical) to 21:1 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** The AA threshold for normal body text. Large text is 3:1; the chrome is
 *  mostly nav links at body size, so we hold it to the stricter bar. */
export const AA_NORMAL = 4.5
/** Below this a pair is not "a bit tight", it is unreadable. */
export const UNREADABLE = 3

// ─── Reading the source CSS ───────────────────────────────────────────────────

type Rule = { selector: string; body: string }

/** Flat top-level rules. @media blocks are walked one level in, which is where
 *  responsive header overrides live. Comments are stripped first. */
function parseRules(css: string): Rule[] {
  const out: Rule[] = []
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    const selector = m[1].trim().toLowerCase()
    if (!selector || selector.startsWith('@')) continue
    out.push({ selector, body: m[2] })
  }
  return out
}

function decl(body: string, prop: string): string | null {
  const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))
  if (!m) return null
  return m[1].replace(/!important/i, '').trim()
}

/** `background: #111 url(x) no-repeat` → the colour, if the shorthand carries one. */
function colorFromBackgroundShorthand(v: string): string | null {
  const parts = v.split(/\s+(?![^(]*\))/)
  for (const p of parts) {
    if (parseColor(p)) return p
  }
  return null
}

export type Ground = {
  /** The background the chrome was designed to sit on, as authored. */
  background: string | null
  /** The text colour the chrome inherits from the document. */
  color: string | null
  /** 0..1 relative luminance of `background`, or null when unresolvable. */
  backgroundLum: number | null
}

const GROUND_SELECTORS = /(^|,)\s*(html|body|:root|html\s+body)\s*(,|$)/

/**
 * The ground we are about to throw away: what `html`/`body` painted.
 *
 * Later rules win, so the LAST declaration in cascade order is the one that
 * counts. An inline style on `<body>` beats every sheet, which is why bodyAttrs
 * is consulted last.
 */
export function extractGround(css: string, bodyAttrs?: string | null): Ground {
  let background: string | null = null
  let color: string | null = null

  for (const rule of parseRules(css)) {
    if (!GROUND_SELECTORS.test(`,${rule.selector},`)) continue
    const bgColor = decl(rule.body, 'background-color')
    const bgShort = decl(rule.body, 'background')
    const c = decl(rule.body, 'color')
    if (bgColor && parseColor(bgColor)) background = bgColor
    else if (bgShort) {
      const fromShort = colorFromBackgroundShorthand(bgShort)
      if (fromShort) background = fromShort
    }
    if (c && parseColor(c)) color = c
  }

  // An inline style on <body> outranks every stylesheet.
  if (bodyAttrs) {
    const styleAttr = bodyAttrs.match(/style\s*=\s*"([^"]*)"/i)?.[1] ?? bodyAttrs.match(/style\s*=\s*'([^']*)'/i)?.[1]
    if (styleAttr) {
      const bgColor = decl(styleAttr, 'background-color') ?? colorFromBackgroundShorthand(decl(styleAttr, 'background') ?? '')
      const c = decl(styleAttr, 'color')
      if (bgColor && parseColor(bgColor)) background = bgColor
      if (c && parseColor(c)) color = c
    }
  }

  const rgb = parseColor(background)
  return { background, color, backgroundLum: rgb ? relativeLuminance(rgb) : null }
}

// ─── Auditing the chrome ──────────────────────────────────────────────────────

/** Class/id/tag tokens present in a captured region, for cheap selector matching. */
function regionTokens(html: string): Set<string> {
  const tokens = new Set<string>()
  for (const m of html.matchAll(/\bclass\s*=\s*"([^"]*)"|\bclass\s*=\s*'([^']*)'/gi)) {
    for (const cls of (m[1] ?? m[2] ?? '').split(/\s+/)) if (cls) tokens.add(`.${cls.toLowerCase()}`)
  }
  for (const m of html.matchAll(/\bid\s*=\s*"([^"]*)"|\bid\s*=\s*'([^']*)'/gi)) {
    const id = (m[1] ?? m[2] ?? '').trim()
    if (id) tokens.add(`#${id.toLowerCase()}`)
  }
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b/gi)) tokens.add(m[1].toLowerCase())
  return tokens
}

/** Does this selector plausibly target something in the captured chrome? */
function selectorTouchesChrome(selector: string, tokens: Set<string>): boolean {
  const atoms = selector.match(/[.#]?[a-z0-9_-]+/gi) ?? []
  if (!atoms.length) return false
  // Every class/id atom must exist in the region; bare tag atoms are permissive.
  for (const atom of atoms) {
    const a = atom.toLowerCase()
    if ((a.startsWith('.') || a.startsWith('#')) && !tokens.has(a)) return false
  }
  return atoms.some(a => tokens.has(a.toLowerCase()))
}

export type ContrastFailure = {
  selector: string
  color: string
  background: string
  ratio: number
  /**
   * WHO BROKE IT.
   *
   *   'authored' — the rule sets both colour and background itself, so this pair
   *                exists on the live source site exactly as it does here. Their
   *                accessibility problem, not ours: we REPORT it and change
   *                nothing. Repainting a customer's brand colours because a hover
   *                state scores 3.9:1 would be vandalism.
   *   'inherited' — the chrome sets a text colour and NO background anywhere that
   *                could carry it, so it lands on the document ground. That ground
   *                is the one thing our capture throws away, which makes this
   *                failure ours, and the only one worth repairing.
   */
  origin: 'authored' | 'inherited'
}

export type ContrastReport = {
  /** Pairs that fail WCAG AA for normal text, both kinds. */
  failures: ContrastFailure[]
  /** Only the ones our capture caused — the repairable set. */
  inheritedFailures: ContrastFailure[]
  /** The worst ratio among INHERITED pairs, or null when there are none. */
  worstRatio: number | null
  /** True when the chrome paints an opaque background on a container of its own,
   *  i.e. it does not depend on the ground we dropped. */
  chromeHasOwnGround: boolean
  /**
   * TRUE WHEN OUR RENDER IS WORSE THAN THE SOURCE.
   *
   * The distinction the whole module turns on. A header whose text scores 3.5:1
   * on the live site and 3.5:1 on the clone is not something we broke — it is the
   * site, faithfully reproduced, and "fidelity" is the product. `degraded` fires
   * only when the ground we replaced was carrying that text and ours is not:
   * readable there, unreadable here. That is the only contrast failure this
   * pipeline is accountable for, and the only one worth scoring.
   */
  degraded: boolean
  /**
   * The repair, when one is both needed and possible.
   *
   *   'ground' — restore the source's own page background. Preferred, because it
   *              is a RESTORATION: the site already looked like that.
   *   'text'   — no usable ground to restore and the text still fails; force the
   *              chrome's inherited colour to the accessible extreme.
   */
  repair: { kind: 'ground'; background: string } | { kind: 'text'; color: string } | null
}

export type ChromeAuditInput = {
  /** The chrome's stylesheet text (compiled critical CSS, or the raw sheets). */
  css: string
  headerHtml: string
  footerHtml: string
  ground: Ground
  /** What the render will actually paint the page with, if already known. */
  pageBackground?: string | null
}

/** The selectors that could plausibly paint a GROUND for the chrome's text:
 *  the document, the outermost captured wrappers, and header/footer themselves. */
function groundSelectors(headerHtml: string, footerHtml: string): Set<string> {
  const out = new Set<string>(['html', 'body', ':root'])
  const add = (tag: string, attrs: string) => {
    out.add(tag.toLowerCase())
    const id = attrs.match(/\bid\s*=\s*"([^"]*)"|\bid\s*=\s*'([^']*)'/i)
    if (id) out.add(`#${(id[1] ?? id[2] ?? '').toLowerCase()}`)
    const cls = attrs.match(/\bclass\s*=\s*"([^"]*)"|\bclass\s*=\s*'([^']*)'/i)
    for (const c of (cls?.[1] ?? cls?.[2] ?? '').split(/\s+/)) if (c) out.add(`.${c.toLowerCase()}`)
  }
  for (const html of [headerHtml, footerHtml]) {
    // The outermost element of the region — the wrapper that holds the ground.
    const first = html.match(/<([a-z][a-z0-9-]*)\b([^>]*)>/i)
    if (first) add(first[1], first[2])
    // And the semantic chrome elements wherever they sit.
    for (const m of html.matchAll(/<(header|footer|nav)\b([^>]*)>/gi)) add(m[1], m[2])
  }
  return out
}

/** True when a selector's LAST compound targets one of the ground candidates —
 *  i.e. the rule paints that element rather than something inside it. */
function paintsGround(selector: string, candidates: Set<string>): boolean {
  for (const part of selector.split(',')) {
    const compounds = part.trim().split(/\s+|>|\+|~/).filter(Boolean)
    const last = compounds[compounds.length - 1]
    if (!last) continue
    if (/:{1,2}(hover|focus|active|visited|before|after)/.test(last)) continue
    const atoms = last.match(/^[a-z0-9-]+|[.#][a-z0-9_-]+/gi) ?? []
    if (atoms.some(a => candidates.has(a.toLowerCase()))) return true
  }
  return false
}

/**
 * Score the captured chrome for readability and decide the smallest repair.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: guess. Without a layout engine there is no
 * way to know which background a given piece of text actually sits on, and the
 * first version of this file tried anyway — it paired every `color` rule with
 * whatever background it had found first, and duly reported that 81% of the
 * Barcelona-100 was broken, including `#0d6efd on #0d6efd`. Nonsense at that
 * volume is worse than no audit: it would have repainted eighty working headers.
 *
 * So only two pairings are ever asserted, and both are justifiable from the text
 * of the CSS alone:
 *
 *   1. SAME-RULE pairs — one rule sets both `color` and `background`. Whatever
 *      that element is, those two values meet. Reported, never repaired.
 *   2. INHERITED text — a colour applies to the chrome while nothing in the
 *      chrome's ground chain paints an opaque background. That text lands on the
 *      document ground, which is exactly what we replace. Ours to fix.
 */
export function auditChromeContrast(input: ChromeAuditInput): ContrastReport {
  const tokens = regionTokens(`${input.headerHtml}\n${input.footerHtml}`)
  const rules = parseRules(input.css).filter(r => selectorTouchesChrome(r.selector, tokens))
  const groundCandidates = groundSelectors(input.headerHtml, input.footerHtml)

  const bgOf = (body: string): string | null => {
    const explicit = decl(body, 'background-color')
    if (explicit && parseColor(explicit)) return explicit
    const short = decl(body, 'background')
    if (!short) return null
    const c = colorFromBackgroundShorthand(short)
    return c && parseColor(c) ? c : null
  }

  // (1) Does the chrome paint its own ground anywhere?
  let chromeBg: string | null = null
  for (const r of rules) {
    if (!paintsGround(r.selector, groundCandidates)) continue
    const bg = bgOf(r.body)
    if (bg) { chromeBg = bg; break }
  }

  const failures: ContrastFailure[] = []
  const push = (selector: string, color: string, background: string, origin: ContrastFailure['origin']) => {
    const fg = parseColor(color)
    const bg = parseColor(background)
    if (!fg || !bg) return null
    const ratio = contrastRatio(fg, bg)
    if (ratio < AA_NORMAL) failures.push({ selector, color, background, ratio, origin })
    return ratio
  }

  // (1) Same-rule pairs — the site's own, reported for the record.
  for (const r of rules) {
    const color = decl(r.body, 'color')
    const bg = bgOf(r.body)
    if (color && bg) push(r.selector, color, bg, 'authored')
  }

  // (2) The inherited case, which is the one our capture creates. The colour is
  //     whatever applies to the chrome's ground chain (its own rule, else the
  //     body's), and the background is what the render will actually paint.
  let inheritedColor: string | null = input.ground.color
  for (const r of rules) {
    if (!paintsGround(r.selector, groundCandidates)) continue
    const c = decl(r.body, 'color')
    if (c && parseColor(c)) inheritedColor = c
  }

  const renderedBg = chromeBg ?? input.pageBackground ?? input.ground.background ?? '#ffffff'
  const before = failures.length
  let worstRatio: number | null = null
  if (inheritedColor && !chromeBg) {
    worstRatio = push('chrome(inherited)', inheritedColor, renderedBg, 'inherited')
  }
  const inheritedFailures = failures.slice(before)

  // Did WE make it worse? Compare the same text against the ground the source
  // gave it versus the ground the render will paint.
  let degraded = false
  if (inheritedColor && !chromeBg) {
    const fg = parseColor(inheritedColor)
    const sourceGround = parseColor(input.ground.background)
    const paint = parseColor(renderedBg)
    if (fg && paint) {
      const rendered = contrastRatio(fg, paint)
      // No source ground at all means the browser's default white — which is
      // what we paint anyway, so nothing was taken away.
      const source = sourceGround ? contrastRatio(fg, sourceGround) : rendered
      degraded = rendered < AA_NORMAL && rendered < source - 0.5
    }
  }

  // ── The repair ──────────────────────────────────────────────────────────────
  let repair: ContrastReport['repair'] = null
  if ((inheritedFailures.length || degraded) && inheritedColor) {
    const fg = parseColor(inheritedColor)!
    const groundRgb = parseColor(input.ground.background)
    // (a) Restore what the site actually had.
    //
    // Two conditions, and the second one matters more than it looks: we restore
    // when the source ground clears AA, OR when it is simply BETTER than what we
    // would paint. A header at 4.2:1 on the live site and 3.1:1 on ours is one we
    // degraded; handing back the ground it was designed for is the faithful move
    // even though the result still misses AA by a hair. Fidelity is the product,
    // and the source is not ours to improve — only ours not to spoil.
    const renderedRatio = parseColor(renderedBg) ? contrastRatio(fg, parseColor(renderedBg)!) : 0
    if (groundRgb && (contrastRatio(fg, groundRgb) >= AA_NORMAL || contrastRatio(fg, groundRgb) > renderedRatio + 0.5)) {
      repair = { kind: 'ground', background: input.ground.background! }
    } else if ((worstRatio ?? AA_NORMAL) < UNREADABLE) {
      // (b) Nothing to restore, and the text is not merely tight — it is INVISIBLE.
      //
      // The threshold is 3:1, not 4.5:1, and the gap between them is the whole
      // judgement. Measured over the Barcelona-100, most "inherited failures" are
      // a designer's mid-grey scoring 3.5–4.4 against white: a real accessibility
      // miss, but THEIR miss, present on the live site, and repainting it to #111
      // would be us redesigning a customer's header over half a point of contrast.
      //
      // Below 3:1 the text cannot be read at all — #f7f7f7 on #ffffff scores 1.07
      // — and at that point doing nothing is not neutrality, it is shipping a blank
      // header. Only there do we override.
      //
      // The remaining failures are still REPORTED, so the capture can tell the
      // owner what we found rather than silently fixing or silently ignoring it.
      const paint = parseColor(renderedBg) ?? { r: 255, g: 255, b: 255 }
      const onDark = contrastRatio({ r: 17, g: 17, b: 17 }, paint)
      const onLight = contrastRatio({ r: 255, g: 255, b: 255 }, paint)
      const best = onDark >= onLight ? '#111111' : '#ffffff'
      if (Math.max(onDark, onLight) >= AA_NORMAL) repair = { kind: 'text', color: best }
    }
  }

  return { failures, inheritedFailures, worstRatio, chromeHasOwnGround: !!chromeBg, degraded, repair }
}

/** The attribute pageSplit stamps on the top-level chrome wrappers. */
export const CHROME_ATTR = 'data-carma-chrome'

/**
 * The corrective layer, or '' when nothing needs correcting — which is the
 * overwhelmingly common case and the point.
 *
 * Scoped to `[data-carma-chrome]`, so it can never reach the blog inside the
 * shadow root. The ground repair carries NO `!important`: the site's own header
 * background must still win wherever it exists, since this is only restoring the
 * backdrop underneath it. The text guard does carry it, because the colour it is
 * overriding is by definition the one that fails.
 */
export function buildChromeRepairCss(report: ContrastReport): string {
  if (!report.repair) return ''
  if (report.repair.kind === 'ground') {
    return `/* carma: restored the source's own page ground — the captured chrome was designed against it */\n` +
      `[${CHROME_ATTR}]{background:${report.repair.background}}`
  }
  return `/* carma: the captured chrome fails WCAG AA on the rendered ground; forcing legible text */\n` +
    `[${CHROME_ATTR}]{color:${report.repair.color}!important}\n` +
    `[${CHROME_ATTR}] a:not([class]){color:${report.repair.color}!important}`
}
