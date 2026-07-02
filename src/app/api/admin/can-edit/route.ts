import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userCanWriteSite } from '@/lib/auth/siteAccess'
import { isUuid, isAllowedAppOrigin } from '@/lib/sites/domain'

// Per-user check backing the render's "Edit this site" button: does the current
// session belong to an owner/superadmin of this site? Never cached (per-user), and
// it only ever returns a boolean. CORS-enabled for our own apex + tenant subdomains
// so a blog served on `<sub>.<root>` can ask the app (which holds the auth cookie)
// with a credentialed cross-origin fetch.
export const dynamic = 'force-dynamic'

// Credentialed CORS: ACAO must echo a specific allowed origin (never '*'), + ACAC.
function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Cache-Control': 'no-store', Vary: 'Origin' }
  if (origin && isAllowedAppOrigin(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Credentials'] = 'true'
  }
  return h
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors(request.headers.get('origin')),
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '600',
    },
  })
}

export async function GET(request: NextRequest) {
  const headers = cors(request.headers.get('origin'))
  const siteId = request.nextUrl.searchParams.get('site') ?? ''
  if (!isUuid(siteId)) return NextResponse.json({ canEdit: false }, { headers })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ canEdit: false }, { headers })
    const canEdit = await userCanWriteSite(supabase, user.id, siteId)
    return NextResponse.json({ canEdit }, { headers })
  } catch {
    return NextResponse.json({ canEdit: false }, { headers })
  }
}
