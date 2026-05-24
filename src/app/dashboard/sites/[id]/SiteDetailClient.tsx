'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Plug, Users, Palette } from 'lucide-react'
import { SiteAdminActions, SiteUsersManager } from './SiteManager'
import ApiDocsCard from './ApiDocsCard'
import PostsManager from './PostsManager'
import ImportModal from './ImportModal'
import ThemeManager, { type Theme } from './ThemeManager'

type Post = { id: string; title: string; slug: string; is_published: boolean; created_at: string }
type AssignedUser = { user_id: string; email: string }
type Client = { id: string; email: string }
type TabKey = 'articles' | 'tema' | 'connexio' | 'usuaris'

type Props = {
  siteId: string
  siteName: string
  siteCreatedAt: string
  apiKey: string
  isSuperAdmin: boolean
  initialPosts: Post[]
  assignedUsers: AssignedUser[]
  availableClients: Client[]
  initialTheme: Theme | null
  defaultTab: TabKey
}

const TABS = [
  { key: 'articles' as TabKey, label: 'Articles', icon: FileText },
  { key: 'tema'     as TabKey, label: 'Tema',     icon: Palette,  adminOnly: true },
  { key: 'connexio' as TabKey, label: 'Connexió', icon: Plug,     adminOnly: true },
  { key: 'usuaris'  as TabKey, label: 'Usuaris',  icon: Users,    adminOnly: true },
]

export default function SiteDetailClient({
  siteId, siteName, siteCreatedAt, apiKey,
  isSuperAdmin, initialPosts, assignedUsers, availableClients, initialTheme,
  defaultTab,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)
  const [showImport, setShowImport] = useState(false)

  // Resync the active tab when the server-provided defaultTab changes (e.g.
  // navigating via a <Link> to ?tab=connexio). Adjusting state during render
  // is React's recommended alternative to a setState-in-effect.
  const [syncedDefault, setSyncedDefault] = useState(defaultTab)
  if (defaultTab !== syncedDefault) {
    setSyncedDefault(defaultTab)
    setActiveTab(defaultTab)
  }

  const visibleTabs = TABS.filter(t => !t.adminOnly || isSuperAdmin)

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab)
    const url = tab === 'articles'
      ? `/dashboard/sites/${siteId}`
      : `/dashboard/sites/${siteId}?tab=${tab}`
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {isSuperAdmin && (
            <Link
              href="/dashboard"
              className="w-10 h-10 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50 transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}
          <div>
            <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">{siteName}</h1>
            <p className="text-sm text-neutral-500 font-medium mt-1">
              Creat el {new Date(siteCreatedAt).toLocaleDateString('ca-ES')}
            </p>
          </div>
        </div>
        {isSuperAdmin && <SiteAdminActions siteId={siteId} siteName={siteName} />}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 p-1 rounded-2xl w-fit">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`cursor-pointer flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === key
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'articles' && (
        <PostsManager
          siteId={siteId}
          siteName={siteName}
          initialPosts={initialPosts}
          isSuperAdmin={isSuperAdmin}
          onImport={isSuperAdmin ? () => setShowImport(true) : undefined}
        />
      )}

      {activeTab === 'tema' && isSuperAdmin && (
        <ThemeManager siteId={siteId} initialTheme={initialTheme} />
      )}

      {activeTab === 'connexio' && isSuperAdmin && (
        <ApiDocsCard
          apiKey={apiKey}
          siteId={siteId}
          detectedFramework={initialTheme?.detected_framework ?? null}
          detectedHosting={initialTheme?.detected_hosting ?? null}
          themeConfigured={!!initialTheme?.extracted_head || !!initialTheme?.extracted_header}
        />
      )}

      {activeTab === 'usuaris' && isSuperAdmin && (
        <SiteUsersManager
          siteId={siteId}
          assignedUsers={assignedUsers}
          availableClients={availableClients}
        />
      )}

      {showImport && (
        <ImportModal siteId={siteId} onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}
