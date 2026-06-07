'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureUniqueSubdomain } from '@/lib/sites/subdomain'
import { revalidatePath } from 'next/cache'

type ActionResult = { error?: string; id?: string }

/**
 * Self-serve site creation for a freshly-registered (non-superadmin) user.
 *
 * RLS blocks `client` accounts from inserting into `sites`, so this runs through
 * the service-role admin client — but it is strictly gated on the *currently
 * authenticated* user and only ever links the new site to that same user. There
 * is no path here to touch another account's data.
 */
export async function createOwnSite(name: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticat' }

    const admin = createAdminClient()
    const trimmed = name.trim() || 'El meu blog'

    const subdomain = await ensureUniqueSubdomain(admin, trimmed)
    const { data: site, error } = await admin
      .from('sites')
      .insert({ name: trimmed, ...(subdomain ? { subdomain } : {}) })
      .select('id')
      .single()

    if (error || !site) return { error: error?.message ?? 'No s’ha pogut crear el lloc' }

    const { error: linkError } = await admin
      .from('site_users')
      .insert({ site_id: site.id, user_id: user.id })

    if (linkError) {
      // Roll back the orphaned site so a retry doesn't pile up empty sites.
      await admin.from('sites').delete().eq('id', site.id)
      return { error: linkError.message }
    }

    revalidatePath('/dashboard')
    return { id: site.id as string }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
