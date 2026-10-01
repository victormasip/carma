// W7.3 — a node view whose DOM IS the published markup.
//
// A React node view wraps its block in TipTap's renderer element and puts the
// editable content in yet another <div>: the writer then edits a DIFFERENT tree
// from the one the reader gets, styled by editor-only CSS (the gold CTA, the
// hard-coded rings). These views are built from the block's own `renderHTML` —
// `DOMSerializer.renderSpec(node.type.spec.toDOM(node))`, the exact serializer
// `getHTML()` uses — and then given the SAME fill the render applies on the server
// (responsive pictures, the embed's iframe, the table of contents). By
// construction, the block on the canvas is the block on the blog.
//
// Everything a writer needs that a reader must not see lives outside the block:
// in the canvas UI layer (BlockControls), or, when it has to sit on top of the
// block (the embed's click shield), in a `data-carma-ui` element the fidelity gate
// ignores and the blog's stylesheet cannot style.

import type { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core'
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/** Adds to a freshly serialized block what the render adds on the server. */
export type ReaderFill = (dom: HTMLElement, node: PMNode, view: EditorView) => void

function sameAttrs(a: PMNode, b: PMNode): boolean {
  const ka = Object.keys(a.attrs)
  return ka.length === Object.keys(b.attrs).length && ka.every(k => JSON.stringify(a.attrs[k]) === JSON.stringify(b.attrs[k]))
}

/**
 * @param fill  the render's server-side fill, applied to the serialized DOM
 * @param live  re-run the fill on every document change (a TOC lists OTHER nodes)
 */
export function readerNodeView({ fill, live = false }: { fill?: ReaderFill; live?: boolean } = {}): NodeViewRenderer {
  return ({ node, view, editor }: NodeViewRendererProps) => {
    const spec = node.type.spec.toDOM?.(node)
    if (!spec) throw new Error(`readerNodeView: ${node.type.name} has no renderHTML`)
    // The view's own document — in the canvas, the iframe's.
    const out = DOMSerializer.renderSpec(view.dom.ownerDocument, spec)
    const dom = out.dom as HTMLElement
    const contentDOM = out.contentDOM ?? null
    let current = node
    fill?.(dom, node, view)

    const refill = () => { fill?.(dom, current, editor.view) }
    if (live) editor.on('update', refill)

    return {
      dom,
      contentDOM,
      // A changed attribute (a CTA's alignment, a gallery's images) rebuilds the
      // view from renderHTML — the one source of the markup — instead of patching it.
      update(next: PMNode) {
        if (next.type !== current.type || !sameAttrs(next, current)) return false
        current = next
        return true
      },
      // The fill writes into the block; ProseMirror must not read that back as an
      // edit. Only the editable hole (contentDOM) is ProseMirror's to observe.
      ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }) {
        if (m.type === 'selection') return false
        return !contentDOM || !contentDOM.contains(m.target)
      },
      destroy() { if (live) editor.off('update', refill) },
    }
  }
}
