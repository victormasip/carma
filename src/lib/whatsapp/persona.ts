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
- Never mention being an AI/language model, internal systems, jobs, queues or prompts.`

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
}

/**
 * Query everything the prompts need to know about one site, in parallel. Every
 * read degrades gracefully (missing column / pre-migration env → field is null),
 * because a context miss must never block a turn.
 */
export async function buildSiteContext(admin: Admin, siteId: string): Promise<SiteContext> {
  const [siteRes, themeRes, postsRes] = await Promise.all([
    admin.from('sites').select('name, subdomain, origin_url').eq('id', siteId).maybeSingle(),
    admin
      .from('site_themes')
      .select('default_locale, locales, section_title, design_tokens')
      .eq('site_id', siteId)
      .maybeSingle(),
    admin
      .from('posts')
      .select('title, categories, is_published')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const site = (siteRes.data ?? {}) as { name?: string; subdomain?: string | null; origin_url?: string | null }
  const theme = (themeRes.data ?? {}) as {
    default_locale?: string
    locales?: string[]
    section_title?: string | null
    design_tokens?: Record<string, unknown>
  }

  const locale = normalizeLocale(theme.default_locale ?? DEFAULT_LOCALE)

  const categories = new Set<string>()
  const recentTitles: string[] = []
  for (const row of postsRes.data ?? []) {
    for (const c of (row.categories as string[] | null) ?? []) if (c?.trim()) categories.add(c.trim())
    if (recentTitles.length < 6 && typeof row.title === 'string' && row.title.trim()) recentTitles.push(row.title.trim())
  }

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
    `Article language: ${ctx.localeNative} (${ctx.locale})${ctx.locales.length > 1 ? ` · also publishes in: ${ctx.locales.join(', ')}` : ''}`,
  ]
  if (ctx.originUrl) lines.push(`Owner's website: ${ctx.originUrl}`)
  if (ctx.sectionTitle) lines.push(`Blog section title: ${ctx.sectionTitle}`)
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
