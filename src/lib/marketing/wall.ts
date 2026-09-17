// "FET AMB CARMA" — the wall of real member blogs (server-only).
//
// It used to paint the eight starter TEMPLATES and label them "made with
// Carma", which is a claim about members assembled out of our own design files.
// Founder, 2026-09-17: "ensure this is hooked up to REAL member blogs, no static
// placeholders. The richer ones."
//
// WHAT COUNTS AS A MEMBER BLOG HERE — and the first one is not negotiable
//   · THE OWNER SAID YES. `sites.showcase` is an explicit opt-in, false for
//     every site that exists and every site created from now on (migration 038).
//   · it has a subdomain, i.e. a real public address a visitor can open;
//   · it has at least one PUBLISHED article — a blog with nothing in it is not
//     a showcase, it is an empty room;
//   · it is not one of ours (see EXCLUDED_NAMES) unless nothing else qualifies,
//     because a wall of Carma's own blog is the placeholder with extra steps.
//
// "THE RICHER ONES" is scored, not guessed: published articles + switched-on
// modules + a real captured identity (own typeface/colours) + a cover image.
// A blog that cloned its owner's site and has eight modules running beats one
// with a default look and two posts, every time.
//
// ═══ PRIVACY: THIS FILE FAILS CLOSED ═══════════════════════════════════════
//
// The first version took every public blog with published articles. It was
// defensible — each thing it showed was already open to the internet — and it
// was still wrong: appearing on Carma's own front page is a decision the owner
// makes, not a consequence of publishing. Founder, 2026-09-17: "no site should
// ever appear on the landing page without this explicit boolean set."
//
// So `showcase = true` is a hard filter, and — uniquely in this codebase — a
// missing column is NOT degraded past. Everywhere else a pending migration
// degrades toward keeping the feature working; here it degrades toward SILENCE.
// If we cannot prove someone opted in, we show nobody. An empty wall is a
// cosmetic problem for one deploy; a wall of people who never agreed to be on
// it is not a problem we could take back.

import { createAdminClient } from '@/lib/supabase/admin'
import { publicSiteUrl } from '@/lib/sites/domain'

type Admin = ReturnType<typeof createAdminClient>

/** Our own demo/seed sites. Shown only if the wall would otherwise be empty. */
const EXCLUDED_NAMES = new Set(['carma', 'demo', 'test', 'prova', 'exemple', 'ejemplo', 'example'])

const UNDEFINED_COLUMN = '42703'

/** The cache entry the landing's wall lives in. Busted when someone opts in or
 *  out, so the front page reflects the decision within the same minute. */
export const WALL_TAG = 'community-wall'

export type WallBlog = {
  id: string
  name: string
  /** The blog's own public address — never `/render/<uuid>`. */
  url: string
  /** Its own section heading ("Journal", "Actualitat", …) when it has one. */
  sectionTitle: string | null
  publishedPosts: number
  activeModules: number
  /** The blog's real design tokens, reduced to what a card needs to look like it. */
  bg: string
  surface: string
  text: string
  accent: string
  border: string
  fontHeading: string | null
  /** Up to two real published headlines — the proof the wall is alive. */
  headlines: string[]
  /** A real cover from one of those posts, if any. */
  cover: string | null
}

type ThemeRow = {
  site_id: string
  design_tokens: Record<string, unknown> | null
  section_title: string | null
  modules: Record<string, { enabled?: boolean } | null> | null
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Only accept a colour we can safely drop into a style attribute. */
function colour(tokens: Record<string, unknown> | null, keys: string[], fallback: string): string {
  for (const k of keys) {
    const v = tokens?.[k]
    if (typeof v === 'string') {
      const t = v.trim()
      if (HEX.test(t)) return t
      // rgb()/rgba()/hsl() with nothing but numbers, commas, spaces and percent.
      if (/^(rgb|hsl)a?\(\s*[\d.,%\s/]+\)$/i.test(t)) return t
    }
  }
  return fallback
}

/** A font stack is injected as a style value, so it must stay a font stack. */
function fontStack(tokens: Record<string, unknown> | null, keys: string[]): string | null {
  for (const k of keys) {
    const v = tokens?.[k]
    if (typeof v !== 'string') continue
    const t = v.trim().slice(0, 120)
    // families, quotes, commas, hyphens and spaces — nothing that can close a
    // declaration and start another one.
    if (t && /^[\w\s'",-]+$/.test(t)) return t
  }
  return null
}

function score(b: { publishedPosts: number; activeModules: number; custom: boolean; cover: boolean }): number {
  return (
    Math.min(b.publishedPosts, 25) * 4 +
    Math.min(b.activeModules, 14) * 3 +
    (b.custom ? 12 : 0) +
    (b.cover ? 6 : 0)
  )
}

/**
 * The richest OPTED-IN member blogs, best first.
 *
 * The reads after step 1 are 42P01/42703-safe in the usual way: a missing table
 * or column degrades to a thinner card, never to an error on the landing page.
 * Step 1 is the exception and the point — see the privacy note in the header.
 */
export async function readWall(limit = 12, client?: Admin): Promise<WallBlog[]> {
  // `client` exists so the privacy contract can be TESTED (tests/landing.mjs
  // §7): the opt-in filter is the kind of line a refactor removes by accident,
  // and an invariant nobody can assert is an invariant nobody keeps. Production
  // never passes it.
  let admin: Admin
  if (client) admin = client
  else { try { admin = createAdminClient() } catch { return [] } }

  // 1 — sites whose owner OPTED IN, and which have an address someone can open.
  //
  // `.eq('showcase', true)` is the whole privacy contract. Note the error
  // handling: any failure at all — including 42703 when migration 038 has not
  // run — returns an empty wall rather than falling back to a broader query.
  // There is deliberately no "try without the column" retry here; that retry is
  // the standard pattern in this codebase and it is exactly the wrong thing to
  // write on this line.
  let sites: { id: string; name: string; subdomain: string | null }[] = []
  try {
    const { data, error } = await admin
      .from('sites')
      .select('id, name, subdomain, showcase')
      .eq('showcase', true)
      .not('subdomain', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      if (error.code === UNDEFINED_COLUMN) {
        console.warn('[wall] sites.showcase missing (migration 038 pending) — showing nobody, by design.')
      }
      return []
    }
    sites = (data ?? [])
      // Belt as well as braces: the filter above is the guarantee, and this line
      // is what makes a future refactor that drops it fail loudly instead of
      // quietly publishing people.
      .filter(r => (r as { showcase?: unknown }).showcase === true)
      .map(r => ({
        id: String(r.id),
        name: String(r.name ?? '').trim(),
        subdomain: (r.subdomain as string | null) ?? null,
      }))
      .filter(s => s.name && s.subdomain)
  } catch { return [] }
  if (!sites.length) return []

  const ids = sites.map(s => s.id)

  // 2 — the published posts themselves: the count, the headlines and a cover,
  //     from ONE read. `published_at` may not exist on older schemas, so we sort
  //     on created_at, which always does.
  const posts = new Map<string, { count: number; titles: string[]; cover: string | null }>()
  try {
    const { data } = await admin
      .from('posts')
      .select('site_id, title, featured_image, created_at')
      .in('site_id', ids)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(1500)
    for (const row of data ?? []) {
      const key = String(row.site_id)
      const cur = posts.get(key) ?? { count: 0, titles: [], cover: null }
      cur.count++
      const title = String(row.title ?? '').trim()
      if (title && cur.titles.length < 2) cur.titles.push(title.slice(0, 90))
      const img = typeof row.featured_image === 'string' ? row.featured_image.trim() : ''
      if (!cur.cover && /^https:\/\//i.test(img)) cur.cover = img
      posts.set(key, cur)
    }
  } catch { /* no posts table reachable → nothing qualifies */ }

  // 3 — their looks. One query; `modules` is post-024, so retry without it.
  const themes = new Map<string, ThemeRow>()
  try {
    let res = await admin
      .from('site_themes')
      .select('site_id, design_tokens, section_title, modules')
      .in('site_id', ids)
    if (res.error?.code === '42703') {
      res = await admin
        .from('site_themes')
        .select('site_id, design_tokens, section_title')
        .in('site_id', ids) as typeof res
    }
    for (const row of (res.data ?? []) as ThemeRow[]) themes.set(String(row.site_id), row)
  } catch { /* looks are optional — a card still renders in brand neutral */ }

  const built: (WallBlog & { _score: number; _ours: boolean })[] = []
  for (const site of sites) {
    const p = posts.get(site.id)
    if (!p || p.count === 0) continue

    const theme = themes.get(site.id) ?? null
    const tokens = theme?.design_tokens ?? null
    const activeModules = Object.values(theme?.modules ?? {}).filter(m => m?.enabled === true).length
    const fontHeading = fontStack(tokens, ['fontHeading', 'font_heading', 'fontBody', 'font_body'])
    const accent = colour(tokens, ['colorAccent', 'accent', 'colorPrimary', 'primary'], '#f5bc00')

    const blog: WallBlog = {
      id: site.id,
      name: site.name,
      url: publicSiteUrl({ id: site.id, subdomain: site.subdomain }),
      sectionTitle: theme?.section_title?.trim() || null,
      publishedPosts: p.count,
      activeModules,
      bg: colour(tokens, ['colorBg', 'bg', 'background'], '#ffffff'),
      surface: colour(tokens, ['colorSurface', 'surface'], '#ffffff'),
      text: colour(tokens, ['colorText', 'text'], '#111111'),
      accent,
      border: colour(tokens, ['colorBorder', 'border'], '#e7e5e4'),
      fontHeading,
      headlines: p.titles,
      cover: p.cover,
    }

    built.push({
      ...blog,
      _ours: EXCLUDED_NAMES.has(site.name.toLowerCase()),
      _score: score({
        publishedPosts: p.count,
        activeModules,
        custom: !!(fontHeading || tokens?.colorAccent),
        cover: !!p.cover,
      }),
    })
  }

  built.sort((a, b) => b._score - a._score)
  const theirs = built.filter(b => !b._ours)
  // Ours only fills the gap — and only when there is a gap.
  const chosen = (theirs.length >= 4 ? theirs : built).slice(0, limit)
  return chosen.map(({ _score, _ours, ...blog }) => { void _score; void _ours; return blog })
}
