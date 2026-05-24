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

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />,
  error:   <XCircle      className="w-4 h-4 text-red-600 shrink-0" />,
  info:    <Info         className="w-4 h-4 text-carma-500 shrink-0" />,
}

const BORDER: Record<ToastType, string> = {
  success: 'border-green-100',
  error:   'border-red-100',
  info:    'border-carma-200',
}

function ToastPill({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl border bg-white shadow-premium max-w-sm w-full ${BORDER[item.type]}`}
      style={{ animation: 'toast-in 0.25s ease' }}
    >
      {ICONS[item.type]}
      <p className="text-sm font-semibold text-neutral-800 flex-1 leading-snug">{item.message}</p>
      <button onClick={onDismiss} className="text-neutral-300 hover:text-neutral-600 transition-colors mt-0.5">
        <X className="w-3.5 h-3.5" />
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
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => (
          <ToastPill key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
