import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { extractSubdomain } from '@/lib/sites/domain'

// A request on a tenant subdomain (`<sub>.<root>` / `<sub>.localhost`) is the
// PUBLIC blog — never the app. Serve it by rewriting onto the render route
// (`/render/<sub>`, resolved to the real site id in the handler) and skip all auth.
// Assets / API / embed / the canonical /render path pass straight through so the
// rendered page's stylesheets, image proxy, analytics beacon and internal links
// (which point at `/render/<id>/…`) keep working on the subdomain host.
function serveTenantBlog(request: NextRequest, sub: string) {
  const { pathname } = request.nextUrl
  if (
    pathname.startsWith('/render') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/embed') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next()
  }
  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? `/render/${sub}` : `/render/${sub}${pathname}`
  return NextResponse.rewrite(url)
}

export async function updateSession(request: NextRequest) {
  const sub = extractSubdomain(request.headers.get('host'))
  if (sub) return serveTenantBlog(request, sub)

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  // Public surfaces: the marketing landing (/) and the auth pages.
  const isMarketing = path === '/'
  const isAuthPage = path === '/login' || path === '/registre'
  // /admin hosts superadmin-only internal tools (e.g. the Grabber Lab); /benvinguda
  // is the post-signup provisioning hub. Both require a session like /dashboard.
  const isProtectedPage =
    path.startsWith('/dashboard') || path.startsWith('/admin') || path.startsWith('/benvinguda')

  if (!user && isProtectedPage) {
    // Bounce to login, preserving the intended destination so we land back there.
    const url = request.nextUrl.clone()
    const intended = path + (request.nextUrl.search || '')
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', intended)
    return NextResponse.redirect(url)
  }

  // Already authenticated → skip the marketing/auth pages and go to the app.
  if (user && (isMarketing || isAuthPage)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
