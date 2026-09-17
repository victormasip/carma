'use server'

// I6 — DEMANAR VALIDACIÓ.
//
// The interaction plan calls this the crown jewel: before publishing, an author
// can put a DRAFT in front of a peer and get a real read — praise and one
// concrete suggestion — instead of shipping into silence. The author pays 10
// punts, the reviewer earns 25, and Carma covers the difference on purpose:
// reading is the half of the loop nobody does spontaneously, so it has to be the
// profitable half.
//
// This action is the FLAG, not the queue. It marks the draft as waiting for a
// reader (`posts.review_requested_at` + `_by`, migration 036) and takes the 10
// punts. Matching drafts to reviewers is the Monday circle (wave 5) and has no
// business being decided at the moment a button is pressed.
//
// Three rules the plan is explicit about, all enforced here:
//   1. DRAFTS ONLY. A published article cannot be pre-reviewed; that is I3.
//   2. ONE REQUEST. Re-asking must not charge twice — the flag is idempotent and
//      says so instead of quietly re-spending.
//   3. WRITE ACCESS. Only someone who can edit the post can spend its owner's
//      punts on it.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { spendKarma, refundKarma } from '@/lib/karma/karma'
import { KARMA_COSTS } from '@/lib/karma/config'

// `posts.review_requested_at` only exists after migration 036.
const UNDEFINED_COLUMN = '42703'

export type ReviewRequestResult =
  | { ok: true; requestedAt: string; balance: number | null; already?: boolean }
  | { ok: false; error: string; needed?: number; balance?: number }

export async function requestPeerReview(postId: string, siteId: string): Promise<ReviewRequestResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticat.' }

  const admin = createAdminClient()

  // Authz: superadmin, or an assigned member of this site.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if ((profile as { role?: string } | null)?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users').select('user_id')
      .eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!membership) return { ok: false, error: 'Accés denegat a aquest blog.' }
  }

  // The post must be this site's, and it must still be a draft.
  const postSel = await admin
    .from('posts').select('id, is_published, review_requested_at')
    .eq('id', postId).eq('site_id', siteId).maybeSingle()

  if (postSel.error?.code === UNDEFINED_COLUMN) {
    return { ok: false, error: 'La validació entre companys encara no està activa (migració 036 pendent).' }
  }
  const post = postSel.data as { is_published?: boolean; review_requested_at?: string | null } | null
  if (!post) return { ok: false, error: 'Article no trobat.' }
  if (post.is_published) {
    return { ok: false, error: 'Aquest article ja està publicat. La validació és per a esborranys.' }
  }
  // Already queued → say so, charge nothing. Re-pressing a button must never be
  // a second purchase.
  if (post.review_requested_at) {
    return { ok: true, requestedAt: post.review_requested_at, balance: null, already: true }
  }

  // Charge first, flag second. The dedupe key makes a retry idempotent even if
  // the write below fails and the author presses again.
  const spend = await spendKarma(user.id, 'peer_review', {
    ref: postId,
    dedupeKey: `review:${postId}:${user.id}`,
  }, admin)
  if (!spend.ok) {
    return {
      ok: false,
      error: `Necessites ${spend.needed ?? KARMA_COSTS.peer_review} punts per demanar una validació.`,
      needed: spend.needed,
      balance: spend.balance,
    }
  }

  const requestedAt = new Date().toISOString()
  const { error } = await admin
    .from('posts')
    .update({ review_requested_at: requestedAt, review_requested_by: user.id })
    .eq('id', postId).eq('site_id', siteId)

  if (error) {
    // The punts were taken for something that did not happen. Give them back
    // rather than leaving the author paying for a queue entry that never existed.
    await refundKarma(user.id, KARMA_COSTS.peer_review, 'peer_review', {
      ref: postId,
      dedupeKey: `review-refund:${postId}:${user.id}`,
    }, admin)
    if (error.code === UNDEFINED_COLUMN) {
      return { ok: false, error: 'La validació entre companys encara no està activa (migració 036 pendent).' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath(`/dashboard/sites/${siteId}/posts/${postId}/edit`)
  return { ok: true, requestedAt, balance: spend.balance }
}
