import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Tot menys: assets de _next, favicon, imatges, Headless API públic
    // (autenticat per x-api-key) i les rutes públiques de render (sense auth).
    '/((?!_next/static|_next/image|favicon.ico|api/v1|render/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
