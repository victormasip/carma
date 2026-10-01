import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { readerNodeView } from '../canvas/readerView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ctaButton: {
      setCtaButton: () => ReturnType
    }
  }
}

export type Align = 'left' | 'center' | 'right'

/**
 * Call-to-action button — a styled link with an editable label, target URL and
 * alignment. Serializes to a real `<a class="carma-button">` so it's a working
 * button on the public blog. On the canvas it IS that markup (the label is typed
 * straight into the <a>); its URL and alignment controls live in BlockControls.
 */
export const CtaButton = Node.create({
  name: 'ctaButton',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      href: {
        default: '#',
        parseHTML: (el) => el.querySelector('a')?.getAttribute('href') ?? '#',
        renderHTML: () => ({}),
      },
      align: {
        default: 'left' as Align,
        parseHTML: (el) => (el.getAttribute('data-align') as Align) ?? 'left',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.carma-button-wrap', contentElement: 'a.carma-button' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'carma-button-wrap', 'data-align': node.attrs.align }),
      ['a', { class: 'carma-button', href: node.attrs.href || '#' }, 0],
    ]
  },

  addNodeView() {
    return readerNodeView()
  },

  // The label is typed straight into the published <a> — and a browser never
  // extends a link past its end: a character typed after "Reserva" landed OUTSIDE
  // the <a>, where ProseMirror (whose editable hole is the <a>) never saw it, and
  // it was lost (found by the W7.3 spike). So typing inside a CTA label goes
  // through ProseMirror itself; IME composition keeps the browser's own path.
  addProseMirrorPlugins() {
    const name = this.name
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            beforeinput: (view, event) => {
              const e = event as InputEvent
              if (e.inputType !== 'insertText' || !e.data || e.isComposing) return false
              if (view.state.selection.$from.parent.type.name !== name) return false
              e.preventDefault()
              view.dispatch(view.state.tr.insertText(e.data))
              return true
            },
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setCtaButton:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { href: '#', align: 'left' },
            content: [{ type: 'text', text: 'Botó' }],
          }),
    }
  },
})

