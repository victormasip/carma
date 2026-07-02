import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'
import { getSiteLocaleConfig } from '@/lib/actions/locales'

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: siteId } = await params

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  const [{ data: site }, localeConfig] = await Promise.all([
    supabase.from('sites').select('id, name').eq('id', siteId).single(),
    getSiteLocaleConfig(siteId),
  ])

  if (!site) redirect('/dashboard')

  return (
    <PostEditorClient
      siteId={siteId}
      siteName={site.name}
      siteLocales={localeConfig.locales}
      siteDefaultLocale={localeConfig.defaultLocale}
      canTranslate={isSuperAdmin}
    />
  )
}
