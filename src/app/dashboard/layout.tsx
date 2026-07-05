import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { getKarma } from '@/lib/karma/karma'
import { LocaleProvider } from '@/lib/i18n/LocaleProvider'
import { getLocale } from '@/lib/i18n/locale-server'
import DashboardSidebar from './DashboardSidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  // Sites for the left-hand hub: superadmins see all (admin client), clients see
  // their assigned sites (RLS-scoped). Capped so the sidebar stays compact.
  // Locale (cookie read) resolves in the same round trip.
  const [{ data: sitesData }, locale, karma] = await Promise.all([
    isSuperAdmin
      ? createAdminClient().from('sites').select('id, name').order('created_at', { ascending: false }).limit(40)
      : supabase.from('sites').select('id, name').order('name'),
    getLocale(),
    getKarma(user.id),
  ])
  const sites = (sitesData ?? []) as { id: string; name: string }[]

  return (
    <LocaleProvider initialLocale={locale}>
      <div className="min-h-screen bg-bg">
        <DashboardSidebar
          isSuperAdmin={isSuperAdmin}
          sites={sites}
          userEmail={user.email ?? ''}
          karma={{ balance: karma.balance, allocation: karma.allocation, superadmin: karma.superadmin || isSuperAdmin, available: karma.available }}
        />

        {/* overflow-x-clip: hard guard against horizontal scroll from any wide
            child (tables, code blocks, long URLs) — clip, not hidden, so
            position:sticky inside keeps working. */}
        <main className="lg:ml-60 min-w-0 overflow-x-clip p-5 sm:p-8 lg:p-10">
          <div className="max-w-[1400px] mx-auto w-full min-w-0">
            {children}
          </div>
        </main>
      </div>
    </LocaleProvider>
  )
}
