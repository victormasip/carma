import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { AlignLeft, AlignCenter, AlignRight, Link2 } from 'lucide-react'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ctaButton: {
      setCtaButton: () => ReturnType
    }
  }
}

type Align = 'left' | 'center' | 'right'

/**
 * Call-to-action button — a styled link with an editable label, target URL and
 * alignment. Serializes to a real `<a class="carma-button">` so it's a working
 * button on the public blog.
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
    return ReactNodeViewRenderer(CtaView)
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

function CtaView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const align: Align = node.attrs.align ?? 'left'
  const editable = editor.isEditable
  return (
    <NodeViewWrapper className="carma-cta-block" style={{ textAlign: align }}>
      <NodeViewContent className="carma-button" />
      {editable && selected && (
        <div className="carma-cta-controls" contentEditable={false} style={{ textAlign: 'left' }}>
          <div className="carma-cta-href">
            <Link2 className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="url"
              value={node.attrs.href === '#' ? '' : node.attrs.href}
              onChange={(e) => updateAttributes({ href: e.target.value || '#' })}
              placeholder="https://… (destí del botó)"
            />
          </div>
          <div className="carma-cta-align">
            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
              <button
                key={a}
                type="button"
                onClick={() => updateAttributes({ align: a })}
                className={align === a ? 'is-active' : ''}
                title={a}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </NodeViewWrapper>
  )
}
