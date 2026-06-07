import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildListingPage } from '@/lib/render/theme'
import { getDummyPosts, LAB_SITE_ID, LAB_SITE_NAME } from '@/lib/grabber-lab/dummy'
import { normalizeLocale } from '@/lib/i18n/config'
import type { DesignTokens } from '@/lib/scrape/tokens'
import type { BlogSignature } from '@/lib/scrape/blogDetect'
import type { LabPreviewRequest } from '@/lib/grabber-lab/types'

// buildListingPage / node-html-parser need the Node.js runtime.
export const runtime = 'nodejs'

// Drop the listing's analytics beacon — a Lab preview must never pollute
// page_views (and the fake site id wouldn't resolve anyway). Removes only the
// inline <script> that talks to /api/track; runtime/contrast-guard scripts (also
// attribute-less <script> tags, but without /api/track) are preserved.
function stripTracking(html: string): string {
  return html.replace(
    /<script>(?:(?!<\/script>)[\s\S])*?\/api\/track(?:(?!<\/script>)[\s\S])*?<\/script>/gi,
    '',
  )
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

const PLACEHOLDER = `<!doctype html><html lang="ca"><head><meta charset="utf-8">
<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;
font-family:system-ui,sans-serif;color:#9ca3af;background:#0b0d10;text-align:center;padding:2rem}</style></head>
<body><p>Encara no hi ha cap document HTML enganxat.<br>Munta el teu HTML «perfecte» i apareixerà aquí.</p></body></html>`

export async function POST(request: NextRequest) {
  // ── Superadmin gate (same contract as /api/theme/analyze) ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })

  let body: LabPreviewRequest
  try { body = (await request.json()) as LabPreviewRequest } catch {
    return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 })
  }

  // ── Ground-truth document: render the operator's hand-built HTML verbatim ──
  if (body.mode === 'document') {
    const doc = (body.html ?? '').trim()
    return htmlResponse(doc || PLACEHOLDER)
  }

  // ── Assembled render: the REAL pipeline + 10 dummy articles in the feed ──
  if (body.mode === 'assembled') {
    const t = body.theme ?? {}
    const theme = {
      extracted_head: t.extracted_head ?? null,
      extracted_header: t.extracted_header ?? null,
      extracted_footer: t.extracted_footer ?? null,
      extracted_body_attrs: t.extracted_body_attrs ?? null,
      design_tokens: (t.design_tokens ?? {}) as Partial<DesignTokens>,
      font_links: t.font_links ?? [],
      section_title: t.section_title ?? null,
      blog_signature: (t.blog_signature ?? null) as BlogSignature | null,
      default_locale: t.default_locale ?? null,
    }
    const locale = normalizeLocale(body.locale ?? t.default_locale ?? undefined)
    const siteName = body.siteName?.trim() || LAB_SITE_NAME
    const html = buildListingPage(theme, siteName, LAB_SITE_ID, getDummyPosts(), locale)
    return htmlResponse(stripTracking(html))
  }

  return NextResponse.json({ error: 'Mode de previsualització desconegut' }, { status: 400 })
}
