'use client'

import { useState, useRef, useSyncExternalStore, lazy, Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Plug, Users, Sparkles, Palette, ExternalLink, LayoutDashboard, Puzzle, Rocket, MessageCircle, ArrowUpRight, X } from 'lucide-react'
import { SiteAdminActions, SiteUsersManager, InlineSiteName } from './SiteManager'
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
// chart (OverviewPanel), the import modal etc. are fetched on demand — each is
// conditionally rendered already, so this changes nothing visually/behaviourally
// beyond a brief load the first time it's opened. (SiteOnboarding stays a static
// import: it's the critical first-run funnel and must mount + auto-fire the
// clone with zero extra latency. The Studio itself now lives FULLSCREEN at
// /edit/[siteId] — the Tema tab is a launcher, not an embed.)
const OverviewPanel = lazy(() => import('./OverviewPanel'))
const ImportModal = lazy(() => import('./ImportModal'))
const ModulesManager = lazy(() => import('./ModulesManager'))
// The Connexió/Publicar tab: ApiDocsCard alone drags in the (huge) static
// IntegrationGuide, and none of it renders on the default Articles tab.
const ApiDocsCard = lazy(() => import('./ApiDocsCard'))
const WordPressConnectCard = lazy(() => import('./WordPressConnectCard'))
const PublishGuide = lazy(() => import('./PublishGuide'))
// The agent step only mounts at the end of a completed onboarding — off the
// default path, so it stays out of the initial bundle like its siblings above.
const ConnectAgentStep = lazy(() => import('./ConnectAgentStep'))
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
  /** False when this user has no ACTIVE WhatsApp identity → show the connect step. */
  waConnected?: boolean
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
  // Key stays 'tema' (deep links / ?tab=tema keep working); the LABEL follows
  // the product — this section now launches the fullscreen Studio + Agent.
  { key: 'tema',     label: 'Aura',   desc: 'Disseny i agent', icon: Sparkles },
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
  initialStats, defaultTab, autoCloneUrl, waConnected = true, siteDefaultLocale, regenCount = 0,
  initialModules = null, previewPostSlug,
}: Props) {
  const { toast } = useToast()
  const router = useRouter()
  // Hide the Smart Modules tab from clients for the MVP (see CLIENT_MODULES_ENABLED).
  const hideModules = !isSuperAdmin && !CLIENT_MODULES_ENABLED
  const coerceTab = (t: TabKey): TabKey => (hideModules && t === 'moduls' ? 'articles' : t)
  const [activeTab, setActiveTab] = useState<TabKey>(coerceTab(defaultTab))
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState<string | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  // Onboarding is for any pristine site — superadmins provisioning a client site
  // AND self-serve users landing on their freshly-created first blog.
  const showOnboarding = isNewSite && !onboardingDone
  // Últim pas de l'onboarding (founder 2026-07-06): connectar l'agent de
  // WhatsApp com a PAS evident — però saltable. Només per a clients sense
  // identitat activa; l'operador (superadmin) no el necessita.
  const [agentStepVisible, setAgentStepVisible] = useState(false)
  const maybeShowAgentStep = () => {
    if (!waConnected && !isSuperAdmin) setAgentStepVisible(true)
  }
  const wpImportIntent = useRef(false)
  // True while the post-clone onboarding sequence is running (capture → optional
  // article import → done). NO layout step: the clone replicates the source's
  // cards/grid natively (blog_signature), so asking "how should it look?" would
  // contradict the promise.
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
  // `importArticles` comes from the onboarding chooser: a FULL blog clone wants
  // the source's articles imported after the capture; a styles-only clone (or
  // cloning someone ELSE's blog — never their content) does not. Default true
  // preserves the self-serve funnel's historic behaviour.
  const handleMagicWandStarted = (opts?: { importArticles?: boolean }) => {
    wpImportIntent.current = opts?.importArticles ?? true
    onboardingFlow.current = true
    setOnboardingDone(true)
    // Self-serve (arrived with a clone URL): drop the user straight onto Articles —
    // the site already exists and the clone + any import run in the background.
    // Manual capture (operator) stays on Tema to watch the theme assemble.
    switchTab(autoCloneUrl ? 'articles' : 'tema')
  }
  const handleTemplateApplied = (templateName: string) => {
    setOnboardingDone(true)
    switchTab('articles')
    // The template seeding just created the starter posts server-side — refresh
    // so the Articles list (and everything else) shows the blog already alive.
    router.refresh()
    toast(`Plantilla «${templateName}» aplicada — el teu blog ja és viu ✨`, 'success')
    maybeShowAgentStep()
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
  const handleCaptureProceed = ({ framework, blogUrl }: { framework: string | null; blogUrl: string | null }) => {
    void framework // import is no longer WP-only — discover handles WP API, RSS and HTML
    if (wpImportIntent.current) {
      // Full-clone intent: open the article import. Discovery targets the BLOG
      // URL when the detector found one (site.com/blog) — the web root would
      // "discover" corporate pages, not articles.
      wpImportIntent.current = false
      setImportUrl(blogUrl || captureInfo.current.url)
      setShowImport(true)
    } else if (onboardingFlow.current) {
      // Styles-only clone: the captured design (cards included) IS the look —
      // nothing to choose. Done.
      onboardingFlow.current = false
      toast('El teu blog està llest ✨', 'success')
      maybeShowAgentStep()
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

        {agentStepVisible && (
          <Suspense fallback={null}>
            <ConnectAgentStep
              onClose={(connected) => {
                setAgentStepVisible(false)
                // waConnected és un prop del servidor: refresquem perquè el
                // recordatori (banner) desaparegui just després de connectar.
                if (connected) router.refresh()
              }}
            />
          </Suspense>
        )}

        <div className="space-y-6">
          <SiteSectionCards active={activeTab} onSelect={switchTab} isLocked={isLocked} isSuperAdmin={isSuperAdmin} />

          {/* Suggeriment discret (descartable) per connectar l'agent de WhatsApp. */}
          {!waConnected && !showOnboarding && <ConnectAgentBanner />}

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

            {activeTab === 'tema' && <StudioLaunchPanel siteId={siteId} />}

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
              <Suspense fallback={<SectionSkeleton />}>
                {isSuperAdmin
                  ? <ConnexioTab siteId={siteId} apiKey={apiKey} subdomain={subdomain} />
                  : <ClientPublishTab siteId={siteId} subdomain={subdomain} />}
              </Suspense>
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
              // Full-clone onboarding ends here — the imported articles render
              // inside the CLONED design (cards included); nothing to choose.
              if (onboardingFlow.current) {
                onboardingFlow.current = false
                router.refresh()
                toast('El teu blog està llest ✨', 'success')
                maybeShowAgentStep()
              }
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

// Section switcher — proper CARDS (icon block + label + description). On sm+
// they sit on ONE line (founder directive: keep the card feel, never a second
// row). On PHONES that line became a hidden-scrollbar horizontal scroller —
// sections past the fold were undiscoverable (mobile audit 2026-07-06) — so
// mobile now lays the same cards in a 2-column grid: everything visible, zero
// horizontal scroll, still cards.
function SiteSectionCards({
  active, onSelect, isLocked, isSuperAdmin,
}: {
  active: TabKey
  onSelect: (k: TabKey) => void
  isLocked: (s: SectionDef) => boolean
  isSuperAdmin: boolean
}) {
  // Clients see a trimmed, renamed set (Connexió → "Publica"; Mòduls behind its
  // MVP flag; Usuaris stays reachable as the Premium upsell card).
  const defs = isSuperAdmin
    ? SECTION_DEFS
    : SECTION_DEFS
        .filter(s => CLIENT_MODULES_ENABLED || s.key !== 'moduls')
        .map(s => (s.key === 'connexio' ? { ...s, label: 'Publica', desc: 'Posa el blog en línia', icon: Rocket } : s))

  return (
    <nav
      aria-label="Seccions del lloc"
      className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch sm:gap-3 sm:overflow-x-auto sm:pb-1 sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
    >
      {defs.map(s => {
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
              'group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-2xl border p-3 text-left transition-all duration-200 sm:min-w-[10.5rem] sm:flex-1 sm:shrink-0 sm:gap-3 sm:p-3.5',
              activeS
                ? 'border-accent bg-accent-soft ring-2 ring-accent/20 shadow-sm'
                : 'border-border bg-surface hover:border-border-strong hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.25)]',
            )}
          >
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
              activeS ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-muted group-hover:text-text',
            )}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <span className={cn(
                'flex items-center gap-1.5 text-sm font-bold leading-tight sm:whitespace-nowrap',
                activeS ? 'text-accent' : 'text-text',
              )}>
                <span className="truncate">{s.label}</span>
                {locked && <LockBadge />}
              </span>
              <span className={cn('mt-0.5 hidden text-xs leading-tight sm:block sm:whitespace-nowrap', activeS ? 'text-accent/70' : 'text-subtle')}>
                {s.desc}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// ── Suggeriment discret: connecta l'agent de WhatsApp ─────────────────────────
// Una sola línia, descartable per sempre (founder 2026-07-06: útil, mai pesat —
// la configuració de debò viu, ben visible, a /dashboard/agent).
const WA_BANNER_DISMISS_KEY = 'carma:wa-banner-dismissed'
const emptySubscribe = () => () => {}

function ConnectAgentBanner() {
  // localStorage és un magatzem extern → useSyncExternalStore (hydration-safe:
  // el servidor el considera descartat i el client corregeix al primer render).
  const initiallyDismissed = useSyncExternalStore(
    emptySubscribe,
    () => { try { return localStorage.getItem(WA_BANNER_DISMISS_KEY) === '1' } catch { return false } },
    () => true,
  )
  const [hiddenNow, setHiddenNow] = useState(false)
  if (initiallyDismissed || hiddenNow) return null

  const dismiss = () => {
    setHiddenNow(true)
    try { localStorage.setItem(WA_BANNER_DISMISS_KEY, '1') } catch { /* cosmètic */ }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-3.5 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <MessageCircle className="h-3.5 w-3.5" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm text-muted">
        <span className="font-semibold text-text">Vols escriure per WhatsApp?</span>{' '}
        <span className="hidden sm:inline">Envia una nota de veu i l&apos;agent et prepara l&apos;article.</span>
      </p>
      <Link
        href="/dashboard/agent"
        className="shrink-0 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-extrabold text-accent no-underline transition-colors hover:bg-accent hover:text-on-accent"
      >
        Connecta&apos;l
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Descarta el suggeriment"
        title="No m'ho tornis a ensenyar"
        className="shrink-0 cursor-pointer rounded-md p-1 text-subtle transition-colors hover:bg-surface-hover hover:text-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
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

// The Tema tab is now a LAUNCHER: the Studio runs fullscreen at /edit/[siteId]
// (editing the real page, no dashboard chrome) and the agent has its own space.
// Both open in a new tab so this site's context never gets lost.
function StudioLaunchPanel({ siteId }: { siteId: string }) {
  const { hasTheme } = useThemeStudio()
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <a
        href={`/edit/${siteId}?from=site`}
        target="_blank"
        rel="noopener noreferrer"
        className="lift gold-trace gold-trace-aura [--gold-trace-w:1px] group relative flex flex-col overflow-hidden rounded-3xl border border-transparent bg-bg-elevated p-7 no-underline shadow-card"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-on-accent">
          <Palette className="h-6 w-6" />
        </span>
        <h3 className="mt-4 flex items-center gap-2 text-xl font-extrabold tracking-tight text-text">
          Carma Studio
          <ArrowUpRight className="h-4.5 w-4.5 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
          Edita el teu blog EN DIRECTE sobre la pàgina real: clica qualsevol element, canvia colors,
          tipografies i disposició, i {hasTheme ? 'regenera el disseny quan vulguis' : 'clona el disseny de la teva web'}.
          S&apos;obre a pantalla completa.
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-accent">
          Obre l&apos;Studio <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </a>

      <a
        href="/dashboard/agent"
        target="_blank"
        rel="noopener noreferrer"
        className="lift group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-bg-elevated p-7 no-underline shadow-card"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <MessageCircle className="h-6 w-6" />
        </span>
        <h3 className="mt-4 flex items-center gap-2 text-xl font-extrabold tracking-tight text-text">
          Agent
          <ArrowUpRight className="h-4.5 w-4.5 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
          Dicta-li una idea — pel xat o per WhatsApp — i et torna un article SEO a punt de publicar
          en aquest blog. Tu aproves, ell publica.
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-accent">
          Parla amb l&apos;agent <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </a>
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
