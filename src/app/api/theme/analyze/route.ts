import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parse, HTMLElement } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetch, safeFetchText, decodeEntities } from '@/lib/scrape/http'
import { extractTokens } from '@/lib/scrape/tokens'
import { absolutiseCssUrls as cssAbsUrls, splitImports, extractFontFaceCss, proxyFontsInCss } from '@/lib/scrape/clientCss'
import { absolutise, buildExtractedHead } from '@/lib/scrape/headerFooter'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { detectBlogSignature } from '@/lib/scrape/blogDetect'
import { isLocale } from '@/lib/i18n/config'
import {
  sseFrame, stepFloor, stepWeight,
  type CaptureEvent, type CaptureStepId, type AnalyzeResult,
} from '@/lib/render/captureProgress'

// node-html-parser requires the Node.js runtime.
export const runtime = 'nodejs'
// The capture STREAMS its progress (Server-Sent Events) so the connection stays
// alive and the user sees steady movement. The pipeline is a single static fetch
// + a parallel CSS scan (for token extraction) + a synchronous, verbatim
// absolutisation of the head/header/footer — no LLM, no headless browser. Fast,
// but we keep headroom for a slow CDN serving many stylesheets.
export const maxDuration = 60

const MAX_STYLESHEETS = 24
const MAX_CSS_BYTES = 900_000
const CSS_CONCURRENCY = 6
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

const FRAMEWORK_LABELS: Record<Framework, string> = {
  wordpress: 'WordPress', nextjs: 'Next.js', astro: 'Astro', gatsby: 'Gatsby',
  hugo: 'Hugo', jekyll: 'Jekyll', webflow: 'Webflow', squarespace: 'Squarespace',
  wix: 'Wix', shopify: 'Shopify', vue: 'Vue', react: 'React', html: 'HTML estàtic',
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
// The raw head/header/footer extraction (absolutise, buildExtractedHead,
// rawRegionHtml, region selectors) lives in @/lib/scrape/headerFooter so it can be
// unit-tested + reused. This route adds the CSS-fetch-for-tokens + framework
// detection + SSE plumbing on top.

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

// Bounded-concurrency map that preserves input order. Lets us fetch many
// stylesheets at once (so one slow CDN can't stall the whole capture) without
// opening an unbounded number of sockets.
async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// Fetch every stylesheet (following @import recursively), absolutise each
// against its OWN url, and concatenate in cascade order. Top-level sheets are
// fetched in PARALLEL (bounded) so a single slow/broken sheet is skipped, never
// fatal — graceful degradation over an all-or-nothing serial wait. Stops at a
// byte budget when concatenating.
async function fetchAllCss(sources: CssSource[], pageUrl: URL): Promise<string> {
  const seen = new Set<string>()

  async function pullUrl(url: string, depth: number): Promise<string> {
    if (depth > 4 || seen.has(url)) return ''
    seen.add(url)
    const css = await safeFetchText(url, { accept: 'text/css,*/*', timeout: 8_000 })
    if (!css) return ''
    let base: URL
    try { base = new URL(url) } catch { base = pageUrl }
    const { imports, rest } = splitImports(css, base)
    const importedParts: string[] = []
    for (const imp of imports) importedParts.push(await pullUrl(imp, depth + 1))
    importedParts.push(cssAbsUrls(rest, base))
    return importedParts.join('\n')
  }

  // One resolver per source, preserving document order. Font sheets resolve to
  // '' (they stay as <link>, never inlined).
  const tasks: Array<() => Promise<string>> = sources.map(src => {
    if (src.kind === 'url') {
      if (FONT_SHEET_RE.test(src.url)) return async () => ''
      return () => pullUrl(src.url, 0)
    }
    return async () => {
      const { imports, rest } = splitImports(src.css, pageUrl)
      const importedParts: string[] = []
      for (const imp of imports) importedParts.push(await pullUrl(imp, 1))
      importedParts.push(cssAbsUrls(rest, pageUrl))
      return importedParts.join('\n')
    }
  })

  const resolved = await mapWithConcurrency(tasks, CSS_CONCURRENCY, t => t())

  // Concatenate in cascade order under the byte budget.
  let budget = MAX_CSS_BYTES
  const parts: string[] = []
  for (const css of resolved) {
    if (budget <= 0) break
    const slice = css.length > budget ? css.slice(0, budget) : css
    budget -= slice.length
    if (slice) parts.push(slice)
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
    const t = decodeEntities(h1.text.replace(/\s+/g, ' ').trim())
    if (t && t.length <= 80) return t
  }
  // 2) og:title / <title>, stripped of the site-name suffix.
  const strip = (s: string) => decodeEntities(s.split(/\s*[|·•\-–—]\s*/)[0].trim() || s.trim())
  const og = root.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim()
  if (og) return strip(og).slice(0, 80)
  const title = root.querySelector('title')?.text?.trim()
  if (title) return strip(title).slice(0, 80)
  return null
}

// The real brand / site name, so a freshly-created site auto-adopts it on capture
// (instead of keeping the placeholder the operator typed). og:site_name is the
// reliable source; otherwise a clean capitalized domain.
function extractSiteName(root: HTMLElement, baseUrl: URL): string | null {
  const og = root.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim()
  if (og) return decodeEntities(og).slice(0, 60)
  const app = root.querySelector('meta[name="application-name"]')?.getAttribute('content')?.trim()
  if (app) return decodeEntities(app).slice(0, 60)
  const host = baseUrl.hostname.replace(/^www\./, '').split('.')[0]
  return host ? host.charAt(0).toUpperCase() + host.slice(1) : null
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

// ─── Route handler ────────────────────────────────────────────────────────────
//
// Authentication and request validation happen up front and return ordinary
// JSON errors. Once the request is accepted, the response BODY is a Server-Sent
// Events stream: the pipeline runs step by step and streams a `progress` event
// for each, a final `result` event with the captured theme, or an `error` event
// if a critical step cannot proceed. Non-critical failures (e.g. a slow
// stylesheet) are skipped, not fatal.

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })

  let body: { url?: string; blogUrl?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  const referenceUrl = body.url?.trim() ?? ''
  if (!referenceUrl) return NextResponse.json({ error: 'Cal una URL' }, { status: 400 })
  if (!isValidHttpUrl(referenceUrl)) return NextResponse.json({ error: 'URL no vàlida' }, { status: 400 })
  if (!isSafeUrl(referenceUrl)) return NextResponse.json({ error: 'URL no permesa' }, { status: 400 })

  // Optional user-provided Blog URL — the fallback that guides card cloning when
  // auto-detection is unsure. Validated/SSRF-checked like the main URL.
  const blogUrlRaw = body.blogUrl?.trim() ?? ''
  const blogUrlOverride = blogUrlRaw && isValidHttpUrl(blogUrlRaw) && isSafeUrl(blogUrlRaw) ? blogUrlRaw : ''

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: CaptureEvent) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(sseFrame(event))) } catch { closed = true }
      }
      const running = (step: CaptureStepId, detail?: string) =>
        send({ type: 'progress', step, status: 'running', pct: stepFloor(step), detail })
      const done = (step: CaptureStepId, detail?: string) =>
        send({ type: 'progress', step, status: 'done', pct: stepFloor(step) + stepWeight(step), detail })
      const skipped = (step: CaptureStepId, detail?: string) =>
        send({ type: 'progress', step, status: 'skipped', pct: stepFloor(step) + stepWeight(step), detail })
      const fail = (step: CaptureStepId | undefined, error: string) =>
        send({ type: 'error', step, error })

      try {
        // ── 1. FETCH (static) ────────────────────────────────────────────────────
        // We inject the page's REAL head + header + footer verbatim, so a plain
        // fetch of the server-rendered HTML is all we need — the client's own CSS
        // and JS (linked from the head) do the rest in the browser. (Fully
        // JS-rendered chrome that isn't in the initial HTML won't be captured, but
        // the overwhelming majority of sites server-render their header/footer.)
        running('fetch')
        const fetched = await safeFetch(referenceUrl, { timeout: 15_000 })
        if (!fetched) { fail('fetch', "No s'ha pogut accedir a la pàgina. Comprova la URL."); return }
        const baseUrl = new URL(referenceUrl)
        let root: HTMLElement
        try { root = parse(fetched.body) as HTMLElement } catch {
          fail('fetch', 'No hem pogut interpretar l’HTML de la pàgina.'); return
        }
        done('fetch', baseUrl.hostname.replace(/^www\./, ''))

        // ── 2. ANALYZE (framework / hosting) ───────────────────────────────────
        running('analyze')
        const detection = detectFramework(fetched.body, fetched.headers)
        done('analyze', FRAMEWORK_LABELS[detection.framework])

        // ── 3. REGIONS (head assets / header / footer / title / locale) ────────
        // We pull the page title/locale/site-name BEFORE extracting the head (the
        // head extraction drops <title>/<meta>, but we read them off `root` which
        // is untouched — extraction builds new strings, it doesn't mutate <head>).
        running('regions')
        const { sources, externalStyles, fontLinks } = collectHeadStyles(root, baseUrl)
        const { externalScripts } = extractScripts(root, baseUrl)
        const sectionTitle = extractPageTitle(root)
        const detectedLocale = detectLocale(root)
        const siteName = extractSiteName(root, baseUrl)

        let extractedHead = buildExtractedHead(root, baseUrl)
        // The Top/Bottom sandwich: parse5 splits the page around its main content,
        // capturing EVERYTHING before it (wrappers + header) and EVERYTHING after
        // it down to </body> (footer + wrapper closers + late scripts), repairing
        // malformed markup so it can't swallow the page. The blog renders between
        // them; body attrs reapply the source's global background/typography.
        const split = splitPageChrome(fetched.body, baseUrl)
        const extractedHeader = split.top
        const extractedFooter = split.bottom
        const extractedBodyAttrs = split.bodyAttrs
        const regionDetail =
          split.strategy === 'content' ? 'contingut aïllat · wrappers intactes'
          : 'cap regió detectada'
        if (split.strategy === 'none') {
          send({
            type: 'notice', severity: 'warning', code: 'no_chrome',
            message: 'No hem detectat capçalera ni peu en aquesta pàgina. El blog es mostrarà amb el disseny base.',
          })
        }
        done('regions', regionDetail)

        // ── 4. STYLES (parallel CSS fetch + token extraction) ──────────────────
        running('styles')
        let rawCss = ''
        let tokens
        try {
          let urlCount = 0
          const cappedSources = sources.filter(s => s.kind === 'inline' || ++urlCount <= MAX_STYLESHEETS)
          rawCss = await fetchAllCss(cappedSources, baseUrl)
          tokens = extractTokens({ root, cssTexts: [rawCss], fontLinks })
          done('styles', `${externalStyles.length} fulls CSS · ${fontLinks.length} tipografies`)
        } catch {
          // A styling hiccup must not sink the capture: degrade to whatever the
          // inline markup + font links can give us and keep going.
          tokens = extractTokens({ root, cssTexts: [rawCss], fontLinks })
          skipped('styles', 'estils parcials (alguns fulls no disponibles)')
        }

        // ICON-FONT CORS FIX: re-emit every @font-face we fetched with its font
        // URLs routed through our same-origin /api/asset proxy, appended to the
        // injected head. The browser then loads the (CORS-blocked) self-hosted icon
        // fonts via the proxy, so icon fonts render even when the client's server
        // sends no CORS headers. Additive — the original linked CSS is untouched.
        const fontFaceCss = proxyFontsInCss(extractFontFaceCss(rawCss))
        if (fontFaceCss.trim()) {
          extractedHead = `${extractedHead}\n<style data-carma-fontfix>${fontFaceCss.replace(/<\/style/gi, '<\\/style')}</style>`
        }

        // ── 5. INJECT (raw head + header + footer, NO LLM) ──────────────────────
        // The clone is the client's REAL head assets + REAL header/footer markup,
        // injected verbatim. There is nothing to "reconstruct": the work is the
        // absolutisation done above. This step just reports what was captured.
        running('reconstruct')
        const cloned = [
          extractedHeader ? 'capçalera' : null,
          extractedFooter ? 'peu' : null,
          extractedHead ? 'estils' : null,
        ].filter(Boolean)

        // Smart blog detection (GOAL 2): does the client already have a blog/news
        // section + a repeating article-card design we should replicate? Detect on
        // the captured page first; if it isn't a listing but a blog URL exists,
        // fetch that index ONCE and detect the card pattern there (best-effort —
        // a slow/blocked fetch never sinks the capture).
        let blogSignature = detectBlogSignature({ root, cssTexts: [rawCss], base: baseUrl, blogUrlOverride: blogUrlOverride || null })
        // Fetch the blog index — the USER'S Blog URL if given, else our (now strict)
        // guess — to detect + clone its real card design. Best-effort.
        const targetBlog = blogUrlOverride || (!blogSignature.card ? blogSignature.blogUrl : null)
        if (targetBlog && targetBlog !== referenceUrl) {
          try {
            const blogPage = await safeFetch(targetBlog, { timeout: 8_000 })
            if (blogPage) {
              const blogRoot = parse(blogPage.body) as HTMLElement
              blogSignature = detectBlogSignature({
                root, cssTexts: [rawCss], base: baseUrl, blogRoot, blogUrlOverride: blogUrlOverride || null,
              })
            }
          } catch { /* best-effort — keep the first-pass signature */ }
        }
        done('reconstruct', cloned.length ? cloned.join(' + ') : 'cap regió')

        // ── 6. FINALIZE (packaging) ────────────────────────────────────────────
        running('finalize')
        const data: AnalyzeResult = {
          // extracted_head = the client's real head assets (CSS/fonts/scripts),
          // injected into the render <head> so they style the light-DOM
          // header/footer 1:1. The blog between them is OUR template, isolated in
          // a Shadow DOM. The card path is retired; native cards render the feed.
          extracted_head: extractedHead,
          extracted_header: extractedHeader,
          extracted_footer: extractedFooter,
          extracted_body_attrs: extractedBodyAttrs,
          extracted_card: '',
          extracted_scripts: '',
          external_styles: [...new Set(externalStyles)],
          external_scripts: [...new Set(externalScripts)],
          font_links: [...new Set(fontLinks)],
          detection,
          base_url: baseUrl.origin,
          tokens,
          section_title: sectionTitle,
          detected_locale: detectedLocale,
          site_name: siteName,
          blog_signature: blogSignature,
        }
        done('finalize')
        send({ type: 'result', data })
      } catch (err) {
        fail(undefined, err instanceof Error ? err.message : 'Error inesperat durant la captura')
      } finally {
        closed = true
        try { controller.close() } catch { /* already closed / client gone */ }
      }
    },
    cancel() {
      // Client disconnected (closed the modal / navigated away). Nothing to
      // clean up beyond letting the in-flight work fall away.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering so events flush to the client immediately.
      'X-Accel-Buffering': 'no',
    },
  })
}
