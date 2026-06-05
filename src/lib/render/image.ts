// Responsive image emitter for the public renderer.
//
// Every image in the rendered output (featured, in-content, gallery, card)
// goes through `responsiveImage()`, which produces a `<picture>` element that:
//
//   · Serves AVIF + WebP variants via the /api/img transform endpoint
//   · Provides multi-density srcset (1x, 1.5x, 2x — picked by the browser)
//   · Includes explicit width/height to kill CLS
//   · Lazy-loads + async-decodes by default (`loading="lazy"`, `decoding="async"`)
//   · Falls back to the original `src` if the transform endpoint fails
//
// Data URIs (editor base64 pastes) are also routed through /api/img so the
// browser still gets a tiny WebP instead of a 2 MB PNG.
//
// HOT-PATH: this is called for every image on every render, so the function
// is intentionally string-concat-based (no node-html-parser, no JSX).

import { parse } from 'node-html-parser'

const DEFAULT_SIZES_FULLBLEED = '(min-width: 1024px) 720px, 100vw'
const DEFAULT_SIZES_CARD      = '(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw'
const DEFAULT_SIZES_FEATURED  = '(min-width: 1024px) 760px, 100vw'

/** Widths to generate in the srcset. Picked to cover phone → desktop 2× DPR. */
const SRC_WIDTHS = [400, 640, 960, 1280, 1600] as const

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isLocalSrc(src: string): boolean {
  return src.startsWith('data:') || src.startsWith('/') || src.startsWith('blob:')
}

/** Build a /api/img URL for a given src+width+fmt. */
function transformUrl(src: string, width: number, fmt?: 'webp' | 'avif'): string {
  const u = new URL('/api/img', 'http://x') // base is dummy — we return path+query
  u.searchParams.set('src', src)
  u.searchParams.set('w', String(width))
  if (fmt) u.searchParams.set('fmt', fmt)
  return u.pathname + u.search
}

/** Build the comma-separated srcset value for a given format. */
function buildSrcset(src: string, fmt?: 'webp' | 'avif'): string {
  return SRC_WIDTHS.map(w => `${transformUrl(src, w, fmt)} ${w}w`).join(', ')
}

export type ResponsiveImageOptions = {
  src: string
  alt: string
  /** Optional CSS class on the inner <img>. */
  className?: string
  /** Aspect-ratio sizing for the wrapper. Suppress with `none`. */
  aspect?: '16/9' | '4/3' | '1/1' | '3/4' | 'none'
  /** Sizes attribute — picks the right width from the srcset. */
  sizes?: string
  /** Disable lazy loading (e.g. above-the-fold hero). */
  eager?: boolean
  /** Width/height attrs for CLS protection. If omitted, derived from aspect. */
  width?: number
  height?: number
}

const ASPECT_DIMS: Record<Exclude<ResponsiveImageOptions['aspect'], 'none' | undefined>, [number, number]> = {
  '16/9': [1600, 900],
  '4/3':  [1600, 1200],
  '1/1':  [1200, 1200],
  '3/4':  [1200, 1600],
}

/**
 * Emit a `<picture>` for one image. Use the higher-level helpers
 * (`responsiveFeaturedImage`, `responsiveCardImage`, `transformContentImages`)
 * which apply the right sizes for their context.
 */
export function responsiveImage(opts: ResponsiveImageOptions): string {
  const { src, alt, className, aspect = 'none', sizes, eager } = opts
  if (!src) return ''

  // Blob URLs (only exist in the creating page) and legacy base64 data-URIs are
  // rendered as a plain <img>, NOT routed through /api/img. Routing a multi-MB
  // data-URI through `?src=` × srcset widths produced absurd URLs that exceeded
  // server/CDN limits → broken images. New uploads are clean URLs (see /api/upload),
  // so this is just graceful handling of pre-existing content.
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    const dims = aspect !== 'none' && !opts.width
      ? ` width="${ASPECT_DIMS[aspect][0]}" height="${ASPECT_DIMS[aspect][1]}"`
      : ''
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${className ? ` class="${escapeAttr(className)}"` : ''}${dims} loading="${eager ? 'eager' : 'lazy'}" decoding="async" />`
  }

  const [w, h] = aspect !== 'none'
    ? (opts.width && opts.height ? [opts.width, opts.height] : ASPECT_DIMS[aspect])
    : [opts.width ?? 1600, opts.height ?? 0]

  const sizesAttr = sizes ?? DEFAULT_SIZES_FULLBLEED
  const fallbackSrc = isLocalSrc(src) || /^https?:\/\//i.test(src)
    ? transformUrl(src, 1280)
    : src

  const dimAttrs = h > 0 ? ` width="${w}" height="${h}"` : ` width="${w}"`

  return [
    '<picture>',
      `<source type="image/avif" srcset="${escapeAttr(buildSrcset(src, 'avif'))}" sizes="${escapeAttr(sizesAttr)}" />`,
      `<source type="image/webp" srcset="${escapeAttr(buildSrcset(src, 'webp'))}" sizes="${escapeAttr(sizesAttr)}" />`,
      `<img src="${escapeAttr(fallbackSrc)}" alt="${escapeAttr(alt)}"${className ? ` class="${escapeAttr(className)}"` : ''}${dimAttrs} loading="${eager ? 'eager' : 'lazy'}" decoding="async" />`,
    '</picture>',
  ].join('')
}

export function responsiveFeaturedImage(src: string, alt: string): string {
  return responsiveImage({ src, alt, aspect: '16/9', sizes: DEFAULT_SIZES_FEATURED, eager: true, className: 'carma-article-image' })
}

export function responsiveCardImage(src: string, alt: string): string {
  return responsiveImage({ src, alt, aspect: '16/9', sizes: DEFAULT_SIZES_CARD })
}

/**
 * Walk the article HTML, find every `<img>` (inside `<figure class="carma-figure">`,
 * gallery slides, raw paragraphs…) and replace it with a `<picture>` that uses
 * the transform endpoint. Preserves the existing alt + class + parent wrapper.
 *
 * Idempotent — already-transformed `<picture>` elements are skipped.
 */
export function transformContentImages(html: string): string {
  if (!html || !html.includes('<img')) return html
  let root: ReturnType<typeof parse>
  try { root = parse(html) } catch { return html }

  const imgs = root.querySelectorAll('img')
  for (const img of imgs) {
    // Skip if the <img> is already wrapped in a <picture> we (or someone) emitted.
    if (img.parentNode && (img.parentNode as { tagName?: string }).tagName === 'PICTURE') continue

    const src = img.getAttribute('src')
    if (!src) continue

    const alt = img.getAttribute('alt') ?? ''
    const className = img.getAttribute('class') ?? undefined
    const widthAttr = Number(img.getAttribute('width')) || undefined
    const heightAttr = Number(img.getAttribute('height')) || undefined

    // Gallery slides set their own aspect via parent CSS — don't double-fix.
    const parentTag = (img.parentNode as { tagName?: string } | null)?.tagName
    const inGallery = (img.getAttribute('class') ?? '').includes('carma-gallery')
      || (parentTag === 'A' && (img.parentNode as unknown as { classList?: { contains: (c: string) => boolean } }).classList?.contains?.('carma-gallery-item'))

    const pictureHtml = responsiveImage({
      src,
      alt,
      className,
      aspect: inGallery ? 'none' : (widthAttr && heightAttr ? 'none' : '16/9'),
      sizes: DEFAULT_SIZES_FULLBLEED,
      width: widthAttr,
      height: heightAttr,
    })
    img.replaceWith(pictureHtml)
  }

  return root.toString()
}
