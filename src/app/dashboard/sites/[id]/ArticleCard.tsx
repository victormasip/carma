'use client'

// Rich, inline-editable article card.
//
// Everything routine is editable in place — title, slug, DATE, status and
// thumbnail — so the full editor is only needed for deep content work. Every
// edit is optimistic (the parent patches local state and rolls back on error).
//
// Selection is frictionless: a checkbox sits in the corner of every card (always
// visible, no "selection mode" to enter); selecting one reveals a floating bulk
// bar (rendered by the parent). The body fields stay independently clickable, so
// editing and selecting never fight each other.

import { useRef, useState, useEffect, useLayoutEffect, type KeyboardEvent } from 'react'
import Link from 'next/link'
import {
  Pencil, Trash2, ExternalLink, Eye, EyeOff, Check, ImagePlus, X,
  Loader2, ImageIcon, Calendar,
} from 'lucide-react'
import type { PostListItem } from '@/lib/actions/posts'
import SaveStatus, { type SaveState } from '@/components/ui/SaveStatus'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'

// ── Inline, click-to-edit text field ─────────────────────────────────────────
function InlineEdit({
  value, onCommit, multiline = false, ariaLabel,
  viewClassName, editClassName, prefix, placeholder,
}: {
  value: string
  onCommit: (next: string) => void
  multiline?: boolean
  ariaLabel: string
  viewClassName?: string
  editClassName?: string
  prefix?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const inRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (!editing || !multiline) return
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [editing, draft, multiline])

  const open = () => { setDraft(value); setEditing(true) }
  useEffect(() => {
    if (!editing) return
    const el = multiline ? taRef.current : inRef.current
    if (el) { el.focus(); el.select() }
  }, [editing, multiline])

  const commit = () => {
    setEditing(false)
    const next = draft.replace(/\s+/g, ' ').trim()
    if (next !== value.trim()) onCommit(next)
  }
  const cancel = () => { setDraft(value); setEditing(false) }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (!multiline || !e.shiftKey)) { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  const editClass = cn(
    'flex-1 min-w-0 bg-surface-subtle border border-accent rounded-lg px-2 py-1.5 -mx-0.5',
    'outline-none ring-2 ring-accent/20 resize-none overflow-hidden transition-shadow',
    editClassName,
  )

  if (editing) {
    return (
      <div className="flex items-start">
        {prefix && <span className="text-subtle font-mono text-xs pt-[7px] pr-0.5 select-none">{prefix}</span>}
        {multiline ? (
          <textarea ref={taRef} rows={1} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown} onBlur={commit} aria-label={ariaLabel} spellCheck={false} className={editClass} />
        ) : (
          <input ref={inRef} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown} onBlur={commit} aria-label={ariaLabel} spellCheck={false} className={editClass} />
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      title="Clica per editar"
      aria-label={`${ariaLabel} — clica per editar`}
      className={cn(
        'group/inline relative text-left w-full cursor-text rounded-lg -mx-1 px-1 py-0.5 hover:bg-surface-hover transition-colors',
        viewClassName,
      )}
    >
      {prefix && <span className="text-subtle font-mono select-none">{prefix}</span>}
      {value || <span className="text-subtle italic">{placeholder ?? '—'}</span>}
      <Pencil className="inline-block w-3 h-3 ml-1 align-baseline text-subtle opacity-0 group-hover/inline:opacity-60 transition-opacity" />
    </button>
  )
}

// ── Inline date editor (native date picker) ──────────────────────────────────
function DateEdit({ value, onCommit }: { value: string; onCommit: (iso: string) => void }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const toInput = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10) }
  const label = (() => {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? '—' : formatDate(d, 'medium')
  })()

  // Commit on pick: keep the original time-of-day, swap only the calendar date.
  const commit = (picked: string) => {
    setEditing(false)
    if (!picked) return
    const base = new Date(value); const safe = Number.isNaN(base.getTime()) ? new Date() : base
    const [y, m, day] = picked.split('-').map(Number)
    safe.setFullYear(y, m - 1, day)
    const iso = safe.toISOString()
    if (iso.slice(0, 10) !== value.slice(0, 10)) onCommit(iso)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type="date"
        defaultValue={toInput(value)}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        className="bg-surface-subtle border border-accent rounded-lg px-2 py-1 text-xs text-text outline-none ring-2 ring-accent/20"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Clica per canviar la data"
      className="group/date inline-flex items-center gap-1.5 text-xs text-subtle font-medium rounded-md -mx-1 px-1 py-0.5 hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
    >
      <Calendar className="w-3.5 h-3.5" />
      {label}
      <Pencil className="w-3 h-3 opacity-0 group-hover/date:opacity-60 transition-opacity" />
    </button>
  )
}

export default function ArticleCard({
  post, siteId, selected, uploading, saveState, busy,
  onToggleSelect, onCommitTitle, onCommitSlug, onCommitDate, onPickThumbnail, onRemoveThumbnail,
  onTogglePublish, onDelete,
}: {
  post: PostListItem
  siteId: string
  selected: boolean
  uploading: boolean
  saveState: SaveState
  busy: boolean
  onToggleSelect: () => void
  onCommitTitle: (v: string) => void
  onCommitSlug: (v: string) => void
  onCommitDate: (iso: string) => void
  onPickThumbnail: (file: File) => void
  onRemoveThumbnail: () => void
  onTogglePublish: () => void
  onDelete: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const published = post.is_published

  const pick = () => fileRef.current?.click()
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onPickThumbnail(f)
    e.target.value = ''
  }

  return (
    <article
      className={cn(
        'group relative bg-surface border rounded-2xl flex flex-col overflow-hidden transition-all duration-200',
        selected
          ? 'border-accent ring-2 ring-accent/30 shadow-lg shadow-accent/10'
          : 'border-border hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.22)]',
      )}
    >
      {/* ── Thumbnail ── */}
      <div className="relative aspect-[16/9] bg-surface-subtle overflow-hidden shrink-0">
        {post.featured_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.featured_image} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <button type="button" onClick={pick} className="cursor-pointer w-full h-full flex flex-col items-center justify-center gap-1.5 text-subtle hover:text-accent hover:bg-accent-soft/40 transition-colors">
            <ImageIcon className="w-7 h-7" />
            <span className="text-xs font-semibold">Afegir portada</span>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-bg-elevated/70 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        )}

        {post.featured_image && !uploading && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end gap-1.5 p-2">
            <button type="button" onClick={pick} title="Canviar portada" className="cursor-pointer flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-white/95 text-stone-800 text-xs font-bold shadow-sm hover:bg-white transition-colors">
              <ImagePlus className="w-3.5 h-3.5" /> Canviar
            </button>
            <button type="button" onClick={onRemoveThumbnail} title="Treure portada" className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg bg-white/95 text-danger shadow-sm hover:bg-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Selection — a prominent, always-visible checkbox. Unselected: a clear
            white chip that previews a check on hover; selected: accent-filled with
            a ring so the chosen state reads at a glance over any thumbnail. */}
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={selected ? 'Treure de la selecció' : 'Seleccionar article'}
          title={selected ? 'Treure de la selecció' : 'Seleccionar'}
          className={cn(
            'absolute top-2.5 left-2.5 z-10 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer',
            selected
              ? 'bg-accent border-accent text-white scale-105 ring-2 ring-accent/50 shadow-lg'
              : 'bg-white/95 border-white text-stone-500 shadow-md hover:scale-105 hover:text-accent',
          )}
        >
          <Check
            className={cn('w-4 h-4 transition-opacity', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50')}
            strokeWidth={3}
          />
        </button>

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col gap-2 p-4 flex-1">
        {/* Meta row: editable date on the left, the live save indicator on the right
            (the zero-click feedback for every inline edit on this card). */}
        <div className="flex items-center justify-between gap-2 min-h-[22px]">
          <DateEdit value={post.created_at} onCommit={onCommitDate} />
          <SaveStatus state={saveState} className="shrink-0" />
        </div>

        <InlineEdit
          value={post.title}
          onCommit={onCommitTitle}
          multiline
          ariaLabel="Títol de l'article"
          placeholder="Sense títol"
          viewClassName="font-bold text-text leading-snug text-base line-clamp-2"
          editClassName="font-bold text-text leading-snug text-base"
        />

        <InlineEdit
          value={post.slug}
          onCommit={onCommitSlug}
          ariaLabel="Slug de l'article"
          prefix="/"
          placeholder="slug"
          viewClassName="text-[13px] text-subtle font-mono truncate"
          editClassName="text-[13px] text-text font-mono"
        />

        {/* ── Actions — ONE consolidated row: publish toggle + edit + view + delete.
            The status switch is color-coded (green = live) and lives inline with the
            primary actions, so nothing is scattered across the card. ── */}
        <div className="border-t border-border mt-auto pt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePublish}
            disabled={busy}
            role="switch"
            aria-checked={published}
            aria-label={published ? 'Publicat — clica per ocultar' : 'Esborrany — clica per publicar'}
            title={published ? 'Publicat — clica per ocultar' : 'Esborrany — clica per publicar'}
            className={cn(
              'flex items-center gap-1.5 h-9 pl-2 pr-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-60 shrink-0',
              published ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-surface-subtle text-muted hover:bg-surface-hover',
            )}
          >
            {published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className={cn('relative w-8 h-[18px] rounded-full transition-colors shrink-0', published ? 'bg-success' : 'bg-border-strong')}>
              <span className={cn('absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full bg-white shadow transition-transform', published && 'translate-x-[14px]')} />
            </span>
          </button>
          <Link
            href={`/dashboard/sites/${siteId}/posts/${post.id}/edit`}
            title="Editar el contingut de l'article"
            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 h-9 text-[13px] font-bold text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors shadow-sm"
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Editar</span>
          </Link>
          <a
            href={`/render/${siteId}/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Veure al lloc"
            className="cursor-pointer flex items-center justify-center w-9 h-9 text-muted bg-surface border border-border hover:border-accent/40 hover:text-accent hover:bg-accent-soft rounded-lg transition-all shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onDelete}
            disabled={busy}
            title="Eliminar"
            className="cursor-pointer flex items-center justify-center w-9 h-9 text-danger hover:bg-danger-soft border border-transparent hover:border-danger/30 rounded-lg transition-all disabled:opacity-40 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  )
}
