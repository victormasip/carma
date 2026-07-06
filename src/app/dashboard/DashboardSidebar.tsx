'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import SidebarNav from './SidebarNav'
import UserMenu from './UserMenu'
import KarmaWidget, { type KarmaWidgetData } from './KarmaWidget'
import Wordmark from '@/components/ui/Wordmark'
import { useT } from '@/lib/i18n/LocaleProvider'
import type { SwitcherSite } from './SiteSwitcher'
import type { KarmaPlan } from '@/lib/karma/config'

type Site = SwitcherSite

export default function DashboardSidebar({
  isSuperAdmin,
  sites,
  userEmail,
  karma,
  plan = 'free',
}: {
  isSuperAdmin: boolean
  sites: Site[]
  userEmail: string
  karma: KarmaWidgetData
  plan?: KarmaPlan
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const t = useT()

  // Close the mobile drawer on route change (render-time, not useEffect).
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const inner = (
    <>
      <div className="h-16 flex items-center px-5 border-b border-border">
        <Link href="/dashboard" className="text-text no-underline">
          <Wordmark size="text-2xl" spin />
        </Link>
      </div>

      <SidebarNav isSuperAdmin={isSuperAdmin} sites={sites} plan={plan} />

      <div className="px-3 pb-2">
        <KarmaWidget karma={karma} />
      </div>

      <div className="p-3 border-t border-border">
        <UserMenu userEmail={userEmail} isSuperAdmin={isSuperAdmin} />
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 bg-bg-elevated border-r border-border flex-col fixed h-full z-10">
        {inner}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 h-14 bg-bg-elevated/95 backdrop-blur border-b border-border flex items-center justify-between px-4">
        <Link href="/dashboard" className="text-text no-underline">
          <Wordmark size="text-xl" spin />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('nav.openMenu')}
          className="cursor-pointer w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-bg-elevated flex flex-col shadow-premium animate-in slide-in-from-left duration-300">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('nav.closeMenu')}
              className="cursor-pointer absolute top-3.5 right-3.5 w-8 h-8 flex items-center justify-center rounded-lg text-subtle hover:bg-surface-hover hover:text-text transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            {inner}
          </aside>
        </div>
      )}
    </>
  )
}
