'use client'

// Smart Modules control panel — the "Mòduls" tab (V3, premium redesign).
//
// LAYOUT
//   · Left: a calm BENTO grid of compact module cards — icon, name, a SCOPE chip
//     (Feed / Article / Tot el blog), premium + AI badges, a one-line pitch and an
//     on/off switch. No inline forms, so the grid stays scannable however many
//     modules are on.
//   · Configuration opens in a focused SLIDE-OVER (framer-motion) — one module at
//     a time: a visual variant picker + the typed option fields. Zero clutter.
//   · Right: a sticky live MOBILE preview of the real /render. The Feed/Article
//     toggle is ALWAYS available (the article preview falls back to a sample when
//     the site has no published post yet), and the preview AUTO-SWITCHES to a
//     module's scope when you enable or configure it — so you always see the effect.
//
// Edits are optimistic + debounced autosave (saveSiteModules); failures revert with
// a toast. Premium modules are gated for free clients (crown + upsell modal); the
// server action is the authoritative gate.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, Star, Sparkles, ArrowLeftRight, Mail, UserCircle, BookOpen,
  Lock, Megaphone, ListTree, Share2, ArrowUp, MoonStar, Puzzle, Crown,
  Monitor, FileText, LayoutList, RotateCw, SlidersHorizontal, X, Check,
} from 'lucide-react'
import {
  MODULES, CATEGORY_META, resolveModule,
  type ModuleDef, type ModuleConfig, type SiteModules, type ModuleOption,
  type ModuleCategory, type ModuleScope,
} from '@/lib/modules/registry'
import { saveSiteModules } from '@/lib/actions/modules'
import SaveStatus, { type SaveState } from '@/components/ui/SaveStatus'
import { Modal, ModalClose } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { PremiumPanel, LockBadge } from './PremiumGate'
import { cn } from '@/lib/cn'

type OptValue = string | number | boolean | string[]

// Must match SAMPLE_ARTICLE_SLUG in src/lib/render/samplePosts.ts — the article
// render serves a sample article for this slug in preview mode, so the article
// preview works even before the site has a published post.
const SAMPLE_ARTICLE_SLUG = '__carma_demo__'

const ICONS: Record<string, typeof Puzzle> = {
  Search, Filter, Star, Sparkles, ArrowLeftRight, Mail, UserCircle, BookOpen,
  Lock, Megaphone, ListTree, Share2, ArrowUp, MoonStar,
}

const CATEGORY_ORDER: ModuleCategory[] = ['discovery', 'engagement', 'reading', 'growth']

const SCOPE_META: Record<ModuleScope, string> = {
  listing: 'Feed',
  article: 'Article',
  both: 'Tot el blog',
}

export default function ModulesManager({
  siteId, isPremium, initialModules, previewPostSlug,
}: {
  siteId: string
  isPremium: boolean
  initialModules: SiteModules | null
  previewPostSlug?: string
}) {
  const { toast } = useToast()
  const [config, setConfig] = useState<SiteModules>(initialModules ?? {})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [previewMode, setPreviewMode] = useState<'feed' | 'article'>('feed')
  const [iframeLoading, setIframeLoading] = useState(false)
  // The module whose configuration slide-over is open (null = closed).
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Debounced optimistic autosave (with graceful revert) ──
  // lastGood holds the config known to be persisted; on a failed save we roll back
  // to it and surface a toast, so the UI never lies about what's live.
  const serialized = JSON.stringify(config)
  const lastGoodSerialized = useRef(serialized)
  const lastGoodConfig = useRef<SiteModules>(config)
  const reqId = useRef(0)
  useEffect(() => {
    if (serialized === lastGoodSerialized.current) return
    setSaveState('saving')
    const id = ++reqId.current
    const snapshot = serialized
    const handle = setTimeout(async () => {
      const res = await saveSiteModules(siteId, JSON.parse(snapshot) as SiteModules)
      if (id !== reqId.current) return // a newer edit supersedes this save
      if (res.error) {
        setConfig(lastGoodConfig.current)
        setSaveState('error')
        toast('No s’ha pogut desar el canvi. S’ha restaurat l’estat anterior.', 'error')
        return
      }
      lastGoodSerialized.current = snapshot
      lastGoodConfig.current = JSON.parse(snapshot) as SiteModules
      setSavedAt(Date.now())
      setIframeLoading(true)
      setSaveState('saved')
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1600)
    }, 450)
    return () => clearTimeout(handle)
  }, [serialized, siteId, toast])

  // ── Mutations (merge into the raw stored entry, defaulting from the registry) ──
  const mutate = (id: string, patch: Partial<ModuleConfig>) => {
    setConfig(prev => {
      const cur = prev[id] ?? {}
      const next: ModuleConfig = {
        enabled: patch.enabled ?? cur.enabled ?? false,
        variant: patch.variant ?? cur.variant,
        options: patch.options ? { ...(cur.options ?? {}), ...patch.options } : cur.options,
      }
      return { ...prev, [id]: next }
    })
  }

  // Point the live preview at the surface where a module actually renders, so the
  // effect is visible the moment it's enabled/configured. 'both' leaves it as is.
  const syncPreview = (scope: ModuleScope) => {
    if (scope === 'article') setPreviewMode('article')
    else if (scope === 'listing') setPreviewMode('feed')
  }

  const toggle = (def: ModuleDef) => {
    const cur = resolveModule(config, def.id)!
    if (!cur.enabled && def.premium && !isPremium) { setBlocked(true); return }
    const turningOn = !cur.enabled
    mutate(def.id, { enabled: turningOn })
    if (turningOn) syncPreview(def.scope)
  }

  const openConfig = (def: ModuleDef) => {
    if (def.premium && !isPremium) { setBlocked(true); return }
    setSelectedId(def.id)
    syncPreview(def.scope)
  }

  const activeCount = useMemo(
    () => MODULES.filter(m => resolveModule(config, m.id)?.enabled).length,
    [config],
  )

  const articleSlug = previewPostSlug ?? SAMPLE_ARTICLE_SLUG
  const previewSrc = previewMode === 'article'
    ? `/render/${siteId}/${encodeURIComponent(articleSlug)}?preview=1&v=${savedAt}`
    : `/render/${siteId}?preview=1&v=${savedAt}`

  const openDesktop = () => window.open(`/render/${siteId}?v=${Date.now()}`, '_blank', 'noopener,noreferrer')

  const selectedDef = selectedId ? MODULES.find(m => m.id === selectedId) ?? null : null

  return (
    <div className="space-y-5">
      {/* Toolbar / header */}
      <div className="bg-surface border border-border rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent-soft text-accent">
            <Puzzle className="w-4 h-4" />
          </span>
          Mòduls intel·ligents
        </span>
        <span className="text-xs font-bold text-accent bg-accent-soft border border-accent/20 rounded-full px-2.5 py-0.5 tabular-nums">
          {activeCount} {activeCount === 1 ? 'actiu' : 'actius'}
        </span>
        <div className="flex-1" />
        {saveState === 'idle'
          ? <span className="hidden sm:inline text-xs text-subtle">Sincronització automàtica</span>
          : <SaveStatus state={saveState} />}
        <button
          type="button"
          onClick={openDesktop}
          className="cursor-pointer inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-text text-bg-elevated text-sm font-semibold transition-opacity hover:opacity-90"
          title="Obrir el render real d'escriptori en una pestanya nova"
        >
          <Monitor className="w-4 h-4" />
          <span className="hidden sm:inline">Vista d’escriptori</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-6 items-start">
        {/* Bento control panel */}
        <div className="space-y-7 min-w-0">
          {CATEGORY_ORDER.map(cat => {
            const mods = MODULES.filter(m => m.category === cat)
            if (!mods.length) return null
            const meta = CATEGORY_META[cat]
            return (
              <section key={cat}>
                <div className="mb-2.5">
                  <h3 className="text-sm font-bold text-text">{meta.label}</h3>
                  <p className="text-xs text-subtle">{meta.description}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  {mods.map(def => (
                    <ModuleCard
                      key={def.id}
                      def={def}
                      resolved={resolveModule(config, def.id)!}
                      isPremium={isPremium}
                      onToggle={() => toggle(def)}
                      onConfigure={() => openConfig(def)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        {/* Live MOBILE preview */}
        <div className="xl:sticky xl:top-4 w-full xl:w-auto">
          <div className="flex items-center justify-between gap-2 mb-3 xl:w-[360px] mx-auto">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              En directe
            </span>
            <div className="flex items-center gap-0.5 bg-surface-subtle border border-border rounded-lg p-0.5">
              <PreviewTab active={previewMode === 'feed'} onClick={() => setPreviewMode('feed')} icon={<LayoutList className="w-3.5 h-3.5" />} label="Feed" />
              <PreviewTab active={previewMode === 'article'} onClick={() => setPreviewMode('article')} icon={<FileText className="w-3.5 h-3.5" />} label="Article" />
            </div>
          </div>

          {/* Phone device frame */}
          <div className="mx-auto w-full max-w-[360px]">
            <div className="relative rounded-[2.5rem] bg-neutral-900 p-2.5 border border-neutral-800 shadow-[0_36px_70px_-30px_rgba(0,0,0,0.55)]">
              <div className="relative overflow-hidden rounded-[2rem] bg-white">
                <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-5 w-32 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
                <iframe
                  key={previewSrc}
                  src={previewSrc}
                  title="Previsualització mòbil"
                  className="block w-full h-[720px] bg-white"
                  loading="lazy"
                  onLoad={() => setIframeLoading(false)}
                />
                <div
                  className={cn(
                    'absolute inset-0 flex items-center justify-center bg-bg/60 backdrop-blur-[1px] transition-opacity duration-300',
                    iframeLoading ? 'opacity-100' : 'opacity-0 pointer-events-none',
                  )}
                >
                  <RotateCw className="w-5 h-5 text-muted animate-spin" />
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-subtle mt-3 leading-relaxed text-center max-w-[360px] mx-auto">
            {previewMode === 'article' && !previewPostSlug
              ? 'Article de mostra. Quan publiquis un article real, la vista el farà servir.'
              : 'Vista mòbil del teu blog real. Els mòduls hereten els colors i tipografies de la teva marca.'}
          </p>
        </div>
      </div>

      {/* Configuration slide-over */}
      <AnimatePresence>
        {selectedDef && (
          <ConfigSlideOver
            key={selectedDef.id}
            def={selectedDef}
            resolved={resolveModule(config, selectedDef.id)!}
            onClose={() => setSelectedId(null)}
            onToggle={() => toggle(selectedDef)}
            onVariant={v => mutate(selectedDef.id, { variant: v })}
            onOption={(k, val) => mutate(selectedDef.id, { options: { [k]: val } })}
          />
        )}
      </AnimatePresence>

      {/* Premium upsell */}
      {blocked && (
        <Modal open onClose={() => setBlocked(false)} size="lg">
          <div className="relative">
            <div className="absolute top-3 right-3 z-20"><ModalClose onClose={() => setBlocked(false)} /></div>
            <PremiumPanel
              feature="Mòduls Premium"
              description="Aquest mòdul forma part del pla Premium. Desbloqueja articles relacionats amb IA, newsletter, paywall, barra d’anuncis, índex de continguts i mode fosc per al teu blog."
              perks={[
                'Articles relacionats amb IA',
                'Captació de newsletter i leads',
                'Paywall estil Substack',
                'Barra d’anuncis, índex i mode fosc',
              ]}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

function PreviewTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors',
        active ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
      )}
    >
      {icon}{label}
    </button>
  )
}

// ── Module card (compact — configuration lives in the slide-over) ──────────────

function ModuleCard({
  def, resolved, isPremium, onToggle, onConfigure,
}: {
  def: ModuleDef
  resolved: { enabled: boolean; variant: string; options: Record<string, unknown> }
  isPremium: boolean
  onToggle: () => void
  onConfigure: () => void
}) {
  const Icon = ICONS[def.icon] ?? Puzzle
  const locked = def.premium && !isPremium
  const on = resolved.enabled
  const hasConfig = def.variants.length > 1 || !!def.options?.length

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border p-4 transition-all duration-200',
        on
          ? 'border-accent/60 bg-accent-soft/40 shadow-[0_12px_32px_-22px_rgba(0,0,0,0.35)]'
          : 'border-border bg-surface hover:border-accent/40 hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.25)]',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn(
          'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors',
          on ? 'bg-gradient-to-br from-accent to-accent-hover text-on-accent shadow-sm' : 'bg-surface-subtle text-muted group-hover:text-text',
        )}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-bold text-text leading-tight">{def.name}</h4>
            {def.premium && <LockBadge />}
            {def.ai && (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide text-accent bg-accent-soft border border-accent/20 rounded px-1 py-0.5">
                <Sparkles className="w-2.5 h-2.5" /> IA
              </span>
            )}
          </div>
          <div className="mt-1">
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-subtle bg-surface-subtle border border-border rounded px-1.5 py-0.5">
              {SCOPE_META[def.scope]}
            </span>
          </div>
          <p className="text-xs text-muted mt-1.5 leading-relaxed">{def.description}</p>
        </div>
        <ModuleSwitch checked={on} locked={locked} onClick={onToggle} />
      </div>

      {/* "Configurar" affordance — only when on AND the module has settings. */}
      <AnimatePresence initial={false}>
        {on && hasConfig && (
          <motion.div
            key="cfg"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.7, opacity: { duration: 0.15 } }}
            style={{ overflow: 'hidden' }}
          >
            <button
              type="button"
              onClick={onConfigure}
              className="cursor-pointer mt-3 w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-accent/30 bg-surface/70 text-xs font-bold text-accent hover:bg-accent-soft transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Configurar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ModuleSwitch({ checked, locked, onClick }: { checked: boolean; locked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={checked}
      title={locked ? 'Funció Premium' : checked ? 'Desactivar' : 'Activar'}
      className={cn(
        'cursor-pointer relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-border-strong',
        locked && !checked && 'opacity-70',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 flex items-center justify-center',
        checked && 'translate-x-5',
      )}>
        {locked && <Crown className="w-2.5 h-2.5 text-accent" strokeWidth={2.5} />}
      </span>
    </button>
  )
}

// ── Configuration slide-over ──────────────────────────────────────────────────

function ConfigSlideOver({
  def, resolved, onClose, onToggle, onVariant, onOption,
}: {
  def: ModuleDef
  resolved: { enabled: boolean; variant: string; options: Record<string, unknown> }
  onClose: () => void
  onToggle: () => void
  onVariant: (v: string) => void
  onOption: (key: string, value: OptValue) => void
}) {
  const Icon = ICONS[def.icon] ?? Puzzle

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Transparent click-catcher — keeps the live mobile preview fully visible on
          the right while you configure on the left (no dim). */}
      <motion.div
        className="fixed inset-0 z-[60]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      {/* Slides in from the LEFT (over the module grid), so it never covers the
          right-hand mobile preview — you watch the module change as you tune it. */}
      <motion.aside
        role="dialog"
        aria-label={`Configurar ${def.name}`}
        className="fixed left-0 top-0 z-[61] h-full w-full max-w-md bg-bg-elevated border-r border-border shadow-premium flex flex-col"
        initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start gap-3 p-5 border-b border-border">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-gradient-to-br from-accent to-accent-hover text-on-accent shadow-sm">
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-base font-bold text-text leading-tight">{def.name}</h3>
              {def.premium && <LockBadge />}
            </div>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">{def.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tancar"
            className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg text-subtle hover:text-text hover:bg-surface-hover transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {!resolved.enabled && (
            <button
              type="button"
              onClick={onToggle}
              className="cursor-pointer w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-accent text-on-accent text-sm font-bold hover:bg-accent-hover transition-colors"
            >
              <Check className="w-4 h-4" /> Activar aquest mòdul
            </button>
          )}

          {def.variants.length > 1 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-subtle mb-2">Disposició</p>
              <div className="grid gap-2">
                {def.variants.map(v => {
                  const active = resolved.variant === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onVariant(v.id)}
                      className={cn(
                        'cursor-pointer text-left rounded-xl border px-3.5 py-2.5 transition-colors flex items-start gap-2.5',
                        active ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-border-strong',
                      )}
                    >
                      <span className={cn(
                        'mt-0.5 flex items-center justify-center w-4 h-4 rounded-full border shrink-0 transition-colors',
                        active ? 'border-accent bg-accent text-on-accent' : 'border-border-strong text-transparent',
                      )}>
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                      <span className="min-w-0">
                        <span className={cn('block text-sm font-semibold', active ? 'text-accent' : 'text-text')}>{v.name}</span>
                        <span className="block text-xs text-subtle leading-snug mt-0.5">{v.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!!def.options?.length && (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-subtle">Opcions</p>
              {def.options.map(opt => (
                <OptionField
                  key={opt.key}
                  opt={opt}
                  value={resolved.options[opt.key]}
                  options={resolved.options}
                  onChange={val => onOption(opt.key, val)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer w-full h-10 rounded-xl bg-surface-subtle border border-border text-sm font-semibold text-text hover:bg-surface-hover transition-colors"
          >
            Fet
          </button>
        </div>
      </motion.aside>
    </>
  )
}

// ── Option fields ─────────────────────────────────────────────────────────────

function OptionField({
  opt, value, options, onChange,
}: {
  opt: ModuleOption
  value: unknown
  options: Record<string, unknown>
  onChange: (v: OptValue) => void
}) {
  // Conditional visibility.
  if (opt.showIf && !options[opt.showIf]) return null

  if (opt.type === 'group') {
    return <p className="text-xs font-bold uppercase tracking-wider text-subtle pt-1">{opt.label}</p>
  }

  if (opt.type === 'toggle') {
    const checked = typeof value === 'boolean' ? value : Boolean(opt.default)
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-text">{opt.label}</span>
          {opt.help && <p className="text-xs text-subtle leading-snug">{opt.help}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={cn('cursor-pointer relative w-9 h-5 rounded-full shrink-0 transition-colors', checked ? 'bg-accent' : 'bg-border-strong')}
        >
          <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
        </button>
      </div>
    )
  }

  const label = (
    <label className="block text-xs font-bold uppercase tracking-wider text-subtle mb-1">{opt.label}</label>
  )

  if (opt.type === 'range') {
    const n = typeof value === 'number' ? value : Number(opt.default)
    const min = opt.min ?? 0, max = opt.max ?? 10
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold uppercase tracking-wider text-subtle">{opt.label}</label>
          <span className="text-xs font-bold text-accent tabular-nums">{Number.isFinite(n) ? n : min}{opt.unit ?? ''}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={opt.step ?? 1}
          value={Number.isFinite(n) ? n : min}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 cursor-pointer accent-accent"
        />
        {opt.help && <p className="text-xs text-subtle mt-1 leading-snug">{opt.help}</p>}
      </div>
    )
  }

  if (opt.type === 'color') {
    const v = typeof value === 'string' ? value : String(opt.default ?? '')
    const isHex = /^#[0-9a-fA-F]{6}$/.test(v)
    return (
      <div>
        {label}
        <div className="flex items-center gap-2 h-9 bg-surface-subtle border border-border rounded-lg pl-1 pr-2 focus-within:border-accent transition-colors">
          <input
            type="color"
            value={isHex ? v : '#000000'}
            onChange={e => onChange(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
            aria-label={opt.label}
          />
          <input
            type="text"
            value={v}
            onChange={e => onChange(e.target.value)}
            placeholder="Per defecte (marca)"
            className="flex-1 min-w-0 bg-transparent outline-none text-xs font-mono text-text placeholder:text-subtle"
          />
          {v && (
            <button type="button" onClick={() => onChange('')} title="Restablir" className="cursor-pointer text-subtle hover:text-text text-xs font-semibold">×</button>
          )}
        </div>
        {opt.help && <p className="text-xs text-subtle mt-1 leading-snug">{opt.help}</p>}
      </div>
    )
  }

  if (opt.type === 'multiselect') {
    const selected = Array.isArray(value) ? (value as string[]) : (opt.default as string[])
    const toggleVal = (val: string) => {
      const next = selected.includes(val) ? selected.filter(x => x !== val) : [...selected, val]
      onChange(next)
    }
    return (
      <div>
        {label}
        <div className="flex flex-wrap gap-1.5">
          {opt.choices?.map(c => {
            const active = selected.includes(c.value)
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleVal(c.value)}
                className={cn(
                  'cursor-pointer px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors',
                  active
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border bg-surface text-muted hover:text-text hover:border-border-strong',
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (opt.type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          value={typeof value === 'string' ? value : String(opt.default ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={opt.placeholder}
          rows={2}
          className="w-full px-2.5 py-2 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text placeholder:text-subtle transition-colors resize-y"
        />
        {opt.help && <p className="text-xs text-subtle mt-1 leading-snug">{opt.help}</p>}
      </div>
    )
  }

  if (opt.type === 'number') {
    const n = typeof value === 'number' ? value : Number(opt.default)
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-text">{opt.label}</span>
          {opt.help && <p className="text-xs text-subtle leading-snug">{opt.help}</p>}
        </div>
        <input
          type="number"
          value={Number.isFinite(n) ? n : ''}
          min={opt.min}
          max={opt.max}
          onChange={e => onChange(Number(e.target.value))}
          className="w-20 h-9 px-2.5 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text text-center transition-colors"
        />
      </div>
    )
  }

  if (opt.type === 'select') {
    return (
      <div>
        {label}
        <select
          value={typeof value === 'string' ? value : String(opt.default ?? '')}
          onChange={e => onChange(e.target.value)}
          className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent text-sm text-text transition-colors"
        >
          {opt.choices?.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
    )
  }

  // text
  return (
    <div>
      {label}
      <input
        type="text"
        value={typeof value === 'string' ? value : String(opt.default ?? '')}
        onChange={e => onChange(e.target.value)}
        placeholder={opt.placeholder}
        className="w-full h-9 px-2.5 bg-surface-subtle border border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface text-sm text-text placeholder:text-subtle transition-colors"
      />
    </div>
  )
}
