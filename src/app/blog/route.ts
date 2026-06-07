import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Stable public alias for the Carma showcase blog. The landing links here; this
// resolves the seeded "Carma" site and forwards to its rendered blog, so the URL
// never depends on the generated site UUID. If the seed (migration 018) hasn't
// run yet, fall back to the marketing home.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('sites')
      .select('id')
      .eq('name', 'Carma')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      return NextResponse.redirect(new URL(`/render/${data.id}`, origin))
    }
  } catch {
    /* fall through */
  }
  return NextResponse.redirect(new URL('/', origin))
}
