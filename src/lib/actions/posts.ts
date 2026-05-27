'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { DEFAULT_LOCALE, normalizeLocale } from '@/lib/i18n/config'
import { translateFieldsWithClaude, type TranslatableFields } from '@/lib/i18n/translate'

type ActionResult = { error?: string }
type CreateResult = ActionResult & { id?: string }

// A single non-default-locale variant of an article. The default locale lives in
// the flat columns (title/slug/content/…); these overlay it for other languages.
export type LocalizedContent = {
  title: string
  slug?: string
  content: object
  excerpt?: string
  seo_title?: string
  seo_description?: string
}

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
  seo_canonical?: string
  seo_noindex?: boolean
  focus_keyword?: string
  author_name?: string
  is_published?: boolean
  created_at?: string // ISO — editable publish date
  default_locale?: string
  i18n?: Record<string, LocalizedContent> // non-default locale variants
}

// Postgres "undefined column" — the i18n columns aren't present until migration
// 008 runs. We retry the write without them so the CMS keeps working meanwhile.
const UNDEFINED_COLUMN = '42703'

function buildMeta(data: PostData) {
  return {
    seo_title: data.seo_title ?? '',
    seo_description: data.seo_description ?? '',
    canonical: data.seo_canonical ?? '',
    noindex: data.seo_noindex ?? false,
    focus_keyword: data.focus_keyword ?? '',
  }
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

const POSTS_PAGE_SIZE = 12

export type PostListItem = { id: string; title: string; slug: string; is_published: boolean; created_at: string }
export type PostListResult = {
  posts: PostListItem[]
  page: number
  pageCount: number
  filteredCount: number
  total: number
  published: number
  drafts: number
  error?: string
}

const EMPTY_LIST: PostListResult = { posts: [], page: 1, pageCount: 1, filteredCount: 0, total: 0, published: 0, drafts: 0 }

/**
 * Paginated, server-side post listing. Never returns more than
 * POSTS_PAGE_SIZE rows; search + status filtering happen in the database so
 * the full table is never loaded into the client.
 */
export async function listPosts(
  siteId: string,
  opts: { page?: number; q?: string; status?: 'all' | 'published' | 'draft' } = {},
): Promise<PostListResult> {
  try {
    const admin = await assertSiteAccess(siteId)
    const page = Math.max(1, Math.floor(opts.page ?? 1))
    const from = (page - 1) * POSTS_PAGE_SIZE
    const to = from + POSTS_PAGE_SIZE - 1

    let query = admin
      .from('posts')
      .select('id, title, slug, is_published, created_at', { count: 'exact' })
      .eq('site_id', siteId)

    if (opts.status === 'published') query = query.eq('is_published', true)
    if (opts.status === 'draft') query = query.eq('is_published', false)

    const term = opts.q?.trim().replace(/[,%()\\*]/g, '')
    if (term) query = query.or(`title.ilike.%${term}%,slug.ilike.%${term}%`)

    const [{ data, count, error }, totalRes, publishedRes] = await Promise.all([
      query.order('created_at', { ascending: false }).range(from, to),
      admin.from('posts').select('id', { count: 'exact', head: true }).eq('site_id', siteId),
      admin.from('posts').select('id', { count: 'exact', head: true }).eq('site_id', siteId).eq('is_published', true),
    ])

    if (error) return { ...EMPTY_LIST, page, error: error.message }

    const filteredCount = count ?? 0
    const total = totalRes.count ?? 0
    const published = publishedRes.count ?? 0
    return {
      posts: (data ?? []) as PostListItem[],
      page,
      pageCount: Math.max(1, Math.ceil(filteredCount / POSTS_PAGE_SIZE)),
      filteredCount,
      total,
      published,
      drafts: total - published,
    }
  } catch (err) {
    return { ...EMPTY_LIST, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
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

    const baseRow = {
      site_id: siteId,
      title: trimmed,
      slug,
      content: data.content,
      meta: buildMeta(data),
      excerpt: data.excerpt ?? null,
      featured_image: data.featured_image ?? null,
      categories: data.categories ?? [],
      tags: data.tags ?? [],
      seo_title: data.seo_title ?? null,
      seo_description: data.seo_description ?? null,
      author_name: data.author_name ?? null,
      is_published: data.is_published ?? false,
      ...(data.created_at ? { created_at: data.created_at } : {}),
    }
    const i18nRow = { ...baseRow, i18n: data.i18n ?? {}, default_locale: data.default_locale ?? DEFAULT_LOCALE }

    let { data: row, error } = await admin.from('posts').insert(i18nRow).select('id').single()
    if (error?.code === UNDEFINED_COLUMN) {
      ;({ data: row, error } = await admin.from('posts').insert(baseRow).select('id').single())
    }

    if (error) {
      if (error.code === '23505') return { error: 'Ja existeix un article amb aquest slug.' }
      return { error: error.message }
    }
    if (!row) return { error: 'No s\'ha pogut crear l\'article' }

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

    const baseRow = {
      title: trimmed,
      slug,
      content: data.content,
      meta: buildMeta(data),
      excerpt: data.excerpt ?? null,
      featured_image: data.featured_image ?? null,
      categories: data.categories ?? [],
      tags: data.tags ?? [],
      seo_title: data.seo_title ?? null,
      seo_description: data.seo_description ?? null,
      author_name: data.author_name ?? null,
      is_published: data.is_published ?? false,
      ...(data.created_at ? { created_at: data.created_at } : {}),
    }
    const i18nRow = { ...baseRow, i18n: data.i18n ?? {}, default_locale: data.default_locale ?? DEFAULT_LOCALE }

    let { error } = await admin.from('posts').update(i18nRow).eq('id', postId).eq('site_id', siteId)
    if (error?.code === UNDEFINED_COLUMN) {
      ;({ error } = await admin.from('posts').update(baseRow).eq('id', postId).eq('site_id', siteId))
    }

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

/**
 * Translate one article's localized fields from one locale to another with
 * Claude, preserving the HTML/block structure. Gated to site members; the result
 * is returned to the editor for review before it's saved.
 */
export async function translateArticle(
  siteId: string,
  fromLocale: string,
  toLocale: string,
  fields: TranslatableFields,
): Promise<ActionResult & { result?: TranslatableFields }> {
  try {
    await assertSiteAccess(siteId)
    const from = normalizeLocale(fromLocale)
    const to = normalizeLocale(toLocale)
    if (from === to) return { error: "L'idioma d'origen i el de destí són el mateix" }
    const result = await translateFieldsWithClaude(from, to, fields)
    return { result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error de traducció' }
  }
}
