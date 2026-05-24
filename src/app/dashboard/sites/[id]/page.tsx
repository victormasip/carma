import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import SiteDetailClient from './SiteDetailClient'

export default async function SiteDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ id: siteId }, { tab: qTab }] = await Promise.all([params, searchParams])

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isSuperAdmin = profile?.role === 'superadmin'

  const { data: site, error: siteError } = await (isSuperAdmin ? admin : supabase)
    .from('sites')
    .select('id, name, api_key, created_at')
    .eq('id', siteId)
    .single()

  if (siteError || !site) redirect('/dashboard')

  // Fetch all tab data in parallel — enables instant client-side tab switching
  const [{ data: postsData }, suResult, clientsResult, themeResult] = await Promise.all([
    admin
      .from('posts')
      .select('id, title, slug, is_published, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false }),
    isSuperAdmin
      ? admin.from('site_users').select('user_id, profiles!inner(email)').eq('site_id', siteId)
      : Promise.resolve({ data: null }),
    isSuperAdmin
      ? admin.from('profiles').select('id, email').eq('role', 'client').order('email')
      : Promise.resolve({ data: null }),
    isSuperAdmin
      ? admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const posts = (postsData ?? []) as { id: string; title: string; slug: string; is_published: boolean; created_at: string }[]

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

  const validTabs = ['articles', ...(isSuperAdmin ? ['tema', 'connexio', 'usuaris'] : [])]
  const defaultTab = typeof qTab === 'string' && validTabs.includes(qTab)
    ? (qTab as 'articles' | 'tema' | 'connexio' | 'usuaris')
    : 'articles'

  return (
    <SiteDetailClient
      siteId={siteId}
      siteName={site.name}
      siteCreatedAt={site.created_at}
      apiKey={site.api_key}
      isSuperAdmin={isSuperAdmin}
      initialPosts={posts}
      assignedUsers={assignedUsers}
      availableClients={availableClients}
      initialTheme={themeResult.data ?? null}
      defaultTab={defaultTab}
    />
  )
}
