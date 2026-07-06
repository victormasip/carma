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

  // Sites for the switcher: superadmins see all (admin client), clients see
  // their assigned sites (RLS-scoped). The popover searches client-side, so we
  // can afford a higher cap than the old flat list. 42703-safe: subdomain (021)
  // and logo_url (022) may not exist on an old database.
  const fetchSites = async () => {
    const sel = (cols: string) =>
      isSuperAdmin
        ? createAdminClient().from('sites').select(cols).order('created_at', { ascending: false }).limit(200)
        : supabase.from('sites').select(cols).order('name')
    let res = await sel('id, name, subdomain, logo_url')
    if (res.error?.code === '42703') res = await sel('id, name')
    return (res.data ?? []) as unknown as { id: string; name: string; subdomain?: string | null; logo_url?: string | null }[]
  }

  // Locale (cookie read) + karma balance resolve in the same round trip.
  const [sites, locale, karma] = await Promise.all([
    fetchSites(),
    getLocale(),
    getKarma(user.id),
  ])

  return (
    <LocaleProvider initialLocale={locale}>
      <div className="min-h-screen bg-bg">
        <DashboardSidebar
          isSuperAdmin={isSuperAdmin}
          sites={sites}
          userEmail={user.email ?? ''}
          karma={{ balance: karma.balance, allocation: karma.allocation, superadmin: karma.superadmin || isSuperAdmin, available: karma.available }}
          plan={karma.plan}
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
