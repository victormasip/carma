// WhatsApp Agent — executor toolbox + shared context (P3, server-only).
//
// The per-intent execution bodies moved out of the god-module worker.ts into
// executors/{write,edit,publish,account,chat}.ts (E-13). This module holds the
// ExecutorCtx they all receive plus the low-level helpers they (and the worker's
// pre-dispatch setup) share. Kept free of any import from ./worker or ./executors/*
// so the dependency graph stays acyclic: worker → executors/index → executors/* → shared.

import type { createAdminClient } from '@/lib/supabase/admin'
import { WA_REVIEW_TOKEN_TTL_HOURS, WA_BRAIN_V2 } from '../config'
import {
  WA_TABLES, WA_BUTTON,
  type GenerationJobRow, type WaAgentState, type WaThreadRow, type WaMessageRow,
  type WaOwnerMemory, type ReviewTokenAction,
} from '../types'
import { mintReviewToken, reviewTokenExpiry } from '../tokens'
import type { AgentUsage, AgentDraft } from '../agent'
import type { RouterResult } from '../brain'
import type { KarmaBalance } from '@/lib/karma/karma'
import { outOfPuntsMessage } from '@/lib/karma/karma'
import { firstUnclaimedReward } from '@/lib/karma/challenges'
import type { OutOfPuntsContext } from '@/lib/whatsapp/upsell'
import { formatSiteContext, buildWritingContext, formatWritingContext, type SiteContext } from '../persona'
import { ensureBrainProfile } from '../profile'
import { sendWhatsApp, sendWhatsAppButtons } from '../kapso'

export type Admin = ReturnType<typeof createAdminClient>

// Everything an executor needs, assembled once by the worker after routing. `cost`
// and `state`/`siteId`/`siteCtx` are mutable so executors can accrue infra cost and
// evolve state before persisting. The bound helpers (say/finish/patchThread) close
// over admin + ids so executor code reads cleanly.
export type ExecutorCtx = {
  admin: Admin
  job: GenerationJobRow
  t: WaThreadRow
  state: WaAgentState
  msg: WaMessageRow
  phone: string
  pnid?: string
  ownerId: string
  ownerName: string | null
  ownerMemory: WaOwnerMemory | null
  karmaNow: KarmaBalance
  route: RouterResult
  inboundText: string
  usedAudio: boolean
  cost: number
  siteId: string | null
  siteCtx: SiteContext | null
  candidates: { id: string; name: string }[]
  candidateIds: string[]
  say: (body: string) => Promise<boolean>
  finish: (status: 'done' | 'error' | 'queued', extra?: Record<string, unknown>) => Promise<void>
  patchThread: (patch: Record<string, unknown>) => Promise<void>
}

// ─── Cost (rough guardrail, not billing) ──────────────────────────────────────
export function estimateCostCents(usage: AgentUsage, audio: boolean): number {
  const cents = (usage.in / 1_000_000) * 250 + (usage.out / 1_000_000) * 1000
  return Math.max(1, Math.ceil(cents) + (audio ? 1 : 0)) // +1c flat for a Whisper call
}

// ─── Send / log / job helpers ─────────────────────────────────────────────────
export async function finishJob(admin: Admin, jobId: string, status: 'done' | 'error' | 'queued', extra: Record<string, unknown> = {}) {
  await admin.from(WA_TABLES.jobs).update({ status, lease_until: null, ...extra }).eq('id', jobId)
}

export async function updateThread(admin: Admin, threadId: string, patch: Record<string, unknown>) {
  await admin.from(WA_TABLES.threads).update(patch).eq('id', threadId)
}

/** Record an outbound message so the router has real conversation memory next turn. */
export async function logOutbound(admin: Admin, threadId: string, text: string): Promise<void> {
  try {
    await admin.from(WA_TABLES.messages).insert({ thread_id: threadId, direction: 'out', msg_type: 'text', text: text.slice(0, 2000) })
  } catch { /* best-effort */ }
}

/** Send + log in one beat — the default way the worker talks to the owner. */
export async function say(admin: Admin, threadId: string, phone: string, body: string, pnid?: string): Promise<boolean> {
  const ok = await sendWhatsApp(phone, body, pnid)
  if (ok) await logOutbound(admin, threadId, body)
  return ok
}

// ─── Draft persistence + review token ─────────────────────────────────────────
export type DraftInput = { title: string; slug: string; excerpt: string; contentHtml: string; seoTitle: string; seoDescription: string; focusKeyword: string; categories: string[]; tags: string[] }

/** Insert a draft post via the admin client (mirrors createPost; slug-retry; 42703-safe). */
export async function saveDraft(admin: Admin, siteId: string, locale: string, d: DraftInput): Promise<string> {
  let slug = d.slug
  for (let attempt = 0; attempt < 4; attempt++) {
    const baseRow: Record<string, unknown> = {
      site_id: siteId,
      title: d.title,
      slug,
      content: { html: d.contentHtml },
      meta: { seo_title: d.seoTitle, seo_description: d.seoDescription, canonical: '', noindex: false, focus_keyword: d.focusKeyword },
      excerpt: d.excerpt || null,
      featured_image: null,
      categories: d.categories,
      tags: d.tags,
      seo_title: d.seoTitle || null,
      seo_description: d.seoDescription || null,
      author_name: null,
      is_published: false,
    }
    const i18nRow = { ...baseRow, i18n: {}, default_locale: locale }

    let { data, error } = await admin.from('posts').insert(i18nRow).select('id').single()
    if (error?.code === '42703') {
      ;({ data, error } = await admin.from('posts').insert(baseRow).select('id').single())
    }
    if (!error && data) return data.id as string
    if (error?.code === '23505') {
      slug = `${d.slug}-${Math.random().toString(36).slice(2, 6)}`
      continue
    }
    throw new Error(error?.message ?? 'draft insert failed')
  }
  throw new Error('draft insert failed after slug retries')
}

/**
 * Mint a fresh single-use review token for a post, superseding any prior ACTIVE
 * token FOR THE SAME POST on this thread (E-12) — post-scoped, NOT thread-scoped, so
 * a parked draft's token survives when you edit a different (e.g. published) post in
 * the same thread. `action` distinguishes a draft publish from a staged-edit apply.
 */
export async function issueReviewToken(
  admin: Admin,
  postId: string,
  siteId: string,
  threadId: string,
  action: ReviewTokenAction = 'publish',
): Promise<string> {
  await admin
    .from(WA_TABLES.reviewTokens)
    .update({ status: 'revoked' })
    .eq('thread_id', threadId)
    .eq('post_id', postId)
    .eq('status', 'active')
  const { raw, hash } = mintReviewToken()
  await admin.from(WA_TABLES.reviewTokens).insert({
    token_hash: hash,
    post_id: postId,
    site_id: siteId,
    thread_id: threadId,
    action,
    status: 'active',
    expires_at: reviewTokenExpiry(WA_REVIEW_TOKEN_TTL_HOURS).toISOString(),
  })
  return raw
}

/** The draft-ready reply: interactive Publicar/Editar buttons + the review link. */
export async function sendDraftReady(
  admin: Admin,
  threadId: string,
  phone: string,
  d: Pick<AgentDraft, 'title' | 'strategy'>,
  link: string,
  pnid?: string,
  opts: { revised?: boolean; withCover?: boolean; coverNote?: string | null } = {},
): Promise<boolean> {
  const lead = opts.revised ? '📝 Esborrany actualitzat' : 'Ja tens l’esborrany'
  const cover = opts.withCover ? ' amb la teva foto de portada 🖼️' : ''
  // What happened to their photograph is news, good or bad, and it belongs in
  // the same message as the draft rather than as a second notification.
  const note = opts.coverNote ? `\n${opts.coverNote}` : ''
  const body = `${lead}: «${d.title}»${cover} ✍️\n${d.strategy}${note}\n\nTambé el pots revisar aquí: ${link}`
  const ok = await sendWhatsAppButtons(
    phone,
    body,
    [
      { id: WA_BUTTON.approve, title: '✅ Publicar' },
      { id: WA_BUTTON.edit, title: '✏️ Editar' },
    ],
    pnid,
  )
  const sent = ok || (await sendWhatsApp(phone, body, pnid))
  if (sent) await logOutbound(admin, threadId, body)
  return sent
}

// ─── Context-aware out-of-punts upsell (§3.3) — LLM-free ──────────────────────
export async function buildUpsell(
  admin: Admin,
  ownerId: string,
  karma: KarmaBalance,
  ownerName: string | null,
  opts: Pick<OutOfPuntsContext, 'heldIdea' | 'variant'> = {},
): Promise<string> {
  if (!WA_BRAIN_V2) return outOfPuntsMessage()
  const unclaimed = await firstUnclaimedReward(admin, ownerId)
  return outOfPuntsMessage({ ownerName, plan: karma.plan, unclaimedChallenges: unclaimed ? [unclaimed] : [], ...opts })
}

// ─── Tier-2 writing context for the writer (site briefing + brand profile) ────
export async function writingContextFor(admin: Admin, siteId: string, siteCtx: SiteContext): Promise<string> {
  if (!WA_BRAIN_V2) return formatSiteContext(siteCtx)
  try {
    const profile = await ensureBrainProfile(admin, siteId)
    const wc = await buildWritingContext(admin, siteId, { activeSite: siteCtx, profile })
    return formatWritingContext(wc)
  } catch {
    return formatSiteContext(siteCtx)
  }
}
