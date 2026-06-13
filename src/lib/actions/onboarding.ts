'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureUniqueSubdomain } from '@/lib/sites/subdomain'
import { siteNameFromUrl } from '@/lib/onboarding/url'
import { revalidatePath } from 'next/cache'

type ActionResult = { error?: string; id?: string; reused?: boolean }

/**
 * Idempotent onboarding-site provisioning for the self-serve funnel.
 *
 * This is invoked ONCE from a client component (BenvingudaClient) after auth —
 * never during a Server-Component GET render — so a prefetched `<Link>` can no
 * longer create a phantom site. It is also idempotent so re-entering the funnel
 * (or a double POST) reuses the right site instead of duplicating it:
 *
 *   • Premium (superadmin): reuse an owned site already cloned from the SAME
 *     `cloneUrl` (`sites.origin_url`); otherwise create a fresh one.
 *   • Free (`client`): exactly ONE site — reuse the existing one if present.
 *
 * RLS blocks `client` accounts from inserting into `sites`, so creation runs
 * through the service-role admin client, but it is strictly gated on the
 * currently-authenticated user and only ever links the new site to that user.
 */
export async function provisionOnboardingSite(cloneUrl?: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticat' }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isPremium = profile?.role === 'superadmin'

    const admin = createAdminClient()
    const origin = cloneUrl?.trim() || null

    // The user's own sites (RLS-scoped → only theirs), oldest first. 42703-safe:
    // sites.origin_url only exists after migration 022.
    type OwnSite = { id: string; origin_url?: string | null }
    let sitesRes = await supabase.from('sites').select('id, origin_url').order('created_at', { ascending: true })
    if (sitesRes.error?.code === '42703') {
      sitesRes = await supabase.from('sites').select('id').order('created_at', { ascending: true }) as typeof sitesRes
    }
    const own = (sitesRes.data ?? []) as unknown as OwnSite[]

    // ── Reuse an existing site (idempotent → no duplicates) ──
    if (origin) {
      const match = own.find(s => (s.origin_url ?? '').trim() === origin)
      if (match) return { id: match.id, reused: true }
    }
    // Free tier is one site: re-entering the funnel must never duplicate it.
    if (!isPremium && own.length > 0) return { id: own[0].id, reused: true }

    // ── Create a fresh site, stamping origin_url for future idempotency ──
    const name = origin ? siteNameFromUrl(origin) : 'El meu blog'
    const subdomain = await ensureUniqueSubdomain(admin, name)
    const insert: Record<string, unknown> = { name, ...(subdomain ? { subdomain } : {}) }
    if (origin) insert.origin_url = origin

    let { data: site, error } = await admin.from('sites').insert(insert).select('id').single()
    if (error?.code === '42703' && origin) {
      // origin_url column missing (pre-022) → retry without it.
      delete insert.origin_url
      ;({ data: site, error } = await admin.from('sites').insert(insert).select('id').single())
    }
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
    return { id: site.id as string, reused: false }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
