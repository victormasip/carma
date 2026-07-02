import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
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

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  // Superadmins may edit any site; everyone else must be an assigned member of
  // THIS site (same policy as userCanWriteSite, minus the duplicate role fetch).
  if (!isSuperAdmin) {
    const { data: member } = await supabase
      .from('site_users').select('site_id').eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!member) redirect('/dashboard')
  }

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
