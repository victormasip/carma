'use server'

// W1 — a tab of the site page, loaded when it is opened (see lib/dashboard/siteTabs.ts).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteTab, loadSiteTab, type SiteTab, type SiteTabData } from '@/lib/dashboard/siteTabs'

/**
 * The data of one tab of one site, for a superadmin or a member of that site.
 * Throws on refusal: the tab's error boundary shows it, nothing else breaks.
 */
export async function loadSiteTabAction(siteId: string, tab: SiteTab): Promise<SiteTabData> {
  if (!isSiteTab(tab)) throw new Error('Pestanya desconeguda')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isSuperAdmin = profile?.role === 'superadmin'
  const admin = createAdminClient()
  if (!isSuperAdmin) {
    const { data: membership } = await admin
      .from('site_users').select('user_id').eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }
  return loadSiteTab(admin, { siteId, isSuperAdmin, userId: user.id }, tab)
}
