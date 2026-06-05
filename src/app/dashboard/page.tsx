import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Globe, ArrowUpRight, FileText, Users, Inbox, ExternalLink, PenLine, CheckCircle2, Eye } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import NewSiteModal from './NewSiteModal'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { fetchSitesViewCounts } from '@/lib/analytics/read'

type SiteWithCounts = { id: string; name: string; created_at: string; total: number; published: number; views: number }

export default async function DashboardHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isSuperAdmin = profile?.role === 'superadmin'
  const admin = createAdminClient()

  // ── Client dashboard ─────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    const { data: sitesData } = await supabase.from('sites').select('id, name, created_at').order('name')
    const sites = (sitesData ?? []) as { id: string; name: string; created_at: string }[]

    if (sites.length === 0) {
      return (
        <EmptyState
          icon={<Inbox className="w-7 h-7" />}
          title="No tens llocs assignats"
          description="Contacta amb el teu administrador perquè configuri el teu entorn."
        />
      )
    }

    const siteIds = sites.map(s => s.id)
    const [{ data: postRows }, viewMap] = await Promise.all([
      admin.from('posts').select('site_id, is_published').in('site_id', siteIds),
      fetchSitesViewCounts(admin, siteIds),
    ])
    const sitesWithCounts = withCounts(sites, postRows, viewMap)
    const totals = aggregate(sitesWithCounts)

    return (
      <div className="space-y-8">
        <PageHeader title="Els meus Llocs" description="Gestiona el contingut dels teus llocs web." />
        <StatHero items={[
          { icon: <Eye className="w-4 h-4" />, label: 'Vistes · 30 dies', value: totals.views, tone: 'accent' },
          { icon: <Globe className="w-4 h-4" />, label: 'Llocs', value: sitesWithCounts.length },
          { icon: <FileText className="w-4 h-4" />, label: 'Articles', value: totals.total },
          { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Publicats', value: totals.published, tone: 'success' },
        ]} />
        <SiteGrid sites={sitesWithCounts} />
      </div>
    )
  }

  // ── Superadmin dashboard (bento — no more tabs) ───────────────────────────────
  const [{ data: sites, error }, { data: clientProfiles }, { data: postRows }, { data: su }] = await Promise.all([
    admin.from('sites').select('id, name, created_at').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, email').eq('role', 'client').order('email'),
    admin.from('posts').select('site_id, is_published'),
    admin.from('site_users').select('user_id'),
  ])

  const siteList = (sites ?? []) as { id: string; name: string; created_at: string }[]
  const viewMap = await fetchSitesViewCounts(admin, siteList.map(s => s.id))
  const sitesWithCounts = withCounts(siteList, postRows, viewMap)
  const totals = aggregate(sitesWithCounts)
  const clients = (clientProfiles ?? []) as { id: string; email: string }[]

  const siteUserCounts: Record<string, number> = {}
  for (const row of su ?? []) siteUserCounts[row.user_id] = (siteUserCounts[row.user_id] ?? 0) + 1

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
            { icon: <Users className="w-4 h-4" />, label: 'Clients', value: clients.length },
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
              <SiteGrid sites={sitesWithCounts} />
            )}
          </section>

          <section className="space-y-4">
            <SectionTitle icon={<Users className="w-4 h-4" />} title="Clients" count={clients.length} />
            {clients.length === 0 ? (
              <EmptyState
                icon={<Users className="w-7 h-7" />}
                title="Encara no hi ha clients registrats"
                description="Crea usuaris amb rol &quot;client&quot; des de Supabase."
              />
            ) : (
              <div className="bg-surface border border-border rounded-2xl divide-y divide-border overflow-hidden">
                {clients.map(client => (
                  <div key={client.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-hover transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-surface-subtle text-muted flex items-center justify-center text-sm font-bold shrink-0 uppercase">
                        {client.email.charAt(0)}
                      </span>
                      <span className="text-sm font-medium text-text truncate">{client.email}</span>
                    </div>
                    <Badge tone={siteUserCounts[client.id] ? 'accent' : 'neutral'} dot={!!siteUserCounts[client.id]}>
                      {siteUserCounts[client.id] ?? 0} lloc{(siteUserCounts[client.id] ?? 0) !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function withCounts(
  sites: { id: string; name: string; created_at: string }[],
  postRows: { site_id: string; is_published: boolean }[] | null,
  viewMap: Record<string, number>,
): SiteWithCounts[] {
  const map = new Map<string, { total: number; published: number }>()
  for (const row of postRows ?? []) {
    const e = map.get(row.site_id) ?? { total: 0, published: 0 }
    e.total++
    if (row.is_published) e.published++
    map.set(row.site_id, e)
  }
  return sites.map(s => ({ ...s, ...(map.get(s.id) ?? { total: 0, published: 0 }), views: viewMap[s.id] ?? 0 }))
}

function aggregate(sites: SiteWithCounts[]) {
  return sites.reduce(
    (acc, s) => ({ total: acc.total + s.total, published: acc.published + s.published, views: acc.views + s.views }),
    { total: 0, published: 0, views: 0 },
  )
}

// ── presentational ──────────────────────────────────────────────────────────

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

function SiteGrid({ sites }: { sites: SiteWithCounts[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {sites.map(site => (
        <SiteCard key={site.id} site={site} />
      ))}
    </div>
  )
}

// Interactive bento card. The whole surface navigates to the site (a stretched,
// absolutely-positioned link), while the action buttons sit above it (z-10) and
// navigate to their own targets — so one card exposes three direct actions
// without nesting <a> inside <a>.
function SiteCard({ site }: { site: SiteWithCounts }) {
  return (
    <div className="group relative bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:border-border-strong hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.25)] hover:-translate-y-0.5">
      <Link href={`/dashboard/sites/${site.id}`} aria-label={site.name} className="absolute inset-0 z-0 rounded-2xl" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-soft to-surface-subtle text-accent flex items-center justify-center text-base font-bold shrink-0 uppercase border border-border">
            {site.name.charAt(0) || '·'}
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-[15px] text-text truncate leading-tight group-hover:text-accent transition-colors">{site.name}</h3>
            <p className="text-xs text-subtle mt-0.5">Creat el {new Date(site.created_at).toLocaleDateString('ca-ES')}</p>
          </div>
        </div>
        <span className="w-7 h-7 rounded-lg bg-surface-subtle text-subtle flex items-center justify-center shrink-0 group-hover:bg-accent-soft group-hover:text-accent transition-colors">
          <ArrowUpRight className="w-4 h-4" />
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="accent"><Eye className="w-3 h-3" />{site.views.toLocaleString('ca-ES')} {site.views === 1 ? 'vista' : 'vistes'} · 30d</Badge>
        <Badge tone="neutral"><FileText className="w-3 h-3" />{site.total} {site.total === 1 ? 'article' : 'articles'}</Badge>
        {site.published > 0 && <Badge tone="success" dot>{site.published} publicat{site.published !== 1 ? 's' : ''}</Badge>}
      </div>

      <div className="flex items-center gap-1.5 mt-auto pt-3 border-t border-border">
        <Link
          href={`/dashboard/sites/${site.id}/posts/new`}
          className="relative z-10 flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-bold text-text bg-surface border border-border hover:border-accent/40 hover:text-accent hover:bg-accent-soft rounded-lg transition-all"
        >
          <PenLine className="w-3.5 h-3.5" /> Escriure
        </Link>
        <a
          href={`/render/${site.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Veure el lloc públic"
          className="relative z-10 flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-bold text-muted bg-surface border border-border hover:border-accent/40 hover:text-accent hover:bg-accent-soft rounded-lg transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Veure
        </a>
      </div>
    </div>
  )
}
