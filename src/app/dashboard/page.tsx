import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Globe, FileText, Users, Inbox, CheckCircle2, Eye } from 'lucide-react'
import { redirect } from 'next/navigation'
import NewSiteModal from './NewSiteModal'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { fetchSitesViewCounts } from '@/lib/analytics/read'
import SiteGrid from './SiteGrid'
import AddSiteButton from './AddSiteButton'

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
        <PageHeader
          title="Els meus Llocs"
          description="Gestiona el contingut dels teus llocs web."
          actions={<AddSiteButton />}
        />
        <StatHero items={[
          { icon: <Eye className="w-4 h-4" />, label: 'Vistes · 30 dies', value: totals.views, tone: 'accent' },
          { icon: <Globe className="w-4 h-4" />, label: 'Llocs', value: sitesWithCounts.length },
          { icon: <FileText className="w-4 h-4" />, label: 'Articles', value: totals.total },
          { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Publicats', value: totals.published, tone: 'success' },
        ]} />
        <SiteGrid sites={sitesWithCounts} canManage={false} />
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
              <SiteGrid sites={sitesWithCounts} canManage={true} />
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

