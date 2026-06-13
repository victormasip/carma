'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureUniqueSubdomain } from '@/lib/sites/subdomain'
import { userCanWriteSite } from '@/lib/auth/siteAccess'
import { revalidatePath } from 'next/cache'

type ActionResult = { error?: string }

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'superadmin') throw new Error('Accés denegat')
  return createAdminClient()
}

export async function createSite(name: string, userIds: string[]): Promise<ActionResult & { id?: string }> {
  try {
    const admin = await assertSuperAdmin()
    const trimmed = name.trim()
    if (!trimmed) return { error: 'El nom és obligatori' }

    const subdomain = await ensureUniqueSubdomain(admin, trimmed)
    const { data: site, error } = await admin
      .from('sites')
      .insert({ name: trimmed, ...(subdomain ? { subdomain } : {}) })
      .select('id')
      .single()

    if (error) return { error: error.message }

    if (userIds.length > 0) {
      const { error: assignError } = await admin
        .from('site_users')
        .insert(userIds.map(uid => ({ site_id: site.id, user_id: uid })))
      if (assignError) return { error: assignError.message }
    }

    revalidatePath('/dashboard')
    return { id: site.id as string }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/**
 * Rename a site. Member-gated (not superadmin-only) so a client can rename their
 * OWN assigned blog inline; `userCanWriteSite` scopes it to sites they belong to,
 * and the admin client performs the write past RLS.
 */
export async function updateSiteName(siteId: string, name: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticat' }
    if (!(await userCanWriteSite(supabase, user.id, siteId))) return { error: 'Accés denegat' }

    const trimmed = name.trim()
    if (!trimmed) return { error: 'El nom és obligatori' }

    const admin = createAdminClient()
    const { error } = await admin.from('sites').update({ name: trimmed }).eq('id', siteId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard')
    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/**
 * Set (or clear) a site's brand logo. Member-gated (not superadmin-only) so a
 * self-serve client's own clone can stamp its detected logo. 42703-safe: if the
 * `logo_url` column predates migration 022 we no-op silently.
 */
export async function updateSiteLogo(siteId: string, logoUrl: string | null): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticat' }
    if (!(await userCanWriteSite(supabase, user.id, siteId))) return { error: 'Accés denegat' }

    const admin = createAdminClient()
    const url = (logoUrl ?? '').trim() || null
    const { error } = await admin.from('sites').update({ logo_url: url }).eq('id', siteId)
    if (error) {
      if (error.code === '42703') return {} // pre-022 schema — silent no-op
      return { error: error.message }
    }

    revalidatePath('/dashboard')
    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/**
 * Delete a site and all its content. Member-gated so a client can remove their
 * OWN blog (scoped by `userCanWriteSite` to sites they belong to); superadmins
 * pass the same gate, so the dashboard bulk-delete keeps working. Irreversible —
 * the UI guards it behind a confirmation modal.
 */
export async function deleteSite(siteId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticat' }
    if (!(await userCanWriteSite(supabase, user.id, siteId))) return { error: 'Accés denegat' }

    const admin = createAdminClient()
    const { error } = await admin.from('sites').delete().eq('id', siteId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function assignUserToSite(siteId: string, userId: string): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()
    const { error } = await admin
      .from('site_users')
      .insert({ site_id: siteId, user_id: userId })

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function removeUserFromSite(siteId: string, userId: string): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()
    const { error } = await admin
      .from('site_users')
      .delete()
      .eq('site_id', siteId)
      .eq('user_id', userId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
