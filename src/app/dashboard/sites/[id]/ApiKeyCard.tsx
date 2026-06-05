'use client'

import { useState } from 'react'
import { Copy, Check, KeyRound } from 'lucide-react'

export default function ApiKeyCard({
  apiKey,
  isSuperAdmin,
}: {
  apiKey: string
  isSuperAdmin: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  if (!isSuperAdmin) {
    return
  } else { return (
    <div className="bg-text rounded-2xl p-6 shadow-pop relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[60px] pointer-events-none rounded-full" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 text-accent mb-2">
          <KeyRound className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-widest">Clau API d&apos;Accés</h3>
        </div>
        <p className="text-subtle text-sm max-w-xl">
          Clau de només lectura per al frontend del client. Afegeix-la com a capçalera{' '}
          <code className="text-accent bg-text px-1.5 py-0.5 rounded text-xs">x-api-key</code>{' '}
          a les peticions GET.
        </p>
      </div>

      <div className="relative z-10 flex items-center gap-3 bg-black/50 p-2 pl-4 rounded-xl border border-white/10">
        <code className="text-subtle font-mono text-sm truncate w-48 md:w-64">{apiKey}</code>
        <button
          onClick={handleCopy}
          className="bg-text hover:bg-white/15 text-white p-2.5 rounded-lg transition-colors flex items-center justify-center shrink-0"
          title="Copiar Clau API"
        >
          {copied ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4 text-subtle" />}
        </button>
      </div>
    </div>
  )}
}
