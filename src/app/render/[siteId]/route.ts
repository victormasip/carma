import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildListingPage, buildListingFragment, buildErrorPage } from '@/lib/render/theme'
import { applyParamsToTokens } from '@/lib/render/embedParams'
import { FRAGMENT_CORS } from '@/lib/render/cors'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { normalizeLocale } from '@/lib/i18n/config'
import { isUuid } from '@/lib/sites/domain'

// Reading the query string opts this handler out of static prerender (live
// embeds carry token overrides per request). The CDN still caches per full URL
// via the Cache-Control header below, so identical embeds are served from edge.
export const dynamic = 'force-dynamic'

// Preflight for the cross-origin fragment fetch issued by the embed loader.
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: FRAGMENT_CORS })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId: param } = await params
  const isFragment = request.nextUrl.searchParams.get('format') === 'fragment'
  const rawLang = request.nextUrl.searchParams.get('lang')
  const admin = createAdminClient()

  // The param is either a site UUID (canonical /render/<uuid>) or a tenant
  // subdomain label (rewritten here from <sub>.<domain> by the middleware).
  const siteSel = admin.from('sites').select('id, name')
  const { data: site } = isUuid(param)
    ? await siteSel.eq('id', param).maybeSingle()
    : await siteSel.eq('subdomain', param).maybeSingle()
  if (!site) {
    if (isFragment) {
      return NextResponse.json({ error: 'Site no trobat' }, { status: 404, headers: FRAGMENT_CORS })
    }
    const err = buildErrorPage('Site no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  const siteId = site.id as string

  const POST_COLS = 'id, title, slug, content, excerpt, featured_image, categories, tags, author_name, created_at, is_published'
  const fetchPosts = (cols: string) =>
    admin.from('posts')
      .select(cols)
      .eq('site_id', siteId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(100)

  const [{ data: theme }, postsRes] = await Promise.all([
    admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle(),
    fetchPosts(`${POST_COLS}, i18n, default_locale`),
  ])
  // Fall back if migration 008 (i18n columns) hasn't run yet. Cast because the
  // dynamic column string makes Supabase widen the row type.
  const posts = (postsRes.error?.code === '42703'
    ? (await fetchPosts(POST_COLS)).data
    : postsRes.data) as Parameters<typeof buildListingPage>[3] | null

  // Effective locale: an explicit ?lang wins; otherwise fall back to the SITE's
  // configured default (not the platform default), so a non-Catalan site renders
  // in its own language with the right <html lang> and date formatting.
  const siteDefaultLocale = (theme as { default_locale?: string } | null)?.default_locale
  const locale = normalizeLocale(rawLang || siteDefaultLocale)

  // Apply any live-embed token overrides (saved theme is the baseline).
  const base: DesignTokens = { ...DEFAULT_TOKENS, ...((theme?.design_tokens as Partial<DesignTokens>) ?? {}) }
  const themeForRender = {
    ...(theme ?? {}),
    design_tokens: applyParamsToTokens(base, request.nextUrl.searchParams),
  }

  if (isFragment) {
    const fragment = buildListingFragment(themeForRender, site.name, siteId, posts ?? [], locale)
    return NextResponse.json(fragment, {
      status: 200,
      headers: { ...FRAGMENT_CORS, 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  }

  const html = buildListingPage(themeForRender, site.name, siteId, posts ?? [], locale)
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Browser always revalidates (so the owner sees a fresh capture/theme save
      // immediately — saveTheme calls revalidatePath); the CDN edge still caches
      // for visitors via s-maxage. Fixes "re-captured chrome doesn't show on the
      // live render but does in the preview" (the preview always cache-busts).
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
