'use client'

// Progressive capture modal — the visual heart of the "Magic Wand".
//
// Opens on "Capturar tema" and streams the live state of the SSE pipeline
// (see ThemeStudioContext.grab): a vertical stepper that moves each step
// pending → running → done/skipped, a determinate progress bar that never
// stalls (the backend heartbeats during the long LLM step), plus graceful
// success / error / cancel states.

import { Wand2, Loader2, Check, Minus, AlertCircle, X, RefreshCw, Info } from 'lucide-react'
import { CAPTURE_STEPS, type CaptureStepStatus } from '@/lib/render/captureProgress'
import { Modal } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useThemeStudio, type CaptureNotice } from './ThemeStudioContext'

export default function ThemeCaptureModal() {
  const { capture, url, grab, closeCapture, cancelCapture } = useThemeStudio()
  const { open, phase, pct, steps, stepDetail, notices } = capture

  const handleClose = () => {
    if (phase === 'running') cancelCapture()
    else closeCapture()
  }

  let host = url
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep raw */ }

  const headerIconClasses =
    phase === 'error'   ? 'bg-danger-soft text-danger'
    : phase === 'success' ? 'bg-success-soft text-success'
    : 'bg-accent-soft text-accent'

  const HeaderIcon =
    phase === 'success' ? Check
    : phase === 'error' ? AlertCircle
    : Wand2

  return (
    <Modal open={open} onClose={handleClose} size="md" closeOnBackdrop={false} labelledBy="capture-title">
      <div className="overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="relative border-b border-border px-6 pt-6 pb-5 bg-bg-elevated">
          <div className="flex items-start gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${headerIconClasses}`}>
              <HeaderIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="capture-title" className="text-base font-semibold text-text">
                {phase === 'success' ? 'Tema capturat!' : phase === 'error' ? 'No s’ha pogut capturar' : 'Capturant el tema'}
              </h2>
              <p className="text-xs text-muted mt-0.5 truncate">
                {phase === 'success'
                  ? 'El header i el footer ja són components natius i aïllats.'
                  : phase === 'error'
                    ? (capture.error ?? 'Hi ha hagut un error durant la captura.')
                    : host || 'Reconstruint la identitat visual amb IA…'}
              </p>
            </div>
            {phase !== 'running' && (
              <button
                onClick={handleClose}
                aria-label="Tancar"
                className="cursor-pointer p-2 -mr-2 -mt-1 text-subtle hover:text-text hover:bg-surface-hover rounded-md transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="h-1.5 w-full rounded-full bg-surface-subtle overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  phase === 'error' ? 'bg-danger' : 'bg-accent'
                }`}
                style={{ width: `${Math.max(2, Math.round(pct))}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                {phase === 'success' ? 'Complet' : phase === 'error' ? 'Aturat' : 'En procés'}
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted">{Math.round(pct)}%</span>
            </div>
          </div>
        </div>

        {/* Notices */}
        {notices.length > 0 && (
          <div className="px-6 pt-5 space-y-2">
            {notices.map((n, i) => <NoticeBanner key={i} notice={n} />)}
          </div>
        )}

        {/* Steps */}
        <div className="px-6 py-5 space-y-1">
          {CAPTURE_STEPS.map(step => (
            <StepRow
              key={step.id}
              status={steps[step.id]}
              label={step.label}
              detail={stepDetail[step.id] ?? step.hint}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-6 pt-1">
          {phase === 'running' && (
            <Button variant="ghost" fullWidth onClick={cancelCapture}>Cancel·lar</Button>
          )}
          {phase === 'error' && (
            <div className="flex gap-2">
              <Button variant="ghost" fullWidth onClick={closeCapture}>Tancar</Button>
              <Button fullWidth onClick={() => void grab()} iconLeft={<RefreshCw className="w-4 h-4" />}>
                Tornar a provar
              </Button>
            </div>
          )}
          {phase === 'success' && (
            <Button fullWidth onClick={closeCapture} iconLeft={<Check className="w-4 h-4" />}>
              Editar el tema
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function StepRow({ status, label, detail }: { status: CaptureStepStatus; label: string; detail: string }) {
  const active = status === 'running'
  return (
    <div className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${active ? 'bg-accent-soft' : ''}`}>
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-tight transition-colors ${
          status === 'pending' ? 'text-subtle'
            : status === 'error' ? 'text-danger'
            : active ? 'text-accent'
            : 'text-text'
        }`}>
          {label}
        </p>
        {status !== 'pending' && (
          <p className={`text-xs mt-0.5 leading-snug truncate ${status === 'error' ? 'text-danger' : 'text-muted'}`}>
            {detail}
          </p>
        )}
      </div>
    </div>
  )
}

function NoticeBanner({ notice }: { notice: CaptureNotice }) {
  const isWarning = notice.severity === 'warning'
  const tone = isWarning ? 'bg-warning-soft text-warning border-warning/20' : 'bg-info-soft text-info border-info/20'
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${tone}`}>
      {isWarning
        ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        : <Info className="w-4 h-4 mt-0.5 shrink-0" />}
      <p className="text-xs font-semibold leading-snug">{notice.message}</p>
    </div>
  )
}

function StatusIcon({ status }: { status: CaptureStepStatus }) {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors'
  switch (status) {
    case 'running':
      return <span className={`${base} bg-accent text-on-accent`}><Loader2 className="w-3.5 h-3.5 animate-spin" /></span>
    case 'done':
      return <span className={`${base} bg-success text-white`}><Check className="w-3.5 h-3.5" /></span>
    case 'skipped':
      return <span className={`${base} bg-warning-soft text-warning`}><Minus className="w-3.5 h-3.5" /></span>
    case 'error':
      return <span className={`${base} bg-danger text-white`}><X className="w-3.5 h-3.5" /></span>
    default:
      return <span className={`${base} bg-surface-subtle text-subtle border border-border`}><span className="w-1.5 h-1.5 rounded-full bg-current" /></span>
  }
}
