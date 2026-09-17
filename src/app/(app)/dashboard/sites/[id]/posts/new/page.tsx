import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'
import { getSiteLocaleConfig } from '@/lib/actions/locales'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKarma } from '@/lib/karma/karma'

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: siteId } = await params

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  const [{ data: site }, localeConfig, karma] = await Promise.all([
    supabase.from('sites').select('id, name, subdomain').eq('id', siteId).single(),
    getSiteLocaleConfig(siteId),
    // Fase 2: prices are shown before the button is pressed, not after.
    getKarma(user.id, createAdminClient()),
  ])

  if (!site) redirect('/dashboard')

  return (
    <PostEditorClient
      siteId={siteId}
      siteName={site.name}
      subdomain={(site as { subdomain?: string | null }).subdomain ?? null}
      siteLocales={localeConfig.locales}
      siteDefaultLocale={localeConfig.defaultLocale}
      canTranslate={isSuperAdmin}
      karma={{ balance: karma.balance, available: karma.available, superadmin: karma.superadmin || isSuperAdmin }}
    />
  )
}
