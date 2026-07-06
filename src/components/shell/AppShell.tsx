import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { getKarma } from '@/lib/karma/karma'
import { LocaleProvider } from '@/lib/i18n/LocaleProvider'
import { getLocale } from '@/lib/i18n/locale-server'
import DashboardSidebar from '@/app/dashboard/DashboardSidebar'
import type { SwitcherSite } from '@/app/dashboard/SiteSwitcher'

/**
 * L'ÚNIC shell de l'app autenticada — /dashboard i /admin el comparteixen
 * (founder 2026-07-06: els dos sidebars s'havien desviat visualment; amb un
 * sol component ja no PODEN divergir). Fa el gate d'autenticació (i de
 * superadmin quan toca), resol locale + saldo de karma + llocs en paral·lel i
 * pinta sidebar + main. Les pàgines només posen contingut.
 */
export default async function AppShell({
  children,
  requireSuperAdmin = false,
}: {
  children: React.ReactNode
  requireSuperAdmin?: boolean
}) {
  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  if (requireSuperAdmin && !isSuperAdmin) redirect('/dashboard')

  // Llocs per al switcher: superadmins tots (admin client), clients els seus
  // (RLS). 42703-safe: subdomain (021) i logo_url (022) poden no existir.
  const fetchSites = async (): Promise<SwitcherSite[]> => {
    const sel = (cols: string) =>
      isSuperAdmin
        ? createAdminClient().from('sites').select(cols).order('created_at', { ascending: false }).limit(200)
        : supabase.from('sites').select(cols).order('name')
    let res = await sel('id, name, subdomain, logo_url')
    if (res.error?.code === '42703') res = await sel('id, name')
    return (res.data ?? []) as unknown as SwitcherSite[]
  }

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
