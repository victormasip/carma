// W6 — THE CHROME LADDER, rendered.
//
// The plan's rule (§9.1): what is sacred about a customer's header is NOT the
// markup, it is the navigation and the identity — where the links go, what they
// are called, the logo. So the three variants treat the header three ways:
//
//   keep       their markup, their CSS, verbatim. Fidel — the source is fine.
//   harmonise  their markup and their navigation, RE-TOKENISED: this design's
//              palette and faces laid over their structure. Nothing moves; every
//              link still works; the seam between a 2011 header and a new blog
//              disappears. Elevat.
//   rebuild    their CONTENT — logo, nav labels, hrefs, CTA — re-laid into a
//              generated archetype in this design. Their navigation survives;
//              their markup does not. Reimaginat.
//
// Pure functions, no I/O. The Door's preview and the post-signup adoption call the
// same ones, so what the visitor was shown is what their blog gets.
//
// SAFETY. A captured header is a stranger's HTML, and anyone can write a preview
// URL naming any site. So the capture is sanitised once, here, over a spec
// parse: no scripts, frames, objects, <base>/<meta>/<style>, SVG animation,
// handlers or script/data URLs (see sanitizeChromeHtml). And the preview that
// renders it answers with a CSP whose script-src lists only the hashes of OUR
// scripts, so anything that slipped through would still not run.
// The CSS is the chrome compiler's critical subset.

import { parse, type HTMLElement } from 'node-html-parser'
import { parseFragment, serialize } from 'parse5'
import { compileChromeCss } from '@/lib/scrape/chromeCompiler'
import { absolutiseCssUrls, proxyUseHref } from '@/lib/scrape/clientCss'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { ratio } from '@/lib/design/color'
import type { FooterArchetype, Genome, HeaderArchetype } from '@/lib/design/genome'
import type { DesignTokens } from '@/lib/scrape/tokens'
import { CAPTURE_VERSION, HARMONY_MARK } from '@/lib/design/revealTypes'

export type NavLink = { label: string; href: string }

/**
 * How a logo reads against a ground, measured from its pixels (design/logoTone.ts):
 * `light` = a white-ish mark that vanishes on paper, `dark` = a black-ish mark that
 * vanishes on ink, `any` = colour, or a mark on its own plate — visible on both.
 */
export type LogoTone = 'light' | 'dark' | 'any'

/** Their identity and navigation, lifted out of their header. */
export type ChromeNav = {
  logo: { src: string; alt: string; tone?: LogoTone | null } | null
  links: NavLink[]
  cta: NavLink | null
}

/** A captured header/footer, sanitised and ready to render (JSON-safe). */
export type ChromeCapture = {
  /** CAPTURE_VERSION at capture time — a remembered capture of another shape is a miss. */
  v: number
  header: string
  footer: string
  bodyAttrs: string | null
  /** The chrome compiler's critical CSS — only the rules the chrome uses. */
  css: string
  /** Their web-font stylesheets (Google, Typekit…) so a kept header looks like theirs. */
  fontLinks: string[]
  nav: ChromeNav
  /**
   * Can their markup be SHOWN as they drew it? The gate is measured, not guessed
   * (see FAITHFUL below): true only when every stylesheet the page declares was
   * read, the compiler understood it, and their identity (a logo or navigation)
   * was found. False → keep and harmonise draw their header through rebuild.
   */
  faithful: boolean
}

/**
 * THE FAITHFUL GATE, calibrated in Chrome over the 69 corpus sites whose chrome the
 * compiler could style (2026-09-24, labelled by eye). Unframed, their markup
 * rendered recognisably for ~26; the rest exploded (menus, sliders, sidebars),
 * vanished, or rendered unstyled. The failures clustered on sites that declare
 * more stylesheets than the capture reads (median 22 vs 6) — reading them all is
 * no cure either: the compiled subset then outgrows MAX_CSS. So a capture is only
 * faithful when it read EVERY sheet the page declares. With the frame, 25 pass
 * and 18 of those render well (72%); the 7 that do not are known by name in the
 * calibration. Everyone else sees their logo and navigation redrawn by rebuild:
 * never a broken header, which reads as our bug, not their site.
 */
export const FAITHFUL_MAX_SHEETS = 8

const MAX_REGION = 120_000
const MAX_CSS = 160_000
const MAX_LINKS = 6

// ─── Sanitising a stranger's markup ──────────────────────────────────────────
//
// A tree walk over a SPEC-COMPLIANT parse (parse5 — the parser the renderer
// balances fragments with), not regexes over text: what we inspect is what a
// browser would build, so an entity-encoded `java&#115;cript:`, an unquoted
// handler or a `<svg><set>` that rewrites an href are all seen for what they are.
// And it is only the first layer: the preview that renders this also answers with
// a hash-only script-src (design/preview/route.ts), so a script, a handler or a
// javascript: URL that slipped through would still be refused by the browser.

type P5Attr = { name: string; value: string; prefix?: string }
type P5Node = {
  nodeName: string
  tagName?: string
  attrs?: P5Attr[]
  childNodes?: P5Node[]
  parentNode?: P5Node | null
}

/** Elements that execute, embed another document, re-point the page, or animate an attribute. */
const DROP = new Set([
  'script', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal',
  'fencedframe', 'base', 'meta', 'link', 'style', 'math', 'set', 'animate', 'animatemotion',
  'animatetransform', 'discard', 'handler', 'listener', 'xmp', 'plaintext', 'noembed', 'noframes',
])
/** Attributes whose value is a URL a browser may follow or load. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'ping', 'cite', 'longdesc', 'usemap', 'lowsrc', 'dynsrc', 'codebase', 'manifest', 'srcset', 'imagesrcset'])
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/

/** The URL as a browser resolves its scheme: entities already decoded by the parser, controls and spaces gone. */
const schemeOf = (v: string) => v.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '').toLowerCase()

function unsafeUrl(attr: string, value: string): boolean {
  const candidates = attr === 'srcset' || attr === 'imagesrcset'
    ? value.split(',').map(p => p.trim().split(/\s+/)[0] ?? '')
    : [value]
  return candidates.some(c => {
    const v = schemeOf(c)
    if (/^(javascript|vbscript|livescript|mocha|jar):/.test(v)) return true
    if (v.startsWith('data:')) return !((attr === 'src' || attr === 'srcset') && SAFE_DATA_IMAGE.test(v))
    return false
  })
}

function scrub(node: P5Node): void {
  const kids = node.childNodes ?? []
  for (let i = kids.length - 1; i >= 0; i--) {
    const c = kids[i]!
    // Also any element whose name is not a plain tag name (`<scr<script>` parses as
    // an element literally called "scr<script"): nothing honest is named like that.
    if (typeof c.tagName === 'string' && (DROP.has(c.tagName.toLowerCase()) || !/^[a-z][a-z0-9-]*$/i.test(c.tagName))) { kids.splice(i, 1); continue }
    if (c.attrs) {
      c.attrs = c.attrs.filter(a => {
        const name = a.name.toLowerCase()
        if (name.startsWith('on') || name === 'srcdoc' || name === 'shadowrootmode' || name === 'is') return false
        // A `<` or `>` in an attribute survives serialisation raw; dropping the
        // attribute closes the whole family of re-parse (mXSS) tricks for the
        // price of a rare tooltip.
        if (/[<>]/.test(a.value)) return false
        if (URL_ATTRS.has(name) && unsafeUrl(name, a.value)) return false
        return true
      })
    }
    scrub(c)
  }
}

/** Strip everything executable out of captured chrome. Never throws. */
export function sanitizeChromeHtml(html: string): string {
  try {
    const frag = parseFragment(html ?? '') as unknown as P5Node
    scrub(frag)
    let out = serialize(frag as never)
    // A region too large to be a header loses its trailing nodes, never half a tag.
    const kids = frag.childNodes ?? []
    while (out.length > MAX_REGION && kids.length) { kids.pop(); out = serialize(frag as never) }
    return out
  } catch {
    return ''
  }
}

/** Their <body> attributes, reduced to the ones that only style. */
export function sanitizeBodyAttrs(attrs: string | null | undefined): string | null {
  if (!attrs) return null
  try {
    const doc = parseFragment(`<div ${attrs.slice(0, 4000)}></div>`) as unknown as P5Node
    const el = doc.childNodes?.[0]
    const kept = (el?.attrs ?? []).filter(a => /^(class|id|dir|lang|style|data-[\w-]+)$/i.test(a.name) && !/[<>]/.test(a.value))
    const s = kept.map(a => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('').trim()
    return s ? s.slice(0, 2000) : null
  } catch {
    return null
  }
}

// ─── Framing their chrome for a preview ──────────────────────────────────────
//
// MEASURED, not guessed: rendered in Chrome over the Barcelona corpus, about a third
// of the captured headers came out broken or oversized with no script to run them —
// mega-menus exploded into columns of links, full-height hero sliders, off-canvas
// panels and cookie modals drawn open, fixed headers laid over the blog. A preview
// is a still picture of THEIR identity above OUR blog, so it keeps what a still
// picture needs, and frames it:
//   · sub-menus, sliders, off-canvas panels, dialogs and popups are removed — in a
//     preview nothing would open them, and every link is inert anyway;
//   · the region is wrapped in a box that CONTAINS it (`contain: paint` makes the
//     box the containing block even for `position: fixed`) and clamps its height.
// Only the Door's preview frames. A site's own blog renders the Studio's full
// capture, whose menus have their scripts and their CSS.

const PRUNE_CLASS = /(^|[\s_-])(sub-?menu|dropdown-menu|mega-?menu|children|slider|carousel|swiper|slick|revslider|rev_slider|off-?canvas|mobile-?menu|menu-?mobile|overlay|modal|popup|pop-up|lightbox|cookies?|gdpr|consent)([\s_-]|$)/i
/** A top-level item classed `.dropdown` or `.has-children` is still an item. */
const NEVER_PRUNED = new Set(['li', 'a', 'header', 'nav', 'body'])
export const FRAME_MAX_PX = { header: 220, footer: 560 } as const

function prune(node: P5Node): void {
  const kids = node.childNodes ?? []
  const parentTag = (node.tagName ?? '').toLowerCase()
  for (let i = kids.length - 1; i >= 0; i--) {
    const c = kids[i]!
    const tag = (c.tagName ?? '').toLowerCase()
    if (tag) {
      const cls = c.attrs?.find(a => a.name === 'class')?.value ?? ''
      const subList = (tag === 'ul' || tag === 'ol') && parentTag === 'li'
      const dialog = tag === 'dialog' || !!c.attrs?.some(a => a.name === 'aria-modal' || (a.name === 'role' && a.value === 'dialog'))
      if (subList || dialog || (!NEVER_PRUNED.has(tag) && PRUNE_CLASS.test(cls))) { kids.splice(i, 1); continue }
    }
    prune(c)
  }
}

/**
 * The frame's own rules, shipped with a kept or harmonised capture. A header that
 * is `position: fixed` or `absolute` (a transparent bar over a hero — Verne) has no
 * height in flow, so a clamped frame would collapse to nothing: its outer three
 * levels, and any <header> or banner at whatever depth (Verne's live Divi header
 * sits at the third, under two wrappers), are put back in flow. Deeper
 * positioning (a logo pinned inside its bar, icons, badges) is theirs.
 */
export const FRAME_CSS = '.carma-door-chrome>*,.carma-door-chrome>*>*,.carma-door-chrome>*>*>*,.carma-door-chrome :is(header,[role="banner"]){position:relative!important;inset:auto!important}'

/** Their header or footer, pruned to a still picture and framed. Never throws. */
export function frameChrome(html: string, region: 'header' | 'footer'): string {
  if (!html.trim()) return html
  try {
    const frag = parseFragment(html) as unknown as P5Node
    prune(frag)
    return `<div class="carma-door-chrome" data-region="${region}" style="position:relative;contain:paint;max-height:${FRAME_MAX_PX[region]}px;overflow:hidden">${serialize(frag as never)}</div>`
  } catch {
    return ''
  }
}

// ─── A logo on a new ground ──────────────────────────────────────────────────

/**
 * A CSS filter that keeps a one-colour logo readable on `ground`, or '' when it
 * already is. A white mark on paper becomes the same mark in ink, a black mark on
 * ink the same mark in white — the one-colour version every brand keeps for
 * exactly this. Colour marks and marks on their own plate (`any`) are never touched.
 */
export function logoFilter(tone: LogoTone | null | undefined, ground: string): string {
  if (!tone || tone === 'any') return ''
  const dark = ratio('#ffffff', ground) > ratio('#111111', ground)
  if (tone === 'light' && !dark) return 'brightness(0)'
  if (tone === 'dark' && dark) return 'brightness(0) invert(1)'
  return ''
}

/** Cross-origin SVG sprites (`<use href>`) are blocked by browsers — route them
 *  through the same-origin asset proxy, as the clone preview does. */
function proxyUses(html: string, base: URL): string {
  return html.replace(/(<use\b[^>]*?\b(?:xlink:href|href)=)(["'])([^"']+)\2/gi,
    (_m, pre: string, q: string, href: string) => `${pre}${q}${proxyUseHref(href, base)}${q}`)
}

// ─── Their navigation ────────────────────────────────────────────────────────

const text = (el: HTMLElement) => el.text.replace(/\s+/g, ' ').trim()

function absHref(href: string | undefined, base: URL): string | null {
  const h = (href ?? '').trim()
  if (!h || h.startsWith('#') || /^(javascript|data|vbscript):/i.test(h)) return null
  try {
    const u = new URL(h, base)
    return /^(https?|mailto|tel):$/.test(u.protocol) ? u.toString() : null
  } catch { return null }
}

/**
 * Logo, the first few navigation links, and a call to action — the parts of a
 * header that are INFORMATION about a business rather than decoration.
 */
export function extractNav(headerHtml: string, base: URL): ChromeNav {
  let root: HTMLElement
  try { root = parse(headerHtml ?? '') as unknown as HTMLElement } catch { return { logo: null, links: [], cta: null } }
  const scope = root.querySelector('header') ?? root.querySelector('[role=banner]') ?? root

  // The logo: an image inside the home link, else one that says it is a logo.
  const homeImg = scope.querySelectorAll('a').find(a => {
    const h = absHref(a.getAttribute('href'), base)
    return !!h && (h === base.origin + '/' || h === base.toString()) && a.querySelector('img')
  })?.querySelector('img')
  const logoImg = homeImg ?? scope.querySelectorAll('img').find(i =>
    /logo|brand/i.test(`${i.getAttribute('class') ?? ''} ${i.getAttribute('alt') ?? ''} ${i.getAttribute('src') ?? ''}`))
  const rawSrc = logoImg?.getAttribute('src') ?? logoImg?.getAttribute('data-src') ?? ''
  const logoSrc = rawSrc && !rawSrc.startsWith('data:') ? absHref(rawSrc, base) : null
  const logo = logoSrc && /^https?:/.test(logoSrc) ? { src: logoSrc, alt: (logoImg?.getAttribute('alt') ?? '').trim().slice(0, 80) } : null

  // Navigation: the nav's own links first; the header's if it has no <nav>.
  const anchors = (scope.querySelectorAll('nav a').length ? scope.querySelectorAll('nav a') : scope.querySelectorAll('a'))
  const seen = new Set<string>()
  const links: NavLink[] = []
  let cta: NavLink | null = null
  for (const a of anchors) {
    const label = text(a).slice(0, 32)
    const href = absHref(a.getAttribute('href'), base)
    if (!label || label.length < 2 || !href || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    const looksLikeCta = /btn|button|cta|book|reserv|contact|primary/i.test(a.getAttribute('class') ?? '')
    if (looksLikeCta && !cta) { cta = { label, href }; continue }
    if (links.length < MAX_LINKS) links.push({ label, href })
  }
  return { logo, links, cta }
}

// ─── Capture ─────────────────────────────────────────────────────────────────

/**
 * The header and footer of a page, sanitised, with the critical CSS they use.
 * Null when there is no chrome to speak of (then every variant is rebuilt from the
 * brand name alone).
 */
export function captureChrome(opts: {
  url: string
  html: string
  sheets: { url: string; css: string }[]
  inline: string[]
  fontLinks: string[]
  /** How many stylesheets the page declares — `sheets` is what was actually read. */
  declared: number
}): ChromeCapture | null {
  try {
    const base = new URL(opts.url)
    const split = splitPageChrome(opts.html, base)
    if (!split.top.trim()) return null
    const nav = extractNav(split.top, base)
    const css = [
      ...opts.inline.map(c => absolutiseCssUrls(c, base)),
      ...opts.sheets.map(s => { try { return absolutiseCssUrls(s.css, new URL(s.url)) } catch { return '' } }),
    ].join('\n')
    let compiled = ''
    try {
      const out = compileChromeCss({ css, headerHtml: split.top, footerHtml: split.bottom, bodyAttrs: split.bodyAttrs })
      // A compile that kept nothing did not understand this site — an empty sheet
      // would render the header naked, so the capture says so instead.
      if (out.stats.rulesOut > 0) compiled = out.css
    } catch { compiled = '' }
    const styled = compiled.length > 0 && compiled.length <= MAX_CSS
    return {
      v: CAPTURE_VERSION,
      header: sanitizeChromeHtml(proxyUses(split.top, base)),
      footer: sanitizeChromeHtml(proxyUses(split.bottom, base)),
      bodyAttrs: sanitizeBodyAttrs(split.bodyAttrs),
      // The renderer inlines this in a <style>; a `</style` inside one of their CSS
      // strings would end it early. `<\/` is the same string to CSS, and inert to HTML.
      css: styled ? compiled.replace(/<\/(style)/gi, '<\\/$1') : '',
      fontLinks: opts.fontLinks.filter(h => /^https:\/\//.test(h)).slice(0, 4),
      nav,
      faithful: styled
        && opts.declared <= FAITHFUL_MAX_SHEETS && opts.sheets.length >= opts.declared
        && (nav.links.length >= 2 || !!nav.logo),
    }
  } catch {
    return null
  }
}

// ─── Harmonise ───────────────────────────────────────────────────────────────

/** The colour that reads on the accent: whichever of ink or white contrasts more. */
function onColour(bg: string): string {
  return ratio('#ffffff', bg) >= ratio('#111111', bg) ? '#ffffff' : '#111111'
}

/**
 * Their header in this design's palette and faces, without moving a pixel of
 * layout. This CSS is LIGHT DOM — it sits in the customer's own document next to
 * their compiled chrome CSS, with no shadow boundary to protect it — which is the
 * one place `!important` is still load-bearing. The blog is in a shadow root,
 * so these rules cannot reach it; the host is excluded by name.
 *
 * Icons are left alone: icon fonts live in font-family, so re-facing an `<i>` or a
 * `[class*=icon]` would turn it into a letter.
 *
 * Their logo sat on THEIR header's colour; it now sits on this surface. A one-colour
 * mark that would vanish there (Verne's white logo on a paper bar) is re-inked —
 * found by its file name, the one thing the markup and the capture share.
 */
export function harmoniseCss(t: DesignTokens, logo?: ChromeNav['logo']): string {
  const ground = t.colorBg, surface = t.colorSurface, ink = t.colorText, accent = t.colorAccent
  const filter = logo ? logoFilter(logo.tone, surface) : ''
  const file = logo ? (logo.src.split(/[?#]/)[0]?.split('/').pop() ?? '').replace(/[^\w.-]/g, '') : ''
  const logoRule = filter && file.length >= 3 ? `\nbody img[src*="${file}"]{filter:${filter}!important}` : ''
  const notIcon = ':not(.carma-embed-host):not(i):not([class*="icon"]):not([class*="fa-"]):not([class*="dashicons"]):not(svg):not(svg *)'
  const chromeBoxes = 'header,footer,nav,[role="banner"],[role="contentinfo"],[class*="header"],[class*="footer"],[class*="navbar"],[class*="menu"],[id*="header"],[id*="footer"]'
  return `${HARMONY_MARK}
body{background:${ground}!important}
body :is(${chromeBoxes}):not(.carma-embed-host){background-color:${surface}!important;border-color:${t.colorBorder}!important;box-shadow:none!important}
body *${notIcon}{font-family:${t.fontBody}!important;color:${ink}!important}
body :is(h1,h2,h3,h4,.site-title,.logo,[class*="brand"],[class*="title"])${notIcon}{font-family:${t.fontHeading}!important}
body a${notIcon}{color:${ink}!important;text-decoration-color:${accent}!important}
body a:hover${notIcon}{color:${accent}!important}
body :is(button,[class*="btn"],[class*="button"],[class*="cta"])${notIcon}{background-color:${accent}!important;color:${onColour(accent)}!important;border-color:${accent}!important}${logoRule}
${HARMONY_MARK}`
}

// ─── Rebuild ─────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Their navigation in a header this design drew. Returned as the renderer's SCOPED
 * region format (`{ html, css }`), which it namespaces under
 * `[data-carma-chrome="…"]` behind an `all:initial` wall — so a rebuilt header
 * can never touch anything outside itself.
 */
export function rebuildChrome(opts: {
  nav: ChromeNav
  siteName: string
  genome: Genome
  tokens: DesignTokens
  homeHref: string
}): { header: string; footer: string } {
  const { nav, genome: g, tokens: t } = opts
  const kind: HeaderArchetype = g.chrome.header
  const foot: FooterArchetype = g.chrome.footer
  const name = esc(opts.siteName || '')
  const home = esc(opts.homeHref)
  const upper = g.type.headingCase === 'upper'
  const brand = nav.logo
    ? `<a class="cb-brand" href="${home}"><img class="cb-logo" src="${esc(nav.logo.src)}" alt="${esc(nav.logo.alt || opts.siteName)}"></a>`
    : `<a class="cb-brand cb-word" href="${home}">${name}</a>`
  const links = nav.links.map(l => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')
  const cta = nav.cta && kind !== 'minimal'
    ? `<a class="cb-cta" href="${esc(nav.cta.href)}">${esc(nav.cta.label)}</a>` : ''
  const list = kind === 'minimal' ? nav.links.slice(0, 3).map(l => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('') : links
  const radius = g.ornament.corner === 'pill' ? '999px' : g.ornament.corner === 'soft' ? t.radius : '0'
  const onAccent = onColour(t.colorAccent)
  // Their logo on OUR ground: re-inked when a one-colour mark would vanish on it.
  const logoInk = logoFilter(nav.logo?.tone, t.colorBg)
  const rule = g.space.rule === 'heavy' ? `2px solid ${t.colorText}` : `1px solid ${t.colorBorder}`

  const layout: Record<HeaderArchetype, string> = {
    masthead: '.cb{text-align:center;padding:1.6rem 1.25rem .9rem}.cb-row{flex-direction:column;gap:.9rem}.cb-word{font-size:clamp(1.6rem,1.2rem + 1.6vw,2.4rem)}.cb-logo{max-height:56px}.cb-nav ul{justify-content:center;border-top:' + rule + ';padding-top:.75rem;width:100%}',
    split: '.cb{padding:1rem 1.25rem}.cb-row{justify-content:space-between}.cb-nav{margin-left:auto}',
    stack: '.cb{padding:1.1rem 1.25rem .6rem}.cb-row{flex-direction:column;align-items:flex-start;gap:.7rem}.cb-nav{width:100%;border-top:' + rule + ';padding-top:.6rem}',
    rail: '.cb{padding:.55rem 1.25rem}.cb-row{justify-content:space-between}.cb-word{font-size:1rem;letter-spacing:.02em}.cb-logo{max-height:30px}.cb-nav a{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em}',
    minimal: '.cb{padding:1rem 1.25rem}.cb-row{justify-content:space-between}',
  }
  const headerCss = `
.cb{background:${t.colorBg};color:${t.colorText};font-family:${t.fontBody};border-bottom:${rule}}
.cb-row{display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap;max-width:${t.maxWidth};margin:0 auto}
.cb-brand{color:${t.colorText};text-decoration:none;font-family:${t.fontHeading};font-weight:700;font-size:1.3rem;line-height:1.1;${upper ? 'text-transform:uppercase;letter-spacing:.06em;' : ''}}
.cb-logo{display:block;max-height:44px;width:auto${logoInk ? `;filter:${logoInk}` : ''}}
.cb-nav ul{display:flex;flex-wrap:wrap;gap:.35rem 1.1rem;list-style:none;margin:0;padding:0}
.cb-nav a{color:${t.colorText};text-decoration:none;font-size:.92rem;font-weight:600}
.cb-nav a:hover{color:${t.colorAccent}}
.cb-cta{display:inline-block;background:${t.colorAccent};color:${onAccent};text-decoration:none;font-weight:700;font-size:.88rem;padding:.55rem 1rem;border-radius:${radius}}
${layout[kind]}`
  const headerHtml = `<div class="cb"><div class="cb-row">${brand}${list ? `<nav class="cb-nav" aria-label="${name}"><ul>${list}</ul></nav>` : ''}${cta}</div></div>`

  const year = new Date().getFullYear()
  const footLayout: Record<FooterArchetype, string> = {
    columns: '.cf-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,2fr);gap:1.5rem}.cf-nav ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.4rem 1rem}@media (max-width:640px){.cf-row{grid-template-columns:1fr}}',
    bar: '.cf-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem}.cf-nav ul{display:flex;flex-wrap:wrap;gap:.3rem 1rem}',
    statement: '.cf{text-align:center}.cf-name{font-size:clamp(1.8rem,1.3rem + 2vw,3rem)}.cf-nav ul{display:flex;flex-wrap:wrap;justify-content:center;gap:.3rem 1.1rem;margin-top:1rem}',
  }
  const footerCss = `
.cf{background:${t.colorSurface};color:${t.colorText};font-family:${t.fontBody};border-top:${rule};padding:2rem 1.25rem}
.cf-row{max-width:${t.maxWidth};margin:0 auto}
.cf-name{font-family:${t.fontHeading};font-weight:700;font-size:1.2rem;color:${t.colorText};text-decoration:none;display:inline-block}
.cf-nav ul{list-style:none;margin:0;padding:0}
.cf-nav a{color:${t.colorMuted};text-decoration:none;font-size:.88rem}
.cf-nav a:hover{color:${t.colorAccent}}
.cf-copy{margin:1.2rem auto 0;max-width:${t.maxWidth};font-size:.78rem;color:${t.colorMuted}}
${footLayout[foot]}`
  const footerHtml = `<div class="cf"><div class="cf-row"><a class="cf-name" href="${home}">${name}</a>${links ? `<nav class="cf-nav" aria-label="${name}"><ul>${links}</ul></nav>` : ''}</div><p class="cf-copy">© ${year} ${name}</p></div>`

  return {
    header: JSON.stringify({ html: headerHtml, css: headerCss.trim() }),
    footer: JSON.stringify({ html: footerHtml, css: footerCss.trim() }),
  }
}

// ─── The ladder, applied ─────────────────────────────────────────────────────

/** The theme fields a chrome treatment sets — the renderer's own vocabulary. */
export type ChromeFields = {
  extracted_header: string | null
  extracted_footer: string | null
  extracted_body_attrs: string | null
  extracted_head: string | null
  compiled_chrome_css: string | null
  font_links: string[]
}

/** The rungs a header can actually be DRAWN on (`replace` draws as `rebuild`). */
export type DrawnPolicy = 'keep' | 'harmonise' | 'rebuild'

/**
 * The rung a genome's header is drawn on, given what was captured. Keep and
 * harmonise show THEIR markup, so they need a faithful capture (see FAITHFUL);
 * without one both fall to rebuild — a header we drew from their logo and links
 * beats their markup rendered broken. With no capture known yet (`undefined`), the
 * genome's own rung stands: whoever draws it decides.
 */
export function drawnPolicy(genome: Genome, capture: ChromeCapture | null | undefined): DrawnPolicy {
  const p = genome.chrome.policy
  if (p !== 'keep' && p !== 'harmonise') return 'rebuild'
  if (capture === undefined) return p
  return capture && capture.css && capture.faithful ? p : 'rebuild'
}

/**
 * The header a genome's policy asks for, from a capture — as the Door's PREVIEW
 * draws it: their markup framed (see frameChrome), on the rung drawnPolicy allows.
 */
export function chromeFor(opts: {
  capture: ChromeCapture | null
  genome: Genome
  tokens: DesignTokens
  siteName: string
  homeHref: string
}): { policy: DrawnPolicy; fields: ChromeFields } {
  const { capture, genome, tokens } = opts
  const policy = drawnPolicy(genome, capture)

  if (policy === 'keep' || policy === 'harmonise') {
    const c = capture!
    return {
      policy,
      fields: {
        extracted_header: frameChrome(c.header, 'header'),
        extracted_footer: frameChrome(c.footer, 'footer'),
        extracted_body_attrs: c.bodyAttrs,
        extracted_head: null,
        compiled_chrome_css: `${c.css}\n${FRAME_CSS}${policy === 'harmonise' ? `\n${harmoniseCss(tokens, c.nav.logo)}` : ''}`,
        font_links: c.fontLinks,
      },
    }
  }
  const rebuilt = rebuildChrome({
    nav: capture?.nav ?? { logo: null, links: [], cta: null },
    siteName: opts.siteName, genome, tokens, homeHref: opts.homeHref,
  })
  return {
    policy: 'rebuild',
    fields: {
      extracted_header: rebuilt.header,
      extracted_footer: rebuilt.footer,
      extracted_body_attrs: null,
      extracted_head: null,
      compiled_chrome_css: null,
      font_links: [],
    },
  }
}
