import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/lib/auth/actions'
import SidebarNav from './SidebarNav'

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

  return (
    <div className="flex min-h-screen bg-[#F9F8F6]">
      <aside className="w-64 bg-white border-r border-neutral-200/60 flex flex-col fixed h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-24 flex items-center px-8 border-b border-neutral-100/50">
          <Link href="/dashboard">
            <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 font-sans">
              Carma<span className="text-carma-500">.</span>
            </h2>
          </Link>
        </div>

        <SidebarNav isSuperAdmin={isSuperAdmin} />

        <div className="p-4 border-t border-neutral-100/50 mb-2">
          <div className="px-4 py-2 mb-1">
            <p className="text-xs font-bold text-neutral-400 truncate">{user.email}</p>
            <p className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider mt-0.5">
              {isSuperAdmin ? 'Superadmin' : 'Client'}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              Tancar sessió
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8 md:p-12">
        <div className="max-w-[1400px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
