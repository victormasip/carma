'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, ArrowRight, User, Phone, Globe, MailCheck } from 'lucide-react'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { signInWithPassword, signUpWithPassword, startGoogleOAuth } from '@/lib/actions/auth'
import { authNextFor, cloneNextFor } from '@/lib/auth/next'
import { AuthCardShell, AuthInput } from '@/components/ui/auth-card-shell'
import ForgotPasswordModal from '@/app/ForgotPasswordModal'

type Mode = 'login' | 'register'

// One cohesive auth surface for BOTH /login and /registre. The mode toggles
// instantly in-place (no full navigation) with a fast crossfade, and the URL is
// kept in sync (replaceState) so a refresh lands on the same mode and the funnel
// query (?url= / ?next=) is preserved. Animations are deliberately quick (~0.2s).
//
// NOTHING ABOUT AUTH HAPPENS IN THIS BUNDLE (2026-09-18)
// ──────────────────────────────────────────────
// This file used to import `@supabase/supabase-js` (61.6KB gzip) and
// `framer-motion` (39.8KB gzip) — 101KB of library to show two inputs and a gold
// button, on the first page of the funnel, over whatever connection the visitor
// happens to have. Both are gone:
//
//   · every auth call is a Server Action (lib/actions/auth.ts), so the SDK stays
//     on the server where the session cookie is set anyway;
//   · the three animations are CSS keyframes (`.auth-card-in`, `.auth-swap`,
//     `.auth-pill` in globals.css) — same curves, same durations, no library.
//
// See docs/plans/2026-09-18-performance-every-page.md §F3–F4 / W4.

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

function GoogleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="w-full">
      {/* <span>, not <div>: a <button> may only contain phrasing content. */}
      <span className="relative overflow-hidden bg-white/5 text-white h-10 rounded-lg border border-white/10 hover:border-white/20 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2">
        <GoogleMark />
        <span className="text-white/80 text-xs font-medium">{label}</span>
      </span>
    </button>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative my-1 flex items-center">
      <div className="flex-grow border-t border-white/10" />
      <span className="mx-3 text-xs text-white/40">{label}</span>
      <div className="flex-grow border-t border-white/10" />
    </div>
  )
}

function IconField({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative flex items-center overflow-hidden rounded-lg">
      <span className="absolute left-3 text-white/40">{icon}</span>
      {children}
    </div>
  )
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn-gold relative mt-1 flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg text-sm font-extrabold transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
    >
      {loading
        ? <KnotSpinner className="h-4 w-4" />
        : <>{label} <ArrowRight className="h-4 w-4" /></>}
    </button>
  )
}

export default function AuthPanel({ initialMode }: { initialMode: Mode }) {
  const router = useRouter()
  const search = useSearchParams()

  const [mode, setMode] = useState<Mode>(initialMode)

  // Funnel context (preserved across the toggle). The rules live in
  // lib/auth/next.ts because the SERVER gate on these two routes needs the same
  // answer to redirect an already-signed-in visitor, and the two must never
  // disagree about where the funnel goes.
  const cloneUrl = search.get('url') || ''
  const displayUrl = cloneUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const get = (k: string) => search.get(k)
  const registerNext = cloneNextFor(get)
  const loginNext = authNextFor('login', get)

  // Shared form state.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  // Register-only.
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [confirm, setConfirm] = useState('')

  // OAuth errors arrive as ?error= — derive at render time (lazy initializer) so
  // the mount effect never has to setState synchronously.
  const [error, setError] = useState<string | null>(() => search.get('error'))
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setError(null)
    setMode(next)
    // Keep the URL + funnel query in sync without a full navigation.
    const qs = typeof window !== 'undefined' ? window.location.search : ''
    window.history.replaceState({}, '', `${next === 'register' ? '/registre' : '/login'}${qs}`)
  }

  const handleGoogle = async () => {
    setError(null)
    const next = mode === 'register' ? registerNext : loginNext
    // `window.location.origin` is a browser fact, so the absolute callback URL is
    // still built here and handed to the action.
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const res = await startGoogleOAuth(redirectTo)
    if (!res.ok) { setError(res.error); return }
    // The SDK would have done this itself; with `skipBrowserRedirect` the travel
    // is ours to make, and the PKCE verifier is already a cookie from the action.
    window.location.assign(res.url)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await signInWithPassword(email, password)
    if (!res.ok) { setError(res.error); setLoading(false); return }
    router.replace(loginNext)
    router.refresh()
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('La contrasenya ha de tenir com a mínim 8 caràcters.')
    if (password !== confirm) return setError('Les contrasenyes no coincideixen.')
    setLoading(true)
    try {
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(registerNext)}`
      const res = await signUpWithPassword({ email, password, name, phone, emailRedirectTo })
      if (!res.ok) throw new Error(res.error)
      if (res.needsConfirmation) {
        setEmailSent(true)
        setLoading(false)
      } else {
        router.replace(registerNext)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconegut')
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <AuthCardShell title="Revisa el teu correu" subtitle="Ja gairebé hi som">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-carma-400/20 text-carma-300">
            <MailCheck className="h-7 w-7" />
          </span>
          <p className="mt-5 text-sm leading-relaxed text-white/70">
            T’hem enviat un enllaç de confirmació a <span className="font-semibold text-white">{email}</span>.
            Obre’l per activar el teu compte.
          </p>
          <button
            type="button"
            onClick={() => { setEmailSent(false); switchMode('login') }}
            className="mt-6 text-sm font-bold text-carma-300 hover:underline"
          >
            Tornar a entrar
          </button>
        </div>
      </AuthCardShell>
    )
  }

  const title = mode === 'login' ? 'Gràcies per ser aquí' : 'Crea el teu espai'
  const subtitle = mode === 'login' ? 'Entra per continuar a Carma' : 'Gratuït i senzill'

  return (
    <>
      <AuthCardShell title={title} subtitle={subtitle}>
        {/* Segmented mode toggle */}
        <div className="relative mb-5 grid grid-cols-2 rounded-xl bg-white/5 p-1 text-sm font-semibold">
          {/* The gold pill. Same geometry as before; the spring is now a curve
              with a little overshoot (`.auth-pill` in globals.css), and the
              position is an inline transform driven by state. */}
          <span
            aria-hidden
            className="auth-pill absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-carma-400 shadow-[0_4px_14px_-4px_rgba(245,188,0,0.6)]"
            style={{ transform: mode === 'login' ? 'translateX(4px)' : 'translateX(calc(100% + 4px))' }}
          />
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`relative z-10 h-8 rounded-lg transition-colors ${mode === 'login' ? 'text-[#1a1400]' : 'text-white/60 hover:text-white'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`relative z-10 h-8 rounded-lg transition-colors ${mode === 'register' ? 'text-[#1a1400]' : 'text-white/60 hover:text-white'}`}
          >
            Crear compte
          </button>
        </div>

        {/* `key={mode}` remounts this on every switch, so the CSS entrance
            replays exactly as AnimatePresence's `initial` did. Only the exit half
            is gone, and at 160ms the exit half was never visible. */}
        <div key={mode} className="auth-swap">
            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <IconField icon={<Mail className="h-4 w-4" />}>
                  <AuthInput type="email" placeholder="Correu electrònic" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required className="pl-10" />
                </IconField>
                <IconField icon={<Lock className="h-4 w-4" />}>
                  <AuthInput type={showPw ? 'text' : 'password'} placeholder="Contrasenya" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required className="pl-10 pr-10" />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 text-white/40 hover:text-white transition-colors" aria-label={showPw ? 'Amagar contrasenya' : 'Mostrar contrasenya'}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </IconField>

                <div className="flex justify-end">
                  <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-white/60 hover:text-white transition-colors">
                    Has oblidat la clau?
                  </button>
                </div>

                {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">{error}</div>}

                <SubmitButton loading={loading} label="Entra" />
                <Divider label="o" />
                <GoogleButton onClick={handleGoogle} label="Entra amb Google" />
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                {displayUrl && (
                  <div className="flex items-center gap-2 rounded-lg border border-carma-400/30 bg-carma-400/10 px-3 py-2">
                    <Globe className="h-4 w-4 shrink-0 text-carma-300" />
                    <span className="truncate text-xs font-medium text-white/80">Clonarem <span className="font-mono">{displayUrl}</span></span>
                  </div>
                )}
                <GoogleButton onClick={handleGoogle} label="Continua amb Google" />
                <Divider label="o amb el correu" />

                <IconField icon={<User className="h-4 w-4" />}>
                  <AuthInput type="text" placeholder="Nom" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required className="pl-10" />
                </IconField>
                <IconField icon={<Mail className="h-4 w-4" />}>
                  <AuthInput type="email" placeholder="Correu electrònic" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required className="pl-10" />
                </IconField>
                <IconField icon={<Phone className="h-4 w-4" />}>
                  <AuthInput type="tel" placeholder="Telèfon (opcional)" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" className="pl-10" />
                </IconField>
                <IconField icon={<Lock className="h-4 w-4" />}>
                  <AuthInput type={showPw ? 'text' : 'password'} placeholder="Contrasenya" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required className="pl-10 pr-10" />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 text-white/40 hover:text-white transition-colors" aria-label={showPw ? 'Amagar contrasenya' : 'Mostrar contrasenya'}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </IconField>
                <IconField icon={<Lock className="h-4 w-4" />}>
                  <AuthInput type={showPw ? 'text' : 'password'} placeholder="Confirma la contrasenya" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required className="pl-10" />
                </IconField>

                {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">{error}</div>}

                <SubmitButton loading={loading} label="Crear" />
                <p className="text-center text-[11px] leading-relaxed text-white/40">
                  En crear el compte acceptes els Termes d’ús i la Política de privacitat.
                </p>
              </form>
            )}
        </div>
      </AuthCardShell>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} defaultEmail={email} />
    </>
  )
}
