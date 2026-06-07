import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildArticlePage, buildArticleFragment, buildErrorPage } from '@/lib/render/theme'
import { applyParamsToTokens } from '@/lib/render/embedParams'
import { FRAGMENT_CORS } from '@/lib/render/cors'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { LOCALES, normalizeLocale, isLocale, type Locale } from '@/lib/i18n/config'
import { isUuid } from '@/lib/sites/domain'

// Reading the query string opts this handler out of static prerender — embeds
// carry token/locale overrides per request.
export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: FRAGMENT_CORS })
}

const POST_COLS = 'id, title, slug, content, excerpt, featured_image, categories, tags, author_name, created_at, is_published, seo_title, seo_description, meta'

// Slug resolution model
// ─────────────────────
// Each language gets its OWN slug — the slug IS the URL for that locale.
//   /render/<siteId>/hola-mon     → Catalan (default-locale flat column)
//   /render/<siteId>/hello-world  → English (i18n.en.slug)
//   /render/<siteId>/hola-mundo   → Spanish (i18n.es.slug)
//
// Resolution order:
//   1. Match the slug against the flat `slug` column (default-locale URL).
//   2. If no match, scan i18n JSONB for any locale whose .slug equals it.
// Whichever matches first determines the EFFECTIVE locale (no ?lang= needed),
// so translated previews never 404.
//
// `?lang=` is still honoured: it OVERRIDES the auto-detected locale (lets the
// embed loader render any post in any locale by toggling the switcher), and
// it lets the route fall back across locales when migration 008 isn't yet run.
type ResolvedPost = Parameters<typeof buildArticlePage>[3]
type Resolution = { post: ResolvedPost; matchedLocale: Locale | null }

async function resolveBySlug(
  admin: ReturnType<typeof createAdminClient>,
  siteId: string,
  slug: string,
): Promise<Resolution | null> {
  // Try the flat slug first — fastest, indexed, the common case.
  const flat = await admin.from('posts')
    .select(`${POST_COLS}, i18n, default_locale`)
    .eq('site_id', siteId)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (flat.error?.code === '42703') {
    // Pre-migration-008: no i18n columns. Fall back to the bare slug lookup.
    const bare = await admin.from('posts')
      .select(POST_COLS)
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
    return bare.data ? { post: bare.data as ResolvedPost, matchedLocale: null } : null
  }

  if (flat.data) {
    const dl = (flat.data as { default_locale?: string }).default_locale
    return { post: flat.data as ResolvedPost, matchedLocale: normalizeLocale(dl) }
  }

  // No flat match: try every non-default locale's i18n[loc].slug. We OR them
  // into a single query so it's still one round-trip regardless of locale count.
  const orParts = LOCALES.map(l => `i18n->${l}->>slug.eq.${slug}`).join(',')
  const byLocale = await admin.from('posts')
    .select(`${POST_COLS}, i18n, default_locale`)
    .eq('site_id', siteId)
    .or(orParts)
    .eq('is_published', true)
    .limit(1)
    .maybeSingle()

  if (!byLocale.data) return null

  // Figure out WHICH locale's slug matched — that's the effective locale.
  const i18n = (byLocale.data as { i18n?: Record<string, { slug?: string }> | null }).i18n ?? {}
  let matched: Locale | null = null
  for (const loc of LOCALES) {
    if (i18n[loc]?.slug === slug) { matched = loc; break }
  }
  return { post: byLocale.data as ResolvedPost, matchedLocale: matched }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string; slug: string }> }) {
  const { siteId: param, slug } = await params
  const isFragment = request.nextUrl.searchParams.get('format') === 'fragment'
  const rawLang = request.nextUrl.searchParams.get('lang')
  const admin = createAdminClient()

  // Param is a site UUID (canonical) or a tenant subdomain (middleware rewrite).
  const siteSel = admin.from('sites').select('id, name')
  const { data: site } = isUuid(param)
    ? await siteSel.eq('id', param).maybeSingle()
    : await siteSel.eq('subdomain', param).maybeSingle()
  if (!site) {
    if (isFragment) return NextResponse.json({ error: 'Site no trobat' }, { status: 404, headers: FRAGMENT_CORS })
    const err = buildErrorPage('Site no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  const siteId = site.id as string

  const [{ data: theme }, resolution] = await Promise.all([
    admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle(),
    resolveBySlug(admin, siteId, slug),
  ])

  if (!resolution) {
    if (isFragment) return NextResponse.json({ error: 'Article no trobat' }, { status: 404, headers: FRAGMENT_CORS })
    const err = buildErrorPage('Article no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // Effective locale:
  //   1. ?lang= (explicit override — e.g. the embed switcher toggling languages)
  //   2. The locale whose slug actually matched (path-derived — the URL IS the
  //      truth: a Spanish slug renders Spanish).
  //   3. The article's own default locale.
  //   4. The site's configured default.
  const explicit = rawLang && isLocale(rawLang) ? (rawLang as Locale) : null
  const postDefault = (resolution.post as { default_locale?: string }).default_locale
  const siteDefault = (theme as { default_locale?: string } | null)?.default_locale
  const locale = normalizeLocale(explicit ?? resolution.matchedLocale ?? postDefault ?? siteDefault)

  const base: DesignTokens = { ...DEFAULT_TOKENS, ...((theme?.design_tokens as Partial<DesignTokens>) ?? {}) }
  const themeForRender = {
    ...(theme ?? {}),
    design_tokens: applyParamsToTokens(base, request.nextUrl.searchParams),
  }

  if (isFragment) {
    const fragment = buildArticleFragment(themeForRender, siteId, resolution.post, locale)
    return NextResponse.json(fragment, {
      status: 200,
      headers: { ...FRAGMENT_CORS, 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  }

  const html = buildArticlePage(themeForRender, site.name, siteId, resolution.post, locale)
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Browser revalidates so theme/chrome edits show immediately for the owner;
      // CDN edge still caches for visitors (see listing route for rationale).
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
