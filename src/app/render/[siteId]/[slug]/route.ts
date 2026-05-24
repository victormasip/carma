import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildArticlePage, buildErrorPage } from '@/lib/render/theme'

export const revalidate = 60

export async function GET(_request: NextRequest, { params }: { params: Promise<{ siteId: string; slug: string }> }) {
  const { siteId, slug } = await params
  const admin = createAdminClient()

  const { data: site } = await admin.from('sites').select('id, name').eq('id', siteId).single()
  if (!site) {
    const err = buildErrorPage('Site no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const [{ data: theme }, { data: post }] = await Promise.all([
    admin.from('site_themes').select('*').eq('site_id', siteId).maybeSingle(),
    admin.from('posts')
      .select('id, title, slug, content, excerpt, featured_image, categories, tags, author_name, created_at, is_published')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle(),
  ])

  if (!post) {
    const err = buildErrorPage('Article no trobat', 404)
    return new Response(err.html, { status: err.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const html = buildArticlePage(theme, site.name, siteId, post)
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
