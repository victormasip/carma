import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { userCanWriteSite } from '@/lib/auth/siteAccess'
import { isUuid } from '@/lib/sites/domain'
import type { Theme } from '@/app/dashboard/sites/[id]/ThemeStudioContext'
import FullscreenStudio from './FullscreenStudio'

// Full-screen Studio for a single site — the "Edit this site" target linked from
// the public render. Owner/superadmin only; verified server-side before anything
// loads.
export const dynamic = 'force-dynamic'

export default async function EditSitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  if (!isUuid(siteId)) redirect('/dashboard')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  if (!(await userCanWriteSite(supabase, user.id, siteId))) redirect('/dashboard')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isSuperAdmin = profile?.role === 'superadmin'

  const admin = createAdminClient()
  const { data: theme } = await admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle()
  const regenCount = (theme as { regen_count?: number } | null)?.regen_count ?? 0
  const defaultLocale = (theme as { default_locale?: string } | null)?.default_locale ?? undefined

  return (
    <FullscreenStudio
      siteId={siteId}
      isSuperAdmin={isSuperAdmin}
      initialTheme={(theme ?? null) as Theme | null}
      defaultLocale={defaultLocale}
      regenCount={regenCount}
    />
  )
}
