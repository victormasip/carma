import { NextResponse, type NextRequest } from 'next/server'
import { parse } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetch, decodeEntities } from '@/lib/scrape/http'
import { findBlogIndexUrl, detectCardPattern } from '@/lib/scrape/blogDetect'

// node-html-parser needs the Node runtime.
export const runtime = 'nodejs'
export const maxDuration = 20

/**
 * PUBLIC, unauthenticated "magic link" preview for the landing funnel.
 *
 * Given a URL it does ONE lightweight fetch and reports whether the site looks
 * like it has a blog, plus a cheap palette/font/title flourish for the progress
 * UI. It deliberately does NOT crawl stylesheets or persist anything — the real,
 * faithful clone runs after the user registers, through /api/theme/analyze.
 *
 * Threat model note: same single-GET + SSRF-literal-guard surface as the import
 * routes, but reachable anonymously, so it is intentionally cheap and capped.
 */
type DetectResult = {
  ok: boolean
  url: string
  displayUrl: string
  title: string | null
  isBlog: boolean
  blogUrl: string | null
  framework: string | null
  palette: string[]
  fonts: string[]
  error?: string
}

const FRAMEWORK_FONT_RE = /font-family\s*:\s*([^;}"']+)/gi
const HEX_RE = /#[0-9a-f]{6}\b/gi

function normalize(raw: string): string {
  const v = (raw || '').trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

// Pull a handful of distinct, non-neutral hex colours from inline styles + the
// theme-color meta as a believable "detected palette".
function quickPalette(html: string, themeColor: string | null): string[] {
  const found = (html.match(HEX_RE) ?? []).map(c => c.toLowerCase())
  const counts = new Map<string, number>()
  for (const c of found) counts.set(c, (counts.get(c) ?? 0) + 1)
  const ranked = [...counts.entries()]
    .filter(([c]) => !/^#(fff|000)?(fff|000)?$/.test(c) && c !== '#ffffff' && c !== '#000000')
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
  const palette = uniq([...(themeColor ? [themeColor.toLowerCase()] : []), ...ranked]).slice(0, 6)
  // Pad with brand-neutral anchors so the swatch row always reads as complete.
  while (palette.length < 6) palette.push(['#1a2138', '#f5bc00', '#f0e6c8', '#fafaf6', '#525252', '#e5e5e5'][palette.length])
  return palette.slice(0, 6)
}

// Real font names: Google Fonts <link> families + inline font-family stacks.
function quickFonts(root: ReturnType<typeof parse>, html: string): string[] {
  const fonts: string[] = []
  for (const link of root.querySelectorAll('link[rel="stylesheet"], link[href]')) {
    const href = link.getAttribute('href') ?? ''
    if (/fonts\.(googleapis|bunny)\.com/i.test(href)) {
      for (const m of href.matchAll(/family=([^&:]+)/gi)) {
        fonts.push(decodeURIComponent(m[1].replace(/\+/g, ' ')).split(':')[0].trim())
      }
    }
  }
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = FRAMEWORK_FONT_RE.exec(html)) !== null && guard++ < 200) {
    const first = m[1].split(',')[0].replace(/["']/g, '').trim()
    if (first && !/^(inherit|initial|var|unset|sans-serif|serif|monospace|system-ui)$/i.test(first) && first.length < 32) {
      fonts.push(first)
    }
  }
  return uniq(fonts).slice(0, 3)
}

export async function POST(request: NextRequest) {
  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Cos invàlid' } satisfies Partial<DetectResult>, { status: 400 })
  }

  const url = normalize(body.url ?? '')
  const displayUrl = url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

  if (!url || !isValidHttpUrl(url) || !isSafeUrl(url)) {
    return NextResponse.json(
      { ok: false, url, displayUrl, error: 'Aquesta adreça no és vàlida' } satisfies Partial<DetectResult>,
      { status: 400 },
    )
  }

  const res = await safeFetch(url, { accept: 'text/html,*/*', timeout: 12_000 })
  if (!res) {
    return NextResponse.json(
      {
        ok: false, url, displayUrl, error: 'No hem pogut accedir a aquesta web. Comprova l’adreça.',
      } satisfies Partial<DetectResult>,
      { status: 502 },
    )
  }

  const html = res.body.slice(0, 1_200_000)
  const root = parse(html, { blockTextElements: { script: false, style: true } })
  const base = new URL(url)

  const rawTitle = root.querySelector('title')?.text
    ?? root.querySelector('meta[property="og:title"]')?.getAttribute('content')
    ?? null
  const title = rawTitle ? decodeEntities(rawTitle.replace(/\s+/g, ' ').trim()).slice(0, 80) : null

  const blogUrl = findBlogIndexUrl(root, base)
  const hasCards = !!detectCardPattern(root)
  const isBlog = !!blogUrl || hasCards

  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? ''
  let framework: string | null = null
  if (/wordpress|wp-content/i.test(generator + html)) framework = 'WordPress'
  else if (/__NEXT_DATA__|\/_next\//.test(html)) framework = 'Next.js'
  else if (/data-wf-|webflow/i.test(html)) framework = 'Webflow'
  else if (/squarespace/i.test(html)) framework = 'Squarespace'
  else if (/wixstatic|_wix/i.test(html)) framework = 'Wix'
  else if (/cdn\.shopify/i.test(html)) framework = 'Shopify'

  const themeColor = root.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null

  const result: DetectResult = {
    ok: true,
    url,
    displayUrl,
    title,
    isBlog,
    blogUrl,
    framework,
    palette: quickPalette(html, themeColor),
    fonts: quickFonts(root, html),
  }

  return NextResponse.json(result)
}
