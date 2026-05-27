import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      setColumns: () => ReturnType
    }
  }
}

/** A single column — a block container inside a `columns` grid. */
export const Column = Node.create({
  name: 'column',
  group: 'column',
  content: 'block+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div.carma-column' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'carma-column' }), 0]
  },
})

/**
 * Two-column responsive grid. Serializes to
 * `<div class="carma-columns"><div class="carma-column">…</div>×2</div>`, which
 * collapses to a single column on narrow viewports via CSS on the public blog.
 */
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column column',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div.carma-columns' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'carma-columns' }), 0]
  },

  addCommands() {
    return {
      setColumns:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [
              { type: 'column', content: [{ type: 'paragraph' }] },
              { type: 'column', content: [{ type: 'paragraph' }] },
            ],
          }),
    }
  },
})
