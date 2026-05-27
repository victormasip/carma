import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'
import { getSiteLocaleConfig } from '@/lib/actions/locales'

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>
}) {
  const { id: siteId, postId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.role === 'superadmin'
  const admin = createAdminClient()

  const { data: site } = await (isSuperAdmin ? admin : supabase)
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .single()

  if (!site) redirect('/dashboard')

  const COLS_I18N = 'id, title, slug, content, excerpt, featured_image, categories, tags, seo_title, seo_description, author_name, is_published, created_at, meta, i18n, default_locale'
  const COLS_BASE = 'id, title, slug, content, excerpt, featured_image, categories, tags, seo_title, seo_description, author_name, is_published, created_at, meta'

  // Prefer the i18n columns, but fall back gracefully if migration 008 hasn't run.
  let { data: post } = await admin.from('posts').select(COLS_I18N).eq('id', postId).eq('site_id', siteId).single()
  if (!post) {
    ;({ data: post } = await admin.from('posts').select(COLS_BASE).eq('id', postId).eq('site_id', siteId).single())
  }

  if (!post) redirect(`/dashboard/sites/${siteId}`)

  const localeConfig = await getSiteLocaleConfig(siteId)

  return (
    <PostEditorClient
      siteId={siteId}
      siteName={site.name}
      post={post}
      siteLocales={localeConfig.locales}
      siteDefaultLocale={localeConfig.defaultLocale}
      canTranslate={isSuperAdmin}
    />
  )
}
