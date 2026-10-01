import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { tocInnerHtml, type TocHeading } from '@/lib/render/blockMarkup'
import { readerNodeView } from '../canvas/readerView'
import { slugify } from './slug'

/** The headings the render lists — the ids HeadingId serializes, in document order. */
function tocHeadings(doc: PMNode): TocHeading[] {
  const out: TocHeading[] = []
  doc.descendants((n) => {
    if (n.type.name === 'heading') out.push({ level: Number(n.attrs.level) || 2, id: slugify(n.textContent || ''), text: n.textContent.trim() })
  })
  return out
}

// What each TOC view last wrote, so a keystroke that changes no heading writes nothing.
const written = new WeakMap<HTMLElement, string>()

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toc: {
      setToc: () => ReturnType
    }
  }
}

/**
 * Table of Contents / index. Serializes to an empty `<nav class="carma-toc"
 * data-carma-toc>` marker that the server fills from the article's headings at
 * render time, so the public TOC is always in sync (and links to the heading
 * ids emitted by the HeadingId extension). On the canvas it is filled by the same
 * function, live on every change; its links scroll to the heading.
 */
export const Toc = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'nav.carma-toc' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['nav', mergeAttributes(HTMLAttributes, { class: 'carma-toc', 'data-carma-toc': 'true' })]
  },

  addNodeView() {
    return readerNodeView({
      live: true,
      fill: (dom, _node, view) => {
        const html = tocInnerHtml(tocHeadings(view.state.doc))
        if (written.get(dom) === html) return
        written.set(dom, html)
        dom.innerHTML = html
      },
    })
  },

  addCommands() {
    return {
      setToc:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    }
  },
})

