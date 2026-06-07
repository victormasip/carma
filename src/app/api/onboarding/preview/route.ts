import { NextResponse, type NextRequest } from 'next/server'
import { parse, HTMLElement } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetch, safeFetchText, decodeEntities } from '@/lib/scrape/http'
import { buildExtractedHead } from '@/lib/scrape/headerFooter'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { extractTokens } from '@/lib/scrape/tokens'
import { absolutiseCssUrls, extractFontFaceCss, proxyFontsInCss, proxyUseHref } from '@/lib/scrape/clientCss'
import { buildListingPage, buildErrorPage } from '@/lib/render/theme'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

// Route the client's OWN stylesheets through /api/asset so the proxy rewrites
// their @font-face fonts to same-origin (icons load) — they're otherwise direct
// cross-origin <link>s whose self-hosted fonts are CORS-blocked. Google/CDN font
// sheets are left for the render's own font_links handling.
function proxyStylesheetLinks(headHtml: string): string {
  return headHtml.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = /\brel=(["'])([^"']*)\1/i.exec(tag)?.[2] ?? ''
    if (!/stylesheet/i.test(rel)) return tag
    return tag.replace(/\bhref=(["'])(https?:\/\/[^"']+)\1/i, (_h, q: string, url: string) => {
      if (FONT_SHEET_RE.test(url)) return `href=${q}${url}${q}`
      return `href=${q}/api/asset?u=${encodeURIComponent(url)}${q}`
    })
  })
}

// SVG sprite icons reference a cross-origin document via <use href> — illegal in
// browsers. Route them through the same-origin proxy.
function proxyUses(html: string, base: URL): string {
  return html.replace(/(<use\b[^>]*?\b(?:xlink:href|href)=)(["'])([^"']+)\2/gi,
    (_m, pre: string, q: string, href: string) => `${pre}${q}${proxyUseHref(href, base)}${q}`)
}

// All links in the preview are inert (no navigating to /render/preview/* 404s, no
// leaving to the client's real site). A capture-phase listener cancels every click.
const CLICK_BLOCKER =
  `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(a){e.preventDefault();e.stopPropagation();}},true);document.addEventListener('submit',function(e){e.preventDefault();},true);</script>`

// PUBLIC, unauthenticated full-page blog PREVIEW for the landing funnel.
//
// Unlike the lightweight /detect, this runs the REAL extraction: the visitor's
// own <head> assets (their CSS + fonts), their actual <header> and <footer>
// markup, their body attributes and design tokens — then renders a Carma blog
// feed (dummy articles) sandwiched between THEIR real chrome. So the preview is a
// genuine 1:1 clone of the client's site, not a generic mock. Nothing is persisted
// and no auth is required; the faithful, saved clone still runs after signup.

const FONT_SHEET_RE = /fonts\.(googleapis|gstatic)\.com|use\.typekit|typography\.com|cloud\.typography|fonts\.adobe|fonts\.bunny/i
const MAX_SHEETS = 24
const MAX_CSS_BYTES = 900_000

function normalize(raw: string): string {
  const v = (raw || '').trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

const DUMMY = [
  { cat: 'Editorial', title: 'La història que volem explicar', excerpt: 'Un primer article d’exemple, amb la teva veu i el teu estil, llest per editar.' },
  { cat: 'Notícies', title: 'Novetats d’aquesta temporada', excerpt: 'Comparteix les últimes novetats amb el teu públic, sense fricció.' },
  { cat: 'Guia', title: 'Com en treiem el màxim partit', excerpt: 'Consells pràctics, ben escrits i fàcils de llegir de dalt a baix.' },
  { cat: 'Reportatge', title: 'Una mirada de prop', excerpt: 'Històries que connecten amb la teva audiència i reforcen la teva marca.' },
  { cat: 'Opinió', title: 'El que de debò importa', excerpt: 'La teva perspectiva, publicada amb un disseny a la seva alçada.' },
  { cat: 'Cultura', title: 'Idees que inspiren', excerpt: 'Contingut que la gent vol llegir fins al final i tornar a visitar.' },
]

// Gather inline + (capped) external CSS for token extraction, plus the font-sheet
// links to re-emit. Keeps the document's cascade order roughly intact.
async function gatherCss(root: ReturnType<typeof parse>, base: URL): Promise<{ cssTexts: string[]; fontLinks: string[] }> {
  const head = root.querySelector('head')
  const cssTexts: string[] = []
  const fontLinks: string[] = []
  const sheetUrls: string[] = []
  if (head) {
    for (const node of head.childNodes) {
      if (!(node instanceof HTMLElement)) continue
      const tag = (node.tagName || '').toLowerCase()
      if (tag === 'style') {
        cssTexts.push(absolutiseCssUrls(node.text ?? '', base))
      } else if (tag === 'link') {
        const href = node.getAttribute('href')
        if (!href) continue
        let abs: string
        try { abs = new URL(href, base).toString() } catch { continue }
        if (FONT_SHEET_RE.test(abs)) { fontLinks.push(abs); continue }
        const rel = (node.getAttribute('rel') || '').toLowerCase()
        if (rel.includes('stylesheet')) sheetUrls.push(abs)
      }
    }
  }
  let budget = MAX_CSS_BYTES
  for (const u of sheetUrls.slice(0, MAX_SHEETS)) {
    if (budget <= 0) break
    if (!isSafeUrl(u)) continue
    const css = await safeFetchText(u, { accept: 'text/css,*/*', timeout: 7_000 }).catch(() => null)
    if (!css) continue
    const abs = absolutiseCssUrls(css.slice(0, budget), new URL(u))
    budget -= abs.length
    cssTexts.push(abs)
  }
  return { cssTexts, fontLinks }
}

export async function GET(request: NextRequest) {
  const url = normalize(request.nextUrl.searchParams.get('url') ?? '')

  const fail = (msg: string, status = 400) => {
    const err = buildErrorPage(msg, status)
    return new NextResponse(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  if (!url || !isValidHttpUrl(url) || !isSafeUrl(url)) {
    return fail('Aquesta adreça no és vàlida. Prova amb el domini del teu lloc, p. ex. la-teva-web.cat', 400)
  }

  const res = await safeFetch(url, { accept: 'text/html,*/*', timeout: 14_000 }).catch(() => null)
  if (!res?.body) return fail('No hem pogut accedir a aquesta web. Comprova l’adreça i torna-ho a provar.', 502)

  const base = new URL(url)
  const html = res.body
  const root = parse(html, { blockTextElements: { script: false, style: true, pre: true } })

  // 1. The client's real <head> assets (their CSS + fonts), absolutised, with the
  //    client's own stylesheets routed through the asset proxy so icon fonts load.
  let extractedHead = proxyStylesheetLinks(buildExtractedHead(root, base))

  // 2. The client's real header + footer (the sandwich around the content), with
  //    SVG sprite <use> hrefs proxied so those icons render too.
  const split = splitPageChrome(html, base)
  const headerHtml = proxyUses(split.top, base)
  const footerHtml = proxyUses(split.bottom, base)

  // 3. Tokens (best-effort) from inline + capped external CSS.
  const { cssTexts, fontLinks } = await gatherCss(root, base)
  const tokens = extractTokens({ root, cssTexts, fontLinks })

  // 4. Re-emit self-hosted @font-face with proxied URLs so the client's fonts
  //    actually load cross-origin (same fix the real capture applies).
  const fontFaceCss = proxyFontsInCss(extractFontFaceCss(cssTexts.join('\n')))
  if (fontFaceCss.trim()) {
    extractedHead = `${extractedHead}\n<style data-carma-fontfix>${fontFaceCss.replace(/<\/style/gi, '<\\/style')}</style>`
  }

  const rawTitle = root.querySelector('meta[property="og:site_name"]')?.getAttribute('content')
    ?? root.querySelector('title')?.text
    ?? ''
  const siteName = decodeEntities(rawTitle.replace(/\s+/g, ' ').trim()).split(/[·|–—-]/)[0].trim().slice(0, 60)
    || base.hostname.replace(/^www\./, '')

  const theme = {
    extracted_head: extractedHead,
    extracted_header: headerHtml || null,
    extracted_footer: footerHtml || null,
    extracted_body_attrs: split.bodyAttrs || null,
    design_tokens: tokens,
    font_links: fontLinks,
    section_title: 'El blog',
    default_locale: 'ca',
  }

  const now = Date.now()
  const posts = DUMMY.map((d, i) => ({
    id: `preview-${i}`,
    title: d.title,
    slug: `preview-${i}`,
    content: { html: `<p>${d.excerpt}</p>` },
    excerpt: d.excerpt,
    featured_image: null,
    categories: [d.cat],
    tags: [],
    author_name: 'Equip',
    created_at: new Date(now - i * 86_400_000 * 3).toISOString(),
    is_published: true,
    default_locale: 'ca',
  }))

  const page = buildListingPage(
    theme as Parameters<typeof buildListingPage>[0],
    siteName,
    'preview',
    posts as Parameters<typeof buildListingPage>[3],
    'ca',
  )

  // Make every link/form inert so the visitor can't navigate inside the preview
  // (to a 404 article) or off to the client's real site.
  const guarded = page.includes('</body>')
    ? page.replace('</body>', `${CLICK_BLOCKER}</body>`)
    : page + CLICK_BLOCKER

  return new NextResponse(guarded, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, max-age=120' },
  })
}
