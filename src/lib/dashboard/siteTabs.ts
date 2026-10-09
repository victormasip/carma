// W1 (L'INSTANT) — the site page loads the tab you opened, not all six.
//
// Before: `dashboard/sites/[id]/page.tsx` fetched EVERY tab's data before the first
// byte — the article page and four exact counts, 50,000 raw page views, the whole
// `site_themes` row (median 203KB of JSON, chrome blobs included, sent to the
// browser in the RSC payload), the client list, the karma wallet — so opening
// "Articles" paid for "Resum", "Mòduls" and "Usuaris" too. Measured on the local
// replica: 19 database round trips and a 341KB document.
//
// Now the page awaits only its SHELL (the site row and a theme summary of a few
// fields) and hands the active tab's loader to the client as a promise, which
// streams in behind that tab's own <Suspense>. Other tabs load when opened, through
// `loadSiteTabAction` (actions/siteTabs.ts), with the same functions below.
//
// A plain server module, deliberately NOT 'use server': nothing here checks access.
// The page checks it (RLS on the site read) before calling; the action checks it
// before calling. Exporting a server action from here would open it to anyone.

import type { createAdminClient } from '@/lib/supabase/admin'
import { loadPostCounts, loadPostsPage, type PostListPage } from '@/lib/posts/list'
import { fetchSiteStats, type SiteStats } from '@/lib/analytics/read'
import { getKarma } from '@/lib/karma/karma'
import type { SiteModules, ModuleTier } from '@/lib/modules/registry'
import type { DesignTokens } from '@/lib/scrape/tokens'

type Admin = ReturnType<typeof createAdminClient>

export const SITE_TABS = ['resum', 'articles', 'tema', 'moduls', 'connexio', 'usuaris'] as const
export type SiteTab = (typeof SITE_TABS)[number]
export const isSiteTab = (v: unknown): v is SiteTab => SITE_TABS.includes(v as SiteTab)

export type SiteTabData =
  | { tab: 'articles'; page: PostListPage }
  | { tab: 'resum'; stats: SiteStats; total: number; published: number }
  | { tab: 'moduls'; modules: SiteModules | null; plan: ModuleTier; previewPostSlug: string | null }
  | { tab: 'connexio'; apiKey: string | null }
  | { tab: 'usuaris'; assignedUsers: { user_id: string; email: string }[]; availableClients: { id: string; email: string }[] }
  | { tab: 'tema' }

export type SiteTabContext = { siteId: string; isSuperAdmin: boolean; userId: string }

const UNDEFINED_COLUMN = '42703'

/** One tab's data. Only what that tab renders, nothing for its neighbours. */
export async function loadSiteTab(admin: Admin, ctx: SiteTabContext, tab: SiteTab): Promise<SiteTabData> {
  const { siteId, isSuperAdmin, userId } = ctx
  switch (tab) {
    case 'articles':
      return { tab, page: await loadPostsPage(admin, siteId) }

    case 'resum': {
      const [stats, counts] = await Promise.all([fetchSiteStats(admin, siteId, 30), loadPostCounts(admin, siteId)])
      return { tab, stats, total: counts.total, published: counts.published }
    }

    case 'moduls': {
      const [themeRes, karma, newest] = await Promise.all([
        admin.from('site_themes').select('modules').eq('site_id', siteId).maybeSingle(),
        getKarma(userId, admin),
        // The newest published article, for the article-preview toggle.
        admin.from('posts').select('slug').eq('site_id', siteId).eq('is_published', true)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      const modules = themeRes.error?.code === UNDEFINED_COLUMN ? null
        : ((themeRes.data as { modules?: SiteModules | null } | null)?.modules ?? null)
      // Superadmins see the whole catalogue (agency); everyone else gets their plan.
      const plan: ModuleTier = isSuperAdmin ? 'agency' : karma.plan
      return { tab, modules, plan, previewPostSlug: (newest.data as { slug?: string } | null)?.slug ?? null }
    }

    case 'connexio': {
      // The API key only reaches a browser that will show it (the superadmin's
      // Connexió tab); a free owner's "Publica" tab has no use for it.
      if (!isSuperAdmin) return { tab, apiKey: null }
      const { data } = await admin.from('sites').select('api_key').eq('id', siteId).maybeSingle()
      return { tab, apiKey: (data as { api_key?: string } | null)?.api_key ?? null }
    }

    case 'usuaris': {
      if (!isSuperAdmin) return { tab, assignedUsers: [], availableClients: [] }
      const [su, clients] = await Promise.all([
        admin.from('site_users').select('user_id, profiles!inner(email)').eq('site_id', siteId),
        admin.from('profiles').select('id, email').eq('role', 'client').order('email').limit(500),
      ])
      const assignedUsers = (su.data ?? []).map((row) => {
        const p = row.profiles as unknown as { email: string } | { email: string }[] | null
        const email = Array.isArray(p) ? p[0]?.email : p?.email
        return { user_id: row.user_id as string, email: email ?? (row.user_id as string) }
      })
      return { tab, assignedUsers, availableClients: (clients.data ?? []) as { id: string; email: string }[] }
    }

    case 'tema':
      return { tab }
  }
}

// ─── The shell: what every tab shares ────────────────────────────────────────

/**
 * The few theme fields the site page itself reads — detection, the reference URL,
 * the tokens (the embed snippet), the locale, the regeneration quota — WITHOUT the
 * captured chrome (head, header, footer, compiled CSS: a median 203KB that only the
 * Studio edits). The ThemeStudioProvider receives this as a PARTIAL theme and will
 * not autosave until a capture or a template replaces the whole of it.
 */
export type ThemeSummary = {
  reference_url: string | null
  reference_url_home: string | null
  base_url: string | null
  detected_framework: string | null
  detected_hosting: string | null
  design_tokens: Partial<DesignTokens> | null
  default_locale: string | null
  regen_count: number
  blog_url: string | null
}

const SUMMARY_COLS = 'reference_url, reference_url_home, base_url, detected_framework, detected_hosting, design_tokens, default_locale'

export async function loadThemeSummary(admin: Admin, siteId: string): Promise<ThemeSummary | null> {
  let res = await admin.from('site_themes')
    .select(`${SUMMARY_COLS}, regen_count, blog_url:blog_signature->>blogUrl`).eq('site_id', siteId).maybeSingle()
  // Pre-023 (regen_count) or pre-016 (blog_signature): the core fields still answer.
  if (res.error?.code === UNDEFINED_COLUMN) res = await admin.from('site_themes').select(SUMMARY_COLS).eq('site_id', siteId).maybeSingle()
  if (!res.data) return null
  const row = res.data as Partial<ThemeSummary>
  return {
    reference_url: row.reference_url ?? null,
    reference_url_home: row.reference_url_home ?? null,
    base_url: row.base_url ?? null,
    detected_framework: row.detected_framework ?? null,
    detected_hosting: row.detected_hosting ?? null,
    design_tokens: row.design_tokens ?? null,
    default_locale: row.default_locale ?? null,
    regen_count: Number(row.regen_count ?? 0) || 0,
    blog_url: row.blog_url ?? null,
  }
}
