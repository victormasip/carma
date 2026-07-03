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

export default async function EditSitePage({ params, searchParams }: {
  params: Promise<{ siteId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ siteId }, { from }] = await Promise.all([params, searchParams])
  if (!isUuid(siteId)) redirect('/dashboard')

  // Where "Sortir" returns to depends on how the Studio was entered: the
  // sidebar hub, a site's launcher card, or (default) the live render's
  // owner button.
  const exitHref = from === 'studio'
    ? '/dashboard/studio'
    : from === 'site'
      ? `/dashboard/sites/${siteId}`
      : `/render/${siteId}`

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  // Membership check and theme fetch are independent — one round trip, not two.
  // (The theme row is discarded if the membership check bounces; that beats
  // adding ~100ms of Supabase RTT to EVERY legitimate Studio open.)
  const admin = createAdminClient()
  const [memberRes, { data: theme }] = await Promise.all([
    isSuperAdmin
      ? Promise.resolve({ data: { site_id: siteId } })
      : supabase.from('site_users').select('site_id').eq('site_id', siteId).eq('user_id', user.id).maybeSingle(),
    admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle(),
  ])
  // Superadmins may edit any site; everyone else must be an assigned member of
  // THIS site (same policy as userCanWriteSite, minus the duplicate role fetch).
  if (!memberRes.data) redirect('/dashboard')
  const regenCount = (theme as { regen_count?: number } | null)?.regen_count ?? 0
  const defaultLocale = (theme as { default_locale?: string } | null)?.default_locale ?? undefined

  return (
    <FullscreenStudio
      siteId={siteId}
      isSuperAdmin={isSuperAdmin}
      initialTheme={(theme ?? null) as Theme | null}
      defaultLocale={defaultLocale}
      regenCount={regenCount}
      exitHref={exitHref}
    />
  )
}
