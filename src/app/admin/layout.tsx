import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { getKarma } from '@/lib/karma/karma'
import { LocaleProvider } from '@/lib/i18n/LocaleProvider'
import { getLocale } from '@/lib/i18n/locale-server'
import DashboardSidebar from '@/app/dashboard/DashboardSidebar'

// Segment guard for /admin — strictly superadmin. Unauthenticated users are
// already bounced to "/" by the edge middleware; here we additionally redirect
// any authenticated NON-superadmin to their dashboard, so these internal tools
// are never reachable by clients even if they discover the URL.
//
// Shell (founder directive 2026-07-06): /admin pages live INSIDE the same
// dashboard chrome — sidebar, karma widget, site switcher — instead of a bare
// header. Jumping between "Usuaris" and the rest of the app no longer loses
// the navigation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  if (!isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const fetchSites = async () => {
    const sel = (cols: string) =>
      admin.from('sites').select(cols).order('created_at', { ascending: false }).limit(200)
    let res = await sel('id, name, subdomain, logo_url')
    if (res.error?.code === '42703') res = await sel('id, name')
    return (res.data ?? []) as unknown as { id: string; name: string; subdomain?: string | null; logo_url?: string | null }[]
  }

  const [sites, locale, karma] = await Promise.all([
    fetchSites(),
    getLocale(),
    getKarma(user.id, admin),
  ])

  return (
    <LocaleProvider initialLocale={locale}>
      <div className="min-h-screen bg-bg">
        <DashboardSidebar
          isSuperAdmin
          sites={sites}
          userEmail={user.email ?? ''}
          karma={{ balance: karma.balance, allocation: karma.allocation, superadmin: true, available: karma.available }}
          plan={karma.plan}
        />
        <main className="lg:ml-60 min-w-0 overflow-x-clip p-5 sm:p-8 lg:p-10">
          <div className="max-w-[1400px] mx-auto w-full min-w-0">
            {children}
          </div>
        </main>
      </div>
    </LocaleProvider>
  )
}
