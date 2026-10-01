// W7.3 — what the render writes INTO a stored block, as one client-safe source.
//
// Two blocks are stored as empty markers and filled at render time: the table of
// contents (`<nav data-carma-toc>`, filled from the article's headings) and the
// video embed (`<div data-carma-embed>`, filled with a sandboxed iframe built only
// from a validated provider + id). theme.ts fills them on the server; the editor
// canvas fills its node views with the SAME functions, so the writer sees the
// block the reader gets — not an editor's impression of it.

import { embedSrc } from '@/lib/embed'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export type TocHeading = { level: number; id: string; text: string }

/** The inside of a filled `nav.carma-toc` — empty when there is nothing to list. */
export function tocInnerHtml(headings: TocHeading[]): string {
  const items = headings.filter(h => h.text && h.id)
  if (!items.length) return ''
  return `<div class="carma-toc-title">Índex</div><ol>${items
    .map(h => `<li class="lvl-${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`)
    .join('')}</ol>`
}

/** The inside of a filled `[data-carma-embed]` — empty for an unknown provider/id. */
export function embedInnerHtml(provider: string, id: string): string {
  const src = embedSrc(provider, id.trim())
  if (!src) return ''
  return `<iframe src="${esc(src)}" title="Vídeo ${esc(provider)}" loading="lazy" `
    + `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" `
    + `referrerpolicy="strict-origin-when-cross-origin" `
    + `sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allowfullscreen></iframe>`
}
