import { Node, mergeAttributes } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useRef, useState } from 'react'
import { Plus, X, ImageIcon, ChevronLeft, ChevronRight, Upload, Maximize2 } from 'lucide-react'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    gallery: {
      setGallery: (attrs?: { images?: string[] }) => ReturnType
    }
  }
}

// Stable-ish id base for a gallery's CSS slides + `:target` lightboxes.
function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

function readFilesAsDataUrls(files: FileList | File[]): Promise<string[]> {
  const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'))
  return Promise.all(
    imgs.map(
      (f) =>
        new Promise<string>((resolve) => {
          const r = new FileReader()
          r.onload = () => resolve(typeof r.result === 'string' ? r.result : '')
          r.onerror = () => resolve('')
          r.readAsDataURL(f)
        }),
    ),
  ).then((arr) => arr.filter(Boolean))
}

/**
 * Image gallery — a horizontal carousel that is visually identical in the
 * editor and on the public blog (1:1). Side arrows page through the slides, and
 * clicking an image opens a lightbox. The public render is 100% JS-free:
 * scroll-snap track + per-slide anchor arrows (`#slide-id`) + a `:target`
 * lightbox with prev/next. The editor mirrors it with JS controls. Accepts both
 * image URLs and uploads (stored as data URLs).
 */
export const Gallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      images: {
        default: [] as string[],
        parseHTML: (el) =>
          Array.from(el.querySelectorAll('a.carma-gallery-item img'))
            .map((img) => img.getAttribute('src') ?? '')
            .filter(Boolean),
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.carma-gallery' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const images: string[] = Array.isArray(node.attrs.images) ? node.attrs.images : []
    const n = images.length
    const h = hashStr(images.join('|'))
    const sl = `cxsl-${h}`
    const lb = `cxlb-${h}`

    const slides: DOMOutputSpec[] = images.map((src, i) => {
      const prev = (i - 1 + n) % n
      const next = (i + 1) % n
      const children: DOMOutputSpec[] = [
        ['a', { class: 'carma-gallery-item', href: `#${lb}-${i}` }, ['img', { src, loading: 'lazy', alt: '' }]],
      ]
      if (n > 1) {
        children.push(['a', { class: 'carma-slide-arrow prev', href: `#${sl}-${prev}`, 'aria-label': 'Anterior' }, '‹'])
        children.push(['a', { class: 'carma-slide-arrow next', href: `#${sl}-${next}`, 'aria-label': 'Següent' }, '›'])
      }
      return ['div', { class: 'carma-slide', id: `${sl}-${i}` }, ...children]
    })

    const boxes: DOMOutputSpec[] = images.map((src, i) => {
      const prev = (i - 1 + n) % n
      const next = (i + 1) % n
      const inner: DOMOutputSpec[] = [
        ['a', { class: 'carma-lightbox-backdrop', href: '#', 'aria-label': 'Tancar' }],
        ['img', { class: 'carma-lightbox-img', src, alt: '' }],
      ]
      if (n > 1) {
        inner.push(['a', { class: 'carma-lightbox-nav prev', href: `#${lb}-${prev}`, 'aria-hidden': 'true' }, '‹'])
        inner.push(['a', { class: 'carma-lightbox-nav next', href: `#${lb}-${next}`, 'aria-hidden': 'true' }, '›'])
      }
      inner.push(['a', { class: 'carma-lightbox-close', href: '#', 'aria-label': 'Tancar' }, '×'])
      return ['div', { class: 'carma-lightbox', id: `${lb}-${i}` }, ...inner]
    })

    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'carma-gallery', 'data-count': String(n) }),
      ['div', { class: 'carma-gallery-track' }, ...slides],
      ...boxes,
    ] as DOMOutputSpec
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryView)
  },

  addCommands() {
    return {
      setGallery:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { images: attrs?.images ?? [] } }),
    }
  },
})

function GalleryView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const images: string[] = Array.isArray(node.attrs.images) ? node.attrs.images : []
  const [url, setUrl] = useState('')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = editor.isEditable

  const addUrl = () => {
    const t = url.trim()
    if (!t) return
    updateAttributes({ images: [...images, t] })
    setUrl('')
  }
  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const datas = await readFilesAsDataUrls(files)
    if (datas.length) updateAttributes({ images: [...images, ...datas] })
  }
  const removeImage = (i: number) => updateAttributes({ images: images.filter((_, idx) => idx !== i) })
  const page = (dir: -1 | 1) => {
    const el = trackRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }
  const move = (dir: -1 | 1) => setLightbox((c) => (c === null ? c : (c + dir + images.length) % images.length))

  return (
    <NodeViewWrapper className={`carma-gallery-editor not-prose ${selected ? 'is-selected' : ''}`} data-drag-handle>
      {images.length > 0 ? (
        <div className="carma-carousel" contentEditable={false}>
          {images.length > 1 && (
            <button type="button" onClick={() => page(-1)} className="carma-carousel-arrow prev" title="Anterior">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div ref={trackRef} className="carma-carousel-track">
            {images.map((src, i) => (
              <div key={`${src}-${i}`} className="carma-carousel-slide" onClick={() => setLightbox(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" />
                <span className="carma-gallery-zoom"><Maximize2 className="w-3.5 h-3.5" /></span>
                {editable && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeImage(i) }}
                    className="carma-gallery-remove"
                    title="Treure imatge"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <button type="button" onClick={() => page(1)} className="carma-carousel-arrow next" title="Següent">
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      ) : (
        <div className="carma-gallery-empty">
          <ImageIcon className="w-5 h-5" />
          <span>Galeria buida — afegeix imatges per URL o puja-les</span>
        </div>
      )}

      {editable && (
        <div className="carma-gallery-add" contentEditable={false}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
            placeholder="Enganxa la URL d'una imatge i prem Enter…"
          />
          <button type="button" onClick={addUrl} title="Afegir per URL">
            <Plus className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} title="Pujar imatges" className="upload">
            <Upload className="w-4 h-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
        </div>
      )}

      {/* Editor lightbox preview */}
      {lightbox !== null && images[lightbox] && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          contentEditable={false}
          onClick={() => setLightbox(null)}
        >
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); move(-1) }}
              className="cursor-pointer absolute left-4 sm:left-8 w-11 h-11 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightbox]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[88vw] rounded-xl shadow-2xl object-contain"
          />
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); move(1) }}
              className="cursor-pointer absolute right-4 sm:right-8 w-11 h-11 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="cursor-pointer absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  )
}
