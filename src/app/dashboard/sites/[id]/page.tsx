import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import SiteDetailClient from './SiteDetailClient'
import { listPosts } from '@/lib/actions/posts'
import { fetchSiteStats } from '@/lib/analytics/read'

export default async function SiteDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ id: siteId }, { tab: qTab, clone: qClone }] = await Promise.all([params, searchParams])
  const autoCloneUrl = typeof qClone === 'string' && qClone ? qClone : undefined

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  const admin = createAdminClient()

  // Select the site, including `subdomain` (migration 021). 42703-safe: if the
  // column isn't present yet we retry without it so the page still renders.
  const siteSel = (cols: string) =>
    (isSuperAdmin ? admin : supabase).from('sites').select(cols).eq('id', siteId).single()
  let { data: site, error: siteError } = await siteSel('id, name, api_key, created_at, subdomain')
  if (siteError?.code === '42703') {
    ;({ data: site, error: siteError } = await siteSel('id, name, api_key, created_at'))
  }

  if (siteError || !site) redirect('/dashboard')
  const siteRow = site as unknown as { id: string; name: string; api_key: string; created_at: string; subdomain?: string | null }

  // Fetch all tab data in parallel — enables instant client-side tab switching.
  // Posts are paginated (first page only) so the full table is never loaded.
  const [postsResult, suResult, clientsResult, themeResult, initialStats] = await Promise.all([
    listPosts(siteId, { page: 1, status: 'all' }),
    isSuperAdmin
      ? admin.from('site_users').select('user_id, profiles!inner(email)').eq('site_id', siteId)
      : Promise.resolve({ data: null }),
    isSuperAdmin
      ? admin.from('profiles').select('id, email').eq('role', 'client').order('email')
      : Promise.resolve({ data: null }),
    // Theme is fetched for everyone: free clients can customize the design of
    // their assigned sites (the Tema tab), only re-capture/delete are gated.
    admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle(),
    // Initial analytics for the Resum section (30 days) — server-rendered so the
    // Overview has data on first paint with no client round-trip.
    fetchSiteStats(admin, siteId, 30),
  ])

  const assignedUsers = isSuperAdmin
    ? (suResult.data ?? []).map((su) => {
        const p = su.profiles as unknown as { email: string } | { email: string }[] | null
        const email = Array.isArray(p) ? p[0]?.email : p?.email
        return { user_id: su.user_id as string, email: email ?? (su.user_id as string) }
      })
    : []

  const availableClients = isSuperAdmin
    ? ((clientsResult.data ?? []) as { id: string; email: string }[])
    : []

  // All tabs are valid deep-link targets for everyone; locked ones render an
  // upsell panel for free clients rather than the real content.
  const validTabs = ['resum', 'articles', 'tema', 'moduls', 'connexio', 'usuaris']
  // No explicit ?tab= opens the FIRST tab (Articles) — the content workspace —
  // not Resum, which now lives after Tema in the IA.
  const defaultTab = typeof qTab === 'string' && validTabs.includes(qTab)
    ? (qTab as 'resum' | 'articles' | 'tema' | 'moduls' | 'connexio' | 'usuaris')
    : 'articles'

  // A pristine site (no theme captured, no posts) gets the onboarding chooser.
  const isNewSite = !themeResult.data && (postsResult.total ?? 0) === 0

  // Freemium theme-regeneration quota (migration 023; select('*') already returns
  // the column when present, so this is 42703-safe — absent → 0 = full quota).
  const regenCount = (themeResult.data as { regen_count?: number } | null)?.regen_count ?? 0

  // Smart Modules config (migration 024; absent column → null = no modules).
  const initialModules = (themeResult.data as { modules?: import('@/lib/modules/registry').SiteModules } | null)?.modules ?? null
  // First published post (newest) for the Modules tab's article preview toggle.
  const previewPostSlug = postsResult.posts.find(p => p.is_published)?.slug

  return (
    <SiteDetailClient
      siteId={siteId}
      siteName={siteRow.name}
      siteCreatedAt={siteRow.created_at}
      apiKey={siteRow.api_key}
      subdomain={siteRow.subdomain ?? undefined}
      isSuperAdmin={isSuperAdmin}
      isNewSite={isNewSite}
      initialPosts={postsResult.posts}
      initialPostsMeta={{
        page: postsResult.page,
        pageCount: postsResult.pageCount,
        filteredCount: postsResult.filteredCount,
        total: postsResult.total,
        published: postsResult.published,
        drafts: postsResult.drafts,
      }}
      assignedUsers={assignedUsers}
      availableClients={availableClients}
      initialTheme={themeResult.data ?? null}
      initialStats={initialStats}
      defaultTab={defaultTab}
      autoCloneUrl={autoCloneUrl}
      siteDefaultLocale={(themeResult.data as { default_locale?: string } | null)?.default_locale ?? undefined}
      regenCount={regenCount}
      initialModules={initialModules}
      previewPostSlug={previewPostSlug}
    />
  )
}
