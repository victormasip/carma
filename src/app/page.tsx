'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Loader2, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import ForgotPasswordModal from './ForgotPasswordModal'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [forgotOpen, setForgotOpen] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard')
      } else {
        setCheckingSession(false)
      }
    }
    checkSession()
  }, [router, supabase])

  const handleLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      router.replace('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconegut')
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-bg">
        <Loader2 className="animate-spin h-6 w-6 text-accent" />
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12">
      {/* Subtle atmospheric accent — one orb, theme-aware */}
      <div className="pointer-events-none absolute top-[-20%] right-[-15%] h-[480px] w-[480px] rounded-full bg-accent opacity-[0.06] blur-[140px]" />

      <div className="relative w-full max-w-[420px]">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-text">
            Carma<span className="text-accent">.</span>
          </h1>
          <p className="text-sm text-muted mt-2">Entra al teu espai de treball</p>
        </div>

        {/* Card */}
        <div className="bg-bg-elevated border border-border rounded-2xl shadow-card p-8">
          <form onSubmit={(e) => { e.preventDefault(); handleLogin() }} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-text">
                Correu electrònic
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full h-11 px-3.5 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors text-sm"
                placeholder="admin@carma.cat"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-text">
                Contrasenya
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full h-11 px-3.5 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors text-sm"
                placeholder="••••••••"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group select-none">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-[5px] border transition-colors ${
                    rememberMe
                      ? 'bg-accent border-accent'
                      : 'bg-surface border-border-strong group-hover:border-accent'
                  }`}
                >
                  {rememberMe && <Check className="w-3 h-3 text-on-accent" strokeWidth={3} />}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={rememberMe}
                  onChange={() => setRememberMe(!rememberMe)}
                />
                <span className="text-xs font-medium text-muted group-hover:text-text transition-colors">
                  Mantenir la sessió
                </span>
              </label>

              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-medium text-muted hover:text-accent transition-colors cursor-pointer"
              >
                Has oblidat la clau?
              </button>
            </div>

            {error && (
              <div className="p-3 text-xs rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">
                {error}
              </div>
            )}

            <Button
              type="submit"
              loading={loading}
              fullWidth
              size="lg"
              iconRight={!loading ? <ArrowRight className="w-4 h-4" /> : undefined}
            >
              {loading ? 'Entrant…' : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-subtle">
          Headless CMS · Multi-tenant · Multi-idioma
        </p>
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        defaultEmail={email}
      />
    </main>
  )
}
