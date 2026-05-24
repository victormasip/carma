'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Pencil, Trash2, FileText, Search, Upload, Send, CheckCircle2, X,
} from 'lucide-react'
import { deletePost, togglePublish, togglePublishBulk, deletePostsBulk } from '@/lib/actions/posts'
import { useToast } from '@/components/ui/Toast'

type Post = { id: string; title: string; slug: string; is_published: boolean; created_at: string }
type Filter = 'all' | 'published' | 'draft'

export default function PostsManager({
  siteId,
  siteName,
  initialPosts,
  isSuperAdmin = false,
  onImport,
}: {
  siteId: string
  siteName: string
  initialPosts: Post[]
  isSuperAdmin?: boolean
  onImport?: () => void
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { toast } = useToast()

  const filtered = useMemo(() => initialPosts.filter(p => {
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
                        p.slug.toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      filter === 'all' ||
      (filter === 'published' && p.is_published) ||
      (filter === 'draft' && !p.is_published)
    return matchSearch && matchStatus
  }), [initialPosts, search, filter])

  const published = initialPosts.filter(p => p.is_published).length
  const drafts = initialPosts.length - published

  const selectionMode = selected.size > 0
  const selectedPosts = useMemo(
    () => initialPosts.filter(p => selected.has(p.id)),
    [initialPosts, selected],
  )
  const selectedPublishedCount = selectedPosts.filter(p => p.is_published).length
  const selectedDraftCount = selectedPosts.length - selectedPublishedCount

  const toggleSelect = (postId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(postId) ? next.delete(postId) : next.add(postId)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const selectAllVisible = () => {
    setSelected(new Set(filtered.map(p => p.id)))
  }

  const handleDelete = (postId: string, title: string) => {
    if (!confirm(`Estàs segur que vols eliminar "${title}"?`)) return
    startTransition(async () => {
      const result = await deletePost(postId, siteId)
      if (result.error) toast(result.error, 'error')
      else { toast('Article eliminat'); router.refresh() }
    })
  }

  const handleTogglePublish = (postId: string, current: boolean, title: string) => {
    startTransition(async () => {
      const result = await togglePublish(postId, siteId, !current)
      if (result.error) toast(result.error, 'error')
      else { toast(current ? `"${title}" despublicat` : `"${title}" publicat`); router.refresh() }
    })
  }

  // ── Bulk actions ────────────────────────────────────────────────────────────
  const handleBulkPublish = (publish: boolean) => {
    const ids = [...selected]
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await togglePublishBulk(siteId, ids, publish)
      if (result.error) { toast(result.error, 'error'); return }
      toast(`${result.count} article${result.count !== 1 ? 's' : ''} ${publish ? 'publicat' : 'despublicat'}${result.count !== 1 ? 's' : ''}`)
      clearSelection()
      router.refresh()
    })
  }

  const handleBulkDelete = () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!confirm(`Eliminar ${ids.length} article${ids.length !== 1 ? 's' : ''}? Aquesta acció no es pot desfer.`)) return
    startTransition(async () => {
      const result = await deletePostsBulk(siteId, ids)
      if (result.error) { toast(result.error, 'error'); return }
      toast(`${result.count} article${result.count !== 1 ? 's' : ''} eliminat${result.count !== 1 ? 's' : ''}`)
      clearSelection()
      router.refresh()
    })
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all',       label: 'Tots',       count: initialPosts.length },
    { key: 'published', label: 'Publicats',  count: published },
    { key: 'draft',     label: 'Esborranys', count: drafts },
  ]

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-carma-50 rounded-lg flex items-center justify-center text-carma-500">
            <FileText className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900">Articles</h2>
          <span className="ml-1 text-sm font-semibold text-neutral-400">({initialPosts.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && onImport && (
            <button
              onClick={onImport}
              className="cursor-pointer flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-neutral-600 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-xl shadow-sm transition-all"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
          )}
          <Link
            href={`/dashboard/sites/${siteId}/posts/new`}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-neutral-700 bg-white border border-neutral-200 hover:border-carma-300 hover:bg-carma-50 hover:text-carma-700 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Escriure Article
          </Link>
        </div>
      </header>

      {initialPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-dashed border-neutral-300 rounded-[2rem] text-center">
          <div className="w-16 h-16 bg-neutral-50 text-neutral-300 rounded-2xl flex items-center justify-center mb-5">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">Cap article encara</h3>
          <p className="text-neutral-400 text-sm mt-1.5 max-w-xs">Crea el primer article per a {siteName}.</p>
          <Link
            href={`/dashboard/sites/${siteId}/posts/new`}
            className="mt-6 cursor-pointer bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-[0_10px_30px_-6px_rgba(212,175,55,0.3)]"
          >
            <Plus className="w-4 h-4" />Escriure el primer article
          </Link>
        </div>
      ) : (
        <>
          {/* Toolbar: search/filters OR bulk-actions */}
          {selectionMode ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5 bg-gradient-to-r from-carma-50 to-carma-50/50 border border-carma-200 rounded-2xl p-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={clearSelection}
                  className="cursor-pointer w-8 h-8 flex items-center justify-center bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900 rounded-lg transition-colors shrink-0"
                  title="Cancel·lar selecció"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-neutral-900">
                    {selected.size} article{selected.size !== 1 ? 's' : ''} seleccionat{selected.size !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] font-medium text-neutral-500">
                    {selectedDraftCount > 0 && `${selectedDraftCount} esborrany${selectedDraftCount !== 1 ? 's' : ''}`}
                    {selectedDraftCount > 0 && selectedPublishedCount > 0 && ' · '}
                    {selectedPublishedCount > 0 && `${selectedPublishedCount} publicat${selectedPublishedCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
                {selected.size < filtered.length && (
                  <button
                    onClick={selectAllVisible}
                    className="cursor-pointer text-xs font-bold text-carma-700 hover:text-carma-800 hover:underline shrink-0 whitespace-nowrap"
                  >
                    Sel·leccionar tots ({filtered.length})
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedDraftCount > 0 && (
                  <button
                    onClick={() => handleBulkPublish(true)}
                    disabled={isPending}
                    className="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Publicar {selectedDraftCount > 0 && selectedPublishedCount > 0 ? `(${selectedDraftCount})` : ''}
                  </button>
                )}
                {selectedPublishedCount > 0 && (
                  <button
                    onClick={() => handleBulkPublish(false)}
                    disabled={isPending}
                    className="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Despublicar {selectedDraftCount > 0 && selectedPublishedCount > 0 ? `(${selectedPublishedCount})` : ''}
                  </button>
                )}
                <button
                  onClick={handleBulkDelete}
                  disabled={isPending}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cerca per títol o slug..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:border-carma-500 transition-all"
                />
              </div>
              <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl shrink-0">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      filter === f.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {f.label}
                    <span className="ml-1.5 text-[10px] opacity-60">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white border border-neutral-100 rounded-2xl text-center">
              <Search className="w-8 h-8 text-neutral-300 mb-3" />
              <p className="text-sm font-semibold text-neutral-500">Cap article coincideix</p>
              <button
                onClick={() => { setSearch(''); setFilter('all') }}
                className="cursor-pointer mt-3 text-xs font-bold text-carma-600 hover:underline"
              >
                Netejar filtres
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(post => {
                const isSelected = selected.has(post.id)
                return (
                  <article
                    key={post.id}
                    onClick={() => toggleSelect(post.id)}
                    className={`group relative cursor-pointer bg-white border rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 ${
                      isSelected
                        ? 'border-carma-400 ring-2 ring-carma-200 shadow-md'
                        : 'border-neutral-100 hover:shadow-md hover:border-neutral-200'
                    }`}
                  >
                    {/* Selection checkbox overlay */}
                    <div className={`absolute top-3 left-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-carma-500 border-carma-500'
                        : 'bg-white border-neutral-300 opacity-0 group-hover:opacity-100'
                    }`}>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>

                    {/* Status + date */}
                    <div className="flex items-center justify-between pl-7">
                      {post.is_published ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-carma-50 text-carma-700">
                          <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                          Publicat
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-neutral-100 text-neutral-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                          Esborrany
                        </span>
                      )}
                      <span className="text-xs text-neutral-400 font-medium">
                        {new Date(post.created_at).toLocaleDateString('ca-ES')}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-neutral-900 leading-snug line-clamp-2 flex-1 text-[15px]">
                      {post.title}
                    </h3>

                    {/* Slug */}
                    <code className="text-xs text-neutral-400 font-mono truncate block">
                      /{post.slug}
                    </code>

                    {/* Actions (don't trigger card selection) */}
                    <div
                      onClick={e => e.stopPropagation()}
                      className="border-t border-neutral-100 pt-3 flex items-center gap-1.5"
                    >
                      {post.is_published ? (
                        <button
                          onClick={() => handleTogglePublish(post.id, true, post.title)}
                          disabled={isPending}
                          className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Despublicar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTogglePublish(post.id, false, post.title)}
                          disabled={isPending}
                          className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Publicar
                        </button>
                      )}

                      <Link
                        href={`/dashboard/sites/${siteId}/posts/${post.id}/edit`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-carma-700 bg-carma-50 hover:bg-carma-100 border border-carma-100 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </Link>

                      <button
                        onClick={() => handleDelete(post.id, post.title)}
                        disabled={isPending}
                        title="Eliminar"
                        className="cursor-pointer p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
