'use client'

// Subtle, non-intrusive auto-save indicator for the zero-click / optimistic-save
// model. Renders nothing when idle; a quiet spinner while a background mutation is
// in flight; a check that fades back to idle on success; a clear error otherwise.
// `aria-live="polite"` so screen-readers announce the save state without stealing
// focus. Pair with the `useFlashSave` helper to drive the saving→saved→idle cycle.

import { useCallback, useState } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { cn } from '@/lib/cn'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Per-key save-state tracker for optimistic lists (e.g. article cards). Drives the
// saving → saved → idle cycle, where `saved` auto-fades back to idle after a beat
// (without clobbering a newer save that started in the meantime).
export function useKeyedSaveState() {
  const [map, setMap] = useState<Map<string, SaveState>>(new Map())
  const put = useCallback((id: string, s: SaveState) => {
    setMap(prev => { const next = new Map(prev); next.set(id, s); return next })
  }, [])
  const flashSaved = useCallback((id: string) => {
    put(id, 'saved')
    setTimeout(() => setMap(prev => {
      if (prev.get(id) !== 'saved') return prev // a newer save is in flight — leave it
      const next = new Map(prev); next.set(id, 'idle'); return next
    }), 1600)
  }, [put])
  const stateOf = useCallback((id: string): SaveState => map.get(id) ?? 'idle', [map])
  return {
    stateOf,
    markSaving: useCallback((id: string) => put(id, 'saving'), [put]),
    markError: useCallback((id: string) => put(id, 'error'), [put]),
    flashSaved,
  }
}

export default function SaveStatus({
  state,
  className,
  labels = true,
}: {
  state: SaveState
  className?: string
  /** Show the text label next to the icon (default true). */
  labels?: boolean
}) {
  if (state === 'idle') return null
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold select-none whitespace-nowrap',
        'animate-in fade-in duration-200',
        state === 'saving' && 'text-subtle',
        state === 'saved' && 'text-success',
        state === 'error' && 'text-danger',
        className,
      )}
    >
      {state === 'saving' && (<><KnotSpinner className="w-3.5 h-3.5" />{labels && 'Desant…'}</>)}
      {state === 'saved' && (<><Check className="w-3.5 h-3.5" strokeWidth={3} />{labels && 'Desat'}</>)}
      {state === 'error' && (<><AlertCircle className="w-3.5 h-3.5" />{labels && 'No desat'}</>)}
    </span>
  )
}
