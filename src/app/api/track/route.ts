// Analytics beacon — records ONE page view per real browser load.
//
// The public render documents embed a tiny beacon that POSTs here on load. Doing
// it client-side (rather than counting in the render route) means views are
// counted even when the HTML is served from the CDN cache, and bots that don't
// run JS never reach us. We still drop known crawler UAs defensively.
//
// Open + cookieless by design: anyone can POST a view for a site (it's public
// traffic). We validate shape, drop bots, derive a privacy-safe daily visitor
// hash, and insert via the service role. Errors are swallowed — analytics must
// never affect the page.

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBotUA, clientIp, visitorHash, referrerHost, isUuid, type ViewKind } from '@/lib/analytics/track'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  // Always answer 204 — the beacon never blocks or surfaces errors to the page.
  const ok = () => new NextResponse(null, { status: 204, headers: CORS })

  try {
    const ua = request.headers.get('user-agent')
    if (isBotUA(ua)) return ok()

    // sendBeacon sends text/plain; tolerate both JSON and text bodies.
    const raw = await request.text()
    let body: Record<string, unknown>
    try { body = JSON.parse(raw) as Record<string, unknown> } catch { return ok() }

    const siteId = body.siteId
    if (!isUuid(siteId)) return ok()

    const kind: ViewKind = body.kind === 'listing' ? 'listing' : 'article'
    const postId = isUuid(body.postId) ? body.postId : null
    const path = typeof body.path === 'string' ? body.path.slice(0, 512) : ''
    const locale = typeof body.locale === 'string' ? body.locale.slice(0, 12) : null

    const ip = clientIp(request.headers)
    const hash = visitorHash(ip, ua ?? '')
    const ref = referrerHost(request.headers.get('referer'))

    const admin = createAdminClient()
    await admin.from('page_views').insert({
      site_id: siteId,
      post_id: postId,
      kind,
      path,
      locale,
      referrer_host: ref,
      visitor_hash: hash,
    })
    return ok()
  } catch {
    return ok()
  }
}
