'use client'

// Carma Studio — the inline ARTICLE BODY editor.
//
// Editing the article body inside the render iframe is impossible (it lives in a
// Declarative Shadow DOM) and unsafe (round-tripping transformed HTML through
// contenteditable corrupts it). So body editing swaps the preview for a real TipTap
// (ProseMirror) canvas mounted in the parent tree: the stored HTML is parsed into a
// structured doc on load, edited safely, and serialized back to clean HTML on save —
// no contenteditable cruft, no lost markup. The surface is styled with the live brand
// tokens (font + colours + width) so the transition reads as the same article.

import { useEffect, useRef, useState } from 'react'
import { Check, X, PenLine } from 'lucide-react'
import TipTapEditor from '@/components/editor/TipTapEditor'
import Button from '@/components/ui/Button'
import KnotLoader from '@/components/ui/KnotLoader'
import { useThemeStudio } from '../ThemeStudioContext'
import type { Device } from './StudioCanvas'

export default function StudioBodyEditor({ device, onClose }: { device: Device; onClose: () => void }) {
  const { siteId, tokens, editableArticle, loadArticleBody, saveArticleBody } = useThemeStudio()
  const [initialHtml, setInitialHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Live HTML kept in a ref (TipTap fires onChange per keystroke; no re-render needed).
  const liveRef = useRef('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    void loadArticleBody().then((h) => {
      if (!alive) return
      liveRef.current = h
      setInitialHtml(h)
      setLoading(false)
    }).catch(() => { if (alive) { setInitialHtml(''); setLoading(false) } })
    return () => { alive = false }
  }, [loadArticleBody])

  const save = async () => {
    setError('')
    setSaving(true)
    const ok = await saveArticleBody(liveRef.current)
    setSaving(false)
    if (ok) onClose()
    else setError('No s’ha pogut desar. Torna-ho a provar.')
  }

  const frameWidth = device === 'mobile' ? 390 : device === 'tablet' ? 720 : 860

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
          <Button size="sm" glow onClick={save} loading={saving} iconLeft={<Check className="h-3.5 w-3.5" />}>
            Desa i tanca
          </Button>
        </div>
      </div>

      {/* Editing surface — styled with the live brand tokens so it reads as the article. */}
      <div className="min-h-0 flex-1 overflow-auto bg-surface-subtle py-8">
        {loading || initialHtml === null ? (
          <div className="flex h-full items-center justify-center"><KnotLoader size={56} label="Carregant el contingut…" /></div>
        ) : (
          <div
            className="mx-auto rounded-2xl border border-border px-7 py-9 shadow-card sm:px-10"
            style={{
              maxWidth: frameWidth,
              background: String(tokens.colorBg ?? '#ffffff'),
              color: String(tokens.colorText ?? '#111111'),
              fontFamily: String(tokens.fontBody ?? 'inherit'),
            }}
          >
            <TipTapEditor
              initialHtml={initialHtml}
              siteId={siteId}
              onChange={(h) => { liveRef.current = h }}
              placeholder="Escriu el contingut de l’article…"
            />
          </div>
        )}
      </div>
    </div>
  )
}
