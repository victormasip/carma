'use client'

import { useState, useRef, lazy, Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Plug, Users, Palette, ExternalLink, LayoutDashboard, Puzzle, Rocket } from 'lucide-react'
import { SiteAdminActions, SiteUsersManager, InlineSiteName } from './SiteManager'
import ApiDocsCard from './ApiDocsCard'
import WordPressConnectCard from './WordPressConnectCard'
import PublishGuide from './PublishGuide'
import PostsManager from './PostsManager'
import LiveEmbedCard from './LiveEmbedCard'
import ThemeCaptureModal from './ThemeCaptureModal'
import SiteOnboarding from './SiteOnboarding'
import { LockBadge, PremiumPanel } from './PremiumGate'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { publicBlogUrl } from '@/lib/sites/domain'
import { updateSiteLogo } from '@/lib/actions/sites'
import { formatDate } from '@/lib/format'

// Code-split the heavy, off-the-default-path surfaces so they stay OUT of the
// site-detail route's initial JS bundle. The default tab is "Articles", so the
// chart (OverviewPanel), the import modal and the Theme Studio are fetched on
// demand — each is conditionally rendered already, so this changes nothing
// visually/behaviourally beyond a brief load the first time it's opened.
// (SiteOnboarding stays a static import: it's the critical first-run funnel and
// must mount + auto-fire the clone with zero extra latency.)
const CarmaStudio = lazy(() => import('./studio/CarmaStudio'))
const OverviewPanel = lazy(() => import('./OverviewPanel'))
const ImportModal = lazy(() => import('./ImportModal'))
const FeedLayoutPicker = lazy(() => import('./FeedLayoutPicker'))
const ModulesManager = lazy(() => import('./ModulesManager'))
import { ThemeStudioProvider, useThemeStudio, type Theme } from './ThemeStudioContext'
import type { PostsMeta } from './PostsManager'
import type { PostListItem } from '@/lib/actions/posts'
import type { SiteStats } from '@/lib/analytics/read'
import type { SiteModules } from '@/lib/modules/registry'

type Post = PostListItem
type AssignedUser = { user_id: string; email: string }
type Client = { id: string; email: string }
type TabKey = 'resum' | 'articles' | 'tema' | 'moduls' | 'connexio' | 'usuaris'

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
  /** Re-captures already consumed (freemium regeneration quota). */
  regenCount?: number
  /** Smart Modules config (site_themes.modules). */
  initialModules?: SiteModules | null
  /** First published post slug, for the Modules tab's article preview. */
  previewPostSlug?: string
}

type SectionDef = { key: TabKey; label: string; desc: string; icon: typeof FileText; premium?: boolean }
// Order: content first, then design (Tema), then stats (Resum) — per the launch
// IA, "Resum" deliberately sits AFTER "Tema".
const SECTION_DEFS: SectionDef[] = [
  { key: 'articles', label: 'Articles', desc: 'Contingut',     icon: FileText },
  { key: 'tema',     label: 'Tema',     desc: 'Disseny',       icon: Palette },
  { key: 'moduls',   label: 'Mòduls',   desc: 'Funcionalitats', icon: Puzzle },
  { key: 'resum',    label: 'Resum',    desc: 'Estadístiques', icon: LayoutDashboard },
  { key: 'connexio', label: 'Connexió', desc: 'API i embed',   icon: Plug,  premium: true },
  { key: 'usuaris',  label: 'Usuaris',  desc: 'Equip',         icon: Users, premium: true },
]

// Smart Modules are a core MVP requirement — shown to ALL users (clients included).
// (The hide-from-clients experiment was reverted per CEO decision; the flag stays
// as a kill-switch but defaults ON.)
const CLIENT_MODULES_ENABLED = true

export default function SiteDetailClient({
  siteId, siteName, siteCreatedAt, apiKey, subdomain,
  isSuperAdmin, isNewSite, initialPosts, initialPostsMeta, assignedUsers, availableClients, initialTheme,
  initialStats, defaultTab, autoCloneUrl, siteDefaultLocale, regenCount = 0,
  initialModules = null, previewPostSlug,
}: Props) {
  const { toast } = useToast()
  // Hide the Smart Modules tab from clients for the MVP (see CLIENT_MODULES_ENABLED).
  const hideModules = !isSuperAdmin && !CLIENT_MODULES_ENABLED
  const coerceTab = (t: TabKey): TabKey => (hideModules && t === 'moduls' ? 'articles' : t)
  const [activeTab, setActiveTab] = useState<TabKey>(coerceTab(defaultTab))
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState<string | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  // Onboarding is for any pristine site — superadmins provisioning a client site
  // AND self-serve users landing on their freshly-created first blog.
  const showOnboarding = isNewSite && !onboardingDone
  const wpImportIntent = useRef(false)
  // True while the post-clone onboarding sequence is running (capture → optional
  // WP import → layout picker), so the picker only appears during onboarding and
  // not after a later manual re-capture.
  const onboardingFlow = useRef(false)
  // The just-captured site's url + framework, stashed on success so the user's
  // later "proceed" click (NOT a timer) can open the right next step.
  const captureInfo = useRef<{ url: string; framework: string | null }>({ url: '', framework: null })

  // Resync the active tab when the server-provided defaultTab changes (e.g.
  // navigating via a <Link> to ?tab=connexio). Render-time state sync.
  const [syncedDefault, setSyncedDefault] = useState(defaultTab)
  if (defaultTab !== syncedDefault) {
    setSyncedDefault(defaultTab)
    setActiveTab(coerceTab(defaultTab))
  }

  const isLocked = (s: SectionDef) => !isSuperAdmin && !!s.premium

  const switchTab = (rawTab: TabKey) => {
    const tab = coerceTab(rawTab)
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
    onboardingFlow.current = true
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
  const finishLayoutPicker = () => {
    setShowLayoutPicker(false)
    onboardingFlow.current = false
    switchTab('tema')
    toast('El teu blog està llest ✨', 'success')
  }
  const handleCaptureSuccess = ({ framework, url, logoUrl }: { framework: string | null; url: string; siteName: string | null; logoUrl: string | null }) => {
    // IMPORTANT: we deliberately do NOT rename the site from scraped metadata.
    // The operator's chosen Site Name is authoritative and must never be
    // overwritten by the captured site's <title>/og:site_name/domain.
    // The logo, however, we DO adopt — it shows on the dashboard card.
    if (logoUrl) void updateSiteLogo(siteId, logoUrl)
    // Stash what we found; the user advances when THEY click the success CTA.
    // No timer here any more — the onboarding never skips ahead on its own.
    captureInfo.current = { url, framework }
  }

  // Fired when the user clicks the capture success CTA ("Importa els articles" /
  // "Comencem" / "Editar el tema"). THIS is the moment we advance the onboarding.
  const handleCaptureProceed = ({ framework }: { framework: string | null }) => {
    const url = captureInfo.current.url
    if (wpImportIntent.current && framework === 'wordpress') {
      // WordPress: open the article import; the layout picker follows once the
      // import modal closes (see ImportModal onClose below).
      wpImportIntent.current = false
      setImportUrl(url)
      setShowImport(true)
    } else if (onboardingFlow.current) {
      // Non-WordPress onboarding capture → the layout picker.
      setShowLayoutPicker(true)
    }
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
              {/* Clients can now rename + delete their OWN blog inline too (server
                  actions are member-gated; UI guards delete behind a confirm). */}
              <InlineSiteName siteId={siteId} siteName={siteName} />
              <SiteAdminActions siteId={siteId} siteName={siteName} />
            </div>
            <p className="text-sm text-muted mt-1.5">
              Creat el {formatDate(siteCreatedAt)}
            </p>
          </div>
        </div>

        {/* Prominent "Veure lloc" — the premium gold CTA. Opens the site's own
            subdomain when available (falls back to /render/<id>), with a fresh
            ?v= cache-buster at click time; the href keeps middle-click working. */}
        <Button
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
          glow
          iconLeft={<ExternalLink className="w-4 h-4" />}
          className="shrink-0"
        >
          Veure lloc
        </Button>
      </div>

      {/* Section workspace: a left nav rail + the active section's content. */}
      <ThemeStudioProvider
        siteId={siteId}
        initialTheme={initialTheme}
        defaultLocale={siteDefaultLocale}
        canTranslate={isSuperAdmin}
        isPremium={isSuperAdmin}
        initialRegenCount={regenCount}
        onCaptureSuccess={handleCaptureSuccess}
        onCaptureProceed={handleCaptureProceed}
      >
        <ThemeCaptureModal isSuperAdmin={isSuperAdmin} />

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

        {showLayoutPicker && (
          <Suspense fallback={null}>
            <FeedLayoutPicker onDone={finishLayoutPicker} />
          </Suspense>
        )}

        <div className="space-y-6">
          <SiteSectionCards active={activeTab} onSelect={switchTab} isLocked={isLocked} isSuperAdmin={isSuperAdmin} />

          <div className="min-w-0">
            {activeTab === 'resum' && (
              <Suspense fallback={<SectionSkeleton />}>
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
                <Suspense fallback={<SectionSkeleton />}>
                  <CarmaStudio isSuperAdmin={isSuperAdmin} />
                </Suspense>
              </ErrorBoundary>
            )}

            {activeTab === 'moduls' && !hideModules && (
              <ErrorBoundary label="El panell de mòduls ha tingut un error">
                <Suspense fallback={<SectionSkeleton />}>
                  <ModulesManager
                    siteId={siteId}
                    isPremium={isSuperAdmin}
                    initialModules={initialModules}
                    previewPostSlug={previewPostSlug}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {activeTab === 'connexio' && (
              isSuperAdmin
                ? <ConnexioTab siteId={siteId} apiKey={apiKey} subdomain={subdomain} />
                : <ClientPublishTab siteId={siteId} subdomain={subdomain} />
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
            isSuperAdmin={isSuperAdmin}
            autoDiscoverUrl={importUrl ?? undefined}
            onClose={() => {
              setShowImport(false)
              setImportUrl(null)
              // WordPress onboarding: after the import, continue to the layout picker.
              if (onboardingFlow.current) setShowLayoutPicker(true)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

// Section switcher. Clients get a calm, focused bento (4 core surfaces + a
// subordinate Premium affordance) to keep cognitive load low; superadmins keep
// the full 6-card control grid below, untouched.
function SiteSectionCards({
  active, onSelect, isLocked, isSuperAdmin,
}: {
  active: TabKey
  onSelect: (k: TabKey) => void
  isLocked: (s: SectionDef) => boolean
  isSuperAdmin: boolean
}) {
  if (!isSuperAdmin) return <ClientSectionNav active={active} onSelect={onSelect} />

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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

// Calm, layout-stable placeholder for a lazily-loaded section (Resum / Tema /
// Mòduls) — a skeleton instead of a centred spinner, so nothing jumps when the
// real panel streams in.
function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-44 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  )
}

// Client section nav — 4 core surfaces as a calm bento (soft shadows, no hard
// borders), with the Premium-only surfaces tucked into a quiet secondary row so
// they stay reachable (each shows its upsell) without competing for attention.
function ClientSectionNav({ active, onSelect }: { active: TabKey; onSelect: (k: TabKey) => void }) {
  // Smart Modules is hidden from clients for the MVP (CLIENT_MODULES_ENABLED).
  // Clients publish via their Carma subdomain (no API/plugin needed), so
  // "Connexió" is a reachable "Publica" step for them — surfaced as core, not a
  // locked wall. Only "Usuaris" (team) remains a Premium upsell in the nav.
  const core = SECTION_DEFS
    .filter(s => s.key !== 'usuaris' && (CLIENT_MODULES_ENABLED || s.key !== 'moduls'))
    .map(s => (s.key === 'connexio' ? { ...s, label: 'Publica', desc: 'Posa el blog en línia', icon: Rocket } : s))
  const premium = SECTION_DEFS.filter(s => s.key === 'usuaris')
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {core.map(s => {
          const Icon = s.icon
          const activeS = s.key === active
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              aria-current={activeS ? 'page' : undefined}
              className={cn(
                'group relative flex cursor-pointer flex-col items-start gap-2.5 rounded-2xl p-4 text-left transition-all duration-200',
                activeS
                  ? 'bg-accent-soft ring-2 ring-accent/25 shadow-sm'
                  : 'bg-surface shadow-card hover:-translate-y-0.5 hover:shadow-pop',
              )}
            >
              <span className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                activeS ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-muted group-hover:text-text',
              )}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-bold leading-tight', activeS ? 'text-accent' : 'text-text')}>{s.label}</span>
                <span className={cn('mt-0.5 block text-xs leading-tight', activeS ? 'text-accent/70' : 'text-subtle')}>{s.desc}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-0.5">
        <span className="text-xs font-medium text-subtle">Amb Premium:</span>
        {premium.map(s => {
          const Icon = s.icon
          const activeS = s.key === active
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              aria-current={activeS ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors',
                activeS ? 'bg-accent-soft text-accent' : 'text-subtle hover:bg-surface-hover hover:text-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
              <LockBadge />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ConnexioTab({ siteId, apiKey, subdomain }: { siteId: string; apiKey: string; subdomain?: string }) {
  const { hasTheme, detectedFramework, detectedHosting } = useThemeStudio()
  return (
    <div className="space-y-4">
      <WordPressConnectCard siteId={siteId} apiKey={apiKey} subdomain={subdomain} detectedFramework={detectedFramework} />
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

// Free-user publishing surface: subdomain-first guide + adaptive Premium upsell.
// Reads the detected CMS from the studio so the WordPress upsell is only shown
// when relevant. (Premium users get the full ConnexioTab above instead.)
function ClientPublishTab({ siteId, subdomain }: { siteId: string; subdomain?: string }) {
  const { detectedFramework } = useThemeStudio()
  return <PublishGuide siteId={siteId} subdomain={subdomain} detectedFramework={detectedFramework} />
}
