import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth/PKCE callback for Supabase auth links (password recovery, magic links,
 * email confirmations). The PKCE `code_verifier` is stored as an HTTP-only
 * cookie by @supabase/ssr at request time, so the exchange MUST happen on the
 * server — the browser client can't read that cookie.
 *
 * Email links should redirect here with `?code=<pkce>&next=<path-to-land-on>`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const errorDescription = searchParams.get('error_description') ?? searchParams.get('error')

  // Build the destination URL with any error pre-attached.
  const failure = (msg: string) => {
    const url = new URL(next, origin)
    url.searchParams.set('error', msg)
    return NextResponse.redirect(url)
  }

  if (errorDescription) return failure(errorDescription)
  if (!code) return failure('Missing code parameter')

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return failure(error.message)

  return NextResponse.redirect(new URL(next, origin))
}
