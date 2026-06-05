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

export type SplitStrategy = 'content' | 'none'

export type PageSplit = {
  /** Light-DOM HTML rendered BEFORE the blog (wrappers open across the gap). */
  top: string
  /** Light-DOM HTML rendered AFTER the blog (wrappers close + footer + late scripts). */
  bottom: string
  /** Serialised `<body>` attributes (class/style/data-*), sans the angle brackets. */
  bodyAttrs: string
  strategy: SplitStrategy
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

const hintHaystack = (el: P5Node): string => `${getAttr(el, 'id') ?? ''} ${getAttr(el, 'class') ?? ''}`
const roleOf = (el: P5Node): string => (getAttr(el, 'role') ?? '').toLowerCase()

const isStrongHeader = (el: P5Node): boolean =>
  roleOf(el) === 'banner' || tagOf(el) === 'header' || HEADER_HINT.test(hintHaystack(el))
const isStrongFooter = (el: P5Node): boolean =>
  roleOf(el) === 'contentinfo' || tagOf(el) === 'footer' || FOOTER_HINT.test(hintHaystack(el))

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

// Topmost site-header (first strong header in document order, lifted), or — lacking
// one — the first top-of-page <nav> with real links. `els` is in document order.
function findHeaderAnchor(body: P5Node, els: P5Node[]): P5Node | null {
  for (const el of els) {
    if (isStrongHeader(el)) return liftAnchor(el, body, isStrongHeader)
  }
  const half = Math.max(1, Math.floor(els.length / 2))
  for (let i = 0; i < half; i++) {
    if (tagOf(els[i]) === 'nav' && countTag(els[i], 'a') >= 2) return els[i]
  }
  return null
}
// Bottommost site-footer: the LAST strong footer in document order (so an article's
// own <footer> never wins over the site footer below it), lifted to its outermost
// footer wrapper. No depth cap — a footer buried deep in builder wrappers is found.
function findFooterAnchor(body: P5Node, els: P5Node[]): P5Node | null {
  for (let i = els.length - 1; i >= 0; i--) {
    if (isStrongFooter(els[i])) return liftAnchor(els[i], body, isStrongFooter)
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
  const rec = (n: P5Node): Stats => {
    const s: Stats = { text: 0, imgs: 0, ps: 0, hs: 0 }
    if (!isElement(n)) {
      if (n.nodeName === '#text' && typeof n.value === 'string') s.text = n.value.trim().length
      m.set(n, s)
      return s
    }
    for (const c of n.childNodes ?? []) {
      const cs = rec(c)
      s.text += cs.text; s.imgs += cs.imgs; s.ps += cs.ps; s.hs += cs.hs
    }
    const t = tagOf(n)
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

/**
 * The RANGE of sibling nodes to replace with the blog slot — the full content area
 * (all of its sections) that sits BETWEEN the header and footer inside their shared
 * wrappers. Replaces the old single-node model so multi-section homepages keep ALL
 * their content carved out together (none leaking into the header/footer halves).
 * Returns null when there's no chrome or no real content (→ default blog, no chrome).
 */
function findContentRange(body: P5Node): ContentRange | null {
  const els: P5Node[] = []
  eachEl(body, n => els.push(n))
  if (!els.length) return null

  // 1. Chrome = two POSITIONAL anchors: the topmost site-header + bottommost
  //    site-footer. Nothing in between (the content) can be mistaken for chrome.
  let headerAnchor = findHeaderAnchor(body, els)
  let footerAnchor = findFooterAnchor(body, els)
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
  // No chrome at all → there's nothing to clone; render the default blog.
  if (!headerAnchor && !footerAnchor) return null
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
  // A real content element: neither chrome, inside chrome, nor a chrome-bracketing
  // wrapper. (The chosen container MAY be a chrome-ancestor — see step 4 — but the
  // content BLOCKS and the sliced CHILDREN never are.)
  const isContent = (el: P5Node): boolean => !chromeOrInside.has(el) && !chromeAncestors.has(el)

  // 3. Content blocks = every content element scoring above the relative threshold.
  const stats = computeStats(body)
  let pivot: P5Node | null = null
  let bestScore = 0
  for (const el of els) {
    if (!isContent(el)) continue
    const sc = scoreOf(stats, el)
    if (sc > bestScore) { bestScore = sc; pivot = el }
  }
  if (!pivot || bestScore <= 0) return null

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
  if (chromeOrInside.has(parent)) return null
  const kids = parent.childNodes ?? []
  if (!kids.length) return null

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
    if (!contentIdx.length) return null
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

  if (startIdx < 0 || endIdx < startIdx || endIdx >= kids.length) return null
  return { parent, startIdx, endIdx }
}

// ─── Tree mutation (absolutise / sanitise / slot) ──────────────────────────────

function absolutiseTree(root: P5Node, base: URL): void {
  walk(root, n => {
    if (!isElement(n) || !n.attrs) return
    const isUse = tagOf(n) === 'use'
    for (const a of n.attrs) {
      if (a.name === 'href' || a.name === 'xlink:href') {
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
function replaceRangeWithSlot(range: ContentRange): boolean {
  const { parent, startIdx, endIdx } = range
  const kids = parent.childNodes
  if (!kids || startIdx < 0 || endIdx < startIdx || endIdx >= kids.length) return false
  const slot = defaultTreeAdapter.createCommentNode(SLOT_DATA) as unknown as P5Node
  slot.parentNode = parent
  kids.splice(startIdx, endIdx - startIdx + 1, slot)
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
const cap = (s: string): string => (s.length > MAX_REGION_HTML ? s.slice(0, MAX_REGION_HTML) : s)

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
export function splitPageChrome(html: string, base: URL): PageSplit {
  let body: P5Node | null = null
  try {
    const doc = parse(html) as unknown as P5Node
    body = findFirst(doc, n => tagOf(n) === 'body')
  } catch {
    return { top: '', bottom: '', bodyAttrs: '', strategy: 'none' }
  }
  if (!body) return { top: '', bottom: '', bodyAttrs: '', strategy: 'none' }

  // Clean the WHOLE body once → both halves come out absolutised + safe.
  absolutiseTree(body, base)
  stripOnHandlers(body)
  sanitiseScripts(body)
  const bodyAttrs = serializeBodyAttrs(body)

  const range = findContentRange(body)
  if (range) {
    // Collect sprite defs from the WHOLE carved range BEFORE we splice it out, so
    // the chrome's `<use href="#icon">` references still resolve in the light DOM.
    const removed = (range.parent.childNodes ?? []).slice(range.startIdx, range.endIdx + 1)
    const sprites = removed.map(collectSpriteDefs).filter(Boolean).join('\n')
    if (replaceRangeWithSlot(range)) {
      const [top, bottom] = splitOnSlot(innerHtml(body))
      if (top !== null) {
        const t = cap(sprites ? `${sprites}\n${top}` : top), b = cap(bottom)
        // Content found but NOTHING surrounds it → there's no chrome to inject.
        // Report 'none' (empty halves) so the render shows the default blog.
        if (!t.trim() && !b.trim()) return { top: '', bottom: '', bodyAttrs, strategy: 'none' }
        return { top: t, bottom: b, bodyAttrs, strategy: 'content' }
      }
    }
  }

  return { top: '', bottom: '', bodyAttrs, strategy: 'none' }
}
