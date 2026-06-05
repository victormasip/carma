// Live preview of a starter template — renders the SAME HTML the public blog
// would ship (real header + feed + footer, the template's tokens & fonts) with a
// set of sample posts, so the onboarding gallery shows exactly how the look
// behaves instead of an abstract mock. Served same-origin and iframed (scaled).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildListingPage } from '@/lib/render/theme'
import { getTemplate, templateChromeJson } from '@/lib/render/templates'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAMPLE = [
  { title: 'Com construir una marca que perduri en el temps', excerpt: 'Una guia pràctica sobre identitat, to de veu i consistència visual a cada punt de contacte.', cat: 'Estratègia', seed: 'carma-a' },
  { title: 'Les tendències de disseny editorial per al 2026', excerpt: 'El que ve en tipografia, color i composició per a publicacions digitals modernes.', cat: 'Disseny', seed: 'carma-b' },
  { title: 'Escriure per a humans i per a cercadors alhora', excerpt: 'SEO modern sense sacrificar la veu de la teva marca ni la qualitat editorial.', cat: 'Contingut', seed: 'carma-c' },
  { title: 'L’art de la portada: imatges que conviden a llegir', excerpt: 'Com triar i tractar la fotografia destacada perquè cada article respiri.', cat: 'Fotografia', seed: 'carma-d' },
  { title: 'Newsletter: convertir lectors en una comunitat', excerpt: 'Estratègies provades per fer créixer i fidelitzar la teva audiència.', cat: 'Creixement', seed: 'carma-e' },
  { title: 'Un sistema de color que funciona a tot arreu', excerpt: 'Paletes accessibles, coherents i fàcils de mantenir en mode clar i fosc.', cat: 'Disseny', seed: 'carma-f' },
]

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autenticat', { status: 401 })

  const sp = request.nextUrl.searchParams
  const tpl = getTemplate(sp.get('tpl') ?? '')
  if (!tpl) return new NextResponse('Plantilla desconeguda', { status: 404 })
  const name = (sp.get('name') || 'La teva marca').slice(0, 40)

  const { header, footer } = templateChromeJson(tpl, name)
  const theme = {
    extracted_header: header,
    extracted_footer: footer,
    design_tokens: tpl.tokens,
    section_title: tpl.sectionTitle,
    font_links: tpl.fontLinks,
    default_locale: DEFAULT_LOCALE,
  }

  const posts = SAMPLE.map((s, i) => ({
    id: String(i),
    title: s.title,
    slug: `demo-${i}`,
    content: { html: '' },
    excerpt: s.excerpt,
    featured_image: `https://picsum.photos/seed/${s.seed}/900/560`,
    categories: [s.cat],
    tags: [] as string[],
    author_name: name,
    created_at: new Date(Date.now() - i * 3 * 86_400_000).toISOString(),
    is_published: true,
  }))

  const html = buildListingPage(theme, name, 'preview', posts, DEFAULT_LOCALE)
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, max-age=120' },
  })
}
