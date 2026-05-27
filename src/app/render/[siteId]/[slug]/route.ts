import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildArticlePage, buildArticleFragment, buildErrorPage } from '@/lib/render/theme'
import { applyParamsToTokens } from '@/lib/render/embedParams'
import { FRAGMENT_CORS } from '@/lib/render/cors'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { normalizeLocale } from '@/lib/i18n/config'

// See the listing route: query-param overrides force dynamic rendering.
export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: FRAGMENT_CORS })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string; slug: string }> }) {
  const { siteId, slug } = await params
  const isFragment = request.nextUrl.searchParams.get('format') === 'fragment'
  const rawLang = request.nextUrl.searchParams.get('lang')
  const admin = createAdminClient()

  const { data: site } = await admin.from('sites').select('id, name').eq('id', siteId).single()
  if (!site) {
    if (isFragment) return NextResponse.json({ error: 'Site no trobat' }, { status: 404, headers: FRAGMENT_CORS })
    const err = buildErrorPage('Site no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const POST_COLS = 'id, title, slug, content, excerpt, featured_image, categories, tags, author_name, created_at, is_published, seo_title, seo_description, meta'
  const fetchPost = (cols: string) =>
    admin.from('posts')
      .select(cols)
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()

  const [{ data: theme }, postRes] = await Promise.all([
    admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle(),
    fetchPost(`${POST_COLS}, i18n, default_locale`),
  ])
  // Fall back if migration 008 (i18n columns) hasn't run yet. Cast because the
  // dynamic column string makes Supabase widen the row type.
  const post = (postRes.error?.code === '42703'
    ? (await fetchPost(POST_COLS)).data
    : postRes.data) as Parameters<typeof buildArticlePage>[3] | null

  if (!post) {
    if (isFragment) return NextResponse.json({ error: 'Article no trobat' }, { status: 404, headers: FRAGMENT_CORS })
    const err = buildErrorPage('Article no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // Effective locale: explicit ?lang wins; otherwise the article's own base
  // locale, then the site's default. Never blindly the platform default.
  const postDefault = (post as { default_locale?: string }).default_locale
  const siteDefault = (theme as { default_locale?: string } | null)?.default_locale
  const locale = normalizeLocale(rawLang || postDefault || siteDefault)

  const base: DesignTokens = { ...DEFAULT_TOKENS, ...((theme?.design_tokens as Partial<DesignTokens>) ?? {}) }
  const themeForRender = {
    ...(theme ?? {}),
    design_tokens: applyParamsToTokens(base, request.nextUrl.searchParams),
  }

  if (isFragment) {
    const fragment = buildArticleFragment(themeForRender, siteId, post, locale)
    return NextResponse.json(fragment, {
      status: 200,
      headers: { ...FRAGMENT_CORS, 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  }

  const html = buildArticlePage(themeForRender, site.name, siteId, post, locale)
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
