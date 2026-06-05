'use client'

import { useState } from 'react'
import { Mail, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal, ModalClose } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

type Props = {
  open: boolean
  onClose: () => void
  defaultEmail?: string
}

export default function ForgotPasswordModal({ open, onClose, defaultEmail }: Props) {
  const supabase = createClient()
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // Reset transient state on close so re-opening starts clean.
  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setError(null)
      setSent(false)
      setLoading(false)
    }, 200)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    // PKCE: the email link must hit the SERVER callback so the cookie verifier
    // is in scope when we exchange the code. The callback then forwards to
    // /reset-password with a live recovery session.
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <Modal open={open} onClose={handleClose} size="sm" labelledBy="forgot-title">
      <ModalClose onClose={handleClose} />
      <div className="p-7">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-11 h-11 bg-accent-soft text-accent rounded-xl flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="forgot-title" className="text-lg font-semibold text-text">
              {sent ? 'Mira el teu correu' : 'Recuperar contrasenya'}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {sent
                ? 'T’hem enviat un enllaç per restablir la contrasenya.'
                : 'T’enviarem un enllaç per restablir-la.'}
            </p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-success-soft border border-success/20">
              <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <p className="text-sm text-text">
                Si <span className="font-semibold">{email}</span> té un compte, hi rebràs un correu en
                un moment. Revisa també la carpeta de correu brossa.
              </p>
            </div>
            <Button fullWidth onClick={handleClose}>Tancar</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="forgot-email" className="block text-sm font-medium text-text">Correu electrònic</label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full h-11 px-3.5 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors text-sm"
                placeholder="admin@carma.cat"
              />
            </div>

            {error && (
              <div className="p-3 text-xs rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel·lar</Button>
              <Button type="submit" loading={loading}>
                Enviar enllaç
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
