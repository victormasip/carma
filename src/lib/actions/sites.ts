'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

export async function createSite(name: string, userIds: string[]): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()
    const trimmed = name.trim()
    if (!trimmed) return { error: 'El nom és obligatori' }

    const { data: site, error } = await admin
      .from('sites')
      .insert({ name: trimmed })
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
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function updateSiteName(siteId: string, name: string): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()
    const trimmed = name.trim()
    if (!trimmed) return { error: 'El nom és obligatori' }

    const { error } = await admin.from('sites').update({ name: trimmed }).eq('id', siteId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard')
    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function deleteSite(siteId: string): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()
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
