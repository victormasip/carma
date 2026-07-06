'use client'

// Carma Studio — the header/footer ("chrome") editor, as a right-side drawer.
//
// Editing cloned chrome used to mean staring at raw HTML. This leads with the
// VISUAL menu editor (add / rename / reorder / re-point links, which is what most
// people actually want to change) and tucks the raw HTML + captured <head> behind
// an "advanced code" toggle. All fields bind to the live ThemeStudio (autosaved).

import { useEffect, useState } from 'react'
import { PanelsTopLeft, X, Code2, ChevronDown, MousePointerClick } from 'lucide-react'
import { useThemeStudio } from '../ThemeStudioContext'
import VisualChromeEditor from '../VisualChromeEditor'
import NavEditor from '../NavEditor'
import { cn } from '@/lib/cn'

export default function ChromeDrawer({ onClose }: { onClose: () => void }) {
  const s = useThemeStudio()
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Tancar" onClick={onClose} className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]" />
      <aside className="animate-[slidein_.18s_ease-out] relative flex h-full w-full max-w-[560px] flex-col border-l border-border bg-bg-elevated shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent"><PanelsTopLeft className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-bold text-text">Capçalera i peu</h3>
              <p className="text-xs text-muted">Edita el menú visualment · el codi és opcional</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tancar" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/* Visual-first: menu links */}
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-2.5 text-xs text-muted">
            <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span>Afegeix, reanomena, reordena o reapunta els enllaços del menú. L&apos;estil clonat del teu lloc es manté intacte.</span>
          </div>
          <NavEditor
            header={s.extractedHeader}
            footer={s.extractedFooter}
            onHeaderChange={s.setExtractedHeader}
            onFooterChange={s.setExtractedFooter}
          />

          {/* Advanced: raw HTML / head — collapsed by default */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs font-bold text-muted transition-colors hover:text-text"
            >
              <Code2 className="h-4 w-4 text-subtle" />
              Codi HTML avançat (header, footer, &lt;head&gt;)
              <ChevronDown className={cn('ml-auto h-4 w-4 text-subtle transition-transform', showCode && 'rotate-180')} />
            </button>
            {showCode && (
              <div className="mt-3">
                <VisualChromeEditor
                  header={s.extractedHeader}
                  footer={s.extractedFooter}
                  head={s.extractedHead}
                  onHeaderChange={s.setExtractedHeader}
                  onFooterChange={s.setExtractedFooter}
                  onHeadChange={s.setExtractedHead}
                />
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
