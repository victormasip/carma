import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggle: {
      setToggleBlock: () => ReturnType
    }
  }
}

/** The clickable title row of a toggle/accordion. */
export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'summary' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes, { class: 'carma-toggle-summary' }), 0]
  },
})

/**
 * Collapsible toggle / accordion built on native `<details>/<summary>` — fully
 * interactive on the public blog with zero JavaScript. In the editor the body
 * is always shown (CSS) so it stays editable regardless of open state.
 */
export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary block+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'details.carma-toggle' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes, { class: 'carma-toggle' }), 0]
  },

  addCommands() {
    return {
      setToggleBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [
              { type: 'toggleSummary', content: [{ type: 'text', text: 'Títol desplegable' }] },
              { type: 'paragraph' },
            ],
          }),
    }
  },
})
