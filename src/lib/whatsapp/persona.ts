// Carma's master persona + dynamic site-context builder (server-only).
//
// Brain overhaul (founder directive 2026-07-05): the WhatsApp channel is no longer
// a state machine stitched together with canned Catalan strings — it is ONE agent
// with ONE personality, shared by the intent router (brain.ts) and the article
// writer (agent.ts). This module owns the two ingredients both prompts need:
//
//   · CARMA_PERSONA — the non-negotiable voice. Injected verbatim into every
//     system prompt so the router's quick replies and the writer's clarifications
//     sound like the same person.
//   · buildSiteContext / formatSiteContext — a per-site briefing (brand, language,
//     recent articles, categories, visual identity hints) queried fresh per turn
//     and injected into the prompt, so Carma talks about THIS blog, not "a blog".

import type { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_LOCALE, LOCALE_META, normalizeLocale, type Locale } from '@/lib/i18n/config'
import type { KarmaPlan } from '@/lib/karma/config'
import { MODULES, moduleAllowedForPlan, type ModuleTier, type SiteModules } from '@/lib/modules/registry'
import { publicSiteUrl } from '@/lib/sites/domain'
import { readBrainProfile, formatBrainProfile, type SiteBrainProfile } from './profile'
import { readBrandBrain, formatBrandBrain } from '@/lib/brand/persist'
import type { BrandBrain } from '@/lib/brand/types'

type Admin = ReturnType<typeof createAdminClient>

// ─── The voice ─────────────────────────────────────────────────────────────────
// Written as hard behavioural rules (models follow rules better than adjectives).
export const CARMA_PERSONA = `You are Carma — the personal blog agent that lives in the owner's WhatsApp. You run their blog end to end: they send you ideas (text or voice notes), you write publish-ready SEO articles in their blog's voice, you apply their edits, and you publish when they say so.

PERSONALITY — never break these:
- Warm, cheerful and genuinely eager to help: a brilliant colleague they trust, never a call-center bot and never servile.
- Ultra-professional under the warmth: precise, concrete, zero filler, zero corporate phrases ("Benvolgut", "Estimado cliente", "Dear valued customer" are all banned).
- WhatsApp register: short sentences, line breaks over paragraphs, at most 1–2 emojis per message and only where they feel natural.
- Empathetic and proactive: acknowledge what they said, anticipate the next step, and offer it briefly.
- ALWAYS write in the language the owner is using in their latest messages. If you truly cannot tell, use the blog's language.
- Vary your phrasing between messages — never repeat the same stock sentence twice in a conversation.
- Never mention being an AI/language model, internal systems, jobs, queues or prompts.

WHAT YOU CAN ACTUALLY DO (never offer anything outside this list, and never say you "can't" about something on it):
- Write a full article from an idea, a voice note, a photo caption or a link.
- Revise a draft, or an ALREADY-PUBLISHED article, from a plain-language change request.
- Publish, and give back the real live link.
- Put a photo they send you on the article as its cover, adjusted and cropped for the web.
- Generate a cover image when they have no photo.
- Switch blog features on and off by name — comments, newsletter, search, related posts, paywall and the rest — within their plan.
- Tell them how the blog is doing: articles published, drafts waiting, visits, what went out last.
- List what they have published, with links.
- Answer about their punts, their plan and what things cost.

WHAT YOU CANNOT DO (say so plainly, offer the nearest thing you can):
- Delete a published article, change their plan, or touch their payment details.
- Reply to comments, post to social networks, or send their newsletter.
- Change the blog's colours, typefaces or layout — that is the Studio, on the web.`

// ─── Site context ──────────────────────────────────────────────────────────────
export type SiteContext = {
  siteId: string
  siteName: string
  subdomain: string | null
  originUrl: string | null
  locale: Locale
  localeNative: string // e.g. "Català" — the language articles are written in
  locales: string[]
  sectionTitle: string | null
  categories: string[]
  recentTitles: string[]
  fontFamily: string | null
  brandColor: string | null

  // ── OMNISCIENCE (founder, 2026-09-17: "the agent MUST know everything about
  // the specific client and blog it is talking to"). Everything below was
  // already in the database and simply never reached a prompt, which is why the
  // agent could be asked "are the comments on?" and have no idea.

  /** The blog's real public address. Never the `/render/<uuid>` engine path. */
  publicUrl: string
  /** Features switched ON right now, with the names the owner sees in the app. */
  modulesOn: { id: string; name: string }[]
  /** Switched off but reachable on this plan — the things she may OFFER. */
  modulesAvailable: { id: string; name: string }[]
  /** Reachable only on a higher plan. Named so an upsell can be concrete. */
  modulesLocked: { id: string; name: string }[]
  publishedCount: number
  draftCount: number
  /** ISO of the newest published article, and how long ago that was. */
  lastPublishedAt: string | null
  lastPublishedDaysAgo: number | null
  /** The account's plan, so module talk is grounded in what they actually have. */
  plan: ModuleTier
}

/**
 * Query everything the prompts need to know about one site, in parallel. Every
 * read degrades gracefully (missing column / pre-migration env → field is null),
 * because a context miss must never block a turn.
 */
export async function buildSiteContext(
  admin: Admin,
  siteId: string,
  /** The account's plan. Without it module talk is guesswork, so the caller
   *  passes the plan it already fetched for the wallet rather than re-reading. */
  plan: ModuleTier = 'free',
): Promise<SiteContext> {
  const [siteRes, themeRes, postsRes] = await Promise.all([
    admin.from('sites').select('name, subdomain, origin_url').eq('id', siteId).maybeSingle(),
    // `modules` is post-024; the retry below keeps pre-024 environments working.
    admin
      .from('site_themes')
      .select('default_locale, locales, section_title, design_tokens, modules')
      .eq('site_id', siteId)
      .maybeSingle(),
    admin
      .from('posts')
      .select('title, categories, is_published, published_at, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(60),
  ])

  // Pre-024 has no `modules` column, so the widened select above 42703s wholesale.
  // The retry drops it and keeps everything else — typed loosely on purpose, since
  // the two selects genuinely return different row shapes.
  let themeData: Record<string, unknown> | null = (themeRes.data ?? null) as Record<string, unknown> | null
  if (themeRes.error?.code === '42703') {
    const retry = await admin
      .from('site_themes')
      .select('default_locale, locales, section_title, design_tokens')
      .eq('site_id', siteId)
      .maybeSingle()
    themeData = (retry.data ?? null) as Record<string, unknown> | null
  }

  const site = (siteRes.data ?? {}) as { name?: string; subdomain?: string | null; origin_url?: string | null }
  const theme = (themeData ?? {}) as {
    default_locale?: string
    locales?: string[]
    section_title?: string | null
    design_tokens?: Record<string, unknown>
    modules?: SiteModules | null
  }

  const locale = normalizeLocale(theme.default_locale ?? DEFAULT_LOCALE)

  const categories = new Set<string>()
  const recentTitles: string[] = []
  let publishedCount = 0
  let draftCount = 0
  let lastPublishedAt: string | null = null
  for (const row of postsRes.data ?? []) {
    for (const c of (row.categories as string[] | null) ?? []) if (c?.trim()) categories.add(c.trim())
    if (recentTitles.length < 6 && typeof row.title === 'string' && row.title.trim()) recentTitles.push(row.title.trim())
    if (row.is_published === true) {
      publishedCount++
      const when = (row.published_at as string | null) ?? (row.created_at as string | null)
      if (when && (!lastPublishedAt || when > lastPublishedAt)) lastPublishedAt = when
    } else {
      draftCount++
    }
  }

  // Which features are on, which are off but reachable, which need a bigger plan.
  const enabled = new Set(
    Object.entries(theme.modules ?? {}).filter(([, cfg]) => cfg?.enabled === true).map(([id]) => id),
  )
  const modulesOn: { id: string; name: string }[] = []
  const modulesAvailable: { id: string; name: string }[] = []
  const modulesLocked: { id: string; name: string }[] = []
  for (const def of MODULES) {
    const entry = { id: def.id, name: def.name }
    if (enabled.has(def.id)) modulesOn.push(entry)
    else if (moduleAllowedForPlan(def, plan)) modulesAvailable.push(entry)
    else modulesLocked.push(entry)
  }

  const daysAgo = lastPublishedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastPublishedAt).getTime()) / 86_400_000))
    : null

  // Visual identity hints from the clone's design tokens — a light brand flavour
  // ("elegant serif site in deep green") the writer can echo in tone, not a spec.
  const tokens = theme.design_tokens ?? {}
  const fontFamily = firstString(tokens, ['fontBody', 'font_body', 'bodyFont', 'fontFamily', 'font_family', 'fontHeading', 'font_heading'])
  const brandColor = firstString(tokens, ['primary', 'primaryColor', 'primary_color', 'accent', 'accentColor', 'accent_color'])

  return {
    siteId,
    siteName: site.name ?? '',
    subdomain: site.subdomain ?? null,
    originUrl: site.origin_url ?? null,
    locale,
    localeNative: LOCALE_META[locale].native,
    locales: Array.isArray(theme.locales) && theme.locales.length ? theme.locales : [locale],
    sectionTitle: theme.section_title ?? null,
    categories: [...categories].slice(0, 12),
    recentTitles,
    fontFamily,
    brandColor,
    publicUrl: publicSiteUrl({ id: siteId, subdomain: site.subdomain ?? null }),
    modulesOn,
    modulesAvailable,
    modulesLocked,
    publishedCount,
    draftCount,
    lastPublishedAt,
    lastPublishedDaysAgo: Number.isFinite(daysAgo as number) ? daysAgo : null,
    plan,
  }
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Render the context as the BLOG CONTEXT prompt block both brains consume. */
export function formatSiteContext(ctx: SiteContext): string {
  const lines = [
    `Blog: ${ctx.siteName || '(unnamed)'}`,
    `Public address: ${ctx.publicUrl}`,
    `Article language: ${ctx.localeNative} (${ctx.locale})${ctx.locales.length > 1 ? ` · also publishes in: ${ctx.locales.join(', ')}` : ''}`,
  ]
  if (ctx.originUrl) lines.push(`Owner's website: ${ctx.originUrl}`)
  if (ctx.sectionTitle) lines.push(`Blog section title: ${ctx.sectionTitle}`)

  // THE STATE OF THE BLOG. Cheap to carry and it changes every answer: "how is
  // the blog doing", "what did I publish last", "is anything waiting for me".
  const state = [
    `${ctx.publishedCount} published`,
    ctx.draftCount ? `${ctx.draftCount} draft${ctx.draftCount === 1 ? '' : 's'} waiting` : null,
    ctx.lastPublishedDaysAgo === null
      ? 'nothing published yet'
      : ctx.lastPublishedDaysAgo === 0
        ? 'last one went out today'
        : `last one ${ctx.lastPublishedDaysAgo} day${ctx.lastPublishedDaysAgo === 1 ? '' : 's'} ago`,
  ].filter(Boolean)
  lines.push(`Blog state: ${state.join(' · ')}`)

  // THE FEATURES. Being able to answer "are the comments on?" without guessing
  // is the difference between an assistant and an autocomplete.
  lines.push(
    ctx.modulesOn.length
      ? `Features ON right now: ${ctx.modulesOn.map((m) => m.name).join(' · ')}`
      : 'Features ON right now: none',
  )
  if (ctx.modulesAvailable.length) {
    lines.push(`Features OFF but included in their ${ctx.plan} plan (you may switch these on if asked): ${ctx.modulesAvailable.map((m) => m.name).join(' · ')}`)
  }
  if (ctx.modulesLocked.length) {
    lines.push(`Features their plan does NOT include (mention only if they ask for one by name): ${ctx.modulesLocked.map((m) => m.name).join(' · ')}`)
  }

  if (ctx.categories.length) lines.push(`Existing categories: ${ctx.categories.join(' · ')}`)
  if (ctx.recentTitles.length) lines.push(`Recent articles: ${ctx.recentTitles.map((t) => `«${t}»`).join(' · ')}`)
  if (ctx.fontFamily || ctx.brandColor) {
    lines.push(
      `Visual identity: ${[ctx.fontFamily && `typography ${ctx.fontFamily}`, ctx.brandColor && `brand colour ${ctx.brandColor}`]
        .filter(Boolean)
        .join(', ')}`,
    )
  }
  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Two-tier Cortex (§2.1 of the Living Brain plan). Tier-1 (OWNER CONTEXT) is cheap
// and runs every turn — who the owner is, what they own, what they can afford — so
// even "hola" is greeted by context. Tier-2 (BLOG CONTEXT + brand profile) is loaded
// lazily, only for write/edit turns. Everything degrades to today's behaviour when a
// read misses (pre-migration, missing profile).
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Tier 1 — Light owner context (always, before routeTurn) ──────────────────
export type LightContextSite = { id: string; name: string; total: number; published: number }

export type LightContext = {
  ownerName: string | null
  plan: KarmaPlan
  /** null = infinite (superadmin) or unknown (pre-028). */
  punts: number | null
  puntsAvailable: boolean
  superadmin: boolean
  sites: LightContextSite[]
  /** sites beyond the display cap ("…i N més"). */
  extraSiteCount: number
  pendingDraftTitle: string | null
}

// Grouped post counts via migration 029's RPC, with a 42883-safe JS fallback so the
// light context works before 029 is applied (E-15).
async function postsCountsBySite(
  admin: Admin,
  ids: string[],
): Promise<Map<string, { total: number; published: number }>> {
  const map = new Map<string, { total: number; published: number }>()
  if (!ids.length) return map
  try {
    const { data, error } = await admin.rpc('posts_counts_by_site', { p_site_ids: ids })
    if (!error && Array.isArray(data)) {
      for (const r of data as { site_id: string; total: number; published: number }[]) {
        map.set(String(r.site_id), { total: Number(r.total) || 0, published: Number(r.published) || 0 })
      }
      return map
    }
  } catch {
    /* fall through to the JS count */
  }
  try {
    const { data } = await admin.from('posts').select('site_id, is_published').in('site_id', ids)
    for (const r of (data ?? []) as { site_id: string; is_published: boolean }[]) {
      const k = String(r.site_id)
      const cur = map.get(k) ?? { total: 0, published: 0 }
      cur.total++
      if (r.is_published === true) cur.published++
      map.set(k, cur)
    }
  } catch {
    /* leave empty — sites still render by name */
  }
  return map
}

/**
 * Tier-1 context: identity + plan + punts + owned sites + pending draft. Reuses the
 * karma balance the worker ALREADY fetched (never a second wallet lock — E-1). One
 * names query + one grouped-count query; nothing per-post, nothing that writes.
 */
export async function buildLightContext(
  admin: Admin,
  opts: {
    ownerName?: string | null
    karma: { plan: KarmaPlan; balance: number | null; available: boolean; superadmin?: boolean }
    siteIds: string[]
    pendingDraftTitle?: string | null
    maxSites?: number
  },
): Promise<LightContext> {
  const maxSites = opts.maxSites ?? 8
  const ids = [...new Set(opts.siteIds.filter(Boolean))]

  let sites: LightContextSite[] = []
  if (ids.length) {
    const [{ data: nameRows }, counts] = await Promise.all([
      admin.from('sites').select('id, name').in('id', ids),
      postsCountsBySite(admin, ids),
    ])
    const nameById = new Map((nameRows ?? []).map((r) => [String(r.id), String(r.name ?? '')]))
    sites = ids
      .map((id) => ({ id, name: nameById.get(id) ?? '', total: counts.get(id)?.total ?? 0, published: counts.get(id)?.published ?? 0 }))
      .filter((s) => s.name)
      // recent-activity proxy: most-published first (agency cap keeps the prompt small)
      .sort((a, b) => b.published - a.published || b.total - a.total)
  }
  const shown = sites.slice(0, maxSites)

  return {
    ownerName: opts.ownerName?.trim() || null,
    plan: opts.karma.plan,
    punts: opts.karma.balance,
    puntsAvailable: opts.karma.available,
    superadmin: !!opts.karma.superadmin,
    sites: shown,
    extraSiteCount: Math.max(0, sites.length - shown.length),
    pendingDraftTitle: opts.pendingDraftTitle?.trim() || null,
  }
}

/** Render Tier-1 as the OWNER CONTEXT block. Kept tight (≤ ~350 tokens for 8 sites). */
export function formatLightContext(ctx: LightContext): string {
  const lines: string[] = ['OWNER CONTEXT:']
  if (ctx.ownerName) lines.push(`Owner: ${ctx.ownerName}`)
  if (ctx.superadmin) {
    lines.push('Plan: superadmin (punts il·limitats)')
  } else {
    const puntsBit = ctx.puntsAvailable && ctx.punts !== null ? ` · ${ctx.punts} punts` : ''
    lines.push(`Plan: ${ctx.plan}${puntsBit}`)
  }
  if (ctx.sites.length) {
    const total = ctx.sites.length + ctx.extraSiteCount
    const shown = ctx.sites.map((s) => `«${s.name}»${s.published ? ` (${s.published} pub.)` : ''}`).join(' · ')
    lines.push(`Blogs (${total}): ${shown}${ctx.extraSiteCount ? ` · …i ${ctx.extraSiteCount} més` : ''}`)
  }
  if (ctx.pendingDraftTitle) lines.push(`Pending draft: «${ctx.pendingDraftTitle}»`)
  // E-19: numbers here are real; the app appends exact balances — never restate them.
  lines.push('(Numbers above are real; do not restate or invent balances/prices.)')
  return lines.join('\n')
}

// ─── Tier 2 — Writing context (lazy, only for write/edit turns) ───────────────
/** Prompt blocks are separated by a blank line so each reads as its own section. */
const BLOCK_SEP = '\n\n'

export type WritingContext = {
  activeSite: SiteContext
  profile: SiteBrainProfile | null
  /** Captured at ONBOARDING from the owner's own website / documents / voice
   *  (migration 033). Null for sites that predate the Brand Brain or skipped it. */
  brand: BrandBrain | null
}

/**
 * Tier-2 context: the full site briefing, the persisted brand profile (§2.2), and
 * the onboarding Brand Brain (migration 033).
 *
 * The heavy work was all done offline — the profiler distils published posts, the
 * onboarding capture reads the owner's own website/documents/voice — so here we
 * only read. Pass any of the three (even null) to skip its read when the caller
 * already holds it.
 */
export async function buildWritingContext(
  admin: Admin,
  siteId: string,
  opts: {
    profile?: SiteBrainProfile | null
    activeSite?: SiteContext
    brand?: BrandBrain | null
  } = {},
): Promise<WritingContext> {
  const [activeSite, profile, brand] = await Promise.all([
    opts.activeSite !== undefined ? Promise.resolve(opts.activeSite) : buildSiteContext(admin, siteId),
    opts.profile !== undefined ? Promise.resolve(opts.profile) : readBrainProfile(admin, siteId),
    opts.brand !== undefined ? Promise.resolve(opts.brand) : readBrandBrain(admin, siteId),
  ])
  return { activeSite, profile, brand }
}

/**
 * Render Tier-2 as the BLOG CONTEXT block: site briefing + distilled profile +
 * the onboarding Brand Brain.
 *
 * The Brand Brain goes LAST because it ends in the verbatim exemplars, and a
 * few-shot block lands hardest immediately before the instruction to write. It is
 * APPENDED rather than replacing the distilled profile: the two describe
 * different things — who the brand is, versus what this blog has published.
 */
export function formatWritingContext(ctx: WritingContext): string {
  const parts = [formatSiteContext(ctx.activeSite)]
  if (ctx.profile) parts.push(formatBrainProfile(ctx.profile))
  if (ctx.brand) parts.push(formatBrandBrain(ctx.brand))
  return parts.filter(Boolean).join(BLOCK_SEP)
}
