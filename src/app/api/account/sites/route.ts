import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Account-scoped headless API — lets the Carma WordPress plugin (and any first-
// party integration) resolve an API token to the blog it belongs to, so the
// plugin can confirm/auto-pick the right site instead of the user hand-copying a
// site ID. Powers T6 of the Headless/WordPress pivot (docs/plans/2026-06-09-…).
//
// Auth is per-request via the x-api-key header — the SAME per-site key used by
// /api/v1/posts (there is no separate account token in the schema). No cookies,
// so a wildcard CORS origin is safe.
//
// PRIVACY (critical): the API key is a PER-SITE credential. This endpoint returns
// ONLY the single site that key belongs to. It deliberately does NOT join across
// `site_users` to surface "all of the account's sites" — a site can have multiple
// members, so that would leak a co-owner's other (private) blogs to anyone holding
// a shared site's key. The key gates exactly one site; the response exposes exactly
// one site. The list shape is kept for the plugin (and forward-compat), but it is
// always 0 or 1 element.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
  'Access-Control-Max-Age': '86400',
}

function json(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: CORS_HEADERS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/** Read the token from x-api-key, or an `Authorization: Bearer <token>` header. */
function readToken(request: NextRequest): string {
  const direct = request.headers.get('x-api-key')
  if (direct && direct.trim()) return direct.trim()

  const auth = request.headers.get('authorization')
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) return m[1].trim()
  }
  return ''
}

export async function GET(request: NextRequest) {
  const token = readToken(request)
  if (!token) {
    return json({ error: 'Falta la capçalera x-api-key' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Resolve the token to EXACTLY the one site it belongs to — never any other
  // blog (see the PRIVACY note above). `subdomain` only exists after migration
  // 021 → 42703-safe fallback (mirrors src/app/dashboard/page.tsx).
  let siteRes = await supabase
    .from('sites')
    .select('id, name, subdomain')
    .eq('api_key', token)
    .maybeSingle()
  if (siteRes.error?.code === '42703') {
    siteRes = (await supabase
      .from('sites')
      .select('id, name')
      .eq('api_key', token)
      .maybeSingle()) as typeof siteRes
  }
  if (siteRes.error) {
    console.error('[GET /api/account/sites] lookup error:', siteRes.error.message)
    return json({ error: 'Error de servidor' }, { status: 500 })
  }
  if (!siteRes.data) {
    return json({ error: 'Clau API no vàlida' }, { status: 403 })
  }

  const s = siteRes.data
  const subdomain = (s as { subdomain?: string | null }).subdomain ?? null
  const sites = [
    {
      id: s.id as string,
      name: (s.name as string) ?? '',
      subdomain,
      // The value the plugin stores as its Site ID: prefer the human-readable
      // subdomain label, fall back to the UUID. Both are accepted by /embed and
      // /render, so either works as a stable identifier.
      label: subdomain || (s.id as string),
    },
  ]

  return json({ count: sites.length, sites })
}
