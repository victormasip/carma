import { Node, mergeAttributes } from '@tiptap/core'

export type CalloutVariant = 'info' | 'success' | 'warning' | 'danger'

const VARIANTS: CalloutVariant[] = ['info', 'success', 'warning', 'danger']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { variant?: CalloutVariant }) => ReturnType
      toggleCallout: (attrs?: { variant?: CalloutVariant }) => ReturnType
      unsetCallout: () => ReturnType
    }
  }
}

/**
 * Highlight / callout card. Serializes to clean, JS-free semantic HTML
 * (`<div class="carma-callout" data-variant="…">`) so it renders identically
 * on the public blog. The leading icon is drawn purely via CSS `::before`.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: (el) => {
          const v = el.getAttribute('data-variant')
          return VARIANTS.includes(v as CalloutVariant) ? v : 'info'
        },
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.carma-callout' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'carma-callout' }), 0]
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs),
      toggleCallout:
        (attrs) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attrs),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },
})
