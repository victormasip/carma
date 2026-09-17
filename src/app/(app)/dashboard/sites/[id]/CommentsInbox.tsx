'use client'

// The moderation queue for Verified Comments.
//
// It lives next to the switch that turned comments on, because that is where the
// owner will look, and it only exists when the module is on — an empty inbox for
// a feature nobody enabled is noise.
//
// Loaded on demand (a click, never an effect): a site with comments off should
// not pay a round trip for a list it will never show, and the project's lint
// rules forbid setState-in-effect anyway.

import { useState, useTransition } from 'react'
import { Check, MessagesSquare, RefreshCw, Trash2 } from 'lucide-react'
import { listPendingComments, moderateComment, type PendingComment } from '@/lib/actions/comments'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'

export default function CommentsInbox({ siteId }: { siteId: string }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [comments, setComments] = useState<PendingComment[] | null>(null)
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const load = () => {
    setLoading(true)
    startTransition(async () => {
      const res = await listPendingComments(siteId)
      setLoading(false)
      setAvailable(res.available)
      if (res.error) { toast(res.error, 'error'); return }
      setComments(res.comments)
    })
  }

  const act = async (c: PendingComment, action: 'approve' | 'delete') => {
    if (action === 'delete') {
      const ok = await confirm({
        title: 'Eliminar el comentari?',
        message: `De ${c.author}. Aquesta acció és irreversible.`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancel·lar',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusyId(c.id)
    startTransition(async () => {
      const res = await moderateComment(siteId, c.id, action)
      setBusyId(null)
      if (!res.ok) { toast(res.error ?? 'No s’ha pogut desar', 'error'); return }
      setComments(prev => (prev ?? []).filter(x => x.id !== c.id))
      toast(action === 'approve' ? 'Publicat al blog.' : 'Eliminat.', 'success')
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <MessagesSquare className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold text-text">Comentaris per revisar</h3>
        {comments !== null && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold tabular-nums text-accent">
            {comments.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          {loading ? <KnotSpinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {comments === null ? 'Veure’ls' : 'Actualitzar'}
        </button>
      </div>

      {!available && (
        <p className="mt-3 text-xs text-warning">
          La taula de comentaris encara no existeix. Executa la migració 036 al Supabase SQL Editor.
        </p>
      )}

      {comments !== null && available && comments.length === 0 && (
        <p className="mt-3 text-xs text-muted">
          Res per revisar. Els comentaris nous apareixeran aquí abans de publicar-se al blog.
        </p>
      )}

      {comments !== null && comments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {comments.map(c => (
            <li
              key={c.id}
              className={cn(
                'flex flex-col gap-2 rounded-xl border border-border bg-surface-subtle p-3 sm:flex-row sm:items-start',
                busyId === c.id && 'opacity-60',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-bold text-text">{c.author}</span>
                  <span className="text-subtle">{formatDate(c.createdAt)}</span>
                  {c.postTitle && <span className="min-w-0 truncate text-subtle">· {c.postTitle}</span>}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">{c.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { void act(c, 'approve') }}
                  disabled={busyId === c.id}
                  title="Publicar-lo al blog"
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} /> Publicar
                </button>
                <button
                  type="button"
                  onClick={() => { void act(c, 'delete') }}
                  disabled={busyId === c.id}
                  title="Eliminar"
                  aria-label="Eliminar"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
