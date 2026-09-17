import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildListingPage, buildListingFragment, buildErrorPage } from '@/lib/render/theme'
import { adminEditBarScript } from '@/lib/render/adminBar'
import { buildSamplePosts } from '@/lib/render/samplePosts'
import { applyParamsToTokens } from '@/lib/render/embedParams'
import { FRAGMENT_CORS } from '@/lib/render/cors'
import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { normalizeLocale, isLocale, type Locale } from '@/lib/i18n/config'
import { tr } from '@/lib/i18n/messages'
import { appOrigin } from '@/lib/sites/domain'
import {
  BLOG_CACHE_CONTROL, PRIVATE_CACHE_CONTROL, isPlainPublicRequest, linkCtxFor,
} from '@/lib/render/cache'
import { loadSite, loadTheme, loadListingPosts, renderListingCached } from '@/lib/render/blogRender'

// NOTE (Super MVP Fase 4): `dynamic = 'force-dynamic'` is GONE.
//
// It was the single most expensive line in the product. It disabled static
// generation, PPR, streaming and Link prefetching for the entire public blog, and
// it silently turned every `revalidatePath('/render/…')` call site in the codebase
// into a no-op — we paid a 60-second staleness window AND maintained invalidation
// that could never fire (lib/actions/posts.ts even said so in a comment).
//
// The plain public render now goes through `renderListingCached`, tagged
// `site:<id>`, so publishing invalidates it precisely. Everything that genuinely
// varies per request — the embed fragment, the dashboard preview, live Theme
// Studio token overrides — still takes the dynamic path below, exactly as before.

// Preflight for the cross-origin fragment fetch issued by the embed loader.
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: FRAGMENT_CORS })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId: param } = await params
  const sp = request.nextUrl.searchParams
  const rawLang = sp.get('lang')
  // UI-chrome locale for status strings (404s). Independent of the content
  // locale: ?ui wins (the host's own language, e.g. WordPress get_locale()),
  // then ?lang, else Catalan. Resolved up front so the not-found branch — which
  // runs before we know the site's configured locale — is already localised.
  const uiLocale = normalizeLocale(sp.get('ui') ?? rawLang)
  const explicit: Locale | null = rawLang && isLocale(rawLang) ? (rawLang as Locale) : null

  const notFound = () => {
    const err = buildErrorPage(tr(uiLocale, 'render.siteNotFound'), 404, uiLocale)
    return new Response(err.html, {
      status: err.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': PRIVATE_CACHE_CONTROL },
    })
  }

  // ── FAST PATH ──────────────────────────────────────────────────────────────
  // An ordinary public visit. Served from cache; on a miss it builds once and
  // every visitor until the next publish gets it for free.
  if (isPlainPublicRequest(sp)) {
    const cached = await renderListingCached(param, explicit, request.headers.get('host') ?? '')
    if (!cached) return notFound()
    return new Response(cached.html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': BLOG_CACHE_CONTROL },
    })
  }

  // ── DYNAMIC PATH ───────────────────────────────────────────────────────────
  const isFragment = sp.get('format') === 'fragment'
  const admin = createAdminClient()
  const site = await loadSite(admin, param)
  if (!site) {
    if (isFragment) {
      return NextResponse.json(
        { error: tr(uiLocale, 'render.siteNotFound') },
        { status: 404, headers: FRAGMENT_CORS },
      )
    }
    return notFound()
  }

  const [theme, posts] = await Promise.all([
    loadTheme(admin, site.siteId),
    loadListingPosts(admin, site.siteId),
  ])

  // Effective locale: an explicit ?lang wins; otherwise the SITE's configured
  // default (not the platform default), so a non-Catalan site renders in its own
  // language with the right <html lang> and date formatting.
  const siteDefaultLocale = (theme as { default_locale?: string } | null)?.default_locale
  const locale = normalizeLocale(explicit ?? siteDefaultLocale)

  // Apply any live-embed token overrides (the saved theme is the baseline).
  const base: DesignTokens = { ...DEFAULT_TOKENS, ...((theme?.design_tokens as Partial<DesignTokens>) ?? {}) }
  const themeForRender = { ...(theme ?? {}), design_tokens: applyParamsToTokens(base, sp) }
  const link = linkCtxFor(param, site.siteId, themeForRender)

  // Preview-only (`?preview`): when a fresh site has no published posts yet,
  // inject demo articles so the onboarding / theme-selection grid shows a full,
  // beautiful feed instead of an empty "no articles" state. NEVER injected on the
  // public render, so visitors never see placeholder content.
  const isPreview = sp.has('preview')
  const renderPosts =
    isPreview && posts.length === 0
      ? (buildSamplePosts(locale, site.siteName) as unknown as typeof posts)
      : posts

  if (isFragment) {
    const fragment = buildListingFragment(
      themeForRender, site.siteName, site.siteId, renderPosts, locale, link,
    )
    return NextResponse.json(fragment, {
      status: 200,
      headers: { ...FRAGMENT_CORS, 'Cache-Control': BLOG_CACHE_CONTROL },
    })
  }

  const html = buildListingPage(
    themeForRender, site.siteName, site.siteId, renderPosts, locale, link,
  )
  // Owner-only "Edit this site" button — injected as a self-checking script (keeps
  // the HTML cacheable). Never inside the Studio's own iframe (edit/preview).
  const withBar = !isPreview && !sp.has('edit')
    ? html.replace('</body>', `${adminEditBarScript(site.siteId, appOrigin(request.headers.get('host')))}\n</body>`)
    : html
  return new Response(withBar, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A preview carries unsaved/override state — never shared-cached.
      'Cache-Control': isPreview ? PRIVATE_CACHE_CONTROL : BLOG_CACHE_CONTROL,
    },
  })
}
