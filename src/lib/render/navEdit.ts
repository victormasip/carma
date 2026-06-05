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
// as the template so new links inherit the real styling. Pure + dependency-light
// (node-html-parser, already a project dep). No DOM, runs on client or server.

import { parse, type HTMLElement } from 'node-html-parser'

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

const SKIP_LABEL = /^\s*$/

function cleanLabel(el: HTMLElement): string {
  return (el.text || '').replace(/\s+/g, ' ').trim()
}

// Find the element that best represents the primary navigation: the descendant
// (or the root) with the highest count of DIRECT <a> children. A direct-child
// count avoids picking an outer wrapper that merely contains the nav.
function findNavContainer(root: HTMLElement): HTMLElement {
  const candidates: HTMLElement[] = [root, ...root.querySelectorAll('nav, ul, ol, div')]
  let best: HTMLElement = root
  let bestCount = directLinkCount(root)
  for (const el of candidates) {
    const n = directLinkCount(el)
    if (n > bestCount) { best = el; bestCount = n }
  }
  return best
}

function directLinkCount(el: HTMLElement): number {
  let n = 0
  for (const child of el.childNodes) {
    if (isElement(child) && child.tagName === 'A') n++
    // Also count an <a> directly inside an <li>/<span> wrapper (the common list pattern).
    else if (isElement(child)) {
      const inner = child.childNodes.filter(c => isElement(c) && (c as HTMLElement).tagName === 'A')
      if (inner.length === 1 && child.childNodes.filter(isElement).length === 1) n++
    }
  }
  return n
}

function isElement(n: unknown): n is HTMLElement {
  return !!n && typeof n === 'object' && (n as HTMLElement).nodeType === 1
}

/**
 * Extract the editable nav links from a chrome region's HTML. Returns the link
 * list in document order. Empty array when no nav links are found (the UI then
 * shows an "add link" affordance only).
 */
export function extractNavLinks(html: string): NavLink[] {
  if (!html.trim()) return []
  let root: HTMLElement
  try { root = parse(html) } catch { return [] }
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

function attrsString(el: HTMLElement, dropHref = false): string {
  let out = ''
  for (const [k, v] of Object.entries(el.attributes)) {
    if (dropHref && k.toLowerCase() === 'href') continue
    out += ` ${k}="${escapeAttr(v)}"`
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
 * Returns the rewritten HTML string (idempotent-ish: re-extract → re-apply round
 * trips cleanly for typical chrome).
 */
export function applyNavLinks(html: string, links: NavLink[]): string {
  let root: HTMLElement
  try { root = parse(html) } catch { return html }
  const container = findNavContainer(root)

  // Discover the styling template + the set of nodes we're going to replace.
  const anchors = container.querySelectorAll('a').filter(a => !SKIP_LABEL.test(cleanLabel(a)))
  const first = anchors[0]

  let template: { wrapperTag: string | null; wrapperAttrs: string; anchorAttrs: string }
  if (first) {
    const parent = first.parentNode as HTMLElement | null
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
  const removed = new Set<HTMLElement>()
  const toRemove: HTMLElement[] = []
  for (const a of anchors) {
    const parent = a.parentNode as HTMLElement | null
    const node = (parent && parent !== container && parent.tagName === 'LI') ? parent : a
    if (!removed.has(node)) { removed.add(node); toRemove.push(node) }
  }

  const rendered = links
    .filter(l => l.label.trim())
    .map(l => renderLink({ label: l.label.trim(), href: l.href.trim() }, template))
    .join('')

  if (toRemove.length > 0) {
    // Replace the first removed node with the full rendered set; drop the rest.
    toRemove[0].replaceWith(rendered)
    for (let i = 1; i < toRemove.length; i++) toRemove[i].remove()
  } else {
    // No existing links — append into the container.
    container.insertAdjacentHTML('beforeend', rendered)
  }

  return root.toString()
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
