import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { ListTree } from 'lucide-react'
import { slugify } from './slug'

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
 * ids emitted by the HeadingId extension). In the editor it shows a live,
 * clickable preview.
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
    return ReactNodeViewRenderer(TocView)
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

function TocView({ editor }: NodeViewProps) {
  const [, force] = useState(0)

  useEffect(() => {
    const cb = () => force((n) => n + 1)
    editor.on('update', cb)
    return () => { editor.off('update', cb) }
  }, [editor])

  const items: { level: number; text: string; slug: string }[] = []
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'heading') {
      const text = n.textContent.trim()
      if (text) items.push({ level: n.attrs.level as number, text, slug: slugify(text) })
    }
  })

  const go = (slug: string) => {
    // slug is already [a-z0-9-], so it's a valid id selector as-is.
    const el = editor.view.dom.querySelector(`#${slug}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <NodeViewWrapper className="carma-toc-editor not-prose" data-drag-handle contentEditable={false}>
      <div className="carma-toc-head">
        <ListTree className="w-3.5 h-3.5" />
        <span>Índex</span>
      </div>
      {items.length === 0 ? (
        <p className="carma-toc-empty">Afegeix encapçalaments (Títol 1/2/3) i apareixeran aquí automàticament.</p>
      ) : (
        <ul>
          {items.map((it, i) => (
            <li key={`${it.slug}-${i}`} style={{ paddingLeft: `${(Math.min(it.level, 3) - 1) * 14}px` }}>
              <button type="button" onClick={() => go(it.slug)}>{it.text}</button>
            </li>
          ))}
        </ul>
      )}
    </NodeViewWrapper>
  )
}
