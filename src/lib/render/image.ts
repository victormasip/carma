// Responsive images for the public renderer — the server half.
//
// The markup itself (`responsiveImage` and friends) lives in imageMarkup.ts, which
// is client-safe: the editor canvas renders images through the same functions
// (W7.3). This file keeps only what needs node-html-parser — the string walker
// that rewrites a stored article's <img> tags — and re-exports the rest.

import { parse } from 'node-html-parser'
import { contentImageOptions, responsiveImage } from './imageMarkup'

export {
  responsiveImage, responsiveFeaturedImage, responsiveCardImage, contentImageOptions,
  DEFAULT_SIZES_FULLBLEED, DEFAULT_SIZES_CARD, DEFAULT_SIZES_FEATURED,
  type ResponsiveImageOptions,
} from './imageMarkup'

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

    // Gallery slides set their own aspect via parent CSS — don't double-fix.
    const parent = img.parentNode as unknown as { tagName?: string; classList?: { contains: (c: string) => boolean } } | null
    const pictureHtml = responsiveImage(contentImageOptions({
      src,
      alt: img.getAttribute('alt') ?? '',
      className: img.getAttribute('class') ?? undefined,
      width: Number(img.getAttribute('width')) || undefined,
      height: Number(img.getAttribute('height')) || undefined,
      inGallery: (img.getAttribute('class') ?? '').includes('carma-gallery')
        || (parent?.tagName === 'A' && !!parent.classList?.contains?.('carma-gallery-item')),
    }))
    img.replaceWith(pictureHtml)
  }

  return root.toString()
}
