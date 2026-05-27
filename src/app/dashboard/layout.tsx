import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LocaleProvider } from '@/lib/i18n/LocaleProvider'
import { getLocale } from '@/lib/i18n/locale-server'
import DashboardSidebar from './DashboardSidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.role === 'superadmin'

  // Sites for the left-hand hub: superadmins see all (admin client), clients see
  // their assigned sites (RLS-scoped). Capped so the sidebar stays compact.
  const { data: sitesData } = isSuperAdmin
    ? await createAdminClient().from('sites').select('id, name').order('created_at', { ascending: false }).limit(40)
    : await supabase.from('sites').select('id, name').order('name')
  const sites = (sitesData ?? []) as { id: string; name: string }[]
  const locale = await getLocale()

  return (
    <LocaleProvider initialLocale={locale}>
      <div className="min-h-screen bg-[#F9F8F6]">
        <DashboardSidebar isSuperAdmin={isSuperAdmin} sites={sites} userEmail={user.email ?? ''} />

        <main className="lg:ml-64 min-w-0 p-5 sm:p-8 md:p-12">
          <div className="max-w-[1400px] mx-auto w-full min-w-0">
            {children}
          </div>
        </main>
      </div>
    </LocaleProvider>
  )
}
