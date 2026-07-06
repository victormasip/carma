import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { Globe, FileText, Users, CheckCircle2, Eye, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import NewSiteModal from './NewSiteModal'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { fetchSitesViewCounts } from '@/lib/analytics/read'
import { SITE_LIMITS, type KarmaPlan } from '@/lib/karma/config'
import { formatNumber } from '@/lib/format'
import SiteGrid from './SiteGrid'
import AddSiteButton from './AddSiteButton'

type SiteWithCounts = { id: string; name: string; created_at: string; logo_url?: string | null; total: number; published: number; views: number }
type SiteRow = { id: string; name: string; created_at: string; logo_url?: string | null }

export default async function DashboardHome() {
  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  const admin = createAdminClient()

  // ── Client dashboard ─────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    // 42703-safe: sites.logo_url only exists after migration 022; profiles.plan
    // after 028. The plan decides whether "Afegir lloc" is real (SITE_LIMITS).
    const [sitesQ, planQ] = await Promise.all([
      supabase.from('sites').select('id, name, created_at, logo_url').order('name'),
      supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle(),
    ])
    let sitesRes = sitesQ
    if (sitesRes.error?.code === '42703') sitesRes = await supabase.from('sites').select('id, name, created_at').order('name') as typeof sitesRes
    const sites = (sitesRes.data ?? []) as unknown as SiteRow[]
    const plan = ((['free', 'premium', 'gold', 'agency'].includes((planQ.data as { plan?: string } | null)?.plan ?? '')
      ? (planQ.data as { plan?: string } | null)?.plan : 'free')) as KarmaPlan
    const canCreate = sites.length < SITE_LIMITS[plan]

    if (sites.length === 0) {
      // Free tier is one blog. A client with zero (new, or just deleted theirs)
      // can self-serve create one through the onboarding funnel — no dead-end.
      return (
        <EmptyState
          icon={<Sparkles className="w-7 h-7" />}
          title="Encara no tens cap blog"
          description="Crea el teu blog en un minut: replica una web que ja tinguis o comença des d’una plantilla."
          action={
            <Link
              href="/benvinguda"
              className="btn-gold inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold"
            >
              <Sparkles className="h-4 w-4" /> Crear el meu blog
            </Link>
          }
        />
      )
    }

    const siteIds = sites.map(s => s.id)
    const [postCounts, viewMap] = await Promise.all([
      fetchPostCounts(admin, siteIds),
      fetchSitesViewCounts(admin, siteIds),
    ])
    const sitesWithCounts = withCounts(sites, postCounts, viewMap)
    const totals = aggregate(sitesWithCounts)

    const isSingle = sitesWithCounts.length === 1
    return (
      <div className="space-y-8">
        <PageHeader
          title={isSingle ? 'El meu blog' : 'Els meus blogs'}
          description="Tot el teu contingut, en un sol lloc."
          actions={<AddSiteButton canCreate={canCreate} />}
        />
        <ClientStatBento
          views={totals.views}
          sites={sitesWithCounts.length}
          total={totals.total}
          published={totals.published}
        />
        <SiteGrid sites={sitesWithCounts} canManage={false} />
      </div>
    )
  }

  // ── Superadmin dashboard (bento — no more tabs) ───────────────────────────────
  // Sites are fetched first (with a 42703-safe retry for the logo_url column),
  // then the rest in parallel.
  const sitesSel = (cols: string) => admin.from('sites').select(cols).order('created_at', { ascending: false })
  let sitesRes = await sitesSel('id, name, created_at, logo_url')
  if (sitesRes.error?.code === '42703') sitesRes = await sitesSel('id, name, created_at')
  const { data: sites, error } = sitesRes
  // clientProfiles: only for NewSiteModal's assign-to-client picker — the
  // clients LIST view moved to /admin/users (founder directive 2026-07-06).
  const [{ data: clientProfiles }, postCounts] = await Promise.all([
    admin.from('profiles').select('id, email').eq('role', 'client').order('email'),
    fetchPostCounts(admin, null),
  ])

  const siteList = (sites ?? []) as unknown as SiteRow[]
  const viewMap = await fetchSitesViewCounts(admin, siteList.map(s => s.id))
  const sitesWithCounts = withCounts(siteList, postCounts, viewMap)
  const totals = aggregate(sitesWithCounts)
  const clients = (clientProfiles ?? []) as { id: string; email: string }[]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Panell d'Administració"
        description="Gestiona la infraestructura i els llocs web dels clients."
        actions={<NewSiteModal clients={clients} />}
      />

      {error ? (
        <div className="p-4 bg-danger-soft border border-danger/20 rounded-xl text-danger text-sm font-medium">
          Error carregant les dades: {error.message}
        </div>
      ) : (
        <>
          <StatHero items={[
            { icon: <Eye className="w-4 h-4" />, label: 'Vistes · 30 dies', value: totals.views, tone: 'accent' },
            { icon: <Globe className="w-4 h-4" />, label: 'Llocs', value: sitesWithCounts.length },
            { icon: <FileText className="w-4 h-4" />, label: 'Articles', value: totals.total },
            { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Publicats', value: totals.published, tone: 'success' },
          ]} />

          <section className="space-y-4">
            <SectionTitle icon={<Globe className="w-4 h-4" />} title="Llocs web" count={sitesWithCounts.length} />
            {sitesWithCounts.length === 0 ? (
              <EmptyState
                icon={<Globe className="w-7 h-7" />}
                title="Cap lloc web creat"
                description="Afegeix el teu primer lloc per començar a generar contingut."
              />
            ) : (
              <SiteGrid sites={sitesWithCounts} canManage={true} />
            )}
          </section>

          {/* La llista de clients viu a /admin/users (cerca, plans, punts,
              accions) — aquí només un accés directe, no una segona còpia. */}
          <Link
            href="/admin/users"
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 no-underline transition-colors hover:border-accent/40 hover:bg-surface-hover"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Users className="h-4.5 w-4.5" />
              </span>
              <span>
                <span className="block text-sm font-bold text-text">Gestió d&apos;usuaris</span>
                <span className="block text-xs text-muted">{clients.length} client{clients.length !== 1 ? 's' : ''} · plans, punts i accions a /admin/users</span>
              </span>
            </span>
            <span className="text-xs font-bold text-subtle transition-colors group-hover:text-accent">Obrir →</span>
          </Link>
        </>
      )}
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

type PostCounts = Map<string, { total: number; published: number }>

// Article counts per site — ONE grouped query at the database (migració 029)
// instead of downloading every post row and counting in JS. 42883-safe: without
// the migration it falls back to the old row-fetch, so nothing breaks.
async function fetchPostCounts(admin: ReturnType<typeof createAdminClient>, siteIds: string[] | null): Promise<PostCounts> {
  try {
    const { data, error } = await admin.rpc('posts_counts_by_site', { p_site_ids: siteIds })
    if (!error && Array.isArray(data)) {
      return new Map((data as { site_id: string; total: number | string; published: number | string }[])
        .map(r => [r.site_id, { total: Number(r.total), published: Number(r.published) }]))
    }
  } catch { /* pre-migració 029 → fallback */ }

  let q = admin.from('posts').select('site_id, is_published')
  if (siteIds) q = q.in('site_id', siteIds)
  const { data: rows } = await q
  const map: PostCounts = new Map()
  for (const row of (rows ?? []) as { site_id: string; is_published: boolean }[]) {
    const e = map.get(row.site_id) ?? { total: 0, published: 0 }
    e.total++
    if (row.is_published) e.published++
    map.set(row.site_id, e)
  }
  return map
}

function withCounts(
  sites: SiteRow[],
  postCounts: PostCounts,
  viewMap: Record<string, number>,
): SiteWithCounts[] {
  return sites.map(s => ({ ...s, ...(postCounts.get(s.id) ?? { total: 0, published: 0 }), views: viewMap[s.id] ?? 0 }))
}

function aggregate(sites: SiteWithCounts[]) {
  return sites.reduce(
    (acc, s) => ({ total: acc.total + s.total, published: acc.published + s.published, views: acc.views + s.views }),
    { total: 0, published: 0, views: 0 },
  )
}

// ── presentational ──────────────────────────────────────────────────────────

// Client bento — a calm, premium metric strip. One hero tile (30-day views) and
// two consolidated tiles. Borders give way to soft shadows; the "published" count
// folds into Articles so there are three numbers to read, not four.
function ClientStatBento({ views, sites, total, published }: { views: number; sites: number; total: number; published: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Hero — 30-day views */}
      <div className="relative col-span-2 overflow-hidden rounded-2xl bg-gradient-to-br from-accent-soft via-surface to-surface p-6 shadow-card">
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-2xl" aria-hidden />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-on-accent">
          <Eye className="h-5 w-5" />
        </span>
        <p className="relative mt-5 text-[2.5rem] font-bold leading-none tabular-nums text-text">{formatNumber(views)}</p>
        <p className="relative mt-2 text-sm font-medium text-muted">Visites · últims 30 dies</p>
      </div>

      <BentoTile icon={<Globe className="h-5 w-5" />} label={sites === 1 ? 'Blog' : 'Blogs'} value={sites} />
      <BentoTile
        icon={<FileText className="h-5 w-5" />}
        label="Articles"
        value={total}
        sub={`${formatNumber(published)} publicat${published !== 1 ? 's' : ''}`}
      />
    </div>
  )
}

function BentoTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-6 shadow-card">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <p className="mt-5 text-[2rem] font-bold leading-none tabular-nums text-text">{formatNumber(value)}</p>
      <p className="mt-2 text-sm font-medium text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-subtle">{sub}</p>}
    </div>
  )
}

function StatHero({ items }: { items: { icon: React.ReactNode; label: string; value: number; tone?: 'accent' | 'success' }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map(it => (
        <div key={it.label} className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-3.5">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            it.tone === 'success' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'
          }`}>
            {it.icon}
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-text leading-none tabular-nums">{it.value}</p>
            <p className="text-xs font-medium text-subtle mt-1">{it.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{icon}</span>
      <h2 className="text-sm font-bold text-text">{title}</h2>
      <span className="text-xs font-semibold text-subtle bg-surface-subtle rounded-full px-2 py-0.5">{count}</span>
    </div>
  )
}

