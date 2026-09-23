'use client'

// W5 — THE PROGRESSIVE REVEAL, as a state machine.
//
//   idle ──paint(W3)──▶ polishing ──upgrade(W4)──▶ polished
//                           │
//                           └──(refused · failed · slow · no token)──▶ settled
//
// PAINT is instant: the deterministic director's three designs arrive inside the
// glimpse result, so they are on screen the moment the reveal is. The art
// director's upgrade is then requested in the background, and the visitor is
// never made to wait for it — if it lands, the three designs are swapped in
// place; if it doesn't, nothing is said, because nothing is missing.
//
// FOUR RULES THIS FILE KEEPS
//
//   1. STARTED FROM AN EVENT, NEVER AN EFFECT. `paint` is called by the Door's
//      submit handler when the result arrives. An effect would be the React-y
//      reflex and the wrong one: Strict Mode mounts effects twice, and here that
//      is two ~$0.10 model calls (BrandCaptureView's history has the scar).
//   2. THE VISITOR'S CHOICE SURVIVES THE SWAP. An upgrade replaces what each tab
//      SHOWS, never which tab is open.
//   3. STALE ANSWERS ARE DROPPED. Every paint bumps a generation; an answer that
//      comes back for an older generation (they reset, or read another site) is
//      discarded, and its request aborted.
//   4. EACH FRAME SWAPS ONLY WHEN ITS REPLACEMENT HAS LOADED. The frames live in
//      this reducer as small stacks: the upgraded page loads UNDER the one on
//      screen, and only once it has painted does it fade in over it — so the swap
//      never flashes a blank frame.

import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  REVEAL_ORDER,
  type DesignUpgradeResponse, type RevealDesign, type RevealVariant, type RevealVariantName,
} from '@/lib/design/revealTypes'

/** Past this the art director is not coming. The route itself gives up at 120s. */
const UPGRADE_TIMEOUT_MS = 90_000

export type DesignPhase = 'idle' | 'polishing' | 'polished' | 'settled'

/** One page in a frame's stack. `shown` flips when it has loaded and may fade in. */
export type FrameLayer = { id: string; src: string; shown: boolean }

export type DesignState = {
  design: RevealDesign | null
  active: RevealVariantName
  phase: DesignPhase
  frames: Record<RevealVariantName, FrameLayer[]>
}

export type DesignAction =
  | { type: 'paint'; design: RevealDesign }
  | { type: 'upgrade'; variants: RevealVariant[] }
  | { type: 'settle' }
  | { type: 'choose'; variant: RevealVariantName }
  | { type: 'loaded'; variant: RevealVariantName; id: string }
  | { type: 'retire'; variant: RevealVariantName; id: string }
  | { type: 'reset' }

const NO_FRAMES: Record<RevealVariantName, FrameLayer[]> = { faithful: [], elevated: [], reimagined: [] }
export const INITIAL_DESIGN_STATE: DesignState = { design: null, active: 'faithful', phase: 'idle', frames: NO_FRAMES }

const layerOf = (v: RevealVariant): FrameLayer => ({ id: v.id, src: v.preview, shown: false })

/** Pure — exported so `test:reveal` can walk the state machine without a browser. */
export function designReducer(s: DesignState, a: DesignAction): DesignState {
  switch (a.type) {
    case 'paint': {
      const frames = { ...NO_FRAMES }
      for (const v of a.design.variants) frames[v.variant] = [layerOf(v)]
      return { design: a.design, active: a.design.preferred, phase: a.design.token ? 'polishing' : 'settled', frames }
    }
    case 'upgrade': {
      if (!s.design || s.phase !== 'polishing') return s
      const frames = { ...s.frames }
      for (const v of a.variants) {
        const stack = frames[v.variant]
        // Same genome (the model agreed with the maths): nothing to swap.
        if (stack.some(l => l.id === v.id)) continue
        frames[v.variant] = [...stack, layerOf(v)]
      }
      return { ...s, design: { ...s.design, source: 'directed', variants: a.variants }, phase: 'polished', frames }
    }
    case 'settle':
      return s.phase === 'polishing' ? { ...s, phase: 'settled' } : s
    case 'choose':
      return s.design ? { ...s, active: a.variant } : s
    case 'loaded': {
      const stack = s.frames[a.variant]
      if (!stack.some(l => l.id === a.id && !l.shown)) return s
      return { ...s, frames: { ...s.frames, [a.variant]: stack.map(l => (l.id === a.id ? { ...l, shown: true } : l)) } }
    }
    case 'retire': {
      // Drop every layer UNDER the given one — it has finished fading in over them.
      const stack = s.frames[a.variant]
      const at = stack.findIndex(l => l.id === a.id)
      if (at <= 0) return s
      return { ...s, frames: { ...s.frames, [a.variant]: stack.slice(at) } }
    }
    case 'reset':
      return INITIAL_DESIGN_STATE
  }
}

/** The upgrade answered with something we can draw — three named variants of ours. */
export function isUsableUpgrade(r: DesignUpgradeResponse | null): r is Extract<DesignUpgradeResponse, { source: 'directed' }> {
  if (!r || r.source !== 'directed' || !Array.isArray(r.variants) || r.variants.length !== 3) return false
  return REVEAL_ORDER.every(name => r.variants.some(v =>
    v?.variant === name && typeof v.id === 'string' &&
    typeof v.preview === 'string' && v.preview.startsWith('/api/onboarding/design/preview?')))
}

export function useProgressiveDesign() {
  const [state, dispatch] = useReducer(designReducer, INITIAL_DESIGN_STATE)
  const generation = useRef(0)
  const inflight = useRef<AbortController | null>(null)

  /** Paint W3 now; ask for W4 in the background. Call from an event handler. */
  const paint = useCallback((design: RevealDesign) => {
    inflight.current?.abort()
    const gen = ++generation.current
    dispatch({ type: 'paint', design })
    if (!design.token) return

    const ctrl = new AbortController()
    inflight.current = ctrl
    const timer = setTimeout(() => ctrl.abort(), UPGRADE_TIMEOUT_MS)
    void fetch('/api/onboarding/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: design.token }),
      signal: ctrl.signal,
    })
      .then(res => (res.ok ? res.json() as Promise<DesignUpgradeResponse> : null))
      .catch(() => null)
      .then(r => {
        if (gen !== generation.current) return
        if (isUsableUpgrade(r)) dispatch({ type: 'upgrade', variants: r.variants })
        else dispatch({ type: 'settle' })
      })
      .finally(() => {
        clearTimeout(timer)
        if (inflight.current === ctrl) inflight.current = null
      })
  }, [])

  const reset = useCallback(() => {
    inflight.current?.abort()
    generation.current++
    dispatch({ type: 'reset' })
  }, [])

  const choose = useCallback((variant: RevealVariantName) => dispatch({ type: 'choose', variant }), [])
  const loaded = useCallback((variant: RevealVariantName, id: string) => dispatch({ type: 'loaded', variant, id }), [])
  const retire = useCallback((variant: RevealVariantName, id: string) => dispatch({ type: 'retire', variant, id }), [])

  // Leaving the page abandons the upgrade; nobody is left to show it to.
  useEffect(() => () => inflight.current?.abort(), [])

  return { state, paint, reset, choose, loaded, retire }
}

export type ProgressiveDesign = ReturnType<typeof useProgressiveDesign>
