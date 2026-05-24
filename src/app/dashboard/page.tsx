import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Globe, ExternalLink, ShieldAlert, FileText, Users } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import NewSiteModal from './NewSiteModal'

type SiteWithCounts = { id: string; name: string; created_at: string; total: number; published: number }
type Site = { id: string; name: string; created_at: string }

const TABS = [
  { key: 'llocs',   label: 'Llocs',   icon: Globe },
  { key: 'usuaris', label: 'Usuaris', icon: Users },
] as const

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tab: qTab } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isSuperAdmin = profile?.role === 'superadmin'
  const admin = createAdminClient()

  // ── Client: card-based dashboard ─────────────────────────────────────────────
  if (!isSuperAdmin) {
    const { data: sitesData } = await supabase.from('sites').select('id, name, created_at').order('name')
    const sites = (sitesData ?? []) as Site[]

    if (sites.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 bg-white border border-neutral-100 rounded-[2.5rem] text-center shadow-premium">
          <div className="w-20 h-20 bg-neutral-100 text-neutral-400 rounded-2xl flex items-center justify-center mb-6">
            <ShieldAlert className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-extrabold text-neutral-900 mb-2">No tens llocs assignats</h3>
          <p className="text-neutral-500 text-sm max-w-md leading-relaxed">
            Contacta amb el teu administrador perquè configuri el teu entorn.
          </p>
        </div>
      )
    }

    const { data: postRows } = await admin
      .from('posts').select('site_id, is_published').in('site_id', sites.map(s => s.id))

    const countMap = new Map<string, { total: number; published: number }>()
    for (const row of postRows ?? []) {
      const sId = row.site_id as string
      const e = countMap.get(sId) ?? { total: 0, published: 0 }
      e.total++
      if (row.is_published) e.published++
      countMap.set(sId, e)
    }

    const sitesWithCounts: SiteWithCounts[] = sites.map(s => ({ ...s, ...(countMap.get(s.id) ?? { total: 0, published: 0 }) }))

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <header>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">Els meus Llocs</h1>
          <p className="text-sm text-neutral-500 mt-1 font-medium">Gestiona el contingut dels teus llocs web.</p>
        </header>
        <SiteGrid sites={sitesWithCounts} />
      </div>
    )
  }

  // ── Superadmin: tabbed dashboard ──────────────────────────────────────────────
  const activeTab = typeof qTab === 'string' && TABS.some(t => t.key === qTab) ? qTab : 'llocs'

  const [{ data: sites, error }, { data: clientProfiles }, { data: postRows }] = await Promise.all([
    admin.from('sites').select('id, name, created_at').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, email').eq('role', 'client').order('email'),
    admin.from('posts').select('site_id, is_published'),
  ])


  const countMap = new Map<string, { total: number; published: number }>()
  for (const row of postRows ?? []) {
    const sId = row.site_id as string
    const e = countMap.get(sId) ?? { total: 0, published: 0 }
    e.total++
    if (row.is_published) e.published++
    countMap.set(sId, e)
  }

  const sitesWithCounts: SiteWithCounts[] = (sites ?? []).map(s => ({
    ...s, ...(countMap.get(s.id) ?? { total: 0, published: 0 }),
  }))

  // Tab-specific data
  const siteUserCounts: Record<string, number> = {}
  if (activeTab === 'usuaris') {
    const { data: su } = await admin.from('site_users').select('user_id')
    for (const row of su ?? []) {
      siteUserCounts[row.user_id] = (siteUserCounts[row.user_id] ?? 0) + 1
    }
  }

  const tabCounts: Record<string, number> = {
    llocs:   sitesWithCounts.length,
    usuaris: (clientProfiles ?? []).length,
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">Panell d&apos;Administració</h1>
          <p className="text-sm text-neutral-500 mt-2 font-medium">Gestiona la infraestructura i els llocs web dels clients.</p>
        </div>
        {activeTab === 'llocs' && (
          <NewSiteModal clients={(clientProfiles ?? []) as { id: string; email: string }[]} />
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 p-1 rounded-2xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={key === 'llocs' ? '/dashboard' : `/dashboard?tab=${key}`}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span className="text-xs font-semibold text-neutral-400">({tabCounts[key]})</span>
          </Link>
        ))}
      </div>

      {error ? (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">
          Error carregant les dades: {error.message}
        </div>
      ) : (
        <>
          {activeTab === 'llocs' && (
            sitesWithCounts.length === 0 ? (
              <div className="relative flex flex-col items-center justify-center py-24 bg-white border border-neutral-100 rounded-[2.5rem] text-center shadow-premium overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-carma-400/10 blur-[80px] pointer-events-none" />
                <div className="relative z-10 w-20 h-20 bg-gradient-to-br from-carma-100 to-white border border-carma-200/50 text-carma-500 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <Globe className="w-10 h-10 drop-shadow-sm" />
                </div>
                <h3 className="relative z-10 text-xl font-extrabold text-neutral-900 mb-2">Cap lloc web creat</h3>
                <p className="relative z-10 text-neutral-500 text-sm max-w-md leading-relaxed">
                  Afegeix el teu primer lloc per començar a generar contingut.
                </p>
              </div>
            ) : (
              <SiteGrid sites={sitesWithCounts} />
            )
          )}

          {activeTab === 'usuaris' && (
            <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden shadow-sm">
              {(clientProfiles ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="w-10 h-10 text-neutral-300 mb-3" />
                  <p className="text-sm font-semibold text-neutral-500">Encara no hi ha clients registrats</p>
                  <p className="text-xs text-neutral-400 mt-1">Crea usuaris amb rol &quot;client&quot; des de Supabase</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="text-left text-[11px] font-bold text-neutral-400 uppercase tracking-widest px-6 py-4">Email</th>
                      <th className="text-left text-[11px] font-bold text-neutral-400 uppercase tracking-widest px-6 py-4">Llocs assignats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(clientProfiles as { id: string; email: string }[]).map((client, i) => (
                      <tr key={client.id} className={`hover:bg-neutral-50 transition-colors ${i > 0 ? 'border-t border-neutral-50' : ''}`}>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-neutral-800">{client.email}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg ${
                            siteUserCounts[client.id]
                              ? 'bg-carma-50 text-carma-700'
                              : 'bg-neutral-100 text-neutral-400'
                          }`}>
                            <Globe className="w-3 h-3" />
                            {siteUserCounts[client.id] ?? 0} lloc{(siteUserCounts[client.id] ?? 0) !== 1 ? 's' : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </>
      )}
    </div>
  )
}

function SiteGrid({ sites }: { sites: SiteWithCounts[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sites.map((site) => (
        <Link
          href={`/dashboard/sites/${site.id}`}
          key={site.id}
          className="group bg-white p-7 rounded-3xl border border-neutral-100 shadow-sm hover:shadow-premium transition-all duration-300 flex flex-col relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-neutral-100 group-hover:bg-gradient-to-r group-hover:from-carma-400 group-hover:to-carma-600 transition-all duration-500" />
          <div className="flex items-start justify-between mt-2 mb-4">
            <h3 className="font-bold text-xl text-neutral-900 truncate pr-4 leading-tight">{site.name}</h3>
            <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center group-hover:bg-carma-50 transition-colors shrink-0">
              <ExternalLink className="w-4 h-4 text-neutral-400 group-hover:text-carma-600 transition-colors" />
            </div>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
              <FileText className="w-3.5 h-3.5" />
              <span>{site.total} {site.total === 1 ? 'article' : 'articles'}</span>
            </div>
            {site.published > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>{site.published} publicat{site.published !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="mt-auto pt-3 border-t border-neutral-50 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-neutral-400">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-carma-500" />
              Accedir al lloc
            </span>
            <span className="font-medium normal-case text-[10px]">
              {new Date(site.created_at).toLocaleDateString('ca-ES')}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
