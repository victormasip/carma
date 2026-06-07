// Analytics read model — aggregation over page_views.
//
// Plain server utilities (NOT server actions) that take an admin Supabase client,
// so they're reusable from both server components (dashboard) and access-checked
// server actions (the site Overview). Aggregation is done in JS over a bounded
// window fetch: simple, index-backed, and correct for early-stage volumes. At
// scale this is the natural place to swap in a SQL rollup/RPC without touching
// callers.

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// Hard cap on rows pulled for the detailed (per-site) aggregation. Beyond this we
// flag `capped` so the UI can hint the numbers are a floor.
const ROW_CAP = 50_000

export type StatPoint = { date: string; views: number; visitors: number }
export type TopPost = { postId: string; title: string; slug: string; views: number }

export type SiteStats = {
  days: number
  totalViews: number
  uniqueVisitors: number
  prevViews: number          // same-length previous period, for the trend delta
  series: StatPoint[]         // one bucket per day, oldest → newest
  topPosts: TopPost[]
  capped: boolean
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const sinceIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

function emptyStats(days: number): SiteStats {
  const today = new Date()
  const series: StatPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - i)
    series.push({ date: dayKey(d), views: 0, visitors: 0 })
  }
  return { days, totalViews: 0, uniqueVisitors: 0, prevViews: 0, series, topPosts: [], capped: false }
}

type ViewRow = { created_at: string; post_id: string | null; visitor_hash: string | null }

export async function fetchSiteStats(admin: Admin, siteId: string, days = 30): Promise<SiteStats> {
  const since = sinceIso(days)
  const prevSince = sinceIso(days * 2)

  const [{ data, error }, prevCount] = await Promise.all([
    admin.from('page_views')
      .select('created_at, post_id, visitor_hash')
      .eq('site_id', siteId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(ROW_CAP),
    admin.from('page_views')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .gte('created_at', prevSince)
      .lt('created_at', since),
  ])

  // Table missing (migration 015 not yet run) or any error → empty, never throw.
  if (error) return emptyStats(days)

  const rows = (data ?? []) as ViewRow[]
  const base = emptyStats(days)
  const idx = new Map(base.series.map((b, i) => [b.date, i]))
  const daySets = base.series.map(() => new Set<string>())
  const allVisitors = new Set<string>()
  const postViews = new Map<string, number>()

  for (const r of rows) {
    const k = r.created_at.slice(0, 10)
    const i = idx.get(k)
    if (i != null) {
      base.series[i].views++
      if (r.visitor_hash) daySets[i].add(r.visitor_hash)
    }
    if (r.visitor_hash) allVisitors.add(r.visitor_hash)
    if (r.post_id) postViews.set(r.post_id, (postViews.get(r.post_id) ?? 0) + 1)
  }
  base.series.forEach((b, i) => { b.visitors = daySets[i].size })

  base.totalViews = rows.length
  base.uniqueVisitors = allVisitors.size
  base.prevViews = prevCount.count ?? 0
  base.capped = rows.length >= ROW_CAP

  // Resolve titles/slugs for the most-viewed posts.
  const topIds = [...postViews.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  if (topIds.length) {
    const { data: postRows } = await admin
      .from('posts').select('id, title, slug').in('id', topIds.map(([id]) => id))
    const meta = new Map((postRows ?? []).map(p => [p.id as string, p as { title: string; slug: string }]))
    base.topPosts = topIds.map(([postId, views]) => ({
      postId,
      title: meta.get(postId)?.title ?? '(article eliminat)',
      slug: meta.get(postId)?.slug ?? '',
      views,
    }))
  }

  return base
}

/** Per-site view counts over the last `days`, for the dashboard cards.
 *
 *  Single round-trip: one grouped aggregation in the database via the
 *  `site_view_counts` RPC (migration 020), index-backed and row-cap-free. If the
 *  function isn't present yet (pre-migration) we fall back to the previous
 *  per-site head-count fan-out so the dashboard keeps working unchanged. */
export async function fetchSitesViewCounts(
  admin: Admin, siteIds: string[], days = 30,
): Promise<Record<string, number>> {
  const since = sinceIso(days)
  const ids = siteIds.slice(0, 60) // bound the fan-out / payload
  const out: Record<string, number> = {}
  if (ids.length === 0) return out
  for (const id of ids) out[id] = 0

  const { data, error } = await admin.rpc('site_view_counts', { p_site_ids: ids, p_since: since })
  if (!error && Array.isArray(data)) {
    for (const row of data as { site_id: string; views: number }[]) {
      out[row.site_id] = Number(row.views) || 0
    }
    return out
  }

  // Fallback (function missing / not yet migrated): one head-count per site.
  await Promise.all(ids.map(async id => {
    const { count, error: e } = await admin
      .from('page_views').select('id', { count: 'exact', head: true })
      .eq('site_id', id).gte('created_at', since)
    out[id] = e ? 0 : (count ?? 0)
  }))
  return out
}
