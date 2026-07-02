import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'
import { getSiteLocaleConfig } from '@/lib/actions/locales'

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>
}) {
  const { id: siteId, postId } = await params

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  const admin = createAdminClient()

  const COLS_I18N = 'id, title, slug, content, excerpt, featured_image, categories, tags, seo_title, seo_description, author_name, is_published, created_at, meta, i18n, default_locale'
  const COLS_BASE = 'id, title, slug, content, excerpt, featured_image, categories, tags, seo_title, seo_description, author_name, is_published, created_at, meta'

  // Site (authz: RLS-scoped for clients), post and locale config are independent
  // given the route params — resolve them in one parallel round trip.
  const [{ data: site }, postRes, localeConfig] = await Promise.all([
    (isSuperAdmin ? admin : supabase).from('sites').select('id, name').eq('id', siteId).single(),
    // Prefer the i18n columns, but fall back gracefully if migration 008 hasn't run.
    admin.from('posts').select(COLS_I18N).eq('id', postId).eq('site_id', siteId).single(),
    getSiteLocaleConfig(siteId),
  ])

  if (!site) redirect('/dashboard')

  let post = postRes.data
  if (!post) {
    ;({ data: post } = await admin.from('posts').select(COLS_BASE).eq('id', postId).eq('site_id', siteId).single())
  }

  if (!post) redirect(`/dashboard/sites/${siteId}`)

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
