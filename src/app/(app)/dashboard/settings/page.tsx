import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import SettingsClient, { type ShowcaseSite } from './SettingsClient'

// Per-user, never prerendered.

export const metadata = { title: 'Configuració · Carma' }

const UNDEFINED_COLUMN = '42703'

/**
 * The owner's blogs, with everything the Aparador card needs to be HONEST about
 * each one: has it got a public address, has it got anything published, and is
 * it already on the wall.
 *
 * Without the last two the toggle would be a small lie — a blog can be opted in
 * and still not appear, because the wall also requires a subdomain and at least
 * one published article. Better to say so next to the switch than to let someone
 * wonder for a week why they are not on the front page.
 */
async function showcaseSites(userId: string): Promise<{ sites: ShowcaseSite[]; available: boolean }> {
  const admin = createAdminClient()

  let ids: string[] = []
  try {
    const { data } = await admin.from('site_users').select('site_id').eq('user_id', userId)
    ids = (data ?? []).map(r => String(r.site_id))
  } catch { return { sites: [], available: true } }
  if (!ids.length) return { sites: [], available: true }

  // `showcase` only exists after migration 038 — before it, the card explains
  // itself instead of the page failing to load.
  let available = true
  let rows: { id: string; name: string; subdomain: string | null; showcase: boolean }[] = []
  try {
    let res = await admin.from('sites').select('id, name, subdomain, showcase').in('id', ids)
    if (res.error?.code === UNDEFINED_COLUMN) {
      available = false
      res = await admin.from('sites').select('id, name, subdomain').in('id', ids) as typeof res
    }
    rows = (res.data ?? []).map(r => ({
      id: String(r.id),
      name: String(r.name ?? '').trim(),
      subdomain: (r as { subdomain?: string | null }).subdomain ?? null,
      showcase: (r as { showcase?: boolean }).showcase === true,
    }))
  } catch { return { sites: [], available } }

  // Published counts — one read for every blog.
  const published = new Map<string, number>()
  try {
    const { data } = await admin
      .from('posts').select('site_id').in('site_id', ids).eq('is_published', true).limit(2000)
    for (const r of data ?? []) {
      const k = String(r.site_id)
      published.set(k, (published.get(k) ?? 0) + 1)
    }
  } catch { /* counts are a nicety; the toggle still works */ }

  return {
    available,
    sites: rows
      .filter(r => r.name)
      .map(r => ({
        id: r.id,
        name: r.name,
        showcase: r.showcase,
        hasAddress: !!r.subdomain,
        publishedPosts: published.get(r.id) ?? 0,
      }))
      .sort((a, b) => b.publishedPosts - a.publishedPosts || a.name.localeCompare(b.name)),
  }
}

export default async function SettingsPage() {
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  const displayName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''

  // The town (migration 036). 42703-safe: before the migration the field renders
  // empty and saving explains why, rather than the page failing to load.
  let town = ''
  const { data: profile } = await createAdminClient()
    .from('profiles').select('town').eq('id', user.id).maybeSingle()
  if (typeof (profile as { town?: string | null } | null)?.town === 'string') {
    town = (profile as { town: string }).town
  }

  const showcase = await showcaseSites(user.id)

  return (
    <SettingsClient
      email={user.email ?? ''}
      displayName={displayName}
      town={town}
      isSuperAdmin={isSuperAdmin}
      showcaseSites={showcase.sites}
      showcaseAvailable={showcase.available}
    />
  )
}
