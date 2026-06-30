'use client'

// Live preview pane for the Theme Studio — the "visual workspace" half.
//
// It renders the REAL public page (/render/{siteId}) in an isolated iframe, so
// what the user sees is exactly what visitors get (header + footer + blog, 1:1).
// Two refresh channels keep it instant WITHOUT any setState-in-effect:
//   · TOKEN tweaks (colours / fonts / sizes / layout) are pushed as query-param
//     overrides — the render route applies them with no save, so dragging a
//     colour updates the preview ~450ms later with no DB round-trip.
//   · STRUCTURAL edits (header/footer HTML, section title, captured <head>) ride
//     on the `savedAt` prop: it changes when the autosave persists, which changes
//     the iframe `src`, which reloads the frame. No effect, no impurity.

import { useEffect, useRef, useState } from 'react'
import { Monitor, Smartphone, RotateCw, ExternalLink, Loader2 } from 'lucide-react'
import KnotLoader from '@/components/ui/KnotLoader'
import { tokensToParams } from '@/lib/render/embedParams'
import type { DesignTokens } from '@/lib/scrape/tokens'
import { cn } from '@/lib/cn'

type Device = 'desktop' | 'mobile'

export default function ThemePreview({
  siteId, tokens, saving, savedAt, className,
}: {
  siteId: string
  tokens: DesignTokens
  saving: boolean
  savedAt: number
  className?: string
}) {
  const [device, setDevice] = useState<Device>('desktop')
  const [loading, setLoading] = useState(true)
  const [manualNonce, setManualNonce] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // Debounce token→param so dragging a colour picker doesn't thrash the frame.
  // The debounce effect only SCHEDULES work (the setState runs inside the timer
  // callback, not synchronously in the effect body), so it stays rules-compliant.
  const liveParams = tokensToParams(tokens)
  const [debouncedParams, setDebouncedParams] = useState(liveParams)
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedParams(liveParams); setLoading(true) }, 450)
    return () => clearTimeout(t)
  }, [liveParams])

  // Every input that should reload the frame is folded into the src, so the
  // browser reloads naturally when any of them change — no remount key, no effect.
  const qs = [debouncedParams, `preview=1`, `r=${savedAt}`, `m=${manualNonce}`]
    .filter(Boolean).join('&')
  const src = `/render/${siteId}?${qs}`

  const reload = () => { setLoading(true); setManualNonce(n => n + 1) }
  const openLive = () => window.open(`/render/${siteId}?v=${Date.now()}`, '_blank', 'noopener,noreferrer')

  return (
    <div className={cn('flex flex-col rounded-2xl border border-border bg-surface-subtle overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border bg-surface shrink-0">
        <span className="text-xs font-bold text-text mr-1">Vista prèvia</span>
        {saving && (
          <span className="flex items-center gap-1 text-xs font-semibold text-subtle">
            <Loader2 className="w-3 h-3 animate-spin" /> actualitzant
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 bg-surface-subtle border border-border rounded-lg p-0.5">
          {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              title={d === 'desktop' ? 'Escriptori' : 'Mòbil'}
              aria-pressed={device === d}
              className={cn(
                'cursor-pointer flex items-center justify-center w-7 h-7 rounded-md transition-colors',
                device === d ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={reload}
          title="Recarregar"
          className="cursor-pointer flex items-center justify-center w-7 h-7 rounded-md text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={openLive}
          title="Obrir en una pestanya nova"
          className="cursor-pointer flex items-center justify-center w-7 h-7 rounded-md text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-[460px] bg-surface-subtle flex justify-center">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-[1px] z-10 pointer-events-none">
            <KnotLoader size={52} />
          </div>
        )}
        <iframe
          ref={frameRef}
          src={src}
          title="Vista prèvia del lloc"
          onLoad={() => setLoading(false)}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className={cn(
            'h-full bg-white transition-[width] duration-300 ease-out',
            device === 'mobile' ? 'w-[390px] border-x border-border shadow-lg' : 'w-full',
          )}
        />
      </div>
    </div>
  )
}
