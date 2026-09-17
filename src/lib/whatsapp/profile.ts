// WhatsApp Agent — per-site brand + SEO profiler (§2.2, server-only).
//
// "Match the blog's voice" was inferred fresh from 6 titles every turn. This module
// persists a real brand/industry/audience/SEO profile in site_brain_profiles
// (migration 030), generated OFFLINE (not per turn) — the per-turn path only READS
// it back (persona.buildWritingContext). The aggregate SEO scan lives here, once,
// not on every "hola".
//
// Design guarantees:
//   · Seed-aware (bet B4 / CEO C-3d): a new user with 0–3 posts has nothing to
//     distil, so the profile is `seed` (inferred from origin_url + onboarding only)
//     and prompts treat it as a light hint, not authoritative brand voice.
//   · Never blocks a turn: any failure (missing table pre-030, OpenAI down) degrades
//     to null → callers fall back to buildSiteContext. It never throws.
//   · Credit-free in tests: WA_MOCK_AGENT returns a deterministic profile so
//     wa-replay / the eval harness exercise the read path without spending.
//
// openai is imported lazily (inside the generator) so this module stays import-safe
// for the plain-node test harness (tests/brain-cortex.mjs).

import type { createAdminClient } from '@/lib/supabase/admin'
import { WA_ROUTER_MODEL, WA_MOCK_AGENT, WA_PROFILE_MIN_POSTS } from './config'
// NOTE: deliberately does NOT import from ./persona — persona.ts imports the read
// helpers from here, and this profiler produces a structured analysis (not
// owner-facing chat), so it needs no shared persona voice. Keeps the graph acyclic.

type Admin = ReturnType<typeof createAdminClient>

export type ProfileSource = 'auto' | 'seed' | 'owner_edited'

export type SeoSnapshot = {
  /** focus keywords already used across recent posts (don't recommend re-covering). */
  focusKeywordsUsed: string[]
  /** pillars/categories going stale — a nudge/angle source (never scanned per turn). */
  opportunities: string[]
  /** most recent publish (approx: newest published post) — drives "fa temps que…". */
  lastPublishedAt: string | null
}

export type BrandTone = { descriptors?: string[]; register?: string; emoji_policy?: string }
export type ContentPillar = { name: string; keywords?: string[]; coverage?: string }
export type WritingRules = { dos?: string[]; donts?: string[] }

export type SiteBrainProfile = {
  siteId: string
  industry: string | null
  audience: string | null
  tone: BrandTone | null
  contentPillars: ContentPillar[] | null
  seo: SeoSnapshot | null
  writingRules: WritingRules | null
  source: ProfileSource
  generatedAt: string | null
  stale: boolean
}

// ─── Pure helpers (unit-tested in tests/brain-cortex.mjs) ─────────────────────

/**
 * Thin-data guard: below the post threshold a distilled profile is worse than none,
 * so we mark it `seed` (a light hint) rather than `auto` (authoritative brand voice).
 */
export function classifyProfileSource(publishedCount: number): 'auto' | 'seed' {
  return publishedCount >= WA_PROFILE_MIN_POSTS ? 'auto' : 'seed'
}

type PostLike = {
  title?: string | null
  excerpt?: string | null
  categories?: string[] | null
  is_published?: boolean | null
  created_at?: string | null
  meta?: { focus_keyword?: unknown } | null
}

/**
 * Precompute the SEO snapshot from the recent posts (this is the aggregate work that
 * MUST NOT run per turn — §2.1). Deterministic and pure so it's testable and cheap.
 * "opportunities" = categories present historically but absent from the most recent
 * window (a topic going quiet), a good source for a proactive angle.
 */
export function computeSeoSnapshot(posts: PostLike[], recentWindow = 8): SeoSnapshot {
  const published = posts.filter((p) => p.is_published === true)

  let lastPublishedAt: string | null = null
  for (const p of published) {
    const ts = p.created_at ?? null
    if (ts && (!lastPublishedAt || ts > lastPublishedAt)) lastPublishedAt = ts
  }

  const focus = new Set<string>()
  for (const p of posts) {
    const fk = p.meta?.focus_keyword
    if (typeof fk === 'string' && fk.trim()) focus.add(fk.trim())
  }

  // Categories seen recently vs historically → the stale ones are opportunities.
  const recentCats = new Set<string>()
  const allCats = new Set<string>()
  posts.forEach((p, i) => {
    for (const c of p.categories ?? []) {
      if (typeof c === 'string' && c.trim()) {
        allCats.add(c.trim())
        if (i < recentWindow) recentCats.add(c.trim())
      }
    }
  })
  const opportunities = [...allCats].filter((c) => !recentCats.has(c)).slice(0, 6)

  return { focusKeywordsUsed: [...focus].slice(0, 12), opportunities, lastPublishedAt }
}

/** Render the profile as the BRAND PROFILE block the writer consumes (Tier-2). */
export function formatBrainProfile(p: SiteBrainProfile): string {
  const lines: string[] = ['BRAND PROFILE' + (p.source === 'seed' ? ' (seed — a light hint, not distilled brand voice yet)' : '') + ':']
  if (p.industry) lines.push(`Industry: ${p.industry}`)
  if (p.audience) lines.push(`Audience: ${p.audience}`)
  if (p.tone) {
    const bits = [
      p.tone.descriptors?.length ? p.tone.descriptors.join(', ') : null,
      p.tone.register ? `register ${p.tone.register}` : null,
      p.tone.emoji_policy ? `emoji ${p.tone.emoji_policy}` : null,
    ].filter(Boolean)
    if (bits.length) lines.push(`Tone: ${bits.join(' · ')}`)
  }
  if (p.contentPillars?.length) {
    lines.push(`Content pillars: ${p.contentPillars.map((c) => c.name).filter(Boolean).join(' · ')}`)
  }
  if (p.writingRules?.dos?.length) lines.push(`Do: ${p.writingRules.dos.join('; ')}`)
  if (p.writingRules?.donts?.length) lines.push(`Don't: ${p.writingRules.donts.join('; ')}`)
  if (p.seo?.opportunities?.length) lines.push(`SEO opportunities (quiet topics): ${p.seo.opportunities.join(' · ')}`)
  return lines.join('\n')
}

// ─── DB read path (per turn — cheap, degrades to null) ────────────────────────

function rowToProfile(siteId: string, row: Record<string, unknown>): SiteBrainProfile {
  const seoRaw = (row.seo ?? null) as Record<string, unknown> | null
  const seo: SeoSnapshot | null = seoRaw
    ? {
        focusKeywordsUsed: Array.isArray(seoRaw.focus_keywords_used) ? (seoRaw.focus_keywords_used as string[]) : [],
        opportunities: Array.isArray(seoRaw.opportunities) ? (seoRaw.opportunities as string[]) : [],
        lastPublishedAt: typeof seoRaw.last_published_at === 'string' ? (seoRaw.last_published_at as string) : null,
      }
    : null
  return {
    siteId,
    industry: (row.industry as string | null) ?? null,
    audience: (row.audience as string | null) ?? null,
    tone: (row.tone as BrandTone | null) ?? null,
    contentPillars: (row.content_pillars as ContentPillar[] | null) ?? null,
    seo,
    writingRules: (row.writing_rules as WritingRules | null) ?? null,
    source: (['auto', 'seed', 'owner_edited'].includes(String(row.source)) ? row.source : 'auto') as ProfileSource,
    generatedAt: (row.generated_at as string | null) ?? null,
    stale: row.stale === true,
  }
}

/** Read a site's brand profile. Returns null pre-migration or when none exists. */
export async function readBrainProfile(admin: Admin, siteId: string): Promise<SiteBrainProfile | null> {
  try {
    const { data, error } = await admin
      .from('site_brain_profiles')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle()
    if (error || !data) return null
    return rowToProfile(siteId, data as Record<string, unknown>)
  } catch {
    return null
  }
}

/** Mark a profile stale on publish (E-17 debounce refresh is the cron's job). */
export async function markProfileStale(admin: Admin, siteId: string): Promise<void> {
  try {
    await admin.from('site_brain_profiles').update({ stale: true }).eq('site_id', siteId)
  } catch {
    /* pre-030 or transient — best-effort, never blocks a publish */
  }
}

// ─── Generation (offline / lazy-on-first-turn — best-effort) ──────────────────

type ProfileInputs = {
  siteName: string
  originUrl: string | null
  categories: string[]
  posts: PostLike[]
  publishedCount: number
  fontHint: string | null
  colorHint: string | null
}

async function gatherInputs(admin: Admin, siteId: string): Promise<ProfileInputs | null> {
  try {
    const [siteRes, themeRes, postsRes] = await Promise.all([
      admin.from('sites').select('name, origin_url').eq('id', siteId).maybeSingle(),
      admin.from('site_themes').select('design_tokens').eq('site_id', siteId).maybeSingle(),
      admin
        .from('posts')
        .select('title, excerpt, categories, is_published, created_at, meta')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    const site = (siteRes.data ?? {}) as { name?: string; origin_url?: string | null }
    const tokens = ((themeRes.data ?? {}) as { design_tokens?: Record<string, unknown> }).design_tokens ?? {}
    const posts = (postsRes.data ?? []) as PostLike[]
    const categories = new Set<string>()
    let publishedCount = 0
    for (const p of posts) {
      if (p.is_published === true) publishedCount++
      for (const c of p.categories ?? []) if (typeof c === 'string' && c.trim()) categories.add(c.trim())
    }
    return {
      siteName: site.name ?? '',
      originUrl: site.origin_url ?? null,
      categories: [...categories].slice(0, 12),
      posts,
      publishedCount,
      fontHint: firstString(tokens, ['fontHeading', 'font_heading', 'fontBody', 'font_body']),
      colorHint: firstString(tokens, ['primary', 'primaryColor', 'primary_color', 'accent']),
    }
  } catch {
    return null
  }
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    industry: { type: 'string' },
    audience: { type: 'string' },
    tone: {
      type: 'object',
      additionalProperties: false,
      properties: {
        descriptors: { type: 'array', items: { type: 'string' } },
        register: { type: 'string' },
        emoji_policy: { type: 'string' },
      },
      required: ['descriptors', 'register', 'emoji_policy'],
    },
    content_pillars: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } },
        required: ['name', 'keywords'],
      },
    },
    writing_rules: {
      type: 'object',
      additionalProperties: false,
      properties: { dos: { type: 'array', items: { type: 'string' } }, donts: { type: 'array', items: { type: 'string' } } },
      required: ['dos', 'donts'],
    },
  },
  required: ['industry', 'audience', 'tone', 'content_pillars', 'writing_rules'],
}

const PROFILE_SYSTEM = `You are a brand + SEO analyst profiling a blog so future articles match its voice. From the blog name, the owner's website URL, the categories and the recent article titles/excerpts, distil a compact brand profile. Be concrete and specific to THIS blog; never invent facts. If there is very little content, infer cautiously from the name and website only and keep it high-level. Write the values in the blog's own language. Return ONLY the JSON object.`

function buildInputMessage(inp: ProfileInputs, seed: boolean): string {
  const lines: string[] = [
    `Blog name: ${inp.siteName || '(unnamed)'}`,
    inp.originUrl ? `Owner website: ${inp.originUrl}` : '',
    inp.categories.length ? `Categories: ${inp.categories.join(' · ')}` : '',
    inp.fontHint || inp.colorHint ? `Visual: ${[inp.fontHint, inp.colorHint].filter(Boolean).join(', ')}` : '',
    seed ? 'NOTE: very few published posts — infer cautiously from the name/website; keep it a light hint.' : '',
    '',
    'Recent posts (newest first):',
  ]
  for (const p of inp.posts.slice(0, 20)) {
    const t = (p.title ?? '').trim()
    if (!t) continue
    const ex = (p.excerpt ?? '').trim().slice(0, 120)
    lines.push(`- «${t}»${ex ? ` — ${ex}` : ''}`)
  }
  return lines.filter((l) => l !== '').join('\n')
}

function mockProfile(inp: ProfileInputs, source: 'auto' | 'seed'): SiteBrainProfile {
  return {
    siteId: '',
    industry: inp.categories[0] ?? 'general',
    audience: 'lectors del blog',
    tone: { descriptors: ['proper', 'clar'], register: 'informal', emoji_policy: 'moderat' },
    contentPillars: inp.categories.slice(0, 4).map((name) => ({ name })),
    seo: computeSeoSnapshot(inp.posts),
    writingRules: { dos: ['concret'], donts: ['floritures buides'] },
    source,
    generatedAt: new Date().toISOString(),
    stale: false,
  }
}

/**
 * Generate (or regenerate) a site's brand profile and persist it. Best-effort:
 * returns null on any failure without throwing. Owner never pays punts for this.
 */
export async function generateSiteBrainProfile(admin: Admin, siteId: string): Promise<SiteBrainProfile | null> {
  const inp = await gatherInputs(admin, siteId)
  if (!inp) return null
  const source = classifyProfileSource(inp.publishedCount)
  const seo = computeSeoSnapshot(inp.posts)

  let profile: SiteBrainProfile
  try {
    if (WA_MOCK_AGENT || !process.env.OPENAI_API_KEY) {
      profile = { ...mockProfile(inp, source), siteId, seo }
    } else {
      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({ maxRetries: 1 })
      const completion = await client.chat.completions.create(
        {
          model: WA_ROUTER_MODEL,
          messages: [
            { role: 'system', content: PROFILE_SYSTEM },
            { role: 'user', content: buildInputMessage(inp, source === 'seed') },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'carma_brand_profile', strict: true, schema: PROFILE_SCHEMA } },
        },
        { timeout: 30_000 },
      )
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>
      profile = {
        siteId,
        industry: str(parsed.industry) || null,
        audience: str(parsed.audience) || null,
        tone: (parsed.tone as BrandTone) ?? null,
        contentPillars: (parsed.content_pillars as ContentPillar[]) ?? null,
        seo,
        writingRules: (parsed.writing_rules as WritingRules) ?? null,
        source,
        generatedAt: new Date().toISOString(),
        stale: false,
      }
    }
  } catch (e) {
    console.error('[wa/profile] generation failed:', e instanceof Error ? e.message : e)
    return null
  }

  // Persist (upsert). Best-effort: a write failure (pre-030) still returns the
  // in-memory profile so the current turn benefits.
  try {
    await admin.from('site_brain_profiles').upsert(
      {
        site_id: siteId,
        industry: profile.industry,
        audience: profile.audience,
        tone: profile.tone,
        content_pillars: profile.contentPillars,
        seo: seo
          ? { focus_keywords_used: seo.focusKeywordsUsed, opportunities: seo.opportunities, last_published_at: seo.lastPublishedAt }
          : null,
        writing_rules: profile.writingRules,
        source: profile.source,
        generated_at: profile.generatedAt,
        stale: false,
      },
      { onConflict: 'site_id' },
    )
  } catch {
    /* pre-030 → the profile still helps this turn; it just isn't cached */
  }
  return profile
}

/**
 * Return the site's profile, generating it lazily on the first agent turn if it's
 * missing (§2.2 case c). Best-effort — null means "degrade to buildSiteContext".
 */
export async function ensureBrainProfile(admin: Admin, siteId: string): Promise<SiteBrainProfile | null> {
  const existing = await readBrainProfile(admin, siteId)
  if (existing) return existing
  return generateSiteBrainProfile(admin, siteId)
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
