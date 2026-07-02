import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Palette, ArrowRight, Globe } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import PageHeader from '@/components/ui/PageHeader'

// Studio hub — the sidebar entry point for the fullscreen editor. One site →
// straight into it (zero decisions); several → a chooser of premium cards.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Studio · Carma' }

export default async function StudioHubPage() {
  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  const { data } = isSuperAdmin
    ? await createAdminClient().from('sites').select('id, name, subdomain').order('created_at', { ascending: false }).limit(40)
    : await supabase.from('sites').select('id, name, subdomain').order('name')
  const sites = (data ?? []) as { id: string; name: string; subdomain?: string | null }[]

  if (sites.length === 0) redirect('/benvinguda')
  if (sites.length === 1) redirect(`/edit/${sites[0].id}?from=studio`)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Carma Studio"
        description="Tria el blog que vols editar — s’obre en pantalla completa, editant la pàgina real."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <Link
            key={site.id}
            href={`/edit/${site.id}?from=studio`}
            className="lift group relative overflow-hidden rounded-2xl border border-border bg-surface p-6 no-underline shadow-card"
          >
            <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-accent/10 blur-2xl" aria-hidden />
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Palette className="h-5 w-5" />
            </span>
            <p className="mt-4 truncate text-base font-extrabold tracking-tight text-text">{site.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium text-subtle">
              <Globe className="h-3 w-3 shrink-0" />
              {site.subdomain ? `${site.subdomain}.carma` : 'sense subdomini'}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-accent">
              Obre l&apos;Studio
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
