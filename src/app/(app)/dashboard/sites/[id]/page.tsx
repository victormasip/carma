import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import SiteDetailClient from './SiteDetailClient'
import { isSiteTab, loadSiteTab, loadThemeSummary, type SiteTab, type SiteTabData } from '@/lib/dashboard/siteTabs'
import { loadPostCounts } from '@/lib/posts/list'
import { WA_BANNER_COOKIE, wpDiscoveryCookie } from './dismissals'

// W1 (L'INSTANT): this page loads its SHELL — the site row (which is also the
// access check: a client reads it through RLS), a summary of its theme, two
// booleans — and the ONE tab you opened, all in the same parallel round. The other
// tabs load when you open them. See lib/dashboard/siteTabs.ts.
//
// Why the opened tab is awaited here and not streamed behind its own boundary:
// React 19.2 holds every streamed reveal until 300ms after the previous paint
// ($RC → $RT + 300 in the HTML). The route's skeleton (loading.tsx) is already one
// reveal; a nested boundary for the tab was a second one, and measured +300–470ms
// of "content ready" for data that took a few milliseconds. One round, one reveal.

/** Never let one tab's failure reject the page's round (see initialTabData). */
function settleTab(p: Promise<SiteTabData>): Promise<{ data: SiteTabData } | { error: unknown }> {
  return p.then(data => ({ data }), (error: unknown) => ({ error }))
}

export default async function SiteDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ id: siteId }, { tab: qTab, clone: qClone, nova: qNova }] = await Promise.all([params, searchParams])
  const autoCloneUrl = typeof qClone === 'string' && qClone ? qClone : undefined
  // ?nova=1 — arrived from "encara no tinc web". The onboarding opens on the
  // template picker; there is nothing to capture and nothing to ask.
  const startWithoutSite = qNova === '1'

  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  const admin = createAdminClient()

  // The tab to open follows from the URL in every case but one (a ?clone= intent
  // without ?tab=, settled below once we know whether the site is pristine).
  const tabCtx = { siteId, isSuperAdmin, userId: user.id }
  const urlTab: SiteTab = isSiteTab(qTab) ? qTab : 'articles'

  // Select the site, including `subdomain` (migration 021). 42703-safe: if the
  // column isn't present yet we retry without it so the page still renders.
  const siteSel = (cols: string) =>
    (isSuperAdmin ? admin : supabase).from('sites').select(cols).eq('id', siteId).single()
  // The tab's data rides in the same round as the access check, like the theme
  // summary always has: nothing reaches the page unless the site row comes back.
  const [siteFirst, theme, waConnectedRes, cookieStore, urlTabData] = await Promise.all([
    siteSel('id, name, created_at, subdomain, origin_url'),
    loadThemeSummary(admin, siteId),
    // Onboarding step 3 (founder directive 2026-07-06): connecting the WhatsApp
    // agent must be an EVIDENT step. 42P01-safe: without the WhatsApp migrations
    // the banner simply never shows.
    admin.from('wa_identities').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
    cookies(),
    settleTab(loadSiteTab(admin, tabCtx, urlTab)),
  ])
  let { data: site, error: siteError } = siteFirst
  // 42703 walks back one column at a time: origin_url (022) is newer than
  // subdomain (021), so a half-migrated database still renders the page.
  if (siteError?.code === '42703') {
    ;({ data: site, error: siteError } = await siteSel('id, name, created_at, subdomain'))
  }
  if (siteError?.code === '42703') {
    ;({ data: site, error: siteError } = await siteSel('id, name, created_at'))
  }
  if (siteError || !site) redirect('/dashboard')
  const siteRow = site as unknown as {
    id: string; name: string; created_at: string
    subdomain?: string | null
    /** Where this blog was cloned from. The import never has to ask again. */
    origin_url?: string | null
  }
  const waConnected = waConnectedRes.error ? true : (waConnectedRes.count ?? 0) > 0

  // A pristine site (no theme captured, no posts) gets the onboarding chooser. A
  // site with a theme is not pristine, and costs no count to know it.
  const isNewSite = !theme && (await loadPostCounts(admin, siteId)).total === 0

  // No explicit ?tab= opens the FIRST tab (Articles) — the content workspace.
  let defaultTab: SiteTab = urlTab
  // A ?clone= intent on an ALREADY-configured site used to be silently ignored
  // (the onboarding only mounts on pristine sites) — the clone link felt broken
  // (founder report 2026-07-06). Honour the intent by landing on the Tema tab,
  // where re-capture lives (with its own freemium regen quota UX).
  if (autoCloneUrl && !isNewSite && !qTab) defaultTab = 'tema'
  const settledTab = defaultTab === urlTab ? urlTabData : await settleTab(loadSiteTab(admin, tabCtx, defaultTab))
  // A failed tab travels as a rejected promise: `use()` rethrows it inside the
  // tab's own ErrorBoundary, so the header, the tabs and the sidebar still render.
  const initialTabData = 'data' in settledTab ? settledTab.data : Promise.reject(settledTab.error)

  return (
    <SiteDetailClient
      siteId={siteId}
      siteName={siteRow.name}
      siteCreatedAt={siteRow.created_at}
      subdomain={siteRow.subdomain ?? undefined}
      originUrl={siteRow.origin_url ?? null}
      isSuperAdmin={isSuperAdmin}
      isNewSite={isNewSite}
      startWithoutSite={startWithoutSite}
      initialTheme={theme}
      defaultTab={defaultTab}
      initialTabData={initialTabData}
      autoCloneUrl={autoCloneUrl}
      waConnected={waConnected}
      // Dismissals live in cookies, so the server renders the page the visitor
      // will keep: a banner that appears after hydration shifts the whole layout
      // (CLS 0.24–0.27 measured on this page with localStorage dismissals).
      waBannerDismissed={cookieStore.get(WA_BANNER_COOKIE)?.value === '1'}
      wpDiscoveryDismissed={cookieStore.get(wpDiscoveryCookie(siteId))?.value === '1'}
      siteDefaultLocale={theme?.default_locale ?? undefined}
      regenCount={theme?.regen_count ?? 0}
    />
  )
}
