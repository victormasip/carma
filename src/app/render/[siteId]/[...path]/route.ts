import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildArticlePage, buildArticleFragment, buildListingPage, buildErrorPage } from '@/lib/render/theme'
import { adminEditBarScript } from '@/lib/render/adminBar'
import { applyParamsToTokens } from '@/lib/render/embedParams'
import { FRAGMENT_CORS } from '@/lib/render/cors'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { normalizeLocale, isLocale, type Locale } from '@/lib/i18n/config'
import { tr } from '@/lib/i18n/messages'
import { appOrigin } from '@/lib/sites/domain'
import { isModuleOn, type SiteModules } from '@/lib/modules/registry'
import { buildSampleArticle, buildSamplePosts } from '@/lib/render/samplePosts'
import {
  BLOG_CACHE_CONTROL, PRIVATE_CACHE_CONTROL, isPlainPublicRequest, linkCtxFor, parseBlogPath,
} from '@/lib/render/cache'
import {
  renderArticleCached, renderListingCached, renderFeedCached, resolveBySlug, resolveRedirect,
  loadSite, loadTheme, LISTING_POST_COLS,
} from '@/lib/render/blogRender'
import { isFeedPath } from '@/lib/render/feed'

// Replaces the old `[slug]/route.ts`.
//
// WHY A CATCH-ALL: locale is a PATH SEGMENT now, not `?lang=`.
//
//   /hola-mon           article, default locale
//   /es                 listing in Spanish
//   /es/hola-mundo      Spanish article
//
// Query-param locales gave us no clean hreflang structure and are weak SEO; worse,
// the old code had to force `?lang=` onto EVERY listing link (even the default)
// because a bare `/render/<id>` resolves to the SITE's default locale, which is
// not always the platform default — so "Català" on a Spanish site landed back on
// Spanish. A path segment is unambiguous by construction.
//
// `dynamic = 'force-dynamic'` is gone here too — see the listing route's note.

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: FRAGMENT_CORS })
}

function htmlResponse(html: string, cacheControl: string, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cacheControl },
  })
}

function notFound(uiLoc: ReturnType<typeof normalizeLocale>, key: 'render.siteNotFound' | 'render.articleNotFound') {
  const err = buildErrorPage(tr(uiLoc, key), 404, uiLoc)
  return htmlResponse(err.html, PRIVATE_CACHE_CONTROL, err.status)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; path: string[] }> },
) {
  const { siteId: param, path } = await params
  const sp = request.nextUrl.searchParams
  const rawLang = sp.get('lang')
  const uiLocale = normalizeLocale(sp.get('ui') ?? rawLang)
  const appHost = request.headers.get('host') ?? ''
  // An explicit ?lang= overrides the path (the embed loader toggles locales
  // without changing the URL), and is the one case a slug-less locale needs.
  const explicit: Locale | null = rawLang && isLocale(rawLang) ? (rawLang as Locale) : null

  // ── RSS ────────────────────────────────────────────────────────────────────
  // `/rss.xml` and `/<locale>/rss.xml`, intercepted BEFORE slug parsing (a post
  // whose slug were literally "rss.xml" would otherwise shadow the feed).
  //
  // Distribution is a pillar: without this every generated blog is unreachable
  // from a reader app, a newsletter service or any aggregator.
  if (isFeedPath(path ?? [])) {
    const segs = (path ?? []).filter(Boolean)
    const prefix = segs.slice(0, -1)
    const feedLocale = prefix.length === 1 && isLocale(prefix[0]) ? (prefix[0] as Locale) : explicit
    // Absolute links, resolved against the host the subscriber actually used.
    const proto = request.nextUrl.protocol === 'http:' ? 'http' : 'https'
    const origin = appHost ? `${proto}://${appHost}` : request.nextUrl.origin
    const feed = await renderFeedCached(param, feedLocale, origin)
    if (!feed) return notFound(uiLocale, 'render.siteNotFound')
    return new Response(feed.xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': BLOG_CACHE_CONTROL,
        // Readers poll from everywhere; a feed is public by definition.
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const parsed = parseBlogPath(path ?? [])

  // ── Locale listing: /render/<tenant>/es ────────────────────────────────────
  if (parsed.kind === 'listing') {
    if (isPlainPublicRequest(sp)) {
      const cached = await renderListingCached(param, explicit ?? parsed.locale, appHost)
      if (cached) return htmlResponse(cached.html, BLOG_CACHE_CONTROL)
      return notFound(uiLocale, 'render.siteNotFound')
    }
    // Overrides present → rebuild dynamically, reusing the listing route's shape.
    return renderDynamicListing(request, param, explicit ?? parsed.locale, uiLocale)
  }

  const slug = parsed.slug
  const localeOverride = explicit ?? parsed.locale

  // ── FAST PATH ──────────────────────────────────────────────────────────────
  if (isPlainPublicRequest(sp)) {
    const outcome = await renderArticleCached(param, slug, localeOverride, appHost)
    if (outcome.kind === 'ok') return htmlResponse(outcome.doc.html, BLOG_CACHE_CONTROL)
    if (outcome.kind === 'redirect') {
      // A renamed slug. 308 (permanent, method-preserving) to the canonical URL,
      // keeping the locale prefix the visitor arrived with.
      const base = request.nextUrl.clone()
      const prefix = parsed.locale ? `/${parsed.locale}` : ''
      base.pathname = `/render/${param}${prefix}/${encodeURIComponent(outcome.slug)}`
      return NextResponse.redirect(base, 308)
    }
    if (outcome.kind === 'missing') return notFound(uiLocale, 'render.articleNotFound')
    // 'uncacheable' → paywalled; fall through to the dynamic path below.
  }

  // ── DYNAMIC PATH ───────────────────────────────────────────────────────────
  // Embed fragments, dashboard previews, live token overrides, and paywalled
  // articles (whose visible body depends on a per-reader unlock cookie).
  const isFragment = sp.get('format') === 'fragment'
  const isPreview = sp.has('preview')
  const admin = createAdminClient()

  const site = await loadSite(admin, param)
  if (!site) {
    if (isFragment) {
      return NextResponse.json({ error: tr(uiLocale, 'render.siteNotFound') }, { status: 404, headers: FRAGMENT_CORS })
    }
    return notFound(uiLocale, 'render.siteNotFound')
  }

  const [theme, resolution] = await Promise.all([
    loadTheme(admin, site.siteId),
    resolveBySlug(admin, site.siteId, slug),
  ])

  const base: DesignTokens = { ...DEFAULT_TOKENS, ...((theme?.design_tokens as Partial<DesignTokens>) ?? {}) }
  const themeForRender = { ...(theme ?? {}), design_tokens: applyParamsToTokens(base, sp) }
  const link = linkCtxFor(param, site.siteId, themeForRender)

  if (!resolution) {
    // Dashboard preview with no published post yet: render a SAMPLE article so the
    // Smart-Modules ARTICLE preview always has real content to render against.
    if (isPreview && !isFragment) {
      const previewLocale = normalizeLocale(localeOverride ?? (theme as { default_locale?: string } | null)?.default_locale)
      const sample = buildSampleArticle(previewLocale, site.siteName) as unknown as Parameters<typeof buildArticlePage>[3]
      const siblings = buildSamplePosts(previewLocale, site.siteName) as unknown as never
      const html = buildArticlePage(
        themeForRender, site.siteName, site.siteId, sample, previewLocale,
        { siblings, unlocked: false }, link,
      )
      return htmlResponse(html, PRIVATE_CACHE_CONTROL)
    }
    const to = await resolveRedirect(admin, site.siteId, slug)
    if (to) {
      const url = request.nextUrl.clone()
      const prefix = parsed.locale ? `/${parsed.locale}` : ''
      url.pathname = `/render/${param}${prefix}/${encodeURIComponent(to)}`
      return NextResponse.redirect(url, 308)
    }
    if (isFragment) {
      return NextResponse.json({ error: tr(uiLocale, 'render.articleNotFound') }, { status: 404, headers: FRAGMENT_CORS })
    }
    return notFound(uiLocale, 'render.articleNotFound')
  }

  const postDefault = (resolution.post as { default_locale?: string }).default_locale
  const siteDefault = (theme as { default_locale?: string } | null)?.default_locale
  const locale = normalizeLocale(localeOverride ?? resolution.matchedLocale ?? postDefault ?? siteDefault)

  const modules = (theme?.modules ?? null) as SiteModules | null
  let siblings: unknown[] = []
  if (isModuleOn(modules, 'relatedPosts') || isModuleOn(modules, 'prevNext')) {
    const fetchSibs = (cols: string) => admin.from('posts')
      .select(cols).eq('site_id', site.siteId).eq('is_published', true)
      .order('created_at', { ascending: false }).limit(24)
    const res = await fetchSibs(`${LISTING_POST_COLS}, i18n, default_locale`)
    siblings = ((res.error?.code === '42703' ? (await fetchSibs(LISTING_POST_COLS)).data : res.data) ?? []) as unknown[]
  }

  const paywallOn = isModuleOn(modules, 'paywall')
  const unlocked = !paywallOn || !!request.cookies.get(`carma_unlock_${site.siteId}`)?.value
  const extra = { siblings: siblings as never, unlocked }

  if (isFragment) {
    const fragment = buildArticleFragment(themeForRender, site.siteId, resolution.post, locale, extra, link)
    return NextResponse.json(fragment, {
      status: 200,
      headers: { ...FRAGMENT_CORS, 'Cache-Control': BLOG_CACHE_CONTROL },
    })
  }

  const html = buildArticlePage(
    themeForRender, site.siteName, site.siteId, resolution.post, locale, extra, link,
  )
  const withBar = !isPreview && !sp.has('edit')
    ? html.replace('</body>', `${adminEditBarScript(site.siteId, appOrigin(appHost))}\n</body>`)
    : html
  return htmlResponse(
    withBar,
    // A paywalled article varies by the per-reader unlock cookie, so it must never
    // be shared-cached — the CDN would serve one reader's unlocked copy to
    // everyone, or a locked copy to a subscriber. Under PPR only THIS article pays
    // that price; the rest of the site stays cached.
    paywallOn || isPreview ? PRIVATE_CACHE_CONTROL : BLOG_CACHE_CONTROL,
  )
}

/** The locale-listing dynamic path (token overrides / preview), kept out of the
 *  hot path above so the common case stays easy to read. */
async function renderDynamicListing(
  request: NextRequest,
  param: string,
  locale: Locale | null,
  uiLocale: ReturnType<typeof normalizeLocale>,
) {
  const sp = request.nextUrl.searchParams
  const admin = createAdminClient()
  const site = await loadSite(admin, param)
  if (!site) return notFound(uiLocale, 'render.siteNotFound')

  const theme = await loadTheme(admin, site.siteId)
  const fetchPosts = (cols: string) => admin.from('posts')
    .select(cols).eq('site_id', site.siteId).eq('is_published', true)
    .order('created_at', { ascending: false }).limit(100)
  const res = await fetchPosts(`${LISTING_POST_COLS}, i18n, default_locale`)
  const posts = ((res.error?.code === '42703' ? (await fetchPosts(LISTING_POST_COLS)).data : res.data) ?? []) as unknown as Parameters<typeof buildListingPage>[3]

  const base: DesignTokens = { ...DEFAULT_TOKENS, ...((theme?.design_tokens as Partial<DesignTokens>) ?? {}) }
  const themeForRender = { ...(theme ?? {}), design_tokens: applyParamsToTokens(base, sp) }
  const link = linkCtxFor(param, site.siteId, themeForRender)
  const effective = normalizeLocale(locale ?? (theme as { default_locale?: string } | null)?.default_locale)

  const html = buildListingPage(themeForRender, site.siteName, site.siteId, posts, effective, link)
  return htmlResponse(html, sp.has('preview') ? PRIVATE_CACHE_CONTROL : BLOG_CACHE_CONTROL)
}
