'use client'

// W7.3 — a block's controls, OUTSIDE the block.
//
// The blocks on the canvas are the published markup (canvas/readerView.ts), so
// nothing a writer clicks may live inside them. This one panel, in the canvas's
// UI layer (#carma-ui, through CanvasOverlay), follows the selection: select a
// CTA — or put the caret in its label — and its URL and alignment appear under
// it; select a gallery and its images can be added, uploaded and removed. It is
// app UI, dressed in the app's classes (the scoped copy in uiStyles.ts).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { AlignCenter, AlignLeft, AlignRight, Link2, Plus, Upload, X } from 'lucide-react'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { uploadImages } from '@/lib/upload'
import { cn } from '@/lib/cn'
import type { Align } from '../extensions/CtaButton'

// A control's mousedown must not move the selection: the node would deselect and
// the panel would unmount under the click (found by the W7.0 spike).
const keepSelection = (e: { preventDefault: () => void }) => e.preventDefault()

type Target = { pos: number; node: PMNode; top: number; left: number; width: number }

/** The block the panel is for: a selected CTA or gallery, or a caret inside a CTA. */
function findTarget(editor: Editor): { pos: number; node: PMNode } | null {
  const { selection } = editor.state
  if (selection instanceof NodeSelection && (selection.node.type.name === 'ctaButton' || selection.node.type.name === 'gallery')) {
    return { pos: selection.from, node: selection.node }
  }
  const $from = selection.$from
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'ctaButton') return { pos: $from.before(d), node: $from.node(d) }
  }
  return null
}

export default function BlockControls({ editor, siteId }: { editor: Editor; siteId: string }) {
  const [target, setTarget] = useState<Target | null>(null)

  useEffect(() => {
    const view = editor.view
    const measure = () => {
      const t = findTarget(editor)
      const el = t ? (view.nodeDOM(t.pos) as HTMLElement | null) : null
      if (!t || !el) { setTarget(null); return }
      const root = (view.dom as HTMLElement).getBoundingClientRect()
      const r = el.getBoundingClientRect()
      setTarget({ ...t, top: r.bottom - root.top + 8, left: r.left - root.left, width: r.width })
    }
    editor.on('selectionUpdate', measure)
    editor.on('update', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(view.dom as HTMLElement)
    measure()
    return () => { editor.off('selectionUpdate', measure); editor.off('update', measure); ro.disconnect() }
  }, [editor])

  const setAttrs = useCallback((attrs: Record<string, unknown>) => {
    const t = findTarget(editor)
    if (!t) return
    const tr = editor.state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, ...attrs })
    // A leaf (the gallery) is REPLACED by setNodeMarkup, and a node selection maps
    // past it — the panel would close after the first image. Keep the block selected.
    if (editor.state.selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, t.pos))
    editor.view.dispatch(tr)
  }, [editor])

  if (!target) return null
  return (
    <div
      data-carma-block-controls={target.node.type.name}
      className="pointer-events-auto absolute z-20 flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-elevated p-1.5 shadow-pop"
      style={{ top: target.top, left: target.left, width: target.node.type.name === 'gallery' ? target.width : undefined }}
    >
      {target.node.type.name === 'ctaButton'
        ? <CtaControls node={target.node} setAttrs={setAttrs} />
        : <GalleryControls node={target.node} setAttrs={setAttrs} siteId={siteId} />}
    </div>
  )
}

function CtaControls({ node, setAttrs }: { node: PMNode; setAttrs: (a: Record<string, unknown>) => void }) {
  const align: Align = node.attrs.align ?? 'left'
  return (
    <>
      <label className="flex min-w-[14rem] flex-1 items-center gap-1.5 rounded-lg border border-border px-2 py-1">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <input
          type="url"
          value={node.attrs.href === '#' ? '' : node.attrs.href}
          onChange={e => setAttrs({ href: e.target.value || '#' })}
          placeholder="https://… (destí del botó)"
          aria-label="Destí del botó"
          className="min-w-0 flex-1 bg-transparent text-xs text-text outline-none placeholder:text-subtle"
        />
      </label>
      <div className="flex gap-1" role="group" aria-label="Alineació">
        {([['left', AlignLeft, 'Esquerra'], ['center', AlignCenter, 'Centre'], ['right', AlignRight, 'Dreta']] as const).map(([a, Icon, label]) => (
          <button
            key={a}
            type="button"
            onMouseDown={keepSelection}
            onClick={() => setAttrs({ align: a })}
            aria-pressed={align === a}
            title={label}
            data-align={a}
            className={cn(
              'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors',
              align === a ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:bg-surface-hover hover:text-text',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </>
  )
}

function GalleryControls({ node, setAttrs, siteId }: { node: PMNode; setAttrs: (a: Record<string, unknown>) => void; siteId: string }) {
  const images: string[] = Array.isArray(node.attrs.images) ? node.attrs.images : []
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addUrl = () => {
    const t = url.trim()
    if (!t) return
    setAttrs({ images: [...images, t] })
    setUrl('')
  }
  // Upload to storage (clean URLs), never base64 — matches the rest of the editor.
  const addFiles = async (files: FileList | null) => {
    const list = files ? Array.from(files).filter(f => f.type.startsWith('image/')) : []
    if (!list.length || !siteId) return
    setUploading(true)
    try {
      const urls = await uploadImages(list, siteId)
      if (urls.length) setAttrs({ images: [...images, ...urls] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {images.length > 0 && (
        <div className="flex max-w-full gap-1.5 overflow-x-auto p-0.5">
          {images.map((src, i) => (
            <div key={`${src}-${i}`} className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-surface-hover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onMouseDown={keepSelection}
                onClick={() => setAttrs({ images: images.filter((_, j) => j !== i) })}
                title="Treure imatge"
                aria-label={`Treure la imatge ${i + 1}`}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex min-w-[16rem] flex-1 items-center gap-1.5">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
          placeholder="Enganxa la URL d’una imatge i prem Enter…"
          aria-label="URL d’una imatge"
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs text-text outline-none placeholder:text-subtle focus:border-accent"
        />
        <button type="button" onMouseDown={keepSelection} onClick={addUrl} title="Afegir per URL"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-accent text-on-accent hover:bg-accent-hover">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" onMouseDown={keepSelection} onClick={() => fileRef.current?.click()} disabled={uploading} title="Pujar imatges"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-text disabled:opacity-60">
          {uploading ? <KnotSpinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = '' }} />
      </div>
    </>
  )
}
