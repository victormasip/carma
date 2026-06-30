'use client'

// The Lab's live preview. Each frame asks /api/admin/grabber-lab/preview for a
// full HTML document (the REAL render pipeline + 10 dummy articles for the
// assembled modes, or the operator's pasted "perfect" HTML for the document
// mode) and shows it via a same-origin blob URL — so the captured site's own
// linked CSS, proxied fonts (/api/asset) and image transforms (/api/img) all
// resolve exactly like the public /render page does.

import { useEffect, useRef, useState } from 'react'
import { Monitor, Tablet, Smartphone, ExternalLink, TriangleAlert, Maximize2, Minimize2 } from 'lucide-react'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { cn } from '@/lib/cn'
import type { LabPreviewRequest, LabPreviewTheme } from '@/lib/grabber-lab/types'

type Device = 'full' | 'tablet' | 'mobile'
const DEVICE_W: Record<Device, number | null> = { full: null, tablet: 834, mobile: 390 }

type View = 'system' | 'truth' | 'document' | 'compare'

export default function LabPreview({
  system, truth, perfectHtml, siteName, locale, hasCapture,
}: {
  system: LabPreviewTheme | null
  truth: LabPreviewTheme | null
  perfectHtml: string
  siteName: string
  locale: string | null
  hasCapture: boolean
}) {
  const [view, setView] = useState<View>('system')
  const [compareRight, setCompareRight] = useState<'document' | 'truth'>('document')
  const [device, setDevice] = useState<Device>('full')
  // Fullscreen mode — the squished sticky column is fine for a glance, but real
  // CSS-collision checking needs the true desktop width. This overlays the whole
  // preview (with all its view/device/compare controls) on the full viewport.
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [fullscreen])

  const reqFor = (which: 'system' | 'truth' | 'document'): LabPreviewRequest | null => {
    if (which === 'document') return perfectHtml.trim() ? { mode: 'document', html: perfectHtml } : null
    const theme = which === 'truth' ? truth : system
    if (!theme) return null
    return { mode: 'assembled', siteName, locale, theme }
  }

  const tabs: { id: View; label: string; disabled?: boolean }[] = [
    { id: 'system', label: 'Sistema', disabled: !hasCapture },
    { id: 'truth', label: 'Ground truth', disabled: !hasCapture },
    { id: 'document', label: 'Document HTML', disabled: !perfectHtml.trim() },
    { id: 'compare', label: 'Comparar', disabled: !hasCapture },
  ]

  const isCompare = view === 'compare'
  const leftReq = reqFor(isCompare ? 'system' : view === 'document' ? 'document' : view)
  const rightReq = isCompare ? reqFor(compareRight) : null

  return (
    <div className={cn(
      'flex flex-col min-h-0',
      fullscreen ? 'fixed inset-0 z-[80] h-screen bg-bg p-3 sm:p-5' : 'h-full',
    )}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented
          value={view}
          onChange={v => setView(v as View)}
          options={tabs}
        />
        {isCompare && (
          <Segmented
            value={compareRight}
            onChange={v => setCompareRight(v as 'document' | 'truth')}
            options={[
              { id: 'document', label: 'vs Document', disabled: !perfectHtml.trim() },
              { id: 'truth', label: 'vs Ground truth', disabled: !truth },
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Prominent fullscreen toggle — opens the real desktop-width render. */}
          <button
            type="button"
            onClick={() => setFullscreen(f => !f)}
            className={cn(
              'cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-colors',
              fullscreen
                ? 'bg-surface-subtle text-text border border-border hover:bg-surface-hover'
                : 'bg-accent text-on-accent shadow-card hover:brightness-[1.04]',
            )}
            title={fullscreen ? 'Sortir de pantalla completa (Esc)' : 'Previsualització a pantalla completa'}
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{fullscreen ? 'Sortir' : 'Pantalla completa'}</span>
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <DeviceBtn icon={<Monitor className="w-4 h-4" />} active={device === 'full'} onClick={() => setDevice('full')} label="Escriptori" />
            <DeviceBtn icon={<Tablet className="w-4 h-4" />} active={device === 'tablet'} onClick={() => setDevice('tablet')} label="Tauleta" />
            <DeviceBtn icon={<Smartphone className="w-4 h-4" />} active={device === 'mobile'} onClick={() => setDevice('mobile')} label="Mòbil" />
          </div>
        </div>
      </div>

      {/* Frames */}
      <div className={cn('flex-1 min-h-0 grid gap-3', isCompare ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}>
        <PreviewFrame
          request={leftReq}
          device={device}
          label={isCompare ? 'Sistema' : tabs.find(t => t.id === view)?.label ?? ''}
          emptyHint={hasCapture ? 'Res a mostrar en aquesta vista.' : 'Executa el grabber per veure el render del sistema.'}
        />
        {isCompare && (
          <PreviewFrame
            request={rightReq}
            device={device}
            label={compareRight === 'document' ? 'Document HTML' : 'Ground truth'}
            emptyHint={compareRight === 'document' ? 'Enganxa el teu HTML «perfecte».' : 'Omple els overrides de ground truth.'}
          />
        )}
      </div>
    </div>
  )
}

function PreviewFrame({
  request, device, label, emptyHint,
}: {
  request: LabPreviewRequest | null
  device: Device
  label: string
  emptyHint: string
}) {
  // State is keyed by the serialized request, and loading/url/error are DERIVED
  // during render. This keeps the effect's only setState calls inside async
  // callbacks (never synchronously in the effect body) — the render shows
  // "loading" automatically whenever no settled result matches the current key.
  const [result, setResult] = useState<{ key: string; url: string } | null>(null)
  const [errored, setErrored] = useState<{ key: string; msg: string } | null>(null)
  const lastUrlRef = useRef<string | null>(null)
  const key = request ? JSON.stringify(request) : ''

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetch('/api/admin/grabber-lab/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: key,
    })
      .then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => null) as { error?: string } | null
          throw new Error(j?.error ?? `Error ${res.status}`)
        }
        return res.text()
      })
      .then(html => {
        if (cancelled) return
        const next = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = next
        setResult({ key, url: next })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setErrored({ key, msg: e instanceof Error ? e.message : 'Error de previsualització' })
      })
    return () => { cancelled = true }
  }, [key])

  useEffect(() => () => { if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current) }, [])

  const url = result?.key === key ? result.url : null
  const error = errored?.key === key ? errored.msg : null
  const loading = !!key && !url && !error
  const width = DEVICE_W[device]

  return (
    <div className="relative flex flex-col min-h-0 rounded-xl border border-border bg-[#0b0d10] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 h-9 border-b border-border bg-bg-elevated/60 shrink-0">
        <span className="text-xs font-semibold text-muted truncate">{label}</span>
        <div className="flex items-center gap-2">
          {loading && <KnotSpinner className="w-3.5 h-3.5 text-subtle" />}
          {url && (
            <button
              type="button"
              onClick={() => window.open(url, '_blank')}
              className="cursor-pointer inline-flex items-center gap-1 text-xs text-subtle hover:text-text transition-colors"
              title="Obrir en una pestanya nova"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto flex justify-center bg-[#0b0d10] p-0">
        {!request && (
          <div className="flex items-center justify-center text-sm text-subtle text-center px-6 py-20">{emptyHint}</div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center gap-2 text-center px-6 py-20 text-danger">
            <TriangleAlert className="w-6 h-6" />
            <p className="text-sm font-medium max-w-sm break-words">{error}</p>
          </div>
        )}
        {request && !error && url && (
          <iframe
            key={device}
            src={url}
            title={label}
            className="w-full h-full bg-white border-0 self-stretch"
            style={width ? { maxWidth: width } : undefined}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
          />
        )}
      </div>
    </div>
  )
}

function Segmented({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string; disabled?: boolean }[]
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border p-0.5 bg-bg-elevated/40">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            'cursor-pointer px-2.5 h-7 text-xs font-semibold rounded-md transition-colors whitespace-nowrap',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            value === o.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DeviceBtn({ icon, active, onClick, label }: { icon: React.ReactNode; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'cursor-pointer flex items-center justify-center w-7 h-7 rounded-md transition-colors',
        active ? 'bg-accent text-on-accent' : 'text-subtle hover:text-text',
      )}
    >
      {icon}
    </button>
  )
}
