// The dashboard's article list — W1 (L'INSTANT), reboot plan §4.5.
//
// Before: every page of the list ran FIVE queries — the page itself with an exact
// count, then three more `count: 'exact'` scans (total, published, samples) — and
// paged with OFFSET, so page 40 read and threw away 468 rows to show 12.
//
// Now:
//   · the page is a KEYSET page over (created_at, id) — the order the list has
//     always had, served by `posts_site_created_id_idx` (migration 041): page 400
//     costs what page 1 costs;
//   · the three totals come from ONE row of `site_counters` (migration 041),
//     trigger-maintained, instead of three scans;
//   · a search counts its matches exactly, once, on its first page — served by the
//     trigram indexes of 041 — and never again while paging.
// Two round trips, in parallel. Before migration 041 the counters fall back to the
// old exact counts (42P01 / no row), so deploy order does not matter.
//
// A plain server module, deliberately NOT 'use server': the site page calls it
// after its own access check, and the `listPosts` action wraps it with one. A
// server action exported from here would be callable by anyone with an id.

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** How many articles a page of the dashboard list shows. */
export const POSTS_PAGE_SIZE = 12

export type PostListItem = { id: string; title: string; slug: string; is_published: boolean; created_at: string; featured_image: string | null }
export type PostStatusFilter = 'all' | 'published' | 'draft'

export type PostCounts = { total: number; published: number; drafts: number; samples: number }

export type PostListPage = PostCounts & {
  posts: PostListItem[]
  /** Loads the page after this one; null on the last page. */
  next: string | null
  /** Rows matching the filter. Null = unchanged since the first page of this search. */
  filteredCount: number | null
}

const COLS = 'id, title, slug, is_published, created_at, featured_image'

// ─── Cursor ──────────────────────────────────────────────────────────────────
// `<created_at as Postgres printed it>|<id>`. The timestamp is passed back exactly
// as received (microseconds included): a JS Date would round to milliseconds and
// skip — or repeat — rows created within the same millisecond.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/

export function encodeCursor(row: { created_at: string; id: string }): string {
  return `${row.created_at}|${row.id}`
}

export function decodeCursor(cursor: string | null | undefined): { at: string; id: string } | null {
  if (!cursor) return null
  const i = cursor.lastIndexOf('|')
  const at = cursor.slice(0, i), id = cursor.slice(i + 1)
  return i > 0 && STAMP.test(at) && UUID.test(id) ? { at, id } : null
}

// ─── Counts ──────────────────────────────────────────────────────────────────

async function exactCounts(admin: Admin, siteId: string): Promise<PostCounts> {
  const [all, pub, samples] = await Promise.all([
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('site_id', siteId),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('site_id', siteId).eq('is_published', true),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('site_id', siteId).contains('meta', { sample: true }),
  ])
  const total = all.count ?? 0, published = pub.count ?? 0
  return { total, published, drafts: total - published, samples: samples.count ?? 0 }
}

/** The site's article totals: one counter row (041), or three exact counts before it. */
export async function loadPostCounts(admin: Admin, siteId: string): Promise<PostCounts> {
  const { data, error } = await admin
    .from('site_counters').select('posts_total, posts_published, posts_samples').eq('site_id', siteId).maybeSingle()
  // No table yet (42P01, before migration 041), or no row: a site gets its row
  // with its first post — until then the exact counts are the right, cheap answer.
  if (error || !data) return exactCounts(admin, siteId)
  const row = data as { posts_total: number; posts_published: number; posts_samples: number }
  return {
    total: row.posts_total, published: row.posts_published,
    drafts: row.posts_total - row.posts_published, samples: row.posts_samples,
  }
}

// ─── The page ────────────────────────────────────────────────────────────────

/** A search term as it may appear inside a PostgREST `or=(…)` filter. */
export function cleanTerm(q: string | null | undefined): string {
  return (q ?? '').trim().replace(/[,%()\\*"]/g, '').slice(0, 120)
}

export async function loadPostsPage(
  admin: Admin,
  siteId: string,
  opts: { after?: string | null; status?: PostStatusFilter; q?: string | null; limit?: number } = {},
): Promise<PostListPage> {
  const limit = Math.max(1, Math.min(60, opts.limit ?? POSTS_PAGE_SIZE))
  const term = cleanTerm(opts.q)
  const cursor = decodeCursor(opts.after)
  // A search counts its matches on its FIRST page only — paging never recounts.
  const countMatches = !!term && !cursor

  let query = admin.from('posts').select(COLS, countMatches ? { count: 'exact' } : undefined).eq('site_id', siteId)
  if (opts.status === 'published') query = query.eq('is_published', true)
  if (opts.status === 'draft') query = query.eq('is_published', false)
  if (term) query = query.or(`title.ilike.%${term}%,slug.ilike.%${term}%`)
  // Strictly after the cursor in (created_at DESC, id DESC). Two `or` params are
  // AND-ed by PostgREST, so this composes with the search above.
  if (cursor) query = query.or(`created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt.${cursor.id})`)

  const [page, counts] = await Promise.all([
    query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1),
    loadPostCounts(admin, siteId),
  ])
  if (page.error) throw new Error(page.error.message)

  const rows = (page.data ?? []) as unknown as PostListItem[]
  const posts = rows.slice(0, limit)
  const filteredCount = term
    ? (countMatches ? (page.count ?? posts.length) : null)
    : opts.status === 'published' ? counts.published : opts.status === 'draft' ? counts.drafts : counts.total
  return {
    posts,
    next: rows.length > limit ? encodeCursor(posts[posts.length - 1]!) : null,
    filteredCount,
    ...counts,
  }
}
