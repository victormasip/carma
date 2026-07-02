import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { WA_AGENT_NUMBER } from '@/lib/whatsapp/config'
import SettingsClient from './SettingsClient'

// Per-user, never prerendered.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Configuració · Carma' }

export default async function SettingsPage() {
  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  // All reads are RLS-scoped to the signed-in owner (policies in migration 027).
  const [identitiesRes, membershipsRes, scopesRes] = await Promise.all([
    supabase
      .from('wa_identities')
      .select('id, phone_e164, status, verify_code, verify_expires_at, verified_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    // The owner's candidate sites = their site_users memberships (matches the
    // webhook resolver exactly), with the site name embedded.
    supabase.from('site_users').select('site_id, sites(id, name)').eq('user_id', user.id),
    supabase.from('wa_identity_sites').select('identity_id, site_id'),
  ])

  type SiteRow = { id: string; name: string }
  const sites: SiteRow[] = (membershipsRes.data ?? [])
    .map((r) => {
      // supabase-js types the embed as an array; at runtime it's the single
      // related site (site_users.site_id → sites). Handle both shapes.
      const s = (r as { sites: SiteRow | SiteRow[] | null }).sites
      return Array.isArray(s) ? (s[0] ?? null) : s
    })
    .filter((s): s is SiteRow => !!s)
    .sort((a, b) => a.name.localeCompare(b.name))

  const displayName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''

  return (
    <SettingsClient
      email={user.email ?? ''}
      displayName={displayName}
      isSuperAdmin={isSuperAdmin}
      agentNumber={WA_AGENT_NUMBER}
      identities={identitiesRes.data ?? []}
      sites={sites}
      scopes={scopesRes.data ?? []}
    />
  )
}
