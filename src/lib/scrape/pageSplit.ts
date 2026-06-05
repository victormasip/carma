// Top / Bottom page split — the spec-correct foundation of the 1:1 clone.
//
// GOAL: reproduce a human's "manual slice" — cut the raw HTML right before the
// main content block begins and right after it ends, leaving EVERY parent wrapper
// (the flex/grid shells, the max-width containers, the header and footer) fully
// intact. The blog renders in the gap.
//
// HOW (one heuristic, no semantic gating, no LCA carving):
//   1. Parse the whole document with parse5 — a spec-compliant HTML5 parser that
//      repairs unclosed tags / mis-nesting EXACTLY like a browser (node-html-parser
//      silently tolerates breakage and would mis-cut, so it can't be used here).
//   2. Classify the CHROME (header-ish / footer-ish elements) by tag + the shared
//      selector tables. Drop "over-greedy" chrome — an unclosed <header> that
//      parse5 nested the footer/page into — so it can't hide the real content.
//   3. Score every element by CONTENT DENSITY (text + media + structure). The
//      "center of content" is the highest-scoring element that is NEITHER chrome,
//      NOR inside chrome, NOR a wrapper that CONTAINS chrome. Because density
//      aggregates up the tree, that node is automatically the largest content
//      block that sits BESIDE the header/footer inside their shared wrappers.
//   4. Replace ONLY that one node with a slot comment. Everything else — all
//      ancestors, the header, the footer, sibling sections, late scripts — stays
//      byte-for-byte. Serialise the (balanced) <body> inner and split on the slot.
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

// ─── Chrome anchors (strict + positional) ──────────────────────────────────────
// Chrome is NOT matched by broad selector tables (those misclassify in-content
// navs / breadcrumbs / pagination / article `.page-header`s as chrome and so
// FRAGMENT the content detection — the boundary-misdetection regression). Instead
// chrome is exactly TWO anchors found by structure + position: the TOPMOST site
// header and the BOTTOMMOST site footer, each requiring a real chrome signal
// (header/footer tag, banner/contentinfo role, or an unambiguous site-chrome
// class name) AND a shallow depth from <body>. In-content elements — deeper and
// mid-document — can never be picked.

const HEADER_HINT = /(?:^|[\s_-])(?:masthead|site-?header|main-?header|global-?header|primary-?header|l-header|topbar|top-?bar|site-?nav|main-?nav|primary-?nav|navbar)(?:$|[\s_-])/i
const FOOTER_HINT = /(?:^|[\s_-])(?:colophon|site-?footer|main-?footer|global-?footer|page-?footer|primary-?footer|l-footer)(?:$|[\s_-])/i
const MAX_CHROME_DEPTH = 6

const hintHaystack = (el: P5Node): string => `${getAttr(el, 'id') ?? ''} ${getAttr(el, 'class') ?? ''}`
const roleOf = (el: P5Node): string => (getAttr(el, 'role') ?? '').toLowerCase()

// Steps from `el` up to <body> (direct child = 1); Infinity if not under body.
function depthFromBody(el: P5Node, body: P5Node): number {
  let d = 1
  let p = el.parentNode ?? null
  while (p && p !== body) { d++; p = p.parentNode ?? null }
  return p === body ? d : Infinity
}

const isStrongHeader = (el: P5Node): boolean =>
  roleOf(el) === 'banner' || tagOf(el) === 'header' || HEADER_HINT.test(hintHaystack(el))
const isStrongFooter = (el: P5Node): boolean =>
  roleOf(el) === 'contentinfo' || tagOf(el) === 'footer' || FOOTER_HINT.test(hintHaystack(el))

function countTag(el: P5Node, name: string): number {
  let n = 0
  walk(el, c => { if (isElement(c) && tagOf(c) === name) n++ })
  return n
}

// Topmost shallow site-header (or, lacking one, the first shallow top-of-page
// <nav> with real links). `els` is in document order.
function findHeaderAnchor(body: P5Node, els: P5Node[]): P5Node | null {
  for (const el of els) {
    if (depthFromBody(el, body) <= MAX_CHROME_DEPTH && isStrongHeader(el)) return el
  }
  const half = Math.max(1, Math.floor(els.length / 2))
  for (let i = 0; i < half; i++) {
    const el = els[i]
    if (depthFromBody(el, body) <= MAX_CHROME_DEPTH && tagOf(el) === 'nav' && countTag(el, 'a') >= 2) return el
  }
  return null
}
// Bottommost shallow site-footer.
function findFooterAnchor(body: P5Node, els: P5Node[]): P5Node | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i]
    if (depthFromBody(el, body) <= MAX_CHROME_DEPTH && isStrongFooter(el)) return el
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

/**
 * The single content node to replace with the blog slot — the "center of content"
 * that sits BETWEEN the header and footer inside their shared wrappers. Returns
 * null when there's no real content block (→ render the default blog, no chrome).
 */
function findContentNode(body: P5Node): P5Node | null {
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

  // 3. Highest-scoring element that is content (not chrome, not inside chrome) and
  //    not a chrome-bracketing wrapper. Density aggregates upward, so this is the
  //    largest content block beside the chrome.
  const stats = computeStats(body)
  let best: P5Node | null = null
  let bestScore = 0
  for (const el of els) {
    if (chromeOrInside.has(el) || chromeAncestors.has(el)) continue
    const sc = scoreOf(stats, el)
    if (sc > bestScore) { bestScore = sc; best = el }
  }
  if (!best || bestScore <= 0) return null

  // 4. Climb to the topmost chrome-free ancestor (keeps the most wrappers OUTSIDE
  //    the slot). Stops at <body> or the first wrapper that brackets the chrome.
  let node = best
  while (
    node.parentNode && node.parentNode !== body &&
    !chromeAncestors.has(node.parentNode) && !chromeOrInside.has(node.parentNode)
  ) {
    node = node.parentNode
  }
  return node
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

function replaceWithSlot(target: P5Node): boolean {
  const p = target.parentNode
  if (!p?.childNodes) return false
  const i = p.childNodes.indexOf(target)
  if (i < 0) return false
  const slot = defaultTreeAdapter.createCommentNode(SLOT_DATA) as unknown as P5Node
  slot.parentNode = p
  p.childNodes.splice(i, 1, slot)
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
 *   · `strategy:'content'` — the content node was found and slotted; Top/Bottom are
 *     intentionally UNBALANCED (wrappers span the gap), balanced at render time.
 *   · `strategy:'none'`    — no content block (→ default blog, no chrome).
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

  const content = findContentNode(body)
  if (content && replaceWithSlot(content)) {
    // Hoist any SVG sprite defs that lived inside the carved content, so the
    // chrome's `<use href="#icon">` references still resolve in the light DOM.
    const sprites = collectSpriteDefs(content)
    const [top, bottom] = splitOnSlot(innerHtml(body))
    if (top !== null) {
      const t = cap(sprites ? `${sprites}\n${top}` : top), b = cap(bottom)
      // Content found but NOTHING surrounds it → there's no chrome to inject.
      // Report 'none' (empty halves) so the render shows the default blog.
      if (!t.trim() && !b.trim()) return { top: '', bottom: '', bodyAttrs, strategy: 'none' }
      return { top: t, bottom: b, bodyAttrs, strategy: 'content' }
    }
  }

  return { top: '', bottom: '', bodyAttrs, strategy: 'none' }
}
