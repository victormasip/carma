'use client'

import { useState, lazy, Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Plug, Users, Palette, ExternalLink, Loader2 } from 'lucide-react'
import { SiteAdminActions, SiteUsersManager } from './SiteManager'
import ApiDocsCard from './ApiDocsCard'
import PostsManager from './PostsManager'
import ImportModal from './ImportModal'
import LiveEmbedCard from './LiveEmbedCard'
import { LockBadge, PremiumPanel } from './PremiumGate'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// Code-split the Theme Studio (LLM Magic Wand + visual chrome editor) — heavy
// and only needed on the Tema tab, so it stays out of the dashboard's main bundle.
const ThemeManager = lazy(() => import('./ThemeManager'))
import { ThemeStudioProvider, useThemeStudio, type Theme } from './ThemeStudioContext'
import type { PostsMeta } from './PostsManager'

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
  initialPostsMeta: PostsMeta
  assignedUsers: AssignedUser[]
  availableClients: Client[]
  initialTheme: Theme | null
  defaultTab: TabKey
  siteDefaultLocale?: string
}

const TABS: { key: TabKey; label: string; icon: typeof FileText; premium?: boolean }[] = [
  { key: 'articles', label: 'Articles', icon: FileText },
  { key: 'tema',     label: 'Tema',     icon: Palette },
  { key: 'connexio', label: 'Connexió', icon: Plug,  premium: true },
  { key: 'usuaris',  label: 'Usuaris',  icon: Users, premium: true },
]

export default function SiteDetailClient({
  siteId, siteName, siteCreatedAt, apiKey,
  isSuperAdmin, initialPosts, initialPostsMeta, assignedUsers, availableClients, initialTheme,
  defaultTab, siteDefaultLocale,
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

  // Free clients can edit content + theme; API + user management are premium.
  const isLocked = (tab: typeof TABS[number]) => !isSuperAdmin && !!tab.premium

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/dashboard"
            className="w-10 h-10 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50 transition-all shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight truncate">{siteName}</h1>
              {/* Site actions live top-left, right next to the name. */}
              {isSuperAdmin && <SiteAdminActions siteId={siteId} siteName={siteName} />}
            </div>
            <p className="text-sm text-neutral-500 font-medium mt-1">
              Creat el {new Date(siteCreatedAt).toLocaleDateString('ca-ES')}
            </p>
          </div>
        </div>

        {/* Prominent "Veure lloc" — replaces the old render link. */}
        <a
          href={`/render/${siteId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold shadow-lg shadow-neutral-900/15 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          Veure lloc
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 p-1 rounded-2xl w-fit">
        {TABS.map((tab) => {
          const { key, label, icon: Icon } = tab
          const locked = isLocked(tab)
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              title={locked ? 'Funció Premium' : undefined}
              className={`cursor-pointer flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === key
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {locked && <LockBadge />}
            </button>
          )
        })}
      </div>

      {/* Tab content — everything lives inside the Theme Studio provider so the
          Tema editor and the Connexió embed share one live, real-time state. */}
      <ThemeStudioProvider siteId={siteId} initialTheme={initialTheme} defaultLocale={siteDefaultLocale} canTranslate={isSuperAdmin}>
        {activeTab === 'articles' && (
          <PostsManager
            siteId={siteId}
            siteName={siteName}
            initialPosts={initialPosts}
            initialMeta={initialPostsMeta}
            isSuperAdmin={isSuperAdmin}
            onImport={isSuperAdmin ? () => setShowImport(true) : undefined}
          />
        )}

        {activeTab === 'tema' && (
          <ErrorBoundary label="El Theme Studio ha tingut un error">
            <Suspense fallback={<div className="flex items-center justify-center py-20 text-neutral-400"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
              <ThemeManager isSuperAdmin={isSuperAdmin} />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'connexio' && (
          isSuperAdmin
            ? <ConnexioTab siteId={siteId} apiKey={apiKey} />
            : <PremiumPanel
                feature="Connexió i API"
                description="Connecta el teu blog al teu lloc web amb la nostra API i els embeds en directe. Disponible al pla Premium."
                perks={['Clau d’API privada', 'Embed en directe (Shadow DOM)', 'Endpoints JSON per al teu frontend', 'Domini propi']}
              />
        )}

        {activeTab === 'usuaris' && (
          isSuperAdmin
            ? <SiteUsersManager siteId={siteId} assignedUsers={assignedUsers} availableClients={availableClients} />
            : <PremiumPanel
                feature="Usuaris assignats"
                description="Convida companys d’equip perquè gestionin aquest lloc amb tu. Disponible al pla Premium."
                perks={['Múltiples editors per lloc', 'Rols i permisos', 'Activitat de l’equip']}
              />
        )}
      </ThemeStudioProvider>

      {showImport && isSuperAdmin && (
        <ImportModal siteId={siteId} onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}

// Connexió tab: the live embed snippet + the detailed integration guide. Reads
// the shared Theme Studio state so detection + the "configure theme first" gate
// reflect live edits, not just the page-load snapshot.
function ConnexioTab({ siteId, apiKey }: { siteId: string; apiKey: string }) {
  const { hasTheme, detectedFramework, detectedHosting } = useThemeStudio()
  return (
    <div className="space-y-4">
      <LiveEmbedCard />
      <ApiDocsCard
        apiKey={apiKey}
        siteId={siteId}
        detectedFramework={detectedFramework}
        detectedHosting={detectedHosting}
        themeConfigured={hasTheme}
      />
    </div>
  )
}
