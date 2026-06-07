import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whether `userId` may WRITE to `siteId` — i.e. is a superadmin, or an assigned
 * member of that exact site. Used to gate self-serve writes (article import) so a
 * client can only touch their own sites, never another account's by guessing an id.
 *
 * Both lookups go through the caller's own (RLS-bound) client: `profiles` exposes
 * the user's own row, and `site_users` has a `select_own` policy on user_id, so a
 * non-member simply gets no row back.
 */
export async function userCanWriteSite(
  supabase: SupabaseClient,
  userId: string,
  siteId: string,
): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if (profile?.role === 'superadmin') return true

  const { data } = await supabase
    .from('site_users')
    .select('site_id')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}
