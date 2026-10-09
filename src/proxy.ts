import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    {
      // Tot menys: assets de _next, favicon, imatges, Headless API públic
      // (autenticat per x-api-key), rutes públiques de render i la transformació
      // d'imatges (sense auth, cachejada per CDN).
      source: '/((?!_next/static|_next/image|favicon.ico|api/v1|api/img|render/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
      // Ni els PREFETCH del router (W1). Cada <Link> visible en demana un, i cada
      // un costava un getUser() — una volta a Supabase Auth — per res: un prefetch
      // només vol l'esquelet prerenderitzat, i la navegació de debò torna a passar
      // per aquí (sessió, redireccions) abans de mostrar cap dada. Next amaga
      // aquestes capçaleres dins del proxy; només el matcher les veu.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
