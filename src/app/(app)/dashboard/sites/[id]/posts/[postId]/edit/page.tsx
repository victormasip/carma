import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'
import { getSiteLocaleConfig } from '@/lib/actions/locales'
import { getKarma } from '@/lib/karma/karma'
import { resolveRenderTheme } from '@/lib/render/blogRender'
import { buildCanvasSpec } from '@/lib/render/canvas'

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>
}) {
  const { id: siteId, postId } = await params

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  const admin = createAdminClient()

  // Three column sets, widest first. Each 42703 retry drops the newest
  // migration's columns: I6's review flag (036), then i18n (008).
  const COLS_CORE = 'id, title, slug, content, excerpt, featured_image, categories, tags, seo_title, seo_description, author_name, is_published, created_at, meta'
  const COLS_I18N = `${COLS_CORE}, i18n, default_locale`
  const COLS_FULL = `${COLS_I18N}, review_requested_at`

  // Site (authz: RLS-scoped for clients), post and locale config are independent
  // given the route params — resolve them in one parallel round trip.
  const [{ data: site }, postRes, localeConfig, karma, theme] = await Promise.all([
    (isSuperAdmin ? admin : supabase).from('sites').select('id, name, subdomain').eq('id', siteId).single(),
    // Prefer the i18n columns, but fall back gracefully if migration 008 hasn't run.
    admin.from('posts').select(COLS_FULL).eq('id', postId).eq('site_id', siteId).single(),
    getSiteLocaleConfig(siteId),
    // Fase 2: every AI control shows its price BEFORE it is pressed, so a refusal
    // is never the first time the owner learns what something costs.
    getKarma(user.id, admin),
    // W7: the article is written on the blog's own page — the render's theme.
    resolveRenderTheme(admin, siteId),
  ])

  if (!site) redirect('/dashboard')

  let post = postRes.data
  if (!post) {
    ;({ data: post } = await admin.from('posts').select(COLS_I18N).eq('id', postId).eq('site_id', siteId).single())
  }
  if (!post) {
    ;({ data: post } = await admin.from('posts').select(COLS_CORE).eq('id', postId).eq('site_id', siteId).single())
  }

  if (!post) redirect(`/dashboard/sites/${siteId}`)

  return (
    <PostEditorClient
      siteId={siteId}
      siteName={site.name}
      subdomain={(site as { subdomain?: string | null }).subdomain ?? null}
      post={post}
      siteLocales={localeConfig.locales}
      siteDefaultLocale={localeConfig.defaultLocale}
      canvasSpec={buildCanvasSpec(theme, siteId, post as unknown as Parameters<typeof buildCanvasSpec>[2], localeConfig.defaultLocale)}
      canTranslate={isSuperAdmin}
      karma={{ balance: karma.balance, available: karma.available, superadmin: karma.superadmin || isSuperAdmin }}
    />
  )
}
