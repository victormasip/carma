'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Carma] Render error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-md bg-bg-elevated border border-border rounded-2xl shadow-card p-8 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 mx-auto bg-danger-soft text-danger rounded-2xl flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-text">Alguna cosa ha fallat</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Hi ha hagut un error inesperat. Pots tornar-ho a provar; si el problema persisteix, contacta amb suport.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs font-mono text-subtle">ref: {error.digest}</p>
        )}
        <div className="mt-8 flex gap-3">
          <button
            onClick={reset}
            className="cursor-pointer flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Tornar-ho a provar
          </button>
          <Link
            href="/dashboard"
            className="cursor-pointer flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-muted hover:bg-surface-hover font-bold text-sm transition-colors"
          >
            <Home className="w-4 h-4" />
            Inici
          </Link>
        </div>
      </div>
    </div>
  )
}
