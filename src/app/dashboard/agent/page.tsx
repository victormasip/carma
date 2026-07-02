import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { WA_AGENT_NUMBER } from '@/lib/whatsapp/config'
import AgentClient from './AgentClient'
import type { Identity, Scope } from './AgentConnection'

// Per-user surface (identities, memberships, live activity) — never prerendered.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Agent · Carma' }

export type AgentActivityRow = {
  postId: string
  title: string
  siteName: string
  liveUrl: string | null
  publishedAt: string | null
  createdAt: string
  channel: 'whatsapp' | 'console'
}

export default async function AgentPage() {
  const { supabase, user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  const admin = createAdminClient()

  // Identities + scopes are RLS-scoped to the owner (same reads as the old
  // Configuració page). Sites: superadmins operate on all, clients on theirs.
  const [identitiesRes, scopesRes, sitesRes] = await Promise.all([
    supabase
      .from('wa_identities')
      .select('id, phone_e164, status, verify_code, verify_expires_at, verified_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase.from('wa_identity_sites').select('identity_id, site_id'),
    isSuperAdmin
      ? admin.from('sites').select('id, name').order('created_at', { ascending: false }).limit(40)
      : supabase.from('sites').select('id, name').order('name'),
  ])

  const sites = (sitesRes.data ?? []) as { id: string; name: string }[]
  const siteNames = new Map(sites.map((s) => [s.id, s.name]))

  // Recent agent activity across the user's sites (both channels: thread_id
  // null = console). Best-effort — the outcomes table ships with the WhatsApp
  // migrations and its absence must not break the page.
  let activity: AgentActivityRow[] = []
  if (sites.length > 0) {
    const { data: outcomes } = await admin
      .from('wa_article_outcomes')
      .select('post_id, site_id, thread_id, published_url, published_at, created_at')
      .in('site_id', sites.map((s) => s.id))
      .order('created_at', { ascending: false })
      .limit(8)
    if (outcomes && outcomes.length > 0) {
      const { data: posts } = await admin
        .from('posts')
        .select('id, title')
        .in('id', outcomes.map((o) => o.post_id as string))
      const titles = new Map((posts ?? []).map((p) => [p.id as string, p.title as string]))
      activity = outcomes
        .filter((o) => titles.has(o.post_id as string))
        .map((o) => ({
          postId: o.post_id as string,
          title: titles.get(o.post_id as string)!,
          siteName: siteNames.get(o.site_id as string) ?? '—',
          liveUrl: (o.published_url as string | null) ?? null,
          publishedAt: (o.published_at as string | null) ?? null,
          createdAt: o.created_at as string,
          channel: o.thread_id ? 'whatsapp' : 'console',
        }))
    }
  }

  return (
    <AgentClient
      agentNumber={WA_AGENT_NUMBER}
      identities={(identitiesRes.data ?? []) as Identity[]}
      scopes={(scopesRes.data ?? []) as Scope[]}
      sites={sites}
      activity={activity}
    />
  )
}
