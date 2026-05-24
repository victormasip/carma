import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parse, type HTMLElement } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetch, safeFetchText } from '@/lib/scrape/http'
import { extractTokens } from '@/lib/scrape/tokens'
import { sanitizeStructural } from '@/lib/scrape/sanitize'

const MAX_STYLESHEETS = 8

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
  let hosting: Hosting = null
  const server = headers.get('server')?.toLowerCase() ?? ''
  const poweredBy = headers.get('x-powered-by')?.toLowerCase() ?? ''

  if (headers.has('x-vercel-cache') || headers.has('x-vercel-id') || server.includes('vercel')) hosting = 'vercel'
  else if (headers.has('x-nf-request-id') || server.includes('netlify')) hosting = 'netlify'
  else if (headers.has('cf-ray') || server.includes('cloudflare')) hosting = 'cloudflare'
  else if (headers.has('x-amz-cf-id') || server.includes('amazon')) hosting = 'aws'
  else if (server.includes('github.com') || poweredBy.includes('github')) hosting = 'github'
  else if (server.includes('wpengine') || headers.has('x-wpe-loopback-upstream-addr')) hosting = 'wpengine'

  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? ''
  const gen = generator.toLowerCase()

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
  if (/data-v-[a-f0-9]+/i.test(html) || html.includes('__vue_app__') || html.includes('v-cloak')) {
    return { framework: 'vue', hosting, confidence: 'medium' }
  }
  if (html.includes('id="root"') && /\b(react|ReactDOM)\b/.test(html)) {
    return { framework: 'react', hosting, confidence: 'medium' }
  }
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
  for (const node of el.querySelectorAll('[style]')) {
    const s = node.getAttribute('style')
    if (s && /url\(/i.test(s)) node.setAttribute('style', absolutiseCssUrls(s, base))
  }
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
  inlineCss: string[]
} {
  const head = root.querySelector('head')
  const externalStyles: string[] = []
  const fontLinks: string[] = []
  const inlineCss: string[] = []
  if (!head) return { headHtml: '', externalStyles, fontLinks, inlineCss }

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

  for (const style of head.querySelectorAll('style')) {
    const css = style.text ?? ''
    if (css.trim()) inlineCss.push(css)
    const abs = /url\(/i.test(css) ? absolutiseCssUrls(css, base) : css
    const mediaAttr = style.getAttribute('media')
    keepNodes.push(`<style${mediaAttr ? ` media="${mediaAttr}"` : ''}>${abs}</style>`)
  }

  return { headHtml: keepNodes.join('\n'), externalStyles, fontLinks, inlineCss }
}

function extractScripts(root: HTMLElement, base: URL): {
  scriptsHtml: string
  externalScripts: string[]
} {
  const externalScripts: string[] = []
  const keepNodes: string[] = []

  for (const script of root.querySelectorAll('script')) {
    const src = script.getAttribute('src')
    const type = script.getAttribute('type')

    if (src) {
      const absUrl = absolutise(src, base)
      if (!absUrl) continue
      externalScripts.push(absUrl)
      const attrs: string[] = [`src="${absUrl.replace(/"/g, '&quot;')}"`]
      for (const k of ['type', 'defer', 'async', 'crossorigin', 'referrerpolicy', 'nonce']) {
        const v = script.getAttribute(k)
        if (v !== undefined && v !== null) {
          if (v === '' || v === k) attrs.push(k)
          else attrs.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
        }
      }
      keepNodes.push(`<script ${attrs.join(' ')}></script>`)
    } else {
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

  const { headHtml, externalStyles, fontLinks, inlineCss } = extractHead(root, baseUrl)
  const { scriptsHtml, externalScripts } = extractScripts(root, baseUrl)

  const headerHtml = sanitizeStructural(extractRegion(root, baseUrl, [
    'header[role="banner"]', 'body > header', 'header.site-header', 'header#header',
    '.site-header', '.main-header', '.page-header', 'header',
    'nav[role="navigation"]', '.navbar', '.navigation',
  ]))

  const footerHtml = sanitizeStructural(extractRegion(root, baseUrl, [
    'footer[role="contentinfo"]', 'body > footer', 'footer.site-footer', 'footer#footer',
    '.site-footer', '.main-footer', '.page-footer', 'footer',
  ]))

  const detection = detectFramework(fetched.body, fetched.headers)

  // Fetch a sample of external stylesheets so we can parse design tokens
  // (colours / fonts / radii) from real CSS, not just inline styles.
  const uniqueStyles = [...new Set(externalStyles)].slice(0, MAX_STYLESHEETS)
  const fetchedCss = await Promise.all(
    uniqueStyles.map(href => safeFetchText(href, { accept: 'text/css,*/*', timeout: 8_000 })),
  )
  const cssTexts = [...inlineCss, ...fetchedCss.filter((c): c is string => !!c)]

  const tokens = extractTokens({ root, cssTexts, fontLinks })

  return NextResponse.json({
    extracted_head: headHtml,
    extracted_header: headerHtml,
    extracted_footer: footerHtml,
    // Scripts are intentionally excluded from the render output: client scripts
    // that reference DOM elements from the original site cause blank pages and
    // other breakage. Visual fidelity comes from CSS alone.
    extracted_scripts: '',
    external_styles: [...new Set(externalStyles)],
    external_scripts: [...new Set(externalScripts)],
    font_links: [...new Set(fontLinks)],
    detection,
    base_url: baseUrl.origin,
    tokens,
  })
}
