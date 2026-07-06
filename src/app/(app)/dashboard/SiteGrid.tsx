'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowUpRight, FileText, PenLine, ExternalLink, Eye, CheckCircle2, Check, Trash2, X,
} from 'lucide-react'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { deleteSite } from '@/lib/actions/sites'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatDate, formatNumber } from '@/lib/format'

export type SiteWithCounts = {
  id: string
  name: string
  created_at: string
  logo_url?: string | null
  total: number
  published: number
  views: number
}

/**
 * Dashboard site grid with live-stat mini-cards and (for managers) multi-select
 * bulk actions. Each card's whole surface links to the site via a stretched link;
 * the checkbox + action buttons sit above it (z-10) so they don't nest <a> in <a>.
 */
export default function SiteGrid({ sites, canManage }: { sites: SiteWithCounts[]; canManage: boolean }) {
  const router = useRouter()
  const confirm = useConfirm()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const clear = () => setSelected(new Set())

  const bulkDelete = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    const ok = await confirm({
      title: `Eliminar ${ids.length} lloc${ids.length !== 1 ? 's' : ''}?`,
      message: 'Aquesta acció és irreversible. S’eliminaran els llocs seleccionats i tot el seu contingut.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancel·lar',
      tone: 'danger',
    })
    if (!ok) return

    startTransition(async () => {
      const results = await Promise.all(ids.map((id) => deleteSite(id)))
      const failed = results.filter((r) => r.error).length
      if (failed) toast(`${failed} lloc(s) no s’han pogut eliminar`, 'error')
      else toast(`${ids.length} lloc${ids.length !== 1 ? 's' : ''} eliminat${ids.length !== 1 ? 's' : ''}`, 'success')
      clear()
      router.refresh()
    })
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            canManage={canManage}
            selected={selected.has(site.id)}
            onToggle={() => toggle(site.id)}
          />
        ))}
      </div>

      {/* Floating bulk-action bar */}
      {canManage && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4" role="region" aria-label="Accions massives">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-elevated/95 px-3 py-2.5 shadow-pop backdrop-blur-xl">
            <span className="flex h-9 items-center gap-2 rounded-xl bg-accent-soft px-3 text-sm font-bold text-accent">
              <Check className="h-4 w-4" /> {selected.size} seleccionat{selected.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={bulkDelete}
              disabled={pending}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-danger px-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <KnotSpinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              Eliminar
            </button>
            <button onClick={clear} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface-hover hover:text-text">
              <X className="h-4 w-4" /> Cancel·lar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function SiteCard({
  site, canManage, selected, onToggle,
}: {
  site: SiteWithCounts
  canManage: boolean
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        'gold-trace gold-trace-hover lift group relative flex flex-col rounded-2xl border bg-surface p-5',
        selected ? 'border-accent ring-2 ring-accent/25' : 'border-border',
      )}
    >
      <Link href={`/dashboard/sites/${site.id}`} aria-label={site.name} className="absolute inset-0 z-0 rounded-2xl" />

      <div className="flex items-center gap-3">
        {canManage && (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={selected}
            aria-label={selected ? 'Desseleccionar' : 'Seleccionar'}
            className={cn(
              'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
              selected
                ? 'border-accent bg-accent text-on-accent opacity-100'
                : 'border-border-strong bg-surface text-transparent opacity-0 hover:border-accent group-hover:opacity-100',
            )}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </button>
        )}
        {site.logo_url ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.logo_url} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-soft to-surface-subtle text-base font-bold uppercase text-accent">
            {site.name.charAt(0) || '·'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold leading-tight text-text transition-colors group-hover:text-accent">{site.name}</h3>
          <p className="mt-0.5 text-xs text-subtle">Creat el {formatDate(site.created_at)}</p>
        </div>
        <span className="ml-auto flex h-7 w-7 shrink-0 -translate-x-1 items-center justify-center rounded-lg text-subtle opacity-0 transition-all group-hover:translate-x-0 group-hover:bg-accent-soft group-hover:text-accent group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>

      {/* Live stats — one airy inline row, no boxes. */}
      <div className="relative z-[1] mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <InlineStat icon={<Eye className="h-4 w-4" />} value={site.views} label="vistes" tone="accent" />
        <Dot />
        <InlineStat icon={<FileText className="h-4 w-4" />} value={site.total} label={site.total === 1 ? 'article' : 'articles'} />
        {site.published > 0 && <><Dot /><InlineStat icon={<CheckCircle2 className="h-4 w-4" />} value={site.published} label="publicats" tone="success" /></>}
      </div>

      <div className="relative z-[1] mt-4 flex items-center gap-1 border-t border-border pt-3">
        <Link
          href={`/dashboard/sites/${site.id}/posts/new`}
          className="relative z-10 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-accent"
        >
          <PenLine className="h-3.5 w-3.5" /> Escriure
        </Link>
        <a
          href={`/render/${site.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Veure el lloc públic"
          className="relative z-10 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Veure
        </a>
      </div>
    </div>
  )
}

function Dot() {
  return <span className="h-1 w-1 shrink-0 rounded-full bg-border-strong" aria-hidden />
}

function InlineStat({ icon, value, label, tone = 'neutral' }: { icon: React.ReactNode; value: number; label: string; tone?: 'neutral' | 'accent' | 'success' }) {
  const accent = tone === 'accent' ? 'text-accent' : tone === 'success' ? 'text-success' : 'text-subtle'
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={accent}>{icon}</span>
      <span className="font-bold tabular-nums text-text">{formatNumber(value)}</span>
      <span className="text-subtle">{label}</span>
    </span>
  )
}
