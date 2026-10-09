import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { validateGenome } from '@/lib/design/validate'
import { compileGenome } from '@/lib/design/compile'
import { buildListingPage, buildErrorPage, pageCsp } from '@/lib/render/theme'
import { buildSamplePosts } from '@/lib/render/samplePosts'
import { guardPreview } from '@/lib/render/previewGuard'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { isSafeUrl, isValidHttpUrl } from '@/lib/scrape/http'
import { chromeFor, type ChromeCapture } from '@/lib/design/chrome'
import { captureSiteChrome } from '@/lib/design/reveal'
import { designDb, domainOf, getChrome, putChrome } from '@/lib/design/store'
import type { DesignTokens } from '@/lib/scrape/tokens'

// A cold capture reads one page and up to eight stylesheets.
export const maxDuration = 30

/**
 * W5 — ONE VARIANT OF THE DOOR'S REVEAL, LIVE.
 *
 * A genome in, the real renderer's HTML out. The preview IS the product (plan
 * §9.1, decision 1): the same `buildListingPage` every published blog goes
 * through, fed the compiler's tokens, its fonts and its own extra stylesheet —
 * which, since the cascade surgery, actually applies.
 *
 * The feed's headlines are the three pitches `synthesis.ts` wrote for this
 * business (decision 2): their articles, on their blog, in their colours. With no
 * pitches, the neutral sample posts `no-invented-proof` already mandates.
 *
 * THEIR HEADER (W0). With `s` (their site), the preview wears the captured header
 * as it is when the capture is faithful, and SAFE PANEL — their logo and every link
 * they publish, in a frame we own — when it is not; identical in all three variants,
 * which now differ in the body alone (W6's harmonise/rebuild rungs are deleted).
 * See design/chrome.ts. The capture comes from the glimpse, remembered per domain
 * (memo → migration-039 table); failing both it is taken again, once, under its own
 * rate limit.
 *
 * THREAT MODEL. Public and unauthenticated. The genome arrives in a URL anyone can
 * write, so it goes through `validateGenome` — the engine's untrusted-input
 * boundary, the one that runs on the model's output too — before the compiler sees
 * it. Every string we write into the page is escaped by the renderer.
 *
 * The captured header is worse: a stranger's HTML, rendered in OUR origin, for a
 * site named in a URL anyone can send to a signed-in owner. Two layers:
 *   1. it was sanitised at capture over a spec parse (design/chrome.ts) — no
 *      scripts, frames, handlers, script/data URLs or SVG animation;
 *   2. the response carries a CSP whose `script-src` lists the HASHES of our own
 *      scripts, taken from the same page rendered WITHOUT their chrome. Anything
 *      the header could smuggle past layer 1 — a script, a handler, a
 *      javascript: URL — has no hash on the list and does not run.
 * A re-capture goes through the same SSRF guard as every other fetch.
 */

/** One capture per domain per instance at a time — three previews, one fetch. */
const capturing = new Map<string, Promise<ChromeCapture | null>>()

const HOUR = 60 * 60 * 1000
const MAX_PARAM = 8_000

function decode(v: string | null): unknown {
  if (!v || v.length > MAX_PARAM) return null
  try { return JSON.parse(Buffer.from(v, 'base64url').toString('utf8')) } catch { return null }
}

/**
 * The cover of a proposed article: abstract shapes in the variant's own palette.
 *
 * Deliberately NOT a stock photo. These are articles the business has not written
 * yet; a photograph beside the headline would read as their kitchen, their clinic,
 * their work — an invented proof. A composition in their colours reads as what it
 * is, a placeholder, and it doubles as a swatch of the design. Inline SVG: no
 * request, no decode, ~400 bytes.
 */
function pitchArt(t: DesignTokens, i: number): string {
  const a = t.colorAccent, p = t.colorPrimary
  const shapes = [
    `<circle cx="1210" cy="690" r="560" fill="${a}"/><circle cx="1210" cy="690" r="330" fill="${p}" opacity=".92"/>`,
    `<rect x="-300" y="400" width="2200" height="250" fill="${a}" transform="rotate(-11 800 450)"/><circle cx="360" cy="250" r="150" fill="${p}"/>`,
    `<circle cx="590" cy="450" r="390" fill="${p}" opacity=".9"/><circle cx="1030" cy="450" r="390" fill="${a}" opacity=".82"/>`,
  ][i % 3]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="900" fill="${t.colorSurface}"/>${shapes}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export async function GET(request: NextRequest) {
  const fail = (msg: string, status: number) => {
    const err = buildErrorPage(msg, status)
    return new NextResponse(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // Generous: a visitor flicking between three tabs, twice, is six requests. This
  // only stops the endpoint being used as somebody's free rendering service.
  if (!rateLimit(`design:preview:${clientIp(request)}`, 240, HOUR).ok) {
    return fail('Massa vistes prèvies seguides. Torna-ho a provar d’aquí una estona.', 429)
  }

  const sp = request.nextUrl.searchParams
  const raw = decode(sp.get('g'))
  if (!raw || typeof raw !== 'object') return fail('Aquest disseny no és vàlid.', 400)

  // `ok: false` still returns a complete, cohesive genome — validation repairs,
  // it does not reject — so a hand-edited URL renders SOMETHING valid, never a
  // stylesheet we did not compile.
  const { genome } = validateGenome(raw)
  const compiled = compileGenome(genome)

  const l = sp.get('l')
  const locale: Locale = isLocale(l) ? l : 'ca'
  const siteName = (sp.get('n') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)

  const rawPitches = decode(sp.get('p'))
  const pitches = (Array.isArray(rawPitches) ? rawPitches : [])
    .map(p => (p && typeof p === 'object' ? p as { t?: unknown; a?: unknown } : {}))
    .map(p => ({ title: String(p.t ?? '').trim().slice(0, 140), angle: String(p.a ?? '').trim().slice(0, 240) }))
    .filter(p => p.title)
    .slice(0, 3)

  const now = new Date().toISOString()
  const posts = pitches.length
    ? pitches.map((p, i) => ({
        id: `pitch-${i}`,
        title: p.title,
        slug: `proposta-${i + 1}`,
        content: { html: '' },
        excerpt: p.angle || null,
        featured_image: pitchArt(compiled.tokens, i),
        categories: [] as string[],
        tags: [] as string[],
        author_name: siteName || null,
        created_at: now,
        is_published: true,
        // Proposals, not published articles: the renderer badges every card and
        // banners the feed as samples. That label is the honest one.
        demo: true,
        default_locale: locale,
      }))
    : buildSamplePosts(locale, siteName || 'Carma').map(p => ({ ...p, default_locale: locale }))

  // Their header, in this variant's policy.
  let chrome: ReturnType<typeof chromeFor>['fields'] | null = null
  const siteUrl = (sp.get('s') ?? '').trim().slice(0, 500)
  if (siteUrl && isValidHttpUrl(siteUrl) && isSafeUrl(siteUrl)) {
    const db = designDb()
    const domain = domainOf(siteUrl)
    let capture = await getChrome(db, domain)
    if (!capture && rateLimit(`design:capture:${clientIp(request)}`, 20, HOUR).ok) {
      let run = capturing.get(domain)
      if (!run) {
        run = captureSiteChrome(siteUrl).finally(() => capturing.delete(domain))
        capturing.set(domain, run)
      }
      capture = await run
      if (capture) await putChrome(db, domain, capture)
    }
    chrome = chromeFor({ capture, genome, tokens: compiled.tokens, siteName, homeHref: siteUrl }).fields
  }

  const theme = {
    ...(chrome ?? {}),
    design_tokens: compiled.tokens,
    font_links: [...compiled.fonts.map(f => f.href), ...(chrome?.font_links ?? [])],
    genome_css: compiled.css,
    // Their name as the blog's masthead: it is the first thing that makes a
    // design read as THEIR blog rather than a template.
    section_title: siteName || null,
    default_locale: locale,
  }

  const page = guardPreview(buildListingPage(
    theme as Parameters<typeof buildListingPage>[0],
    siteName || 'Blog',
    'preview',
    posts as Parameters<typeof buildListingPage>[3],
    locale,
  ))
  // Our scripts are exactly the ones after the renderer's SCRIPTS_MARK — their
  // chrome sits before it, scrubbed, and anything that survived the scrub gets no
  // hash (see THREAT MODEL). One render, not two: W0 made the boundary explicit.
  const csp = [pageCsp(page), "form-action 'none'", "frame-src 'none'"].join('; ')

  return new NextResponse(page, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      // The URL is the whole input, so the response is a pure function of it: a
      // tab revisited is served from the browser, not re-rendered.
      'Cache-Control': 'private, max-age=3600',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
