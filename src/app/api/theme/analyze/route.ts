import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parse, HTMLElement } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetch, safeFetchText } from '@/lib/scrape/http'
import { extractTokens, familiesFromFontLinks } from '@/lib/scrape/tokens'
import { sanitizeStructural } from '@/lib/scrape/sanitize'
import { absolutiseCssUrls as cssAbsUrls, splitImports } from '@/lib/scrape/clientCss'
import { rebuildChrome, filterCssForRegion, trimPayload, type RebuiltRegion } from '@/lib/render/llmChrome'
import { isLocale } from '@/lib/i18n/config'

// node-html-parser requires the Node.js runtime.
export const runtime = 'nodejs'
// The LLM reconstruction (two parallel model calls) is slow — give the route
// generous headroom. NOTE: values >60 require a Vercel Pro plan; on Hobby (60s
// cap) set THEME_LLM_MODEL=claude-haiku-4-5 to stay under the limit.
export const maxDuration = 120

const MAX_STYLESHEETS = 24
const MAX_CSS_BYTES = 900_000
const FONT_SHEET_RE = /fonts\.(googleapis|gstatic)\.com|use\.typekit|typography\.com|cloud\.typography|fonts\.adobe|fonts\.bunny/i

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

type CssSource = { kind: 'url'; url: string } | { kind: 'inline'; css: string }

// Walk <head> in document order, collecting stylesheet links + inline <style>
// so the cascade order is preserved. Also surfaces font sheets (kept as <link>)
// and the external-stylesheet list (for the integration guide).
function collectHeadStyles(root: HTMLElement, base: URL): {
  sources: CssSource[]
  externalStyles: string[]
  fontLinks: string[]
} {
  const head = root.querySelector('head')
  const sources: CssSource[] = []
  const externalStyles: string[] = []
  const fontLinks: string[] = []
  if (!head) return { sources, externalStyles, fontLinks }

  for (const node of head.childNodes) {
    if (!(node instanceof HTMLElement)) continue
    const t = (node.tagName || '').toUpperCase()
    if (t === 'LINK') {
      const rel = node.getAttribute('rel')?.toLowerCase() ?? ''
      const href = absolutise(node.getAttribute('href'), base)
      if (!href) continue
      if (rel.includes('stylesheet')) {
        externalStyles.push(href)
        sources.push({ kind: 'url', url: href })
      }
      if (FONT_SHEET_RE.test(href)) fontLinks.push(href)
    } else if (t === 'STYLE') {
      const css = node.text ?? ''
      if (css.trim()) sources.push({ kind: 'inline', css })
    }
  }
  return { sources, externalStyles, fontLinks }
}

// Absolutise every asset/link URL inside a markup fragment so nothing breaks
// once it's detached from its origin.
function absolutiseMarkup(el: HTMLElement, base: URL): void {
  for (const a of el.querySelectorAll('a[href]')) {
    const v = absolutise(a.getAttribute('href'), base); if (v) a.setAttribute('href', v)
  }
  for (const n of el.querySelectorAll('img[src],source[src],video[src],audio[src],use[href],[poster]')) {
    for (const attr of ['src', 'href', 'poster'] as const) {
      const cur = n.getAttribute(attr)
      if (cur) { const v = absolutise(cur, base); if (v) n.setAttribute(attr, v) }
    }
  }
  for (const n of el.querySelectorAll('img[srcset],source[srcset]')) {
    const srcset = n.getAttribute('srcset'); if (!srcset) continue
    n.setAttribute('srcset', srcset.split(',').map(part => {
      const [u, ...rest] = part.trim().split(/\s+/)
      return [absolutise(u, base) ?? u, ...rest].join(' ')
    }).join(', '))
  }
  for (const n of el.querySelectorAll('[style]')) {
    const s = n.getAttribute('style')
    if (s && /url\(/i.test(s)) n.setAttribute('style', cssAbsUrls(s, base))
  }
}

// Fetch every stylesheet (following @import recursively), absolutise each
// against its OWN url, and concatenate in cascade order. Skips font sheets
// (kept as <link>) and stops at a byte budget.
async function fetchAllCss(sources: CssSource[], pageUrl: URL): Promise<string> {
  const seen = new Set<string>()
  const parts: string[] = []
  let budget = MAX_CSS_BYTES

  async function pullUrl(url: string, depth: number): Promise<void> {
    if (depth > 4 || budget <= 0 || seen.has(url)) return
    seen.add(url)
    const css = await safeFetchText(url, { accept: 'text/css,*/*', timeout: 8_000 })
    if (!css) return
    let base: URL
    try { base = new URL(url) } catch { base = pageUrl }
    const { imports, rest } = splitImports(css, base)
    for (const imp of imports) await pullUrl(imp, depth + 1)
    const abs = cssAbsUrls(rest, base)
    budget -= abs.length
    parts.push(abs)
  }

  for (const src of sources) {
    if (budget <= 0) break
    if (src.kind === 'url') {
      if (FONT_SHEET_RE.test(src.url)) continue // fonts stay as <link>
      await pullUrl(src.url, 0)
    } else {
      const { imports, rest } = splitImports(src.css, pageUrl)
      for (const imp of imports) await pullUrl(imp, 1)
      const abs = cssAbsUrls(rest, pageUrl)
      budget -= abs.length
      parts.push(abs)
    }
  }
  return parts.join('\n')
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

function findRegionEl(root: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel)
    if (el && el.innerHTML.trim().length > 0) return el
  }
  return null
}

// Is this element inside the site chrome (header/footer/nav)? Those headings
// (logo wordmark, etc.) are not the page's news/blog title.
function isInChrome(el: HTMLElement): boolean {
  let p = el.parentNode as HTMLElement | null
  while (p) {
    const tag = (p.tagName || '').toUpperCase()
    if (tag === 'HEADER' || tag === 'FOOTER' || tag === 'NAV') return true
    p = p.parentNode as HTMLElement | null
  }
  return false
}

// Best-effort extraction of the client's news/blog page heading, so our listing
// uses THEIR title (e.g. "Actualitat") instead of the literal "Articles".
function extractPageTitle(root: HTMLElement): string | null {
  // 1) First main-content <h1> that isn't part of the chrome.
  for (const h1 of root.querySelectorAll('h1')) {
    if (isInChrome(h1)) continue
    const t = h1.text.replace(/\s+/g, ' ').trim()
    if (t && t.length <= 80) return t
  }
  // 2) og:title / <title>, stripped of the site-name suffix.
  const strip = (s: string) => s.split(/\s*[|·•\-–—]\s*/)[0].trim() || s.trim()
  const og = root.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim()
  if (og) return strip(og).slice(0, 80)
  const title = root.querySelector('title')?.text?.trim()
  if (title) return strip(title).slice(0, 80)
  return null
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

  const { sources, externalStyles, fontLinks } = collectHeadStyles(root, baseUrl)
  const { externalScripts } = extractScripts(root, baseUrl)

  const headerEl = findRegionEl(root, [
    // Semantic / ARIA first
    'header[role="banner"]', '[role="banner"]', 'body > header',
    // WordPress (classic + block themes / FSE) and page builders
    'header#masthead', '#masthead', 'header#site-header', '#site-header',
    '.elementor-location-header', '[data-elementor-type="header"]',
    'header.wp-block-template-part', '.wp-block-template-part.site-header',
    // Common conventions
    'header.site-header', 'header#header', '.site-header', '.main-header',
    '.page-header', '.global-header', '.l-header', '#header',
    // Generic fallbacks
    'header', 'nav[role="navigation"]', '.navbar', '.navigation', 'nav',
  ])

  const footerEl = findRegionEl(root, [
    // Semantic / ARIA first
    'footer[role="contentinfo"]', '[role="contentinfo"]', 'body > footer',
    // WordPress (classic + block themes / FSE) and page builders
    'footer#colophon', '#colophon', 'footer#site-footer', '#site-footer',
    '.elementor-location-footer', '[data-elementor-type="footer"]',
    'footer.wp-block-template-part', '.wp-block-template-part.site-footer',
    // Common conventions
    'footer.site-footer', 'footer#footer', '.site-footer', '.main-footer',
    '.page-footer', '.global-footer', '.l-footer', '#footer',
    // Generic fallback
    'footer',
  ])

  // Capture the ORIGINAL header/footer markup as the model's SOURCE: every asset
  // URL absolutised, scripts stripped. We do NOT ship this — the LLM rebuilds it.
  const regionSource = (el: HTMLElement | null): string => {
    if (!el) return ''
    absolutiseMarkup(el, baseUrl)
    // trimPayload aggressively strips scripts/styles/iframes/SVGs/base64 to slash
    // the token count before the markup ever reaches the model.
    return trimPayload(sanitizeStructural(el.toString()))
  }
  const headerSource = regionSource(headerEl)
  const footerSource = regionSource(footerEl)

  const detection = detectFramework(fetched.body, fetched.headers)

  // Fetch + inline the site's real CSS once. Used for (a) design-token
  // extraction and (b) giving the reconstruction model a relevant styling slice
  // per region. Crucially, this CSS is NEVER shipped to the render page.
  let urlCount = 0
  const cappedSources = sources.filter(s => s.kind === 'inline' || ++urlCount <= MAX_STYLESHEETS)
  const rawCss = await fetchAllCss(cappedSources, baseUrl)
  const tokens = extractTokens({ root, cssTexts: [rawCss], fontLinks })

  // ── LLM Reconstruction Engine: rebuild clean, isolated, native chrome ──
  let rebuilt: { header: RebuiltRegion | null; footer: RebuiltRegion | null }
  try {
    rebuilt = await rebuildChrome({
      siteName: baseUrl.hostname.replace(/^www\./, ''),
      baseUrl: baseUrl.origin,
      tokens: tokens as unknown as Record<string, string>,
      fontFamilies: familiesFromFontLinks(fontLinks),
      headerHtml: headerSource,
      footerHtml: footerSource,
      headerCss: filterCssForRegion(rawCss, headerSource),
      footerCss: filterCssForRegion(rawCss, footerSource),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconegut'
    return NextResponse.json({ error: `Reconstrucció IA fallida: ${message}` }, { status: 502 })
  }

  // Stored per-region as JSON { html, css }: a self-contained, namespaced
  // component. CSS is force-scoped at render time; html is script-stripped here.
  const region = (r: RebuiltRegion | null): string =>
    r ? JSON.stringify({ html: sanitizeStructural(r.html), css: r.css }) : ''

  return NextResponse.json({
    // No client CSS bundle is shipped any more — isolation is structural.
    extracted_head: '',
    extracted_header: region(rebuilt.header),
    extracted_footer: region(rebuilt.footer),
    extracted_scripts: '',
    external_styles: [...new Set(externalStyles)],
    external_scripts: [...new Set(externalScripts)],
    font_links: [...new Set(fontLinks)],
    detection,
    base_url: baseUrl.origin,
    tokens,
    section_title: extractPageTitle(root),
    detected_locale: detectLocale(root),
  })
}

// The site's primary language from <html lang> (or og:locale), mapped to a
// supported locale so it can seed the site's default i18n locale on capture.
function detectLocale(root: HTMLElement): string | null {
  const candidates = [
    root.querySelector('html')?.getAttribute('lang'),
    root.querySelector('meta[property="og:locale"]')?.getAttribute('content'),
  ]
  for (const c of candidates) {
    if (!c) continue
    const base = c.toLowerCase().replace('_', '-').split('-')[0]
    if (isLocale(base)) return base
  }
  return null
}
