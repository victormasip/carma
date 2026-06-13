'use client'

// The CLIENT-facing face of the Magic Wand — a calm, "Zen" capture.
//
// Where the operator/superadmin sees the full technical pipeline (ThemeCaptureModal:
// a 6-step stepper, per-step detail, raw counts, notices), the client sees ONE
// breathing card: a single progress ring, one evolving line of friendly copy, and
// satisfying cross-fades between states. No logs, no jargon, no overwhelm.
//
// It reads the very same live `capture` state from ThemeStudioContext, so there is
// zero behavioural divergence — only the presentation is softened.

import { useMemo } from 'react'
import { Wand2, Check, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react'
import type { CaptureStepId } from '@/lib/render/captureProgress'
import { Modal } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useThemeStudio } from './ThemeStudioContext'

// Soft, human one-liners — one per pipeline step. Deliberately NOT the technical
// labels ("Recollint estils i tipografies") nor the raw details ("18 fulls CSS").
const RUNNING_COPY: Record<CaptureStepId, string> = {
  fetch:       'Visitant el teu lloc',
  analyze:     'Entenent com és',
  regions:     'Trobant la capçalera i el peu',
  styles:      'Recollint colors i tipografies',
  reconstruct: 'Vestint el teu blog',
  finalize:    'Donant els últims retocs',
}

export default function ZenCaptureModal() {
  const { capture, url, grab, closeCapture, cancelCapture } = useThemeStudio()
  const { open, phase, pct, activeStep } = capture

  const host = useMemo(() => {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
  }, [url])

  // Headline + subline by state. While running we follow the active step; the
  // headline is keyed so each new message gently fades up (zen-fade-up).
  const headline =
    phase === 'success' ? 'Tot a punt'
    : phase === 'error' ? 'No ha anat bé'
    : RUNNING_COPY[activeStep ?? 'fetch']

  const subline =
    phase === 'success' ? 'El teu blog ja llueix com el teu lloc.'
    : phase === 'error' ? (capture.error ?? 'Torna-ho a provar d’aquí a un moment.')
    : host ? `des de ${host}` : 'Hi treballem ara mateix…'

  const statusKey = `${phase}:${activeStep ?? 'fetch'}`

  return (
    <Modal open={open} onClose={phase === 'running' ? cancelCapture : closeCapture} size="md" closeOnBackdrop={false} labelledBy="zen-capture-title">
      <div className="flex flex-col items-center px-8 py-10 text-center sm:px-12 sm:py-12">
        <ProgressRing pct={pct} phase={phase} />

        {/* One evolving line — cross-fades on every state change. aria-live keeps
            screen readers gently informed without a wall of steps. */}
        <div className="mt-8 min-h-[3.75rem]" role="status" aria-live="polite">
          <h2 key={statusKey} id="zen-capture-title" className="zen-fade-up text-xl font-bold tracking-tight text-text">
            {headline}
          </h2>
          <p key={`${statusKey}-sub`} className="zen-fade-up mt-1.5 text-sm text-muted">
            {subline}
          </p>
        </div>

        {/* A single quiet action, matched to the state. */}
        <div className="mt-8 w-full max-w-[15rem]">
          {phase === 'running' && (
            <button
              onClick={cancelCapture}
              className="cursor-pointer mx-auto block rounded-lg px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-hover hover:text-muted"
            >
              Cancel·lar
            </button>
          )}
          {phase === 'success' && (
            <Button fullWidth onClick={closeCapture} iconRight={<ArrowRight className="h-4 w-4" />}>
              Comencem
            </Button>
          )}
          {phase === 'error' && (
            <div className="flex flex-col gap-2">
              <Button fullWidth onClick={() => void grab()} iconLeft={<RefreshCw className="h-4 w-4" />}>
                Tornar a provar
              </Button>
              <Button variant="ghost" fullWidth onClick={closeCapture}>Ho deixo per després</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// The one indicator: a single gold ring that fills as the capture advances, with
// a soft breathing halo behind a state icon. Calm, never frantic.
function ProgressRing({ pct, phase }: { pct: number; phase: 'idle' | 'running' | 'success' | 'error' }) {
  const R = 54
  const C = 2 * Math.PI * R
  const value = phase === 'success' ? 100 : Math.max(0, Math.min(100, pct))
  const offset = C * (1 - value / 100)
  const isError = phase === 'error'

  return (
    <div className="relative h-36 w-36">
      {/* Breathing halo — alive while working, steady on success. */}
      <span
        className={`absolute inset-4 rounded-full blur-2xl ${isError ? 'bg-danger/25' : 'bg-accent/30'} ${phase === 'running' ? 'zen-breathe' : ''}`}
        aria-hidden
      />

      <svg viewBox="0 0 128 128" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="zen-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d9a400" />
            <stop offset="50%" stopColor="#f5bc00" />
            <stop offset="100%" stopColor="#ffe27a" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="8" className="stroke-surface-hover" />
        {/* Progress arc */}
        <circle
          cx="64" cy="64" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={isError ? 'var(--color-danger)' : 'url(#zen-ring)'}
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>

      {/* Center state icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        {phase === 'success' ? (
          <span className="zen-pop flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_8px_24px_-6px_rgba(245,188,0,0.6)]">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
        ) : isError ? (
          <span className="zen-pop flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertCircle className="h-7 w-7" />
          </span>
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Wand2 className="h-6 w-6" />
          </span>
        )}
      </div>
    </div>
  )
}
