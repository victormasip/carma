'use client'

// Agent — the surface layout. Chat console front and centre (the fastest way to
// an article), WhatsApp connection + recent activity in the side rail.

import { MessageCircle, Smartphone, History, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import AgentChat from './AgentChat'
import AgentConnection, { type Identity, type Scope, type Site } from './AgentConnection'
import type { AgentActivityRow } from './page'

export default function AgentClient({ agentNumber, identities, scopes, sites, activity }: {
  agentNumber: string
  identities: Identity[]
  scopes: Scope[]
  sites: Site[]
  activity: AgentActivityRow[]
}) {
  const active = identities.some((i) => i.status === 'active')
  const pending = !active && identities.some((i) => i.status === 'pending')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent"
        description="El teu redactor de confiança: aquí al xat, o per WhatsApp des de qualsevol lloc."
        actions={
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide',
            active ? 'bg-success-soft text-success' : pending ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-success' : pending ? 'bg-warning' : 'bg-accent')} />
            {active ? 'WhatsApp actiu' : pending ? 'Verificació pendent' : 'Xat actiu'}
          </span>
        }
      />

      {/* The chat must NEVER push its composer below the fold: the grid is capped
          to the visible viewport (minus shell header/paddings) and each column
          scrolls internally instead of growing the page. */}
      <div className="grid gap-6 lg:h-[calc(100dvh-13.5rem)] lg:min-h-[480px] lg:grid-cols-[minmax(0,1fr)_390px]">
        {/* Chat console — the main stage. */}
        <AgentChat sites={sites} />

        {/* Side rail: phone channel + what the agent has shipped. While NOT
            connected, the WhatsApp setup is THE thing this page must make easy
            (founder directive 2026-07-06): it jumps ABOVE the chat on mobile
            and wears the gold trace so it can't be overlooked — without
            hijacking the chat, which stays fully usable. */}
        <div className={cn('min-w-0 space-y-6 lg:h-full lg:overflow-y-auto lg:pr-1', !active && 'order-first lg:order-none')}>
          <section className="space-y-3">
            <RailLabel icon={<Smartphone className="h-4 w-4" />}>Canal de WhatsApp</RailLabel>
            {!active && (
              <p className="text-xs leading-relaxed text-muted">
                Vincula el teu número en 2 minuts i escriu articles enviant una nota de veu des d&apos;on siguis.
              </p>
            )}
            <div className={cn(!active && 'gold-trace gold-trace-aura [--gold-trace-w:1.5px] rounded-2xl')}>
              <AgentConnection agentNumber={agentNumber} identities={identities} sites={sites} scopes={scopes} />
            </div>
          </section>

          <section className="space-y-3">
            <RailLabel icon={<History className="h-4 w-4" />}>Activitat recent</RailLabel>
            <div className="rounded-2xl border border-border bg-surface">
              {activity.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  Encara res. El primer article de l&apos;agent apareixerà aquí.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {activity.map((a) => (
                    <li key={a.postId}>
                      {a.liveUrl ? (
                        <Link
                          href={a.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                        >
                          <ActivityBody a={a} showExternal />
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 px-4 py-3">
                          <ActivityBody a={a} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ActivityBody({ a, showExternal = false }: { a: AgentActivityRow; showExternal?: boolean }) {
  return (
    <>
      <span className={cn(
        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
        a.channel === 'whatsapp' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent',
      )}>
        <MessageCircle className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">{a.title}</span>
        <span className="mt-0.5 block text-xs text-subtle">
          {a.siteName} · {formatDate(a.publishedAt ?? a.createdAt, 'medium')}
          {a.publishedAt ? ' · publicat' : ' · esborrany'}
        </span>
      </span>
      {showExternal && (
        <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </>
  )
}

function RailLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-accent">
      {icon}
      <h2 className="text-xs font-bold uppercase tracking-wider text-subtle">{children}</h2>
    </div>
  )
}
