import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { userCanWriteSite } from '@/lib/auth/siteAccess'
import { parse } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetchText, safeFetchJson, detectLangFromUrl, decodeEntities, LANG_CODES } from '@/lib/scrape/http'
import { extractWithSelectors } from '@/lib/scrape/extract'
import { rehostImportedImages } from '@/lib/scrape/rehost'
import { DEFAULT_LOCALE, isLocale, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { detectLocale, htmlToPlain } from '@/lib/i18n/detect'

// node-html-parser needs the Node runtime; the merge step may fetch each page's
// HTML for hreflang alternates, so give the handler ample headroom.
export const runtime = 'nodejs'
export const maxDuration = 60

function slugFromUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] ?? ''
    const withoutExt = last.replace(/\.[^.]+$/, '')
    return withoutExt.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || `article-${Date.now()}`
  } catch { return `article-${Date.now()}` }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function stripGutenbergComments(html: string): string {
  return html
    .replace(/<!--\s*wp:[^\s>]*[^>]*?-->/g, '')
    .replace(/<!--\s*\/wp:[^\s>]*\s*-->/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractFromHtml(html: string): { title: string; description: string; image: string; content: string } {
  const root = parse(html)
  const getMeta = (prop: string) =>
    root.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ??
    root.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ?? ''

  const title = decodeEntities((
    getMeta('og:title') ||
    root.querySelector('h1')?.text?.trim() ||
    root.querySelector('title')?.text?.split(/[|–-]/)[0]?.trim() || ''
  ).replace(/\s+/g, ' ').trim())

  const description = decodeEntities((getMeta('og:description') || getMeta('description')).replace(/\s+/g, ' ').trim())
  const image = getMeta('og:image')

  root.querySelectorAll('script, style, nav, header, footer, aside, [class*="sidebar"], [class*="comment"], [id*="comment"], [class*="widget"], noscript').forEach(el => el.remove())

  const contentEl =
    root.querySelector('article') ??
    root.querySelector('main') ??
    root.querySelector('[class*="post-content"]') ??
    root.querySelector('[class*="entry-content"]') ??
    root.querySelector('[class*="article-body"]') ??
    root.querySelector('[class*="page-content"]') ??
    root.querySelector('body')

  return { title, description, image, content: contentEl?.innerHTML?.trim() ?? '' }
}

// A normalized key for a URL so language alternates can be matched to the URLs in
// the import batch regardless of trailing slash / host casing.
function urlKey(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`.toLowerCase().replace(/\/+$/, '')
  } catch { return url.toLowerCase().replace(/\/+$/, '') }
}

// Like urlKey, but with a leading locale path segment (/es, /ca, /en-US…) stripped,
// so the SAME article under different language prefixes collapses to one key. The
// last-resort translation signal when there's no Polylang/hreflang data.
function pathKey(url: string): string {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const first = segs[0]?.toLowerCase().split('-')[0]
    if (segs.length > 1 && first && LANG_CODES.includes(first)) segs.shift()
    return `${u.host}/${segs.join('/')}`.toLowerCase().replace(/\/+$/, '')
  } catch { return url.toLowerCase().replace(/\/+$/, '') }
}

// hreflang alternates — the generic, plugin-agnostic translation signal. Returns
// the normalized keys of OTHER-language renditions linked from this page (skips
// x-default and the page itself). Covers WPML / hand-rolled multilingual sites
// that don't expose Polylang's `translations`.
function extractHreflangAlternates(html: string, base: URL, selfKey: string): string[] {
  try {
    const root = parse(html)
    const keys = new Set<string>()
    for (const link of root.querySelectorAll('link[rel="alternate"]')) {
      const hl = (link.getAttribute('hreflang') ?? '').toLowerCase()
      const href = link.getAttribute('href')
      if (!href || !hl || hl === 'x-default') continue
      let abs: string
      try { abs = new URL(href, base).toString() } catch { continue }
      const key = urlKey(abs)
      if (key && key !== selfKey) keys.add(key)
    }
    return [...keys]
  } catch { return [] }
}

// One language rendition of an article (resolved from WP REST or HTML scraping).
type ArticleContent = {
  title: string
  slug: string
  content: string
  excerpt: string
  featuredImage: string
  categories: string[]
  tags: string[]
}

// ─── WordPress REST API import ────────────────────────────────────────────────

type WpCategory = { id: number; name: string }
type WpTag = { id: number; name: string }
type WpPost = {
  id: number
  title: { rendered: string }
  slug: string
  link: string
  content: { rendered: string }
  excerpt: { rendered: string }
  featured_media: number
  categories: number[]
  tags: number[]
  // Polylang (when the multilingual plugin exposes them on the REST response):
  //   lang         — this post's language slug ('ca' | 'es' | 'en' | …)
  //   translations — map of language slug → the sibling post id in that language
  lang?: string
  translations?: Record<string, number>
}
type WpMedia = { source_url: string }

// Fields we ask WordPress for. `lang`/`translations` are Polylang extras — absent
// on monolingual sites, which simply makes the merge a no-op.
const WP_FIELDS = 'id,title,slug,link,content,excerpt,featured_media,categories,tags,lang,translations'

async function wpMediaUrl(wpApiBase: string, mediaId: number): Promise<string> {
  if (!(mediaId > 0)) return ''
  const media = await safeFetchJson(`${wpApiBase}/media/${mediaId}?_fields=source_url`) as WpMedia | null
  return media?.source_url ?? ''
}

function wpToArticle(wp: WpPost, catMap: Record<number, string>, tagMap: Record<number, string>, featuredImage: string): ArticleContent {
  return {
    title: decodeEntities(stripTags(wp.title?.rendered ?? '').replace(/\s+/g, ' ').trim()),
    slug: wp.slug ?? '',
    content: stripGutenbergComments(wp.content?.rendered ?? ''),
    excerpt: decodeEntities(stripTags(wp.excerpt?.rendered ?? '').replace(/\s+/g, ' ').trim()),
    featuredImage,
    categories: (wp.categories ?? []).map(id => catMap[id]).filter(Boolean),
    tags: (wp.tags ?? []).map(id => tagMap[id]).filter(Boolean),
  }
}

async function fetchWpBySlug(wpApiBase: string, slug: string): Promise<WpPost | null> {
  const posts = await safeFetchJson(
    `${wpApiBase}/posts?slug=${encodeURIComponent(slug)}&status=publish&_fields=${WP_FIELDS}`,
  ) as WpPost[] | null
  return Array.isArray(posts) && posts.length > 0 ? posts[0] : null
}

// ─── Locale detection ─────────────────────────────────────────────────────────
// The article's OWN language, so it lands on the right editor tab (not an empty
// default-locale tab). URL prefix (/es/…, ?lang=es) wins; else franc over the
// text; else the site's default locale.
function pickLocale(url: string, declared: string | null | undefined, title: string, contentHtml: string, siteDefault: Locale): Locale {
  // 1) Language the CMS itself declared (Polylang `lang`: 'ca' | 'es_ES' | …).
  if (declared) {
    const base = declared.toLowerCase().split(/[-_]/)[0]
    if (isLocale(base)) return base
  }
  // 2) URL prefix / ?lang= (e.g. /es/…).
  const fromUrl = detectLangFromUrl(url)
  if (fromUrl && isLocale(fromUrl)) return fromUrl
  // 3) Detect from the text — Catalan-first token rule, then franc (shared
  //    src/lib/i18n/detect.ts, so imports get the same ca-bias as the editor).
  const det = detectLocale(`${title}\n${htmlToPlain(contentHtml)}`)
  if (det.locale) return det.locale
  // 4) Site default.
  return siteDefault
}

// The page's declared language — `<html lang="ca">` / `lang="es-ES"`. This is
// the standard, per-page-accurate signal non-WordPress sites use (the equivalent
// of WordPress's Polylang `lang`), and it was previously ignored for the generic
// scrape path, leaving franc to guess — the root of the non-WP detection misses.
function htmlLangAttr(html: string): string | null {
  const m = html.match(/<html[^>]*\blang\s*=\s*["']([a-z]{2})(?:[-_][a-z0-9]+)?["']/i)
  return m ? m[1].toLowerCase() : null
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  let body: { urls?: string[]; siteId?: string; overwrite?: boolean; wpApiBase?: string; selectors?: Record<string, string>; publish?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  // Imported articles are PUBLISHED by default (the import is meant to bring a
  // live blog over), unless the caller explicitly opts into drafts.
  const { urls = [], siteId, overwrite = false, wpApiBase, selectors, publish = true } = body
  if (!siteId) return NextResponse.json({ error: 'siteId és obligatori' }, { status: 400 })

  // This route WRITES posts into `siteId`, so the caller must be a superadmin OR a
  // member of that exact site — never just "any authenticated user" (an IDOR). The
  // read-only scrape routes (discover/crawl/preview) are open to any session.
  if (!(await userCanWriteSite(supabase, user.id, siteId))) {
    return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })
  }
  if (!Array.isArray(urls) || urls.length === 0) return NextResponse.json({ error: 'Cal enviar almenys una URL' }, { status: 400 })
  if (urls.length > 20) return NextResponse.json({ error: 'Màxim 20 URLs per petició' }, { status: 400 })

  const admin = createAdminClient()
  const { data: site } = await admin.from('sites').select('id').eq('id', siteId).single()
  if (!site) return NextResponse.json({ error: 'Site no trobat' }, { status: 404 })

  // Site default locale (so undetected articles fall back sanely). 42703-safe.
  let siteDefaultLocale: Locale = DEFAULT_LOCALE
  {
    const full = await admin.from('site_themes').select('default_locale').eq('site_id', siteId).maybeSingle()
    if (!full.error && full.data?.default_locale) siteDefaultLocale = normalizeLocale(full.data.default_locale)
  }

  let catMap: Record<number, string> = {}
  let tagMap: Record<number, string> = {}
  if (wpApiBase) {
    const [cats, tagsData] = await Promise.all([
      safeFetchJson(`${wpApiBase}/categories?per_page=100&_fields=id,name`) as Promise<WpCategory[] | null>,
      safeFetchJson(`${wpApiBase}/tags?per_page=100&_fields=id,name`) as Promise<WpTag[] | null>,
    ])
    if (Array.isArray(cats)) catMap = Object.fromEntries(cats.map(c => [c.id, decodeEntities(c.name)]))
    if (Array.isArray(tagsData)) tagMap = Object.fromEntries(tagsData.map(t => [t.id, decodeEntities(t.name)]))
  }

  const hasCustomSelectors = selectors && Object.keys(selectors).some(k => selectors[k]?.trim())

  // ── Phase 1: resolve each URL to its content + language (+ translation links)
  type Resolved = {
    url: string
    key: string         // normalized URL key (for hreflang matching)
    article: ArticleContent | null
    error?: string
    lang: Locale
    wpId: number | null
    groupIds: number[]  // Polylang translation post ids (incl. self), when exposed
    altKeys: string[]   // hreflang alternate keys (generic translation signal)
  }

  const resolved: Resolved[] = await Promise.all(urls.map(async (url): Promise<Resolved> => {
    const key = urlKey(url)
    if (!isValidHttpUrl(url) || !isSafeUrl(url)) {
      return { url, key, article: null, error: 'URL no vàlida o no permesa', lang: siteDefaultLocale, wpId: null, groupIds: [], altKeys: [] }
    }

    let article: ArticleContent | null = null
    let declaredLang: string | null = null
    let wpId: number | null = null
    let groupIds: number[] = []
    let html: string | null = null

    // WordPress REST first (best fidelity + Polylang translation links).
    if (wpApiBase) {
      try {
        const wp = await fetchWpBySlug(wpApiBase, slugFromUrl(url))
        if (wp) {
          const featuredImage = await wpMediaUrl(wpApiBase, wp.featured_media)
          article = wpToArticle(wp, catMap, tagMap, featuredImage)
          declaredLang = typeof wp.lang === 'string' ? wp.lang : null
          wpId = wp.id
          const t = wp.translations
          if (t && typeof t === 'object') {
            groupIds = Object.values(t).filter((v): v is number => typeof v === 'number')
          }
        }
      } catch { /* fall through to HTML scrape */ }
    }

    // Fallback: scrape the page HTML for content.
    if (!article || !article.title) {
      html = await safeFetchText(url)
      if (!html) return { url, key, article: null, error: 'No s\'ha pogut accedir a la pàgina', lang: siteDefaultLocale, wpId, groupIds: [], altKeys: [] }
      if (hasCustomSelectors) {
        const ex = extractWithSelectors(html, selectors!)
        article = { title: ex.title || slugFromUrl(url), slug: slugFromUrl(url), content: ex.content, excerpt: '', featuredImage: ex.image, categories: ex.categories ?? [], tags: [] }
      } else {
        const ex = extractFromHtml(html)
        article = { title: ex.title || slugFromUrl(url), slug: slugFromUrl(url), content: ex.content, excerpt: ex.description, featuredImage: ex.image, categories: [], tags: [] }
      }
      // Non-WordPress fallback: trust the page's declared <html lang> over franc,
      // which is unreliable on short text and confuses neighbouring languages.
      if (!declaredLang) {
        const htmlLang = htmlLangAttr(html)
        if (htmlLang) declaredLang = htmlLang
      }
    }

    // Translation links: prefer Polylang's explicit ids; otherwise fall back to
    // the page's hreflang alternates. Reuse already-fetched HTML; for a REST-only
    // hit fetch the page once just for its <link rel=alternate> tags.
    let altKeys: string[] = []
    if (groupIds.length === 0) {
      if (!html) html = await safeFetchText(url)
      if (html) altKeys = extractHreflangAlternates(html, new URL(url), key)
    }

    const lang = pickLocale(url, declaredLang, article.title, article.content, siteDefaultLocale)
    return { url, key, article, error: undefined, lang, wpId, groupIds, altKeys }
  }))

  // ── Phase 2: group URLs that are translations of one another (union-find).
  // Singletons (no translation data, or only one language in the batch) behave
  // exactly like before — this is purely additive for multilingual sites.
  const parent = resolved.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }; return i }
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb) }

  // (a) Polylang: union by shared translation post ids.
  const idToIndex = new Map<number, number>()
  resolved.forEach((r, i) => { if (r.wpId != null) idToIndex.set(r.wpId, i) })
  resolved.forEach((r, i) => {
    for (const sibId of r.groupIds) {
      const j = idToIndex.get(sibId)
      if (j != null && j !== i) union(i, j)
    }
  })

  // (b) Generic hreflang: union URLs whose alternates point at one another.
  const keyToIndex = new Map<string, number>()
  resolved.forEach((r, i) => { if (r.key) keyToIndex.set(r.key, i) })
  resolved.forEach((r, i) => {
    for (const k of r.altKeys) {
      const j = keyToIndex.get(k)
      if (j != null && j !== i) union(i, j)
    }
  })

  const groups = new Map<number, number[]>()
  resolved.forEach((_, i) => { const root = find(i); (groups.get(root) ?? groups.set(root, []).get(root)!).push(i) })

  // ── Phase 3: assemble + insert one post per group (base = primary locale,
  // other languages overlaid into i18n).
  type Result = { url: string; success: boolean; title?: string; slug?: string; error?: string; skipped?: boolean; merged?: number }
  const results: Result[] = []

  await Promise.all([...groups.values()].map(async (members) => {
    // Surface resolution errors for any failed member as its own failed result.
    const usable = members.filter(i => resolved[i].article && resolved[i].article!.title)
    for (const i of members) {
      if (!usable.includes(i)) results.push({ url: resolved[i].url, success: false, error: resolved[i].error ?? 'No s\'ha pogut extreure el contingut' })
    }
    if (usable.length === 0) return

    // One rendition per locale (first occurrence wins if duplicated).
    const byLocale = new Map<Locale, { idx: number; article: ArticleContent }>()
    for (const i of usable) {
      const r = resolved[i]
      if (!byLocale.has(r.lang)) byLocale.set(r.lang, { idx: i, article: r.article! })
    }

    const langs = [...byLocale.keys()]
    const primaryLocale = langs.includes(siteDefaultLocale) ? siteDefaultLocale : langs[0]
    const primary = byLocale.get(primaryLocale)!
    const primaryUrl = resolved[primary.idx].url

    // Re-host images for every locale's rendition (best-effort; keeps source URLs
    // on any failure) so the article never hot-links to the source site.
    const rehost = async (a: ArticleContent): Promise<ArticleContent> => {
      try {
        const r = await rehostImportedImages(siteId, a.content, a.featuredImage)
        return { ...a, content: r.contentHtml, featuredImage: r.featuredImage }
      } catch { return a }
    }

    const primaryArticle = await rehost(primary.article)
    const finalSlug = primaryArticle.slug || slugFromUrl(primaryUrl)

    // Build i18n overlays for the non-primary languages.
    const i18n: Record<string, { title: string; slug?: string; content: { html: string }; excerpt?: string }> = {}
    for (const loc of langs) {
      if (loc === primaryLocale) continue
      const entry = byLocale.get(loc)!
      const a = await rehost(entry.article)
      i18n[loc] = {
        title: a.title,
        slug: a.slug || undefined,
        content: { html: a.content },
        excerpt: a.excerpt || undefined,
      }
    }

    // ── Translation-group signature for DB-AWARE dedup. The import modal sends
    // ONE url per request, so in-batch grouping never sees the siblings — we must
    // find an already-imported sibling in the DB and merge into it. Signature
    // preference: Polylang translation ids → hreflang alternates. Siblings produce
    // the SAME signature, so separate (even incremental) imports converge.
    const pllIds = new Set<number>()
    for (const i of usable) for (const id of resolved[i].groupIds) pllIds.add(id)
    let langGroup: string
    let groupSize: number
    if (pllIds.size > 1) {
      langGroup = 'pll:' + [...pllIds].sort((a, b) => a - b).join('|')
      groupSize = pllIds.size
    } else {
      const keys = new Set<string>()
      for (const i of usable) { keys.add(resolved[i].key); for (const k of resolved[i].altKeys) keys.add(k) }
      langGroup = 'hl:' + [...keys].sort().join('|')
      groupSize = keys.size
    }
    const isMultilingual = groupSize > 1
    const pk = pathKey(primaryUrl)

    // Add our language(s) into an existing sibling post's i18n (instead of making a
    // duplicate). Returns true when handled (merged or already-present skip).
    const mergeInto = async (sib: { id: string; slug: string | null; default_locale: string | null; i18n: unknown }): Promise<boolean> => {
      const sibDefault = (sib.default_locale ?? siteDefaultLocale) as string
      const nextI18n = { ...((sib.i18n ?? {}) as Record<string, unknown>) }
      let added = 0
      for (const loc of langs) {
        if (loc === sibDefault) continue              // base columns already hold this language
        if (!overwrite && nextI18n[loc]) continue     // keep the existing translation
        const a = await rehost(byLocale.get(loc)!.article)
        nextI18n[loc] = { title: a.title, slug: a.slug || undefined, content: { html: a.content }, excerpt: a.excerpt || undefined }
        added++
      }
      if (added === 0) {
        results.push({ url: primaryUrl, success: false, skipped: true, title: primaryArticle.title, error: 'Ja importat (traducció ja present)' })
        return true
      }
      const { error: upErr } = await admin.from('posts').update({ i18n: nextI18n }).eq('id', sib.id).eq('site_id', siteId)
      if (upErr) return false // fall through to a normal insert
      results.push({ url: primaryUrl, success: true, title: primaryArticle.title, slug: (sib.slug ?? finalSlug) as string, merged: Math.max(groupSize, 2) })
      return true
    }

    // (1) Explicit signature match (Polylang ids / hreflang alternates).
    if (isMultilingual) {
      try {
        const { data: sib } = await admin
          .from('posts').select('id, slug, default_locale, i18n')
          .eq('site_id', siteId).eq('meta->>lang_group', langGroup).limit(1).maybeSingle()
        if (sib?.id && await mergeInto(sib as { id: string; slug: string | null; default_locale: string | null; i18n: unknown })) return
      } catch { /* fall through */ }
    }
    // (2) Last-resort: same locale-stripped path in a DIFFERENT language.
    try {
      const { data: sib } = await admin
        .from('posts').select('id, slug, default_locale, i18n')
        .eq('site_id', siteId).eq('meta->>path_key', pk).neq('default_locale', primaryLocale).limit(1).maybeSingle()
      if (sib?.id && await mergeInto(sib as { id: string; slug: string | null; default_locale: string | null; i18n: unknown })) return
    } catch { /* fall through */ }

    const mergedCount = byLocale.size > 1 ? byLocale.size : undefined

    const post = {
      site_id: siteId,
      title: primaryArticle.title,
      slug: finalSlug,
      content: { html: primaryArticle.content },
      excerpt: primaryArticle.excerpt || null,
      featured_image: primaryArticle.featuredImage || null,
      categories: primaryArticle.categories,
      tags: primaryArticle.tags,
      seo_title: null,
      seo_description: null,
      author_name: null,
      // lang_group + path_key let a sibling imported in a LATER request find + merge
      // into this post. Stored on every import (cheap; only multilingual ones match).
      meta: { source_url: primaryUrl, language: primaryLocale, path_key: pk, ...(isMultilingual ? { lang_group: langGroup } : {}) },
      is_published: publish,
      default_locale: primaryLocale,
      i18n,
    }

    if (!overwrite) {
      const { data: existing } = await admin
        .from('posts').select('id').eq('site_id', siteId).eq('slug', finalSlug).maybeSingle()
      if (existing) {
        results.push({ url: primaryUrl, success: false, slug: finalSlug, title: primaryArticle.title, skipped: true, error: 'Slug ja existent (omès)' })
        return
      }
    }

    const tryInsert = async (payload: object) => overwrite
      ? admin.from('posts').upsert(payload, { onConflict: 'site_id,slug' }).select('id, title, slug').single()
      : admin.from('posts').insert(payload).select('id, title, slug').single()

    let { data, error } = await tryInsert(post)

    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      // Schema predates the extra columns — retry with only the base fields.
      const basePost = { ...(post as Record<string, unknown>) }
      for (const k of ['excerpt', 'featured_image', 'categories', 'tags', 'seo_title', 'seo_description', 'author_name', 'default_locale', 'i18n']) {
        delete basePost[k]
      }
      const retry = await tryInsert(basePost)
      data = retry.data
      error = retry.error
    }

    if (error) {
      const msg = error.code === '23505' ? 'Slug duplicat' : (error.message ?? 'Error desconegut')
      results.push({ url: primaryUrl, success: false, title: primaryArticle.title, slug: finalSlug, error: msg })
    } else {
      results.push({ url: primaryUrl, success: true, title: data!.title, slug: data!.slug, merged: mergedCount })
    }
  }))

  return NextResponse.json({
    imported: results.filter(r => r.success).length,
    merged: results.filter(r => r.success && r.merged).length,
    skipped: results.filter(r => r.skipped).length,
    failed: results.filter(r => !r.success && !r.skipped).length,
    results,
  })
}
