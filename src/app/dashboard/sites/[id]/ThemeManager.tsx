'use client'

import Link from 'next/link'
import {
  Palette, Globe, Loader2, Wand2, AlertCircle,
  Trash2, Sparkles, Plug, Type, PanelTop, PanelBottom,
  Check, Cloud, CloudOff, LayoutGrid, Rows3, AlignLeft, AlignCenter, AlignRight,
  Heading, Ruler, Crown,
} from 'lucide-react'
import { useRef, useEffect, type ReactNode, type CSSProperties } from 'react'
import { type DesignTokens, type BlogColumns } from '@/lib/scrape/tokens'
import { LOCALE_META } from '@/lib/i18n/config'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Modal'
import { useThemeStudio, type SaveStatus } from './ThemeStudioContext'
import VisualChromeEditor from './VisualChromeEditor'
import { PremiumLockOverlay } from './PremiumGate'

// Re-export so existing imports (SiteDetailClient) keep resolving the type here.
export type { Theme } from './ThemeStudioContext'

const FRAMEWORK_LABELS: Record<string, string> = {
  wordpress: 'WordPress', nextjs: 'Next.js', astro: 'Astro', gatsby: 'Gatsby',
  hugo: 'Hugo', jekyll: 'Jekyll', webflow: 'Webflow', squarespace: 'Squarespace',
  wix: 'Wix', shopify: 'Shopify', vue: 'Vue', react: 'React', html: 'HTML estàtic',
}
const HOSTING_LABELS: Record<string, string> = {
  vercel: 'Vercel', netlify: 'Netlify', cloudflare: 'Cloudflare',
  aws: 'AWS', github: 'GitHub Pages', wpengine: 'WP Engine',
}

const COLOR_FIELDS: { key: keyof DesignTokens; label: string }[] = [
  { key: 'colorPrimary', label: 'Primari' },
  { key: 'colorAccent', label: 'Accent / enllaços' },
  { key: 'colorBg', label: 'Fons' },
  { key: 'colorSurface', label: 'Superfície (cards)' },
  { key: 'colorText', label: 'Text' },
  { key: 'colorMuted', label: 'Text secundari' },
  { key: 'colorBorder', label: 'Vores' },
]
const FONT_FIELDS: { key: keyof DesignTokens; label: string }[] = [
  { key: 'fontHeading', label: 'Tipografia títols' },
  { key: 'fontBody', label: 'Tipografia text' },
]
const SCALE_FIELDS: { key: keyof DesignTokens; label: string; placeholder: string }[] = [
  { key: 'baseFontSize', label: 'Mida base', placeholder: '16px' },
  { key: 'radius', label: 'Radi', placeholder: '10px' },
  { key: 'radiusLg', label: 'Radi gran', placeholder: '16px' },
  { key: 'maxWidth', label: 'Amplada màx.', placeholder: '1200px' },
]

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v.trim())

const headingInput = "w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-medium transition-all"

function HeadingField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-neutral-500">{label}</label>
      {children}
    </div>
  )
}

function Section({
  icon: Icon, title, desc, children,
}: {
  icon: typeof Palette
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section className="py-5 border-b border-neutral-100 last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-carma-50 text-carma-600 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <h5 className="text-xs font-bold uppercase tracking-widest text-neutral-700">{title}</h5>
      </div>
      {desc && <p className="text-xs text-neutral-400 mt-1.5 ml-9">{desc}</p>}
      <div className="mt-3.5 ml-9">{children}</div>
    </section>
  )
}

export default function ThemeManager({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const {
    siteId, hasTheme, saveStatus,
    url, setUrl, analyzing, error, grab, removeTheme,
    tokens, setToken,
    sectionTitle, setSectionTitle,
    extractedHeader, setExtractedHeader,
    extractedFooter, setExtractedFooter,
    detectedFramework, detectedHosting,
    externalStyles, externalScripts, fontLinks,
    editLocale, setEditLocale, editLocales, chromeDefaultLocale,
    canTranslateChrome, translatingChrome, translateChrome,
  } = useThemeStudio()

  const componentKb = Math.round(((extractedHeader.length + extractedFooter.length) / 1024) * 10) / 10

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

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-carma-500/10 blur-[80px] pointer-events-none rounded-full" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-carma-500/20 text-carma-300 rounded-2xl flex items-center justify-center">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Theme Studio · Magic Wand</h3>
              <p className="text-xs font-medium text-neutral-400 mt-1 max-w-md">
                Enganxa la URL del client. La IA reconstrueix el header i footer com a components natius totalment aïllats, i pots editar-los visualment clicant-hi. Tot es desa sol.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasTheme && <SaveIndicator status={saveStatus} />}
          </div>
        </div>
      </div>

      {/* URL grabber — re-capturing the source site is a Premium action. */}
      <PremiumLockOverlay locked={!isSuperAdmin} label="Re-capturar el lloc web">
      <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">1</span>
          <h4 className="text-sm font-bold text-neutral-900">Capturar el look &amp; feel</h4>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && grab()}
              placeholder="https://www.elmeuclient.com"
              disabled={analyzing}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-carma-500 text-sm font-medium transition-all disabled:opacity-60"
            />
          </div>
          <button
            onClick={grab}
            disabled={!url.trim() || analyzing}
            className="cursor-pointer px-5 py-2.5 bg-carma-500 hover:bg-carma-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {hasTheme ? 'Tornar a capturar' : 'Capturar tema'}
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 font-medium">{error}</p>
          </div>
        )}
        {analyzing && (
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-carma-50 border border-carma-100 rounded-lg">
            <Sparkles className="w-4 h-4 text-carma-500 shrink-0 mt-0.5 animate-pulse" />
            <p className="text-xs text-carma-700 font-medium">La IA reconstrueix el header i el footer com a components natius i aïllats, amb estats :hover i menús desplegables en CSS pur. Pot trigar entre 15 i 40 segons…</p>
          </div>
        )}
      </div>
      </PremiumLockOverlay>

      {/* Detected framework banner */}
      {detectedFramework && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-500 text-white rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold uppercase tracking-widest text-green-700">Framework detectat</span>
            <p className="text-sm font-bold text-neutral-900 mt-0.5">
              {FRAMEWORK_LABELS[detectedFramework] ?? detectedFramework}
              {detectedHosting && (
                <span className="font-normal text-neutral-500"> · hosting {HOSTING_LABELS[detectedHosting] ?? detectedHosting}</span>
              )}
            </p>
          </div>
          <Link
            href={`/dashboard/sites/${siteId}?tab=connexio`}
            className="cursor-pointer flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shrink-0"
          >
            <Plug className="w-3.5 h-3.5" />
            Connexió
          </Link>
        </div>
      )}

      {hasTheme && (
        <>
          {/* Theme language switcher — edit header/footer/heading per language */}
          {editLocales.length > 1 && (
            <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm p-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 pl-1 pr-1 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                <Globe className="w-3.5 h-3.5" /> Idioma del tema
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {editLocales.map(loc => {
                  const isActive = loc === editLocale
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setEditLocale(loc)}
                      className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isActive ? 'bg-carma-500 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-100'}`}
                      title={LOCALE_META[loc].label}
                    >
                      <span>{LOCALE_META[loc].flag}</span>
                      <span>{LOCALE_META[loc].native}</span>
                      {loc === chromeDefaultLocale && (
                        <span className={`text-[10px] font-extrabold uppercase ${isActive ? 'text-white/80' : 'text-neutral-300'}`}>·&nbsp;base</span>
                      )}
                    </button>
                  )
                })}
              </div>
              {editLocale !== chromeDefaultLocale && (
                <button
                  type="button"
                  onClick={() => void handleTranslateChrome()}
                  disabled={translatingChrome}
                  className={`cursor-pointer ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                    canTranslateChrome
                      ? 'text-carma-700 bg-carma-50 border border-carma-100 hover:bg-carma-100'
                      : 'text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                  }`}
                  title={canTranslateChrome ? `Traduir des de ${LOCALE_META[chromeDefaultLocale].native} amb IA` : 'Funció Premium'}
                >
                  {translatingChrome
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : canTranslateChrome ? <Sparkles className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
                  {translatingChrome ? 'Traduint…' : `Traduir de ${LOCALE_META[chromeDefaultLocale].native}`}
                </button>
              )}
              <p className="w-full text-xs text-neutral-400 pl-1">
                {editLocale === chromeDefaultLocale
                  ? 'Idioma base — el header i footer capturats. Canvia d’idioma per editar-ne o traduir-ne les versions.'
                  : `Editant la versió en ${LOCALE_META[editLocale].native}. Tradueix-la des de la base amb IA o edita-la manualment.`}
              </p>
            </div>
          )}

          {/* Design tokens + layout */}
          <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-neutral-100 bg-gradient-to-r from-carma-50/40 to-white">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">2</span>
                <h4 className="text-sm font-bold text-neutral-900">Disseny del blog</h4>
              </div>
              <p className="text-xs text-neutral-500 mt-1 ml-8">Personalitza l&apos;encapçalament, els colors, la tipografia i la disposició. Tot s&apos;aplica i es desa en temps real.</p>
            </div>

            <div className="px-6">
            <Section icon={Heading} title="Encapçalament" desc="El títol principal del llistat. Clica per editar-ne el text i ajusta l'estil.">
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

              {/* Heading style controls */}
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <HeadingField label="Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={isHex(String(tokens.sectionTitleColor ?? tokens.colorText ?? '#111111')) ? String(tokens.sectionTitleColor ?? tokens.colorText) : '#111111'}
                      onChange={e => setToken('sectionTitleColor', e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border border-neutral-200 bg-white p-0 shrink-0"
                      aria-label="Color del títol"
                    />
                    <input
                      type="text"
                      value={String(tokens.sectionTitleColor ?? '')}
                      onChange={e => setToken('sectionTitleColor', e.target.value)}
                      placeholder={String(tokens.colorText ?? '#111')}
                      className={headingInput}
                    />
                  </div>
                </HeadingField>

                <HeadingField label="Mida (rem/px)">
                  <input
                    type="text"
                    value={String(tokens.sectionTitleSize ?? '')}
                    onChange={e => setToken('sectionTitleSize', e.target.value)}
                    placeholder="1.6rem"
                    className={headingInput}
                  />
                </HeadingField>

                <HeadingField label="Pes">
                  <select
                    value={String(tokens.sectionTitleWeight ?? '800')}
                    onChange={e => setToken('sectionTitleWeight', e.target.value)}
                    className={headingInput}
                  >
                    {['400', '500', '600', '700', '800', '900'].map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </HeadingField>

                <HeadingField label="Alineació">
                  <div className="flex gap-1">
                    {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setToken('sectionTitleAlign', a)}
                        className={`cursor-pointer flex-1 flex items-center justify-center py-1.5 rounded-lg border transition-all ${(tokens.sectionTitleAlign ?? 'left') === a ? 'bg-carma-500 border-carma-500 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </HeadingField>

                <HeadingField label="Amplada">
                  <input
                    type="text"
                    value={String(tokens.sectionTitleWidth ?? '')}
                    onChange={e => setToken('sectionTitleWidth', e.target.value)}
                    placeholder="100% / 720px"
                    className={headingInput}
                  />
                </HeadingField>

                <HeadingField label="Alçada mín.">
                  <input
                    type="text"
                    value={String(tokens.sectionTitleHeight ?? '')}
                    onChange={e => setToken('sectionTitleHeight', e.target.value)}
                    placeholder="auto / 120px"
                    className={headingInput}
                  />
                </HeadingField>

                <div className="col-span-2">
                  <HeadingField label="Imatge de fons (URL, opcional)">
                    <input
                      type="url"
                      value={String(tokens.headingImage ?? '')}
                      onChange={e => setToken('headingImage', e.target.value)}
                      placeholder="https://example.com/banner.jpg"
                      className={headingInput}
                    />
                  </HeadingField>
                </div>

                <div className="col-span-2 flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-neutral-600">Mostrar fil d&apos;Ariadna (breadcrumb)</span>
                  <button
                    type="button"
                    onClick={() => setToken('showBreadcrumb', !tokens.showBreadcrumb)}
                    role="switch"
                    aria-checked={!!tokens.showBreadcrumb}
                    className={`cursor-pointer relative w-11 h-6 rounded-full transition-colors ${tokens.showBreadcrumb ? 'bg-carma-500' : 'bg-neutral-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${tokens.showBreadcrumb ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>
            </Section>

            <Section icon={LayoutGrid} title="Disposició del llistat" desc="Com es presenten les targetes d'articles al llistat.">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1.5">
                  <LayoutOption active={tokens.layout === 'grid'} icon={LayoutGrid} label="Graella" onClick={() => setToken('layout', 'grid')} />
                  <LayoutOption active={tokens.layout === 'list'} icon={Rows3} label="Llista" onClick={() => setToken('layout', 'list')} />
                </div>
                {tokens.layout === 'grid' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-neutral-400">Columnes</span>
                    {(['2', '3', '4'] as BlogColumns[]).map(c => (
                      <button
                        key={c}
                        onClick={() => setToken('columns', c)}
                        className={`cursor-pointer w-8 h-8 rounded-lg text-xs font-bold border transition-all ${tokens.columns === c ? 'bg-carma-500 border-carma-500 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            <Section icon={Palette} title="Colors">
              <div className="grid sm:grid-cols-2 gap-2.5">
                {COLOR_FIELDS.map(({ key, label }) => {
                  const value = String(tokens[key] ?? '')
                  return (
                    <div key={key} className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 transition-colors hover:border-neutral-300">
                      {isHex(value) ? (
                        <input
                          type="color"
                          value={value}
                          onChange={e => setToken(key, e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-200 bg-white p-0 shrink-0"
                          aria-label={label}
                        />
                      ) : (
                        <span className="w-8 h-8 rounded-lg border border-neutral-200 shrink-0" style={{ background: value }} aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-neutral-600 truncate">{label}</p>
                        <input
                          type="text"
                          value={value}
                          onChange={e => setToken(key, e.target.value)}
                          className="w-full bg-transparent outline-none text-xs font-mono text-neutral-400 focus:text-neutral-700"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>

            <Section icon={Type} title="Tipografia" desc="Famílies tipogràfiques (CSS font-family).">
              <div className="space-y-2.5">
                {FONT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <span className="w-28 shrink-0 text-xs font-semibold text-neutral-500">{label}</span>
                    <input
                      type="text"
                      value={String(tokens[key] ?? '')}
                      onChange={e => setToken(key, e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                    />
                  </div>
                ))}
              </div>
            </Section>

            <Section icon={Ruler} title="Mides i forma" desc="Mida base del text, radis de cantonada i amplada màxima.">
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {SCALE_FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <span className="w-24 shrink-0 text-xs font-semibold text-neutral-500">{label}</span>
                    <input
                      type="text"
                      value={String(tokens[key] ?? '')}
                      onChange={e => setToken(key, e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 min-w-0 px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                    />
                  </div>
                ))}
              </div>
            </Section>
            </div>
          </div>

          {/* Visual editor */}
          <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 bg-carma-100 text-carma-700 text-xs font-bold rounded-full flex items-center justify-center">3</span>
                <h4 className="text-sm font-bold text-neutral-900">Editor visual del header i footer</h4>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <StructureChip icon={PanelTop} label="Header" ok={!!extractedHeader} detail={extractedHeader ? 'Reconstruït amb IA (natiu)' : 'No detectat'} />
                <StructureChip icon={PanelBottom} label="Footer" ok={!!extractedFooter} detail={extractedFooter ? 'Reconstruït amb IA (natiu)' : 'No detectat'} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <ResourcePill label={`${componentKb} KB natiu`} active={componentKb > 0} />
                <ResourcePill label={`${externalStyles.length} fulls CSS`} active={externalStyles.length > 0} />
                <ResourcePill label={`${externalScripts.length} scripts`} active={externalScripts.length > 0} />
                <ResourcePill label={`${fontLinks.length} tipografies`} active={fontLinks.length > 0} />
              </div>
            </div>

            <div className="px-6 pb-6 border-t border-neutral-100 pt-5">
              <p className="text-xs font-bold text-neutral-600 mb-1">Edició visual</p>
              <p className="text-xs text-neutral-400 mb-4">Clica qualsevol element de la previsualització per editar-ne el text, l&apos;enllaç, els colors i l&apos;espaiat. O usa el codi avançat. Tot es desa automàticament.</p>
              <VisualChromeEditor
                header={extractedHeader}
                footer={extractedFooter}
                onHeaderChange={setExtractedHeader}
                onFooterChange={setExtractedFooter}
              />
            </div>
          </div>

          {/* Danger zone — destructive, superadmin only */}
          {isSuperAdmin && (
            <div className="flex justify-end">
              <button
                onClick={handleDelete}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar tema
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-carma-200 bg-white/5 rounded-lg">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Desant…
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-300 bg-red-500/10 rounded-lg">
        <CloudOff className="w-3.5 h-3.5" /> Error en desar
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-green-300 bg-green-500/10 rounded-lg">
        <Check className="w-3.5 h-3.5" /> Desat
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-400 bg-white/5 rounded-lg">
      <Cloud className="w-3.5 h-3.5" /> Desat automàtic
    </span>
  )
}

function LayoutOption({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof LayoutGrid; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${active ? 'bg-carma-500 border-carma-500 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function StructureChip({ icon: Icon, label, ok, detail }: { icon: typeof PanelTop; label: string; ok: boolean; detail: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${ok ? 'bg-green-50/40 border-green-100' : 'bg-neutral-50 border-neutral-200'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ok ? 'bg-green-100 text-green-700' : 'bg-white text-neutral-400 border border-neutral-200'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-neutral-900">{label}</p>
        <p className={`text-xs font-medium ${ok ? 'text-green-700' : 'text-neutral-400'}`}>{detail}</p>
      </div>
    </div>
  )
}

function ResourcePill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${active ? 'bg-carma-50 text-carma-700 border-carma-100' : 'bg-neutral-50 text-neutral-400 border-neutral-200'}`}>
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
      className="relative rounded-xl border border-dashed border-neutral-300 hover:border-carma-300 focus-within:border-carma-400 transition-colors px-5 py-4"
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
