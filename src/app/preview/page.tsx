'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Lock, Sparkles, ArrowRight } from 'lucide-react'
import KnotLoader from '@/components/ui/KnotLoader'
import Wordmark from '@/components/ui/Wordmark'
import { createClient } from '@/lib/supabase/client'
import { normalizeUrl, displayUrl as toDisplay } from '@/lib/onboarding/url'

// Auto-advance to the wall after this long (a calm 30s — long enough to look,
// short enough to keep the funnel moving). The countdown starts when the clone
// FINISHES loading, not on mount, so a slower capture never robs the visitor of
// their look at the result.
const AUTO_ADVANCE_MS = 30_000

function PreviewInner() {
  const router = useRouter()
  const search = useSearchParams()
  const raw = search.get('url') || ''
  const url = useMemo(() => normalizeUrl(raw), [raw])
  const display = toDisplay(url)
  const [loaded, setLoaded] = useState(false)
  // null = session unknown yet; true/false once resolved.
  const [authed, setAuthed] = useState<boolean | null>(null)

  // Where "unlock" goes: a logged-in user goes straight to provisioning (creates
  // the site + runs the clone/import flow — exactly like register); a logged-out
  // user goes to signup, which then lands on the same provisioning hub.
  const unlockHref = authed
    ? `/benvinguda?url=${encodeURIComponent(url)}`
    : `/registre?url=${encodeURIComponent(url)}`
  const loginHref = `/login?next=${encodeURIComponent(`/benvinguda?url=${encodeURIComponent(url)}`)}`

  // Keep the latest unlock target available to the mount-time auto-advance timer
  // (it depends on `authed`, which resolves async). Written in an effect, never
  // during render (React-19 strict refs rule).
  const unlockRef = useRef(unlockHref)
  useEffect(() => { unlockRef.current = unlockHref }, [unlockHref])

  useEffect(() => {
    if (!url) { router.replace('/'); return }
    let cancelled = false
    createClient().auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthed(!!data.session)
    })
    return () => { cancelled = true }
  }, [url, router])

  // 30s to look — but the countdown only starts once the clone is on screen, so a
  // slow capture never pushes the visitor to signup before they've seen the result.
  useEffect(() => {
    if (!url || !loaded) return
    const t = setTimeout(() => router.push(unlockRef.current), AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [url, loaded, router])

  // Independent hard cap: if the iframe never signals load (a hang or a blocked
  // site), the funnel must still move rather than sit forever on the preview.
  useEffect(() => {
    if (!url) return
    const t = setTimeout(() => router.push(unlockRef.current), 60_000)
    return () => clearTimeout(t)
  }, [url, router])

  if (!url) return null

  const src = `/api/onboarding/preview?url=${encodeURIComponent(url)}`
  const unlock = () => router.push(unlockHref)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      {/* Top bar */}
      <header className="z-20 flex items-center justify-between gap-3 border-b border-border bg-bg-elevated/90 px-4 py-2.5 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-hover hover:text-text" aria-label="Tornar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link href="/" className="no-underline"><Wordmark size="text-lg" /></Link>
          <span className="hidden items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-bold text-accent sm:inline-flex">
            <Sparkles className="h-3.5 w-3.5" /> Previsualització · <span className="font-mono">{display}</span>
          </span>
        </div>
        <Link href={unlockHref} prefetch={false} className="btn-gold gold-trace [--gold-trace-w:1.5px] inline-flex shrink-0 items-center rounded-xl px-4 py-2 text-sm font-extrabold no-underline">
          <span className="relative z-[1] inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Desbloqueja</span>
        </Link>
      </header>

      {/* The real clone */}
      <div className="relative min-h-0 flex-1">
        <iframe
          src={src}
          title={`Previsualització de ${display}`}
          className="h-full w-full border-0 bg-white"
          onLoad={() => setLoaded(true)}
          sandbox="allow-scripts allow-same-origin"
        />

        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg">
            <KnotLoader size={84} label={`Clonant ${display}…`} />
            <p className="text-sm text-muted">Llegim la teva capçalera, el peu i els teus estils.</p>
          </div>
        )}
      </div>

      {/* Persistent unlock bar */}
      <div className="z-20 border-t border-border bg-bg-elevated/95 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-center text-sm font-semibold text-text sm:text-left">
            Aquest és el teu blog, clonat de <span className="font-mono text-muted">{display}</span>.
            <span className="font-normal text-muted"> {authed ? 'Desbloqueja’l per editar-lo.' : 'Crea el compte per desbloquejar-lo.'}</span>
          </p>
          <div className="flex shrink-0 items-center gap-4">
            {authed === false && (
              <Link href={loginHref} className="text-sm font-medium text-muted no-underline transition-colors hover:text-accent">
                Ja tens compte? <span className="font-bold text-accent">Entra</span>
              </Link>
            )}
            <button
              type="button"
              onClick={unlock}
              aria-label="Desbloqueja el teu blog"
              className="btn-gold gold-trace [--gold-trace-w:1.5px] inline-flex shrink-0 items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-extrabold"
            >
              <span className="relative z-[1] inline-flex items-center gap-2">
                <Lock className="h-4 w-4" /> Desbloqueja el meu blog <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-bg"><KnotLoader /></main>}>
      <PreviewInner />
    </Suspense>
  )
}
