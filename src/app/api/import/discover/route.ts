import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isValidHttpUrl, isSafeUrl, safeFetchText, safeFetchJson, detectLangFromUrl, decodeEntities } from '@/lib/scrape/http'

function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = []
  for (const m of xml.matchAll(/<loc[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi)) {
    const u = m[1].trim()
    if (!u.endsWith('.xml')) urls.push(u)
  }
  return urls
}

function parseSitemapIndex(xml: string): string[] {
  const urls: string[] = []
  for (const m of xml.matchAll(/<loc[^>]*>\s*(https?:\/\/[^\s<]+\.xml)\s*<\/loc>/gi)) {
    urls.push(m[1].trim())
  }
  return urls
}

function parseRssItems(xml: string): { url: string; title: string }[] {
  const items: { url: string; title: string }[] = []
  for (const m of xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1]
    const title =
      block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]?.trim() ??
      block.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
    const url =
      block.match(/<link[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/link>/i)?.[1]?.trim() ??
      block.match(/<guid[^>]*isPermaLink="true"[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/guid>/i)?.[1]?.trim() ?? ''
    if (url) items.push({ url, title: decodeEntities(title) })
  }
  return items
}

function extractFeedLink(html: string): string | null {
  const m = html.match(/<link[^>]*type="application\/(?:rss|atom)\+xml"[^>]*href="([^"]+)"/i)
    ?? html.match(/<link[^>]*href="([^"]+)"[^>]*type="application\/(?:rss|atom)\+xml"/i)
  return m?.[1] ?? null
}

function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const segments = path.split('/').filter(Boolean)
    return segments[segments.length - 1]?.replace(/[-_]/g, ' ') ?? url
  } catch { return url }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })

  let body: { url?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  const rawUrl = body.url?.trim() ?? ''
  if (!isValidHttpUrl(rawUrl)) return NextResponse.json({ error: 'URL no vàlida' }, { status: 400 })
  if (!isSafeUrl(rawUrl)) return NextResponse.json({ error: 'URL no permesa' }, { status: 400 })

  const base = new URL(rawUrl).origin
  const wpApiBase = `${base}/wp-json/wp/v2`

  type DiscoveredItem = { url: string; title: string; language: string | null }

  // 1. Detectar WordPress via REST API
  const wpCheck = await safeFetchJson(`${wpApiBase}/posts?per_page=1&status=publish&_fields=id`)
  if (Array.isArray(wpCheck)) {
    const articles: DiscoveredItem[] = []
    let page = 1
    while (articles.length < 200) {
      const posts = await safeFetchJson(
        `${wpApiBase}/posts?per_page=100&status=publish&page=${page}&_fields=id,title,link`
      ) as Array<{ id: number; title: { rendered: string }; link: string }> | null

      if (!Array.isArray(posts) || posts.length === 0) break

      for (const p of posts) {
        const title = p.title?.rendered?.replace(/<[^>]+>/g, '').trim() ?? titleFromUrl(p.link)
        articles.push({ url: p.link, title: decodeEntities(title), language: detectLangFromUrl(p.link) })
      }

      if (posts.length < 100) break
      page++
    }

    if (articles.length > 0) {
      return NextResponse.json({ method: 'wordpress', wpApiBase, articles: articles.slice(0, 200), count: articles.length })
    }
  }

  // 2. Intentar sitemap.xml
  const sitemapXml = await safeFetchText(`${base}/sitemap.xml`)
  if (sitemapXml) {
    const isSitemapIndex = sitemapXml.includes('<sitemapindex')
    if (isSitemapIndex) {
      const subSitemaps = parseSitemapIndex(sitemapXml).slice(0, 10)
      const allUrls: DiscoveredItem[] = []
      await Promise.all(
        subSitemaps.map(async (subUrl) => {
          const subXml = await safeFetchText(subUrl)
          if (subXml) parseSitemapUrls(subXml).forEach(u => allUrls.push({ url: u, title: titleFromUrl(u), language: detectLangFromUrl(u) }))
        })
      )
      if (allUrls.length > 0) {
        return NextResponse.json({ method: 'sitemap', articles: allUrls.slice(0, 200), count: allUrls.length })
      }
    } else {
      const urls = parseSitemapUrls(sitemapXml)
      if (urls.length > 0) {
        return NextResponse.json({
          method: 'sitemap',
          articles: urls.map(u => ({ url: u, title: titleFromUrl(u), language: detectLangFromUrl(u) })).slice(0, 200),
          count: urls.length,
        })
      }
    }
  }

  // 3. Intentar feeds RSS/Atom
  const feedCandidates = [`${base}/feed`, `${base}/rss.xml`, `${base}/feed.xml`, `${base}/atom.xml`, `${base}/rss`]
  const homepage = await safeFetchText(rawUrl)
  if (homepage) {
    const linked = extractFeedLink(homepage)
    if (linked) feedCandidates.unshift(linked.startsWith('http') ? linked : `${base}${linked}`)
  }

  for (const feedUrl of feedCandidates) {
    const feedXml = await safeFetchText(feedUrl)
    if (!feedXml) continue
    if (!feedXml.includes('<item') && !feedXml.includes('<entry')) continue
    const items = parseRssItems(feedXml)
    if (items.length > 0) {
      return NextResponse.json({
        method: 'rss',
        articles: items.slice(0, 200).map(item => ({ ...item, language: detectLangFromUrl(item.url) })),
        count: items.length,
      })
    }
  }

  return NextResponse.json(
    { error: 'No s\'ha pogut detectar cap WordPress, sitemap ni feed RSS. Comprova que el site és accessible.' },
    { status: 404 },
  )
}
