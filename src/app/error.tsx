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
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F9F8F6]">
      <div className="w-full max-w-md bg-white border border-neutral-100 rounded-[2rem] shadow-premium p-10 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 mx-auto bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-extrabold text-neutral-900">Alguna cosa ha fallat</h1>
        <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
          Hi ha hagut un error inesperat. Pots tornar-ho a provar; si el problema persisteix, contacta amb suport.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs font-mono text-neutral-300">ref: {error.digest}</p>
        )}
        <div className="mt-8 flex gap-3">
          <button
            onClick={reset}
            className="cursor-pointer flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white font-bold text-sm transition-transform active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" />
            Tornar-ho a provar
          </button>
          <Link
            href="/dashboard"
            className="cursor-pointer flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-neutral-500 hover:bg-neutral-100 font-bold text-sm transition-colors"
          >
            <Home className="w-4 h-4" />
            Inici
          </Link>
        </div>
      </div>
    </div>
  )
}
