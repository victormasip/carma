'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react'
import Button from '@/components/ui/Button'
import KnotLoader from '@/components/ui/KnotLoader'
import Wordmark from '@/components/ui/Wordmark'

type Phase = 'verifying' | 'ready' | 'done' | 'error'

export default function ResetPasswordClient() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  // If the callback redirected us with ?error=…, derive the initial state at
  // render time (lazy initializer) so we don't have to setState in an effect.
  const errParam = searchParams.get('error') ?? searchParams.get('error_description')
  const [phase, setPhase] = useState<Phase>(() => (errParam ? 'error' : 'verifying'))
  const [errorMsg, setErrorMsg] = useState<string>(() =>
    errParam ? decodeURIComponent(errParam) : 'Aquest enllaç ja no és vàlid o ha caducat.',
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // The /auth/callback server route already exchanged the code and set the
  // session cookie before redirecting us here. Just confirm a session exists —
  // if it does, the user is in a recovery state and can set a new password.
  useEffect(() => {
    if (phase === 'error') return
    let cancelled = false

    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) setPhase('ready')
      else {
        setErrorMsg('No s’ha trobat cap sessió de recuperació activa. Torna a sol·licitar l’enllaç.')
        setPhase('error')
      }
    }
    run()

    // Also honor a PASSWORD_RECOVERY event (legacy hash-flow paths).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) setPhase('ready')
    })

    return () => { cancelled = true; sub.subscription.unsubscribe() }
    // Intentionally only runs once on mount — phase changes shouldn't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError(null)

    if (password.length < 8) {
      setFieldError('La contrasenya ha de tenir almenys 8 caràcters.')
      return
    }
    if (password !== confirm) {
      setFieldError('Les contrasenyes no coincideixen.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setFieldError(error.message)
      setSubmitting(false)
      return
    }
    // Sign out the recovery session so the next visit needs a fresh login
    // with the new password.
    await supabase.auth.signOut()
    setPhase('done')
    setSubmitting(false)
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute top-[-20%] right-[-15%] h-[480px] w-[480px] rounded-full bg-accent opacity-[0.06] blur-[140px]" />

      <div className="relative w-full max-w-[420px]">
        <div className="flex flex-col items-center text-center mb-8">
          <Wordmark as="h1" size="text-3xl" />
          <p className="text-sm text-muted mt-2">Restablir la contrasenya</p>
        </div>

        <div className="bg-bg-elevated border border-border rounded-2xl shadow-card p-8">
          {phase === 'verifying' && (
            <div className="py-4">
              <KnotLoader size={56} label="Verificant l’enllaç…" />
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-5">
              <div className="p-3 text-sm rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">
                {errorMsg}
              </div>
              <Button fullWidth size="lg" onClick={() => router.replace('/login')} iconRight={<ArrowRight className="w-4 h-4" />}>
                Tornar al login
              </Button>
            </div>
          )}

          {phase === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="new-pw" className="block text-sm font-medium text-text">Nova contrasenya</label>
                <div className="relative">
                  <input
                    id="new-pw"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className="w-full h-11 px-3.5 pr-10 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors text-sm"
                    placeholder="Mínim 8 caràcters"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(s => !s)}
                    aria-label={show ? 'Amagar contrasenya' : 'Mostrar contrasenya'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-subtle hover:text-text rounded-md hover:bg-surface-hover cursor-pointer"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-pw" className="block text-sm font-medium text-text">Confirma la contrasenya</label>
                <input
                  id="confirm-pw"
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full h-11 px-3.5 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors text-sm"
                  placeholder="Repeteix la contrasenya"
                />
              </div>

              {fieldError && (
                <div className="p-3 text-xs rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">
                  {fieldError}
                </div>
              )}

              <Button type="submit" loading={submitting} fullWidth size="lg" iconRight={!submitting ? <ArrowRight className="w-4 h-4" /> : undefined}>
                {submitting ? 'Desant…' : 'Desar la nova contrasenya'}
              </Button>
            </form>
          )}

          {phase === 'done' && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success">
                <Check className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text">Contrasenya actualitzada</h2>
                <p className="text-sm text-muted mt-1.5">Ja pots entrar amb la nova contrasenya.</p>
              </div>
              <Button fullWidth size="lg" onClick={() => router.replace('/login')} iconRight={<ArrowRight className="w-4 h-4" />}>
                Tornar al login
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
