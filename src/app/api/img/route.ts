// On-the-fly image transform: WebP/AVIF conversion + resize + long-cache.
//
// Used by the public renderer to emit a responsive <picture>/srcset for every
// image in an article — including hot-linked customer URLs and dataURIs from
// the editor — without touching the upload pipeline.
//
// Usage:
//   /api/img?src=<absolute-url-or-dataURI>&w=640&fmt=webp&q=78
//
// Hardened: SSRF-safe URL validation, sane size cap, no path traversal, no
// arbitrary CDN access. Failures stream the original src as a redirect (graceful
// degrade — the article never breaks because of an image transform error).

import { NextResponse, type NextRequest } from 'next/server'
import sharp from 'sharp'
import { isSafeUrl } from '@/lib/scrape/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_WIDTH = 2400
const MAX_BYTES_IN = 12 * 1024 * 1024   // refuse to fetch > 12 MB
const DEFAULT_Q = 76
const ALLOWED_FORMATS = new Set(['webp', 'avif', 'jpeg', 'png'])

function clampNum(s: string | null, def: number, max: number, min = 1): number {
  const n = s ? Number(s) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function parseDataUri(uri: string): { mime: string; buf: Buffer } | null {
  const m = /^data:([\w/+\-.]+);base64,(.+)$/i.exec(uri)
  if (!m) return null
  try {
    return { mime: m[1].toLowerCase(), buf: Buffer.from(m[2], 'base64') }
  } catch { return null }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const src = sp.get('src') ?? ''
  if (!src) return new NextResponse('missing src', { status: 400 })

  const width = clampNum(sp.get('w'), 1200, MAX_WIDTH)
  const quality = clampNum(sp.get('q'), DEFAULT_Q, 95, 30)
  const fmtParam = (sp.get('fmt') ?? 'auto').toLowerCase()

  // Decide output format from ?fmt= and the client's Accept header. AVIF wins
  // when both accept it; WebP otherwise; original-by-mime fallback.
  const accept = (request.headers.get('accept') ?? '').toLowerCase()
  let fmt = fmtParam
  if (fmt === 'auto') {
    fmt = accept.includes('image/avif') ? 'avif' : accept.includes('image/webp') ? 'webp' : 'jpeg'
  }
  if (!ALLOWED_FORMATS.has(fmt)) fmt = 'webp'

  // Fetch the source bytes (or decode a data URI).
  let buf: Buffer
  try {
    const data = parseDataUri(src)
    if (data) {
      if (data.buf.length > MAX_BYTES_IN) throw new Error('source too large')
      buf = data.buf
    } else {
      if (!isSafeUrl(src)) throw new Error('unsafe src')
      const res = await fetch(src, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'Carma-Image/1.0' },
      })
      if (!res.ok) throw new Error(`upstream ${res.status}`)
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) {
        throw new Error(`unexpected content-type ${ct}`)
      }
      const ab = await res.arrayBuffer()
      if (ab.byteLength > MAX_BYTES_IN) throw new Error('source too large')
      buf = Buffer.from(ab)
    }
  } catch {
    // Graceful degrade — redirect to the original src so the article still renders.
    if (/^https?:\/\//i.test(src)) return NextResponse.redirect(src, { status: 302 })
    return new NextResponse('image fetch failed', { status: 502 })
  }

  // Transform with sharp. We use rotate() to honour EXIF orientation so portrait
  // phone photos don't render sideways.
  let out: Buffer
  let outMime: string
  try {
    const pipeline = sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true, fastShrinkOnLoad: true })

    if (fmt === 'avif') {
      out = await pipeline.avif({ quality, effort: 4 }).toBuffer()
      outMime = 'image/avif'
    } else if (fmt === 'jpeg') {
      out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
      outMime = 'image/jpeg'
    } else if (fmt === 'png') {
      out = await pipeline.png({ quality, compressionLevel: 9 }).toBuffer()
      outMime = 'image/png'
    } else {
      out = await pipeline.webp({ quality, effort: 4 }).toBuffer()
      outMime = 'image/webp'
    }
  } catch {
    // Some sources (SVG/GIF animations) defeat the pipeline — fall back to the
    // original URL so the page still works.
    if (/^https?:\/\//i.test(src)) return NextResponse.redirect(src, { status: 302 })
    return new NextResponse('image transform failed', { status: 500 })
  }

  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      'Content-Type': outMime,
      'Content-Length': String(out.length),
      // Long-lived, immutable. The URL fully describes the variant (w/fmt/q) so
      // the same params always produce the same bytes. s-maxage is REQUIRED for
      // the Vercel edge cache — with max-age alone every visitor's every image
      // invoked this sharp lambda (the #1 mobile slowness, fixed 2026-07-05).
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'Vary': 'Accept',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
