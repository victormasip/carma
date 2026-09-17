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

import { useEffect, useMemo, useRef } from 'react'
import { Wand2, Check, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react'
import type { CaptureStepId } from '@/lib/render/captureProgress'
import { Modal } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { captureChromeNote } from '@/lib/render/publishing'
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

/**
 * THE SAME PIPELINE, TOLD AS A CONTINUATION.
 *
 * Founder, 2026-09-17: "remove the weird jump to 'visiting your site' again
 * before the QR code. The flow must be seamless."
 *
 * The jump was narrative, not technical. Coming out of onboarding the owner has
 * just watched the Brand Brain read their website for a minute — and then this
 * modal opened and announced "Visitant el teu lloc", as though nothing had
 * happened. Two different passes, one website, and the product looked like it
 * had forgotten where it had just been.
 *
 * The visual capture genuinely is a second pass (the brand read takes prose; this
 * takes the header, the footer and the stylesheets), so it cannot be skipped. But
 * it can stop introducing itself. When `continued` is set, every line says
 * "carrying on" instead of "starting", and the success state advances on its own
 * rather than parking one more button between the owner and the QR.
 */
const CONTINUED_COPY: Record<CaptureStepId, string> = {
  fetch:       'Ara, el disseny',
  analyze:     'Mirant com està fet',
  regions:     'Agafant la teva capçalera i el teu peu',
  styles:      'Copiant colors i tipografies',
  reconstruct: 'Vestint el teu blog amb tot plegat',
  finalize:    'Donant els últims retocs',
}

/** How long the success state is allowed to be admired before the flow moves on.
 *  Long enough to register as an answer, short enough not to be a wait. */
const CONTINUE_DELAY_MS = 1_600

export default function ZenCaptureModal({ continued = false }: {
  /** True when this capture is the second half of onboarding, moments after the
   *  Brand Brain finished reading the very same website. See CONTINUED_COPY. */
  continued?: boolean
}) {
  const { capture, url, grab, closeCapture, cancelCapture, proceedFromCapture, detectedFramework, isPremium } = useThemeStudio()
  const { open, phase, pct, activeStep } = capture

  // ADVANCE ONCE, AND ONLY ONCE.
  //
  // `proceedFromCapture` is not idempotent downstream: the second call finds
  // `wpImportIntent` already consumed and overwrites the queued article import
  // with nothing (see handleCaptureProceed in SiteDetailClient). So the auto-
  // advance and the button share one latch, and whichever fires first wins.
  const advanced = useRef(false)
  const proceedOnce = () => {
    if (advanced.current) return
    advanced.current = true
    proceedFromCapture()
  }

  useEffect(() => {
    if (!continued || !open || phase !== 'success' || advanced.current) return
    const t = setTimeout(proceedOnce, CONTINUE_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continued, open, phase])

  // When the captured site is WordPress, its articles can be imported next — so
  // the success state ADAPTS to what we actually found instead of always showing
  // the same generic "Comencem".
  const isWordPress = (detectedFramework ?? '').toLowerCase() === 'wordpress'

  const host = useMemo(() => {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
  }, [url])

  // Headline + subline by state. While running we follow the active step; the
  // headline is keyed so each new message gently fades up (zen-fade-up).
  const headline =
    phase === 'success' ? 'Tot a punt'
    : phase === 'error' ? 'No ha anat bé'
    : (continued ? CONTINUED_COPY : RUNNING_COPY)[activeStep ?? 'fetch']

  // On success, the subline answers "…and how does this go live?" — plan- and
  // CMS-aware (subdomain inherits the cloned chrome; the WP plugin defers to the
  // theme). WordPress captures also announce the article import that follows
  // (AFTER the WhatsApp connect step, per the 2026-07-13 flow order).
  const subline =
    phase === 'success'
      ? (isWordPress
          ? `Hem detectat WordPress: de seguida importarem els teus articles. ${captureChromeNote(detectedFramework, isPremium)}`
          : `El teu blog ja llueix com el teu lloc. ${captureChromeNote(detectedFramework, isPremium)}`)
    : phase === 'error' ? (capture.error ?? 'Torna-ho a provar d’aquí a un moment.')
    // "des de <host>" reads as an announcement of a NEW visit. Mid-onboarding we
    // have just come from there, so the line says so instead.
    : continued ? 'Seguim on ho havíem deixat'
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
            // One honest CTA: the flow decides what comes next (WhatsApp
            // connect, then the article import when there's a source blog).
            // Mid-onboarding it is a safety net rather than a gate — the effect
            // above advances on its own a beat later.
            <Button glow fullWidth onClick={proceedOnce} iconRight={<ArrowRight className="h-4 w-4" />}>
              {continued ? 'Seguim' : 'Continuar'}
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
