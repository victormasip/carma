'use client'

import { useState, useRef, lazy, Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Plug, Users, Palette, ExternalLink, Loader2, LayoutDashboard } from 'lucide-react'
import { SiteAdminActions, SiteUsersManager, InlineSiteName } from './SiteManager'
import ApiDocsCard from './ApiDocsCard'
import PostsManager from './PostsManager'
import LiveEmbedCard from './LiveEmbedCard'
import ThemeCaptureModal from './ThemeCaptureModal'
import SiteOnboarding from './SiteOnboarding'
import { LockBadge, PremiumPanel } from './PremiumGate'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { publicBlogUrl } from '@/lib/sites/domain'

// Code-split the heavy, off-the-default-path surfaces so they stay OUT of the
// site-detail route's initial JS bundle. The default tab is "Articles", so the
// chart (OverviewPanel), the import modal and the Theme Studio are fetched on
// demand — each is conditionally rendered already, so this changes nothing
// visually/behaviourally beyond a brief load the first time it's opened.
// (SiteOnboarding stays a static import: it's the critical first-run funnel and
// must mount + auto-fire the clone with zero extra latency.)
const ThemeManager = lazy(() => import('./ThemeManager'))
const OverviewPanel = lazy(() => import('./OverviewPanel'))
const ImportModal = lazy(() => import('./ImportModal'))
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
  subdomain?: string
  isSuperAdmin: boolean
  isNewSite: boolean
  initialPosts: Post[]
  initialPostsMeta: PostsMeta
  assignedUsers: AssignedUser[]
  availableClients: Client[]
  initialTheme: Theme | null
  initialStats: SiteStats | null
  defaultTab: TabKey
  /** When present (self-serve funnel), auto-starts the Magic Wand on this URL. */
  autoCloneUrl?: string
  siteDefaultLocale?: string
}

type SectionDef = { key: TabKey; label: string; desc: string; icon: typeof FileText; premium?: boolean }
// Order: content first, then design (Tema), then stats (Resum) — per the launch
// IA, "Resum" deliberately sits AFTER "Tema".
const SECTION_DEFS: SectionDef[] = [
  { key: 'articles', label: 'Articles', desc: 'Contingut',     icon: FileText },
  { key: 'tema',     label: 'Tema',     desc: 'Disseny',       icon: Palette },
  { key: 'resum',    label: 'Resum',    desc: 'Estadístiques', icon: LayoutDashboard },
  { key: 'connexio', label: 'Connexió', desc: 'API i embed',   icon: Plug,  premium: true },
  { key: 'usuaris',  label: 'Usuaris',  desc: 'Equip',         icon: Users, premium: true },
]

export default function SiteDetailClient({
  siteId, siteName, siteCreatedAt, apiKey, subdomain,
  isSuperAdmin, isNewSite, initialPosts, initialPostsMeta, assignedUsers, availableClients, initialTheme,
  initialStats, defaultTab, autoCloneUrl, siteDefaultLocale,
}: Props) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState<string | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  // Onboarding is for any pristine site — superadmins provisioning a client site
  // AND self-serve users landing on their freshly-created first blog.
  const showOnboarding = isNewSite && !onboardingDone
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
    // Articles is the default workspace, so it owns the clean URL; the rest carry ?tab=.
    const url = tab === 'articles'
      ? `/dashboard/sites/${siteId}`
      : `/dashboard/sites/${siteId}?tab=${tab}`
    window.history.replaceState({}, '', url)
  }

  // ── Onboarding coordination ──
  const handleMagicWandStarted = () => {
    wpImportIntent.current = true
    setOnboardingDone(true)
    // Self-serve (arrived with a clone URL): drop the user straight onto Articles —
    // the site already exists and the clone + any import run in the background.
    // Manual capture (operator) stays on Tema to watch the theme assemble.
    switchTab(autoCloneUrl ? 'articles' : 'tema')
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

        {/* Prominent "Veure lloc". Opens the site's own subdomain when available
            (falls back to /render/<id>), with a fresh ?v= cache-buster at click time. */}
        <a
          href={`/render/${siteId}`}
          onClick={(e) => {
            e.preventDefault()
            const v = Date.now()
            const subUrl = subdomain
              ? publicBlogUrl(subdomain, { currentHost: window.location.host, path: `/?v=${v}` })
              : null
            window.open(subUrl ?? `/render/${siteId}?v=${v}`, '_blank', 'noopener,noreferrer')
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
            initialUrl={autoCloneUrl}
            autoStart={!!autoCloneUrl}
            onMagicWandStarted={handleMagicWandStarted}
            onTemplateApplied={handleTemplateApplied}
            onDismiss={() => setOnboardingDone(true)}
          />
        )}

        <div className="space-y-6">
          <SiteSectionCards active={activeTab} onSelect={switchTab} isLocked={isLocked} />

          <div className="min-w-0">
            {activeTab === 'resum' && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-20 text-subtle">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              }>
                <OverviewPanel
                  siteId={siteId}
                  totalArticles={initialPostsMeta.total}
                  publishedArticles={initialPostsMeta.published}
                  initialStats={initialStats}
                />
              </Suspense>
            )}

            {activeTab === 'articles' && (
              <PostsManager
                siteId={siteId}
                siteName={siteName}
                initialPosts={initialPosts}
                initialMeta={initialPostsMeta}
                isSuperAdmin={isSuperAdmin}
                onImport={() => setShowImport(true)}
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

      {showImport && (
        <Suspense fallback={null}>
          <ImportModal
            siteId={siteId}
            autoDiscoverUrl={importUrl ?? undefined}
            onClose={() => { setShowImport(false); setImportUrl(null) }}
          />
        </Suspense>
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
