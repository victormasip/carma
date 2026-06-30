'use client'

// Shared per-segment error boundary UI. Rendered by route-level error.tsx files,
// so a thrown error in a segment is caught WITHIN its layout (e.g. the dashboard
// sidebar stays) instead of bubbling to the bare root error page.
//
// Two distinct failure modes are handled differently:
//
//   · TRANSIENT NETWORK errors — an RSC navigation / router.refresh() that loses
//     the connection (common in dev during a recompile, or on a real flaky link),
//     a background token refresh, a dropped beacon. These surface as
//     `TypeError: network error` / "Failed to fetch" / "Load failed". They are NOT
//     application bugs, so we show a calm "reconnecting" state and auto-retry with
//     backoff instead of the alarming red error card. This is the root-cause fix
//     for the dashboard's spurious "Segment error: TypeError: network error".
//
//   · GENUINE errors — everything else. Full error card, manual retry + home.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home, Wifi } from 'lucide-react'
import KnotSpinner from './KnotSpinner'

// Heuristic: is this the browser's generic "the request never completed" failure?
function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // TypeError is what fetch/undici/RSC throw on a dropped connection. The message
  // varies by engine: Chrome "Failed to fetch", Firefox "NetworkError when…",
  // Safari "Load failed", undici/Node "fetch failed" / "network error".
  const msg = `${error.name}: ${error.message}`.toLowerCase()
  return (
    error instanceof TypeError &&
    /network error|failed to fetch|fetch failed|load failed|networkerror|err_network|connection/i.test(msg)
  )
}

const MAX_AUTO_RETRIES = 3

export default function SegmentError({
  error,
  reset,
  title = 'Alguna cosa ha fallat',
  message = 'Hi ha hagut un error inesperat. Torna-ho a provar; si persisteix, contacta amb suport.',
  homeHref = '/dashboard',
  homeLabel = 'Inici',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
  homeHref?: string
  homeLabel?: string
}) {
  const transient = isTransientNetworkError(error)
  const [retrying, setRetrying] = useState(transient)
  const attempts = useRef(0)

  useEffect(() => {
    // Only the genuine-error path is worth a console line; transient blips are noise.
    if (!transient) console.error('[Carma] Segment error:', error)
  }, [error, transient])

  useEffect(() => {
    if (!transient) return
    if (attempts.current >= MAX_AUTO_RETRIES) { setRetrying(false); return }
    // Exponential-ish backoff: 0.6s, 1.2s, 2.4s — enough for a recompile / blip
    // to clear, bounded so we never hot-loop a truly-offline client.
    const delay = 600 * 2 ** attempts.current
    const t = setTimeout(() => { attempts.current += 1; reset() }, delay)
    return () => clearTimeout(t)
  }, [transient, reset])

  // ── Transient: calm, self-recovering "reconnecting" state ──
  if (transient && retrying) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <KnotSpinner className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">Reconnectant…</p>
            <p className="mt-1 text-xs text-muted">S&apos;ha perdut la connexió un moment. Tornem a provar.</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Transient but auto-retries exhausted: gentle manual retry, not a red error ──
  if (transient) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-8 text-center shadow-card">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Wifi className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-text">Sense connexió</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            No hem pogut connectar amb el servidor. Comprova la teva connexió i torna-ho a provar.
          </p>
          <button
            onClick={() => { attempts.current = 0; setRetrying(true); reset() }}
            className="mt-7 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            <RotateCcw className="h-4 w-4" /> Tornar-ho a provar
          </button>
        </div>
      </div>
    )
  }

  // ── Genuine error ──
  return (
    <div className="flex min-h-[55vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-8 text-center shadow-card animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-text">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
        {error.digest && <p className="mt-3 font-mono text-xs text-subtle">ref: {error.digest}</p>}
        <div className="mt-7 flex gap-3">
          <button
            onClick={reset}
            className="flex flex-[2] cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            <RotateCcw className="h-4 w-4" /> Tornar-ho a provar
          </button>
          <Link
            href={homeHref}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-muted transition-colors hover:bg-surface-hover"
          >
            <Home className="h-4 w-4" /> {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}
