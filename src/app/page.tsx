'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Loader2, Check } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true) // Activat per defecte
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  
  const router = useRouter()
  const supabase = createClient()

  // 1. Evitar que un usuari loguejat vegi el login
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard') // Replace evita que puguin tirar enrere
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
      
      router.replace('/dashboard') // Utilitzem replace aquí també
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconegut')
      setLoading(false)
    }
  }

  // Mentre comprovem si ja està loguejat, no mostrem el formulari per evitar "pampallugues"
  if (checkingSession) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[#F9F8F6]">
        <Loader2 className="animate-spin h-8 w-8 text-carma-500" />
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12 selection:bg-carma-500 selection:text-white">
      
      {/* ATMOSFERA VISUAL */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-carma-400/20 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-carma-300/10 blur-[160px] pointer-events-none" />

      {/* TARGETA PRINCIPAL */}
      <div className="relative w-full max-w-[460px] bg-white border border-neutral-100 rounded-[2.5rem] shadow-premium p-10 md:p-12 transition-all">
        
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-3 font-sans">
            Carma<span className="text-carma-500">.</span>
          </h1>
          <p className="text-sm font-medium text-neutral-400 tracking-wide">
            ACCÉS AL PANELL DE CONTROL PREMIUM
          </p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-6">
          
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest pl-1">
              Correu electrònic
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 bg-neutral-50/50 border border-neutral-200/80 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-neutral-900 placeholder-neutral-300 transition-all duration-200 text-sm font-medium"
              placeholder="admin@carma.cat"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest pl-1">
              Contrasenya
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 bg-neutral-50/50 border border-neutral-200/80 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-neutral-900 placeholder-neutral-300 transition-all duration-200 text-sm font-medium"
              placeholder="••••••••"
              required
            />
          </div>

          {/* CHECKBOX: Mantenir sessió i Recuperar contrasenya */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${rememberMe ? 'bg-carma-500 border-carma-500' : 'bg-neutral-50 border-neutral-300 group-hover:border-carma-400'}`}>
                {rememberMe && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={rememberMe} 
                onChange={() => setRememberMe(!rememberMe)} 
              />
              <span className="text-xs font-semibold text-neutral-500 group-hover:text-neutral-700 transition-colors">
                Mantenir la sessió
              </span>
            </label>
            
            <button type="button" className="cursor-pointer text-xs font-semibold text-neutral-400 hover:text-carma-600 transition-colors">
              Has oblidat la clau?
            </button>
          </div>

          {error && (
            <div className="p-3.5 text-xs rounded-xl bg-neutral-50 border border-neutral-100 text-neutral-600 font-medium leading-relaxed">
              {error}
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400 text-white py-4 rounded-xl font-semibold text-sm tracking-wide shadow-[0_10px_30px_-6px_rgba(212,175,55,0.3)] transition-all duration-300 active:scale-[0.98] flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                <>
                  Entrar a l&apos;espai de treball
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}