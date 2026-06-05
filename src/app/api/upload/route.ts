// Editor media upload → Supabase Storage.
//
// Pasted/dropped/picked images used to be embedded as base64 data-URIs inside
// the post content, which broke the renderer (multi-MB /api/img URLs) and bloated
// the database. This route uploads the file to the public `post-media` bucket and
// returns a clean URL, so the content only ever stores a short link and the
// /api/img optimizer can do its job.
//
// Auth: the user must be signed in AND have access to the site (superadmin or a
// member via site_users) — same rule as the Theme/Posts server actions.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'post-media'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB per image
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg',
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  const siteId = request.nextUrl.searchParams.get('siteId')?.trim()
  if (!siteId) return NextResponse.json({ error: 'Falta el site' }, { status: 400 })

  // Access: superadmin OR a member of this site (service-role check, RLS-safe).
  const admin = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users').select('user_id')
      .eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    return NextResponse.json({ error: 'Petició invàlida' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'Falta el fitxer' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Només imatges' }, { status: 415 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imatge supera els 8 MB' }, { status: 413 })

  const ext = EXT[file.type] ?? 'bin'
  const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const path = `${siteId}/${rand}.${ext}`

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) return NextResponse.json({ error: `No s'ha pogut pujar: ${error.message}` }, { status: 500 })

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
