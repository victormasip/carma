'use client'

// Carma Studio — the inline ARTICLE BODY editor, ON the canvas (W7.4).
//
// Editing the article body inside the render iframe is impossible (it lives in a
// Declarative Shadow DOM) and unsafe (round-tripping transformed HTML through
// contenteditable corrupts it). So body editing swaps the preview for the writing
// canvas: the same iframe, stylesheet and TipTap as the post editor
// (components/editor/canvas), built from the article page the reader gets —
// dressed in the Studio's LIVE, unsaved tokens and faces. It used to be a card
// painted with three of those tokens (a face, a ground, a colour) over the app's
// imitation of the blog's prose; that card and that CSS are gone. The stored HTML
// is parsed into a structured doc on load and serialized back to clean HTML on save.

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Check, X, PenLine } from 'lucide-react'
import Button from '@/components/ui/Button'
import KnotLoader from '@/components/ui/KnotLoader'
import CanvasFrame from '@/components/editor/canvas/CanvasFrame'
import { getStudioBodyCanvas } from '@/lib/actions/posts'
import type { CanvasSpec } from '@/lib/render/canvas'
import { useThemeStudio } from '../ThemeStudioContext'
import type { Device } from './types'

// Already split from the route by StudioStage's lazy import of this file.
const TipTapEditor = lazy(() => import('@/components/editor/TipTapEditor'))

const WIDTH = { desktop: 'desktop', tablet: 'tablet', mobile: 'phone' } as const

type Loaded = { html: string; spec: CanvasSpec } | 'missing' | null

export default function StudioBodyEditor({ device, onClose }: { device: Device; onClose: () => void }) {
  const { siteId, tokens, fontLinks, editableArticle, saveArticleBody } = useThemeStudio()
  // Mounted fresh per editing session (the parent renders it conditionally), and
  // the Studio's controls sit behind this overlay while it is open — so the live
  // tokens are read ONCE, when the session starts.
  const [loaded, setLoaded] = useState<Loaded>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Live HTML kept in a ref (TipTap fires onChange per keystroke; no re-render needed).
  const liveRef = useRef('')
  const start = useRef({ tokens, fontLinks })

  useEffect(() => {
    let alive = true
    if (!editableArticle) return
    void getStudioBodyCanvas(siteId, editableArticle.id, start.current).then((r) => {
      if (!alive) return
      if (r) liveRef.current = r.html
      setLoaded(r ?? 'missing')
    })
    return () => { alive = false }
  }, [siteId, editableArticle])

  const save = async () => {
    setError('')
    setSaving(true)
    const ok = await saveArticleBody(liveRef.current)
    setSaving(false)
    if (ok) onClose()
    else setError('No s’ha pogut desar. Torna-ho a provar.')
  }

  const state: Loaded | 'no-article' = editableArticle ? loaded : 'no-article'

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-bg-elevated px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <PenLine className="h-4 w-4 shrink-0 text-accent" />
          <span className="text-sm font-bold text-text">Editant el contingut</span>
          {editableArticle?.title && (
            <span className="hidden truncate text-xs text-muted sm:inline">· {editableArticle.title}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {error && <span className="mr-1 text-xs font-medium text-danger">{error}</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Cancel·la
          </button>
          <Button size="sm" glow onClick={save} loading={saving} disabled={typeof state !== 'object' || state === null} iconLeft={<Check className="h-3.5 w-3.5" />}>
            Desa i tanca
          </Button>
        </div>
      </div>

      {/* The page — the article as the reader gets it, in the design being edited. */}
      <div className="min-h-0 flex-1 overflow-auto bg-surface-subtle">
        {state === null ? (
          <div className="flex h-full items-center justify-center"><KnotLoader size={56} label="Carregant el contingut…" /></div>
        ) : typeof state === 'string' ? (
          <p className="mx-auto max-w-md px-6 py-16 text-center text-sm text-muted">
            {state === 'no-article'
              ? 'Aquest blog encara no té cap article: la vista d’article és una mostra. Escriu el primer article des del panell i el podràs editar aquí.'
              : 'No s’ha pogut carregar el contingut d’aquest article.'}
          </p>
        ) : (
          <div className={device === 'desktop' ? 'pb-10' : 'px-4 py-6'}>
            <CanvasFrame spec={state.spec} width={WIDTH[device]} title="Contingut de l’article">
              {(mounts) => (
                <Suspense fallback={null}>
                  <TipTapEditor
                    canvas={mounts}
                    initialHtml={state.html}
                    siteId={siteId}
                    onChange={(h) => { liveRef.current = h }}
                    placeholder="Escriu el contingut de l’article…"
                  />
                </Suspense>
              )}
            </CanvasFrame>
          </div>
        )}
      </div>
    </div>
  )
}
