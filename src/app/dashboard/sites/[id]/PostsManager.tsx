'use client'

import { useState, useTransition, useMemo, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Plus, Pencil, Trash2, FileText, Search, Upload, Send, CheckCircle2, X,
  ChevronLeft, ChevronRight, Loader2, Eye, EyeOff, ExternalLink,
} from 'lucide-react'
import {
  deletePost, togglePublish, togglePublishBulk, deletePostsBulk,
  listPosts, type PostListItem, type PostListResult,
} from '@/lib/actions/posts'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Modal'

type Filter = 'all' | 'published' | 'draft'

export type PostsMeta = {
  page: number
  pageCount: number
  filteredCount: number
  total: number
  published: number
  drafts: number
}

const metaFrom = (r: PostListResult): PostsMeta => ({
  page: r.page, pageCount: r.pageCount, filteredCount: r.filteredCount,
  total: r.total, published: r.published, drafts: r.drafts,
})

export default function PostsManager({
  siteId,
  siteName,
  initialPosts,
  initialMeta,
  isSuperAdmin = false,
  onImport,
}: {
  siteId: string
  siteName: string
  initialPosts: PostListItem[]
  initialMeta: PostsMeta
  isSuperAdmin?: boolean
  onImport?: () => void
}) {
  const [posts, setPosts] = useState<PostListItem[]>(initialPosts)
  const [meta, setMeta] = useState<PostsMeta>(initialMeta)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const confirm = useConfirm()

  // The query currently reflected in `posts`, so the search debounce can skip
  // redundant fetches and mutations can reload the right page.
  const applied = useRef<{ q: string; status: Filter; page: number }>({ q: '', status: 'all', page: initialMeta.page })

  const load = useCallback((page: number, status: Filter, q: string) => {
    startTransition(async () => {
      const r = await listPosts(siteId, { page, status, q })
      if (r.error) { toast(r.error, 'error'); return }
      // If we paged past the end (e.g. after deleting the last item on a page),
      // snap back to the final valid page.
      if (r.posts.length === 0 && r.page > 1 && r.filteredCount > 0) {
        const r2 = await listPosts(siteId, { page: r.pageCount, status, q })
        if (r2.error) { toast(r2.error, 'error'); return }
        setPosts(r2.posts); setMeta(metaFrom(r2)); applied.current = { q, status, page: r2.page }
      } else {
        setPosts(r.posts); setMeta(metaFrom(r)); applied.current = { q, status, page: r.page }
      }
      setSelected(new Set())
    })
  }, [siteId, toast])

  // Debounced server-side search.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== applied.current.q) load(1, filter, search.trim())
    }, 350)
    return () => clearTimeout(t)
  }, [search, filter, load])

  const changeFilter = (f: Filter) => { setFilter(f); load(1, f, search.trim()) }
  const goPage = (p: number) => { if (p >= 1 && p <= meta.pageCount && p !== meta.page) load(p, filter, search.trim()) }
  const reload = () => load(applied.current.page, applied.current.status, applied.current.q)

  const selectionMode = selected.size > 0
  const selectedPosts = useMemo(() => posts.filter(p => selected.has(p.id)), [posts, selected])
  const selectedPublishedCount = selectedPosts.filter(p => p.is_published).length
  const selectedDraftCount = selectedPosts.length - selectedPublishedCount

  const toggleSelect = (postId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId); else next.add(postId)
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())
  const selectAllVisible = () => setSelected(new Set(posts.map(p => p.id)))

  const handleDelete = async (postId: string, title: string) => {
    const ok = await confirm({
      title: 'Eliminar article',
      message: `Segur que vols eliminar "${title}"? Aquesta acció no es pot desfer.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deletePost(postId, siteId)
      if (result.error) toast(result.error, 'error')
      else { toast('Article eliminat'); reload() }
    })
  }

  const handleTogglePublish = (postId: string, current: boolean, title: string) => {
    startTransition(async () => {
      const result = await togglePublish(postId, siteId, !current)
      if (result.error) toast(result.error, 'error')
      else { toast(current ? `"${title}" despublicat` : `"${title}" publicat`); reload() }
    })
  }

  const handleBulkPublish = (publish: boolean) => {
    const ids = [...selected]
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await togglePublishBulk(siteId, ids, publish)
      if (result.error) { toast(result.error, 'error'); return }
      toast(`${result.count} article${result.count !== 1 ? 's' : ''} ${publish ? 'publicat' : 'despublicat'}${result.count !== 1 ? 's' : ''}`)
      reload()
    })
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    const ok = await confirm({
      title: `Eliminar ${ids.length} article${ids.length !== 1 ? 's' : ''}`,
      message: 'Aquesta acció no es pot desfer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deletePostsBulk(siteId, ids)
      if (result.error) { toast(result.error, 'error'); return }
      toast(`${result.count} article${result.count !== 1 ? 's' : ''} eliminat${result.count !== 1 ? 's' : ''}`)
      reload()
    })
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all',       label: 'Tots',       count: meta.total },
    { key: 'published', label: 'Publicats',  count: meta.published },
    { key: 'draft',     label: 'Esborranys', count: meta.drafts },
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
          <span className="ml-1 text-sm font-semibold text-neutral-400">({meta.total})</span>
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

      {meta.total === 0 && !search.trim() ? (
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
                  <p className="text-xs font-medium text-neutral-500">
                    {selectedDraftCount > 0 && `${selectedDraftCount} esborrany${selectedDraftCount !== 1 ? 's' : ''}`}
                    {selectedDraftCount > 0 && selectedPublishedCount > 0 && ' · '}
                    {selectedPublishedCount > 0 && `${selectedPublishedCount} publicat${selectedPublishedCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
                {selected.size < posts.length && (
                  <button
                    onClick={selectAllVisible}
                    className="cursor-pointer text-xs font-bold text-carma-700 hover:text-carma-800 hover:underline shrink-0 whitespace-nowrap"
                  >
                    Seleccionar la pàgina ({posts.length})
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
                    Ocultar {selectedDraftCount > 0 && selectedPublishedCount > 0 ? `(${selectedPublishedCount})` : ''}
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
                {isPending && (
                  <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-carma-400 animate-spin" />
                )}
              </div>
              <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl shrink-0">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => changeFilter(f.key)}
                    className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      filter === f.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {f.label}
                    <span className="ml-1.5 text-xs opacity-60">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white border border-neutral-100 rounded-2xl text-center">
              <Search className="w-8 h-8 text-neutral-300 mb-3" />
              <p className="text-sm font-semibold text-neutral-500">Cap article coincideix</p>
              <button
                onClick={() => { setSearch(''); changeFilter('all') }}
                className="cursor-pointer mt-3 text-xs font-bold text-carma-600 hover:underline"
              >
                Netejar filtres
              </button>
            </div>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 transition-opacity ${isPending ? 'opacity-60' : ''}`}>
              {posts.map(post => {
                const isSelected = selected.has(post.id)
                return (
                  <article
                    key={post.id}
                    onClick={() => toggleSelect(post.id)}
                    className={`group relative cursor-pointer bg-white border rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 ${
                      isSelected
                        ? 'border-carma-400 ring-2 ring-carma-200 shadow-lg shadow-carma-100/40'
                        : 'border-neutral-100 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.22)] hover:border-neutral-200'
                    }`}
                  >
                    <div className={`absolute top-3 left-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-carma-500 border-carma-500'
                        : 'bg-white border-neutral-300 opacity-0 group-hover:opacity-100'
                    }`}>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>

                    <div className="flex items-center justify-between pl-7">
                      {post.is_published ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-carma-50 text-carma-700">
                          <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                          Publicat
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-neutral-100 text-neutral-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                          Esborrany
                        </span>
                      )}
                      <span className="text-xs text-neutral-400 font-medium">
                        {new Date(post.created_at).toLocaleDateString('ca-ES')}
                      </span>
                    </div>

                    <h3 className="font-bold text-neutral-900 leading-snug line-clamp-2 flex-1 text-base group-hover:text-carma-700 transition-colors">
                      {post.title}
                    </h3>

                    <code className="text-xs text-neutral-400 font-mono truncate block">
                      /{post.slug}
                    </code>

                    <div
                      onClick={e => e.stopPropagation()}
                      className="border-t border-neutral-100 pt-2.5 flex items-center gap-1.5"
                    >
                      <Link
                        href={`/dashboard/sites/${siteId}/posts/${post.id}/edit`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold text-white bg-carma-500 hover:bg-carma-600 rounded-lg transition-colors shadow-sm"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar
                      </Link>

                      {/* Veure l'article al lloc públic */}
                      <a
                        href={`/render/${siteId}/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Veure al lloc"
                        className="cursor-pointer flex items-center justify-center w-8 h-8 text-neutral-500 bg-white border border-neutral-200 hover:border-carma-300 hover:text-carma-600 hover:bg-carma-50 rounded-lg transition-all shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      {/* Visibilitat: ull en color si publicat, ull tatxat gris si esborrany */}
                      <button
                        onClick={() => handleTogglePublish(post.id, post.is_published, post.title)}
                        disabled={isPending}
                        title={post.is_published ? 'Visible — clica per ocultar' : 'Ocult — clica per publicar'}
                        className={`cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg border transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                          post.is_published
                            ? 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100'
                            : 'text-neutral-400 bg-neutral-50 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {post.is_published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => handleDelete(post.id, post.title)}
                        disabled={isPending}
                        title="Eliminar"
                        className="cursor-pointer flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {meta.pageCount > 1 && (
            <Pagination
              page={meta.page}
              pageCount={meta.pageCount}
              filteredCount={meta.filteredCount}
              disabled={isPending}
              onGo={goPage}
            />
          )}
        </>
      )}
    </div>
  )
}

function Pagination({
  page, pageCount, filteredCount, disabled, onGo,
}: {
  page: number; pageCount: number; filteredCount: number; disabled: boolean; onGo: (p: number) => void
}) {
  // Compact window of page numbers around the current page.
  const pages: (number | '…')[] = []
  const push = (p: number | '…') => pages.push(p)
  const window = 1
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - window && p <= page + window)) push(p)
    else if (pages[pages.length - 1] !== '…') push('…')
  }

  const btn = "cursor-pointer min-w-9 h-9 px-2 flex items-center justify-center rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-5 border-t border-neutral-100">
      <p className="text-xs font-medium text-neutral-400">
        Pàgina {page} de {pageCount} · {filteredCount} article{filteredCount !== 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onGo(page - 1)} disabled={disabled || page <= 1} className={`${btn} text-neutral-600 hover:bg-neutral-100`} title="Anterior">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1.5 text-neutral-300 text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onGo(p)}
              disabled={disabled}
              className={`${btn} ${p === page ? 'bg-carma-500 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'}`}
            >
              {p}
            </button>
          ),
        )}
        <button onClick={() => onGo(page + 1)} disabled={disabled || page >= pageCount} className={`${btn} text-neutral-600 hover:bg-neutral-100`} title="Següent">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
