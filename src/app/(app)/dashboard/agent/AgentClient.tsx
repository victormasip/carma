'use client'

// Agent — the surface layout. Chat console front and centre (the fastest way to
// an article), WhatsApp connection + recent activity in the side rail.

import { Suspense, lazy, useCallback, useState, useSyncExternalStore } from 'react'
import { MessageCircle, Smartphone, History, ExternalLink, Check } from 'lucide-react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import AgentChat from './AgentChat'
import Button from '@/components/ui/Button'
import { type Identity, type Scope, type Site } from './AgentConnection'
import type { AgentActivityRow } from './page'

// LAZY, like SiteDetailClient already loads it. A static import here defeated
// that split: this page is the route entry, so every owner who opened the Agent
// paid for the connection screen — and for the QR generator behind it — whether
// or not it ever rendered. Caught by `npm run test:perf` §3.
const ConnectAgentStep = lazy(() => import('../sites/[id]/ConnectAgentStep'))

/**
 * STRAIGHT TO THE QR FOR SOMEONE WHO HAS NEVER CONNECTED.
 *
 * Founder, 2026-09-17: "skip the 'Encara no hi ha agent' screen for new users.
 * Go DIRECTLY to the QR connection screen. It's redundant."
 *
 * They are right: an owner with zero bound numbers who opens the Agent page is
 * there to connect one, and the page's answer was a card explaining that they
 * had not connected one, with a button to do the thing they had already asked
 * for. One screen, one click, zero information.
 *
 * Two guards keep it from becoming a nuisance:
 *   · only when there are NO identities at all — a pending or blocked one means
 *     they have been here, and re-opening a modal over their own state is worse
 *     than the card ever was;
 *   · only once per browser. Dismiss it and the page behaves as it always did.
 *
 * `useSyncExternalStore` rather than an effect: localStorage is external state,
 * the server snapshot is false (so the HTML never depends on it and hydration
 * stays honest), and setState-in-an-effect is a react-hooks v6 error here.
 */
const QR_SEEN_KEY = 'carma.agent.qr.offered'
const noopSubscribe = () => () => {}

function qrAlreadyOffered(): boolean {
  try { return localStorage.getItem(QR_SEEN_KEY) === '1' } catch { return true }
}

function markQrOffered(): void {
  try { localStorage.setItem(QR_SEEN_KEY, '1') } catch { /* private mode: it just offers again */ }
}

export default function AgentClient({ identities, sites, activity }: {
  /** Kept in the page's props for the settings surface; this page no longer
   *  renders the number itself — the magic button does the whole binding. */
  agentNumber?: string
  identities: Identity[]
  scopes?: Scope[]
  sites: Site[]
  activity: AgentActivityRow[]
}) {
  const active = identities.some((i) => i.status === 'active')
  const pending = !active && identities.some((i) => i.status === 'pending')

  const neverConnected = identities.length === 0
  const autoOffer = useSyncExternalStore(
    noopSubscribe,
    useCallback(() => neverConnected && !qrAlreadyOffered(), [neverConnected]),
    () => false,
  )
  const [dismissed, setDismissed] = useState(false)
  const [manual, setManual] = useState(false)
  const connecting = manual || (autoOffer && !dismissed)

  return (
    <div className="space-y-6">
      {connecting && (
        // No fallback: the step is a full-screen portal that paints its own
        // "preparing" state, and a spinner underneath it would only flash.
        <Suspense fallback={null}>
          <ConnectAgentStep
            onClose={(connected) => {
              markQrOffered()
              setManual(false)
              setDismissed(true)
              // A fresh binding changes what the whole page should say, and the
              // state lives on the server — a reload is the honest way to get it.
              if (connected) window.location.reload()
            }}
          />
        </Suspense>
      )}

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
          {/* ONE BUTTON, NOT A FORM.
              Founder, 2026-09-16: "la pagina d'agent es una merda, deixa-ho
              nomes en xat i boto magic de connexio i historial". The rail used
              to carry the whole phone-number panel plus a three-item tips card,
              which is a lot of furniture around a thing you do once. Now:
              connect, and what the agent has shipped. Nothing else. */}
          <section className="space-y-3">
            <RailLabel icon={<Smartphone className="h-4 w-4" />}>WhatsApp</RailLabel>
            {active ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                  <Check className="h-4.5 w-4.5" strokeWidth={2.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text">Connectat</p>
                  <p className="text-xs leading-snug text-muted">Envia-li una nota de veu des d&apos;on siguis.</p>
                </div>
                <Link
                  href="/dashboard/settings"
                  className="shrink-0 text-xs font-semibold text-muted no-underline transition-colors hover:text-accent"
                >
                  Gestiona
                </Link>
              </div>
            ) : (
              <div className="gold-trace gold-trace-aura [--gold-trace-w:1.5px] rounded-2xl">
                <div className="rounded-2xl bg-surface p-4">
                  <p className="text-sm font-bold text-text">Connecta el teu WhatsApp</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Un botó, un missatge, i ja pots escriure articles enviant una nota de veu.
                    Sense escriure el teu número enlloc.
                  </p>
                  <Button glow fullWidth className="mt-3" onClick={() => setManual(true)} iconLeft={<Smartphone className="h-4 w-4" />}>
                    Connectar
                  </Button>
                </div>
              </div>
            )}
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
