'use client'

// The canvas lab's client: the real TipTap editor on the real canvas, plus the
// hooks the gates read (`window.__lab`). Lazy like the post editor's, so the lab
// route measures what the product route will.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import CanvasFrame from '@/components/editor/canvas/CanvasFrame'
import { ToastProvider } from '@/components/ui/Toast'
import type { CanvasSpec } from '@/lib/render/canvas'

const TipTapEditor = lazy(() => import('@/components/editor/TipTapEditor'))

type LabHooks = { ready: boolean; editor: Editor | null; shortcuts: string[] }
declare global { interface Window { __lab?: LabHooks } }

export default function LabCanvas({ spec, html, classic = false }: { spec: CanvasSpec; html: string; classic?: boolean }) {
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop')
  const hooks = useRef<LabHooks>({ ready: false, editor: null, shortcuts: [] })

  useEffect(() => {
    window.__lab = hooks.current
    // The parent's shortcut listener, as the post editor has one: proves that a
    // modifier key pressed INSIDE the canvas reaches the page around it.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) hooks.current.shortcuts.push(`${e.ctrlKey ? 'ctrl+' : ''}${e.metaKey ? 'meta+' : ''}${e.key.toLowerCase()}`)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onEditorReady = useCallback((e: Editor | null) => {
    hooks.current.editor = e
    hooks.current.ready = !!e
  }, [])

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
          <span className="text-muted">Canvas lab</span>
          {(['desktop', 'phone'] as const).map(w => (
            <button key={w} type="button" data-lab-width={w} onClick={() => setWidth(w)}
              className={w === width ? 'rounded-md bg-accent px-2 py-1 text-on-accent' : 'rounded-md px-2 py-1 text-muted hover:bg-surface-hover'}>
              {w}
            </button>
          ))}
        </div>
        {classic ? (
          <div className="mx-auto max-w-3xl pl-10">
            <Suspense fallback={null}>
              <TipTapEditor siteId="lab" initialHtml={html} onChange={() => {}} onEditorReady={onEditorReady} />
            </Suspense>
          </div>
        ) : (
          <CanvasFrame spec={spec} width={width} title="Canvas lab">
            {m => (
              <Suspense fallback={null}>
                <TipTapEditor canvas={m} siteId="lab" initialHtml={html} onChange={() => {}} onEditorReady={onEditorReady} />
              </Suspense>
            )}
          </CanvasFrame>
        )}
      </div>
    </ToastProvider>
  )
}
