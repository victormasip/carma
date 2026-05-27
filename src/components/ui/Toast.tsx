'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
type ToastItem = { id: string; message: string; type: ToastType }
type ToastCtx = { toast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastCtx | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}

const STYLES: Record<ToastType, { bar: string; chip: string; icon: React.ReactNode }> = {
  success: { bar: 'bg-green-500',  chip: 'bg-green-100 text-green-600', icon: <CheckCircle2 className="w-5 h-5" /> },
  error:   { bar: 'bg-red-500',    chip: 'bg-red-100 text-red-600',     icon: <XCircle className="w-5 h-5" /> },
  info:    { bar: 'bg-carma-500',  chip: 'bg-carma-100 text-carma-700', icon: <Info className="w-5 h-5" /> },
}

function ToastPill({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const s = STYLES[item.type]
  return (
    <div
      className="pointer-events-auto relative flex items-start gap-3 pl-5 pr-3 py-4 rounded-2xl border border-neutral-200/70 bg-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.28)] w-[360px] max-w-[calc(100vw-3rem)] overflow-hidden"
      style={{ animation: 'toast-in 0.32s cubic-bezier(0.22, 1, 0.36, 1)' }}
      role="status"
    >
      <span className={`absolute left-0 top-0 h-full w-1.5 ${s.bar}`} aria-hidden />
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.chip}`}>{s.icon}</span>
      <p className="flex-1 text-sm font-semibold text-neutral-800 leading-snug pt-1.5">{item.message}</p>
      <button
        onClick={onDismiss}
        className="cursor-pointer mt-0.5 shrink-0 text-neutral-300 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg p-1 transition-colors"
        aria-label="Tancar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-6 right-6 z-[200] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => (
          <ToastPill key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
