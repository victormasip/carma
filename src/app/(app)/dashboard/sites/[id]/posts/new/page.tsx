import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'
import { getSiteLocaleConfig } from '@/lib/actions/locales'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKarma } from '@/lib/karma/karma'
import { resolveRenderTheme } from '@/lib/render/blogRender'
import { BLANK_POST, buildCanvasSpec } from '@/lib/render/canvas'

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: siteId } = await params

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  const admin = createAdminClient()
  const [{ data: site }, localeConfig, karma, theme] = await Promise.all([
    supabase.from('sites').select('id, name, subdomain').eq('id', siteId).single(),
    getSiteLocaleConfig(siteId),
    // Fase 2: prices are shown before the button is pressed, not after.
    getKarma(user.id, admin),
    // W7: the article is written on the blog's own page — the render's theme.
    resolveRenderTheme(admin, siteId),
  ])

  if (!site) redirect('/dashboard')

  return (
    <PostEditorClient
      siteId={siteId}
      siteName={site.name}
      subdomain={(site as { subdomain?: string | null }).subdomain ?? null}
      siteLocales={localeConfig.locales}
      siteDefaultLocale={localeConfig.defaultLocale}
      canvasSpec={buildCanvasSpec(theme, siteId, BLANK_POST, localeConfig.defaultLocale)}
      canTranslate={isSuperAdmin}
      karma={{ balance: karma.balance, available: karma.available, superadmin: karma.superadmin || isSuperAdmin }}
    />
  )
}
