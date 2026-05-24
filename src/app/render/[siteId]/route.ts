import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildListingPage, buildErrorPage } from '@/lib/render/theme'

export const revalidate = 60 // ISR — re-render every 60 seconds at most

export async function GET(_request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const admin = createAdminClient()

  const { data: site } = await admin.from('sites').select('id, name').eq('id', siteId).single()
  if (!site) {
    const err = buildErrorPage('Site no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const [{ data: theme }, { data: posts }] = await Promise.all([
    admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle(),
    admin.from('posts')
      .select('id, title, slug, content, excerpt, featured_image, categories, tags, author_name, created_at, is_published')
      .eq('site_id', siteId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const html = buildListingPage(theme, site.name, siteId, posts ?? [])
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
