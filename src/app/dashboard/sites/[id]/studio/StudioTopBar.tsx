'use client'

// Carma Studio — the top bar. Grouped, high-contrast controls: identity + undo/
// redo + save status on the left; the view/device/mode controls and site actions
// on the right, split into clear segmented groups. All wired to context.

import { Monitor, Tablet, Smartphone, Undo2, Redo2, ExternalLink, Wand2, Crown, Trash2, Check, Cloud, CloudOff, Newspaper, FileText, PenLine, Paintbrush, MousePointer2, Hand, ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import KnotSpinner from '@/components/ui/KnotSpinner'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Modal'
import { useThemeStudio } from '../ThemeStudioContext'
import type { Device } from './types'
import { cn } from '@/lib/cn'

export default function StudioTopBar({ device, setDevice, isSuperAdmin, globalOpen, onToggleGlobal, interact, onToggleInteract, exitHref }: {
  device: Device
  setDevice: (d: Device) => void
  isSuperAdmin: boolean
  globalOpen: boolean
  onToggleGlobal: () => void
  interact: boolean
  onToggleInteract: () => void
  exitHref?: string
}) {
  const s = useThemeStudio()
  const { toast } = useToast()
  const confirm = useConfirm()

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Eliminar el tema',
      message: 'Les pàgines de render tornaran al disseny per defecte. No es pot desfer.',
      confirmLabel: 'Eliminar', tone: 'danger',
    })
    if (!ok) return
    await s.removeTheme()
    toast('Tema eliminat')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-elevated px-3 py-2.5">
      {/* ── Identity + history ── */}
      {exitHref && (
        <a
          href={exitHref}
          title="Torna al lloc"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
        >
          <ArrowLeft className="h-4 w-4" /> Surt
        </a>
      )}
      <div className="flex items-center gap-2 pr-0.5">
        <EndlessKnot size={22} glow spin />
        <span className="text-sm font-bold tracking-tight text-text max-sm:hidden">Carma Studio</span>
      </div>

      <Divider />

      <div className="flex items-center gap-0.5 rounded-lg bg-surface-subtle p-0.5 ring-1 ring-border">
        <IconBtn label="Desfés (⌘Z)" disabled={!s.canUndo} onClick={s.undo}><Undo2 className="h-4 w-4" /></IconBtn>
        <IconBtn label="Refés (⌘⇧Z)" disabled={!s.canRedo} onClick={s.redo}><Redo2 className="h-4 w-4" /></IconBtn>
      </div>

      <SaveStatus status={s.saveStatus} />

      <div className="flex-1" />

      {/* ── View: Feed / Article ── */}
      <Seg
        options={[['feed', Newspaper, 'Feed'], ['article', FileText, 'Article']]}
        value={s.view}
        onChange={(v) => s.setView(v)}
      />

      {/* Deep content editing — one click away when an Article view shows a real post. */}
      {s.view === 'article' && s.editableArticle && (
        <button
          type="button"
          onClick={() => window.open(`/dashboard/sites/${s.siteId}/posts/${s.editableArticle!.id}/edit`, '_blank', 'noopener,noreferrer')}
          title="Obre l’editor complet del contingut"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
        >
          <PenLine className="h-4 w-4" /> Editor
        </button>
      )}

      {/* ── Device ── */}
      <Seg
        iconOnly
        options={[['desktop', Monitor, 'Escriptori'], ['tablet', Tablet, 'Tauleta'], ['mobile', Smartphone, 'Mòbil']]}
        value={device}
        onChange={setDevice}
      />

      <Divider />

      {/* ── Mode: Edit / Interact ── */}
      <Seg
        options={[[false, MousePointer2, 'Edita'], [true, Hand, 'Prova']]}
        value={interact}
        onChange={(v) => { if (interact !== v) onToggleInteract() }}
        titles={['Edita els elements', 'Prova els mòduls en directe (cerca, filtres, mode fosc)']}
      />

      {/* Site-wide theme (brand, typography, layout). */}
      <button
        type="button"
        onClick={onToggleGlobal}
        aria-pressed={globalOpen}
        title="Tema global: marca, tipografia i disposició"
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors',
          globalOpen ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-text hover:bg-surface-hover',
        )}
      >
        <Paintbrush className="h-4 w-4" /> Tema global
      </button>

      <Divider />

      {/* ── Site actions ── */}
      <button
        type="button"
        onClick={() => window.open(`/render/${s.siteId}?v=${Date.now()}`, '_blank', 'noopener,noreferrer')}
        title="Veure el lloc en viu en una pestanya nova"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
      >
        <ExternalLink className="h-4 w-4" /> <span className="max-md:hidden">En viu</span>
      </button>

      {/* Re-capture only makes sense when the theme CAME from a URL — a
          template blog has no source to regenerate from. */}
      {!!(s.url.trim() || s.baseUrl) && (
        <Button
          onClick={() => s.grab()}
          disabled={s.analyzing}
          size="sm"
          glow={s.canRegenerate}
          variant={s.canRegenerate ? 'primary' : 'secondary'}
          iconLeft={s.canRegenerate ? <Wand2 className="h-3.5 w-3.5" /> : <Crown className="h-3.5 w-3.5" />}
          title="Tornar a capturar i regenerar el tema des de la URL d'origen"
        >
          Regenerar
        </Button>
      )}

      {isSuperAdmin && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar el tema"
          title="Eliminar el tema"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-subtle transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// A high-contrast segmented control. Active = raised surface + strong text; the
// container ring gives it a defined shape against the bar.
function Seg<T extends string | boolean>({
  options, value, onChange, iconOnly, titles,
}: {
  options: readonly (readonly [T, React.ComponentType<{ className?: string }>, string])[]
  value: T
  onChange: (v: T) => void
  iconOnly?: boolean
  titles?: string[]
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-subtle p-0.5 ring-1 ring-border">
      {options.map(([val, Icon, label], i) => {
        const active = value === val
        return (
          <button
            key={String(val)}
            type="button"
            onClick={() => onChange(val)}
            aria-pressed={active}
            title={titles?.[i] ?? label}
            aria-label={iconOnly ? label : undefined}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-bold transition-colors',
              iconOnly ? 'w-8' : 'px-2.5',
              active ? 'bg-surface text-text shadow-sm ring-1 ring-black/5' : 'text-muted hover:text-text',
            )}
          >
            <Icon className="h-4 w-4" />{!iconOnly && label}
          </button>
        )
      })}
    </div>
  )
}

function Divider() {
  return <span className="mx-0.5 h-6 w-px bg-border max-sm:hidden" aria-hidden />
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function SaveStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'saving') return <Pill className="text-muted"><KnotSpinner className="h-3.5 w-3.5" /> Desant…</Pill>
  if (status === 'error') return <Pill className="bg-danger-soft text-danger"><CloudOff className="h-3.5 w-3.5" /> Error</Pill>
  if (status === 'saved') return <Pill className="text-success"><Check className="h-3.5 w-3.5" /> Desat</Pill>
  return <Pill className="text-subtle"><Cloud className="h-3.5 w-3.5" /> Auto</Pill>
}

function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold max-sm:hidden', className)}>{children}</span>
}
