import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Request-scoped session: the signed-in user + their role, resolved ONCE per
 * server render no matter how many layouts/pages ask for it.
 *
 * Layout and page render in the same request, and each used to run its own
 * `auth.getUser()` + `profiles.select('role')` round trip — 4 sequential
 * Supabase calls per dashboard navigation. `React.cache` memoizes the resolved
 * value for the duration of the request, halving that. (Outside an RSC render —
 * route handlers — `cache` degrades to a plain call, so this stays safe there.)
 */
export const getSession = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, isSuperAdmin: false as boolean }

  // maybeSingle: a missing/RLS-blocked profile row means "not a superadmin",
  // never a thrown error that would mask the page behind an error boundary.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, isSuperAdmin: profile?.role === 'superadmin' }
})
