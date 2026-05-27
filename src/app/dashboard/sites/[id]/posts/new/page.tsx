import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'
import { getSiteLocaleConfig } from '@/lib/actions/locales'

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: siteId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isSuperAdmin = profile?.role === 'superadmin'

  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .single()

  if (!site) redirect('/dashboard')

  const localeConfig = await getSiteLocaleConfig(siteId)

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
