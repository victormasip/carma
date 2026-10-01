import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core'
import { embedInnerHtml } from '@/lib/render/blockMarkup'
import { readerNodeView } from '../canvas/readerView'

// Video embed (YouTube / Vimeo).
//
// STORAGE is deliberately iframe-free: the node serializes to an empty
// `<div class="carma-embed" data-carma-embed data-provider data-embed-id data-url>`
// placeholder. The public render (theme.ts `fillEmbeds`) turns that into a
// sandboxed iframe, building the src from the VALIDATED id — never from raw user
// input. This keeps stored HTML iframe-free (so the sanitizer can't strip it and
// no arbitrary iframe is ever persisted) and puts the third-party-embed security
// decision on the render side. In the editor a React node view shows the real
// (privacy-mode) iframe so it's WYSIWYG.

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      setEmbed: (attrs: { provider: string; embedId: string; url?: string | null }) => ReturnType
    }
  }
}

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-provider'),
        renderHTML: (a) => (a.provider ? { 'data-provider': a.provider } : {}),
      },
      embedId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-embed-id'),
        renderHTML: (a) => (a.embedId ? { 'data-embed-id': a.embedId } : {}),
      },
      url: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-url'),
        renderHTML: (a) => (a.url ? { 'data-url': a.url } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-carma-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-carma-embed': '', class: 'carma-embed' })]
  },

  addNodeView() {
    // The render's own iframe, plus a click shield (data-carma-ui, invisible to the
    // reader and to the fidelity gate): a click selects the block instead of
    // starting the video inside the writer's page.
    return readerNodeView({
      fill: (dom, node) => {
        dom.innerHTML = embedInnerHtml(String(node.attrs.provider ?? ''), String(node.attrs.embedId ?? ''))
          + '<div data-carma-ui class="carma-embed-shield" aria-hidden="true"></div>'
      },
    })
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { provider: attrs.provider, embedId: attrs.embedId, url: attrs.url ?? null },
          }),
    }
  },

  // Paste a bare YouTube/Vimeo URL on its own → it becomes a video embed.
  addPasteRules() {
    return [
      nodePasteRule({
        find: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})\S*/g,
        type: this.type,
        getAttributes: (match) => ({ provider: 'youtube', embedId: match[1], url: match[0] }),
      }),
      nodePasteRule({
        find: /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)\S*/g,
        type: this.type,
        getAttributes: (match) => ({ provider: 'vimeo', embedId: match[1], url: match[0] }),
      }),
    ]
  },
})

