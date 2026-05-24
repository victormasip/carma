import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Public headless API — consumed cross-origin from client websites (browser
// fetch + server-side). Auth is per-request via the x-api-key header (no
// cookies), so a wildcard CORS origin is safe.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
}

function json(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: CORS_HEADERS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

type AuthOk = {
  site: { id: string; name: string }
  supabase: ReturnType<typeof createAdminClient>
}
type AuthErr = { error: NextResponse }

async function authenticate(request: NextRequest): Promise<AuthOk | AuthErr> {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) {
    return { error: json({ error: 'Falta la capçalera x-api-key' }, { status: 401 }) }
  }

  const supabase = createAdminClient()
  const { data: site, error } = await supabase
    .from('sites')
    .select('id, name')
    .eq('api_key', apiKey)
    .single()

  if (error || !site) {
    return { error: json({ error: 'Clau API no vàlida' }, { status: 403 }) }
  }

  return { site, supabase }
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if ('error' in auth) return auth.error
  const { site, supabase } = auth

  const url = new URL(request.url)
  const slug = url.searchParams.get('slug')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)

  if (slug) {
    const { data, error } = await supabase
      .from('posts')
      .select('id, title, slug, content, meta, is_published, created_at, updated_at')
      .eq('site_id', site.id)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()

    if (error) {
      console.error('[GET /api/v1/posts] single post error:', error.message)
      return json({ error: "Error obtenint l'article" }, { status: 500 })
    }
    if (!data) {
      return json({ error: 'Article no trobat' }, { status: 404 })
    }
    return json({ post: data })
  }

  const { data, error } = await supabase
    .from('posts')
    .select('id, title, slug, content, meta, is_published, created_at, updated_at')
    .eq('site_id', site.id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GET /api/v1/posts] list error:', error.message)
    return json({ error: 'Error obtenint els articles' }, { status: 500 })
  }

  return json({ site: site.name, count: data.length, posts: data })
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if ('error' in auth) return auth.error
  const { site, supabase } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Cos JSON no vàlid' }, { status: 400 })
  }

  const legacyPosts = Array.isArray(body) ? body : [body]

  if (legacyPosts.length === 0) {
    return json({ error: "No s'han enviat dades per importar" }, { status: 400 })
  }

  const postsToInsert = legacyPosts.map((post: Record<string, unknown>) => ({
    site_id: site.id,
    title: typeof post.title === 'string' ? post.title : 'Article sense títol',
    slug:
      typeof post.slug === 'string' && post.slug.length > 0
        ? post.slug
        : `article-${Math.random().toString(36).slice(2, 11)}`,
    content: post.content ?? {},
    meta: post.meta ?? {},
    is_published: typeof post.is_published === 'boolean' ? post.is_published : true,
  }))

  const { data, error } = await supabase
    .from('posts')
    .insert(postsToInsert)
    .select('id, title, slug')

  if (error) {
    if (error.code === '23505') {
      return json({ error: 'Hi ha slugs duplicats que violen la unicitat al lloc.' }, { status: 409 })
    }
    console.error('[POST /api/v1/posts] import error:', error.message)
    return json({ error: 'Error durant la importació' }, { status: 500 })
  }

  return json(
    {
      success: true,
      message: `S'han importat correctament ${data?.length ?? 0} articles.`,
      imported_count: data?.length ?? 0,
      posts: data,
    },
    { status: 201 },
  )
}
