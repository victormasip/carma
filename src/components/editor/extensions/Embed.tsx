import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

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

export type EmbedProvider = 'youtube' | 'vimeo'

// Extract the provider + id from a pasted/typed URL. Returns null when it's not a
// supported video URL, so callers can fall back (leave it as a link).
export function parseEmbedUrl(raw: string): { provider: EmbedProvider; id: string } | null {
  const url = raw.trim()
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (yt) return { provider: 'youtube', id: yt[1] }
  const vi = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vi) return { provider: 'vimeo', id: vi[1] }
  return null
}

// Build the iframe src from a validated provider + id. Returns null for anything
// unknown — the id is assumed already validated by the caller.
export function embedSrc(provider: string, id: string): string | null {
  if (provider === 'youtube' && /^[a-zA-Z0-9_-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`
  if (provider === 'vimeo' && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
  return null
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
    return ReactNodeViewRenderer(EmbedView)
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

function EmbedView({ node, selected }: NodeViewProps) {
  const provider = String(node.attrs.provider ?? '')
  const id = String(node.attrs.embedId ?? '')
  const src = embedSrc(provider, id)
  return (
    <NodeViewWrapper className={`carma-embed carma-embed-editor ${selected ? 'is-selected' : ''}`} data-provider={provider}>
      <div className="carma-embed-frame" contentEditable={false}>
        {src ? (
          <iframe
            src={src}
            title={`Vídeo ${provider}`}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="carma-embed-fallback">No s’ha pogut incrustar el vídeo</div>
        )}
      </div>
    </NodeViewWrapper>
  )
}
