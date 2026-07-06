'use client'

// One-shot provisioning screen. Provisioning is a MUTATION, so it must run from
// a client event/effect — never during the Server-Component render of the page,
// which a prefetched `<Link href="/benvinguda?url=…">` would fire speculatively
// (the old cause of duplicate sites). A ref guard makes it run exactly once even
// under React 18/19 strict double-invocation, then we replace into the site.

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Wand2, AlertCircle, ArrowRight, Crown, LayoutDashboard } from 'lucide-react'
import Wordmark from '@/components/ui/Wordmark'
import { provisionOnboardingSite } from '@/lib/actions/onboarding'

export default function BenvingudaClient({ cloneUrl }: { cloneUrl?: string }) {
  const router = useRouter()
  const ran = useRef(false)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState<{ plan: string; max: number } | null>(null)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    startTransition(async () => {
      const result = await provisionOnboardingSite(cloneUrl)
      if (result.limit) {
        setLimit(result.limit)
        return
      }
      if (result.error || !result.id) {
        setError(result.error ?? 'No s’ha pogut preparar el teu blog.')
        return
      }
      const params = new URLSearchParams({ onboarding: '1' })
      if (cloneUrl) params.set('clone', cloneUrl)
      router.replace(`/dashboard/sites/${result.id}?${params.toString()}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-bg px-6 text-center">
      <div className="halo halo-drift-a" style={{ width: 460, height: 460, background: 'rgba(245,188,0,0.18)', top: -130, left: -90 }} aria-hidden />
      <div className="halo halo-drift-b" style={{ width: 420, height: 420, background: 'rgba(245,188,0,0.12)', bottom: -150, right: -70 }} aria-hidden />
      <Wordmark size="text-xl" className="relative" />

      {limit ? (
        <div className="relative flex max-w-md flex-col items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-text">Has arribat al límit del teu pla</h1>
            <p className="mt-1.5 text-sm text-muted">
              El pla <span className="font-semibold capitalize text-text">{limit.plan}</span> permet{' '}
              {limit.max === 1 ? '1 blog' : `${limit.max} blogs`}. Passa a un pla superior per obrir-ne més,
              o continua treballant amb {limit.max === 1 ? 'el teu blog actual' : 'els teus blogs actuals'}.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <Link
              href="/#preus"
              className="btn-gold inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold no-underline"
            >
              <Crown className="h-4 w-4" /> Veure els plans
            </Link>
            <button
              onClick={() => router.replace('/dashboard')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
            >
              <LayoutDashboard className="h-4 w-4" /> Anar al panell
            </button>
          </div>
        </div>
      ) : error ? (
        <div className="relative flex max-w-md flex-col items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <AlertCircle className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-text">Alguna cosa ha fallat</h1>
            <p className="mt-1.5 text-sm text-muted">{error}</p>
          </div>
          <button
            onClick={() => router.replace('/dashboard')}
            className="btn-gold inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold"
          >
            Anar al panell <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative flex max-w-md flex-col items-center gap-5">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <span className="absolute -inset-2 rounded-full bg-accent/25 blur-xl zen-breathe" aria-hidden />
            <span className="absolute inset-0 animate-spin rounded-2xl border-2 border-accent/70 border-r-transparent" />
            <Wand2 className="relative h-7 w-7" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-text">Preparant el teu blog…</h1>
            <p className="mt-1.5 text-sm text-muted">
              {cloneUrl
                ? 'Estem creant el teu espai i clonant el disseny. Trigarà un instant.'
                : 'Estem creant el teu espai. Trigarà un instant.'}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
