// /api/img URLs, for the product's own React surfaces.
//
// WHY NOT `next/image`
// ───────────────────
// Carma's images are overwhelmingly OTHER PEOPLE'S: a logo on a customer's CDN,
// a featured image scraped from the site we cloned, a cover on a member's blog.
// `next/image` would need every one of those hosts in `remotePatterns` — a list
// nobody can keep complete, and a config file that grows with the customer base.
// The escape hatch (`unoptimized`) is just an `<img>` with extra steps.
//
// We already own the answer. `/api/img` is a hardened transform endpoint — SSRF
// guard, size cap, EXIF rotation, AVIF/WebP by Accept, and
// `s-maxage=31536000, immutable` so the Vercel edge serves it forever — and the
// public renderer has used it for every blog image since July. The product's own
// screens were the only place still hot-linking full-size originals: a 3MB
// customer JPEG rendered at 40×40 in the sidebar.
//
// This module is the React-side counterpart to lib/render/image.ts. It is
// deliberately a SEPARATE, dependency-free file rather than an import from
// there: that module is string-concat HTML for the renderer and it imports
// node-html-parser, which W1/F1 spent a wave getting out of the browser. One
// convenient import would put 82KB of entity tables straight back.
//
// See docs/plans/2026-09-18-performance-every-page.md §F6 / W5.

/** Widths worth generating for small, fixed-size art (logos, avatars). */
export const ICON_WIDTHS = [48, 96, 144] as const
/** Widths for cards and thumbnails. */
export const CARD_WIDTHS = [400, 640, 960] as const

/**
 * Can `/api/img` do anything with this source?
 *
 * The endpoint's SSRF guard parses `src` with `new URL()`, which throws on a
 * relative path — so anything that is not absolute-http(s) or a data: image is
 * passed through untouched. Returning false here is never a failure; it means
 * "this one is already ours and already small", and the caller uses `src`.
 */
export function canOptimize(src: string | null | undefined): src is string {
  if (!src) return false
  return /^https?:\/\//i.test(src) || /^data:image\//i.test(src)
}

/** One transformed variant. `fmt` omitted = let the endpoint pick from Accept. */
export function imgUrl(src: string, width: number, quality?: number): string {
  const p = new URLSearchParams({ src, w: String(width) })
  if (quality) p.set('q', String(quality))
  return `/api/img?${p.toString()}`
}

/**
 * A `srcset` across `widths`, so the browser picks the variant that fits the
 * slot and the device's pixel ratio rather than downloading the original.
 */
export function imgSrcSet(src: string, widths: readonly number[], quality?: number): string {
  return widths.map(w => `${imgUrl(src, w, quality)} ${w}w`).join(', ')
}

/**
 * Everything an `<img>` needs, or nothing at all.
 *
 * Returns `src` alone for sources the endpoint cannot take, so a call site is
 * always `{...optimizedImg(url, …)}` with no branching:
 *
 *   <img {...optimizedImg(site.logo_url, ICON_WIDTHS, '40px')} alt="" />
 */
export function optimizedImg(
  src: string,
  widths: readonly number[],
  sizes: string,
  quality?: number,
): { src: string; srcSet?: string; sizes?: string } {
  if (!canOptimize(src)) return { src }
  // The `src` fallback is the largest variant: a browser that ignores srcset
  // (or a proxy that strips it) still gets a transformed image, never the 3MB
  // original. /api/img redirects to the source if the transform fails, so this
  // can degrade but not break.
  const largest = widths[widths.length - 1]
  return { src: imgUrl(src, largest, quality), srcSet: imgSrcSet(src, widths, quality), sizes }
}
