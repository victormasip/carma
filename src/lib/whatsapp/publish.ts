// WhatsApp Agent — publish a thread's pending draft (server-only).
//
// Shared by the /review approve action (token-based) AND the WhatsApp "✅ Publicar"
// interactive button (thread-based, founder directive 2026-06-30). Tapping the
// button in WhatsApp is a postback with no token in hand, so we resolve the active
// review_token from the thread, consume it atomically (single-use, race-safe) and
// flip is_published — the exact same publish path the web page uses.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { WA_TABLES } from './types'
import { buildArticleUrl } from '@/app/review/[token]/shared'

type Admin = ReturnType<typeof createAdminClient>

export type ThreadPublishResult =
  | { ok: true; url: string; already?: boolean }
  | { ok: false; reason: 'no_draft' | 'expired' | 'error' }

/**
 * Publish the draft a thread is currently awaiting review on. Resolves the active
 * publish token for the thread, consumes it once, sets is_published, revalidates the
 * render path and stamps the outcome loop. Idempotent: a second tap returns the live
 * URL without double-publishing. Never throws.
 */
export async function publishThreadDraft(
  admin: Admin,
  threadId: string,
  host?: string,
): Promise<ThreadPublishResult> {
  try {
    // Newest active publish token for this thread is the pending draft.
    const { data: tk } = await admin
      .from(WA_TABLES.reviewTokens)
      .select('id, post_id, site_id, status, expires_at')
      .eq('thread_id', threadId)
      .eq('action', 'publish')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!tk) return { ok: false, reason: 'no_draft' }

    const { data: site } = await admin.from('sites').select('subdomain').eq('id', tk.site_id).maybeSingle()
    const { data: post } = await admin.from('posts').select('slug, is_published').eq('id', tk.post_id).maybeSingle()
    if (!post) return { ok: false, reason: 'no_draft' }
    const url = buildArticleUrl(site?.subdomain as string | null | undefined, post.slug as string, tk.site_id, host)

    // Already live (consumed token or published post) → idempotent success.
    if (tk.status === 'consumed' || post.is_published === true) return { ok: true, url, already: true }

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
    if (!consumed) return { ok: true, url, already: true } // lost the race → already published

    const { error: pubErr } = await admin
      .from('posts')
      .update({ is_published: true })
      .eq('id', tk.post_id)
      .eq('site_id', tk.site_id)
    if (pubErr) {
      // Roll the token back so the owner can retry instead of burning the draft.
      await admin.from(WA_TABLES.reviewTokens).update({ status: 'active', consumed_at: null }).eq('id', tk.id)
      return { ok: false, reason: 'error' }
    }

    revalidatePath(`/render/${tk.site_id}`)
    await admin
      .from(WA_TABLES.outcomes)
      .update({ published_at: new Date().toISOString(), published_url: url })
      .eq('post_id', tk.post_id)

    return { ok: true, url }
  } catch {
    return { ok: false, reason: 'error' }
  }
}
