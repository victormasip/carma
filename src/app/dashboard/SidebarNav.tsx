'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, FileText, Globe, Wand2, MessageCircle } from 'lucide-react'
import { useT } from '@/lib/i18n/LocaleProvider'
import { cn } from '@/lib/cn'

type Site = { id: string; name: string }

export default function SidebarNav({ isSuperAdmin, sites }: { isSuperAdmin: boolean; sites: Site[] }) {
  const pathname = usePathname()
  const t = useT()

  const isHome = pathname === '/dashboard'
  const isSettings = pathname === '/dashboard/settings'

  return (
    <nav className="flex-1 py-5 px-3 overflow-y-auto">
      <NavItem
        href="/dashboard"
        active={isHome}
        icon={isSuperAdmin ? <LayoutDashboard className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        label={isSuperAdmin ? t('nav.allSites') : t('nav.mySites')}
      />
      <NavItem
        href="/dashboard/agent"
        active={pathname.startsWith('/dashboard/agent')}
        icon={<MessageCircle className="w-4 h-4" />}
        label={t('nav.agent')}
        badge="IA"
      />

      {sites.length > 0 && (
        <div className="mt-6">
          <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
            {t('nav.yourSites')}
          </p>
          <div className="space-y-0.5 max-h-[42vh] overflow-y-auto pr-1">
            {sites.map(site => {
              const active = pathname.startsWith(`/dashboard/sites/${site.id}`)
              return (
                <NavItem
                  key={site.id}
                  href={`/dashboard/sites/${site.id}`}
                  active={active}
                  icon={<Globe className="w-4 h-4" />}
                  label={site.name}
                  title={site.name}
                  truncate
                />
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-border space-y-0.5">
        {isSuperAdmin && (
          <NavItem
            href="/admin/grabber-lab"
            active={pathname.startsWith('/admin/grabber-lab')}
            icon={<Wand2 className="w-4 h-4" />}
            label="Grabber Lab"
          />
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
