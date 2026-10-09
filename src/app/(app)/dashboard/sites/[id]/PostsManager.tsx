'use client'

import { useState, useTransition, useMemo, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, FileText, Search, Upload, Send, X, EyeOff,
  ChevronLeft, ChevronRight, Sparkles, PenLine, Crown,
} from 'lucide-react'
import KnotSpinner from '@/components/ui/KnotSpinner'
import {
  deletePost, togglePublish, togglePublishBulk, deletePostsBulk, updatePostFields,
  listPosts, generateAndCreateArticle, deleteSamplePosts, type PostListItem, type PostListResult,
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
  /** 1-based position of the page on screen (keyset pages have no number of their own). */
  page: number
  pageCount: number
  filteredCount: number
  total: number
  published: number
  drafts: number
  /** Template starter posts still present (meta.sample) — shows the one-click
   *  "remove all sample articles" banner. */
  samples?: number
  /** Loads the page after this one (keyset cursor); null on the last page. */
  next: string | null
}

const PAGE_SIZE = 12

/** A server page → the list's meta. A search's match count arrives on its first
 *  page only (keyset paging never recounts), so later pages keep the one we have. */
const metaFrom = (r: PostListResult, page: number, prev?: PostsMeta): PostsMeta => {
  const filteredCount = r.filteredCount ?? prev?.filteredCount ?? r.posts.length
  return {
    page, filteredCount, pageCount: Math.max(1, Math.ceil(filteredCount / PAGE_SIZE)),
    total: r.total, published: r.published, drafts: r.drafts, samples: r.samples, next: r.next,
  }
}

export default function PostsManager({
  siteId,
  subdomain = null,
  siteName,
  initialPage,
  isSuperAdmin = false,
  onImport,
}: {
  siteId: string
  /** sites.subdomain — each card's preview link goes to the live article. */
  subdomain?: string | null
  siteName: string
  /** The first page, as the server loaded it (lib/posts/list.ts). */
  initialPage: PostListResult
  isSuperAdmin?: boolean
  onImport?: () => void
}) {
  const [posts, setPosts] = useState<PostListItem[]>(initialPage.posts)
  const [meta, setMeta] = useState<PostsMeta>(() => metaFrom(initialPage, 1))
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
  // redundant fetches and mutations can reload the right page. `cursors[i]` is the
  // keyset cursor that loads page i+1 (page 1 has none) — Previous walks back
  // through it; there is no OFFSET to jump with, by design (W1).
  const applied = useRef<{ q: string; status: Filter; page: number; cursors: (string | null)[] }>({ q: '', status: 'all', page: 1, cursors: [null] })

  const load = useCallback((page: number, status: Filter, q: string, cursors: (string | null)[]) => {
    startTransition(async () => {
      const after = cursors[page - 1] ?? null
      const r = await listPosts(siteId, { after, status, q })
      if (r.error) { toast(r.error, 'error'); return }
      // Paged past the end (the last item of a page was just deleted): step back.
      if (r.posts.length === 0 && page > 1) {
        const back = page - 1
        const r2 = await listPosts(siteId, { after: cursors[back - 1] ?? null, status, q })
        if (r2.error) { toast(r2.error, 'error'); return }
        setPosts(r2.posts); setMeta(m => metaFrom(r2, back, m)); applied.current = { q, status, page: back, cursors: cursors.slice(0, back) }
      } else {
        setPosts(r.posts); setMeta(m => metaFrom(r, page, m)); applied.current = { q, status, page, cursors: cursors.slice(0, page) }
      }
      setSelected(new Set())
    })
  }, [siteId, toast])

  // Debounced server-side search.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== applied.current.q) load(1, filter, search.trim(), [null])
    }, 350)
    return () => clearTimeout(t)
  }, [search, filter, load])

  const changeFilter = (f: Filter) => { setFilter(f); load(1, f, search.trim(), [null]) }
  const goNext = () => { if (meta.next) load(meta.page + 1, filter, search.trim(), [...applied.current.cursors.slice(0, meta.page), meta.next]) }
  const goPrev = () => { if (meta.page > 1) load(meta.page - 1, filter, search.trim(), applied.current.cursors) }
  const reload = () => load(applied.current.page, applied.current.status, applied.current.q, applied.current.cursors)

  // ── Live refresh from the server ────────────────────────────────────────────
  // After an import (ImportModal calls router.refresh()) — or any other server
  // revalidate — a fresh first page arrives via `initialPage`. React does NOT
  // re-derive our local `posts` state from props, so the list would silently stay
  // stale. Adopt the new data explicitly: replace it on the default view, or re-run
  // the active query when the user is currently searching/filtering/paging.
  const reloadRef = useRef(reload)
  // Keep the ref pointing at the latest `reload` without re-subscribing the
  // refresh effect below. Assigned in an effect (not during render) to satisfy
  // React 19's ref rules.
  useEffect(() => { reloadRef.current = reload })
  const lastInitialPage = useRef(initialPage)
  useEffect(() => {
    if (initialPage === lastInitialPage.current) return
    lastInitialPage.current = initialPage
    const a = applied.current
    if (a.page === 1 && a.status === 'all' && a.q === '') {
      setPosts(initialPage.posts)
      setMeta(metaFrom(initialPage, 1))
      setSelected(new Set())
    } else {
      reloadRef.current()
    }
  }, [initialPage])

  // One-click cleanup of the template's starter articles (meta.sample only).
  const [removingSamples, setRemovingSamples] = useState(false)
  const removeSamples = async () => {
    if (removingSamples) return
    const n = meta.samples ?? 0
    const ok = await confirm({
      title: 'Eliminar els articles de mostra?',
      message: `S'eliminaran els ${n} articles de mostra de la plantilla. Els que hagis escrit o importat tu no es toquen.`,
      confirmLabel: 'Eliminar-los',
      cancelLabel: 'Cancel·lar',
      tone: 'danger',
    })
    if (!ok) return
    setRemovingSamples(true)
    const res = await deleteSamplePosts(siteId)
    setRemovingSamples(false)
    if (res.error) { toast(res.error, 'error'); return }
    toast(`${res.deleted ?? 0} article${(res.deleted ?? 0) !== 1 ? 's' : ''} de mostra eliminat${(res.deleted ?? 0) !== 1 ? 's' : ''}`, 'success')
    reload()
  }

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
      if (willEmptyPage && (prevMeta.page > 1 || prevMeta.next)) reload()
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
      if (willEmptyPage && (prevMeta.page > 1 || prevMeta.next)) reload()
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
            <Button variant="secondary" onClick={onImport} iconLeft={<Upload className="w-4 h-4" />}>
              Importar
            </Button>
          )}
          <Button href={`/dashboard/sites/${siteId}/posts/new`} variant="secondary" iconLeft={<Plus className="w-4 h-4" />}>
            Escriure
          </Button>
          {/* Magic SEO Article — the premium AI entry point. The signature gold
              CTA (glow) so it reads as the first-class way to start a post. */}
          <Button
            glow
            onClick={handleGenerateAI}
            loading={generating}
            title="Genera un article complet i optimitzat per SEO amb IA"
            iconLeft={isSuperAdmin ? <Sparkles className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
          >
            {generating ? 'Generant…' : 'Genera amb IA'}
          </Button>
        </div>
      </header>

      {/* Template starter articles: one click and they're gone (only the
          meta.sample rows — anything the owner wrote is untouchable). */}
      {(meta.samples ?? 0) > 0 && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-accent/25 bg-accent-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            <Sparkles className="h-4 w-4 shrink-0 text-accent" />
            El teu blog té {meta.samples} article{(meta.samples ?? 0) !== 1 ? 's' : ''} de mostra de la plantilla.
            <span className="hidden text-muted sm:inline">Edita&apos;ls, o esborra&apos;ls tots quan tinguis contingut propi.</span>
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={removeSamples}
            loading={removingSamples}
            iconLeft={<Trash2 className="h-3.5 w-3.5" />}
            className="shrink-0"
          >
            Eliminar els de mostra
          </Button>
        </div>
      )}

      {meta.total === 0 && !search.trim() ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface border border-dashed border-border-strong rounded-[2rem] text-center">
          <div className="w-16 h-16 bg-surface-subtle text-subtle rounded-2xl flex items-center justify-center mb-5">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-text">Cap article encara</h3>
          <p className="text-subtle text-sm mt-1.5 max-w-xs">Crea el primer article per a {siteName}.</p>
          <Button href={`/dashboard/sites/${siteId}/posts/new`} glow className="mt-6" iconLeft={<Plus className="w-4 h-4" />}>
            Escriure el primer article
          </Button>
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
                <KnotSpinner className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-accent" />
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
                <Button onClick={handleGenerateAI} loading={generating} glow iconLeft={<Sparkles className="w-4 h-4" />}>
                  {generating ? 'Generant amb IA…' : 'Genera amb IA'}
                </Button>
                <Button href={`/dashboard/sites/${siteId}/posts/new`} variant="secondary" iconLeft={<PenLine className="w-4 h-4" />}>
                  Escriure
                </Button>
                {onImport && (
                  <Button variant="secondary" onClick={onImport} iconLeft={<Upload className="w-4 h-4" />}>
                    Importar
                  </Button>
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
              {posts.map((post, i) => (
                <ArticleCard
                  key={post.id}
                  post={post}
                  siteId={siteId}
                  subdomain={subdomain}
                  rank={i}
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
          {(meta.page > 1 || meta.next) && (
            <Pagination
              page={meta.page}
              pageCount={meta.pageCount}
              filteredCount={meta.filteredCount}
              hasNext={!!meta.next}
              disabled={isPending}
              onPrev={goPrev}
              onNext={goNext}
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

// Previous / next over keyset pages (W1): every page costs what the first costs,
// at any depth. There are no numbered jumps — search and the filters are how you
// reach an article, and nobody pages to 74.
function Pagination({
  page, pageCount, filteredCount, hasNext, disabled, onPrev, onNext,
}: {
  page: number; pageCount: number; filteredCount: number; hasNext: boolean; disabled: boolean
  onPrev: () => void; onNext: () => void
}) {
  const btn = "cursor-pointer h-9 px-3 flex items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-muted hover:bg-surface-hover"

  return (
    <nav aria-label="Paginació" className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-5 border-t border-border">
      <p className="text-xs font-medium text-subtle" aria-live="polite">
        Pàgina {page} de {Math.max(page, pageCount)} · {filteredCount} article{filteredCount !== 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={onPrev} disabled={disabled || page <= 1} className={btn}>
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <button onClick={onNext} disabled={disabled || !hasNext} className={btn}>
          Següent <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  )
}
