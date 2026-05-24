import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parse, type HTMLElement } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetch } from '@/lib/scrape/http'

// ─── Framework + hosting detection ────────────────────────────────────────────

type Framework =
  | 'wordpress' | 'nextjs' | 'astro' | 'gatsby' | 'hugo' | 'jekyll'
  | 'webflow' | 'squarespace' | 'wix' | 'shopify' | 'vue' | 'react' | 'html'

type Hosting = 'vercel' | 'netlify' | 'cloudflare' | 'aws' | 'github' | 'wpengine' | null

type Detection = {
  framework: Framework
  version?: string
  hosting: Hosting
  confidence: 'high' | 'medium' | 'low'
}

function detectFramework(html: string, headers: Headers): Detection {
  // ── Hosting (HTTP headers) ──
  let hosting: Hosting = null
  const server = headers.get('server')?.toLowerCase() ?? ''
  const poweredBy = headers.get('x-powered-by')?.toLowerCase() ?? ''

  if (headers.has('x-vercel-cache') || headers.has('x-vercel-id') || server.includes('vercel')) hosting = 'vercel'
  else if (headers.has('x-nf-request-id') || server.includes('netlify')) hosting = 'netlify'
  else if (headers.has('cf-ray') || server.includes('cloudflare')) hosting = 'cloudflare'
  else if (headers.has('x-amz-cf-id') || server.includes('amazon')) hosting = 'aws'
  else if (server.includes('github.com') || poweredBy.includes('github')) hosting = 'github'
  else if (server.includes('wpengine') || headers.has('x-wpe-loopback-upstream-addr')) hosting = 'wpengine'

  // ── Generator meta ──
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? ''
  const gen = generator.toLowerCase()

  // ── Framework (ordered by specificity) ──
  if (gen.includes('wordpress') || /\/wp-content\//.test(html) || /\/wp-includes\//.test(html)) {
    const v = generator.match(/wordpress\s+([\d.]+)/i)?.[1]
    return { framework: 'wordpress', version: v, hosting, confidence: 'high' }
  }

  if (html.includes('__NEXT_DATA__') || html.includes('id="__next"') || /\/_next\//.test(html)) {
    return { framework: 'nextjs', hosting, confidence: 'high' }
  }

  if (gen.includes('astro') || /astro-[a-z0-9]/i.test(html)) {
    const v = generator.match(/astro\s+v?([\d.]+)/i)?.[1]
    return { framework: 'astro', version: v, hosting, confidence: 'high' }
  }

  if (gen.includes('gatsby') || html.includes('___gatsby') || html.includes('gatsby-')) {
    return { framework: 'gatsby', hosting, confidence: 'high' }
  }

  if (/^hugo\b/i.test(generator) || /\bhugo\s+[\d.]+/i.test(generator)) {
    return { framework: 'hugo', hosting, confidence: 'high' }
  }

  if (gen.includes('jekyll')) {
    return { framework: 'jekyll', hosting, confidence: 'high' }
  }

  if (html.includes('webflow.js') || /data-wf-/.test(html) || html.includes('webflow.com')) {
    return { framework: 'webflow', hosting, confidence: 'high' }
  }

  if (html.includes('Static.SQUARESPACE_CONTEXT') || html.includes('squarespace.com/universal')) {
    return { framework: 'squarespace', hosting, confidence: 'high' }
  }

  if (html.includes('_wix') || html.includes('wixstatic.com') || html.includes('parastorage.com')) {
    return { framework: 'wix', hosting, confidence: 'high' }
  }

  if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme') || html.includes('shopify-section')) {
    return { framework: 'shopify', hosting, confidence: 'high' }
  }

  // Vue (after the obvious frameworks)
  if (/data-v-[a-f0-9]+/i.test(html) || html.includes('__vue_app__') || html.includes('v-cloak')) {
    return { framework: 'vue', hosting, confidence: 'medium' }
  }

  // Generic React (id="root" + react references)
  if (html.includes('id="root"') && /\b(react|ReactDOM)\b/.test(html)) {
    return { framework: 'react', hosting, confidence: 'medium' }
  }

  // Default
  return { framework: 'html', hosting, confidence: 'low' }
}

// ─── HTML processing helpers ──────────────────────────────────────────────────

function absolutise(url: string | undefined, base: URL): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (!trimmed) return undefined
  if (/^(https?:|data:|mailto:|tel:|#)/i.test(trimmed)) return trimmed
  try { return new URL(trimmed, base).toString() } catch { return trimmed }
}

// Rewrite url(...) references inside CSS source so relative paths resolve
// against the original site (logos, fonts, background images).
function absolutiseCssUrls(css: string, base: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_match, quote, url) => {
    const u = url.trim()
    if (/^(https?:|data:|#)/i.test(u)) return `url(${quote}${u}${quote})`
    try {
      return `url(${quote}${new URL(u, base).toString()}${quote})`
    } catch {
      return `url(${quote}${u}${quote})`
    }
  })
}

function rewriteUrlAttrs(el: HTMLElement, base: URL) {
  for (const node of el.querySelectorAll('a[href]')) {
    const v = absolutise(node.getAttribute('href'), base)
    if (v) node.setAttribute('href', v)
  }
  for (const node of el.querySelectorAll('img[src],script[src],source[src],iframe[src],video[src],audio[src]')) {
    const v = absolutise(node.getAttribute('src'), base)
    if (v) node.setAttribute('src', v)
  }
  for (const node of el.querySelectorAll('img[srcset],source[srcset]')) {
    const srcset = node.getAttribute('srcset')
    if (!srcset) continue
    const rewritten = srcset.split(',').map(part => {
      const [u, ...rest] = part.trim().split(/\s+/)
      return [absolutise(u, base) ?? u, ...rest].join(' ')
    }).join(', ')
    node.setAttribute('srcset', rewritten)
  }
  for (const node of el.querySelectorAll('link[href]')) {
    const v = absolutise(node.getAttribute('href'), base)
    if (v) node.setAttribute('href', v)
  }
  for (const node of el.querySelectorAll('[poster]')) {
    const v = absolutise(node.getAttribute('poster'), base)
    if (v) node.setAttribute('poster', v)
  }
  // Inline style="background-image: url(...)" etc.
  for (const node of el.querySelectorAll('[style]')) {
    const s = node.getAttribute('style')
    if (s && /url\(/i.test(s)) node.setAttribute('style', absolutiseCssUrls(s, base))
  }
  // Inline <style> blocks
  for (const node of el.querySelectorAll('style')) {
    const txt = node.text ?? ''
    if (txt && /url\(/i.test(txt)) {
      node.set_content(absolutiseCssUrls(txt, base))
    }
  }
}

function extractHead(root: HTMLElement, base: URL): {
  headHtml: string
  externalStyles: string[]
  fontLinks: string[]
} {
  const head = root.querySelector('head')
  const externalStyles: string[] = []
  const fontLinks: string[] = []
  if (!head) return { headHtml: '', externalStyles, fontLinks }

  const keepNodes: string[] = []

  for (const m of head.querySelectorAll('meta')) {
    const charset = m.getAttribute('charset')
    const name = m.getAttribute('name')?.toLowerCase()
    const httpEquiv = m.getAttribute('http-equiv')?.toLowerCase()
    if (charset || ['viewport', 'color-scheme', 'theme-color', 'format-detection'].includes(name ?? '') ||
        ['content-type', 'x-ua-compatible'].includes(httpEquiv ?? '')) {
      keepNodes.push(m.toString())
    }
  }

  for (const link of head.querySelectorAll('link')) {
    const rel = link.getAttribute('rel')?.toLowerCase() ?? ''
    const href = absolutise(link.getAttribute('href'), base)
    if (!href) continue

    if (rel.includes('stylesheet')) {
      externalStyles.push(href)
      link.setAttribute('href', href)
      keepNodes.push(link.toString())
    } else if (rel.includes('preconnect') || rel.includes('dns-prefetch') || rel.includes('preload') || rel.includes('icon')) {
      link.setAttribute('href', href)
      keepNodes.push(link.toString())
    }

    if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|typography\.com|cloud\.typography|fonts\.adobe|fonts\.bunny/i.test(href)) {
      fontLinks.push(href)
    }
  }

  // Inline <style> blocks — preserve fully + absolutise url(...) inside
  for (const style of head.querySelectorAll('style')) {
    const css = style.text ?? ''
    const abs = /url\(/i.test(css) ? absolutiseCssUrls(css, base) : css
    const mediaAttr = style.getAttribute('media')
    keepNodes.push(`<style${mediaAttr ? ` media="${mediaAttr}"` : ''}>${abs}</style>`)
  }

  return { headHtml: keepNodes.join('\n'), externalStyles, fontLinks }
}

// Capture all <script> tags from head and body so JS the client needs
// (jQuery, vendor libs, menu code) keeps working in the render.
function extractScripts(root: HTMLElement, base: URL): {
  scriptsHtml: string
  externalScripts: string[]
} {
  const externalScripts: string[] = []
  const keepNodes: string[] = []

  for (const script of root.querySelectorAll('script')) {
    const src = script.getAttribute('src')
    const type = script.getAttribute('type')

    // Skip module preload or noModule fallbacks that depend on bundler context
    // we wouldn't reproduce. JSON-LD (type="application/ld+json") IS kept.

    if (src) {
      const absUrl = absolutise(src, base)
      if (!absUrl) continue
      externalScripts.push(absUrl)
      // Preserve attributes (defer, async, type, crossorigin, integrity-removed*)
      const attrs: string[] = [`src="${absUrl.replace(/"/g, '&quot;')}"`]
      for (const k of ['type', 'defer', 'async', 'crossorigin', 'referrerpolicy', 'nonce']) {
        const v = script.getAttribute(k)
        if (v !== undefined && v !== null) {
          // Boolean attributes (defer, async) — render as bare attribute
          if (v === '' || v === k) attrs.push(k)
          else attrs.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
        }
      }
      // integrity hash is invalid once we've changed src origin; drop it
      keepNodes.push(`<script ${attrs.join(' ')}></script>`)
    } else {
      // Inline script (including JSON-LD)
      const content = script.text ?? ''
      if (!content.trim()) continue
      const typeAttr = type ? ` type="${type}"` : ''
      keepNodes.push(`<script${typeAttr}>${content}</script>`)
    }
  }

  return { scriptsHtml: keepNodes.join('\n'), externalScripts }
}

function extractRegion(root: HTMLElement, base: URL, selectors: string[]): string {
  for (const sel of selectors) {
    const el = root.querySelector(sel)
    if (el && el.innerHTML.trim().length > 0) {
      rewriteUrlAttrs(el, base)
      return el.toString()
    }
  }
  return ''
}

// ─── Smart card detection ─────────────────────────────────────────────────────
// Find groups of repeated sibling elements that look like article cards.
// Scoring rewards: many siblings · contain links/headings/images · semantic class names.

function getElementChildren(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const node of el.childNodes) {
    if ((node as HTMLElement).tagName) out.push(node as HTMLElement)
  }
  return out
}

function signature(el: HTMLElement): string {
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)[0] ?? ''
  return `${el.tagName.toLowerCase()}.${cls}`
}

const NOISE_RE = /sidebar|comment|footer|nav|menu|share|social|related|widget|cookie|ad-|ads-|banner|popup|modal|skip-link|breadcrumb/i

function detectCardPattern(root: HTMLElement): { grid: HTMLElement; card: HTMLElement; count: number } | null {
  type Candidate = { grid: HTMLElement; cards: HTMLElement[]; score: number }
  const candidates: Candidate[] = []

  const containers = root.querySelectorAll('div, section, main, ul, ol, article')

  for (const el of containers) {
    if (el.closest('nav, header, footer, aside')) continue
    const cls = (el.getAttribute('class') ?? '').toLowerCase()
    if (NOISE_RE.test(cls)) continue

    const children = getElementChildren(el)
    if (children.length < 3) continue

    // Find dominant child signature
    const counts = new Map<string, number>()
    for (const c of children) {
      const s = signature(c)
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    let topSig = '', topCount = 0
    for (const [s, n] of counts) {
      if (n > topCount) { topSig = s; topCount = n }
    }
    if (topCount < 3) continue

    const cards = children.filter(c => signature(c) === topSig)

    // Score
    let linkCount = 0, imgCount = 0, headingCount = 0
    let totalText = 0
    for (const card of cards) {
      if (card.querySelector('a[href]')) linkCount++
      if (card.querySelector('img'))     imgCount++
      if (card.querySelector('h1, h2, h3, h4')) headingCount++
      totalText += (card.text ?? '').length
    }

    // Must mostly have links (clickable cards)
    if (linkCount < cards.length * 0.5) continue

    // Average text length: cards usually have 20-2000 chars
    const avgText = totalText / cards.length
    if (avgText < 15) continue   // probably icons/buttons, not cards
    if (avgText > 5000) continue // probably entire articles, not cards

    let score = topCount  // base: more cards = better
    score += (linkCount    / cards.length) * 5
    score += (imgCount     / cards.length) * 3
    score += (headingCount / cards.length) * 4

    const cardClass = (cards[0].getAttribute('class') ?? '').toLowerCase()
    const gridClass = cls
    if (/card|post|article|item|entry|news|story|teaser/i.test(cardClass)) score += 12
    if (/grid|list|posts|news|articles|cards|stories/i.test(gridClass))   score += 6
    if (cards[0].tagName === 'ARTICLE') score += 5

    candidates.push({ grid: el, cards, score })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  return { grid: best.grid, card: best.cards[0], count: best.cards.length }
}

// ─── Smart article content detection ──────────────────────────────────────────
// Simplified Readability: find the element with highest "content density".

function detectArticleContent(root: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestScore = -Infinity

  const candidates = root.querySelectorAll('article, div, section, main')

  for (const el of candidates) {
    if (el.closest('nav, header, footer, aside')) continue
    const cls = (el.getAttribute('class') ?? '').toLowerCase()
    const id  = (el.getAttribute('id') ?? '').toLowerCase()
    if (NOISE_RE.test(cls + ' ' + id)) continue

    const paragraphs = el.querySelectorAll('p').length
    const headings   = el.querySelectorAll('h2, h3, h4').length
    const text       = el.text ?? ''
    const textLen    = text.length
    if (textLen < 200) continue  // too short to be article content

    // Link density: low for content, high for nav
    let linkText = 0
    for (const a of el.querySelectorAll('a')) linkText += (a.text?.length ?? 0)
    const linkDensity = linkText / textLen
    if (linkDensity > 0.5) continue  // probably nav/menu

    let score = paragraphs * 10 + headings * 4 + Math.sqrt(textLen)
    score *= (1 - linkDensity * 0.8)

    if (/article|post|entry|content|body|text|story|main/i.test(cls + ' ' + id)) score += 50
    if (el.tagName === 'ARTICLE') score += 25
    if (el.tagName === 'MAIN')    score += 12

    if (score > bestScore) { bestScore = score; best = el }
  }

  return best
}

// ─── Class name picker ────────────────────────────────────────────────────────

function bestClass(el: HTMLElement): string {
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
  if (cls.length === 0) return el.tagName.toLowerCase()
  // Drop utility classes (Tailwind, Bootstrap helpers)
  const semantic = cls.filter(c => !/^(w-|h-|p[xytrblxy]?-|m[xytrblxy]?-|flex|grid|inline|block|hidden|text-|bg-|border|rounded|shadow|hover:|sm:|md:|lg:|xl:|2xl:|absolute|relative|static|fixed|sticky|font-|leading-|tracking-|uppercase|lowercase|capitalize|truncate|opacity-|z-|cursor-|select-|gap-|space-|justify-|items-|self-|order-|col-|row-)/i.test(c))
  const chosen = semantic[0] ?? cls[0]
  return '.' + chosen
}

// ─── Combined detection: standard selectors + smart heuristics ────────────────

function detectClasses(root: HTMLElement): {
  article_wrapper?: string
  article_title?: string
  article_content?: string
  card?: string
  card_grid?: string
  main_wrapper?: string
} {
  const detected: ReturnType<typeof detectClasses> = {}

  // ── Standard selectors (fast path) ────────────────────────────────────
  const tryStd = (key: keyof typeof detected, candidates: string[]) => {
    for (const sel of candidates) {
      const el = root.querySelector(sel)
      if (el) { detected[key] = bestClass(el); return }
    }
  }

  tryStd('card_grid', [
    '.posts', '.news-grid', '.articles', '.cards', '.card-grid',
    '.post-list', '.news-list', '.entries', '.entry-list',
    '[class*="post-grid"]', '[class*="news-grid"]', '[class*="article-grid"]',
  ])
  tryStd('card', [
    'article.post', 'article.card', '.post-card', '.news-card', '.article-card',
    '[class*="post-card"]', '[class*="article-card"]', '[class*="news-item"]',
  ])
  tryStd('article_wrapper', [
    'article.post', 'article.entry', 'main article', '.single-post', '.post', '.entry',
    '[class*="single-post"]', '[class*="post-single"]',
  ])
  tryStd('article_title', [
    '.post-title', '.entry-title', '.article-title', 'h1.post-title', 'h1.entry-title',
    '[class*="post-title"]', '[class*="entry-title"]', '[class*="article-title"]',
  ])
  tryStd('article_content', [
    '.post-content', '.entry-content', '.article-content', '.article-body', '.post-body',
    '[class*="post-content"]', '[class*="entry-content"]', '[class*="article-body"]',
  ])
  tryStd('main_wrapper', ['main', '.container', '.wrapper', '.site-content', '[class*="main-content"]'])

  // ── Smart heuristic fallback for cards ────────────────────────────────
  if (!detected.card || !detected.card_grid) {
    const cardPattern = detectCardPattern(root)
    if (cardPattern) {
      if (!detected.card_grid) detected.card_grid = bestClass(cardPattern.grid)
      if (!detected.card)      detected.card      = bestClass(cardPattern.card)
    }
  }

  // ── Smart heuristic fallback for article content ──────────────────────
  if (!detected.article_content || !detected.article_wrapper || !detected.article_title) {
    const contentEl = detectArticleContent(root)
    if (contentEl) {
      if (!detected.article_content) detected.article_content = bestClass(contentEl)

      // Wrapper = nearest <article> ancestor, or contentEl's parent
      if (!detected.article_wrapper) {
        const wrapper = (contentEl.closest('article') ?? contentEl.parentNode) as HTMLElement | null
        if (wrapper && wrapper.tagName && wrapper !== root) {
          detected.article_wrapper = bestClass(wrapper)
        }
      }

      // Title = nearest h1/h2 in the article wrapper area
      if (!detected.article_title) {
        const wrap = (contentEl.closest('article') ?? contentEl.parentNode) as HTMLElement | null
        const titleEl = wrap?.querySelector('h1, h2')
                     ?? root.querySelector('article h1, article h2')
                     ?? root.querySelector('main h1, main h2')
                     ?? root.querySelector('h1')
        if (titleEl) {
          const c = bestClass(titleEl)
          detected.article_title = c.startsWith('.') ? c : titleEl.tagName.toLowerCase()
        }
      }
    }
  }

  return detected
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })

  let body: { url?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  const referenceUrl = body.url?.trim() ?? ''
  if (!referenceUrl) return NextResponse.json({ error: 'Cal una URL' }, { status: 400 })
  if (!isValidHttpUrl(referenceUrl)) return NextResponse.json({ error: 'URL no vàlida' }, { status: 400 })
  if (!isSafeUrl(referenceUrl)) return NextResponse.json({ error: 'URL no permesa' }, { status: 400 })

  const fetched = await safeFetch(referenceUrl, { timeout: 15_000 })
  if (!fetched) return NextResponse.json({ error: "No s'ha pogut accedir a la pàgina" }, { status: 422 })

  const baseUrl = new URL(referenceUrl)
  let root: HTMLElement
  try { root = parse(fetched.body) as HTMLElement } catch {
    return NextResponse.json({ error: 'Error parsejant HTML' }, { status: 422 })
  }

  const { headHtml, externalStyles, fontLinks } = extractHead(root, baseUrl)
  const { scriptsHtml, externalScripts } = extractScripts(root, baseUrl)

  const headerHtml = extractRegion(root, baseUrl, [
    'header[role="banner"]', 'body > header', 'header.site-header', 'header#header',
    '.site-header', '.main-header', '.page-header', 'header',
    'nav[role="navigation"]', '.navbar', '.navigation',
  ])

  const footerHtml = extractRegion(root, baseUrl, [
    'footer[role="contentinfo"]', 'body > footer', 'footer.site-footer', 'footer#footer',
    '.site-footer', '.main-footer', '.page-footer', 'footer',
  ])

  const detectedClasses = detectClasses(root)
  const detection = detectFramework(fetched.body, fetched.headers)

  return NextResponse.json({
    extracted_head: headHtml,
    extracted_header: headerHtml,
    extracted_footer: footerHtml,
    extracted_scripts: scriptsHtml,
    external_styles: [...new Set(externalStyles)],
    external_scripts: [...new Set(externalScripts)],
    font_links: [...new Set(fontLinks)],
    detected_classes: detectedClasses,
    detection,
    base_url: baseUrl.origin,
  })
}
