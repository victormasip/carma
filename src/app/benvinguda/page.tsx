import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createOwnSite } from '@/lib/actions/onboarding'
import { siteNameFromUrl } from '@/lib/onboarding/url'

/**
 * Provisioning hub — the single landing point after self-serve signup (email
 * confirmation OR OAuth) AND after "unlock" from the preview. It ensures the user
 * owns the right site, then hands off to that site's onboarding (which, with a
 * clone URL present, auto-fires the Magic Wand + import).
 *
 * Tier model: free (role `client`) = exactly ONE site; Premium (superadmin today)
 * = many. So a clone NEVER duplicates a free user's blog — if they already have a
 * site we send them to it (adding another blog is a Premium action surfaced on the
 * dashboard). Only the first site, or a Premium user, gets a fresh provision. This
 * fixes the "same web shows up twice" bug from re-entering the funnel.
 */
export default async function BenvingudaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { url: qUrl } = await searchParams
  const cloneUrl = typeof qUrl === 'string' && qUrl ? qUrl : undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(cloneUrl ? `/registre?url=${encodeURIComponent(cloneUrl)}` : '/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isPremium = profile?.role === 'superadmin' // free = client; Premium = superadmin (current model)

  // The user's own sites (RLS-scoped → only theirs), oldest first.
  const { data: ownSites } = await supabase
    .from('sites').select('id').order('created_at', { ascending: true })
  const existingId = ownSites?.[0]?.id as string | undefined

  let siteId: string | undefined

  if (cloneUrl) {
    // Free user who already has a blog → never create a duplicate; take them to
    // their existing site (a second blog is Premium).
    if (existingId && !isPremium) redirect(`/dashboard/sites/${existingId}`)
    // First blog (or a Premium user) → fresh provision + onboarding.
    const result = await createOwnSite(siteNameFromUrl(cloneUrl))
    if (result.error || !result.id) redirect('/dashboard')
    siteId = result.id
  } else {
    // Generic entry: reuse an existing site, else create a blank one.
    siteId = existingId
    if (!siteId) {
      const result = await createOwnSite('El meu blog')
      if (result.error || !result.id) redirect('/dashboard')
      siteId = result.id
    }
  }

  const params = new URLSearchParams({ onboarding: '1' })
  if (cloneUrl) params.set('clone', cloneUrl)
  redirect(`/dashboard/sites/${siteId}?${params.toString()}`)
}
