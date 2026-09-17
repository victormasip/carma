// WhatsApp Agent — publish a thread's pending draft (server-only).
//
// Shared by the /review approve action (token-based) AND the WhatsApp "✅ Publicar"
// interactive button (thread-based, founder directive 2026-06-30). Tapping the
// button in WhatsApp is a postback with no token in hand, so we resolve the active
// review_token from the thread, consume it atomically (single-use, race-safe) and
// flip is_published — the exact same publish path the web page uses.

import { revalidateTag } from 'next/cache'
import { siteTag, postTag } from '@/lib/render/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { WA_TABLES } from './types'
import { markProfileStale } from './profile'
import { buildArticleUrl } from '@/app/review/[token]/shared'

type Admin = ReturnType<typeof createAdminClient>

export type ThreadPublishResult =
  | { ok: true; url: string; already?: boolean; applied?: boolean }
  | { ok: false; reason: 'no_draft' | 'expired' | 'error' }

type TokenRow = { id: string; post_id: string; site_id: string; status: string; expires_at: string; action: string }

/** Resolve the token to act on: prefer the thread's current pointer (bare "publica'l"
 *  targets current_post_id — E-13), else the newest active token on the thread. */
async function resolveThreadToken(admin: Admin, threadId: string): Promise<TokenRow | null> {
  const { data: thread } = await admin.from(WA_TABLES.threads).select('current_post_id').eq('id', threadId).maybeSingle()
  const currentPostId = (thread?.current_post_id as string | null) ?? null
  const cols = 'id, post_id, site_id, status, expires_at, action'
  if (currentPostId) {
    const { data } = await admin
      .from(WA_TABLES.reviewTokens).select(cols)
      .eq('thread_id', threadId).eq('post_id', currentPostId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (data) return data as TokenRow
  }
  const { data } = await admin
    .from(WA_TABLES.reviewTokens).select(cols)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as TokenRow | null) ?? null
}

/**
 * Apply the review a thread is awaiting. Two shapes, resolved by the token:
 *   · a draft `publish` → flip is_published, stamp the outcome loop; OR
 *   · an `apply_edit` on an already-published post → copy posts.pending_content →
 *     content IN PLACE (E-11), clearing the staging column. is_published never flips
 *     off, the slug/URL never changes.
 * Consumes the token once (single-use, race-safe). Idempotent: a second tap returns
 * the live URL. Never throws.
 */
export async function publishThreadDraft(
  admin: Admin,
  threadId: string,
  host?: string,
): Promise<ThreadPublishResult> {
  try {
    const tk = await resolveThreadToken(admin, threadId)
    if (!tk) return { ok: false, reason: 'no_draft' }

    const { data: site } = await admin.from('sites').select('subdomain').eq('id', tk.site_id).maybeSingle()
    const { data: post } = await admin.from('posts').select('slug, is_published, pending_content').eq('id', tk.post_id).maybeSingle()
    if (!post) return { ok: false, reason: 'no_draft' }
    const url = buildArticleUrl(site?.subdomain as string | null | undefined, post.slug as string, tk.site_id, host)

    const pending = (post.pending_content ?? null) as Record<string, unknown> | null
    const isApplyEdit = tk.action === 'apply_edit' || !!pending

    // Consumed token → idempotent success. (For a normal publish, an already-published
    // post is also idempotent; for an apply_edit the post is published by design, so we
    // rely on token consumption + the cleared pending_content for idempotency.)
    if (tk.status === 'consumed') return { ok: true, url, already: true }
    if (!isApplyEdit && post.is_published === true) return { ok: true, url, already: true }

    const expired = new Date(tk.expires_at).getTime() < Date.now() || tk.status === 'revoked' || tk.status === 'expired'
    if (expired || tk.status !== 'active') return { ok: false, reason: 'expired' }

    // Atomically consume: only the first tap flips active→consumed (single-use).
    const { data: consumed } = await admin
      .from(WA_TABLES.reviewTokens)
      .update({ status: 'consumed', consumed_at: new Date().toISOString() })
      .eq('id', tk.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle()
    if (!consumed) return { ok: true, url, already: true } // lost the race

    const rollback = async () => { await admin.from(WA_TABLES.reviewTokens).update({ status: 'active', consumed_at: null }).eq('id', tk.id) }

    if (isApplyEdit && pending) {
      // E-11: copy pending_content → content IN PLACE. is_published stays as-is.
      const upd: Record<string, unknown> = { pending_content: null }
      if (typeof pending.title === 'string') upd.title = pending.title
      if (typeof pending.html === 'string') upd.content = { html: pending.html }
      if (typeof pending.excerpt === 'string') upd.excerpt = pending.excerpt || null
      if (typeof pending.seo_title === 'string') upd.seo_title = pending.seo_title || null
      if (typeof pending.seo_description === 'string') upd.seo_description = pending.seo_description || null
      if (Array.isArray(pending.categories)) upd.categories = pending.categories
      if (Array.isArray(pending.tags)) upd.tags = pending.tags
      upd.meta = {
        seo_title: typeof pending.seo_title === 'string' ? pending.seo_title : '',
        seo_description: typeof pending.seo_description === 'string' ? pending.seo_description : '',
        canonical: '', noindex: false,
        focus_keyword: typeof pending.focus_keyword === 'string' ? pending.focus_keyword : '',
      }
      const { error } = await admin.from('posts').update(upd).eq('id', tk.post_id).eq('site_id', tk.site_id)
      if (error) { await rollback(); return { ok: false, reason: 'error' } }
      // revalidateTag, not updateTag: this runs inside the worker ROUTE HANDLER,
      // and updateTag is Server-Action-only.
      revalidateTag(siteTag(tk.site_id), { expire: 0 })
      revalidateTag(postTag(tk.site_id, tk.post_id), { expire: 0 })
      await markProfileStale(admin, tk.site_id)
      return { ok: true, url, applied: true }
    }

    // Normal draft publish.
    const { error: pubErr } = await admin.from('posts').update({ is_published: true }).eq('id', tk.post_id).eq('site_id', tk.site_id)
    if (pubErr) { await rollback(); return { ok: false, reason: 'error' } }

    revalidateTag(siteTag(tk.site_id), { expire: 0 })
    revalidateTag(postTag(tk.site_id, tk.post_id), { expire: 0 })
    await admin
      .from(WA_TABLES.outcomes)
      .update({ published_at: new Date().toISOString(), published_url: url })
      .eq('post_id', tk.post_id)
    await markProfileStale(admin, tk.site_id)

    return { ok: true, url }
  } catch {
    return { ok: false, reason: 'error' }
  }
}
