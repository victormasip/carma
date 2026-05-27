'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { LogOut, Menu, X } from 'lucide-react'
import SidebarNav from './SidebarNav'
import LocaleSwitcher from './LocaleSwitcher'
import { useT } from '@/lib/i18n/LocaleProvider'
import { signOut } from '@/lib/auth/actions'

type Site = { id: string; name: string }

export default function DashboardSidebar({
  isSuperAdmin,
  sites,
  userEmail,
}: {
  isSuperAdmin: boolean
  sites: Site[]
  userEmail: string
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const t = useT()

  // Close the mobile drawer when the route changes — adjusting state during
  // render (React's recommended alternative to a setState-in-effect).
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const inner = (
    <>
      <div className="h-20 lg:h-24 flex items-center px-7 lg:px-8 border-b border-neutral-100/50">
        <Link href="/dashboard">
          <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 font-sans">
            Carma<span className="text-carma-500">.</span>
          </h2>
        </Link>
      </div>

      <SidebarNav isSuperAdmin={isSuperAdmin} sites={sites} />

      <div className="p-4 border-t border-neutral-100/50 mb-2">
        <div className="px-4 py-2 mb-1">
          <p className="text-xs font-bold text-neutral-400 truncate">{userEmail}</p>
          <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mt-0.5">
            {isSuperAdmin ? t('role.superadmin') : t('role.client')}
          </p>
        </div>
        <LocaleSwitcher />
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            {t('common.signOut')}
          </button>
        </form>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-neutral-200/60 flex-col fixed h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        {inner}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 h-14 bg-white/90 backdrop-blur border-b border-neutral-100 flex items-center justify-between px-4">
        <Link href="/dashboard">
          <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900">
            Carma<span className="text-carma-500">.</span>
          </h2>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('nav.openMenu')}
          className="cursor-pointer w-10 h-10 flex items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('nav.closeMenu')}
              className="cursor-pointer absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            {inner}
          </aside>
        </div>
      )}
    </>
  )
}
