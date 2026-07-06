'use client'

// Punts de Carma — la finestra gamificada (client half).
//
// Tres beats: (1) el saldo, gran i daurat, amb la barra del mes; (2) els REPTES
// — recompenses d'un sol cop que es reclamen aquí (la verificació real és al
// servidor, claimKarmaReward); (3) el llibre de moviments, perquè cada punt
// gastat o guanyat tingui una línia visible. Cap estat trist: quan un repte
// falta, el CTA porta exactament on es completa.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check, Sparkles, Gift, PenLine, Mic, Image as ImageIcon, MessageCircle, Infinity as InfinityIcon, ArrowUpRight,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { claimKarmaReward } from '@/lib/actions/karma'
import {
  KARMA_COSTS, KARMA_REWARDS, karmaActionLabel,
  type KarmaPlan, type KarmaRewardKey,
} from '@/lib/karma/config'
import type { RewardState } from '@/lib/karma/challenges'

export type LedgerEntry = { id: string; delta: number; kind: string; action: string; createdAt: string }

type KarmaInfo = {
  balance: number | null
  allocation: number | null
  plan: KarmaPlan
  superadmin: boolean
  available: boolean
}

const PLAN_LABELS: Record<KarmaPlan, string> = {
  free: 'Pla Gratuït',
  premium: 'Premium',
  gold: 'Gold',
  agency: 'Agència',
}

const COST_MENU: { icon: React.ReactNode; label: string; punts: number }[] = [
  { icon: <PenLine className="h-4 w-4" />, label: 'Esborrany d’article (agent o consola)', punts: KARMA_COSTS.article_draft },
  { icon: <MessageCircle className="h-4 w-4" />, label: 'Revisió d’un esborrany', punts: KARMA_COSTS.article_revision },
  { icon: <Mic className="h-4 w-4" />, label: 'Nota de veu (transcripció)', punts: KARMA_COSTS.voice_note },
  { icon: <ImageIcon className="h-4 w-4" />, label: 'Imatge de portada', punts: KARMA_COSTS.cover_image },
  { icon: <Sparkles className="h-4 w-4" />, label: 'Torn de conversa per WhatsApp', punts: KARMA_COSTS.agent_chat },
]

export default function KarmaClient({
  karma,
  rewardStates,
  ledger,
}: {
  karma: KarmaInfo
  rewardStates: Record<KarmaRewardKey, RewardState>
  ledger: LedgerEntry[]
}) {
  const infinite = karma.superadmin || (karma.available && karma.balance === null)
  const pctLeft = !infinite && karma.balance !== null && karma.allocation
    ? Math.max(0, Math.min(100, Math.round((karma.balance / karma.allocation) * 100)))
    : 100

  return (
    <div className="space-y-8">
      {/* ── Capçalera ── */}
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-text">
          <EndlessKnot size={26} glow /> Punts de Carma
        </h1>
        <p className="mt-1 text-sm text-muted">
          La teva energia creativa: articles, veus, portades i clonacions es paguen amb punts — i els reptes te’n regalen.
        </p>
      </div>

      {/* ── El saldo (or, sempre daurat) ── */}
      <section className="gold-trace gold-trace-aura relative rounded-2xl border border-accent/30 bg-bg-elevated p-6 sm:p-8">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-subtle">Saldo actual</p>
            <p className="mt-1 flex items-baseline gap-2 text-5xl font-extrabold tracking-tight text-text">
              {infinite
                ? <span className="inline-flex items-center gap-2 text-accent"><InfinityIcon className="h-10 w-10" /> Il·limitats</span>
                : <>
                    {karma.available ? karma.balance : '—'}
                    <span className="text-lg font-bold text-muted">punts</span>
                  </>}
            </p>
            {!infinite && (
              <p className="mt-2 text-sm text-muted">
                El teu pla en dona <span className="font-bold text-text">{karma.allocation ?? '—'}</span> cada mes — es renoven el dia 1.
              </p>
            )}
            {infinite && (
              <p className="mt-2 text-sm text-muted">Els superadmins tenen punts infinits. Que no se t’acabi la inspiració.</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent">
              {PLAN_LABELS[karma.plan]}
            </span>
            {karma.plan === 'free' && !infinite && (
              <Link
                href="/#preus"
                className="inline-flex items-center gap-1 text-xs font-bold text-muted no-underline transition-colors hover:text-accent"
              >
                Vols més punts cada mes? Mira els plans <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>

        {!infinite && karma.available && (
          <div className="relative z-10 mt-5">
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent transition-[width] duration-700"
                style={{ width: `${pctLeft}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Reptes ── */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-text">
          <Gift className="h-5 w-5 text-accent" /> Reptes — guanya punts extra
        </h2>
        <p className="mt-0.5 text-sm text-muted">Recompenses d’un sol cop. Completa’ls al teu ritme; els punts guanyats no caduquen mentre no els gastis.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {KARMA_REWARDS.map((r) => (
            <ChallengeCard key={r.key} rewardKey={r.key} state={rewardStates[r.key] ?? { eligible: false, claimed: false }} />
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Què costa cada cosa ── */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight text-text">Què costa cada cosa</h2>
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {COST_MENU.map((c) => (
              <div key={c.label} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{c.icon}</span>
                <span className="min-w-0 flex-1 text-sm font-medium text-text">{c.label}</span>
                <span className="shrink-0 text-sm font-extrabold text-text">{c.punts} <span className="text-xs font-semibold text-muted">punts</span></span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-subtle">Publicar i clonar la teva web no costen mai res: els punts són per a la IA.</p>
        </section>

        {/* ── Moviments recents ── */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight text-text">Moviments recents</h2>
          {ledger.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              Encara cap moviment — escriu el teu primer article amb l’agent i estrena el comptador ✨
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {ledger.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{karmaActionLabel(e.action)}</span>
                    <span className="block text-xs text-subtle">
                      {new Date(e.createdAt).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-sm font-extrabold', e.delta >= 0 ? 'text-success' : 'text-muted')}>
                    {e.delta >= 0 ? `+${e.delta}` : e.delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ───────────────────────── Targeta de repte ───────────────────────── */
function ChallengeCard({ rewardKey, state }: { rewardKey: KarmaRewardKey; state: RewardState }) {
  const reward = KARMA_REWARDS.find((r) => r.key === rewardKey)!
  const { toast } = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [claimedNow, setClaimedNow] = useState(false)

  const claimed = state.claimed || claimedNow
  const claimable = state.eligible && !claimed

  const claim = () => {
    startTransition(async () => {
      const res = await claimKarmaReward(rewardKey)
      if (!res.ok) { toast(res.error, 'error'); return }
      setClaimedNow(true)
      toast(res.already ? 'Aquest repte ja el tenies reclamat 👍' : `+${res.amount} Punts de Carma ✨`, 'success')
      router.refresh()
    })
  }

  return (
    <div className={cn(
      'flex flex-col gap-3 rounded-2xl border bg-bg-elevated p-4 transition-colors',
      claimed ? 'border-success/30' : claimable ? 'gold-trace gold-trace-hover border-accent/40' : 'border-border',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold leading-snug text-text">{reward.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{reward.description}</p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold',
          claimed ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent',
        )}>
          +{reward.amount}
        </span>
      </div>
      <div className="mt-auto">
        {claimed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
            <Check className="h-3.5 w-3.5" /> Completat
          </span>
        ) : claimable ? (
          <Button onClick={claim} loading={pending} size="sm" glow iconLeft={<Sparkles className="h-3.5 w-3.5" />}>
            Reclama +{reward.amount}
          </Button>
        ) : (
          <Button href={reward.ctaHref} size="sm" variant="secondary">
            {reward.ctaLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
