'use client'

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

const STORAGE_KEY = 'carma-theme'

type ThemeCtx = {
  mode: ThemeMode
  resolved: Resolved
  setMode: (m: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx | null>(null)

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider')
  return ctx
}

// ── External store: source of truth lives outside React so we can read it
// synchronously from useSyncExternalStore (no setState-in-effect needed). ──────

const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const emit = () => { for (const l of listeners) l() }

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

function systemPref(): Resolved {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyToDom(resolved: Resolved) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (resolved === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
}

// Cached snapshots — useSyncExternalStore requires referentially stable returns
// across re-renders until the underlying value actually changes.
let cachedMode: ThemeMode | null = null
let cachedResolved: Resolved | null = null
function getModeSnapshot(): ThemeMode {
  if (cachedMode === null) cachedMode = readStored()
  return cachedMode
}
function getResolvedSnapshot(): Resolved {
  if (cachedResolved === null) {
    const m = getModeSnapshot()
    cachedResolved = m === 'system' ? systemPref() : m
  }
  return cachedResolved
}
const getServerMode: () => ThemeMode = () => 'system'
const getServerResolved: () => Resolved = () => 'light'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode     = useSyncExternalStore(subscribe, getModeSnapshot,     getServerMode)
  const resolved = useSyncExternalStore(subscribe, getResolvedSnapshot, getServerResolved)

  // Track system-pref changes when in 'system' mode.
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      cachedResolved = mq.matches ? 'dark' : 'light'
      emit()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  // Mirror resolved into the DOM.
  useEffect(() => { applyToDom(resolved) }, [resolved])

  const setMode = useCallback((m: ThemeMode) => {
    cachedMode = m
    cachedResolved = m === 'system' ? systemPref() : m
    try { window.localStorage.setItem(STORAGE_KEY, m) } catch {}
    emit()
  }, [])

  const toggle = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light')
  }, [mode, setMode])

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Inline script that runs before paint to apply the persisted theme — prevents
 * a flash of light theme when the user has opted into dark.
 *
 * Mount with: <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
 */
export const themeInitScript = `(function(){try{var k='${STORAGE_KEY}';var v=localStorage.getItem(k);var d;if(v==='dark')d=true;else if(v==='light')d=false;else d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`
