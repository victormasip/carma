import { Node, mergeAttributes } from '@tiptap/core'
import { transformContentImagesIn } from '@/lib/render/imageMarkup'
import { readerNodeView } from '../canvas/readerView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figure: {
      setFigure: (attrs: { src: string; alt?: string | null }) => ReturnType
    }
  }
}

/**
 * Image with an editable caption. Serializes to semantic
 * `<figure class="carma-figure"><img><figcaption>…</figcaption></figure>` so the
 * caption renders identically on the public blog. The caption is the node's
 * inline content (a content hole inside `<figcaption>`). On the canvas the image
 * is the render's own responsive markup (W7.3); an empty caption shows a
 * placeholder from the editor layer. A bare legacy `<img>` is also parsed so old
 * posts upgrade transparently.
 */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'inline*',
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.querySelector('img')?.getAttribute('src') ?? el.getAttribute('src'),
        renderHTML: () => ({}),
      },
      alt: {
        default: null,
        parseHTML: (el) => el.querySelector('img')?.getAttribute('alt') ?? el.getAttribute('alt'),
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'figure.carma-figure', contentElement: 'figcaption' },
      { tag: 'img[src]' },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { class: 'carma-figure' }),
      ['img', { src: node.attrs.src, alt: node.attrs.alt ?? '', loading: 'lazy' }],
      ['figcaption', { class: 'carma-figcaption' }, 0],
    ]
  },

  addNodeView() {
    return readerNodeView({ fill: dom => transformContentImagesIn(dom) })
  },

  addCommands() {
    return {
      setFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { src: attrs.src, alt: attrs.alt ?? null } }),
    }
  },
})

