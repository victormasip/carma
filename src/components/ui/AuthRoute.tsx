import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import AuthPanel from '@/components/ui/AuthPanel'
import KnotLoader from '@/components/ui/KnotLoader'
import { createClient } from '@/lib/supabase/server'
import { authNextFor, readerFor, type AuthMode } from '@/lib/auth/next'

export type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * THE SESSION CHECK, WHERE IT BELONGS.
 *
 * Both auth pages used to mount, render a full-screen loader, ask the browser
 * Supabase SDK whether a session existed, and only then paint the form. Moving
 * that call to a Server Action removed 61.6KB of SDK — and would have replaced a
 * local cookie read with a POST round trip, so the form would have arrived LATER
 * for the logged-out visitor, who is almost everyone on this page.
 *
 * Fewer bytes and a slower form is not a win. So the check happens here instead,
 * during the server render that was going to happen anyway: a signed-in visitor
 * is redirected before any form exists, and everyone else gets the form in the
 * first response with no loader and no round trip at all.
 */
export default function AuthRoute({ mode, searchParams }: { mode: AuthMode; searchParams: AuthSearchParams }) {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-bg"><KnotLoader /></main>}>
      <Gate mode={mode} searchParams={searchParams} />
    </Suspense>
  )
}

async function Gate({ mode, searchParams }: { mode: AuthMode; searchParams: AuthSearchParams }) {
  const params = await searchParams
  let signedIn = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    signedIn = !!user
  } catch {
    // A missing/invalid env must never crash the front door — show the form.
  }
  if (signedIn) redirect(authNextFor(mode, readerFor(params)))
  return <AuthPanel initialMode={mode} />
}
