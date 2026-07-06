'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, Wand2, MessageCircle, Palette, Sparkles, Users } from 'lucide-react'
import { useT } from '@/lib/i18n/LocaleProvider'
import { cn } from '@/lib/cn'
import SiteSwitcher, { type SwitcherSite } from './SiteSwitcher'
import type { KarmaPlan } from '@/lib/karma/config'

type Site = SwitcherSite

export default function SidebarNav({ isSuperAdmin, sites, plan = 'free' }: { isSuperAdmin: boolean; sites: Site[]; plan?: KarmaPlan }) {
  const pathname = usePathname()
  const t = useT()

  const isHome = pathname === '/dashboard'
  const isSettings = pathname === '/dashboard/settings'

  return (
    <nav className="flex-1 py-5 px-3 overflow-y-auto">
      {/* "Inici", no "Tots els Llocs": el nom del menú xocava amb el selector
          de llocs de sota i semblaven la mateixa cosa (founder 2026-07-06). */}
      <NavItem
        href="/dashboard"
        active={isHome}
        icon={<LayoutDashboard className="w-4 h-4" />}
        label={t('nav.home')}
      />
      <NavItem
        href="/dashboard/agent"
        active={pathname.startsWith('/dashboard/agent')}
        icon={<MessageCircle className="w-4 h-4" />}
        label={t('nav.agent')}
        badge="IA"
      />
      <NavItem
        // With a single site the hub would just redirect — link STRAIGHT to the
        // fullscreen Studio (from=home: "Sortir" must return to the dashboard,
        // never to the hub, which would bounce a single-site user right back in).
        href={sites.length === 1 ? `/edit/${sites[0].id}?from=home` : '/dashboard/studio'}
        active={pathname.startsWith('/dashboard/studio')}
        icon={<Palette className="w-4 h-4" />}
        label={t('nav.studio')}
      />
      <NavItem
        href="/dashboard/karma"
        active={pathname.startsWith('/dashboard/karma')}
        icon={<Sparkles className="w-4 h-4" />}
        label={t('nav.karma')}
      />

      {/* Selector de llocs (popover amb cerca) — la llista plana que creixia
          amb cada lloc clonat va morir aquí; una agència amb 60 llocs veu el
          mateix sidebar que un client amb 1. Sense capçalera pròpia: el
          disparador ja s'explica sol ("Tria un lloc…" + recompte). */}
      {sites.length > 0 && (
        <div className="mt-6">
          <SiteSwitcher sites={sites} isSuperAdmin={isSuperAdmin} plan={plan} />
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-border space-y-0.5">
        {isSuperAdmin && (
          <>
            <NavItem
              href="/admin/users"
              active={pathname.startsWith('/admin/users')}
              icon={<Users className="w-4 h-4" />}
              label="Usuaris"
            />
            <NavItem
              href="/admin/grabber-lab"
              active={pathname.startsWith('/admin/grabber-lab')}
              icon={<Wand2 className="w-4 h-4" />}
              label="Grabber Lab"
            />
          </>
        )}
        <NavItem
          href="/dashboard/settings"
          active={isSettings}
          icon={<Settings className="w-4 h-4" />}
          label={t('nav.settings')}
        />
      </div>
    </nav>
  )
}

function NavItem({
  href,
  active,
  icon,
  label,
  title,
  truncate,
  badge,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  label: string
  title?: string
  truncate?: boolean
  badge?: string
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
        active
          ? 'bg-accent-soft text-accent font-semibold'
          : 'text-muted hover:text-text hover:bg-surface-hover font-medium',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-accent' : 'text-subtle')}>{icon}</span>
      <span className={cn('flex-1', truncate && 'truncate min-w-0')}>{label}</span>
      {badge && (
        <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wider text-accent">
          {badge}
        </span>
      )}
    </Link>
  )
}
