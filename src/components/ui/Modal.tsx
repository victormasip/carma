'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

// ─── Generic presentational modal ──────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  closeOnBackdrop = true,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
  labelledBy?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const maxW = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' }[size]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm"
      style={{ animation: 'modal-fade 0.18s ease' }}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className={`relative w-full ${maxW} bg-white rounded-[2rem] shadow-premium`}
        style={{ animation: 'modal-in 0.2s cubic-bezier(0.16,1,0.3,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Tancar"
      className="cursor-pointer absolute top-5 right-5 p-2 text-neutral-400 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 rounded-full transition-colors z-10"
    >
      <X className="w-5 h-5" />
    </button>
  )
}

// ─── Promise-based confirm() replacement ───────────────────────────────────────

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    return new Promise<boolean>(resolve => { resolver.current = resolve })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOpts(null)
  }, [])

  useEffect(() => {
    if (opts) confirmBtnRef.current?.focus()
  }, [opts])

  const isDanger = opts?.tone === 'danger'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => settle(false)} size="sm" labelledBy="confirm-title">
        {opts && (
          <div className="p-7">
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                isDanger ? 'bg-red-50 text-red-500' : 'bg-carma-50 text-carma-600'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h2 id="confirm-title" className="text-base font-extrabold text-neutral-900">{opts.title}</h2>
                {opts.message && (
                  <p className="text-sm text-neutral-500 mt-1.5 leading-relaxed">{opts.message}</p>
                )}
              </div>
            </div>

            <div className="mt-7 flex gap-3">
              <button
                onClick={() => settle(false)}
                className="cursor-pointer flex-1 py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                {opts.cancelLabel ?? 'Cancel·lar'}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => settle(true)}
                className={`cursor-pointer flex-1 py-3 text-sm font-bold text-white rounded-xl transition-colors shadow-sm ${
                  isDanger
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400'
                }`}
              >
                {opts.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  )
}
