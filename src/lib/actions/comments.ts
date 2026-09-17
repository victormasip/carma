'use server'

// Comment moderation — the other half of "Verified Comments".
//
// /api/interactions stores every comment with `approved = false` and the public
// read only ever returns approved ones. Without this file that is a black hole:
// readers write, nothing appears, and the owner never learns anyone tried. A
// moderation queue is not a nice-to-have for a moderated system, it IS the
// system.
//
// Authz mirrors lib/actions/modules.ts: superadmin, or an assigned member of the
// site. Comments are always scoped by `site_id` in the query itself, so a
// crafted id from another blog matches nothing rather than leaking.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { siteTag } from '@/lib/render/cache'

// The comment tables arrive with migration 036.
const MISSING_TABLE = '42P01'

export type PendingComment = {
  id: string
  author: string
  body: string
  createdAt: string
  /** Title of the article it was left on (may be empty if the post vanished). */
  postTitle: string
  postId: string
}

async function assertSiteAccess(siteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const admin = createAdminClient()
  if ((profile as { role?: string } | null)?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users').select('user_id')
      .eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!membership) throw new Error('Accés denegat a aquest blog')
  }
  return admin
}

/**
 * The moderation queue: everything waiting for a decision, newest first.
 *
 * `email` is never selected — the owner moderates what was SAID; they do not
 * need the address to do it, and a list that carries one is a list that leaks
 * one. (It stays in the table so a future "reply to the commenter" can use it
 * deliberately rather than by accident.)
 */
export async function listPendingComments(siteId: string, limit = 50): Promise<{
  comments: PendingComment[]
  available: boolean
  error?: string
}> {
  try {
    const admin = await assertSiteAccess(siteId)
    const { data, error } = await admin
      .from('post_comments')
      .select('id, author, body, created_at, post_id, posts(title)')
      .eq('site_id', siteId)
      .eq('approved', false)
      .eq('reported', false)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(200, limit)))

    if (error?.code === MISSING_TABLE) return { comments: [], available: false }
    if (error) return { comments: [], available: true, error: error.message }

    const rows = (data ?? []) as unknown as {
      id: string; author: string; body: string; created_at: string; post_id: string
      posts?: { title?: string } | { title?: string }[] | null
    }[]
    return {
      available: true,
      comments: rows.map(r => {
        const post = Array.isArray(r.posts) ? r.posts[0] : r.posts
        return {
          id: r.id,
          author: r.author,
          body: r.body,
          createdAt: r.created_at,
          postId: r.post_id,
          postTitle: post?.title ?? '',
        }
      }),
    }
  } catch (err) {
    return { comments: [], available: true, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/**
 * Approve (publish) or delete one comment.
 *
 * Approving invalidates the site tag: the comment list itself is fetched
 * client-side from /api/interactions, but a reader arriving fresh should not be
 * served a page built before the conversation existed.
 */
export async function moderateComment(
  siteId: string,
  commentId: string,
  action: 'approve' | 'delete',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await assertSiteAccess(siteId)
    const q = admin.from('post_comments')
    const { error } = action === 'approve'
      ? await q.update({ approved: true }).eq('id', commentId).eq('site_id', siteId)
      : await q.delete().eq('id', commentId).eq('site_id', siteId)

    if (error?.code === MISSING_TABLE) return { ok: false, error: 'Els comentaris encara no estan actius (migració 036 pendent).' }
    if (error) return { ok: false, error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    updateTag(siteTag(siteId))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
