// W0 — SAFE PANEL: their identity and EVERY link they publish, in an accessible
// frame we own. The honest floor of the residency ladder (reboot plan §3.7).
//
// It replaces the generative rungs. `rebuild` kept a median 35% of a header's
// links and none of the footer's legal ones (84 of 99 corpus footers carry an
// Avís legal / Privacitat / Cookies line that LSSI-CE expects to stay reachable);
// `harmonise` repainted their brand. SAFE PANEL copies — logo, labels, hrefs, in
// their order and nesting — and draws nothing of its own but the frame:
//
//   · BAR    — when their captured header cannot be shown faithfully (or was one
//              we drew): their logo + the complete link tree in a plain bar, in
//              their colours and faces; their footer as columns + the legal row.
//              Works with no script at all (<details> menus).
//   · DRAWER — when their header IS shown: their burger is dead without their JS,
//              so it opens OUR panel instead — the same complete tree — through a
//              ~1KB runtime of ours (SAFE_PANEL_JS), never theirs.
//
// Everything renders inside a Declarative Shadow DOM with `:host{all:initial}`:
// their stylesheet cannot reach it and ours cannot reach their page. Pure string
// building + one parse5 walk; no I/O.

import { parseFragment } from 'parse5'
import type { P5Node } from '@/lib/render/chromeSafety'

export type LinkNode = { label: string; href: string | null; children: LinkNode[] }
export type FooterGroup = { label: string | null; links: LinkNode[] }
export type LinkTree = {
  logo: { src: string; alt: string } | null
  /** The primary navigation, nested as they nested it. */
  primary: LinkNode[]
  /** Every other named link in the header: top bar, call to action, social. */
  secondary: LinkNode[]
  footer: FooterGroup[]
  /** Avís legal, privacitat, cookies, condicions — LSSI-CE / AEPD reachability. */
  legal: LinkNode[]
}

export type SafeTokens = {
  bg: string; surface: string; text: string; muted: string; border: string; accent: string
  fontBody: string; fontHeading: string; maxWidth: string
}

const MAX_NODES = 400
const LEGAL = /(av[ií]s legal|aviso legal|legal notice|nota legal|privacitat|privacidad|privacy|cookies?|galetes|condicions|condiciones|t[eé]rminos|termes|terms|rgpd|gdpr|protecci[oó] de dades|protecci[oó]n de datos|accessibilit|accesibilidad|pol[ií]tica)/i
const SOCIAL = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|whatsapp|telegram|threads)/i

// ─── Reading the tree ────────────────────────────────────────────────────────

const attrOf = (n: P5Node, name: string) => n.attrs?.find(a => a.name === name)?.value
const kids = (n: P5Node): P5Node[] => n.childNodes ?? []
const tagOf = (n: P5Node) => (n.tagName ?? '').toLowerCase()

function walk(n: P5Node, visit: (n: P5Node) => boolean | void): void {
  for (const c of kids(n)) {
    if (visit(c) === false) continue
    walk(c, visit)
  }
}

function textOf(n: P5Node): string {
  let out = ''
  walk(n, c => {
    if (c.nodeName === '#text') out += ` ${c.value ?? ''}`
    const t = tagOf(c)
    if (t === 'style' || t === 'svg' || t === 'script') return false
  })
  return out.replace(/\s+/g, ' ').trim()
}

/** What a screen reader would announce for a link: text, else aria-label/title, else an image's alt. */
function nameOf(a: P5Node): string {
  const t = textOf(a)
  if (t) return t.slice(0, 80)
  const aria = attrOf(a, 'aria-label') ?? attrOf(a, 'title')
  if (aria?.trim()) return aria.trim().slice(0, 80)
  let alt = ''
  walk(a, c => { if (!alt && tagOf(c) === 'img') alt = (attrOf(c, 'alt') ?? '').trim() })
  return alt.slice(0, 80)
}

function absHref(raw: string | undefined, base: URL): string | null {
  const h = (raw ?? '').trim()
  if (!h || h === '#' || h.startsWith('#') || /^(javascript|data|vbscript):/i.test(h)) return null
  try {
    const u = new URL(h, base)
    return /^(https?|mailto|tel):$/.test(u.protocol) ? u.toString() : null
  } catch { return null }
}

/** The first matching descendant (pre-order), not descending into `stopAt` tags. */
function find(root: P5Node, match: (n: P5Node) => boolean, stopAt: ReadonlySet<string> = new Set()): P5Node | null {
  const hit: { n: P5Node | null } = { n: null }
  walk(root, c => {
    if (hit.n) return false
    if (match(c)) { hit.n = c; return false }
    if (stopAt.has(tagOf(c))) return false
  })
  return hit.n
}

const LISTS = new Set(['ul', 'ol'])

/** The first link (or link-less label) that heads a menu item. */
function itemHead(li: P5Node, base: URL): { label: string; href: string | null } | null {
  const el = find(li, c => tagOf(c) === 'a' || ((tagOf(c) === 'button' || tagOf(c) === 'span') && !!textOf(c)), LISTS)
  if (!el) return null
  const head = tagOf(el) === 'a'
    ? { label: nameOf(el), href: absHref(attrOf(el, 'href'), base) }
    : { label: textOf(el).slice(0, 80), href: null }
  return head.label ? head : null
}

function listOf(ul: P5Node, base: URL, budget: { n: number }, depth = 0): LinkNode[] {
  const out: LinkNode[] = []
  for (const li of kids(ul)) {
    if (tagOf(li) !== 'li' || budget.n <= 0) continue
    const head = itemHead(li, base)
    const sub = kids(li).find(c => LISTS.has(tagOf(c))) ?? find(li, c => LISTS.has(tagOf(c)))
    const children = sub && depth < 3 ? listOf(sub, base, budget, depth + 1) : []
    if (!head && !children.length) continue
    budget.n--
    out.push({ label: head?.label ?? '', href: head?.href ?? null, children })
  }
  return out
}

const linkCount = (nodes: LinkNode[]): number => nodes.reduce((n, x) => n + (x.href ? 1 : 0) + linkCount(x.children), 0)
const keyOf = (l: { label: string; href: string | null }) => `${(l.href ?? '').replace(/\/$/, '')}|${l.label.toLowerCase()}`
function flatten(nodes: LinkNode[], into: Set<string>): Set<string> {
  for (const n of nodes) { into.add(keyOf(n)); flatten(n.children, into) }
  return into
}

/** The logo: an image inside the home link, else one that says it is a logo. */
function findLogo(root: P5Node, base: URL): LinkTree['logo'] {
  const isImg = (c: P5Node) => tagOf(c) === 'img'
  const homeLink = find(root, c => {
    if (tagOf(c) !== 'a') return false
    const h = absHref(attrOf(c, 'href'), base)
    return !!h && (h === `${base.origin}/` || h === base.toString()) && !!find(c, isImg)
  })
  const img = (homeLink ? find(homeLink, isImg) : null)
    ?? find(root, c => isImg(c) && /logo|brand/i.test(`${attrOf(c, 'class') ?? ''} ${attrOf(c, 'alt') ?? ''} ${attrOf(c, 'src') ?? ''}`))
  if (!img) return null
  const raw = attrOf(img, 'src') ?? attrOf(img, 'data-src') ?? ''
  const src = raw && !raw.startsWith('data:') ? absHref(raw, base) : null
  return src && /^https?:/.test(src) ? { src, alt: (attrOf(img, 'alt') ?? '').trim().slice(0, 80) } : null
}

/**
 * Their complete navigation, read from the captured header and footer.
 *
 * The primary menu is the list with the most links (Elementor and others print
 * the same menu twice — desktop and mobile — and the larger copy wins); nesting
 * is theirs; a `href="#"` parent stays as a label over its sub-menu (56 of 99
 * corpus sites have them, and dropping them lost whole sections). Every other
 * named link of the header is kept as `secondary`. The footer is grouped by its
 * own lists; legal links are pulled into their own row and kept nowhere else.
 */
export function extractLinkTree(headerHtml: string, footerHtml: string, baseUrl: string | URL | null): LinkTree {
  const empty: LinkTree = { logo: null, primary: [], secondary: [], footer: [], legal: [] }
  let base: URL
  try { base = baseUrl instanceof URL ? baseUrl : new URL(baseUrl ?? 'https://invalid.invalid/') } catch { return empty }
  let header: P5Node, footer: P5Node
  try {
    header = parseFragment(headerHtml ?? '') as unknown as P5Node
    footer = parseFragment(footerHtml ?? '') as unknown as P5Node
  } catch { return empty }

  // ── header: the biggest list wins, everything else named is secondary ──
  const lists: P5Node[] = []
  walk(header, c => {
    const t = tagOf(c)
    if (t === 'ul' || t === 'ol') {
      // Only top-level lists: a sub-menu belongs to its parent's tree.
      lists.push(c)
      return false
    }
  })
  let primary: LinkNode[] = []
  for (const ul of lists) {
    const tree = listOf(ul, base, { n: MAX_NODES })
    if (linkCount(tree) > linkCount(primary)) primary = tree
  }
  const seen = flatten(primary, new Set())
  const secondary: LinkNode[] = []
  walk(header, c => {
    if (tagOf(c) !== 'a') return
    const href = absHref(attrOf(c, 'href'), base)
    const label = nameOf(c)
    if (!href || !label) return false
    const node = { label, href, children: [] }
    const k = keyOf(node)
    if (seen.has(k)) return false
    // The logo link is the brand, not a menu entry.
    if (href === `${base.origin}/` && !textOf(c)) return false
    seen.add(k)
    if (secondary.length < 40) secondary.push(node)
    return false
  })

  // ── footer: its own lists as groups, loose links as one more ──
  const groups: FooterGroup[] = []
  const legal: LinkNode[] = []
  const footSeen = new Set<string>()
  // A node as it may stay in its group: [] if it was already seen, its children
  // alone if it is a legal link (it moves to the legal row; what it nested — one
  // corpus footer nests its social links under "Avís legal" — stays here).
  const take = (node: LinkNode): LinkNode[] => {
    const k = keyOf(node)
    if (footSeen.has(k)) return node.children.flatMap(take)
    footSeen.add(k)
    if (node.href && (LEGAL.test(node.label) || LEGAL.test(node.href))) {
      legal.push({ ...node, children: [] })
      return node.children.flatMap(take)
    }
    return [{ ...node, children: node.children.flatMap(take) }]
  }
  let lastHeading: string | null = null
  const loose: LinkNode[] = []
  walk(footer, c => {
    const t = tagOf(c)
    // A heading names the list after it. A class that merely SAYS "title" only
    // counts when it holds no link or list of its own — otherwise its links
    // would be skipped as if they were the heading's text.
    const classHeading = /(^|[\s_-])(title|heading|widget-title|widgettitle)([\s_-]|$)/i.test(attrOf(c, 'class') ?? '')
      && !find(c, d => tagOf(d) === 'a' || LISTS.has(tagOf(d)))
    if (/^h[1-6]$/.test(t) || classHeading) {
      const label = textOf(c)
      if (label && label.length <= 60) lastHeading = label
      return false
    }
    if (t === 'ul' || t === 'ol') {
      const items = listOf(c, base, { n: 120 }).flatMap(take)
      if (items.length) groups.push({ label: lastHeading, links: items })
      lastHeading = null
      return false
    }
    if (t === 'a') {
      const href = absHref(attrOf(c, 'href'), base)
      const label = nameOf(c)
      if (href && label) loose.push(...take({ label, href, children: [] }))
      return false
    }
  })
  if (loose.length) groups.push({ label: null, links: loose.slice(0, 60) })

  return { logo: findLogo(header, base), primary, secondary, footer: groups, legal }
}

/** Is this the self-contained chrome W6's `rebuildChrome` drew (archetype `.cb` / `.cf`)? */
export function isRebuiltRegion(html: string | null | undefined): boolean {
  return /^\s*<div class="(cb|cf)">/.test(html ?? '')
}

/** Every link a tree holds — the V3 "nothing lost" check counts these. */
export function treeLinks(tree: LinkTree): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = []
  const add = (nodes: LinkNode[]) => { for (const n of nodes) { if (n.href) out.push({ label: n.label, href: n.href }); add(n.children) } }
  add(tree.primary); add(tree.secondary)
  for (const g of tree.footer) add(g.links)
  add(tree.legal)
  return out
}

// ─── Drawing it ──────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
/** A CSS value from a token, refusing anything that could break out of a declaration. */
const cssv = (v: string, fallback: string) => (/^[#a-z0-9(),.%/\s'"-]+$/i.test(v ?? '') && !/[{}<>;]/.test(v) ? v : fallback)

function item(n: LinkNode): string {
  const label = esc(n.label || '—')
  const head = n.href
    ? `<a href="${esc(n.href)}">${label}</a>`
    : `<span class="g">${label}</span>`
  const sub = n.children.length ? `<ul>${n.children.map(item).join('')}</ul>` : ''
  return `<li${n.children.length ? ' class="has"' : ''}>${head}${sub}</li>`
}

/** The host's `style` attribute — escaped whole, because font names carry quotes. */
function vars(t: SafeTokens): string {
  return esc(`--b:${cssv(t.bg, '#ffffff')};--s:${cssv(t.surface, '#ffffff')};--t:${cssv(t.text, '#111111')};--m:${cssv(t.muted, '#555555')};--l:${cssv(t.border, '#e5e5e5')};--a:${cssv(t.accent, '#111111')};--fb:${cssv(t.fontBody, 'system-ui, sans-serif')};--fh:${cssv(t.fontHeading, 'system-ui, sans-serif')};--w:${cssv(t.maxWidth, '1200px')}`)
}

const BASE_CSS = ':host{all:initial;display:block;contain:layout style}*{box-sizing:border-box}a{color:inherit}ul{list-style:none;margin:0;padding:0}' +
  ':focus-visible{outline:2px solid var(--a);outline-offset:2px;border-radius:4px}'

const BAR_CSS = BASE_CSS +
  '.b{background:var(--s);color:var(--t);font-family:var(--fb);border-bottom:1px solid var(--l);position:relative;z-index:30}' +
  '.r{max-width:var(--w);margin:0 auto;padding:.75rem 1.25rem;display:flex;align-items:center;gap:1.25rem}' +
  '.brand{display:inline-flex;align-items:center;text-decoration:none;font-family:var(--fh);font-weight:700;font-size:1.15rem;color:var(--t);flex:0 0 auto}' +
  '.brand img{display:block;max-height:48px;max-width:200px;width:auto;height:auto}' +
  '.nav{margin-left:auto}.nav>ul{display:flex;flex-wrap:wrap;gap:.25rem 1.1rem;align-items:center}' +
  '.nav li{position:relative}.nav a,.nav .g{display:inline-block;padding:.35rem 0;text-decoration:none;font-size:.95rem;color:var(--t)}' +
  '.nav a:hover{color:var(--a)}.nav .has>a::after,.nav .has>.g::after{content:"\\25BE";font-size:.7em;margin-left:.3em;opacity:.7}' +
  '.nav li ul{position:absolute;left:-.75rem;top:100%;min-width:14rem;background:var(--s);border:1px solid var(--l);border-radius:8px;padding:.4rem .75rem;box-shadow:0 12px 32px -12px rgba(0,0,0,.25);display:none;z-index:40}' +
  '.nav li:hover>ul,.nav li:focus-within>ul{display:block}.nav li ul li ul{position:static;display:block;border:0;box-shadow:none;padding:0 0 0 .75rem;min-width:0}' +
  '.more{display:none;margin-left:auto}.more>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:.45rem;padding:.5rem .8rem;border:1px solid var(--l);border-radius:999px;font-size:.9rem;font-weight:600;color:var(--t);background:var(--s)}' +
  '.more>summary::-webkit-details-marker{display:none}.more[open]>summary{border-color:var(--a)}' +
  '.panel{position:absolute;left:0;right:0;top:100%;background:var(--s);border-bottom:1px solid var(--l);box-shadow:0 18px 40px -18px rgba(0,0,0,.3);max-height:calc(100vh - 80px);overflow:auto;padding:.75rem 1.25rem 1.25rem}' +
  '.tree a,.tree .g{display:block;padding:.6rem 0;text-decoration:none;font-size:1.02rem;border-bottom:1px solid var(--l);color:var(--t)}' +
  '.tree .g{font-weight:700}.tree ul{padding-left:1rem}.tree ul a{font-size:.95rem}.sec{margin-top:.75rem;display:flex;flex-wrap:wrap;gap:.25rem 1rem}.sec a{font-size:.88rem;color:var(--m);padding:.35rem 0;text-decoration:none}' +
  '@media (max-width:960px){.nav{display:none}.more{display:block}}' +
  '.top-sec{display:flex;gap:1rem;flex-wrap:wrap}.top-sec a{font-size:.85rem;color:var(--m);text-decoration:none}@media (max-width:960px){.top-sec{display:none}}'

const FOOT_CSS = BASE_CSS +
  '.f{background:var(--s);color:var(--t);font-family:var(--fb);border-top:1px solid var(--l)}' +
  '.in{max-width:var(--w);margin:0 auto;padding:2.25rem 1.25rem 1.5rem}' +
  '.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:1.5rem 2rem}' +
  '.cols h2{font-family:var(--fh);font-size:.95rem;margin:0 0 .6rem;font-weight:700}' +
  '.cols a,.cols .g{display:inline-block;padding:.25rem 0;font-size:.9rem;color:var(--m);text-decoration:none}.cols a:hover{color:var(--a)}.cols ul ul{padding-left:.75rem}' +
  '.legal{margin-top:1.75rem;padding-top:1rem;border-top:1px solid var(--l)}.legal ul{display:flex;flex-wrap:wrap;gap:.35rem 1.25rem}' +
  '.legal a{font-size:.85rem;color:var(--m);text-decoration:underline;text-underline-offset:2px}.copy{margin:.9rem 0 0;font-size:.8rem;color:var(--m)}'

const DRAWER_CSS = BASE_CSS +
  '.scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147482998}' +
  '.d{position:fixed;top:0;right:0;bottom:0;width:min(420px,92vw);background:var(--s);color:var(--t);font-family:var(--fb);z-index:2147482999;overflow:auto;padding:1rem 1.25rem 2rem;box-shadow:-24px 0 60px -24px rgba(0,0,0,.45)}' +
  '[hidden]{display:none!important}.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.5rem}' +
  '.top .n{font-family:var(--fh);font-weight:700;font-size:1.05rem}.top img{display:block;max-height:40px;max-width:180px}' +
  '.x{all:unset;cursor:pointer;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:1.4rem;color:var(--t)}.x:focus-visible{outline:2px solid var(--a)}' +
  '.tree a,.tree .g{display:block;padding:.7rem 0;text-decoration:none;font-size:1.05rem;border-bottom:1px solid var(--l);color:var(--t)}.tree .g{font-weight:700}' +
  '.tree ul{padding-left:1rem}.tree ul a{font-size:.97rem}.sec{margin-top:1rem;display:flex;flex-wrap:wrap;gap:.25rem 1rem}.sec a{font-size:.9rem;color:var(--m);padding:.4rem 0;text-decoration:none}' +
  '.legal{margin-top:1.25rem;display:flex;flex-wrap:wrap;gap:.25rem 1rem}.legal a{font-size:.82rem;color:var(--m)}'

const dsd = (attrs: string, css: string, body: string) =>
  `<div class="carma-safe" ${attrs}><template shadowrootmode="open"><style>${css.replace(/<\/(style|template)/gi, '<\\/$1')}</style>${body}</template></div>`

const brandHtml = (tree: LinkTree, siteName: string, home: string) => tree.logo
  ? `<a class="brand" href="${esc(home)}"><img src="${esc(tree.logo.src)}" alt="${esc(tree.logo.alt || siteName)}"></a>`
  : `<a class="brand" href="${esc(home)}">${esc(siteName)}</a>`

const secondaryHtml = (links: LinkNode[], cls: string) => links.length
  ? `<div class="${cls}">${links.filter(l => l.href).map(l => `<a href="${esc(l.href!)}"${SOCIAL.test(l.href!) ? ' rel="noopener"' : ''}>${esc(l.label)}</a>`).join('')}</div>`
  : ''

/** The BAR: their logo, every header link, every footer link, the legal row. No script needed. */
export function safePanelBar(tree: LinkTree, opts: { siteName: string; home: string; tokens: SafeTokens; menuLabel?: string }): { header: string; footer: string } {
  const name = opts.siteName || ''
  const menu = esc(opts.menuLabel ?? 'Menú')
  const primary = tree.primary.length ? tree.primary : tree.secondary.map(l => ({ ...l, children: [] }))
  const secondary = tree.primary.length ? tree.secondary : []
  const nav = primary.length ? `<nav class="nav" aria-label="${esc(name)}"><ul>${primary.map(item).join('')}</ul></nav>` : ''
  const more = primary.length || secondary.length
    ? `<details class="more"><summary aria-label="${menu}"><span aria-hidden="true">&#9776;</span> ${menu}</summary><div class="panel"><nav aria-label="${esc(name)}"><ul class="tree">${primary.map(item).join('')}</ul>${secondaryHtml(secondary, 'sec')}</nav></div></details>`
    : ''
  const header = dsd(`data-carma-safe="header" style="${vars(opts.tokens)}"`, BAR_CSS,
    `<header class="b" role="banner"><div class="r">${brandHtml(tree, name, opts.home)}${nav}${more}</div>${secondary.length ? `<div class="r" style="padding-top:0">${secondaryHtml(secondary, 'top-sec')}</div>` : ''}</header>`)

  const cols = tree.footer.filter(g => g.links.length).map(g =>
    `<section>${g.label ? `<h2>${esc(g.label)}</h2>` : ''}<ul>${g.links.map(item).join('')}</ul></section>`).join('')
  const legal = tree.legal.length
    ? `<nav class="legal" aria-label="Legal"><ul>${tree.legal.map(l => `<li><a href="${esc(l.href!)}">${esc(l.label)}</a></li>`).join('')}</ul></nav>`
    : ''
  const footer = dsd(`data-carma-safe="footer" style="${vars(opts.tokens)}"`, FOOT_CSS,
    `<footer class="f" role="contentinfo"><div class="in">${cols ? `<div class="cols">${cols}</div>` : ''}${legal}<p class="copy">© ${new Date().getUTCFullYear()} ${esc(name)}</p></div></footer>`)
  return { header, footer }
}

/**
 * The DRAWER: their header stays theirs; their burger — recognised and marked by
 * chromeSafety.ts — opens this dialog, appended at the end of <body>. Nothing of
 * ours is added to their header.
 */
export function safePanelDrawer(tree: LinkTree, opts: { siteName: string; tokens: SafeTokens; menuLabel?: string; closeLabel?: string }): string {
  const name = opts.siteName || ''
  const menu = esc(opts.menuLabel ?? 'Menú')
  const primary = tree.primary.length ? tree.primary : tree.secondary.map(l => ({ ...l, children: [] }))
  const secondary = tree.primary.length ? tree.secondary : []
  const head = tree.logo ? `<img src="${esc(tree.logo.src)}" alt="${esc(tree.logo.alt || name)}">` : `<span class="n">${esc(name)}</span>`
  const legal = tree.legal.length ? `<div class="legal">${tree.legal.map(l => `<a href="${esc(l.href!)}">${esc(l.label)}</a>`).join('')}</div>` : ''
  return dsd(`data-carma-safe="drawer" style="${vars(opts.tokens)}"`, DRAWER_CSS,
    `<div class="scrim" hidden></div>` +
    `<div class="d" role="dialog" aria-modal="true" aria-label="${menu}" hidden>` +
    `<div class="top">${head}<button class="x" type="button" aria-label="${esc(opts.closeLabel ?? 'Tanca el menú')}">&#10005;</button></div>` +
    `<nav aria-label="${esc(name)}"><ul class="tree">${primary.map(item).join('')}</ul>${secondaryHtml(secondary, 'sec')}</nav>${legal}</div>`)
}

/**
 * OUR runtime — the only script that touches their chrome. Opens the drawer from
 * any `[data-carma-burger]` their header carries (marked by chromeSafety.ts; the
 * walk uses composedPath so a burger inside a shadow tree of theirs still counts),
 * keeps Tab inside the dialog while it is open, closes on Escape / scrim / ✕ and
 * gives focus back. Also lets Escape close the BAR's <details>. Never throws.
 */
export const SAFE_PANEL_JS = `(function(){try{
var host=document.querySelector('[data-carma-safe="drawer"]'),sr=host&&host.shadowRoot,d=sr&&sr.querySelector('.d'),s=sr&&sr.querySelector('.scrim'),x=sr&&sr.querySelector('.x'),last=null;
function open(t){if(!d)return;last=t;d.hidden=false;s.hidden=false;document.documentElement.style.overflow='hidden';if(t&&t.setAttribute)t.setAttribute('aria-expanded','true');x.focus()}
function close(){if(!d||d.hidden)return;d.hidden=true;s.hidden=true;document.documentElement.style.overflow='';if(last){if(last.setAttribute)last.setAttribute('aria-expanded','false');if(last.focus)last.focus()}}
function burger(e){var p=e.composedPath?e.composedPath():[e.target];for(var i=0;i<p.length;i++){var n=p[i];if(n&&n.hasAttribute&&n.hasAttribute('data-carma-burger'))return n}return null}
if(d){document.addEventListener('click',function(e){var b=burger(e);if(!b)return;e.preventDefault();e.stopPropagation();d.hidden?open(b):close()},true);
x.addEventListener('click',close);s.addEventListener('click',close);
document.querySelectorAll('[data-carma-burger]').forEach(function(b){b.setAttribute('aria-expanded','false');if(b.tagName!=='BUTTON'&&b.tagName!=='A'){if(!b.hasAttribute('role'))b.setAttribute('role','button');if(!b.hasAttribute('tabindex'))b.setAttribute('tabindex','0')}});}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){close();document.querySelectorAll('[data-carma-safe="header"]').forEach(function(h){var m=h.shadowRoot&&h.shadowRoot.querySelector('details[open]');if(m)m.removeAttribute('open')})}
else if(e.key==='Tab'&&d&&!d.hidden){var f=d.querySelectorAll('a[href],button'),a=sr.activeElement;if(!f.length)return;if(e.shiftKey&&a===f[0]){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&a===f[f.length-1]){e.preventDefault();f[0].focus()}}
else if((e.key==='Enter'||e.key===' ')&&d){var b=burger(e);if(b&&b.tagName!=='BUTTON'&&b.tagName!=='A'){e.preventDefault();d.hidden?open(b):close()}}});
}catch(e){}})();`
