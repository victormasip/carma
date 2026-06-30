'use client'

import Link from 'next/link'
import {
  Palette, Globe, Loader2, Wand2, AlertCircle,
  Trash2, Sparkles, Plug, PanelTop, PanelBottom, FileCode2,
  Check, Cloud, CloudOff, LayoutGrid, Rows3, AlignLeft, AlignCenter, AlignRight,
  Ruler, Crown, ChevronDown, MoreHorizontal, Newspaper,
} from 'lucide-react'
import { useRef, useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { type DesignTokens, type BlogColumns } from '@/lib/scrape/tokens'
import { FEED_LAYOUTS } from '@/lib/render/feedLayouts'
import { LOOK_PRESETS, type LookPreset, type GlyphKind } from '@/lib/render/lookPresets'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import { useToast } from '@/components/ui/Toast'
import { useConfirm, Modal, ModalClose } from '@/components/ui/Modal'
import { PremiumPanel } from './PremiumGate'
import { useThemeStudio, type SaveStatus } from './ThemeStudioContext'
import VisualChromeEditor from './VisualChromeEditor'
import NavEditor from './NavEditor'
import ThemePreview from './ThemePreview'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/cn'

// Re-export so existing imports (SiteDetailClient) keep resolving the type here.
export type { Theme } from './ThemeStudioContext'

const FRAMEWORK_LABELS: Record<string, string> = {
  wordpress: 'WordPress', nextjs: 'Next.js', astro: 'Astro', gatsby: 'Gatsby',
  hugo: 'Hugo', jekyll: 'Jekyll', webflow: 'Webflow', squarespace: 'Squarespace',
  wix: 'Wix', shopify: 'Shopify', vue: 'Vue', react: 'React', html: 'HTML estàtic',
}

// Curated, well-paired font stacks — friendlier than a raw font-family input.
type FontPreset = { id: string; name: string; sub: string; heading: string; body: string }
const FONT_PRESETS: FontPreset[] = [
  { id: 'system',    name: 'Sistema',    sub: 'Predeterminat ràpid',
    heading: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'modern',    name: 'Modern',     sub: 'Inter · per a SaaS',
    heading: '"Inter", system-ui, sans-serif',
    body: '"Inter", system-ui, sans-serif' },
  { id: 'editorial', name: 'Editorial',  sub: 'Playfair + Source',
    heading: '"Playfair Display", Georgia, serif',
    body: '"Source Sans 3", system-ui, sans-serif' },
  { id: 'classic',   name: 'Clàssic',    sub: 'Lora + Open Sans',
    heading: '"Lora", Georgia, serif',
    body: '"Open Sans", system-ui, sans-serif' },
  { id: 'bold',      name: 'Bold',       sub: 'Space Grotesk',
    heading: '"Space Grotesk", system-ui, sans-serif',
    body: '"Inter", system-ui, sans-serif' },
]

const COLOR_FIELDS: { key: keyof DesignTokens; label: string; hint: string }[] = [
  { key: 'colorAccent',  label: 'Accent',    hint: 'Enllaços i CTA' },
  { key: 'colorPrimary', label: 'Primari',   hint: 'Color de marca' },
  { key: 'colorBg',      label: 'Fons',      hint: 'Pàgina sencera' },
  { key: 'colorSurface', label: 'Targetes',  hint: 'Cards i panells' },
  { key: 'colorText',    label: 'Text',      hint: 'Cos principal' },
  { key: 'colorMuted',   label: 'Text 2on',  hint: 'Captions, dates…' },
  { key: 'colorBorder',  label: 'Vores',     hint: 'Separadors' },
]

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v.trim())

type SectionKey = 'heading' | 'design' | 'layout'

export default function ThemeManager({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const {
    siteId, hasTheme, saveStatus, savedAt,
    url, setUrl, blogUrl, setBlogUrl, analyzing, error, grab, removeTheme,
    tokens, setToken,
    sectionTitle, setSectionTitle,
    extractedHeader, setExtractedHeader,
    extractedFooter, setExtractedFooter,
    extractedHead, setExtractedHead,
    detectedFramework,
    externalStyles, externalScripts, fontLinks,
    editLocale, setEditLocale, editLocales, chromeDefaultLocale,
    canTranslateChrome, translatingChrome, translateChrome,
    nativeCardActive, nativeCardColumns, clearNativeCard,
    isPremium, regenCount, freeRegens, canRegenerate, premiumBlocked, clearPremiumBlock,
  } = useThemeStudio()

  // Default open: "design" if a theme exists (most-edited), else "heading".
  const [openSection, setOpenSection] = useState<SectionKey>(hasTheme ? 'design' : 'heading')

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Eliminar el tema',
      message: 'Les pàgines de render tornaran al disseny per defecte. Aquesta acció no es pot desfer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return
    await removeTheme()
    toast('Tema eliminat')
  }

  const handleTranslateChrome = async () => {
    if (translatingChrome || editLocale === chromeDefaultLocale) return
    if (!canTranslateChrome) {
      toast('La traducció automàtica del header/footer és una funció Premium.', 'info')
      return
    }
    const ok = await confirm({
      title: `Traduir el header i footer a ${LOCALE_META[editLocale].native}`,
      message: `La IA traduirà el header, el footer i el títol des de ${LOCALE_META[chromeDefaultLocale].native}, conservant el disseny. Substituirà el contingut actual d'aquest idioma.`,
      confirmLabel: 'Tradueix',
    })
    if (!ok) return
    const res = await translateChrome(editLocale)
    if (res.error) toast(res.error, 'error')
    else toast(`Header i footer traduïts a ${LOCALE_META[editLocale].native}`, 'success')
  }

  // ── Empty state — no theme yet ──────────────────────────────────────────────
  if (!hasTheme) {
    return (
      <div className="space-y-5">
        <ThemeToolbar
          saveStatus={saveStatus}
          editLocales={editLocales}
          editLocale={editLocale}
          setEditLocale={setEditLocale}
          chromeDefaultLocale={chromeDefaultLocale}
          canTranslateChrome={canTranslateChrome}
          translatingChrome={translatingChrome}
          onTranslate={handleTranslateChrome}
          onDelete={isSuperAdmin ? handleDelete : undefined}
          hasTheme={hasTheme}
        />
        {/* The site owner (member) can capture/re-capture their own blog — not
            superadmin-only. The grabber drives analyze (any-authed) + saveTheme
            (member-gated), so a member has full access. */}
        <EmptyGrabber
          url={url} setUrl={setUrl}
          blogUrl={blogUrl} setBlogUrl={setBlogUrl}
          analyzing={analyzing} error={error} onGrab={grab}
        />
      </div>
    )
  }

  // ── Filled state — theme exists ─────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <ThemeToolbar
        saveStatus={saveStatus}
        editLocales={editLocales}
        editLocale={editLocale}
        setEditLocale={setEditLocale}
        chromeDefaultLocale={chromeDefaultLocale}
        canTranslateChrome={canTranslateChrome}
        translatingChrome={translatingChrome}
        onTranslate={handleTranslateChrome}
        onRecapture={() => grab()}
        onDelete={isSuperAdmin ? handleDelete : undefined}
        hasTheme={hasTheme}
        detectedFramework={detectedFramework}
        siteId={siteId}
        analyzing={analyzing}
        isPremium={isPremium}
        canRegenerate={canRegenerate}
        regenRemaining={Math.max(0, freeRegens - regenCount)}
      />

      {/* Premium upsell when a free user has used up their free regeneration. */}
      {premiumBlocked && (
        <Modal open onClose={clearPremiumBlock} size="lg">
          <div className="relative">
            <div className="absolute top-3 right-3 z-20"><ModalClose onClose={clearPremiumBlock} /></div>
            <PremiumPanel
              feature="Regenera el teu tema"
              description="Ja has fet servir la teva regeneració gratuïta. Amb Premium pots tornar a capturar i regenerar el disseny del teu blog tantes vegades com vulguis quan canviïs la teva web."
              perks={[
                'Regeneracions de tema il·limitades',
                'Re-clona el disseny quan actualitzis la teva web',
                'Traducció del header i footer amb IA',
                'Domini propi i API en directe',
              ]}
            />
          </div>
        </Modal>
      )}

      {/* Split workspace: live controls on the left, real-render preview on the right. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)] gap-5 items-start">
        <div className="space-y-5 min-w-0">

        {nativeCardActive && (
          <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft p-3.5">
            <span className="w-8 h-8 rounded-lg bg-accent text-on-accent flex items-center justify-center shrink-0">
              <LayoutGrid className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text">Disseny de targetes clonat del lloc</p>
              <p className="text-xs text-muted mt-0.5">
                El feed replica les targetes d&apos;article originals{nativeCardColumns ? ` · ${nativeCardColumns} columnes` : ''}. Pots tornar al disseny premium de Carma.
              </p>
            </div>
            <button
              type="button"
              onClick={clearNativeCard}
              className="cursor-pointer shrink-0 text-xs font-bold text-accent hover:underline whitespace-nowrap mt-0.5"
            >
              Usar disseny propi
            </button>
          </div>
        )}

        {!nativeCardActive && isSuperAdmin && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle p-3.5">
            <span className="w-8 h-8 rounded-lg bg-surface text-muted border border-border flex items-center justify-center shrink-0">
              <Newspaper className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text">Replica el disseny del blog del client</p>
              <p className="text-xs text-muted mt-0.5 mb-2 leading-relaxed">
                No hem detectat cap blog automàticament. Indica&apos;n la URL i tornarem a capturar per clonar-ne les targetes.
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={blogUrl}
                  onChange={e => setBlogUrl(e.target.value)}
                  placeholder="https://elclient.com/noticies"
                  disabled={analyzing}
                  className="flex-1 min-w-0 h-9 px-3 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-subtle focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => grab()}
                  disabled={analyzing || !blogUrl.trim()}
                  className="cursor-pointer shrink-0 h-9 px-3.5 rounded-lg bg-accent text-on-accent text-xs font-bold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Capturar
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Look & Feel — ONE unified, highly-visual picker that sets layout + style
          together (replaces the old separate "Estil del blog" + "Estil del feed"
          controls). Never touches the captured brand: colors/fonts stay from the
          clone. */}
      <LookFeelPanel tokens={tokens} setToken={setToken} />

      {/* The detailed accordion is the pro path: superadmins see it directly;
          clients get it tucked behind "Ajustos avançats" so the default view
          stays preset-first and calm. */}
      <MaybeAdvanced advanced={!isSuperAdmin}>
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <Section
          icon={Sparkles}
          title="Encapçalament"
          summary={sectionTitle ? `«${sectionTitle.slice(0, 40)}»` : 'Sense títol personalitzat'}
          open={openSection === 'heading'}
          onToggle={() => setOpenSection('heading')}
        >
          <HeadingPanel
            tokens={tokens}
            setToken={setToken}
            sectionTitle={sectionTitle}
            setSectionTitle={setSectionTitle}
          />
        </Section>

        <Section
          icon={Palette}
          title="Disseny"
          summary={`Accent ${String(tokens.colorAccent ?? '#-')} · ${fontPresetName(tokens)}`}
          open={openSection === 'design'}
          onToggle={() => setOpenSection('design')}
        >
          <DesignPanel tokens={tokens} setToken={setToken} />
        </Section>

        <Section
          icon={LayoutGrid}
          title="Disposició"
          summary={
            tokens.feedLayout && tokens.feedLayout !== 'standard'
              ? (FEED_LAYOUTS.find(l => l.id === tokens.feedLayout)?.name ?? 'Personalitzat')
              : (tokens.layout === 'list' ? 'Llista' : `Graella · ${tokens.columns ?? '3'} columnes`)
          }
          open={openSection === 'layout'}
          onToggle={() => setOpenSection('layout')}
        >
          <LayoutPanel tokens={tokens} setToken={setToken} />
        </Section>
      </div>
      </MaybeAdvanced>

      {/* Visual chrome editor — its own surface because it's a different mental model. */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="p-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text">Header i footer</h4>
              <p className="text-xs text-muted mt-1">
                El header i el footer originals del lloc s&apos;injecten tal qual amb els seus estils. Edita el codi o els enllaços del menú.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0">
              <StructureChip icon={PanelTop} label="Header" ok={!!extractedHeader} />
              <StructureChip icon={PanelBottom} label="Footer" ok={!!extractedFooter} />
              <StructureChip icon={FileCode2} label="Estils" ok={!!extractedHead} />
            </div>
          </div>
        </div>

        <div className="p-6">
          <VisualChromeEditor
            header={extractedHeader}
            footer={extractedFooter}
            head={extractedHead}
            onHeaderChange={setExtractedHeader}
            onFooterChange={setExtractedFooter}
            onHeadChange={setExtractedHead}
          />
        </div>

        {(extractedHeader || extractedFooter) && (
          <details className="border-t border-border group" open>
            <summary className="cursor-pointer flex items-center gap-2 px-6 py-3 text-xs font-semibold text-subtle hover:text-text hover:bg-surface-hover transition-colors">
              <PanelTop className="w-3.5 h-3.5" />
              Menú de navegació
              <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-6 pb-6 pt-1">
              <p className="text-xs text-muted mb-4 leading-relaxed">
                Afegeix, edita, reordena o elimina els enllaços del menú. Els canvis conserven l’estil capturat i es desen automàticament.
              </p>
              <NavEditor
                header={extractedHeader}
                footer={extractedFooter}
                onHeaderChange={setExtractedHeader}
                onFooterChange={setExtractedFooter}
              />
            </div>
          </details>
        )}

        {(externalStyles.length > 0 || externalScripts.length > 0 || fontLinks.length > 0) && (
          <details className="border-t border-border group">
            <summary className="cursor-pointer flex items-center gap-2 px-6 py-3 text-xs font-semibold text-subtle hover:text-text hover:bg-surface-hover transition-colors">
              <MoreHorizontal className="w-3.5 h-3.5" />
              Recursos detectats
              <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-6 pb-5 flex flex-wrap gap-1.5">
              {externalStyles.length > 0 && <ResourcePill label={`${externalStyles.length} fulls CSS`} />}
              {externalScripts.length > 0 && <ResourcePill label={`${externalScripts.length} scripts`} />}
              {fontLinks.length > 0 && <ResourcePill label={`${fontLinks.length} tipografies`} />}
            </div>
          </details>
        )}
        </div>
        </div>

        <ThemePreview
          siteId={siteId}
          tokens={tokens}
          saving={saveStatus === 'saving'}
          savedAt={savedAt}
          className="xl:sticky xl:top-4 min-h-[620px] xl:h-[calc(100vh-2rem)]"
        />
      </div>
    </div>
  )
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

function ThemeToolbar({
  saveStatus, editLocales, editLocale, setEditLocale, chromeDefaultLocale,
  canTranslateChrome, translatingChrome, onTranslate,
  onRecapture, onDelete, hasTheme, detectedFramework, siteId, analyzing,
  isPremium = true, canRegenerate = true, regenRemaining = 0,
}: {
  saveStatus: SaveStatus
  editLocales: Locale[]
  editLocale: Locale
  setEditLocale: (l: Locale) => void
  chromeDefaultLocale: Locale
  canTranslateChrome: boolean
  translatingChrome: boolean
  onTranslate: () => void
  onRecapture?: () => void
  onDelete?: () => void
  hasTheme: boolean
  detectedFramework?: string | null
  siteId?: string
  analyzing?: boolean
  isPremium?: boolean
  canRegenerate?: boolean
  regenRemaining?: number
}) {
  const multiLocale = editLocales.length > 1

  return (
    <div className="bg-surface border border-border rounded-xl px-3.5 py-2.5 flex flex-wrap items-center gap-2">
      {/* Save status — first, so it's always in the corner of the eye */}
      <SaveIndicator status={saveStatus} hasTheme={hasTheme} />

      {/* Framework detected — compact pill inline */}
      {hasTheme && detectedFramework && siteId && (
        <Link
          href={`/dashboard/sites/${siteId}?tab=connexio`}
          className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-success bg-success-soft border border-success/20 hover:opacity-90 transition-opacity"
          title={`${FRAMEWORK_LABELS[detectedFramework] ?? detectedFramework} detectat · veure connexió`}
        >
          <Plug className="w-3 h-3" />
          {FRAMEWORK_LABELS[detectedFramework] ?? detectedFramework}
        </Link>
      )}

      {/* Language selector — only when multiple locales */}
      {multiLocale && (
        <div className="flex items-center gap-0.5 bg-surface-subtle border border-border rounded-md p-0.5">
          {editLocales.map(loc => {
            const isActive = loc === editLocale
            return (
              <button
                key={loc}
                type="button"
                onClick={() => setEditLocale(loc)}
                title={LOCALE_META[loc].label}
                className={cn(
                  'cursor-pointer flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors',
                  isActive ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
                )}
              >
                <span>{LOCALE_META[loc].flag}</span>
                <span className="uppercase">{loc}</span>
                {loc === chromeDefaultLocale && (
                  <span className={cn('text-[9px] font-bold', isActive ? 'text-accent' : 'text-subtle')}>·</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Translate (only on non-base locale) */}
      {multiLocale && editLocale !== chromeDefaultLocale && (
        <button
          type="button"
          onClick={onTranslate}
          disabled={translatingChrome}
          title={canTranslateChrome ? `Traduir de ${LOCALE_META[chromeDefaultLocale].native}` : 'Funció Premium'}
          className={cn(
            'cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-60',
            canTranslateChrome
              ? 'text-accent bg-accent-soft hover:opacity-90'
              : 'text-warning bg-warning-soft hover:opacity-90',
          )}
        >
          {translatingChrome
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : canTranslateChrome ? <Sparkles className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
          {translatingChrome ? 'Traduint…' : 'Traduir'}
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Prominent Regenerate (Gold) — re-clone the design from the source site.
          Free clients get one free regeneration; after that the click surfaces a
          Premium upsell (handled by grab → premiumBlocked). */}
      {onRecapture && (
        <div className="flex items-center gap-2.5">
          {!isPremium && (
            <span className={cn(
              'hidden md:inline-flex items-center gap-1 text-xs font-semibold',
              canRegenerate ? 'text-subtle' : 'text-accent',
            )}>
              {canRegenerate
                ? `${regenRemaining} regeneració${regenRemaining === 1 ? '' : 'ns'} gratuïta${regenRemaining === 1 ? '' : 'es'}`
                : 'Límit gratuït exhaurit'}
            </span>
          )}
          <Button
            onClick={onRecapture}
            disabled={analyzing}
            size="md"
            glow={canRegenerate}
            variant={canRegenerate ? 'primary' : 'secondary'}
            iconLeft={canRegenerate ? <Wand2 className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
            title="Tornar a capturar i regenerar el tema des de la URL d'origen"
          >
            Regenerar el tema
          </Button>
        </div>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-subtle hover:text-danger hover:bg-danger-soft transition-colors"
          title="Eliminar el tema"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function SaveIndicator({ status, hasTheme }: { status: SaveStatus; hasTheme: boolean }) {
  if (!hasTheme) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-subtle">
        <Palette className="w-3.5 h-3.5" /> Theme Studio
      </span>
    )
  }
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Desant…
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-danger bg-danger-soft rounded-md">
        <CloudOff className="w-3.5 h-3.5" /> Error en desar
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-success">
        <Check className="w-3.5 h-3.5" /> Desat
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-subtle">
      <Cloud className="w-3.5 h-3.5" /> Desat automàtic
    </span>
  )
}

// ── Empty grabber (no theme yet) ────────────────────────────────────────────

function EmptyGrabber({
  url, setUrl, blogUrl, setBlogUrl, analyzing, error, onGrab,
}: {
  url: string
  setUrl: (v: string) => void
  blogUrl: string
  setBlogUrl: (v: string) => void
  analyzing: boolean
  error: string | null
  onGrab: () => void
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-accent-soft text-accent flex items-center justify-center mb-4">
        <Wand2 className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-text">Captura el tema d&apos;un lloc existent</h3>
      <p className="text-sm text-muted mt-1.5 max-w-md mx-auto leading-relaxed">
        Enganxa la URL del lloc del client. Injectem el header i el footer originals tal qual (amb els seus estils) i n&apos;extreiem colors i tipografies per al blog.
      </p>
      <div className="mt-5 max-w-md mx-auto flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onGrab()}
            placeholder="https://www.elmeuclient.com"
            disabled={analyzing}
            className="w-full h-11 pl-9 pr-3 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent text-sm text-text placeholder:text-subtle transition-colors disabled:opacity-60"
          />
        </div>
        {/* The capture modal is the single progress surface — no inline spinner
            here (that produced the "double loader"). Disabled while in flight. */}
        <Button
          glow
          onClick={() => onGrab()}
          disabled={!url.trim() || analyzing}
          iconLeft={<Wand2 className="w-4 h-4" />}
        >
          Capturar
        </Button>
      </div>
      {/* Optional Blog URL — guides card cloning when auto-detection is unsure. */}
      <div className="mt-2.5 max-w-md mx-auto">
        <div className="relative">
          <Newspaper className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
          <input
            type="url"
            value={blogUrl}
            onChange={e => setBlogUrl(e.target.value)}
            placeholder="URL del blog/notícies (opcional)"
            disabled={analyzing}
            className="w-full h-10 pl-9 pr-3 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent text-sm text-text placeholder:text-subtle transition-colors disabled:opacity-60"
          />
        </div>
        <p className="text-xs text-subtle mt-1.5 leading-relaxed">
          Si el lloc ja té un blog/secció de notícies, indica&apos;n la URL i en clonarem el disseny de targetes.
        </p>
      </div>
      {error && !analyzing && (
        <div className="mt-4 max-w-md mx-auto flex items-start gap-2 p-2.5 bg-danger-soft border border-danger/20 rounded-lg text-left">
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger font-medium">{error}</p>
        </div>
      )}
    </div>
  )
}

// ── Section primitive ───────────────────────────────────────────────────────

function Section({
  icon: Icon, title, summary, open, onToggle, children,
}: {
  icon: typeof Palette
  title: string
  summary?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="cursor-pointer w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-hover transition-colors"
        aria-expanded={open}
      >
        <span className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
          open ? 'bg-accent-soft text-accent' : 'bg-surface-subtle text-muted',
        )}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h5 className="text-sm font-semibold text-text leading-tight">{title}</h5>
          {!open && summary && (
            <p className="text-xs text-subtle mt-0.5 truncate">{summary}</p>
          )}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-subtle transition-transform shrink-0', open && 'rotate-180 text-accent')} />
      </button>
      {open && (
        <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </section>
  )
}

// ── Heading panel ───────────────────────────────────────────────────────────

function HeadingPanel({
  tokens, setToken, sectionTitle, setSectionTitle,
}: {
  tokens: DesignTokens
  setToken: (k: keyof DesignTokens, v: DesignTokens[keyof DesignTokens]) => void
  sectionTitle: string
  setSectionTitle: (v: string) => void
}) {
  return (
    <div className="space-y-5">
      {/* Live preview of the title */}
      <InlineHeading
        value={sectionTitle}
        onChange={setSectionTitle}
        fontHeading={String(tokens.fontHeading ?? '')}
        color={String(tokens.sectionTitleColor ?? tokens.colorText ?? '#111111')}
        size={String(tokens.sectionTitleSize ?? '1.6rem')}
        weight={String(tokens.sectionTitleWeight ?? '800')}
        align={tokens.sectionTitleAlign ?? 'left'}
        background={String(tokens.headingImage ? '#1c1917' : (tokens.colorBg ?? '#ffffff'))}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Color">
          <ColorInput
            value={String(tokens.sectionTitleColor ?? tokens.colorText ?? '#111111')}
            onChange={v => setToken('sectionTitleColor', v)}
            placeholder={String(tokens.colorText ?? '#111')}
          />
        </Field>
        <Field label="Mida">
          <TextInput
            value={String(tokens.sectionTitleSize ?? '')}
            onChange={v => setToken('sectionTitleSize', v)}
            placeholder="1.6rem"
          />
        </Field>
        <Field label="Pes">
          <select
            value={String(tokens.sectionTitleWeight ?? '800')}
            onChange={e => setToken('sectionTitleWeight', e.target.value)}
            className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent text-sm text-text transition-colors"
          >
            {[
              ['400', 'Normal'], ['500', 'Mig'], ['600', 'Seminegre'],
              ['700', 'Negre'], ['800', 'Extranegre'], ['900', 'Ultra'],
            ].map(([w, l]) => (<option key={w} value={w}>{l}</option>))}
          </select>
        </Field>
        <Field label="Alineació">
          <SegmentedControl
            value={tokens.sectionTitleAlign ?? 'left'}
            onChange={v => setToken('sectionTitleAlign', v)}
            options={[
              { value: 'left',   icon: <AlignLeft   className="w-3.5 h-3.5" />, label: 'Esquerra' },
              { value: 'center', icon: <AlignCenter className="w-3.5 h-3.5" />, label: 'Centre' },
              { value: 'right',  icon: <AlignRight  className="w-3.5 h-3.5" />, label: 'Dreta' },
            ]}
          />
        </Field>
      </div>

      <details className="group rounded-lg bg-surface-subtle border border-border">
        <summary className="cursor-pointer flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted hover:text-text">
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          Opcions avançades
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amplada">
              <TextInput
                value={String(tokens.sectionTitleWidth ?? '')}
                onChange={v => setToken('sectionTitleWidth', v)}
                placeholder="100% / 720px"
              />
            </Field>
            <Field label="Alçada mín.">
              <TextInput
                value={String(tokens.sectionTitleHeight ?? '')}
                onChange={v => setToken('sectionTitleHeight', v)}
                placeholder="auto / 120px"
              />
            </Field>
          </div>
          <Field label="Imatge de fons (URL)">
            <TextInput
              value={String(tokens.headingImage ?? '')}
              onChange={v => setToken('headingImage', v)}
              placeholder="https://example.com/banner.jpg"
              type="url"
            />
          </Field>
          <Toggle
            label="Mostrar fil d'Ariadna"
            checked={!!tokens.showBreadcrumb}
            onChange={v => setToken('showBreadcrumb', v)}
          />
        </div>
      </details>
    </div>
  )
}

// ── Design panel — colors + typography + sizes ──────────────────────────────

function fontPresetName(tokens: DesignTokens): string {
  const heading = String(tokens.fontHeading ?? '').toLowerCase()
  const match = FONT_PRESETS.find(p => p.heading.toLowerCase() === heading)
  if (match) return match.name
  if (!heading) return 'Per defecte'
  return 'Personalitzat'
}

function DesignPanel({
  tokens, setToken,
}: {
  tokens: DesignTokens
  setToken: (k: keyof DesignTokens, v: DesignTokens[keyof DesignTokens]) => void
}) {
  const currentPresetId = FONT_PRESETS.find(p => p.heading === tokens.fontHeading)?.id

  const applyPreset = (id: string) => {
    const p = FONT_PRESETS.find(x => x.id === id)
    if (!p) return
    setToken('fontHeading', p.heading)
    setToken('fontBody', p.body)
  }

  return (
    <div className="space-y-6">
      {/* Colors — visual swatch grid */}
      <div>
        <h6 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2.5">Colors</h6>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COLOR_FIELDS.map(({ key, label, hint }) => (
            <ColorSwatch
              key={key}
              label={label}
              hint={hint}
              value={String(tokens[key] ?? '')}
              onChange={v => setToken(key, v)}
            />
          ))}
        </div>
      </div>

      {/* Typography — preset chooser + advanced custom override */}
      <div>
        <h6 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2.5">Tipografia</h6>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FONT_PRESETS.map(p => {
            const active = currentPresetId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  'cursor-pointer text-left p-3 rounded-lg border transition-colors',
                  active
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:border-border-strong hover:bg-surface-hover',
                )}
              >
                <p
                  className="text-base font-semibold text-text truncate"
                  style={{ fontFamily: p.heading }}
                >
                  {p.name}
                </p>
                <p
                  className="text-xs text-muted mt-0.5 truncate"
                  style={{ fontFamily: p.body }}
                >
                  {p.sub}
                </p>
              </button>
            )
          })}
        </div>
        <details className="mt-2 group">
          <summary className="cursor-pointer flex items-center gap-1.5 text-xs font-semibold text-subtle hover:text-text">
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            CSS personalitzat
          </summary>
          <div className="mt-2 space-y-2">
            <Field label="Títols (font-family)">
              <TextInput
                value={String(tokens.fontHeading ?? '')}
                onChange={v => setToken('fontHeading', v)}
                placeholder='"Inter", system-ui, sans-serif'
                mono
              />
            </Field>
            <Field label="Text (font-family)">
              <TextInput
                value={String(tokens.fontBody ?? '')}
                onChange={v => setToken('fontBody', v)}
                placeholder='"Inter", system-ui, sans-serif'
                mono
              />
            </Field>
          </div>
        </details>
      </div>

      {/* Sizes — compact, inline */}
      <div>
        <h6 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2.5 flex items-center gap-1.5">
          <Ruler className="w-3 h-3" /> Mides
        </h6>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { key: 'baseFontSize' as const, label: 'Base text',  placeholder: '16px' },
            { key: 'radius' as const,        label: 'Radi',       placeholder: '10px' },
            { key: 'radiusLg' as const,      label: 'Radi gran',  placeholder: '16px' },
            { key: 'maxWidth' as const,      label: 'Amplada màx.', placeholder: '1200px' },
          ].map(({ key, label, placeholder }) => (
            <Field key={key} label={label}>
              <TextInput
                value={String(tokens[key] ?? '')}
                onChange={v => setToken(key, v)}
                placeholder={placeholder}
                mono
              />
            </Field>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Layout panel ────────────────────────────────────────────────────────────

function LayoutPanel({
  tokens, setToken,
}: {
  tokens: DesignTokens
  setToken: (k: keyof DesignTokens, v: DesignTokens[keyof DesignTokens]) => void
}) {
  const feed = tokens.feedLayout ?? 'standard'
  return (
    <div className="space-y-5">
      <p className="text-xs text-subtle leading-relaxed">
        L&apos;aspecte general (disposició + estil) es tria a «Aspecte i estil», a dalt. Aquí pots afinar la graella quan fas servir l&apos;aspecte Predeterminat.
      </p>

      {/* Grid/list + columns apply to the Estàndard look (the other looks define
          their own structure). */}
      {feed === 'standard' && (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">Format de les targetes</p>
            <SegmentedControl
              value={tokens.layout === 'list' ? 'list' : 'grid'}
              onChange={v => setToken('layout', v as 'grid' | 'list')}
              options={[
                { value: 'grid', icon: <LayoutGrid className="w-3.5 h-3.5" />, label: 'Graella' },
                { value: 'list', icon: <Rows3 className="w-3.5 h-3.5" />, label: 'Llista' },
              ]}
            />
          </div>

          {tokens.layout !== 'list' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">Columnes (escriptori)</p>
              <div className="flex gap-2">
                {(['2', '3', '4'] as BlogColumns[]).map(c => (
                  <button
                    key={c}
                    onClick={() => setToken('columns', c)}
                    className={cn(
                      'cursor-pointer flex-1 h-10 rounded-lg text-sm font-semibold border transition-colors',
                      tokens.columns === c
                        ? 'bg-accent border-accent text-on-accent'
                        : 'bg-surface-subtle border-border text-muted hover:bg-surface-hover hover:text-text',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Small primitives ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold uppercase tracking-wider text-subtle">{label}</label>
      {children}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder, type = 'text', mono = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'url'
  mono?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text placeholder:text-subtle transition-colors',
        mono && 'font-mono text-xs',
      )}
    />
  )
}

function ColorInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2 h-9 bg-surface-subtle border border-border rounded-lg pl-1 pr-2 focus-within:border-accent focus-within:bg-surface transition-colors">
      <input
        type="color"
        value={isHex(value) ? value : '#111111'}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
        aria-label="Selector de color"
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-xs font-mono text-text"
      />
    </div>
  )
}

function ColorSwatch({
  label, hint, value, onChange,
}: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer w-full text-left bg-surface border border-border rounded-lg p-2.5 hover:border-border-strong transition-colors"
      >
        <div
          className="w-full aspect-[4/1] rounded-md border border-border mb-2"
          style={{ background: value || '#ffffff' }}
          aria-hidden
        />
        <p className="text-xs font-semibold text-text truncate">{label}</p>
        <p className="text-xs text-subtle truncate">{hint}</p>
      </button>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-pop p-2.5 space-y-2">
          <ColorInput value={value} onChange={onChange} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer w-full h-7 text-xs font-semibold text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors"
          >
            Fet
          </button>
        </div>
      )}
    </div>
  )
}

function SegmentedControl<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; icon?: ReactNode; label: string }[]
}) {
  return (
    <div className="flex items-center gap-0.5 bg-surface-subtle border border-border rounded-lg p-0.5">
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            title={o.label}
            className={cn(
              'cursor-pointer flex flex-1 items-center justify-center gap-1.5 h-8 rounded-md text-xs font-semibold transition-colors',
              active ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
            )}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={cn(
          'cursor-pointer relative w-10 h-5 rounded-full transition-colors shrink-0',
          checked ? 'bg-accent' : 'bg-border-strong',
        )}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}

function StructureChip({ icon: Icon, label, ok }: { icon: typeof PanelTop; label: string; ok: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold',
      ok ? 'bg-success-soft text-success' : 'bg-surface-subtle text-subtle',
    )}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

function ResourcePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-surface-subtle text-subtle border border-border">
      {label}
    </span>
  )
}

// Inline, click-to-edit heading that previews the blog's main title using the
// live theme tokens (font + colors). Uncontrolled contentEditable: the DOM is
// only re-synced from `value` while unfocused, so the caret never jumps.
function InlineHeading({
  value, onChange, fontHeading, color, background, size, weight, align,
}: {
  value: string
  onChange: (v: string) => void
  fontHeading: string
  color: string
  background: string
  size: string
  weight: string
  align: 'left' | 'center' | 'right'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value
  }, [value])

  const headingStyle: CSSProperties = {
    fontFamily: fontHeading || undefined,
    color,
    fontSize: size || undefined,
    fontWeight: (weight as CSSProperties['fontWeight']) || undefined,
    textAlign: align,
  }

  return (
    <div
      className="relative rounded-xl border border-dashed border-border-strong hover:border-accent/40 focus-within:border-accent transition-colors px-5 py-4 min-h-[80px]"
      style={{ background }}
    >
      <div
        ref={ref}
        role="textbox"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        onInput={e => onChange((e.currentTarget.textContent ?? '').replace(/\s+/g, ' '))}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
        className="outline-none leading-tight break-words"
        style={headingStyle}
      />
      {!value && (
        <span
          className="pointer-events-none absolute left-5 top-4 leading-tight opacity-30"
          style={headingStyle}
        >
          Articles
        </span>
      )}
    </div>
  )
}

/* ── Look & Feel presets (Framer-style simplification) ─────────────────────── */

/** Clients see the detailed accordion behind a collapsed disclosure; superadmins
    see it directly (advanced=false renders children untouched). */
function MaybeAdvanced({ advanced, children }: { advanced: boolean; children: ReactNode }) {
  if (!advanced) return <>{children}</>
  return (
    <details className="group rounded-2xl border border-border bg-surface overflow-hidden">
      <summary className="cursor-pointer flex items-center gap-2 px-6 py-4 text-sm font-semibold text-muted hover:text-text hover:bg-surface-hover transition-colors">
        <Ruler className="w-4 h-4" />
        Ajustos avançats
        <span className="text-xs font-medium text-subtle hidden sm:inline">colors, tipografies i disposició al detall</span>
        <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border [&>div]:border-0 [&>div]:rounded-none">{children}</div>
    </details>
  )
}

/** Layout-accurate abstract mockup for a Look card — instant visual feedback of
    what the feed becomes. Pure CSS, no images. */
function LookGlyph({ kind }: { kind: GlyphKind }) {
  const box = 'rounded-[3px] bg-text/15'
  const line = 'rounded-full bg-text/25'
  if (kind === 'gridxl') {
    return (
      <div className="flex gap-2">
        {[0, 1].map(i => (
          <div key={i} className="flex-1 min-w-0 space-y-1">
            <div className={cn(box, 'w-full h-7')} />
            <div className={cn(line, 'w-3/4 h-1.5')} />
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'compact') {
    return (
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex-1 min-w-0 space-y-0.5">
            <div className={cn(box, 'w-full h-4')} />
            <div className={cn(line, 'w-full h-1')} />
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'editorial') {
    return (
      <div className="space-y-2">
        {[0, 1].map(i => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <div className={cn(line, 'w-5/6 h-1.5')} />
              <div className={cn(line, 'w-2/3 h-1')} />
            </div>
            <div className={cn(box, 'w-10 h-7 shrink-0')} />
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'minimal') {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(box, 'w-4 h-4 shrink-0')} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className={cn(line, 'w-4/5 h-1')} />
              <div className={cn(line, 'w-2/5 h-1')} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'overlay') {
    return (
      <div className="flex gap-1.5">
        {[0, 1].map(i => (
          <div key={i} className="relative flex-1 min-w-0 h-12 rounded-[4px] bg-text/15 overflow-hidden">
            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-text/60 to-transparent" />
            <div className="absolute inset-x-1.5 bottom-1.5 space-y-1">
              <div className="w-3/4 h-1 rounded-full bg-white/80" />
              <div className="w-1/2 h-1 rounded-full bg-white/50" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  // standard + magazine — a 3-up grid
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex-1 min-w-0 space-y-1">
          <div className={cn(box, 'w-full h-5')} />
          <div className={cn(line, 'w-4/5 h-1')} />
          <div className={cn(line, 'w-3/5 h-1')} />
        </div>
      ))}
    </div>
  )
}

function LookFeelPanel({
  tokens,
  setToken,
}: {
  tokens: DesignTokens
  setToken: (k: keyof DesignTokens, v: DesignTokens[keyof DesignTokens]) => void
}) {
  const active = (tokens.feedLayout ?? 'standard') as string

  const apply = (look: LookPreset) => {
    // One batched commit (the studio's debounced save persists it as one change).
    for (const [k, v] of Object.entries(look.patch)) {
      setToken(k as keyof DesignTokens, v as DesignTokens[keyof DesignTokens])
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-bold text-text">Aspecte i estil</h3>
      </div>
      <p className="text-xs text-muted mb-4">
        Tria un aspecte complet amb un sol clic — disposició i estil alhora. Els teus colors i tipografies capturats es conserven sempre.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {LOOK_PRESETS.map(look => {
          const isActive = active === look.id
          return (
            <button
              key={look.id}
              type="button"
              onClick={() => apply(look)}
              aria-pressed={isActive}
              title={look.tagline}
              className={cn(
                'group cursor-pointer text-left rounded-xl border p-3 transition-all',
                isActive
                  ? 'border-accent ring-2 ring-accent/25 bg-accent-soft/40'
                  : 'border-border bg-bg-elevated hover:border-border-strong hover:-translate-y-0.5',
              )}
            >
              <div className="rounded-lg bg-surface-subtle border border-border p-2.5 mb-2.5">
                <LookGlyph kind={look.glyph} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold text-text">{look.name}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-accent" />}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-subtle line-clamp-2">{look.tagline}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
