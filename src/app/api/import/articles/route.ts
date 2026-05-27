import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parse } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetchText, safeFetchJson, detectLangFromUrl } from '@/lib/scrape/http'
import { extractWithSelectors } from '@/lib/scrape/extract'

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

  const title = (
    getMeta('og:title') ||
    root.querySelector('h1')?.text?.trim() ||
    root.querySelector('title')?.text?.split(/[|–-]/)[0]?.trim() || ''
  ).replace(/\s+/g, ' ').trim()

  const description = (getMeta('og:description') || getMeta('description')).replace(/\s+/g, ' ').trim()
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
}
type WpMedia = { source_url: string }

async function importFromWordPress(
  url: string,
  wpApiBase: string,
  catMap: Record<number, string>,
  tagMap: Record<number, string>,
): Promise<{ title: string; slug: string; content: string; excerpt: string; featuredImage: string; categories: string[]; tags: string[] } | null> {
  const slug = slugFromUrl(url)
  const posts = await safeFetchJson(
    `${wpApiBase}/posts?slug=${slug}&status=publish&_fields=id,title,slug,link,content,excerpt,featured_media,categories,tags`
  ) as WpPost[] | null

  if (!Array.isArray(posts) || posts.length === 0) return null

  const wp = posts[0]
  const title = stripTags(wp.title?.rendered ?? '').replace(/\s+/g, ' ').trim()
  const content = stripGutenbergComments(wp.content?.rendered ?? '')
  const excerpt = stripTags(wp.excerpt?.rendered ?? '').replace(/\s+/g, ' ').trim()
  const categories = (wp.categories ?? []).map(id => catMap[id]).filter(Boolean)
  const tags = (wp.tags ?? []).map(id => tagMap[id]).filter(Boolean)

  let featuredImage = ''
  if (wp.featured_media > 0) {
    const media = await safeFetchJson(`${wpApiBase}/media/${wp.featured_media}?_fields=source_url`) as WpMedia | null
    featuredImage = media?.source_url ?? ''
  }

  return { title, slug: wp.slug ?? slug, content, excerpt, featuredImage, categories, tags }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })

  let body: { urls?: string[]; siteId?: string; overwrite?: boolean; wpApiBase?: string; selectors?: Record<string, string> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  const { urls = [], siteId, overwrite = false, wpApiBase, selectors } = body
  if (!siteId) return NextResponse.json({ error: 'siteId és obligatori' }, { status: 400 })
  if (!Array.isArray(urls) || urls.length === 0) return NextResponse.json({ error: 'Cal enviar almenys una URL' }, { status: 400 })
  if (urls.length > 20) return NextResponse.json({ error: 'Màxim 20 URLs per petició' }, { status: 400 })

  const admin = createAdminClient()
  const { data: site } = await admin.from('sites').select('id').eq('id', siteId).single()
  if (!site) return NextResponse.json({ error: 'Site no trobat' }, { status: 404 })

  let catMap: Record<number, string> = {}
  let tagMap: Record<number, string> = {}
  if (wpApiBase) {
    const [cats, tagsData] = await Promise.all([
      safeFetchJson(`${wpApiBase}/categories?per_page=100&_fields=id,name`) as Promise<WpCategory[] | null>,
      safeFetchJson(`${wpApiBase}/tags?per_page=100&_fields=id,name`) as Promise<WpTag[] | null>,
    ])
    if (Array.isArray(cats)) catMap = Object.fromEntries(cats.map(c => [c.id, c.name]))
    if (Array.isArray(tagsData)) tagMap = Object.fromEntries(tagsData.map(t => [t.id, t.name]))
  }

  const hasCustomSelectors = selectors && Object.keys(selectors).some(k => selectors[k]?.trim())

  type Result = { url: string; success: boolean; title?: string; slug?: string; error?: string; skipped?: boolean }
  const results: Result[] = []

  await Promise.all(
    urls.map(async (url) => {
      if (!isValidHttpUrl(url) || !isSafeUrl(url)) {
        results.push({ url, success: false, error: 'URL no vàlida o no permesa' })
        return
      }

      let title = ''
      let slug = slugFromUrl(url)
      let contentHtml = ''
      let excerpt = ''
      let featuredImage = ''
      let categories: string[] = []
      let tags: string[] = []

      // Try WordPress REST API first
      if (wpApiBase) {
        const wpData = await importFromWordPress(url, wpApiBase, catMap, tagMap)
        if (wpData) {
          title = wpData.title
          slug = wpData.slug
          contentHtml = wpData.content
          excerpt = wpData.excerpt
          featuredImage = wpData.featuredImage
          categories = wpData.categories
          tags = wpData.tags
        }
      }

      // Fallback to HTML scraping
      if (!title) {
        const html = await safeFetchText(url)
        if (!html) {
          results.push({ url, success: false, error: 'No s\'ha pogut accedir a la pàgina' })
          return
        }

        if (hasCustomSelectors) {
          const extracted = extractWithSelectors(html, selectors!)
          title = extracted.title || slug
          contentHtml = extracted.content
          featuredImage = extracted.image
          if (!categories.length) categories = extracted.categories
        } else {
          const extracted = extractFromHtml(html)
          title = extracted.title || slug
          contentHtml = extracted.content
          excerpt = extracted.description
          featuredImage = extracted.image
        }
      }

      const finalSlug = slug || slugFromUrl(url)
      const lang = detectLangFromUrl(url)

      const post = {
        site_id: siteId,
        title,
        slug: finalSlug,
        content: { html: contentHtml },
        excerpt: excerpt || null,
        featured_image: featuredImage || null,
        categories,
        tags,
        seo_title: null,
        seo_description: null,
        author_name: null,
        meta: { source_url: url, ...(lang ? { language: lang } : {}) },
        is_published: false,
      }

      if (!overwrite) {
        const { data: existing } = await admin
          .from('posts').select('id').eq('site_id', siteId).eq('slug', finalSlug).maybeSingle()
        if (existing) {
          results.push({ url, success: false, slug: finalSlug, title, skipped: true, error: 'Slug ja existent (omès)' })
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
        for (const k of ['excerpt', 'featured_image', 'categories', 'tags', 'seo_title', 'seo_description', 'author_name']) {
          delete basePost[k]
        }
        const retry = await tryInsert(basePost)
        data = retry.data
        error = retry.error
      }

      if (error) {
        const msg = error.code === '23505' ? 'Slug duplicat' : (error.message ?? 'Error desconegut')
        results.push({ url, success: false, title, slug: finalSlug, error: msg })
      } else {
        results.push({ url, success: true, title: data!.title, slug: data!.slug })
      }
    })
  )

  return NextResponse.json({
    imported: results.filter(r => r.success).length,
    skipped: results.filter(r => r.skipped).length,
    failed: results.filter(r => !r.success && !r.skipped).length,
    results,
  })
}
