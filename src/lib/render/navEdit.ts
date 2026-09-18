// Editable navigation extraction/serialization for the captured header & footer.
//
// The Theme editor lets users add / rename / remove / reorder the nav links in
// their cloned header and footer WITHOUT touching the rest of the (real,
// injected) markup or its styling. A region is usually RAW HTML now (the
// injected clone), but can still be JSON `{ html, css, mode }` (starter templates
// / pre-pivot captures). This module reads/writes ONLY the link set, preserving
// the region's storage shape (raw → raw; JSON → JSON) so styling survives.
//
// Strategy: find the "primary" link container in the region (the <nav>/<ul> with
// the most <a> children, or the region root as a fallback), treat its direct-ish
// <a> elements as the editable nav items, and re-render that container's links
// from the edited list — cloning the FIRST original link's tag/class/attributes
// as the template so new links inherit the real styling.
//
// ── IT PARSES WITH THE BROWSER'S OWN PARSER, AND THAT IS THE POINT ───────────
//
// This module used to open with `import { parse } from 'node-html-parser'` under
// a comment claiming it "runs on client or server". Only half of that was ever
// true: its single consumer is NavEditor.tsx, a client component, so the server
// half never existed — while the cost very much did. node-html-parser carries the
// full HTML named-character reference table (`&spades;`, `&hearts;`, the lot), and
// it was arriving in the browser at 262KB raw / 82.3KB gzip to pull the links out
// of a <nav>.
//
// `DOMParser` does the same job, better, for zero bytes: it is the same parser
// the page itself was built with, so it agrees with the browser about malformed
// markup by construction — which a cloned third-party header frequently is.
//
// Everything below therefore speaks the DOM, not node-html-parser. The two APIs
// look alike and are not:
//   · `.text` → `.textContent`
//   · `.attributes` is a NamedNodeMap, not a plain object
//   · `querySelectorAll` returns a NodeList, which has no `.filter`
//   · `replaceWith(string)` inserts TEXT in the DOM, so a string replacement has
//     to go through `insertAdjacentHTML` instead
//   · `root.toString()` → `root.innerHTML`
// Getting any of those wrong is silent, so they are all named here on purpose.
//
// See docs/plans/2026-09-18-performance-every-page.md §F1.

export type NavLink = { label: string; href: string }

// `raw` = the value is bare HTML (the injected clone). When false, the value was
// JSON `{ html, css, mode }` (starter template / pre-pivot) and must round-trip
// back to JSON so its css/mode survive.
export type ChromeValue = { html: string; css: string; mode?: string; raw: boolean }

/** Parse the stored region value, detecting raw HTML vs JSON `{ html, css }`. */
export function parseChromeValue(value: string): ChromeValue {
  if (!value?.trim()) return { html: '', css: '', raw: true }
  const s = value.trim()
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s) as { html?: unknown; css?: unknown; mode?: unknown }
      if (typeof o.html === 'string') {
        return {
          html: o.html,
          css: typeof o.css === 'string' ? o.css : '',
          mode: typeof o.mode === 'string' ? o.mode : undefined,
          raw: false,
        }
      }
    } catch { /* fall through to raw */ }
  }
  return { html: s, css: '', raw: true }
}

/** Re-serialize a ChromeValue in its original shape (raw HTML, or JSON). */
export function serializeChromeValue(v: ChromeValue): string {
  if (v.raw) return v.html
  return JSON.stringify(v.mode ? { html: v.html, css: v.css, mode: v.mode } : { html: v.html, css: v.css })
}

/**
 * Parse a chrome fragment into a container element, or null where there is no
 * DOM to parse with.
 *
 * The null is not defensive clutter: this module is imported by a client
 * component, and a client component can still be RENDERED on the server (React
 * does exactly that for the initial HTML). `DOMParser` is not a Node global, so
 * every caller treats null as "leave it exactly as it was" — never as "empty".
 *
 * `body` rather than `documentElement`: the stored value is a fragment, and the
 * HTML parser puts fragment content in the body. `<link>`/`<meta>` encountered
 * mid-fragment are inserted at the current node by the in-body insertion mode,
 * so they stay where they were written rather than being hoisted to <head>.
 */
function parseFragment(html: string): HTMLElement | null {
  if (typeof DOMParser === 'undefined') return null
  try {
    return new DOMParser().parseFromString(html, 'text/html').body
  } catch {
    return null
  }
}

const SKIP_LABEL = /^\s*$/

function cleanLabel(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim()
}

// Find the element that best represents the primary navigation: the descendant
// (or the root) with the highest count of DIRECT <a> children. A direct-child
// count avoids picking an outer wrapper that merely contains the nav.
function findNavContainer(root: Element): Element {
  const candidates: Element[] = [root, ...root.querySelectorAll('nav, ul, ol, div')]
  let best: Element = root
  let bestCount = directLinkCount(root)
  for (const el of candidates) {
    const n = directLinkCount(el)
    if (n > bestCount) { best = el; bestCount = n }
  }
  return best
}

function directLinkCount(el: Element): number {
  let n = 0
  for (const child of el.children) {
    if (child.tagName === 'A') n++
    // Also count an <a> directly inside an <li>/<span> wrapper (the common list pattern).
    else if (child.children.length === 1 && child.children[0].tagName === 'A') n++
  }
  return n
}

/**
 * Extract the editable nav links from a chrome region's HTML. Returns the link
 * list in document order. Empty array when no nav links are found (the UI then
 * shows an "add link" affordance only) or when there is no DOM to parse with.
 */
export function extractNavLinks(html: string): NavLink[] {
  if (!html.trim()) return []
  const root = parseFragment(html)
  if (!root) return []
  const container = findNavContainer(root)
  const links: NavLink[] = []
  for (const a of container.querySelectorAll('a')) {
    const label = cleanLabel(a)
    const href = a.getAttribute('href') ?? '#'
    if (SKIP_LABEL.test(label)) continue // skip icon-only / empty anchors
    links.push({ label, href })
  }
  return links
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

// Build the replacement HTML for one link, cloning the template anchor's tag
// shape (and its optional <li> wrapper) so new/edited links keep the real CSS.
function renderLink(link: NavLink, template: { wrapperTag: string | null; wrapperAttrs: string; anchorAttrs: string }): string {
  const anchor = `<a${template.anchorAttrs} href="${escapeAttr(link.href || '#')}">${escapeHtml(link.label)}</a>`
  if (template.wrapperTag) {
    return `<${template.wrapperTag}${template.wrapperAttrs}>${anchor}</${template.wrapperTag}>`
  }
  return anchor
}

// NamedNodeMap, not a plain object — `Object.entries` returns nothing useful here.
function attrsString(el: Element, dropHref = false): string {
  let out = ''
  for (const attr of el.attributes) {
    if (dropHref && attr.name.toLowerCase() === 'href') continue
    out += ` ${attr.name}="${escapeAttr(attr.value)}"`
  }
  return out
}

/**
 * Write an edited nav-link list back into a chrome region's HTML, preserving all
 * surrounding markup + styling. Replaces the primary nav container's link set
 * with `links`, cloning the first original link as the styling template. If the
 * region had no nav container/links, the links are appended into the best
 * candidate container (or the root) so the user can still build a menu.
 *
 * Returns the rewritten HTML string, or the input unchanged when there is no DOM
 * to parse with (idempotent-ish: re-extract → re-apply round trips cleanly for
 * typical chrome).
 */
export function applyNavLinks(html: string, links: NavLink[]): string {
  const root = parseFragment(html)
  if (!root) return html
  const container = findNavContainer(root)

  // Discover the styling template + the set of nodes we're going to replace.
  // Array.from: a NodeList has no `.filter`.
  const anchors = Array.from(container.querySelectorAll('a')).filter(a => !SKIP_LABEL.test(cleanLabel(a)))
  const first = anchors[0]

  let template: { wrapperTag: string | null; wrapperAttrs: string; anchorAttrs: string }
  if (first) {
    const parent = first.parentElement
    const useWrapper = !!parent && parent !== container && parent.tagName === 'LI'
    template = {
      wrapperTag: useWrapper ? 'li' : null,
      wrapperAttrs: useWrapper && parent ? attrsString(parent) : '',
      anchorAttrs: attrsString(first, true),
    }
  } else {
    template = { wrapperTag: container.tagName === 'UL' || container.tagName === 'OL' ? 'li' : null, wrapperAttrs: '', anchorAttrs: '' }
  }

  // The nodes to remove: each editable anchor's outermost node within `container`
  // (the <li> wrapper if present, else the anchor itself). Collect uniquely.
  const removed = new Set<Element>()
  const toRemove: Element[] = []
  for (const a of anchors) {
    const parent = a.parentElement
    const node = (parent && parent !== container && parent.tagName === 'LI') ? parent : a
    if (!removed.has(node)) { removed.add(node); toRemove.push(node) }
  }

  const rendered = links
    .filter(l => l.label.trim())
    .map(l => renderLink({ label: l.label.trim(), href: l.href.trim() }, template))
    .join('')

  if (toRemove.length > 0) {
    // `replaceWith(rendered)` would insert the markup as TEXT — the DOM only
    // treats a string as HTML through insertAdjacentHTML. Write the new set in
    // front of the first old node, then drop every old node (including that one),
    // which also gets the empty-`rendered` case right: everything goes.
    if (rendered) toRemove[0].insertAdjacentHTML('beforebegin', rendered)
    for (const node of toRemove) node.remove()
  } else {
    // No existing links — append into the container.
    container.insertAdjacentHTML('beforeend', rendered)
  }

  return root.innerHTML
}

// ── Convenience wrappers operating on the stored JSON region value ────────────

export function navLinksFromRegion(json: string): NavLink[] {
  return extractNavLinks(parseChromeValue(json).html)
}

export function regionWithNavLinks(json: string, links: NavLink[]): string {
  const v = parseChromeValue(json)
  if (!v.html) return json
  return serializeChromeValue({ ...v, html: applyNavLinks(v.html, links) })
}
