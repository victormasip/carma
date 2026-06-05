'use client'

import { useState, useRef, lazy, Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Plug, Users, Palette, ExternalLink, Loader2, LayoutDashboard } from 'lucide-react'
import { SiteAdminActions, SiteUsersManager, InlineSiteName } from './SiteManager'
import ApiDocsCard from './ApiDocsCard'
import PostsManager from './PostsManager'
import ImportModal from './ImportModal'
import LiveEmbedCard from './LiveEmbedCard'
import ThemeCaptureModal from './ThemeCaptureModal'
import SiteOnboarding from './SiteOnboarding'
import OverviewPanel from './OverviewPanel'
import { LockBadge, PremiumPanel } from './PremiumGate'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'

// Code-split the Theme Studio (LLM Magic Wand + visual chrome editor) — heavy
// and only needed on the Tema tab, so it stays out of the dashboard's main bundle.
const ThemeManager = lazy(() => import('./ThemeManager'))
import { ThemeStudioProvider, useThemeStudio, type Theme } from './ThemeStudioContext'
import type { PostsMeta } from './PostsManager'
import type { PostListItem } from '@/lib/actions/posts'
import type { SiteStats } from '@/lib/analytics/read'

type Post = PostListItem
type AssignedUser = { user_id: string; email: string }
type Client = { id: string; email: string }
type TabKey = 'resum' | 'articles' | 'tema' | 'connexio' | 'usuaris'

type Props = {
  siteId: string
  siteName: string
  siteCreatedAt: string
  apiKey: string
  isSuperAdmin: boolean
  isNewSite: boolean
  initialPosts: Post[]
  initialPostsMeta: PostsMeta
  assignedUsers: AssignedUser[]
  availableClients: Client[]
  initialTheme: Theme | null
  initialStats: SiteStats | null
  defaultTab: TabKey
  siteDefaultLocale?: string
}

type SectionDef = { key: TabKey; label: string; desc: string; icon: typeof FileText; premium?: boolean }
const SECTION_DEFS: SectionDef[] = [
  { key: 'resum',    label: 'Resum',    desc: 'Estadístiques', icon: LayoutDashboard },
  { key: 'articles', label: 'Articles', desc: 'Contingut',     icon: FileText },
  { key: 'tema',     label: 'Tema',     desc: 'Disseny',       icon: Palette },
  { key: 'connexio', label: 'Connexió', desc: 'API i embed',   icon: Plug,  premium: true },
  { key: 'usuaris',  label: 'Usuaris',  desc: 'Equip',         icon: Users, premium: true },
]

export default function SiteDetailClient({
  siteId, siteName, siteCreatedAt, apiKey,
  isSuperAdmin, isNewSite, initialPosts, initialPostsMeta, assignedUsers, availableClients, initialTheme,
  initialStats, defaultTab, siteDefaultLocale,
}: Props) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState<string | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const showOnboarding = isNewSite && isSuperAdmin && !onboardingDone
  const wpImportIntent = useRef(false)

  // Resync the active tab when the server-provided defaultTab changes (e.g.
  // navigating via a <Link> to ?tab=connexio). Render-time state sync.
  const [syncedDefault, setSyncedDefault] = useState(defaultTab)
  if (defaultTab !== syncedDefault) {
    setSyncedDefault(defaultTab)
    setActiveTab(defaultTab)
  }

  const isLocked = (s: SectionDef) => !isSuperAdmin && !!s.premium

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab)
    const url = tab === 'resum'
      ? `/dashboard/sites/${siteId}`
      : `/dashboard/sites/${siteId}?tab=${tab}`
    window.history.replaceState({}, '', url)
  }

  // ── Onboarding coordination ──
  const handleMagicWandStarted = () => {
    wpImportIntent.current = true
    setOnboardingDone(true)
    switchTab('tema')
  }
  const handleTemplateApplied = (templateName: string) => {
    setOnboardingDone(true)
    switchTab('tema')
    toast(`Plantilla «${templateName}» aplicada`, 'success')
  }
  const handleCaptureSuccess = ({ framework, url }: { framework: string | null; url: string; siteName: string | null }) => {
    // IMPORTANT: we deliberately do NOT rename the site from scraped metadata.
    // The operator's chosen Site Name is authoritative and must never be
    // overwritten by the captured site's <title>/og:site_name/domain.
    if (wpImportIntent.current && framework === 'wordpress') {
      setTimeout(() => { setImportUrl(url); setShowImport(true) }, 1400)
    }
    wpImportIntent.current = false
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/dashboard"
            aria-label="Tornar al panell"
            className="w-9 h-9 mt-0.5 bg-surface border border-border rounded-lg flex items-center justify-center text-muted hover:text-text hover:border-border-strong hover:bg-surface-hover transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              {isSuperAdmin ? (
                <InlineSiteName siteId={siteId} siteName={siteName} />
              ) : (
                <h1 className="text-2xl sm:text-[28px] font-bold text-text tracking-tight truncate">
                  {siteName}
                </h1>
              )}
              {isSuperAdmin && <SiteAdminActions siteId={siteId} siteName={siteName} />}
            </div>
            <p className="text-sm text-muted mt-1.5">
              Creat el {new Date(siteCreatedAt).toLocaleDateString('ca-ES')}
            </p>
          </div>
        </div>

        {/* Prominent "Veure lloc". Fresh ?v= cache-buster at click time. */}
        <a
          href={`/render/${siteId}`}
          onClick={(e) => {
            e.preventDefault()
            window.open(`/render/${siteId}?v=${Date.now()}`, '_blank', 'noopener,noreferrer')
          }}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer shrink-0 inline-flex h-10 items-center justify-center gap-2 px-4 rounded-xl bg-text text-bg-elevated text-sm font-semibold transition-opacity hover:opacity-90"
        >
          <ExternalLink className="w-4 h-4" />
          Veure lloc
        </a>
      </div>

      {/* Section workspace: a left nav rail + the active section's content. */}
      <ThemeStudioProvider
        siteId={siteId}
        initialTheme={initialTheme}
        defaultLocale={siteDefaultLocale}
        canTranslate={isSuperAdmin}
        onCaptureSuccess={handleCaptureSuccess}
      >
        <ThemeCaptureModal />

        {showOnboarding && (
          <SiteOnboarding
            siteName={siteName}
            onMagicWandStarted={handleMagicWandStarted}
            onTemplateApplied={handleTemplateApplied}
            onDismiss={() => setOnboardingDone(true)}
          />
        )}

        <div className="space-y-6">
          <SiteSectionCards active={activeTab} onSelect={switchTab} isLocked={isLocked} />

          <div className="min-w-0">
            {activeTab === 'resum' && (
              <OverviewPanel
                siteId={siteId}
                totalArticles={initialPostsMeta.total}
                publishedArticles={initialPostsMeta.published}
                initialStats={initialStats}
              />
            )}

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
                <Suspense fallback={
                  <div className="flex items-center justify-center py-20 text-subtle">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                }>
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
          </div>
        </div>
      </ThemeStudioProvider>

      {showImport && isSuperAdmin && (
        <ImportModal
          siteId={siteId}
          autoDiscoverUrl={importUrl ?? undefined}
          onClose={() => { setShowImport(false); setImportUrl(null) }}
        />
      )}
    </div>
  )
}

// Section switcher — a row of rich cards (icon tile + label + sublabel). The
// active card is filled in the brand accent; the content renders full-width
// below, so heavy sections (Theme Studio split-view) get the whole canvas.
function SiteSectionCards({
  active, onSelect, isLocked,
}: {
  active: TabKey
  onSelect: (k: TabKey) => void
  isLocked: (s: SectionDef) => boolean
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {SECTION_DEFS.map(s => {
        const Icon = s.icon
        const activeS = s.key === active
        const locked = isLocked(s)
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            aria-current={activeS ? 'page' : undefined}
            className={cn(
              'group cursor-pointer relative flex flex-col items-start gap-2.5 p-4 rounded-2xl border text-left transition-all duration-200',
              activeS
                ? 'border-accent bg-accent-soft ring-2 ring-accent/20 shadow-sm'
                : 'border-border bg-surface hover:border-border-strong hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.25)]',
            )}
          >
            <span className={cn(
              'flex items-center justify-center w-9 h-9 rounded-xl shrink-0 transition-colors',
              activeS ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-muted group-hover:text-text',
            )}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className={cn(
                'flex items-center gap-1.5 text-sm font-bold leading-tight',
                activeS ? 'text-accent' : 'text-text',
              )}>
                {s.label}
                {locked && <LockBadge />}
              </span>
              <span className={cn('block text-xs leading-tight mt-0.5', activeS ? 'text-accent/70' : 'text-subtle')}>
                {s.desc}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

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
