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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      style={{ animation: 'modal-fade 0.18s ease' }}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className={`relative w-full ${maxW} bg-bg-elevated text-text rounded-2xl shadow-premium border border-border`}
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
      className="cursor-pointer absolute top-4 right-4 p-2 text-subtle hover:text-text bg-surface-subtle hover:bg-surface-hover rounded-lg transition-colors z-10"
    >
      <X className="w-4 h-4" />
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
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isDanger ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h2 id="confirm-title" className="text-base font-semibold text-text">{opts.title}</h2>
                {opts.message && (
                  <p className="text-sm text-muted mt-1.5 leading-relaxed">{opts.message}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => settle(false)}
                className="cursor-pointer h-10 px-4 text-sm font-semibold text-muted hover:text-text hover:bg-surface-hover rounded-xl transition-colors"
              >
                {opts.cancelLabel ?? 'Cancel·lar'}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => settle(true)}
                className={`cursor-pointer h-10 px-5 text-sm font-semibold rounded-xl transition-colors shadow-card ${
                  isDanger
                    ? 'bg-danger text-white hover:opacity-90'
                    : 'bg-accent text-on-accent hover:bg-accent-hover'
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
