// Same-origin asset proxy — the CORS/cross-origin fix for cloned ICONS.
//
// Two browser rules silently break a clone's icons when assets live on the
// client's domain but the page is served from ours:
//   · Web/icon FONTS (@font-face) require CORS; a self-hosted font without
//     `Access-Control-Allow-Origin` is blocked → icon font = blank boxes.
//   · SVG `<use href="sprite.svg#id">` cannot reference a CROSS-ORIGIN document
//     at all (hard browser rule) → sprite icons vanish.
//
// Routing those assets through `/api/asset?u=<absolute-url>` makes them
// SAME-ORIGIN to the render page (no CORS needed) and re-adds permissive CORS for
// the font case. SSRF-guarded, size-capped, content-type-restricted to
// fonts/SVG/CSS so it can't be abused as a general open proxy.

import { NextResponse, type NextRequest } from 'next/server'
import { isSafeUrl } from '@/lib/scrape/http'
import { absolutiseCssUrls, proxyFontsInCss } from '@/lib/scrape/clientCss'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024
const CORS = { 'Access-Control-Allow-Origin': '*' }

// Only the asset classes we proxy for icons (fonts + SVG + the stylesheets that
// declare them). Anything else is refused so this isn't a general proxy.
const ALLOWED_CT = /^(?:font\/|application\/(?:font|x-font|vnd\.ms-fontobject|octet-stream)|image\/svg|text\/css)/i
const FONT_OR_SVG_EXT = /\.(?:woff2?|ttf|otf|eot|svg)(?:[?#]|$)/i

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })
}

export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get('u') ?? ''
  if (!/^https?:\/\//i.test(u) || !isSafeUrl(u)) return new NextResponse('bad url', { status: 400 })

  try {
    const res = await fetch(u, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Carma-Asset/1.0', Accept: '*/*' },
    })
    if (!res.ok) return new NextResponse('upstream', { status: 502 })

    const ct = (res.headers.get('content-type') ?? '').toLowerCase() || 'application/octet-stream'
    // Accept by content-type OR by file extension (some CDNs mislabel woff2 as
    // octet-stream or text/plain) — but only for our font/svg/css classes.
    if (!ALLOWED_CT.test(ct) && !FONT_OR_SVG_EXT.test(u)) {
      return new NextResponse('unsupported type', { status: 415 })
    }

    const ab = await res.arrayBuffer()
    if (ab.byteLength > MAX_BYTES) return new NextResponse('too large', { status: 413 })

    // For a proxied STYLESHEET, rewrite its url()s: absolutise relative refs to the
    // sheet's own origin (so backgrounds still resolve) and route its fonts back
    // through this proxy (so @font-face fonts become same-origin too).
    if (/text\/css/i.test(ct)) {
      let base: URL
      try { base = new URL(u) } catch { base = request.nextUrl }
      const css = proxyFontsInCss(absolutiseCssUrls(new TextDecoder().decode(ab), base))
      return new NextResponse(css, {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
      })
    }

    return new NextResponse(new Uint8Array(ab), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': ct,
        'Content-Length': String(ab.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('fetch failed', { status: 502 })
  }
}
