'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type ActionResult = { error?: string }
type CreateResult = ActionResult & { id?: string }

export type PostData = {
  title: string
  slug?: string
  content: object
  excerpt?: string
  featured_image?: string
  categories?: string[]
  tags?: string[]
  seo_title?: string
  seo_description?: string
  author_name?: string
  is_published?: boolean
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
  return base || `article-${Date.now()}`
}

async function assertSiteAccess(siteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const admin = createAdminClient()

  if (profile?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users')
      .select('user_id')
      .eq('site_id', siteId)
      .eq('user_id', user.id)
      .single()

    if (!membership) throw new Error('Accés denegat a aquest site')
  }

  return admin
}

export async function createPost(
  siteId: string,
  data: PostData,
): Promise<CreateResult> {
  try {
    const admin = await assertSiteAccess(siteId)
    const trimmed = data.title.trim()
    if (!trimmed) return { error: 'El títol és obligatori' }

    const slug = data.slug?.trim() ? data.slug.trim() : generateSlug(trimmed)

    const { data: row, error } = await admin
      .from('posts')
      .insert({
        site_id: siteId,
        title: trimmed,
        slug,
        content: data.content,
        meta: {
          seo_title: data.seo_title ?? '',
          seo_description: data.seo_description ?? '',
        },
        excerpt: data.excerpt ?? null,
        featured_image: data.featured_image ?? null,
        categories: data.categories ?? [],
        tags: data.tags ?? [],
        seo_title: data.seo_title ?? null,
        seo_description: data.seo_description ?? null,
        author_name: data.author_name ?? null,
        is_published: data.is_published ?? false,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') return { error: 'Ja existeix un article amb aquest slug.' }
      return { error: error.message }
    }

    revalidatePath(`/dashboard/sites/${siteId}`)
    return { id: row.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function updatePost(
  postId: string,
  siteId: string,
  data: PostData,
): Promise<ActionResult> {
  try {
    const admin = await assertSiteAccess(siteId)
    const trimmed = data.title.trim()
    if (!trimmed) return { error: 'El títol és obligatori' }

    const slug = data.slug?.trim() ? data.slug.trim() : generateSlug(trimmed)

    const { error } = await admin
      .from('posts')
      .update({
        title: trimmed,
        slug,
        content: data.content,
        excerpt: data.excerpt ?? null,
        featured_image: data.featured_image ?? null,
        categories: data.categories ?? [],
        tags: data.tags ?? [],
        seo_title: data.seo_title ?? null,
        seo_description: data.seo_description ?? null,
        author_name: data.author_name ?? null,
        is_published: data.is_published ?? false,
      })
      .eq('id', postId)
      .eq('site_id', siteId)

    if (error) {
      if (error.code === '23505') return { error: 'Ja existeix un article amb aquest slug.' }
      return { error: error.message }
    }

    revalidatePath(`/dashboard/sites/${siteId}`)
    revalidatePath(`/dashboard/sites/${siteId}/posts/${postId}/edit`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function deletePost(postId: string, siteId: string): Promise<ActionResult> {
  try {
    const admin = await assertSiteAccess(siteId)
    const { error } = await admin
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('site_id', siteId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function togglePublish(
  postId: string,
  siteId: string,
  isPublished: boolean,
): Promise<ActionResult> {
  try {
    const admin = await assertSiteAccess(siteId)
    const { error } = await admin
      .from('posts')
      .update({ is_published: isPublished })
      .eq('id', postId)
      .eq('site_id', siteId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function togglePublishBulk(
  siteId: string,
  postIds: string[],
  isPublished: boolean,
): Promise<ActionResult & { count?: number }> {
  try {
    if (postIds.length === 0) return { count: 0 }
    const admin = await assertSiteAccess(siteId)
    const { data, error } = await admin
      .from('posts')
      .update({ is_published: isPublished })
      .eq('site_id', siteId)
      .in('id', postIds)
      .select('id')

    if (error) return { error: error.message }
    revalidatePath(`/dashboard/sites/${siteId}`)
    return { count: data?.length ?? 0 }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function deletePostsBulk(
  siteId: string,
  postIds: string[],
): Promise<ActionResult & { count?: number }> {
  try {
    if (postIds.length === 0) return { count: 0 }
    const admin = await assertSiteAccess(siteId)
    const { data, error } = await admin
      .from('posts')
      .delete()
      .eq('site_id', siteId)
      .in('id', postIds)
      .select('id')

    if (error) return { error: error.message }
    revalidatePath(`/dashboard/sites/${siteId}`)
    return { count: data?.length ?? 0 }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
