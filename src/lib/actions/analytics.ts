'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchSiteStats, type SiteStats } from '@/lib/analytics/read'

// Verify the caller may read this site's analytics: superadmin, or a member via
// site_users. Mirrors the rule used by the posts/theme actions.
async function assertSiteAccess(siteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()
  if (profile?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users').select('user_id').eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }
  return admin
}

/** Site analytics (views / unique visitors / daily series / top posts) for the
 *  Overview panel. Access-checked; returns null on auth failure so the UI can
 *  degrade gracefully. */
export async function getSiteStats(
  siteId: string, days = 30,
): Promise<{ stats?: SiteStats; error?: string }> {
  try {
    const admin = await assertSiteAccess(siteId)
    const stats = await fetchSiteStats(admin, siteId, days)
    return { stats }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error carregant les estadístiques' }
  }
}
