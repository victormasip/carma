import { Suspense } from 'react'
import AuthPanel from '@/components/ui/AuthPanel'
import KnotLoader from '@/components/ui/KnotLoader'

// Auth pages depend on runtime session/env (Supabase client) — never prerender
// them, so a missing build-time env can't crash `next build` on this route.
export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-bg"><KnotLoader /></main>}>
      <AuthPanel initialMode="login" />
    </Suspense>
  )
}
