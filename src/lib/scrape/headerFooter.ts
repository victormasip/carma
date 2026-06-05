// <head> extraction + script-safety + fragment normalisation — shared helpers for
// the 1:1 clone. (Header/footer CARVING is NOT here: it lives in pageSplit.ts,
// which slices the page into a Top/Bottom sandwich around the content range. This
// module no longer owns chrome detection — the old selector-table engine was
// retired in favour of pageSplit's single structural model.)
//
//   · buildExtractedHead → the client's <head> assets (stylesheets / inline
//     <style> / font links / resource hints / scripts), absolutised to the origin,
//     with <title>/<meta>/<link rel=canonical>/<base> STRIPPED (ours own those).
//   · shouldDropScript    → the anti-blank-page denylist (shared with pageSplit).
//   · normalizeFragment   → spec-compliant (parse5) balancing of a markup fragment.
//   · absolutise          → resolve a single URL against the page origin.
//
// The injected head CSS styles the light-DOM chrome pixel-for-pixel. We do NOT
// rewrite urls inside EXTERNAL .css files: served from their absolute origin URL,
// their own relative font/image urls resolve automatically — the key to fidelity
// without re-hosting a single asset.
//
// Pure + dependency-light (node-html-parser, already a project dep). No DOM, no
// network — runs anywhere, which also makes it directly testable.

import { type HTMLElement } from 'node-html-parser'
import { parseFragment, serialize } from 'parse5'
import { absolutiseCssUrls } from './clientCss'

export const MAX_REGION_HTML = 200_000
export const MAX_HEAD_HTML = 250_000

// <head> children we KEEP (everything else — title/meta/base — is dropped).
const KEEP_LINK_RELS = /(^|\s)(stylesheet|preconnect|dns-prefetch|preload|modulepreload|prefetch)(\s|$)/i

// ─── Script safety (anti blank-page) ──────────────────────────────────────────
// We KEEP the client's real scripts so its native menus / accordions / dropdowns
// work on the clone. Only a NARROW set is dropped: those that genuinely TAKE OVER
// or BLANK the document — SPA framework bootstraps / hydration that expect to own
// the whole DOM, hard redirects, and service-worker installs. Analytics/tag-
// managers are dropped too (no UI, bogus pageviews, dead weight).
//
// Deliberately NOT dropped (the over-sanitisation that broke menus): theme JS,
// jQuery plugins, Bootstrap, Swiper/Slick, and PAGE-BUILDER FRONTEND runtimes like
// Elementor's `frontend-modules` — those power the very mobile menus / dropdowns
// we must preserve. They manipulate existing nodes; they don't re-render the page.
//
// This is a DENYLIST (drop the known killers, keep everything else) rather than an
// allowlist, because real sites hand-roll menu code we can't enumerate.

const DANGEROUS_SCRIPT_SRC =
  /(?:\/_next\/|\/_nuxt\/|\/_astro\/|\/@vite\/client|gatsby-(?:browser|app|runtime)|webpack-runtime|framework-[0-9a-f]{6,}\.js|(?:^|\/)main-[0-9a-f]{6,}\.js|polyfills-[0-9a-f]{6,}\.js|parastorage\.com|static\.wixstatic|wix(?:code|-)|squarespace[^/]*\/(?:universal|commons|runtime)|sites\.squarespace|hydrat)/i

const TRACKER_SCRIPT_SRC =
  /(?:googletagmanager\.com|google-analytics\.com|gtag\/js|connect\.facebook\.net|fbevents|static\.hotjar|clarity\.ms|cdn\.segment|fullstory|mixpanel|matomo|piwik|doubleclick\.net|cdn\.amplitude|browser\.sentry-cdn|bugsnag)/i

// Inline scripts that rewrite / replace the document or navigate away.
const DANGEROUS_INLINE_SCRIPT =
  /document\.write|document(?:Element)?\.(?:open|innerHTML\s*=)|document\.body\.innerHTML\s*=|location\.(?:replace|assign)\s*\(|(?:window\.)?location\s*=|serviceWorker\.register|__NEXT_DATA__|__NUXT__|__remixContext|ReactDOM\.(?:hydrate|createRoot|render)\b|\bcreateRoot\s*\(|hydrateRoot\s*\(|caches\.(?:open|match)|window\.__sq_/i

/** True when a script (by src OR inline body) would hijack/blank the page or is a
 *  pure tracker — i.e. it must NOT be injected into the clone. */
export function shouldDropScript(src: string | null | undefined, inline = ''): boolean {
  if (src) return DANGEROUS_SCRIPT_SRC.test(src) || TRACKER_SCRIPT_SRC.test(src)
  return DANGEROUS_INLINE_SCRIPT.test(inline)
}

// Resolve a URL against the page origin. Leaves absolute / data / anchor URLs as-is.
export function absolutise(url: string | undefined | null, base: URL): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (!trimmed) return undefined
  if (/^(https?:|data:|mailto:|tel:|#)/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `${base.protocol}${trimmed}`
  try { return new URL(trimmed, base).toString() } catch { return trimmed }
}

// Re-serialize an element's attributes, optionally overriding some, escaping
// quotes. Preserves valueless boolean attributes (e.g. `defer`, `async`).
function serializeAttrs(el: HTMLElement, overrides: Record<string, string> = {}): string {
  const seen = new Set<string>()
  let out = ''
  const emit = (k: string, v: string | null) => {
    if (v === null || v === '' || v === k) out += ` ${k}`
    else out += ` ${k}="${v.replace(/"/g, '&quot;')}"`
  }
  for (const [k, v] of Object.entries(el.attributes)) {
    const key = k.toLowerCase()
    if (key in overrides) { emit(k, overrides[key]); seen.add(key); continue }
    emit(k, v)
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (!seen.has(k.toLowerCase())) emit(k, v)
  }
  return out
}

// Serialize a client <script>, absolutising its src. External scripts keep their
// loading attributes; inline scripts keep their body verbatim (client site code).
function serializeScript(node: HTMLElement, base: URL): string {
  const src = node.getAttribute('src')
  if (src) {
    const abs = absolutise(src, base)
    if (!abs) return ''
    return `<script${serializeAttrs(node, { src: abs })}></script>`
  }
  const body = node.text ?? ''
  if (!body.trim()) return ''
  const type = node.getAttribute('type')
  const typeAttr = type ? ` type="${type.replace(/"/g, '&quot;')}"` : ''
  return `<script${typeAttr}>${body.replace(/<\/script/gi, '<\\/script')}</script>`
}

/**
 * The client's <head> assets, filtered + absolutised. KEEPS stylesheet/style/font
 * links + resource hints + scripts; STRIPS <title>/<meta>/<link rel=canonical>/
 * <base>. Injecting this is what makes the light-DOM header/footer look 1:1.
 */
export function buildExtractedHead(root: HTMLElement, base: URL): string {
  const head = root.querySelector('head')
  if (!head) return ''
  const parts: string[] = []

  for (const node of head.childNodes) {
    if (typeof (node as HTMLElement).tagName !== 'string') continue
    const el = node as HTMLElement
    const tag = (el.tagName || '').toUpperCase()

    if (tag === 'LINK') {
      const rel = (el.getAttribute('rel') ?? '').toLowerCase()
      if (rel.includes('canonical')) continue
      if (!KEEP_LINK_RELS.test(rel)) continue
      const href = absolutise(el.getAttribute('href'), base)
      if (!href) continue
      parts.push(`<link${serializeAttrs(el, { href })}>`)
    } else if (tag === 'STYLE') {
      const css = el.text ?? ''
      if (!css.trim()) continue
      const abs = absolutiseCssUrls(css, base).replace(/<\/style/gi, '<\\/style')
      parts.push(`<style>${abs}</style>`)
    } else if (tag === 'SCRIPT') {
      // Drop SPA bootstraps / hydration / service-workers / trackers that would
      // blank the cloned page; keep the rest (menus, jQuery, theme JS).
      if (shouldDropScript(el.getAttribute('src'), el.text ?? '')) continue
      parts.push(serializeScript(el, base))
    }
    // TITLE / META / BASE / everything else: intentionally dropped.
  }

  return parts.join('\n').slice(0, MAX_HEAD_HTML)
}

/**
 * Normalize a possibly-malformed HTML fragment into browser-accurate, well-formed
 * markup. Targets routinely ship a header/footer with UNCLOSED tags; injected
 * verbatim, those open tags "swallow" everything after them (our blog + the
 * footer) and break the whole page. parse5 parses EXACTLY like a browser and
 * re-serializes BALANCED markup, so the fragment is self-contained and can never
 * escape its slot. (node-html-parser silently tolerates the breakage, so it can't
 * be trusted here — the fix must use a spec-compliant HTML5 parser.)
 */
export function normalizeFragment(html: string): string {
  if (!html.trim()) return ''
  try { return serialize(parseFragment(html)) } catch { return html }
}

