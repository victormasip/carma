// CSS URL helpers for the Theme capture.
//
// When we inject the client's real <head> assets into the render document, inline
// <style> blocks and @import targets carry RELATIVE urls (background images,
// self-hosted fonts) that would 404 once served from our origin. These helpers
// absolutise those urls against the source origin so every asset resolves. (We do
// NOT rewrite urls inside EXTERNAL .css files — linking them at their absolute
// origin URL makes their own relative urls resolve automatically.)
//
// `splitImports` is also used by the token-extraction CSS fetcher to follow
// @import chains so we can read custom properties / palette rules.

export function absolutiseUrl(url: string | undefined | null, base: URL): string {
  const u = (url ?? '').trim().replace(/^["']|["']$/g, '')
  if (!u || /^(data:|mailto:|tel:|#|https?:)/i.test(u)) return u
  if (u.startsWith('//')) return `${base.protocol}${u}`
  try { return new URL(u, base).toString() } catch { return u }
}

export function absolutiseCssUrls(css: string, base: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, q: string, url: string) => {
    const abs = absolutiseUrl(url, base)
    return `url(${q}${abs}${q})`
  })
}

// ─── Icon/font CORS fix ─────────────────────────────────────────────────────
// Cross-origin web fonts are CORS-blocked when the clone is served from our
// origin. Route absolute font URLs through the same-origin /api/asset proxy
// (which re-adds CORS) so @font-face icon fonts actually load.

const FONT_URL_EXT = /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i

/** Proxy any absolute http(s) FONT url() in a CSS string through /api/asset. */
export function proxyFontsInCss(css: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q: string, url: string) => {
    if (/^https?:\/\//i.test(url) && FONT_URL_EXT.test(url)) {
      return `url(${q}/api/asset?u=${encodeURIComponent(url)}${q})`
    }
    return m
  })
}

/** Pull every `@font-face { … }` block out of a stylesheet (flat — they never
 *  nest), for re-emitting with proxied font URLs. */
export function extractFontFaceCss(css: string): string {
  const blocks = css.match(/@font-face\s*\{[^{}]*\}/gi)
  return blocks ? blocks.join('\n') : ''
}

/** Rewrite an SVG `<use>` href to the same-origin proxy when it targets an
 *  EXTERNAL sprite file (cross-origin `<use>` is blocked by browsers). A pure
 *  in-page fragment (`#icon`) is left untouched. The `#fragment` is preserved. */
export function proxyUseHref(href: string | undefined | null, base: URL): string {
  const abs = absolutiseUrl(href, base)
  if (!/^https?:\/\//i.test(abs)) return abs // pure fragment / data: — leave as-is
  const hash = abs.indexOf('#')
  const file = hash >= 0 ? abs.slice(0, hash) : abs
  const frag = hash >= 0 ? abs.slice(hash) : ''
  return `/api/asset?u=${encodeURIComponent(file)}${frag}`
}

/** Pull @import statements out of a sheet, returning their absolute URLs and the
 *  CSS with the @imports removed (they're fetched + inlined separately). */
export function splitImports(css: string, base: URL): { imports: string[]; rest: string } {
  const imports: string[] = []
  const rest = css.replace(
    /@import\s+(?:url\(\s*)?(['"]?)([^'")]+)\1\s*\)?\s*[^;]*;/gi,
    (_m, _q: string, url: string) => {
      const abs = absolutiseUrl(url, base)
      if (abs && /^https?:/i.test(abs)) imports.push(abs)
      return ''
    },
  )
  return { imports, rest }
}
