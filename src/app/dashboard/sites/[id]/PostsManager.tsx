'use client'

import { useState, useTransition, useMemo, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, FileText, Search, Upload, Send, X, EyeOff,
  ChevronLeft, ChevronRight, Loader2, Sparkles, PenLine, Crown,
} from 'lucide-react'
import {
  deletePost, togglePublish, togglePublishBulk, deletePostsBulk, updatePostFields,
  listPosts, generateAndCreateArticle, type PostListItem, type PostListResult,
} from '@/lib/actions/posts'
import { uploadImage } from '@/lib/upload'
import { useToast } from '@/components/ui/Toast'
import { Modal, ModalClose, useConfirm } from '@/components/ui/Modal'
import { useKeyedSaveState } from '@/components/ui/SaveStatus'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { PremiumPanel } from './PremiumGate'
import ArticleCard from './ArticleCard'

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
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const confirm = useConfirm()
  const router = useRouter()
  // Per-card background-save indicator (saving → saved ✓ → idle, or error).
  const save = useKeyedSaveState()
  const [generating, setGenerating] = useState(false)
  const [aiBlocked, setAiBlocked] = useState(false)

  // "Crea el primer article amb IA" — analyzes the site's niche and writes a draft,
  // then drops the user into the editor to review and publish. PREMIUM-gated: a
  // free user gets the upgrade modal (the server action is the authoritative gate;
  // this just avoids a wasted round-trip and surfaces the upsell).
  const handleGenerateAI = async () => {
    if (!isSuperAdmin) { setAiBlocked(true); return }
    setGenerating(true)
    const res = await generateAndCreateArticle(siteId)
    setGenerating(false)
    if (res.error || !res.id) { toast(res.error ?? 'No s’ha pogut generar l’article', 'error'); return }
    toast('Article generat amb IA ✨', 'success')
    router.push(`/dashboard/sites/${siteId}/posts/${res.id}/edit`)
  }

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

  // ── Live refresh from the server ────────────────────────────────────────────
  // After an import (ImportModal calls router.refresh()) — or any other server
  // revalidate — fresh data arrives via `initialPosts`/`initialMeta`. React does
  // NOT re-derive our local `posts` state from props, so the list would silently
  // stay stale. Adopt the new data explicitly: replace it on the default view, or
  // re-run the active query when the user is currently searching/filtering/paging.
  const reloadRef = useRef(reload)
  // Keep the ref pointing at the latest `reload` without re-subscribing the
  // refresh effect below. Assigned in an effect (not during render) to satisfy
  // React 19's ref rules.
  useEffect(() => { reloadRef.current = reload })
  const lastInitialPosts = useRef(initialPosts)
  useEffect(() => {
    if (initialPosts === lastInitialPosts.current) return
    lastInitialPosts.current = initialPosts
    const a = applied.current
    if (a.page === 1 && a.status === 'all' && a.q === '') {
      setPosts(initialPosts)
      setMeta(initialMeta)
      setSelected(new Set())
    } else {
      reloadRef.current()
    }
  }, [initialPosts, initialMeta])

  const hasSelection = selected.size > 0
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
  const selectAllVisible = () => setSelected(new Set(posts.map(p => p.id)))
  const clearSelection = () => setSelected(new Set())

  // ── Optimistic single-post mutations (no reload, instant feel) ──────────────

  const handleDelete = async (post: PostListItem) => {
    const ok = await confirm({
      title: 'Eliminar article',
      message: `Segur que vols eliminar "${post.title}"? Aquesta acció no es pot desfer.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return
    const prevPosts = posts
    const prevMeta = meta
    const willEmptyPage = posts.length === 1
    setPosts(ps => ps.filter(p => p.id !== post.id))
    setMeta(m => ({
      ...m,
      total: Math.max(0, m.total - 1),
      published: m.published - (post.is_published ? 1 : 0),
      drafts: m.drafts - (post.is_published ? 0 : 1),
      filteredCount: Math.max(0, m.filteredCount - 1),
    }))
    startTransition(async () => {
      const result = await deletePost(post.id, siteId)
      if (result.error) { setPosts(prevPosts); setMeta(prevMeta); toast(result.error, 'error'); return }
      toast('Article eliminat')
      if (willEmptyPage && prevMeta.pageCount > 1) reload()
    })
  }

  const handleTogglePublish = (post: PostListItem) => {
    const next = !post.is_published
    const prevPosts = posts
    const prevMeta = meta
    const willEmptyPage = filter !== 'all' && posts.length === 1
    // In a filtered view the post no longer matches → drop it; in "all" flip it.
    setPosts(ps => filter === 'all'
      ? ps.map(p => (p.id === post.id ? { ...p, is_published: next } : p))
      : ps.filter(p => p.id !== post.id))
    setMeta(m => ({
      ...m,
      published: m.published + (next ? 1 : -1),
      drafts: m.drafts - (next ? 1 : -1),
      filteredCount: filter === 'all' ? m.filteredCount : Math.max(0, m.filteredCount - 1),
    }))
    startTransition(async () => {
      const result = await togglePublish(post.id, siteId, next)
      if (result.error) { setPosts(prevPosts); setMeta(prevMeta); toast(result.error, 'error'); return }
      toast(next ? `"${post.title}" publicat` : `"${post.title}" despublicat`)
      if (willEmptyPage && prevMeta.pageCount > 1) reload()
    })
  }

  // Optimistically patch a single field set, persisting via updatePostFields and
  // rolling back on error. Used by the inline title/slug editors.
  const commitFields = (post: PostListItem, patch: { title?: string; slug?: string; created_at?: string }) => {
    const prevPosts = posts
    save.markSaving(post.id)
    setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, ...patch } : p)))
    startTransition(async () => {
      const r = await updatePostFields(post.id, siteId, patch)
      if (r.error) { setPosts(prevPosts); save.markError(post.id); toast(r.error, 'error'); return }
      // Reconcile the server-normalised slug (e.g. "Hola Món" → "hola-mon").
      if (r.slug && patch.slug !== undefined && r.slug !== patch.slug) {
        setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, slug: r.slug! } : p)))
      }
      save.flashSaved(post.id)
    })
  }

  const onCommitTitle = (post: PostListItem, v: string) => {
    if (!v.trim()) { toast('El títol no pot estar buit', 'error'); return }
    commitFields(post, { title: v.trim() })
  }
  const onCommitSlug = (post: PostListItem, v: string) => commitFields(post, { slug: v })
  const onCommitDate = (post: PostListItem, iso: string) => commitFields(post, { created_at: iso })

  // Thumbnail: upload to storage, then persist the URL (optimistic).
  const onPickThumbnail = (post: PostListItem, file: File) => {
    setUploadingIds(s => new Set(s).add(post.id))
    save.markSaving(post.id)
    void (async () => {
      try {
        const url = await uploadImage(file, siteId)
        setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, featured_image: url } : p)))
        const r = await updatePostFields(post.id, siteId, { featured_image: url })
        if (r.error) {
          setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, featured_image: post.featured_image } : p)))
          save.markError(post.id); toast(r.error, 'error')
        } else {
          save.flashSaved(post.id)
        }
      } catch (e) {
        save.markError(post.id)
        toast(e instanceof Error ? e.message : 'No s\'ha pogut pujar la imatge', 'error')
      } finally {
        setUploadingIds(s => { const n = new Set(s); n.delete(post.id); return n })
      }
    })()
  }

  const onRemoveThumbnail = (post: PostListItem) => {
    const prev = post.featured_image
    save.markSaving(post.id)
    setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, featured_image: null } : p)))
    startTransition(async () => {
      const r = await updatePostFields(post.id, siteId, { featured_image: null })
      if (r.error) {
        setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, featured_image: prev } : p)))
        save.markError(post.id); toast(r.error, 'error'); return
      }
      save.flashSaved(post.id)
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
          <div className="w-8 h-8 bg-accent-soft rounded-lg flex items-center justify-center text-accent">
            <FileText className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-bold text-text">Articles</h2>
          <span className="ml-1 text-sm font-semibold text-subtle">({meta.total})</span>
        </div>
        <div className="flex items-center gap-2">
          {onImport && (
            <button
              onClick={onImport}
              className="cursor-pointer flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-muted bg-surface border border-border hover:border-border-strong hover:bg-surface-subtle rounded-xl shadow-sm transition-all"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
          )}
          {/* Magic SEO Article — the AI entry point, sat right beside "Write
              Article" and styled in the premium gold accent so it reads as a
              first-class way to start a post. */}
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={generating}
            title="Genera un article complet i optimitzat per SEO amb IA"
            className="cursor-pointer flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-on-accent bg-gradient-to-br from-accent to-accent-hover rounded-xl shadow-card hover:shadow-pop hover:opacity-95 transition-all disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : isSuperAdmin ? <Sparkles className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
            {generating ? 'Generant…' : 'Genera amb IA'}
          </button>
          <Link
            href={`/dashboard/sites/${siteId}/posts/new`}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-text bg-surface border border-border hover:border-accent/40 hover:bg-accent-soft hover:text-accent rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Escriure Article
          </Link>
        </div>
      </header>

      {meta.total === 0 && !search.trim() ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface border border-dashed border-border-strong rounded-[2rem] text-center">
          <div className="w-16 h-16 bg-surface-subtle text-subtle rounded-2xl flex items-center justify-center mb-5">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-text">Cap article encara</h3>
          <p className="text-subtle text-sm mt-1.5 max-w-xs">Crea el primer article per a {siteName}.</p>
          <Link
            href={`/dashboard/sites/${siteId}/posts/new`}
            className="mt-6 cursor-pointer bg-accent hover:bg-accent-hover text-on-accent px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-card"
          >
            <Plus className="w-4 h-4" />Escriure el primer article
          </Link>
        </div>
      ) : (
        <>
          {/* Toolbar: search + filters (bulk actions live in a floating bar). */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none z-10" />
              <Input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca per títol o slug..."
                className="h-11 pl-10 pr-4 rounded-xl bg-surface font-medium"
              />
              {isPending && (
                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin" />
              )}
            </div>
            <div className="flex gap-1 bg-surface-hover p-1 rounded-xl shrink-0">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => changeFilter(f.key)}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    filter === f.key ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
                  }`}
                >
                  {f.label}
                  <span className="ml-1.5 text-xs opacity-60">{f.count}</span>
                </button>
              ))}
            </div>
          </div>

          {posts.length === 0 && meta.total === 0 ? (
            // A brand-new blog with no articles at all — offer the three ways in.
            <div className="flex flex-col items-center justify-center gap-5 py-14 px-6 bg-surface border border-border rounded-2xl text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <FileText className="w-7 h-7" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-text">Encara no tens articles</h3>
                <p className="text-sm text-muted mt-1 max-w-md leading-relaxed">
                  Genera el primer amb IA —analitzem el teu ninxol i l’escrivim per tu—, importa’n d’existents, o escriu-ne un de nou.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <Button onClick={handleGenerateAI} loading={generating} glow iconLeft={!generating ? <Sparkles className="w-4 h-4" /> : undefined}>
                  {generating ? 'Generant amb IA…' : 'Genera amb IA'}
                </Button>
                <Link
                  href={`/dashboard/sites/${siteId}/posts/new`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-hover hover:border-border-strong"
                >
                  <PenLine className="w-4 h-4" /> Escriure
                </Link>
                {onImport && (
                  <button
                    onClick={onImport}
                    className="cursor-pointer inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-hover hover:border-border-strong"
                  >
                    <Upload className="w-4 h-4" /> Importar
                  </button>
                )}
              </div>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-surface border border-border rounded-2xl text-center">
              <Search className="w-8 h-8 text-subtle mb-3" />
              <p className="text-sm font-semibold text-muted">Cap article coincideix</p>
              <button
                onClick={() => { setSearch(''); changeFilter('all') }}
                className="cursor-pointer mt-3 text-xs font-bold text-accent hover:underline"
              >
                Netejar filtres
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {posts.map(post => (
                <ArticleCard
                  key={post.id}
                  post={post}
                  siteId={siteId}
                  selected={selected.has(post.id)}
                  uploading={uploadingIds.has(post.id)}
                  saveState={save.stateOf(post.id)}
                  busy={isPending}
                  onToggleSelect={() => toggleSelect(post.id)}
                  onCommitTitle={v => onCommitTitle(post, v)}
                  onCommitSlug={v => onCommitSlug(post, v)}
                  onCommitDate={iso => onCommitDate(post, iso)}
                  onPickThumbnail={f => onPickThumbnail(post, f)}
                  onRemoveThumbnail={() => onRemoveThumbnail(post)}
                  onTogglePublish={() => handleTogglePublish(post)}
                  onDelete={() => handleDelete(post)}
                />
              ))}
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

      {/* Floating bulk-action bar — appears as soon as anything is selected. */}
      {hasSelection && (
        <SelectionBar
          count={selected.size}
          draftCount={selectedDraftCount}
          publishedCount={selectedPublishedCount}
          allSelected={selected.size >= posts.length}
          busy={isPending}
          onSelectAll={selectAllVisible}
          onClear={clearSelection}
          onPublish={() => handleBulkPublish(true)}
          onHide={() => handleBulkPublish(false)}
          onDelete={handleBulkDelete}
        />
      )}

      {/* Premium upsell — a free user clicking "Genera amb IA" lands here, so the
          expensive Opus call stays behind the paywall (never burns API credits). */}
      {aiBlocked && (
        <Modal open onClose={() => setAiBlocked(false)} size="lg">
          <div className="relative">
            <div className="absolute top-3 right-3 z-20"><ModalClose onClose={() => setAiBlocked(false)} /></div>
            <PremiumPanel
              feature="Article SEO amb IA"
              description="La IA analitza el teu web, dedueix el teu nínxol i la teva competència, i escriu un article complet i optimitzat per a SEO, llest per publicar."
              perks={[
                'Article complet de 700–1100 paraules optimitzat per SEO',
                'Analitza el teu web i el teu sector automàticament',
                'Títol, metadades, paraula clau, categories i etiquetes',
                'Traducció a tots els idiomes amb IA',
              ]}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

// Floating, centered action bar (Notion/Gmail-style) shown while items are
// selected. Lives at the viewport bottom so it never pushes content around.
function SelectionBar({
  count, draftCount, publishedCount, allSelected, busy,
  onSelectAll, onClear, onPublish, onHide, onDelete,
}: {
  count: number
  draftCount: number
  publishedCount: number
  allSelected: boolean
  busy: boolean
  onSelectAll: () => void
  onClear: () => void
  onPublish: () => void
  onHide: () => void
  onDelete: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 bg-text text-bg-elevated rounded-2xl shadow-pop pl-3 pr-2 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <button
          onClick={onClear}
          title="Cancel·lar"
          className="cursor-pointer flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold tabular-nums whitespace-nowrap">
          {count} seleccionat{count !== 1 ? 's' : ''}
        </span>
        {!allSelected && (
          <button onClick={onSelectAll} className="cursor-pointer text-xs font-bold opacity-70 hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:inline">
            Tots
          </button>
        )}
        <span className="w-px h-6 bg-white/15 mx-0.5" />
        {draftCount > 0 && (
          <button
            onClick={onPublish}
            disabled={busy}
            className="cursor-pointer flex items-center gap-1.5 h-8 px-3 bg-success text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> Publicar{publishedCount > 0 ? ` (${draftCount})` : ''}
          </button>
        )}
        {publishedCount > 0 && (
          <button
            onClick={onHide}
            disabled={busy}
            className="cursor-pointer flex items-center gap-1.5 h-8 px-3 bg-white/10 text-bg-elevated rounded-xl text-sm font-bold hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            <EyeOff className="w-3.5 h-3.5" /> Ocultar{draftCount > 0 ? ` (${publishedCount})` : ''}
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={busy}
          className="cursor-pointer flex items-center gap-1.5 h-8 px-3 text-red-300 hover:bg-red-500/15 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" /> Eliminar
        </button>
      </div>
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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-5 border-t border-border">
      <p className="text-xs font-medium text-subtle">
        Pàgina {page} de {pageCount} · {filteredCount} article{filteredCount !== 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onGo(page - 1)} disabled={disabled || page <= 1} className={`${btn} text-muted hover:bg-surface-hover`} title="Anterior">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1.5 text-subtle text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onGo(p)}
              disabled={disabled}
              className={`${btn} ${p === page ? 'bg-accent text-white shadow-sm' : 'text-muted hover:bg-surface-hover'}`}
            >
              {p}
            </button>
          ),
        )}
        <button onClick={() => onGo(page + 1)} disabled={disabled || page >= pageCount} className={`${btn} text-muted hover:bg-surface-hover`} title="Següent">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
