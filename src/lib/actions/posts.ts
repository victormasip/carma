'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { DEFAULT_LOCALE, LOCALES, normalizeLocale } from '@/lib/i18n/config'
import { translateFieldsWithClaude, type TranslatableFields } from '@/lib/i18n/translate'
import { analyzeWriting, type WritingAnalysis } from '@/lib/writing/coach'
import { harvestSiteBrief, generateArticle, type GeneratedArticle } from '@/lib/writing/generate'

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

// Every slug a post claims — the flat (default-locale) slug plus every
// per-locale i18n slug. Since the render route resolves /render/<site>/<slug>
// to (post, locale) by ANY matching slug, two different posts in the same site
// can never share a slug across ANY locale, or one shadows the other.
function collectPostSlugs(data: PostData, fallbackSlug: string): string[] {
  const out = new Set<string>()
  const flat = (data.slug?.trim() || fallbackSlug).trim()
  if (flat) out.add(flat)
  for (const v of Object.values(data.i18n ?? {})) {
    const s = v?.slug?.trim()
    if (s) out.add(s)
  }
  return [...out]
}

// Returns the first colliding slug found on a different post, or null if clear.
// Single round-trip across the flat slug + every locale's i18n slug. Gracefully
// degrades to the flat-only check before migration 008.
async function findSlugConflict(
  admin: ReturnType<typeof createAdminClient>,
  siteId: string,
  excludePostId: string | null,
  slugs: string[],
): Promise<string | null> {
  if (slugs.length === 0) return null
  const ors: string[] = []
  for (const s of slugs) {
    ors.push(`slug.eq.${s}`)
    for (const loc of LOCALES) ors.push(`i18n->${loc}->>slug.eq.${s}`)
  }
  let q = admin.from('posts').select('id, slug, i18n').eq('site_id', siteId).or(ors.join(','))
  if (excludePostId) q = q.neq('id', excludePostId)
  const { data, error } = await q.limit(1)

  if (error?.code === UNDEFINED_COLUMN) {
    // Pre-migration-008: only the flat column exists. Check it directly.
    let q2 = admin.from('posts').select('id, slug').eq('site_id', siteId).in('slug', slugs)
    if (excludePostId) q2 = q2.neq('id', excludePostId)
    const r = await q2.limit(1)
    if (r.data && r.data.length > 0) return r.data[0].slug
    return null
  }
  if (error || !data || data.length === 0) return null

  const want = new Set(slugs)
  const row = data[0] as { slug?: string; i18n?: Record<string, { slug?: string }> | null }
  if (row.slug && want.has(row.slug)) return row.slug
  for (const loc of LOCALES) {
    const ls = row.i18n?.[loc]?.slug
    if (ls && want.has(ls)) return ls
  }
  return null
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

// Same access check as assertSiteAccess, but ALSO reports the caller's premium
// tier (today: premium === superadmin) — for the cost-heavy AI features that must
// stay behind the paywall. Returns the admin client + isPremium in one pass.
async function assertPremiumAccess(siteId: string): Promise<{ admin: ReturnType<typeof createAdminClient>; isPremium: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()
  const isPremium = profile?.role === 'superadmin'
  if (!isPremium) {
    const { data: membership } = await admin
      .from('site_users').select('user_id')
      .eq('site_id', siteId).eq('user_id', user.id).single()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }
  return { admin, isPremium }
}

const POSTS_PAGE_SIZE = 12

export type PostListItem = { id: string; title: string; slug: string; is_published: boolean; created_at: string; featured_image: string | null }
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
      .select('id, title, slug, is_published, created_at, featured_image', { count: 'exact' })
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

// Push content changes to the LIVE public render. The /render routes are
// force-dynamic (always re-read the DB) so the owner sees edits immediately;
// revalidating the path additionally clears any Next data-cache entry keyed to it.
function revalidateRender(siteId: string) {
  revalidatePath(`/render/${siteId}`)
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

    // Cross-locale slug uniqueness: catch conflicts BEFORE the DB error so we
    // can name the colliding slug. (The DB's UNIQUE(site_id, slug) only catches
    // flat-slug clashes; localized-slug clashes need an app-level check.)
    const conflict = await findSlugConflict(admin, siteId, null, collectPostSlugs(data, slug))
    if (conflict) return { error: `El slug «${conflict}» ja existeix en aquest lloc. Cada idioma necessita un slug únic dins el lloc.` }

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
    revalidateRender(siteId)
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

    // Cross-locale uniqueness — same rules as createPost, excluding this post.
    const conflict = await findSlugConflict(admin, siteId, postId, collectPostSlugs(data, slug))
    if (conflict) return { error: `El slug «${conflict}» ja existeix en un altre article d'aquest lloc.` }

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
    revalidateRender(siteId)
    revalidatePath(`/dashboard/sites/${siteId}/posts/${postId}/edit`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/**
 * Partial, single-round-trip update of an article's "surface" fields, for the
 * INLINE editing in the post list (title / slug / featured image) — no need to
 * open the full editor. Only the keys present in `fields` are written.
 *
 *  · title — trimmed; rejected if it would become empty.
 *  · slug  — normalised to a safe slug; a blank value regenerates it from the
 *            title; checked for cross-locale conflicts (same rule as updatePost).
 *  · featured_image — a public URL, or null to clear the thumbnail.
 *
 * Returns the canonical `slug` when it was touched, so the optimistic client can
 * reconcile (e.g. "Hello World" → "hello-world").
 */
export async function updatePostFields(
  postId: string,
  siteId: string,
  fields: { title?: string; slug?: string; featured_image?: string | null; created_at?: string },
): Promise<ActionResult & { slug?: string; created_at?: string }> {
  try {
    const admin = await assertSiteAccess(siteId)
    const patch: Record<string, unknown> = {}

    if (fields.title !== undefined) {
      const t = fields.title.trim()
      if (!t) return { error: 'El títol no pot estar buit' }
      patch.title = t
    }

    let finalDate: string | undefined
    if (fields.created_at !== undefined) {
      const d = new Date(fields.created_at)
      if (Number.isNaN(d.getTime())) return { error: 'Data no vàlida' }
      patch.created_at = d.toISOString()
      finalDate = patch.created_at as string
    }

    let finalSlug: string | undefined
    if (fields.slug !== undefined) {
      let slug = fields.slug.trim()
      if (!slug) {
        // Blank → regenerate from the (new or stored) title.
        const stored = await admin.from('posts').select('title').eq('id', postId).eq('site_id', siteId).single()
        slug = generateSlug((patch.title as string | undefined) ?? stored.data?.title ?? '')
      } else {
        slug = generateSlug(slug)
      }
      const conflict = await findSlugConflict(admin, siteId, postId, [slug])
      if (conflict) return { error: `El slug «${conflict}» ja existeix en un altre article d'aquest lloc.` }
      patch.slug = slug
      finalSlug = slug
    }

    if (fields.featured_image !== undefined) {
      patch.featured_image = fields.featured_image // string URL or null
    }

    if (Object.keys(patch).length === 0) return {}

    const { error } = await admin.from('posts').update(patch).eq('id', postId).eq('site_id', siteId)
    if (error) {
      if (error.code === '23505') return { error: 'Ja existeix un article amb aquest slug.' }
      return { error: error.message }
    }

    revalidatePath(`/dashboard/sites/${siteId}`)
    revalidateRender(siteId)
    revalidatePath(`/dashboard/sites/${siteId}/posts/${postId}/edit`)
    return { ...(finalSlug ? { slug: finalSlug } : {}), ...(finalDate ? { created_at: finalDate } : {}) }
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
    revalidateRender(siteId)
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
    revalidateRender(siteId)
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
    revalidateRender(siteId)
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
    revalidateRender(siteId)
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

/**
 * AI Writing Coach — analyzes an article's body in its own language and returns
 * a readability score + concrete rewrite suggestions. Premium feature; gated by
 * site access (the editor's UI also Premium-gates the trigger button).
 */
export async function analyzeArticleWriting(
  siteId: string,
  locale: string,
  fields: { title: string; html: string },
): Promise<ActionResult & { result?: WritingAnalysis }> {
  try {
    await assertSiteAccess(siteId)
    const loc = normalizeLocale(locale)
    const result = await analyzeWriting({ title: fields.title, html: fields.html, locale: loc })
    return { result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error analitzant l'article" }
  }
}

/**
 * "Magic SEO Article" — analyze the site's URL, deduce its niche/tone, and
 * autonomously generate ONE complete, ready-to-publish article. Gated to site
 * members (the editor UI additionally Premium-gates the trigger for free clients).
 *
 * The URL is the site's captured reference URL; the caller may pass an override
 * (e.g. a brand-new site that hasn't been captured yet). The article is written
 * in the requested locale (defaults to the site's default locale).
 */
export async function generateSeoArticle(
  siteId: string,
  opts: { url?: string; locale?: string } = {},
): Promise<ActionResult & { result?: GeneratedArticle }> {
  try {
    // PREMIUM GATE (authoritative backstop; the UI also gates): the "Magic SEO
    // Article" runs an expensive Opus call, so a free member must never be able
    // to trigger it and burn Anthropic credits. We bail BEFORE any LLM work.
    const { admin, isPremium } = await assertPremiumAccess(siteId)
    if (!isPremium) {
      return { error: 'L’article SEO amb IA és una funció Premium. Passa a Premium per generar articles automàticament.' }
    }

    const { data: site } = await admin.from('sites').select('id, name').eq('id', siteId).single()
    if (!site) return { error: 'Site no trobat' }

    // Read the captured reference URL + the site's default locale in one go.
    // 42703-safe: retry without the i18n column if the migration hasn't run.
    let themeRow: { reference_url?: string | null; default_locale?: string | null } | null = null
    {
      const full = await admin
        .from('site_themes').select('reference_url, default_locale').eq('site_id', siteId).maybeSingle()
      if (full.error?.code === UNDEFINED_COLUMN) {
        const base = await admin
          .from('site_themes').select('reference_url').eq('site_id', siteId).maybeSingle()
        themeRow = base.data
      } else {
        themeRow = full.data
      }
    }

    // Reference URL: explicit override → captured reference_url.
    const url = ((opts.url ?? '').trim() || (themeRow?.reference_url ?? '').trim())
    if (!/^https?:\/\//i.test(url)) {
      return { error: "Cal una URL del lloc per generar l'article. Captura primer el tema o introdueix la URL del teu web." }
    }

    // Effective locale: requested → site default → platform default.
    const locale = normalizeLocale(opts.locale ?? themeRow?.default_locale, DEFAULT_LOCALE)

    // Existing categories on this blog (so the model can reuse them).
    const existingCategories = new Set<string>()
    const { data: catRows } = await admin
      .from('posts').select('categories').eq('site_id', siteId).limit(60)
    for (const row of catRows ?? []) {
      for (const c of (row as { categories?: string[] | null }).categories ?? []) {
        if (c && existingCategories.size < 24) existingCategories.add(c)
      }
    }

    const brief = await harvestSiteBrief(url, site.name, locale)
    const result = await generateArticle(brief, [...existingCategories])
    return { result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generant l'article" }
  }
}

/**
 * One-shot onboarding helper: generate the "Magic SEO Article" from the site's
 * niche AND create it as a draft, returning the new post id so the UI can drop the
 * user straight into the editor to review and publish. This powers the self-serve
 * "no blog found → create one for free with AI" path. Member-gated via the
 * underlying actions; `url` defaults to the site's captured reference URL.
 */
export async function generateAndCreateArticle(
  siteId: string,
  opts: { url?: string; locale?: string; publish?: boolean } = {},
): Promise<ActionResult & { id?: string; niche?: string; strategy?: string }> {
  const gen = await generateSeoArticle(siteId, { url: opts.url, locale: opts.locale })
  if (gen.error || !gen.result) return { error: gen.error ?? "No s'ha pogut generar l'article" }
  const a = gen.result
  const created = await createPost(siteId, {
    title: a.title,
    slug: a.slug,
    content: { html: a.contentHtml },
    excerpt: a.excerpt,
    categories: a.categories,
    tags: a.tags,
    seo_title: a.seoTitle,
    seo_description: a.seoDescription,
    focus_keyword: a.focusKeyword,
    is_published: opts.publish ?? false,
    default_locale: normalizeLocale(opts.locale, DEFAULT_LOCALE),
  })
  if (created.error || !created.id) return { error: created.error ?? "No s'ha pogut crear l'article" }
  return { id: created.id, niche: a.niche, strategy: a.strategy }
}
