'use client'

// /admin/agent — §11 baseline instrumentation (superadmin dashboard).
//
// A read-only monitor for the P0 dogfood week: is the Living Brain moving anything?
// Every number comes from getAgentMetrics (real DB reads, fail-open). The metrics
// that need v2 data (routing accuracy, upsell→upgrade, nudge→action) are listed as
// PENDING, not faked — honesty beats a green dashboard. "Actualitza" re-runs the
// server component (router.refresh) so the founder can watch numbers move live.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity, TrendingUp, MessageSquareText, Coins, BrainCircuit, Server,
  RefreshCw, AlertTriangle, Hourglass, CheckCircle2, XCircle, Sparkles,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { AgentMetrics } from '@/lib/whatsapp/metrics'
import type { KarmaPlan } from '@/lib/karma/config'

const PLAN_LABEL: Record<KarmaPlan, string> = { free: 'Gratuït', premium: 'Premium', gold: 'Gold', agency: 'Agència' }

const fmt = (n: number) => n.toLocaleString('ca-ES')
const pct = (v: number | null) => (v === null ? '—' : `${v}%`)

const SOURCE_LABEL: Record<keyof AgentMetrics['sources'], string> = {
  wa: 'WhatsApp (mig. 027)',
  karma: 'Punts / ledger (mig. 028)',
  outcomes: 'Resultats d’articles (mig. 027)',
  profiles: 'Perfils de marca (mig. 030)',
}

export default function AgentDashboard({ metrics, brainV2 }: { metrics: AgentMetrics; brainV2: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const { activity, funnel, clarify, economy, profiles, jobs, sources, windowDays, generatedAt } = metrics
  const downSources = (Object.keys(sources) as (keyof AgentMetrics['sources'])[]).filter((k) => !sources[k])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-text">
            <BrainCircuit className="h-6 w-6 text-accent" /> Agent — Instrumentació
          </h1>
          <p className="mt-1 text-sm text-muted">
            Base de referència §11 per a la setmana de dogfood. Finestra: últims {windowDays} dies ·
            actualitzat {new Date(generatedAt).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider',
              brainV2 ? 'bg-accent-soft text-accent' : 'bg-surface-subtle text-muted',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> WA_BRAIN_V2 {brainV2 ? 'ON' : 'OFF'}
          </span>
          <Button variant="secondary" size="sm" loading={pending} iconLeft={<RefreshCw className="h-4 w-4" />} onClick={refresh}>
            Actualitza
          </Button>
        </div>
      </div>

      {/* Missing-source warning (fail-open honesty) */}
      {downSources.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-text">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-bold">Algunes fonts de dades no responen</p>
            <p className="text-muted">
              {downSources.map((k) => SOURCE_LABEL[k]).join(' · ')} — comprova que la migració corresponent s’ha executat. La resta del tauler segueix sent vàlida.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Activity & retention — the "alive" bet (B1) */}
        <Card title="Activitat i retenció" hint="El senyal de retenció — l’aposta B1" icon={<Activity className="h-4 w-4" />} className="md:col-span-2">
          <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
            <Hero label="Fils / propietari actiu / setmana" value={fmt(activity.threadsPerActiveOwnerWeek)} tone="accent" />
            <Hero label="Propietaris actius" value={fmt(activity.activeOwners)} />
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Fils (7d)" value={fmt(activity.threads7d)} />
            <Metric label="Fils (total)" value={fmt(activity.threadsTotal)} />
            <Metric label="Rebuts (7d)" value={fmt(activity.inbound7d)} />
            <Metric label="Enviats (7d)" value={fmt(activity.outbound7d)} />
            <Metric label="Pendents de verificar" value={fmt(activity.pendingOwners)} />
            <Metric label="Bloquejats" value={fmt(activity.blockedOwners)} tone={activity.blockedOwners ? 'danger' : 'default'} />
          </dl>
        </Card>

        {/* Draft → publish funnel */}
        <Card title="Embut esborrany → publicat" hint="Conversió de valor diari" icon={<TrendingUp className="h-4 w-4" />}>
          <div className="mb-4">
            <Hero label="Conversió esborrany → publicat" value={pct(funnel.conversionPct)} tone="success" />
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Esborranys (total)" value={fmt(funnel.draftsTotal)} sub={`${fmt(funnel.drafts7d)} als últims 7d`} />
            <Metric label="Publicats (total)" value={fmt(funnel.publishedTotal)} sub={`${fmt(funnel.published7d)} als últims 7d`} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3 text-xs">
            <Chip label="Aprovats" value={funnel.reviewTokens.consumed} tone="success" />
            <Chip label="Pendents" value={funnel.reviewTokens.active} />
            <Chip label="Revocats" value={funnel.reviewTokens.revoked} />
            <Chip label="Caducats" value={funnel.reviewTokens.expired} />
          </div>
        </Card>

        {/* Clarification rate */}
        <Card title="Taxa de clarificació" hint="% de torns que pregunten en lloc d’esborrany (acumulat)" icon={<MessageSquareText className="h-4 w-4" />}>
          <div className="mb-4">
            <Hero label="Torns d’esborrany que van clarificar" value={pct(clarify.clarifyPct)} />
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Intents d’esborrany" value={fmt(clarify.draftAttempts)} />
            <Metric label="Clarificacions" value={fmt(clarify.clarifications)} />
          </dl>
          <p className="mt-3 text-xs text-muted">Una pujada després d’un canvi de prompt = regressió. Baixa és millor.</p>
        </Card>

        {/* Punts economy — funnel pressure (B5) */}
        <Card title="Economia de punts" hint={`Despesa dels últims ${economy.windowDays} dies · pressió de funnel (B5)`} icon={<Coins className="h-4 w-4" />} className="md:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Hero label="Propietaris a 0 punts" value={fmt(economy.ownersAtZero)} tone={economy.ownersAtZero ? 'danger' : 'default'} />
              <div className="mt-4 flex flex-wrap gap-2">
                {economy.planDistribution.map((p) => (
                  <Chip key={p.plan} label={PLAN_LABEL[p.plan]} value={p.count} tone={p.plan === 'free' ? 'default' : 'accent'} />
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="overflow-hidden rounded-xl border border-border">
                {economy.spendByAction.length ? (
                  <div className="divide-y divide-border">
                    {economy.spendByAction.map((s) => (
                      <div key={s.action} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-text">{s.label}</span>
                        <span className="tabular-nums text-muted">
                          {fmt(s.count)}× · <span className="font-bold text-text">{fmt(s.punts)}</span> punts
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-8 text-center text-sm text-muted">Cap despesa registrada als últims {economy.windowDays} dies.</div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Brand profiles (030) */}
        <Card title="Perfils de marca" hint="El perfilador (mig. 030) està corrent?" icon={<Sparkles className="h-4 w-4" />}>
          <dl className="grid grid-cols-3 gap-3">
            <Metric label="Perfils totals" value={fmt(profiles.total)} />
            <Metric label="Obsolets" value={fmt(profiles.stale)} tone={profiles.stale ? 'accent' : 'default'} />
            <Metric label="Fonts" value={fmt(profiles.bySource.length)} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3 text-xs">
            {profiles.bySource.length ? (
              profiles.bySource.map((s) => <Chip key={s.source} label={s.source} value={s.count} tone={s.source === 'seed' ? 'default' : 'success'} />)
            ) : (
              <span className="text-muted">Encara cap perfil generat.</span>
            )}
          </div>
        </Card>

        {/* Job health (E-20 monitor) */}
        <Card title="Salut de les feines" hint="Cua de generació · vigila el doble-cobrament (E-20)" icon={<Server className="h-4 w-4" />}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="En cua" value={fmt(jobs.queued)} sub={<StatIcon icon={<Hourglass className="h-3 w-3" />} />} />
            <Metric label="En curs" value={fmt(jobs.running)} />
            <Metric label="Fetes" value={fmt(jobs.done)} sub={<StatIcon icon={<CheckCircle2 className="h-3 w-3 text-success" />} />} />
            <Metric label="Errors" value={fmt(jobs.error)} tone={jobs.error ? 'danger' : 'default'} sub={jobs.error ? <StatIcon icon={<XCircle className="h-3 w-3 text-danger" />} /> : undefined} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3 text-xs">
            <Chip label="Errors (7d)" value={jobs.error7d} tone={jobs.error7d ? 'danger' : 'default'} />
            <Chip label="Reintentades" value={jobs.retried} tone={jobs.retried ? 'accent' : 'default'} />
          </div>
        </Card>

        {/* Pending v2 metrics — honest, not faked */}
        <Card title="Pendent de dades v2" hint="Es mesuren quan arribin les fases següents" icon={<Hourglass className="h-4 w-4" />} className="md:col-span-2">
          <ul className="space-y-2 text-sm">
            <PendingRow metric="Precisió de routing per intenció (≥90% ⇒ gate de merge, B2)" via="router eval suite — npm run test:router (P2)" />
            <PendingRow metric="0 punts → upsell → clic d’upgrade (senyal de funnel B5)" via="cal registrar el clic de l’enllaç + el canvi de pla" />
            <PendingRow metric="Nudge → acció al torn següent" via="els nudges arriben a P3 (agent_state.last_nudge)" />
            <PendingRow metric="Taxa d’edicions errònies en posts publicats (~0, C-5/E-11)" via="edit-published arriba a P3 (posts.pending_content)" />
          </ul>
        </Card>
      </div>
    </div>
  )
}

// ─── Small presentational helpers ─────────────────────────────────────────────
type Tone = 'default' | 'accent' | 'success' | 'danger'
const TONE_TEXT: Record<Tone, string> = {
  default: 'text-text',
  accent: 'text-accent',
  success: 'text-success',
  danger: 'text-danger',
}

function Card({ title, hint, icon, children, className }: { title: string; hint?: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-surface p-5', className)}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
        <div>
          <h2 className="text-sm font-extrabold text-text">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Hero({ label, value, tone = 'default' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div>
      <div className={cn('text-4xl font-extrabold tabular-nums leading-none', TONE_TEXT[tone])}>{value}</div>
      <div className="mt-1.5 text-xs font-medium text-muted">{label}</div>
    </div>
  )
}

function Metric({ label, value, tone = 'default', sub }: { label: string; value: string; tone?: Tone; sub?: React.ReactNode }) {
  return (
    <div>
      <div className={cn('text-xl font-extrabold tabular-nums', TONE_TEXT[tone])}>{value}</div>
      <div className="text-xs font-medium text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

function Chip({ label, value, tone = 'default' }: { label: string; value: number; tone?: Tone }) {
  const cls =
    tone === 'success' ? 'bg-success-soft text-success'
    : tone === 'danger' ? 'bg-danger-soft text-danger'
    : tone === 'accent' ? 'bg-accent-soft text-accent'
    : 'bg-surface-subtle text-muted'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold', cls)}>
      {label} <span className="tabular-nums">{fmt(value)}</span>
    </span>
  )
}

function StatIcon({ icon }: { icon: React.ReactNode }) {
  return <span className="inline-flex items-center">{icon}</span>
}

function PendingRow({ metric, via }: { metric: string; via: string }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-text">{metric}</span>
      <span className="text-xs text-muted">{via}</span>
    </li>
  )
}
