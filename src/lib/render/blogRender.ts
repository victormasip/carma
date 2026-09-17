// The cached public-blog render core (Super MVP Fase 4).
//
// Both public routes are thin wrappers over this module:
//   · /render/[siteId]            → the listing
//   · /render/[siteId]/[...path]  → an article, a locale listing, or a localised
//                                   article (locale is a PATH SEGMENT now)
//
// Everything here is a pure function of (tenant, locale, slug), which is exactly
// what makes `use cache` work: `buildListingPage` / `buildArticlePage` are
// deterministic given (theme, posts, locale), so the whole document caches.
// Per-request variance (embed fragments, dashboard previews, live token
// overrides, the paywall unlock cookie) stays OUT of here, in the route handlers.

import { cacheLife, cacheTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildListingPage, buildArticlePage, buildFeedItems, feedUrlFor, listingUrlFor } from '@/lib/render/theme'
import { buildRssFeed } from '@/lib/render/feed'
import { adminEditBarScript } from '@/lib/render/adminBar'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { LOCALES, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { isUuid, appOrigin } from '@/lib/sites/domain'
import { isModuleOn, type SiteModules } from '@/lib/modules/registry'
import { siteTag, postTag, linkCtxFor } from '@/lib/render/cache'

type Admin = ReturnType<typeof createAdminClient>

export const LISTING_POST_COLS =
  'id, title, slug, excerpt, featured_image, categories, tags, author_name, created_at, is_published'

export const ARTICLE_POST_COLS =
  'id, title, slug, content, excerpt, featured_image, categories, tags, author_name, created_at, is_published, seo_title, seo_description, meta'

type ThemeRow = Parameters<typeof buildListingPage>[0]
type ListingRows = Parameters<typeof buildListingPage>[3]
type ArticleRow = Parameters<typeof buildArticlePage>[3]

export type SiteRow = { siteId: string; siteName: string; subdomain: string | null }

// ─── Shared loaders (uncached — callers decide) ────────────────────────────────

/** Resolve the route param to a site. UUID = canonical path, else a subdomain label. */
export async function loadSite(admin: Admin, param: string): Promise<SiteRow | null> {
  const sel = admin.from('sites').select('id, name, subdomain')
  const { data } = isUuid(param)
    ? await sel.eq('id', param).maybeSingle()
    : await sel.eq('subdomain', param).maybeSingle()
  if (!data) return null
  return {
    siteId: data.id as string,
    siteName: (data.name as string) ?? '',
    subdomain: (data.subdomain as string | null) ?? null,
  }
}

export async function loadTheme(admin: Admin, siteId: string): Promise<ThemeRow> {
  const { data } = await admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle()
  return data as ThemeRow
}

/** Published posts for the feed. Never selects `content` — cards don't render it. */
export async function loadListingPosts(admin: Admin, siteId: string): Promise<ListingRows> {
  const fetchPosts = (cols: string) =>
    admin.from('posts')
      .select(cols)
      .eq('site_id', siteId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(100)
  const res = await fetchPosts(`${LISTING_POST_COLS}, i18n, default_locale`)
  // 42703-safe: the i18n columns only exist after migration 008.
  const rows = res.error?.code === '42703' ? (await fetchPosts(LISTING_POST_COLS)).data : res.data
  return (rows ?? []) as unknown as ListingRows
}

// ─── Slug resolution ──────────────────────────────────────────────────────────
//
// Each language gets its OWN slug — the slug IS the URL for that locale:
//   /hola-mon      → Catalan (default-locale flat column)
//   /en/hello      → English (i18n.en.slug)
// Resolution order: the flat `slug` column first (fastest, indexed, the common
// case), then a scan of i18n JSONB for any locale whose .slug matches. Whichever
// matches determines the EFFECTIVE locale, so translated URLs never 404.

export type Resolution = { post: ArticleRow; matchedLocale: Locale | null }

export async function resolveBySlug(admin: Admin, siteId: string, slug: string): Promise<Resolution | null> {
  const flat = await admin.from('posts')
    .select(`${ARTICLE_POST_COLS}, i18n, default_locale`)
    .eq('site_id', siteId)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (flat.error?.code === '42703') {
    // Pre-migration-008: no i18n columns. Fall back to the bare slug lookup.
    const bare = await admin.from('posts')
      .select(ARTICLE_POST_COLS)
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
    return bare.data ? { post: bare.data as ArticleRow, matchedLocale: null } : null
  }

  if (flat.data) {
    const dl = (flat.data as { default_locale?: string }).default_locale
    return { post: flat.data as ArticleRow, matchedLocale: normalizeLocale(dl) }
  }

  // No flat match: try every non-default locale's i18n[loc].slug, OR'd into one
  // round-trip regardless of locale count.
  const orParts = LOCALES.map(l => `i18n->${l}->>slug.eq.${slug}`).join(',')
  const byLocale = await admin.from('posts')
    .select(`${ARTICLE_POST_COLS}, i18n, default_locale`)
    .eq('site_id', siteId)
    .or(orParts)
    .eq('is_published', true)
    .limit(1)
    .maybeSingle()
  if (!byLocale.data) return null

  const i18n = (byLocale.data as { i18n?: Record<string, { slug?: string }> | null }).i18n ?? {}
  let matched: Locale | null = null
  for (const loc of LOCALES) {
    if (i18n[loc]?.slug === slug) { matched = loc; break }
  }
  return { post: byLocale.data as ArticleRow, matchedLocale: matched }
}

/**
 * A slug that no longer resolves may be a RENAMED article. Migration 032 records
 * every rename, so an old inbound link 308s to the canonical URL instead of 404ing
 * — the thing WordPress does and we previously didn't.
 *
 * 42P01-safe: without migration 032 the table doesn't exist and we simply 404, as
 * before.
 */
export async function resolveRedirect(admin: Admin, siteId: string, slug: string): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('post_redirects')
      .select('post_id, posts!inner(slug, is_published)')
      .eq('site_id', siteId)
      .eq('from_slug', slug)
      .maybeSingle()
    if (error || !data) return null
    const post = (data as { posts?: { slug?: string; is_published?: boolean } }).posts
    if (!post?.slug || post.is_published !== true) return null
    return post.slug
  } catch {
    return null
  }
}

// ─── Cached renders ───────────────────────────────────────────────────────────

function themeWithTokens(theme: ThemeRow) {
  const base: DesignTokens = {
    ...DEFAULT_TOKENS,
    ...((theme?.design_tokens as Partial<DesignTokens>) ?? {}),
  }
  return { ...(theme ?? {}), design_tokens: base } as ThemeRow
}

export type CachedDoc = { html: string; siteId: string }

/**
 * The listing, cached and tagged `site:<id>`.
 *
 * `cacheLife('days')` matches the content cadence (a blog publishes daily at
 * most) and is a safety net only — correctness on publish comes from the tag,
 * not the timer.
 */
export async function renderListingCached(
  param: string,
  locale: Locale | null,
  appHost: string,
): Promise<CachedDoc | null> {
  'use cache'
  cacheLife('days')

  const admin = createAdminClient()
  const site = await loadSite(admin, param)
  if (!site) return null
  cacheTag(siteTag(site.siteId))

  const [theme, posts] = await Promise.all([
    loadTheme(admin, site.siteId),
    loadListingPosts(admin, site.siteId),
  ])

  const effective = locale ?? normalizeLocale((theme as { default_locale?: string } | null)?.default_locale)
  const themeForRender = themeWithTokens(theme)
  const link = linkCtxFor(param, site.siteId, themeForRender)

  const html = buildListingPage(themeForRender, site.siteName, site.siteId, posts, effective, link)
  return {
    html: html.replace('</body>', `${adminEditBarScript(site.siteId, appOrigin(appHost))}\n</body>`),
    siteId: site.siteId,
  }
}

export type ArticleOutcome =
  | { kind: 'ok'; doc: CachedDoc }
  | { kind: 'redirect'; slug: string }
  | { kind: 'missing' }
  /** Paywalled: must be rendered per-reader (unlock cookie), never shared-cached. */
  | { kind: 'uncacheable'; siteId: string }

/**
 * An article, cached and tagged `site:<id>` + `post:<id>:<postId>`.
 *
 * Two escapes back to the dynamic path:
 *   · `redirect`    — the slug was renamed (migration 032); caller 308s.
 *   · `uncacheable` — the paywall module is on, so the visible body depends on a
 *                     per-reader unlock cookie. Previously this forced
 *                     `private, no-store` on the WHOLE page for every paywalled
 *                     site; the caller now renders it dynamically while every
 *                     non-paywalled article on the same site stays cached.
 */
export async function renderArticleCached(
  param: string,
  slug: string,
  localeOverride: Locale | null,
  appHost: string,
): Promise<ArticleOutcome> {
  'use cache'
  cacheLife('days')

  const admin = createAdminClient()
  const site = await loadSite(admin, param)
  if (!site) return { kind: 'missing' }
  cacheTag(siteTag(site.siteId))

  const [theme, resolution] = await Promise.all([
    loadTheme(admin, site.siteId),
    resolveBySlug(admin, site.siteId, slug),
  ])

  if (!resolution) {
    const to = await resolveRedirect(admin, site.siteId, slug)
    return to ? { kind: 'redirect', slug: to } : { kind: 'missing' }
  }
  cacheTag(postTag(site.siteId, resolution.post.id))

  const modules = (theme?.modules ?? null) as SiteModules | null
  if (isModuleOn(modules, 'paywall')) return { kind: 'uncacheable', siteId: site.siteId }

  // Effective locale: an explicit override wins (the switcher), then the locale
  // whose slug actually matched (the URL IS the truth: a Spanish slug renders
  // Spanish), then the article's own default, then the site's.
  const postDefault = (resolution.post as { default_locale?: string }).default_locale
  const siteDefault = (theme as { default_locale?: string } | null)?.default_locale
  const effective = normalizeLocale(
    localeOverride ?? resolution.matchedLocale ?? postDefault ?? siteDefault,
  )

  // Related / prev-next need sibling posts; fetch a bounded recent window ONLY
  // when one of those modules is on (no cost otherwise).
  let siblings: ListingRows = [] as unknown as ListingRows
  if (isModuleOn(modules, 'relatedPosts') || isModuleOn(modules, 'prevNext')) {
    const fetchSibs = (cols: string) => admin.from('posts')
      .select(cols).eq('site_id', site.siteId).eq('is_published', true)
      .order('created_at', { ascending: false }).limit(24)
    const res = await fetchSibs(`${LISTING_POST_COLS}, i18n, default_locale`)
    const rows = (res.error?.code === '42703' ? (await fetchSibs(LISTING_POST_COLS)).data : res.data) ?? []
    siblings = rows as unknown as ListingRows
  }

  const themeForRender = themeWithTokens(theme)
  const link = linkCtxFor(param, site.siteId, themeForRender)
  const html = buildArticlePage(
    themeForRender, site.siteName, site.siteId, resolution.post, effective,
    { siblings: siblings as never, unlocked: true }, link,
  )
  return {
    kind: 'ok',
    doc: {
      html: html.replace('</body>', `${adminEditBarScript(site.siteId, appOrigin(appHost))}\n</body>`),
      siteId: site.siteId,
    },
  }
}

// ─── The feed ─────────────────────────────────────────────────────────────────

/**
 * The blog's RSS document, cached and tagged `site:<id>` exactly like the HTML.
 *
 * Same tag on purpose: a publish already invalidates the listing, and a feed
 * that lags behind the page it describes is worse than no feed — a subscriber's
 * reader is the one surface that polls, so staleness there is visible for hours.
 *
 * `origin` is part of the cache key because the links inside a feed MUST be
 * absolute, and the right absolute origin depends on how the blog was reached
 * (its own subdomain, or the canonical engine path).
 */
export async function renderFeedCached(
  param: string,
  locale: Locale | null,
  origin: string,
): Promise<{ xml: string; siteId: string } | null> {
  'use cache'
  cacheLife('days')

  const admin = createAdminClient()
  const site = await loadSite(admin, param)
  if (!site) return null
  cacheTag(siteTag(site.siteId))

  const [theme, posts] = await Promise.all([
    loadTheme(admin, site.siteId),
    loadListingPosts(admin, site.siteId),
  ])

  const effective = locale ?? normalizeLocale((theme as { default_locale?: string } | null)?.default_locale)
  const themeForRender = themeWithTokens(theme)
  const link = linkCtxFor(param, site.siteId, themeForRender)

  // A feed is read in someone else's app, days later. 50 is the number every
  // reader handles comfortably and nobody needs more of on a first fetch.
  const items = buildFeedItems(
    (posts as unknown as Parameters<typeof buildFeedItems>[0]).slice(0, 50),
    effective, link, origin,
  )

  const sectionTitle = (theme as { section_title?: string | null } | null)?.section_title
  return {
    xml: buildRssFeed({
      siteName: site.siteName,
      siteUrl: listingUrlFor(link, effective, origin),
      feedUrl: feedUrlFor(link, effective, origin),
      description: (sectionTitle ?? '').trim() || site.siteName,
      locale: effective,
      posts: items,
    }),
    siteId: site.siteId,
  }
}
