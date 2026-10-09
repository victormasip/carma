// W0 — THEIR CHROME, WITH NONE OF THEIR CODE.
//
// A captured header and footer arrive with the customer's scripts inside them —
// 98 of 99 corpus captures, a median of 23 `<script>` tags each (reboot plan R4) —
// and until now the renderer served them verbatim on our domain. This module is
// the render-time wall: every captured region passes through it on every render
// (so every site already stored is cleaned without a data migration), over the
// SAME spec-compliant parse the stitcher balances the page with.
//
// What it removes: every element that executes, embeds another document or
// re-points the page; every `on*` handler; every javascript:/vbscript:/data: URL
// that isn't an image. What it keeps, because the chrome is unrecognisable
// without it: their `<style>` blocks and `<link rel=stylesheet>` (35 of 99 sites
// declare stylesheets in <body>), their markup, classes, inline styles and links.
// Map iframes from an allow-list survive, sandboxed and lazy.
//
// Two repairs a script-free page needs, done here because only here is the
// markup a tree:
//   · LAZY IMAGES. Their logo is often `<img src="placeholder" data-src="logo.png">`
//     swapped in by a lazy-load script we no longer run. The real source is
//     promoted (`data-src`, `data-lazy-src`, `data-srcset`, `data-bg`…).
//   · BURGERS. Their menu button is dead without their JS. Every element that is
//     recognisably a menu trigger is marked `data-carma-burger`; the SAFE PANEL
//     runtime (safePanel.ts) opens OUR menu — their complete link tree — from it.
//
// The page's CSP (pageCsp) then refuses any script whose hash we did not emit,
// so a tag this walk somehow missed still cannot run.

import { parseFragment, serialize } from 'parse5'

type P5Attr = { name: string; value: string; prefix?: string }
export type P5Node = {
  nodeName: string
  tagName?: string
  attrs?: P5Attr[]
  childNodes?: P5Node[]
  parentNode?: P5Node | null
  value?: string
  /** <template> keeps its children in `content`. */
  content?: P5Node
}

/** Elements that execute, embed another document, or re-point the page. */
const DROP = new Set([
  'script', 'noscript', 'template', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal',
  'fencedframe', 'base', 'meta', 'math', 'set', 'animate', 'animatemotion', 'animatetransform', 'discard',
  'handler', 'listener', 'xmp', 'plaintext', 'noembed', 'noframes',
])
/** `<link>` relations that are styling or a harmless hint — every other <link> goes. */
const SAFE_LINK_REL = /^(stylesheet|preconnect|dns-prefetch|icon|apple-touch-icon)$/i
/** Attributes whose value is a URL a browser may follow or load. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'ping', 'cite', 'longdesc', 'usemap', 'lowsrc', 'dynsrc', 'codebase', 'manifest', 'srcset', 'imagesrcset', 'xlink:href'])
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/

/** Map embeds a footer may carry (a business's address). Everything else is dropped. */
const IFRAME_ALLOW = [
  /^https:\/\/www\.google\.com\/maps\/embed/i,
  /^https:\/\/maps\.google\.[a-z.]+\/maps/i,
  /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html/i,
]

const schemeOf = (v: string) => v.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '').toLowerCase()

function unsafeUrl(attr: string, value: string): boolean {
  const candidates = attr === 'srcset' || attr === 'imagesrcset'
    ? value.split(',').map(p => p.trim().split(/\s+/)[0] ?? '')
    : [value]
  return candidates.some(c => {
    const v = schemeOf(c)
    if (/^(javascript|vbscript|livescript|mocha|jar):/.test(v)) return true
    if (v.startsWith('data:')) return !((attr === 'src' || attr === 'srcset' || attr === 'poster' || attr === 'xlink:href' || attr === 'href') && SAFE_DATA_IMAGE.test(v))
    return false
  })
}

const attr = (n: P5Node, name: string) => n.attrs?.find(a => a.name === name)?.value
function setAttr(n: P5Node, name: string, value: string) {
  const a = n.attrs?.find(x => x.name === name)
  if (a) a.value = value
  else (n.attrs ??= []).push({ name, value })
}

// ─── Lazy images ─────────────────────────────────────────────────────────────

const LAZY_SRC = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-src-retina']
const LAZY_SRCSET = ['data-srcset', 'data-lazy-srcset']
const LAZY_BG = ['data-bg', 'data-background', 'data-background-image', 'data-bg-src']
/** A `src` that is visibly a stand-in for the real image. */
const PLACEHOLDER = /^(data:image\/(gif|svg\+xml|png);|about:blank$)|(?:^|\/)(placeholder|blank|lazy|spacer|transparent|pixel)[^/]*\.(gif|png|svg|jpe?g|webp)(\?|$)/i

const isLoadableUrl = (v: string | undefined): v is string => !!v && (/^(https?:)?\/\//i.test(v) || v.startsWith('/'))

function promoteLazy(n: P5Node): void {
  const tag = n.tagName
  if (tag === 'img' || tag === 'source') {
    const lazy = LAZY_SRC.map(a => attr(n, a)).find(isLoadableUrl)
    const src = attr(n, 'src')
    if (lazy && (!src || PLACEHOLDER.test(src))) setAttr(n, tag === 'img' ? 'src' : 'srcset', lazy)
    const lazySet = LAZY_SRCSET.map(a => attr(n, a)).find(Boolean)
    if (lazySet && !attr(n, 'srcset')) setAttr(n, 'srcset', lazySet)
    if (tag === 'img' && !attr(n, 'loading')) setAttr(n, 'loading', 'lazy')
  }
  const bg = LAZY_BG.map(a => attr(n, a)).find(v => v && /^(https?:)?\/\//i.test(v) && !/[()'"\\;]/.test(v))
  if (bg) {
    const style = attr(n, 'style') ?? ''
    if (!/background(-image)?\s*:/i.test(style)) setAttr(n, 'style', `${style}${style && !style.trim().endsWith(';') ? ';' : ''}background-image:url("${bg}")`)
  }
}

// ─── Burgers ─────────────────────────────────────────────────────────────────
//
// Calibrated on the live lab (2026-10-07): the elements that actually opened a
// phone menu on 74 corpus sites. Theme families: Astra/GeneratePress `menu-toggle`,
// Elementor `elementor-menu-toggle`, Divi `et_mobile_nav_menu`/`mobile_menu_bar`,
// Avada `awb-icon-bars`, Bootstrap `navbar-toggle(r)`, Webflow `w-nav-button`,
// The7 `dt-mobile-menu-icon`, Enfold `av-hamburger`, Bricks, Qode, Flatsome…
// What it must NOT mark: the cookie-banner and popup buttons the lab's own
// heuristic tapped by mistake on six sites.

const BURGER_CLASS = /(^|[\s_-])(burger|hamburger|cburger|menuburger|menu-?toggle|toggle-?menu|nav-?toggle|navtoggle|navbar-?toggler?|toggle-?nav(bar)?|toggle-header-menu|mobile-?menu-?(icon|bar|btn|button|trigger|toggle|open|opener)|menu-?(btn|button|trigger|opener|icon|open)|btn-?menu|m-nav-btn|mobile_menu_bar|et_mobile_nav_menu|elementor-menu-toggle|awb-icon-bars|w-nav-button|dl-trigger|mm-toggle|header__burger|header__icon--menu|mobile-header-opener|drawer-hamburger|offcanvas-?toggle|off-canvas-?toggle|icon_menu|iconmenu|verticalmenutrigger|menu_buttons_container|toggle-menu-container|menu-toggle-button|bricks-mobile-menu-toggle|ast-mobile-menu-trigger|tggl-menu|mobile-nav-toggle|menu-hamburger|hamburger-menu)([\s_-]|$)/i
const BURGER_LABEL = /^\s*(menu|menú|menu principal|menú principal|main menu|navigation|navigation menu|toggle navigation|open menu|abrir menú|abrir menu|obrir (el )?menú|obre el menú|alternar menú|alternar menú móvil|commuta el menú|mobile menu|mobile menu button open|desplegar menú|toggle mobile menu)\s*$/i
// Substrings that only ever name a banner or a popup…
const NOT_A_BURGER = /(cookie|consent|cmplz|gdpr|rgpd|cookiebot|hustle|popmake|pum-|dialog-close|lightbox|newsletter)/i
// …and whole words that name another control. Whole words: arch-oxigen's real
// burger is `a.closed` ("Navigation Menu") — a substring rule would lose it.
const NOT_A_BURGER_WORD = /(^|[\s_-])(close|search|cart|carrito|cistella|login|account|cerca|buscar)([\s_-]|$)/i

function accessibleLabel(n: P5Node): string {
  return attr(n, 'aria-label') ?? attr(n, 'title') ?? (n.childNodes ?? []).filter(c => c.nodeName === '#text').map(c => c.value ?? '').join(' ').trim()
}

function isBurger(n: P5Node, insideDetails: boolean): boolean {
  const tag = n.tagName ?? ''
  if (!['button', 'a', 'div', 'span', 'label', 'summary', 'i'].includes(tag)) return false
  // A native <details> menu (Shopify Dawn) and a checkbox hack both work with
  // no script at all — leave them to the browser.
  if (tag === 'summary' || insideDetails) return false
  if (tag === 'label' && attr(n, 'for')) return false
  const cls = `${attr(n, 'class') ?? ''} ${attr(n, 'id') ?? ''}`
  const label = accessibleLabel(n)
  if (NOT_A_BURGER.test(cls) || NOT_A_BURGER.test(label) || NOT_A_BURGER_WORD.test(cls) || NOT_A_BURGER_WORD.test(label)) return false
  if (BURGER_CLASS.test(cls)) return true
  const interactive = tag === 'button' || tag === 'a' || attr(n, 'role') === 'button'
  if (interactive && attr(n, 'aria-controls') && attr(n, 'aria-expanded') !== undefined) return true
  return interactive && BURGER_LABEL.test(label)
}

// ─── The walk ────────────────────────────────────────────────────────────────

export type ScrubStats = { removed: number; handlers: number; urls: number; lazy: number; burgers: number; iframes: number }

function scrub(node: P5Node, stats: ScrubStats, insideDetails = false): void {
  const kids = node.childNodes ?? []
  for (let i = kids.length - 1; i >= 0; i--) {
    const c = kids[i]!
    const tag = typeof c.tagName === 'string' ? c.tagName.toLowerCase() : null
    if (tag !== null) {
      // An element whose name is not a plain tag name (`<scr<script>` parses as an
      // element literally called "scr<script") is never honest.
      if (DROP.has(tag) || !/^[a-z][a-z0-9-]*$/i.test(tag)) { kids.splice(i, 1); stats.removed++; continue }
      if (tag === 'link' && !SAFE_LINK_REL.test((attr(c, 'rel') ?? '').trim())) { kids.splice(i, 1); stats.removed++; continue }
      if (tag === 'iframe') {
        const src = attr(c, 'src') ?? ''
        if (!IFRAME_ALLOW.some(re => re.test(src))) { kids.splice(i, 1); stats.removed++; continue }
        c.attrs = [{ name: 'src', value: src }, { name: 'loading', value: 'lazy' },
          { name: 'sandbox', value: 'allow-scripts allow-same-origin allow-popups' },
          { name: 'referrerpolicy', value: 'no-referrer-when-downgrade' },
          ...(c.attrs ?? []).filter(a => /^(width|height|title|style|class)$/i.test(a.name))]
        stats.iframes++
        continue
      }
      if (c.attrs) {
        c.attrs = c.attrs.filter(a => {
          const name = a.name.toLowerCase()
          if (name.startsWith('on')) { stats.handlers++; return false }
          if (name === 'srcdoc' || name === 'shadowrootmode' || name === 'shadowroot' || name === 'is' || name === 'formaction') return false
          // A `<` or `>` in an attribute survives serialisation raw; dropping the
          // attribute closes the whole family of re-parse (mXSS) tricks.
          if (/[<>]/.test(a.value)) return false
          if (URL_ATTRS.has(name) && unsafeUrl(name, a.value)) { stats.urls++; return false }
          return true
        })
      }
      const hadLazy = LAZY_SRC.some(a => attr(c, a)) || LAZY_SRCSET.some(a => attr(c, a)) || LAZY_BG.some(a => attr(c, a))
      if (hadLazy) { promoteLazy(c); stats.lazy++ }
      if (isBurger(c, insideDetails)) { setAttr(c, 'data-carma-burger', ''); stats.burgers++ }
    }
    scrub(c, stats, insideDetails || tag === 'details')
  }
}

/** Remove everything executable from a parsed fragment, in place. */
export function scrubTree(root: P5Node): ScrubStats {
  const stats: ScrubStats = { removed: 0, handlers: 0, urls: 0, lazy: 0, burgers: 0, iframes: 0 }
  scrub(root, stats)
  return stats
}

/**
 * Parse → scrub → serialise, for one fragment of captured chrome. Never throws:
 * a fragment that cannot be parsed renders as nothing, never as itself.
 */
export function scrubChromeHtml(html: string): { html: string; stats: ScrubStats } {
  const empty: ScrubStats = { removed: 0, handlers: 0, urls: 0, lazy: 0, burgers: 0, iframes: 0 }
  if (!html?.trim()) return { html: '', stats: empty }
  try {
    const frag = parseFragment(html) as unknown as P5Node
    const stats = scrubTree(frag)
    return { html: serialize(frag as never), stats }
  } catch {
    return { html: '', stats: empty }
  }
}

/**
 * Their captured <head> assets, reduced to what styles a page: stylesheets,
 * <style> blocks, and connection hints. No script, no preload of a script, no
 * <meta http-equiv>, no <base>. (The compiled path already drops their stylesheets
 * in favour of its own blob; this is the legacy raw-injection path.)
 */
export function scrubHeadAssets(html: string): string {
  if (!html?.trim()) return ''
  try {
    const frag = parseFragment(html) as unknown as P5Node
    frag.childNodes = (frag.childNodes ?? []).filter(c => {
      const tag = c.tagName?.toLowerCase()
      if (!tag) return false
      if (tag === 'style') return true
      if (tag === 'link') return SAFE_LINK_REL.test((attr(c, 'rel') ?? '').trim()) || (/^preload$/i.test(attr(c, 'rel') ?? '') && /^(font|style|image)$/i.test(attr(c, 'as') ?? ''))
      return false
    })
    for (const c of frag.childNodes) {
      c.attrs = (c.attrs ?? []).filter(a => !a.name.toLowerCase().startsWith('on') && !(URL_ATTRS.has(a.name.toLowerCase()) && unsafeUrl(a.name.toLowerCase(), a.value)))
    }
    return serialize(frag as never)
  } catch {
    return ''
  }
}
