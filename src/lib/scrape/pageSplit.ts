// Top / Bottom page split — the spec-correct foundation of the 1:1 clone.
//
// GOAL: reproduce a human's "manual slice" — cut the raw HTML right before the
// main content block begins and right after it ends, leaving EVERY parent wrapper
// (the flex/grid shells, the max-width containers, the header and footer) fully
// intact. The blog renders in the gap.
//
// HOW (content RANGE carve — handles multi-section pages, not just one block):
//   1. Parse the whole document with parse5 — a spec-compliant HTML5 parser that
//      repairs unclosed tags / mis-nesting EXACTLY like a browser (node-html-parser
//      silently tolerates breakage and would mis-cut, so it can't be used here).
//   2. Find the CHROME as exactly two STRUCTURAL anchors: the topmost site header
//      (top-down) and the bottommost site footer (bottom-up from </body>), each
//      requiring a real chrome signal (header/footer tag, banner/contentinfo role,
//      or an unambiguous site-chrome class). NO depth cap — page builders (Wix,
//      Squarespace, Elementor) nest the footer 8-12 wrappers deep. Over-greedy
//      chrome (an unclosed <header> parse5 nested the page into) is dropped.
//   3. Score every element by CONTENT DENSITY (text + media + structure) and take
//      every element scoring above a relative threshold as a "content block". The
//      content CONTAINER is the lowest common ancestor (LCA) of all those blocks —
//      i.e. the wrapper whose children ARE the page's content sections (hero, grid,
//      cta…), sitting beside the header/footer inside their shared wrappers.
//   4. Replace the whole RANGE of that container's children that lies between the
//      header child (above) and the footer child (below) with ONE slot comment —
//      so EVERY content section is carved out together, never just the densest one
//      (the multi-section boundary regression). Everything else — all ancestors,
//      the header, the footer, late scripts — stays byte-for-byte. Serialise the
//      (balanced) <body> inner and split on the slot.
//
//   Top    = everything before the content node (wrapper open-tags left DANGLING).
//   Bottom = everything after it (those wrappers CLOSED + footer + late scripts).
//   The pair is NEVER balanced independently; the render's stitch (parse5) balances
//   Top + [blog] + Bottom into one well-formed document. `extracted_body_attrs`
//   carries the <body> class/style so the source's global background/type match.
//
// Pure + dependency-light (parse5 + our clientCss URL helpers). No DOM, no network.

import { parse, serialize, defaultTreeAdapter } from 'parse5'
import { absolutiseUrl, absolutiseCssUrls, proxyUseHref } from './clientCss'
import { MAX_REGION_HTML, shouldDropScript } from './headerFooter'

const SLOT_DATA = 'CARMA_BLOG_SLOT_7b3f9'
const SLOT_HTML = `<!--${SLOT_DATA}-->`

/** Bump on every behavioural change to the extraction heuristics — stored with
 *  each Grabber Eval review so stale reviews are attributable to an engine rev.
 *  (The batch runner ALSO hashes the source files; this is the human-readable tag.) */
export const ENGINE_VERSION = 'v2.0-structural-2026-07-13'

export type SplitStrategy = 'content' | 'none'

/** Introspection of HOW the split was made — consumed by the Grabber Eval Lab
 *  (accuracy metrics + human review) and by capture diagnostics. Additive:
 *  nothing in the render path depends on it. */
export type SplitMeta = {
  headerFound: boolean
  footerFound: boolean
  /** Compact anchor signature, e.g. `header#masthead.site-header` — for reports. */
  headerSig: string | null
  footerSig: string | null
  /** True when the content-density heuristic bailed and the structural
   *  chrome-boundary failsafe produced the range instead. */
  usedFallback: boolean
  /**
   * LINK REPAIR (2026-09-17). Measured across the cached Barcelona-100 before it
   * was written: 54% of captured chromes carried at least one link that could not
   * work on our origin. These counters make the fix visible in the Grabber Lab
   * and in the eval, rather than being an invisible behaviour change.
   */
  links: {
    /** Every `<a href>` in the captured chrome. */
    total: number
    /** `href="javascript:…"` — the source's own JS, on OUR origin. Neutralised. */
    scripted: number
    /** `href=""` — a dead click on a logo. Neutralised. */
    empty: number
    /** `href="#section"` whose target went out with the carved content. Neutralised. */
    deadFragment: number
  }
}

export type PageSplit = {
  /** Light-DOM HTML rendered BEFORE the blog (wrappers open across the gap). */
  top: string
  /** Light-DOM HTML rendered AFTER the blog (wrappers close + footer + late scripts). */
  bottom: string
  /** Serialised `<body>` attributes (class/style/data-*), sans the angle brackets. */
  bodyAttrs: string
  strategy: SplitStrategy
  meta: SplitMeta
}

// ─── parse5 tree shims ────────────────────────────────────────────────────────

type P5Attr = { name: string; value: string }
type P5Node = {
  nodeName: string
  tagName?: string
  attrs?: P5Attr[]
  childNodes?: P5Node[]
  parentNode?: P5Node | null
  value?: string
  content?: P5Node // <template>
}

const isElement = (n: P5Node): boolean => typeof n.tagName === 'string'
const tagOf = (n: P5Node): string => (n.tagName ?? '').toLowerCase()
const getAttr = (n: P5Node, name: string): string | null =>
  n.attrs?.find(a => a.name === name)?.value ?? null

// Pre-order walk INCLUDING <template> content — used by the tree cleaners, which
// must absolutise / strip everything regardless of where it lives.
function walk(node: P5Node, visit: (n: P5Node) => void): void {
  visit(node)
  for (const c of node.childNodes ?? []) walk(c, visit)
  if (node.content) walk(node.content, visit)
}

function findFirst(root: P5Node, pred: (n: P5Node) => boolean): P5Node | null {
  let hit: P5Node | null = null
  walk(root, n => { if (!hit && pred(n)) hit = n })
  return hit
}

// DOM-only element visitor (does NOT descend into <template> content), so every
// node it yields is reachable from <body> by parentNode — i.e. really sliceable.
function eachEl(root: P5Node, visit: (n: P5Node) => void): void {
  for (const c of root.childNodes ?? []) {
    if (isElement(c)) visit(c)
    eachEl(c, visit)
  }
}

function isAncestor(ancestor: P5Node, node: P5Node): boolean {
  let p = node.parentNode ?? null
  while (p) { if (p === ancestor) return true; p = p.parentNode ?? null }
  return false
}

// ─── Chrome anchors (structural + positional, NO depth cap) ─────────────────────
// Chrome is NOT matched by broad selector tables (those misclassify in-content
// navs / breadcrumbs / pagination / article `.page-header`s as chrome and so
// FRAGMENT the content detection — the boundary-misdetection regression). Instead
// chrome is exactly TWO anchors found by structure + position: the TOPMOST site
// header (scanned top-down) and the BOTTOMMOST site footer (scanned bottom-up from
// </body>), each requiring a real chrome signal (header/footer tag, banner/
// contentinfo role, or an unambiguous site-chrome class name). There is NO depth
// cap: page builders (Wix, Squarespace, Elementor) routinely bury the structural
// footer 8-12 wrappers deep, and a depth cap silently missed it — the cause of the
// "blog renders below the footer" injection failure. Position (first header / last
// footer) is what keeps in-content navs and article footers from being picked.

const HEADER_HINT = /(?:^|[\s_-])(?:masthead|site-?header|main-?header|global-?header|primary-?header|l-header|topbar|top-?bar|site-?nav|main-?nav|primary-?nav|navbar)(?:$|[\s_-])/i
const FOOTER_HINT = /(?:^|[\s_-])(?:colophon|site-?footer|main-?footer|global-?footer|page-?footer|primary-?footer|l-footer)(?:$|[\s_-])/i

// ── WEAK tier (Engine v2, eval-driven 2026-07-13) ────────────────────────────
// The Barcelona-100 eval showed the strict tier misses a large real-world class
// of chrome: theme-prefixed names (`fusion-footer` — Avada, `mdl-footer`,
// `panel_footer`), camelCase (`mainFooter`), and Catalan/Spanish naming
// (`peu-de-pagina`, `cabecera`, `capçalera→capcalera`, `encabezado`, `colofon`,
// `rodape`). The weak tier matches those by WORD, but is consulted ONLY when the
// strict tier found nothing, and never on an element whose name marks it as
// IN-CONTENT chrome (entry-footer, card-header…) — the historical fragmentation
// trap that killed suffix-matching stays closed.
// In-content / subcomponent exclusions for the WEAK tier. Three shapes, all
// found live on the Barcelona-100:
//   · `entry-footer`, `page-header` (WP title band) — SEPARATOR-required prefix,
//     so `PageHeaderNavigation` (a REAL site header) still qualifies;
//   · BEM `X__header` / `X__footer` — the header OF a component, never the site's
//     (`MobileMenu__header` anchored a whole page at its hamburger drawer);
//   · mobile-menu contexts (`header-mobile-menu`) — drawers, not the header.
const FOOTER_WORD = /footer|colophon|(?:^|[\s_-])(?:peu|pie|colofon|rodape)(?:$|[\s_-])/i
const FOOTER_IN_CONTENT = /(?:^|[\s_-])(?:entry|post|article|card|comment|widget|item|product|caption|section|block|module)[-_]footer(?:$|[\s_-])|__footer(?:$|[\s_-])|footer[-_]?mobile/i
const HEADER_WORD = /header|masthead|(?:^|[\s_-])(?:cabecera|capcalera|encabezado)(?:$|[\s_-])/i
const HEADER_IN_CONTENT = /(?:^|[\s_-])(?:entry|post|article|card|comment|widget|item|product|caption|section|block|module|page|hero|banner)[-_]header(?:$|[\s_-])|__header(?:$|[\s_-])|header[-_]?mobile|(?:^|[\s_-])(?:mobile|hamburger|burger)[-_]?(?:menu|nav)/i

// Overlay/consent junk: NEVER a chrome anchor, NEVER a content block. These are
// out-of-flow layers (cookie bars, lightboxes, modals, back-to-top) whose text
// mass and "top-bar"-style class names poisoned both the density pivot and the
// anchor search (a PhotoSwipe `pswp__top-bar` was picked as a site header).
// CONSENT vocabulary is unambiguous (a cookie modal is never the page shell) so
// it taints regardless of size; LAYOUT vocabulary (offcanvas, modal, drawer…) is
// also how themes name their page WRAPPERS (Drupal `dialog-off-canvas-main-canvas`,
// UIkit `uk-offcanvas-content`), so it only taints under the mass guard.
const CONSENT_HINT = /(?:^|[\s_-])(?:cookie|consent|gdpr|cmplz|onetrust)(?:$|[\s_-])|cli-modal|cli-bar|cookie-law/i
const OVERLAY_HINT = /(?:^|[\s_-])(?:modal|popup|backdrop|preloader|offcanvas|off-canvas|lightbox|fancybox|pswp|mfp|drawer|to-?top|scroll-?top|back-?to-?top)(?:$|[\s_-])|pswp__/i

const hintHaystack = (el: P5Node): string => `${getAttr(el, 'id') ?? ''} ${getAttr(el, 'class') ?? ''}`
const roleOf = (el: P5Node): string => (getAttr(el, 'role') ?? '').toLowerCase()

/**
 * Every node inside an overlay layer (the layer element itself included).
 * MASS GUARD: a real overlay (modal, lightbox, drawer) is SMALL relative to the
 * page — an element matching a layout-overlay word while holding a big share of
 * the page text is the page SHELL, not an overlay (Drupal wraps the whole page
 * in `dialog-off-canvas-main-canvas`, UIkit in `uk-offcanvas-content`; tainting
 * those blanked the capture). Consent layers (cookie/GDPR) taint at ANY size —
 * verbose GDPR modals can outweigh a small page's real text.
 */
function collectOverlayTainted(body: P5Node, stats: Map<P5Node, Stats>): Set<P5Node> {
  const total = stats.get(body)?.text ?? 0
  const cap = total * 0.4
  const tainted = new Set<P5Node>()
  const mark = (n: P5Node) => walk(n, x => tainted.add(x))
  eachEl(body, el => {
    if (tainted.has(el)) return
    const hay = hintHaystack(el)
    if (CONSENT_HINT.test(hay)) { mark(el); return }
    if (OVERLAY_HINT.test(hay) && (stats.get(el)?.text ?? 0) <= cap) mark(el)
  })
  return tainted
}

const isWeakHeader = (el: P5Node): boolean => {
  const hay = hintHaystack(el)
  return HEADER_WORD.test(hay) && !HEADER_IN_CONTENT.test(hay)
}
const isWeakFooter = (el: P5Node): boolean => {
  const hay = hintHaystack(el)
  return FOOTER_WORD.test(hay) && !FOOTER_IN_CONTENT.test(hay)
}

// Copyright tier: language-independent LAST-RESORT footer signal for sites whose
// markup carries no usable names at all (CSS-in-JS `jss593` classes). A small
// bottom-of-document element whose text holds a © / rights notice IS the footer.
const COPYRIGHT_RE = /©|&copy;|copyright|tots els drets|todos los derechos|all rights reserved|drets reservats|derechos reservados/i

function subtreeText(el: P5Node, cap = 4000): string {
  let out = ''
  const rec = (n: P5Node): void => {
    if (out.length > cap) return
    if (isElement(n)) {
      const t = tagOf(n)
      if (t === 'script' || t === 'style' || t === 'noscript' || t === 'template') return
    }
    if (n.nodeName === '#text' && typeof n.value === 'string') out += n.value
    for (const c of n.childNodes ?? []) rec(c)
  }
  rec(el)
  return out
}

// Whether the element carries `id="header"`/`class="header"` (or footer) as an
// EXACT token — the bare, un-prefixed chrome name countless sites use instead of a
// semantic <header>/<footer> tag or a "site-header" hint. We match the whole token
// only (`page-header`, `entry-footer` etc. are NOT exact "header"/"footer"), so the
// in-content fragmentation that suffix-matching caused can't recur; positional
// anchoring (topmost header / bottommost footer) handles any stray same-named block.
const hasExactToken = (el: P5Node, word: string): boolean => {
  if ((getAttr(el, 'id') ?? '').toLowerCase() === word) return true
  return (getAttr(el, 'class') ?? '').toLowerCase().split(/\s+/).includes(word)
}

const isStrongHeader = (el: P5Node): boolean =>
  roleOf(el) === 'banner' || tagOf(el) === 'header' ||
  HEADER_HINT.test(hintHaystack(el)) || hasExactToken(el, 'header')
const isStrongFooter = (el: P5Node): boolean =>
  roleOf(el) === 'contentinfo' || tagOf(el) === 'footer' ||
  FOOTER_HINT.test(hintHaystack(el)) || hasExactToken(el, 'footer')

function countTag(el: P5Node, name: string): number {
  let n = 0
  walk(el, c => { if (isElement(c) && tagOf(c) === name) n++ })
  return n
}

// Lift a found anchor to its OUTERMOST same-kind ancestor (capped at <body>), so a
// <header> wrapped in <div class="site-header"> (or a deeply-nested footer wrapped
// in <div class="site-footer">) captures the full chrome wrapper, not just the
// inner tag. Generic non-chrome wrappers in between are left to the slice bounds.
function liftAnchor(node: P5Node, body: P5Node, strong: (n: P5Node) => boolean): P5Node {
  let cur = node
  while (cur.parentNode && cur.parentNode !== body && strong(cur.parentNode)) cur = cur.parentNode
  return cur
}

// Topmost site-header, searched in tiers (each consulted only when the previous
// found nothing, and always skipping overlay layers):
//   1. STRONG — semantic tag/role/site-chrome class (first in document order, lifted).
//   2. WEAK   — any word-match on header/masthead/cabecera/capçalera… that is not an
//               in-content header (entry-header, page-header hero bands…).
//   3. NAV    — the first top-of-page <nav> with real links.
function findHeaderAnchor(body: P5Node, els: P5Node[], tainted: Set<P5Node>): P5Node | null {
  for (const el of els) {
    if (tainted.has(el)) continue
    if (isStrongHeader(el)) return liftAnchor(el, body, isStrongHeader)
  }
  for (const el of els) {
    if (tainted.has(el)) continue
    if (isWeakHeader(el)) return liftAnchor(el, body, (n) => isStrongHeader(n) || isWeakHeader(n))
  }
  const half = Math.max(1, Math.floor(els.length / 2))
  for (let i = 0; i < half; i++) {
    if (tainted.has(els[i])) continue
    if (tagOf(els[i]) === 'nav' && countTag(els[i], 'a') >= 2) return els[i]
  }
  return null
}
// Bottommost site-footer, in tiers (bottom-up so an article's own <footer> never
// wins over the site footer below it; lifted to its outermost wrapper; overlay
// layers skipped):
//   1. STRONG    — semantic tag/role/site-chrome class.
//   2. WEAK      — word-match on footer/colophon/peu/pie… minus in-content names.
//   3. COPYRIGHT — a small bottom-of-document element holding a © / rights notice
//                  (the only signal CSS-in-JS sites emit).
function findFooterAnchor(body: P5Node, els: P5Node[], tainted: Set<P5Node>): P5Node | null {
  for (let i = els.length - 1; i >= 0; i--) {
    if (tainted.has(els[i])) continue
    if (isStrongFooter(els[i])) return liftAnchor(els[i], body, isStrongFooter)
  }
  for (let i = els.length - 1; i >= 0; i--) {
    if (tainted.has(els[i])) continue
    if (isWeakFooter(els[i])) return liftAnchor(els[i], body, (n) => isStrongFooter(n) || isWeakFooter(n))
  }
  // Copyright tier — only the last 40% of the document, and only compact blocks
  // (a © inside a page-wide wrapper must not anchor the whole page as footer).
  const from = Math.floor(els.length * 0.6)
  for (let i = els.length - 1; i >= from; i--) {
    const el = els[i]
    if (tainted.has(el)) continue
    const text = subtreeText(el, 2200)
    if (text.length > 2000 || !COPYRIGHT_RE.test(text)) continue
    // Lift while the parent adds little extra text — climbing the footer's own
    // wrappers (nav columns, social rows) but stopping before the page shell.
    let cur = el
    while (cur.parentNode && cur.parentNode !== body) {
      const parentText = subtreeText(cur.parentNode, 4000)
      if (parentText.length > Math.max(text.length * 2.5, text.length + 900)) break
      cur = cur.parentNode
    }
    return cur
  }
  return null
}

// ─── Content-density scoring ────────────────────────────────────────────────
// One memoised post-order pass over the DOM (no <template> content) computes, per
// node, the aggregate text length + media + structural element counts of its
// subtree. The content score rewards prose, images and headings — so it peaks on
// an ARTICLE body AND on a blog-index card grid alike (cards are image-rich), and
// because it aggregates upward it's monotonic toward the largest content block.

type Stats = { text: number; imgs: number; ps: number; hs: number }

function computeStats(root: P5Node): Map<P5Node, Stats> {
  const m = new Map<P5Node, Stats>()
  const ZERO: Stats = { text: 0, imgs: 0, ps: 0, hs: 0 }
  const rec = (n: P5Node): Stats => {
    const s: Stats = { text: 0, imgs: 0, ps: 0, hs: 0 }
    if (!isElement(n)) {
      if (n.nodeName === '#text' && typeof n.value === 'string') s.text = n.value.trim().length
      m.set(n, s)
      return s
    }
    const t = tagOf(n)
    // Script/style/noscript text is CODE, not content — counting it made a 9KB
    // inline <style> the densest "content block" on real pages (Barcelona-100
    // eval), hijacking the pivot and corrupting the whole carve.
    if (t === 'script' || t === 'style' || t === 'noscript' || t === 'template') {
      m.set(n, ZERO)
      return ZERO
    }
    for (const c of n.childNodes ?? []) {
      const cs = rec(c)
      s.text += cs.text; s.imgs += cs.imgs; s.ps += cs.ps; s.hs += cs.hs
    }
    if (t === 'img' || t === 'picture' || t === 'svg' || t === 'video') s.imgs += 1
    else if (t === 'p') s.ps += 1
    else if (t === 'h1' || t === 'h2' || t === 'h3' || t === 'h4') s.hs += 1
    m.set(n, s)
    return s
  }
  rec(root)
  return m
}

// Text length DOMINATES (real content is text-heavy); images carry weight too so
// an image-rich card grid (little prose) still wins; paragraphs/headings are only
// light tie-breakers — never enough to let a stray <p>x</p> beat a real block.
const scoreOf = (stats: Map<P5Node, Stats>, n: P5Node): number => {
  const s = stats.get(n)
  return s ? s.text + 50 * s.imgs + 8 * s.ps + 8 * s.hs : 0
}

// A contiguous run of `parent.childNodes[startIdx..endIdx]` (inclusive) to replace
// with the single blog slot. Everything before it serialises into Top, everything
// after into Bottom.
type ContentRange = { parent: P5Node; startIdx: number; endIdx: number }

// Lowest common ancestor of two nodes (walking parentNode chains). null if they
// share no ancestor (different trees — shouldn't happen within one <body>).
function lcaOf(a: P5Node, b: P5Node): P5Node | null {
  const seen = new Set<P5Node>()
  for (let p: P5Node | null = a; p; p = p.parentNode ?? null) seen.add(p)
  for (let p: P5Node | null = b; p; p = p.parentNode ?? null) { if (seen.has(p)) return p }
  return null
}

// The direct child of `parent` that is `node` itself or an ancestor of it; null if
// `node` is not within `parent`. Used to find where the header/footer sits among
// the container's children, so the slice never crosses it.
function childContaining(parent: P5Node, node: P5Node | null): P5Node | null {
  if (!node) return null
  let cur: P5Node | null = node
  while (cur && cur.parentNode) {
    if (cur.parentNode === parent) return cur
    cur = cur.parentNode
  }
  return null
}

// A content block must score at least this (absolute), AND at least this fraction
// of the best block — so noise (a stray <p>, a cookie line) never widens the range,
// but every real section (hero, grid, cta) qualifies.
const MIN_BLOCK_SCORE = 40
const BLOCK_FRACTION = 0.05

// Compact human-readable anchor signature for reports: `header#masthead.site-header`.
const anchorSig = (n: P5Node | null): string | null => {
  if (!n) return null
  const id = getAttr(n, 'id')
  const cls = (getAttr(n, 'class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return `${tagOf(n)}${id ? `#${id}` : ''}${cls.length ? '.' + cls.join('.') : ''}`
}

const EMPTY_LINKS = { total: 0, scripted: 0, empty: 0, deadFragment: 0 }

const EMPTY_META: SplitMeta = {
  headerFound: false, footerFound: false, headerSig: null, footerSig: null, usedFallback: false,
  links: { ...EMPTY_LINKS },
}

/**
 * The RANGE of sibling nodes to replace with the blog slot — the full content area
 * (all of its sections) that sits BETWEEN the header and footer inside their shared
 * wrappers. Replaces the old single-node model so multi-section homepages keep ALL
 * their content carved out together (none leaking into the header/footer halves).
 * `range` is null when there's no chrome or no real content (→ default blog, no
 * chrome); `meta` always reports what WAS structurally found, for the Eval Lab.
 */
function findContentRange(body: P5Node): { range: ContentRange | null; meta: SplitMeta } {
  const els: P5Node[] = []
  eachEl(body, n => els.push(n))
  if (!els.length) return { range: null, meta: EMPTY_META }

  // Overlay layers (cookie bars, modals, lightboxes, back-to-top) are OUT OF
  // FLOW: they can neither anchor the chrome nor count as content blocks. The
  // density stats are computed up-front so the taint pass can mass-guard.
  const stats = computeStats(body)
  const tainted = collectOverlayTainted(body, stats)

  // 1. Chrome = two POSITIONAL anchors: the topmost site-header + bottommost
  //    site-footer. Nothing in between (the content) can be mistaken for chrome.
  let headerAnchor = findHeaderAnchor(body, els, tainted)
  let footerAnchor = findFooterAnchor(body, els, tainted)
  // Order sanity: the header must precede the footer in document order.
  if (headerAnchor && footerAnchor && els.indexOf(headerAnchor) >= els.indexOf(footerAnchor)) {
    footerAnchor = null
  }
  // Over-greedy / unclosed: if one anchor WRAPS the other (parse5 nested the page
  // into an unclosed tag), drop the outer wrapper so it can't mask the content.
  if (headerAnchor && footerAnchor) {
    if (isAncestor(headerAnchor, footerAnchor)) headerAnchor = null
    else if (isAncestor(footerAnchor, headerAnchor)) footerAnchor = null
  }
  // Meta accessors — anchors are settled from here on; `usedFallback` flips when
  // the density heuristic bails and the structural failsafe takes over.
  let usedFallback = false
  const meta = (): SplitMeta => ({
    headerFound: !!headerAnchor, footerFound: !!footerAnchor,
    headerSig: anchorSig(headerAnchor), footerSig: anchorSig(footerAnchor),
    usedFallback,
    // Filled by splitPageChrome once both halves exist — see EMPTY_LINKS.
    links: { ...EMPTY_LINKS },
  })
  const done = (range: ContentRange | null) => ({ range, meta: meta() })

  // No chrome at all → there's nothing to clone; render the default blog.
  if (!headerAnchor && !footerAnchor) return done(null)
  const chrome = [headerAnchor, footerAnchor].filter((c): c is P5Node => !!c)

  // 2. Membership sets: chromeOrInside (a chrome node or any descendant of one) and
  //    chromeAncestors (any element that CONTAINS chrome — a global wrapper).
  const chromeOrInside = new Set<P5Node>()
  for (const c of chrome) walk(c, n => chromeOrInside.add(n))
  const chromeAncestors = new Set<P5Node>()
  for (const c of chrome) {
    let p = c.parentNode ?? null
    while (p && p !== body) { chromeAncestors.add(p); p = p.parentNode ?? null }
  }
  // A real content element: neither chrome, inside chrome, a chrome-bracketing
  // wrapper, nor an out-of-flow overlay layer. (The chosen container MAY be a
  // chrome-ancestor — see step 4 — but the content BLOCKS and the sliced
  // CHILDREN never are.)
  const isContent = (el: P5Node): boolean =>
    !chromeOrInside.has(el) && !chromeAncestors.has(el) && !tainted.has(el)

  // FAILSAFE: every bail-out below routes through here instead of returning null.
  // We already have the header/footer anchors — so when the content-density
  // heuristic can't isolate a content block (a chrome-heavy page, a near-empty body,
  // an unusual layout), we still slice STRUCTURALLY at the chrome boundary rather
  // than discarding the chrome. Guarantees: anchors found ⟹ chrome preserved. Slots
  // the gap between the header and footer (or everything beside a lone anchor); if
  // they are adjacent, inserts an empty slot between them (the blog renders there).
  const fallback = (): ContentRange | null => {
    usedFallback = true
    let fParent: P5Node = headerAnchor && footerAnchor
      ? (lcaOf(headerAnchor, footerAnchor) ?? body)
      : body
    // DESCEND while both anchors sit inside the SAME child (Engine v2): builder
    // themes nest the footer INSIDE the content wrapper (Divi: #main-footer in
    // #et-main-area), so the naive LCA slice degenerated to an empty insert and
    // the whole content area leaked into the bottom half. Narrowing into the
    // shared child until the anchors diverge slots the REAL gap between them.
    for (;;) {
      const hc = childContaining(fParent, headerAnchor)
      const fc = childContaining(fParent, footerAnchor)
      if (hc && fc && hc === fc) { fParent = hc; continue }
      break
    }
    const fkids = fParent.childNodes ?? []
    if (!fkids.length) return null
    const hChild = childContaining(fParent, headerAnchor)
    const fChild = childContaining(fParent, footerAnchor)
    const s = hChild ? fkids.indexOf(hChild) + 1 : 0
    let e = fChild ? fkids.indexOf(fChild) - 1 : fkids.length - 1
    if (e < s - 1) e = s - 1 // header & footer adjacent → insert, remove nothing
    if (s < 0 || s > fkids.length) return null
    return { parent: fParent, startIdx: s, endIdx: e }
  }

  // 3. Content blocks = every content element scoring above the relative threshold.
  let pivot: P5Node | null = null
  let bestScore = 0
  for (const el of els) {
    if (!isContent(el)) continue
    const sc = scoreOf(stats, el)
    if (sc > bestScore) { bestScore = sc; pivot = el }
  }
  if (!pivot || bestScore <= 0) return done(fallback()) // chrome but no scorable content

  const threshold = Math.max(MIN_BLOCK_SCORE, bestScore * BLOCK_FRACTION)
  let blocks = els.filter(el => isContent(el) && scoreOf(stats, el) >= threshold)
  if (!blocks.length) blocks = [pivot]

  // 4. The content CONTAINER = the lowest common ancestor of every content block.
  //    We keep this wrapper and replace a RANGE of its children — so a multi-section
  //    page (hero + grid + cta) is sliced out as ONE block, not just the densest.
  //    The LCA descends through chrome-bracketing wrappers automatically (those are
  //    excluded from `blocks`), so the container is the tightest shared content
  //    parent — which MAY itself be a chrome-ancestor (e.g. <div id=page> that holds
  //    header, the sections AND footer); that's fine, the slice is bounded below.
  let parent: P5Node = blocks[0]
  for (let i = 1; i < blocks.length; i++) {
    const lca = lcaOf(parent, blocks[i])
    if (lca) parent = lca
  }
  if (chromeOrInside.has(parent)) return done(fallback())
  const kids = parent.childNodes ?? []
  if (!kids.length) return done(fallback())

  // 5. Bound the slice by the chrome that lives INSIDE this container: never cross
  //    the header child (above) or the footer child (below).
  const headerChild = childContaining(parent, headerAnchor)
  const footerChild = childContaining(parent, footerAnchor)
  const hIdx = headerChild ? kids.indexOf(headerChild) : -1
  const fIdx = footerChild ? kids.indexOf(footerChild) : kids.length

  // 6. The content children of the container, within the (header, footer) bounds.
  const contentIdx: number[] = []
  for (let i = 0; i < kids.length; i++) {
    if (i <= hIdx || i >= fIdx) continue
    const k = kids[i]
    if (!isElement(k) || !isContent(k)) continue
    if (scoreOf(stats, k) >= threshold) contentIdx.push(i)
  }
  if (!contentIdx.length) {
    // Tiny page: nothing cleared the bar — take every in-bounds content child.
    for (let i = 0; i < kids.length; i++) {
      if (i > hIdx && i < fIdx && isElement(kids[i]) && isContent(kids[i])) contentIdx.push(i)
    }
    if (!contentIdx.length) return done(fallback())
  }
  let startIdx = contentIdx[0]
  let endIdx = contentIdx[contentIdx.length - 1]

  // 7. Expand to swallow non-content GAPS so NOTHING between header and footer leaks
  //    into the chrome halves:
  //      · header found in this container → start right AFTER it (eat any breadcrumb
  //        / page-title gap before the first section).
  //      · footer found in this container → end right BEFORE it.
  //      · chrome NOT in this container but it's an inner content wrapper (≠ <body>)
  //        → take ALL its children (the full content area, e.g. <main>'s contents).
  if (hIdx >= 0) startIdx = hIdx + 1
  else if (parent !== body) {
    const firstEl = kids.findIndex(isElement)
    if (firstEl >= 0) startIdx = Math.min(startIdx, firstEl)
  }
  if (fIdx < kids.length) endIdx = fIdx - 1
  else if (parent !== body) {
    for (let i = kids.length - 1; i >= 0; i--) {
      if (isElement(kids[i])) { endIdx = Math.max(endIdx, i); break }
    }
  }

  if (startIdx < 0 || endIdx < startIdx || endIdx >= kids.length) return done(fallback())
  return done({ parent, startIdx, endIdx })
}

// ─── Tree mutation (absolutise / sanitise / slot) ──────────────────────────────

/**
 * HREFS THAT CANNOT WORK ON OUR ORIGIN (2026-09-17).
 *
 * Two of them, and the first is a security bug as much as a broken link:
 *
 *   javascript:  the source's own script, now running on OUR domain, with our
 *                cookies. It never does anything useful either — whatever bound
 *                it was left behind with the page it came from. Eleven of these
 *                were sitting in the Barcelona-100.
 *   href=""      resolves to the CURRENT page, so a logo click reloads the blog
 *                and looks like a dead button. Thirty-two of those.
 *
 * Both become `#`, which is what a site's own inert menu anchors already use —
 * so they are indistinguishable from a control that was never meant to navigate.
 */
function repairHref(value: string): { value: string; scripted: boolean; empty: boolean } {
  const v = value.trim()
  if (/^javascript:/i.test(v)) return { value: '#', scripted: true, empty: false }
  if (v === '') return { value: '#', scripted: false, empty: true }
  return { value, scripted: false, empty: false }
}

function absolutiseTree(root: P5Node, base: URL, tally?: { total: number; scripted: number; empty: number }): void {
  walk(root, n => {
    if (!isElement(n) || !n.attrs) return
    const isUse = tagOf(n) === 'use'
    const isAnchor = tagOf(n) === 'a'
    for (const a of n.attrs) {
      if (a.name === 'href' || a.name === 'xlink:href') {
        if (isAnchor && a.name === 'href') {
          if (tally) tally.total++
          const fixed = repairHref(a.value)
          if (fixed.scripted && tally) tally.scripted++
          if (fixed.empty && tally) tally.empty++
          if (fixed.value === '#') { a.value = '#'; continue }
        }
        // SVG <use> external sprite refs must go same-origin (cross-origin <use>
        // is blocked) — route via the proxy; everything else just absolutises.
        a.value = isUse ? proxyUseHref(a.value, base) : absolutiseUrl(a.value, base)
      } else if (a.name === 'src' || a.name === 'poster') {
        a.value = absolutiseUrl(a.value, base)
      } else if (a.name === 'srcset') {
        a.value = a.value.split(',').map(part => {
          const seg = part.trim().split(/\s+/)
          if (seg[0]) seg[0] = absolutiseUrl(seg[0], base)
          return seg.join(' ')
        }).join(', ')
      } else if (a.name === 'style' && /url\(/i.test(a.value)) {
        a.value = absolutiseCssUrls(a.value, base)
      }
    }
  })
}

// Strip inline on*-handlers (cheap XSS vector) from every element.
function stripOnHandlers(root: P5Node): void {
  walk(root, n => {
    if (!isElement(n) || !n.attrs) return
    n.attrs = n.attrs.filter(a => !/^on/i.test(a.name))
  })
}

function detach(node: P5Node): void {
  const p = node.parentNode
  if (!p?.childNodes) return
  const i = p.childNodes.indexOf(node)
  if (i >= 0) p.childNodes.splice(i, 1)
}

// Remove ONLY scripts that would hijack/blank the page (SPA bootstraps, redirects,
// service workers) + pure trackers; every <noscript> (duplicate markup / pixels)
// and the client's JSON-LD (we emit our own). The client's REAL menu/dropdown
// scripts are deliberately KEPT — see headerFooter.shouldDropScript.
function sanitiseScripts(root: P5Node): void {
  const doomed: P5Node[] = []
  walk(root, n => {
    if (!isElement(n)) return
    const t = tagOf(n)
    if (t === 'noscript') { doomed.push(n); return }
    if (t !== 'script') return
    const type = (getAttr(n, 'type') ?? '').toLowerCase()
    if (type.includes('ld+json') || type.includes('application/json')) { doomed.push(n); return }
    const inline = (n.childNodes ?? []).map(c => c.value ?? '').join('')
    if (shouldDropScript(getAttr(n, 'src'), inline)) doomed.push(n)
  })
  for (const n of doomed) detach(n)
}

// Replace the inclusive child range [startIdx..endIdx] with one slot comment.
// Replace the inclusive child range [startIdx..endIdx] with one slot comment.
// `endIdx === startIdx - 1` is a valid degenerate range meaning INSERT the slot at
// `startIdx` removing nothing — used by the failsafe when the header and footer are
// adjacent (no content node between them to replace).
function replaceRangeWithSlot(range: ContentRange): boolean {
  const { parent, startIdx, endIdx } = range
  const kids = parent.childNodes
  if (!kids || startIdx < 0 || startIdx > kids.length || endIdx < startIdx - 1 || endIdx >= kids.length) return false
  const slot = defaultTreeAdapter.createCommentNode(SLOT_DATA) as unknown as P5Node
  slot.parentNode = parent
  kids.splice(startIdx, endIdx - startIdx + 1, slot) // count 0 when endIdx === startIdx-1 → pure insert
  return true
}

// ─── Serialisation ────────────────────────────────────────────────────────────

function serializeBodyAttrs(body: P5Node): string {
  const attrs = (body.attrs ?? []).filter(a => !/^on/i.test(a.name))
  if (!attrs.length) return ''
  return attrs
    .map(a => (a.value === '' ? a.name : `${a.name}="${a.value.replace(/"/g, '&quot;')}"`))
    .join(' ')
}

const serializeNode = serialize as unknown as (node: P5Node) => string
const innerHtml = (node: P5Node): string => serializeNode(node)
// Size cap that never cuts MID-TAG: a blind slice could end inside `<div cla…`,
// and that torn tag then swallowed/garbled everything stitched after it (one of
// the "clone came out broken" edge cases). Cutting at the last completed `>`
// keeps the output parseable — parse5 balances any still-open elements at render.
const cap = (s: string): string => {
  if (s.length <= MAX_REGION_HTML) return s
  const cut = s.lastIndexOf('>', MAX_REGION_HTML)
  return s.slice(0, cut > 0 ? cut + 1 : MAX_REGION_HTML)
}

function serializeAttrs(el: P5Node): string {
  return (el.attrs ?? [])
    .filter(a => !/^on/i.test(a.name))
    .map(a => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`))
    .join('')
}
const outerHtml = (el: P5Node): string => `<${tagOf(el)}${serializeAttrs(el)}>${innerHtml(el)}</${tagOf(el)}>`

const containsSymbol = (svg: P5Node): boolean => {
  let found = false
  walk(svg, n => { if (isElement(n) && tagOf(n) === 'symbol') found = true })
  return found
}

// Inline SVG SPRITE defs (`<svg>` holding `<symbol>`s) that live inside the carved
// content would be lost, breaking every `<use href="#id">`. Collect their outer
// HTML so the caller can HOIST them above the blog (kept in the light DOM).
function collectSpriteDefs(node: P5Node): string {
  const out: string[] = []
  walk(node, n => { if (isElement(n) && tagOf(n) === 'svg' && containsSymbol(n)) out.push(outerHtml(n)) })
  return out.join('\n')
}

function splitOnSlot(inner: string): [string, string] | [null, null] {
  const idx = inner.indexOf(SLOT_HTML)
  if (idx < 0) return [null, null]
  return [inner.slice(0, idx), inner.slice(idx + SLOT_HTML.length)]
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Split a fetched page into a render-ready Top / Bottom sandwich + body attrs.
 *   · `strategy:'content'` — the content range was found and slotted; Top/Bottom are
 *     intentionally UNBALANCED (wrappers span the gap), balanced at render time.
 *   · `strategy:'none'`    — no chrome / no content block (→ default blog, no chrome).
 */
/**
 * FRAGMENT LINKS WHOSE TARGET WENT OUT WITH THE CONTENT.
 *
 * A "skip to content" link, an on-page nav pointing at `#serveis`, a footer
 * shortcut back to `#dalt`: all of them pointed INTO the region we carved out, so
 * on the clone they resolve to nothing and the browser does nothing. Seventy-eight
 * of them across the Barcelona-100, on 54% of sites when counted with the rest.
 *
 * `#` is the honest replacement: it is what an inert control already looks like,
 * and it leaves the visible label untouched. We deliberately do NOT re-point them
 * at our own content — a menu item labelled "Serveis" must not start meaning
 * "the blog".
 *
 * Runs on the ASSEMBLED chrome, because only then do we know which ids survived.
 */
function neutraliseDeadFragments(html: string, ids: Set<string>): { html: string; fixed: number } {
  let fixed = 0
  const out = html.replace(/(<a\b[^>]*\bhref\s*=\s*)("#[^"]*"|'#[^']*')/gi, (m, head: string, quoted: string) => {
    const q = quoted[0]
    const target = quoted.slice(2, -1) // drop the quote and the '#'
    if (!target || ids.has(target)) return m
    fixed++
    return `${head}${q}#${q}`
  })
  return { html: out, fixed }
}

/** Every id present in the assembled chrome — the surviving anchor targets. */
function idsIn(html: string): Set<string> {
  const ids = new Set<string>()
  for (const m of html.matchAll(/\bid\s*=\s*"([^"]*)"|\bid\s*=\s*'([^']*)'/gi)) {
    const id = (m[1] ?? m[2] ?? '').trim()
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Stamp the chrome's OUTERMOST elements so a stylesheet can address them.
 *
 * The contrast repair (scrape/chromeContrast.ts) needs somewhere to restore the
 * page ground the render drops, and the captured chrome has no wrapper of its
 * own — it is spliced straight into the document. Adding an attribute is the
 * least invasive hook available: it changes no layout, breaks no selector the
 * compiled CSS matched, and gives `[data-carma-chrome]` a real target.
 */
function markChromeRoots(body: P5Node): void {
  for (const child of body.childNodes ?? []) {
    if (!isElement(child) || !child.attrs) continue
    const t = tagOf(child)
    if (t === 'script' || t === 'style' || t === 'template' || t === 'noscript') continue
    if (child.attrs.some(a => a.name === 'data-carma-chrome')) continue
    child.attrs.push({ name: 'data-carma-chrome', value: '' })
  }
}

export function splitPageChrome(html: string, base: URL): PageSplit {
  let body: P5Node | null = null
  try {
    const doc = parse(html) as unknown as P5Node
    body = findFirst(doc, n => tagOf(n) === 'body')
  } catch {
    return { top: '', bottom: '', bodyAttrs: '', strategy: 'none', meta: EMPTY_META }
  }
  if (!body) return { top: '', bottom: '', bodyAttrs: '', strategy: 'none', meta: EMPTY_META }

  // Clean the WHOLE body once → both halves come out absolutised + safe.
  const linkTally = { total: 0, scripted: 0, empty: 0 }
  absolutiseTree(body, base, linkTally)
  stripOnHandlers(body)
  sanitiseScripts(body)
  markChromeRoots(body)
  const bodyAttrs = serializeBodyAttrs(body)

  const { range, meta } = findContentRange(body)
  if (range) {
    // Collect sprite defs from the WHOLE carved range BEFORE we splice it out, so
    // the chrome's `<use href="#icon">` references still resolve in the light DOM.
    const removed = (range.parent.childNodes ?? []).slice(range.startIdx, range.endIdx + 1)
    const sprites = removed.map(collectSpriteDefs).filter(Boolean).join('\n')
    if (replaceRangeWithSlot(range)) {
      const [top, bottom] = splitOnSlot(innerHtml(body))
      if (top !== null) {
        let t = cap(sprites ? `${sprites}\n${top}` : top), b = cap(bottom)
        // Content found but NOTHING surrounds it → there's no chrome to inject.
        // Report 'none' (empty halves) so the render shows the default blog.
        if (!t.trim() && !b.trim()) {
          return { top: '', bottom: '', bodyAttrs, strategy: 'none', meta: { ...meta, links: { ...EMPTY_LINKS } } }
        }
        // Dead fragments can only be judged once both halves exist: an id in the
        // footer is a perfectly good target for a link in the header.
        const surviving = idsIn(`${t}\n${b}`)
        const fixedTop = neutraliseDeadFragments(t, surviving)
        const fixedBottom = neutraliseDeadFragments(b, surviving)
        t = fixedTop.html
        b = fixedBottom.html
        return {
          top: t,
          bottom: b,
          bodyAttrs,
          strategy: 'content',
          meta: {
            ...meta,
            links: {
              total: linkTally.total,
              scripted: linkTally.scripted,
              empty: linkTally.empty,
              deadFragment: fixedTop.fixed + fixedBottom.fixed,
            },
          },
        }
      }
    }
  }

  return { top: '', bottom: '', bodyAttrs, strategy: 'none', meta: { ...meta, links: { ...EMPTY_LINKS } } }
}
