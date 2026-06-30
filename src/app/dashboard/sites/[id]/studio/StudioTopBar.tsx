'use client'

// Carma Studio — the top bar. Brand mark, device switch, undo/redo, live save
// status, "view live", and the regenerate/delete actions. All wired to context.

import { Monitor, Tablet, Smartphone, Undo2, Redo2, ExternalLink, Wand2, Crown, Trash2, Check, Cloud, CloudOff, Newspaper, FileText, PenLine } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import KnotSpinner from '@/components/ui/KnotSpinner'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Modal'
import { useThemeStudio } from '../ThemeStudioContext'
import type { Device } from './StudioCanvas'
import { cn } from '@/lib/cn'

export default function StudioTopBar({ device, setDevice, isSuperAdmin }: {
  device: Device
  setDevice: (d: Device) => void
  isSuperAdmin: boolean
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
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-elevated px-3 py-2">
      <div className="flex items-center gap-2 pr-1">
        <EndlessKnot size={22} glow spin />
        <span className="text-sm font-bold tracking-tight text-text">Carma Studio</span>
      </div>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      {/* Undo / redo */}
      <div className="flex items-center gap-0.5">
        <IconBtn label="Desfés (⌘Z)" disabled={!s.canUndo} onClick={s.undo}><Undo2 className="h-4 w-4" /></IconBtn>
        <IconBtn label="Refés (⌘⇧Z)" disabled={!s.canRedo} onClick={s.redo}><Redo2 className="h-4 w-4" /></IconBtn>
      </div>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      <SaveStatus status={s.saveStatus} />

      <div className="flex-1" />

      {/* Feed / Article view — the Article view previews the article layout AND
          inline-edits the headline + lede of the latest post. */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-subtle p-0.5">
        {([['feed', Newspaper, 'Feed'], ['article', FileText, 'Article']] as const).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => s.setView(v)}
            aria-pressed={s.view === v}
            title={v === 'feed' ? 'Vista del feed' : 'Vista de l’article'}
            className={cn(
              'flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors',
              s.view === v ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Deep content editing lives in the full editor — one click away when the
          Article view is showing a real post. */}
      {s.view === 'article' && s.editableArticle && (
        <button
          type="button"
          onClick={() => window.open(`/dashboard/sites/${s.siteId}/posts/${s.editableArticle!.id}/edit`, '_blank', 'noopener,noreferrer')}
          title="Obre l’editor complet del contingut"
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <PenLine className="h-3.5 w-3.5" /> Editor complet
        </button>
      )}

      {/* Device switch */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-subtle p-0.5">
        {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
          <button
            key={d}
            type="button"
            onClick={() => setDevice(d)}
            aria-pressed={device === d}
            aria-label={d === 'desktop' ? 'Escriptori' : d === 'tablet' ? 'Tauleta' : 'Mòbil'}
            title={d === 'desktop' ? 'Escriptori' : d === 'tablet' ? 'Tauleta' : 'Mòbil'}
            className={cn(
              'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors',
              device === d ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => window.open(`/render/${s.siteId}?v=${Date.now()}`, '_blank', 'noopener,noreferrer')}
        title="Veure en viu"
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Veure en viu
      </button>

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

      {isSuperAdmin && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar el tema"
          title="Eliminar el tema"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function SaveStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'saving') return <Pill className="text-muted"><KnotSpinner className="h-3.5 w-3.5" /> Desant…</Pill>
  if (status === 'error') return <Pill className="bg-danger-soft text-danger"><CloudOff className="h-3.5 w-3.5" /> Error en desar</Pill>
  if (status === 'saved') return <Pill className="text-success"><Check className="h-3.5 w-3.5" /> Desat</Pill>
  return <Pill className="text-subtle"><Cloud className="h-3.5 w-3.5" /> Desat automàtic</Pill>
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold', className)}>{children}</span>
}
