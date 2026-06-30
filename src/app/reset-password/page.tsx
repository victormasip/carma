import { Suspense } from 'react'
import KnotLoader from '@/components/ui/KnotLoader'
import ResetPasswordClient from './ResetPasswordClient'

// Recovery flow depends on the runtime Supabase session/env — never prerender it,
// so a missing build-time env can't crash `next build` on this route.
export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen w-full items-center justify-center bg-bg">
        <KnotLoader />
      </main>
    }>
      <ResetPasswordClient />
    </Suspense>
  )
}
