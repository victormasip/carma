'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, FileText, Globe } from 'lucide-react'
import { useT } from '@/lib/i18n/LocaleProvider'

type Site = { id: string; name: string }

export default function SidebarNav({ isSuperAdmin, sites }: { isSuperAdmin: boolean; sites: Site[] }) {
  const pathname = usePathname()
  const t = useT()

  const isHome = pathname === '/dashboard'
  const isSettings = pathname === '/dashboard/settings'

  return (
    <nav className="flex-1 py-8 px-4 overflow-y-auto">
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
        {isSuperAdmin ? t('nav.allSites') : t('nav.mySites')}
      </Link>

      {/* Multi-site hub: quick-switch between the sites the user manages. */}
      {sites.length > 0 && (
        <div className="mt-6">
          <p className="px-4 pb-2 text-xs font-bold uppercase tracking-widest text-neutral-300">
            {t('nav.yourSites')}
          </p>
          <div className="space-y-0.5 max-h-[42vh] overflow-y-auto pr-1">
            {sites.map(site => {
              const active = pathname.startsWith(`/dashboard/sites/${site.id}`)
              return (
                <Link
                  key={site.id}
                  href={`/dashboard/sites/${site.id}`}
                  title={site.name}
                  className={`relative flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                    active
                      ? 'text-carma-700 bg-carma-50/50'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
                  }`}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-gradient-to-b from-carma-400 to-carma-600 rounded-r-full" />
                  )}
                  <Globe className={`w-4 h-4 shrink-0 ${active ? 'text-carma-500' : 'text-neutral-300'}`} />
                  <span className="truncate">{site.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-neutral-100/70">
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-xl transition-all ${
            isSettings
              ? 'text-carma-700 bg-carma-50/50'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
          }`}
        >
          <Settings className={`w-5 h-5 ${isSettings ? 'text-carma-500' : ''}`} />
          {t('nav.settings')}
        </Link>
      </div>
    </nav>
  )
}
