'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, FileText } from 'lucide-react'

export default function SidebarNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname()

  const isHome = pathname === '/dashboard' || (isSuperAdmin ? false : pathname.startsWith('/dashboard/sites/'))
  const isSettings = pathname === '/dashboard/settings'

  return (
    <nav className="flex-1 py-8 px-4 space-y-2">
      <Link
        href="/dashboard"
        className={`relative flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all group overflow-hidden ${
          isHome
            ? 'text-carma-700 bg-carma-50/50'
            : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
        }`}
      >
        {isHome && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-gradient-to-b from-carma-400 to-carma-600 rounded-r-full" />
        )}
        {isSuperAdmin ? (
          <LayoutDashboard className={`w-5 h-5 ${isHome ? 'text-carma-500 drop-shadow-sm' : ''}`} />
        ) : (
          <FileText className={`w-5 h-5 ${isHome ? 'text-carma-500 drop-shadow-sm' : ''}`} />
        )}
        {isSuperAdmin ? 'Tots els Llocs' : 'Els meus Llocs'}
      </Link>

      <Link
        href="/dashboard/settings"
        className={`flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all ${
          isSettings
            ? 'text-carma-700 bg-carma-50/50'
            : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
        }`}
      >
        <Settings className={`w-5 h-5 ${isSettings ? 'text-carma-500' : ''}`} />
        Configuració
      </Link>
    </nav>
  )
}
