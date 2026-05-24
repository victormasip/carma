import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildListingPage } from '@/lib/render/theme'
import type { ThemeData } from '@/lib/actions/theme'

// Builds the SAME HTML the public /render route would serve, using the site's
// real published posts, from the theme currently being edited (possibly unsaved).
// Powers the dashboard preview canvas so "what you preview is what ships".
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })

  let body: { siteId?: string; theme?: ThemeData }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  const siteId = body.siteId
  if (!siteId) return NextResponse.json({ error: 'siteId és obligatori' }, { status: 400 })

  const admin = createAdminClient()
  const { data: site } = await admin.from('sites').select('id, name').eq('id', siteId).single()
  if (!site) return NextResponse.json({ error: 'Lloc no trobat' }, { status: 404 })

  const { data: posts } = await admin
    .from('posts')
    .select('id, title, slug, content, excerpt, featured_image, categories, tags, author_name, created_at, is_published')
    .eq('site_id', siteId)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(24)

  const theme = body.theme ?? null
  const html = buildListingPage(
    theme && {
      extracted_head: theme.extracted_head ?? null,
      extracted_header: theme.extracted_header ?? null,
      extracted_footer: theme.extracted_footer ?? null,
      extracted_scripts: theme.extracted_scripts ?? null,
      design_tokens: theme.design_tokens ?? null,
    },
    site.name,
    siteId,
    posts ?? [],
  )

  return NextResponse.json({ html, postCount: posts?.length ?? 0 })
}
