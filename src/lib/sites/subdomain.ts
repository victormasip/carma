import type { SupabaseClient } from '@supabase/supabase-js'
import { slugifySubdomain } from './domain'

const UNDEFINED_COLUMN = '42703'

/**
 * Pick a subdomain (from the site name) that's unique among existing sites.
 * Returns undefined if the `subdomain` column doesn't exist yet (pre-migration
 * 021), so callers simply skip setting it and the site still works via
 * `/render/<uuid>`. Must be called with a service-role (admin) client.
 */
export async function ensureUniqueSubdomain(
  admin: SupabaseClient,
  name: string,
): Promise<string | undefined> {
  const base = slugifySubdomain(name)
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await admin
      .from('sites').select('id').eq('subdomain', candidate).maybeSingle()
    if (error?.code === UNDEFINED_COLUMN) return undefined // pre-migration → skip
    if (!data) return candidate
  }
  return `${base}-${Date.now().toString(36).slice(-5)}`
}
