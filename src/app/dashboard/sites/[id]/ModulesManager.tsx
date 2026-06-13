'use client'

// Smart Modules control panel — the "Mòduls" tab (V2).
//
// A premium bento-grid of module cards (gold design system): each card has an
// icon tile, title, description, an on/off switch and, when active, a deep
// sub-panel (layout selector + rich typed controls) that expands with a smooth,
// physics-based height animation (framer-motion). Edits are optimistic and
// autosave (debounced) via saveSiteModules; on failure they revert with a toast.
//
// Preview paradigm: the embedded preview is an honest MOBILE device frame (the
// real /render, narrow). A prominent "Vista d'escriptori" button opens the full
// live desktop render in a new tab.
//
// Premium modules are gated for free clients (crown + upsell modal); the server
// action is the authoritative gate.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, Star, Sparkles, ArrowLeftRight, Mail, UserCircle, BookOpen,
  Lock, Megaphone, ListTree, Share2, ArrowUp, MoonStar, Puzzle, Crown,
  Monitor, FileText, LayoutList, RotateCw,
} from 'lucide-react'
import {
  MODULES, CATEGORY_META, resolveModule,
  type ModuleDef, type ModuleConfig, type SiteModules, type ModuleOption, type ModuleCategory,
} from '@/lib/modules/registry'
import { saveSiteModules } from '@/lib/actions/modules'
import SaveStatus, { type SaveState } from '@/components/ui/SaveStatus'
import { Modal, ModalClose } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { PremiumPanel, LockBadge } from './PremiumGate'
import { cn } from '@/lib/cn'

type OptValue = string | number | boolean | string[]

const ICONS: Record<string, typeof Puzzle> = {
  Search, Filter, Star, Sparkles, ArrowLeftRight, Mail, UserCircle, BookOpen,
  Lock, Megaphone, ListTree, Share2, ArrowUp, MoonStar,
}

const CATEGORY_ORDER: ModuleCategory[] = ['discovery', 'engagement', 'reading', 'growth']

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

  // ── Debounced optimistic autosave (with graceful revert) ──
  // lastGood holds the config that is known persisted; on a failed save we roll
  // back to it and surface a toast, so the UI never lies about what's live.
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
        // Revert to the last persisted config and tell the user.
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

  const toggle = (def: ModuleDef) => {
    const cur = resolveModule(config, def.id)!
    if (!cur.enabled && def.premium && !isPremium) { setBlocked(true); return }
    mutate(def.id, { enabled: !cur.enabled })
  }

  const activeCount = useMemo(
    () => MODULES.filter(m => resolveModule(config, m.id)?.enabled).length,
    [config],
  )

  const previewSrc = (previewMode === 'article' && previewPostSlug)
    ? `/render/${siteId}/${encodeURIComponent(previewPostSlug)}?preview=1&v=${savedAt}`
    : `/render/${siteId}?preview=1&v=${savedAt}`

  const openDesktop = () => window.open(`/render/${siteId}?v=${Date.now()}`, '_blank', 'noopener,noreferrer')

  return (
    <div className="space-y-5">
      {/* Toolbar / header */}
      <div className="bg-surface border border-border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <Puzzle className="w-4 h-4 text-accent" />
          Mòduls intel·ligents
        </span>
        <span className="text-xs font-semibold text-muted bg-surface-subtle border border-border rounded-full px-2.5 py-0.5">
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
          Vista d’escriptori
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
                      onVariant={v => mutate(def.id, { variant: v })}
                      onOption={(k, val) => mutate(def.id, { options: { [k]: val } })}
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
              Previsualització en directe
            </span>
            {previewPostSlug && (
              <div className="flex items-center gap-0.5 bg-surface-subtle border border-border rounded-lg p-0.5">
                <PreviewTab active={previewMode === 'feed'} onClick={() => setPreviewMode('feed')} icon={<LayoutList className="w-3.5 h-3.5" />} label="Feed" />
                <PreviewTab active={previewMode === 'article'} onClick={() => setPreviewMode('article')} icon={<FileText className="w-3.5 h-3.5" />} label="Article" />
              </div>
            )}
          </div>

          {/* Phone device frame */}
          <div className="mx-auto w-full max-w-[360px]">
            <div className="relative rounded-[2.5rem] bg-neutral-900 p-2.5 border border-neutral-800 shadow-[0_36px_70px_-30px_rgba(0,0,0,0.55)]">
              <div className="relative overflow-hidden rounded-[2rem] bg-white">
                {/* notch */}
                <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-5 w-32 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
                <iframe
                  key={previewSrc}
                  src={previewSrc}
                  title="Previsualització mòbil"
                  className="block w-full h-[720px] bg-white"
                  loading="lazy"
                  onLoad={() => setIframeLoading(false)}
                />
                {/* Smooth reload overlay (no white flash on save) */}
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
            Vista mòbil del teu blog real. Els mòduls hereten els colors i tipografies de la teva marca.
            Per a la vista completa, obre la <button type="button" onClick={openDesktop} className="cursor-pointer font-semibold text-accent hover:underline">vista d’escriptori</button>.
          </p>
        </div>
      </div>

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
        'cursor-pointer flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors',
        active ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
      )}
    >
      {icon}{label}
    </button>
  )
}

// ── Module card ───────────────────────────────────────────────────────────────

function ModuleCard({
  def, resolved, isPremium, onToggle, onVariant, onOption,
}: {
  def: ModuleDef
  resolved: { enabled: boolean; variant: string; options: Record<string, unknown> }
  isPremium: boolean
  onToggle: () => void
  onVariant: (v: string) => void
  onOption: (key: string, value: OptValue) => void
}) {
  const Icon = ICONS[def.icon] ?? Puzzle
  const locked = def.premium && !isPremium
  const on = resolved.enabled

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border p-4 transition-colors duration-200',
        on
          ? 'border-accent/60 bg-accent-soft/40 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.3)]'
          : 'border-border bg-surface hover:border-accent/40 hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.25)]',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn(
          'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors',
          on ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-muted group-hover:text-text',
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
          <p className="text-xs text-muted mt-0.5 leading-relaxed">{def.description}</p>
        </div>
        <ModuleSwitch checked={on} locked={locked} onClick={onToggle} />
      </div>

      {/* Deep sub-panel — physics-based height animation on expand/collapse */}
      <AnimatePresence initial={false}>
        {on && (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.8, opacity: { duration: 0.18 } }}
            style={{ overflow: 'hidden' }}
          >
            <div className="mt-4 pt-4 border-t border-border/70 space-y-4">
              {def.variants.length > 1 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-subtle mb-1.5">Disposició</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {def.variants.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onVariant(v.id)}
                        title={v.description}
                        className={cn(
                          'cursor-pointer text-left px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                          resolved.variant === v.id
                            ? 'border-accent bg-accent text-on-accent'
                            : 'border-border bg-surface text-muted hover:text-text hover:border-border-strong',
                        )}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-subtle mt-1.5 leading-snug">
                    {def.variants.find(v => v.id === resolved.variant)?.description}
                  </p>
                </div>
              )}

              {def.options?.map(opt => (
                <OptionField
                  key={opt.key}
                  opt={opt}
                  value={resolved.options[opt.key]}
                  options={resolved.options}
                  onChange={val => onOption(opt.key, val)}
                />
              ))}
            </div>
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
