import { Node, mergeAttributes } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { transformContentImagesIn } from '@/lib/render/imageMarkup'
import { readerNodeView } from '../canvas/readerView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    gallery: {
      setGallery: (attrs?: { images?: string[] }) => ReturnType
    }
  }
}

// Stable-ish id base for a gallery's CSS slides + `:target` lightboxes.
function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

/**
 * Image gallery — a horizontal carousel. The public render is 100% JS-free:
 * scroll-snap track + per-slide anchor arrows (`#slide-id`) + a `:target`
 * lightbox with prev/next. On the canvas it IS that markup (W7.3): the slide
 * arrows page it exactly as on the blog (the canvas turns in-page anchors into
 * scrolls), and adding / removing images lives in BlockControls.
 */
export const Gallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      images: {
        default: [] as string[],
        parseHTML: (el) =>
          Array.from(el.querySelectorAll('a.carma-gallery-item img'))
            .map((img) => img.getAttribute('src') ?? '')
            .filter(Boolean),
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.carma-gallery' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const images: string[] = Array.isArray(node.attrs.images) ? node.attrs.images : []
    const n = images.length
    const h = hashStr(images.join('|'))
    const sl = `cxsl-${h}`
    const lb = `cxlb-${h}`

    const slides: DOMOutputSpec[] = images.map((src, i) => {
      const prev = (i - 1 + n) % n
      const next = (i + 1) % n
      const children: DOMOutputSpec[] = [
        ['a', { class: 'carma-gallery-item', href: `#${lb}-${i}` }, ['img', { src, loading: 'lazy', alt: '' }]],
      ]
      if (n > 1) {
        children.push(['a', { class: 'carma-slide-arrow prev', href: `#${sl}-${prev}`, 'aria-label': 'Anterior' }, '‹'])
        children.push(['a', { class: 'carma-slide-arrow next', href: `#${sl}-${next}`, 'aria-label': 'Següent' }, '›'])
      }
      return ['div', { class: 'carma-slide', id: `${sl}-${i}` }, ...children]
    })

    const boxes: DOMOutputSpec[] = images.map((src, i) => {
      const prev = (i - 1 + n) % n
      const next = (i + 1) % n
      const inner: DOMOutputSpec[] = [
        ['a', { class: 'carma-lightbox-backdrop', href: '#', 'aria-label': 'Tancar' }],
        ['img', { class: 'carma-lightbox-img', src, alt: '' }],
      ]
      if (n > 1) {
        inner.push(['a', { class: 'carma-lightbox-nav prev', href: `#${lb}-${prev}`, 'aria-hidden': 'true' }, '‹'])
        inner.push(['a', { class: 'carma-lightbox-nav next', href: `#${lb}-${next}`, 'aria-hidden': 'true' }, '›'])
      }
      inner.push(['a', { class: 'carma-lightbox-close', href: '#', 'aria-label': 'Tancar' }, '×'])
      return ['div', { class: 'carma-lightbox', id: `${lb}-${i}` }, ...inner]
    })

    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'carma-gallery', 'data-count': String(n) }),
      ['div', { class: 'carma-gallery-track' }, ...slides],
      ...boxes,
    ] as DOMOutputSpec
  },

  addNodeView() {
    return readerNodeView({ fill: dom => transformContentImagesIn(dom) })
  },

  addCommands() {
    return {
      setGallery:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { images: attrs?.images ?? [] } }),
    }
  },
})

