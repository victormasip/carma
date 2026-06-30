'use server'

// /review/[token] — the one public action that flips is_published (T5).
//
// Security model (B/D, founder directive 2026-06-26): the review token IS the
// bearer capability — 256-bit, single-use, sha256-stored, expiring, revocable, and
// the published post is reversible (un-publish from the dashboard). The human still
// confirms by tapping "Aprovar i Publicar", so this is human-confirmed publishing,
// never auto-publish. We re-verify the token server-side on every call and consume
// it atomically (guarded UPDATE) so a double-tap or a race can publish only once.
//
// Publishing = set is_published + revalidate the /render path. That is the same
// path the dashboard uses; the headless WordPress plugin (the "Trojan Horse") pulls
// the now-live post from /embed, so flipping the flag IS the WordPress trigger.

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { hashToken } from '@/lib/whatsapp/tokens'
import { WA_TABLES } from '@/lib/whatsapp/types'
import { rateLimit } from '@/lib/ratelimit'
import { sendWhatsApp } from '@/lib/whatsapp/kapso'
import { buildArticleUrl } from './shared'

export type ApproveResult =
  | { ok: true; url: string }
  | { ok: false; error: string; state?: 'expired' | 'invalid' }

async function clientIp(): Promise<string> {
  const h = await headers()
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? '').trim() || 'unknown'
}

async function currentHost(): Promise<string | undefined> {
  const h = await headers()
  return h.get('x-forwarded-host') ?? h.get('host') ?? undefined
}

// Best-effort "it's live" nudge back to the owner's WhatsApp. Never throws.
async function notifyPublished(admin: ReturnType<typeof createAdminClient>, threadId: string | null, url: string) {
  if (!threadId) return
  try {
    const { data: thread } = await admin.from(WA_TABLES.threads).select('identity_id').eq('id', threadId).maybeSingle()
    if (!thread) return
    const { data: identity } = await admin.from(WA_TABLES.identities).select('phone_e164').eq('id', thread.identity_id).maybeSingle()
    if (identity?.phone_e164) {
      await sendWhatsApp(identity.phone_e164 as string, `Publicat! 🎉 Ja és online: ${url}`)
    }
  } catch {
    /* best-effort */
  }
}

export type EditResult = { ok: true } | { ok: false; error: string }

// "Editar" from the public review page → kick off the WhatsApp edit loop. Token-gated
// (no login needed, unlike the dashboard editor), so it works straight from the review
// link on a phone: we flip the agent thread into `awaiting_edit`, point it at this
// draft, and WhatsApp the owner asking for the changes. Their next message is revised
// by the worker's edit loop. Falls back gracefully if there's no bound thread.
export async function requestEditViaWhatsApp(rawToken: string): Promise<EditResult> {
  const token = (rawToken ?? '').trim()
  if (!token) return { ok: false, error: 'Enllaç no vàlid.' }
  if (!rateLimit(`review-edit:${await clientIp()}`, 20, 60_000).ok) {
    return { ok: false, error: 'Massa intents. Torna-ho a provar en un minut.' }
  }

  const admin = createAdminClient()
  const { data: tk } = await admin
    .from(WA_TABLES.reviewTokens)
    .select('post_id, site_id, thread_id, status, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (!tk) return { ok: false, error: 'Enllaç no vàlid.' }
  if (!tk.thread_id) {
    return { ok: false, error: 'Aquest esborrany no està lligat a cap xat de WhatsApp. Obre’l a l’editor del Carma.' }
  }

  const { data: thread } = await admin
    .from(WA_TABLES.threads)
    .select('id, identity_id, agent_state')
    .eq('id', tk.thread_id)
    .maybeSingle()
  if (!thread) return { ok: false, error: 'No puc obrir l’edició des d’aquí. Obre’l a l’editor del Carma.' }

  // Flip the thread into the edit loop and pin it to THIS draft.
  const stateNow = (thread.agent_state as Record<string, unknown> | null) ?? {}
  await admin
    .from(WA_TABLES.threads)
    .update({ agent_state: { ...stateNow, phase: 'awaiting_edit', writing_for: undefined }, current_post_id: tk.post_id })
    .eq('id', thread.id)

  // WhatsApp the owner to collect the changes (best-effort; the state is already set).
  const { data: identity } = await admin
    .from(WA_TABLES.identities).select('phone_e164').eq('id', thread.identity_id).maybeSingle()
  if (identity?.phone_e164) {
    const { data: post } = await admin.from('posts').select('title').eq('id', tk.post_id).maybeSingle()
    const title = (post?.title as string) || 'l’article'
    await sendWhatsApp(
      identity.phone_e164 as string,
      `✏️ Editem «${title}»! Escriu-me (o envia’m un àudio amb) els canvis que vols — to, longitud, què afegir o treure — i el reescric.`,
    )
  }
  return { ok: true }
}

export async function approveAndPublish(rawToken: string): Promise<ApproveResult> {
  const token = (rawToken ?? '').trim()
  if (!token) return { ok: false, error: 'Enllaç no vàlid.', state: 'invalid' }

  // Light abuse guard (the 256-bit token is not brute-forceable; this just caps spin).
  if (!rateLimit(`review:${await clientIp()}`, 30, 60_000).ok) {
    return { ok: false, error: 'Massa intents. Torna-ho a provar en un minut.' }
  }

  const admin = createAdminClient()
  const hash = hashToken(token)

  const { data: tk } = await admin
    .from(WA_TABLES.reviewTokens)
    .select('id, post_id, site_id, thread_id, status, expires_at, action')
    .eq('token_hash', hash)
    .maybeSingle()
  if (!tk) return { ok: false, error: 'Enllaç no vàlid.', state: 'invalid' }

  const { data: site } = await admin.from('sites').select('subdomain').eq('id', tk.site_id).maybeSingle()
  const { data: post } = await admin.from('posts').select('slug').eq('id', tk.post_id).maybeSingle()
  if (!post) return { ok: false, error: 'Enllaç no vàlid.', state: 'invalid' }
  const url = buildArticleUrl(site?.subdomain as string | null | undefined, post.slug as string, tk.site_id, await currentHost())

  // Already consumed → idempotent success (a re-tap just shows "Publicat").
  if (tk.status === 'consumed') return { ok: true, url }

  const expired = new Date(tk.expires_at).getTime() < Date.now() || tk.status === 'revoked' || tk.status === 'expired'
  if (expired || tk.status !== 'active') {
    return { ok: false, error: 'Aquest enllaç ha caducat.', state: 'expired' }
  }

  // Atomically consume: only the FIRST caller flips active→consumed (single-use).
  const { data: consumed } = await admin
    .from(WA_TABLES.reviewTokens)
    .update({ status: 'consumed', consumed_at: new Date().toISOString(), consumed_ip: await clientIp() })
    .eq('id', tk.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()
  if (!consumed) {
    // Lost the race — another tap already consumed it. Treat as published.
    return { ok: true, url }
  }

  // Publish the post.
  const { error: pubErr } = await admin
    .from('posts')
    .update({ is_published: true })
    .eq('id', tk.post_id)
    .eq('site_id', tk.site_id)
  if (pubErr) {
    // Roll the token back so the owner can retry rather than burning their link.
    await admin.from(WA_TABLES.reviewTokens).update({ status: 'active', consumed_at: null, consumed_ip: null }).eq('id', tk.id)
    return { ok: false, error: "No s'ha pogut publicar. Torna-ho a provar." }
  }

  // The publish trigger: revalidate the render path → the headless feed (and the WP
  // plugin that pulls it) serve the now-live article.
  revalidatePath(`/render/${tk.site_id}`)

  // G3 outcome loop: stamp published_at + the live URL (best-effort, non-blocking).
  await admin
    .from(WA_TABLES.outcomes)
    .update({ published_at: new Date().toISOString(), published_url: url })
    .eq('post_id', tk.post_id)

  await notifyPublished(admin, tk.thread_id as string | null, url)

  return { ok: true, url }
}
