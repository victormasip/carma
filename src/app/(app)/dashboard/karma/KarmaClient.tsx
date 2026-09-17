'use client'

// Punts de Carma — la finestra gamificada (client half).
//
// Tres beats: (1) el saldo, gran i daurat, amb la barra del mes; (2) els REPTES
// — recompenses d'un sol cop que es reclamen aquí (la verificació real és al
// servidor, claimKarmaReward); (3) el llibre de moviments, perquè cada punt
// gastat o guanyat tingui una línia visible. Cap estat trist: quan un repte
// falta, el CTA porta exactament on es completa.
//
// INSTANTANI (2026-09-17)
// ───────────────────────
// Directiva del fundador: «reclaiming points feels slow — implement optimistic
// UI updates so claiming points and seeing the balance update feels instant».
//
// El problema no era la transacció, era el que venia després: cada reclamació
// acabava en `router.refresh()`, que torna a renderitzar TOTA la ruta al
// servidor per ensenyar un número que l'acció ja havia retornat. Dos viatges, i
// el segon era el llarg — i durant tota l'estona la pantalla ensenyava el saldo
// VELL, que és precisament el que es volia veure canviar.
//
// Ara la pantalla és l'autoritat un cop muntada:
//
//   · el saldo, els reptes i els moviments viuen en estat local, sembrats amb el
//     que ha renderitzat el servidor;
//   · en clicar, tot es mou ABANS de la crida (saldo, targeta, moviment nou);
//   · la resposta reconcilia amb els números de veritat — i un error ho desfà
//     sencer, perquè una reclamació optimista que falla i es queda pintada és
//     pitjor que no haver-la pintat mai;
//   · «Reclama-ho tot» paga tots els pendents en UN viatge (abans: un per repte).
//
// El comptador compta amunt en lloc de saltar. No és decoració: és el que fa que
// «+75» es llegeixi com una cosa que has guanyat i no com un número que ha
// canviat de valor.

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Check, Sparkles, Gift, PenLine, Mic, Image as ImageIcon, MessageCircle,
  Infinity as InfinityIcon, ArrowUpRight, Loader2,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { claimKarmaReward, claimAllKarmaRewards } from '@/lib/actions/karma'
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

/**
 * El saldo, comptant amunt fins al valor nou.
 *
 * Dues meitats deliberades, i el repartiment és el que fa que passi el linter i
 * que sigui correcte pel mateix motiu:
 *
 *   · el canvi de DESTÍ es resol durant el render (el patró documentat
 *     d'«ajustar estat quan una prop canvia», el mateix que fa SiteDetailClient
 *     amb la pestanya activa). Aquí es fixa d'on surt l'animació i es resolen
 *     els salts que no s'han d'animar gens.
 *   · el moviment viu dins d'un `requestAnimationFrame`, mai al cos de l'efecte.
 *     Un setState síncron dins d'un efecte és una cascada de renders — i
 *     react-hooks v6 l'enxampa, amb raó.
 *
 * Uns 40 renders repartits en mig segon, no un per punt: un salt de 175 punts
 * amb un `setInterval` per unitat serien 175 renders per a una animació.
 */
function useCountUp(value: number | null): number | null {
  const [shown, setShown] = useState<number | null>(value)
  // El tram a recórrer, com a ESTAT i no com a ref: una ref no es pot tocar
  // durant el render (react-hooks/refs, i té raó — una ref canviada al render no
  // torna a pintar res). Aquí el tram ÉS el que dispara l'efecte, així que ha de
  // ser estat.
  const [leg, setLeg] = useState<{ from: number | null; to: number | null }>({ from: value, to: value })

  if (leg.to !== value) {
    setLeg({ from: shown, to: value })
    // Res a animar: infinit, primer valor, o una diferència d'un sol punt.
    if (value === null || shown === null || Math.abs(value - shown) < 2) setShown(value)
  }

  useEffect(() => {
    const { from, to } = leg
    if (to === null || from === null || from === to) return
    // Amb moviment reduït la durada és zero: el primer frame ja hi posa el
    // número final. Segueix sent un frame, no un render síncron dins l'efecte.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const DUR = reduce ? 0 : 620
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = DUR === 0 ? 1 : Math.min(1, (now - t0) / DUR)
      // easeOutCubic — surt disparat i aterra suau.
      const eased = 1 - (1 - p) ** 3
      setShown(Math.round(from + (to - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [leg])

  return shown
}

export default function KarmaClient({
  karma,
  rewardStates,
  ledger,
}: {
  karma: KarmaInfo
  rewardStates: Record<KarmaRewardKey, RewardState>
  ledger: LedgerEntry[]
}) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  // LOCAL STATE IS THE AUTHORITY once mounted. Seeded from the server render;
  // every later change comes from an action's return value, never from a refresh.
  const [balance, setBalance] = useState<number | null>(karma.balance)
  const [states, setStates] = useState(rewardStates)
  const [entries, setEntries] = useState(ledger)
  /** Which card is mid-flight, so only it shows a spinner. */
  const [busyKey, setBusyKey] = useState<KarmaRewardKey | 'all' | null>(null)
  /** Bumped on a win to replay the "+N" flourish. */
  const [win, setWin] = useState<{ n: number; at: number } | null>(null)

  const infinite = karma.superadmin || (karma.available && balance === null)
  const shown = useCountUp(infinite ? null : balance)
  const pctLeft = !infinite && balance !== null && karma.allocation
    ? Math.max(0, Math.min(100, Math.round((balance / karma.allocation) * 100)))
    : 100

  const claimable = KARMA_REWARDS.filter(r => states[r.key]?.eligible && !states[r.key]?.claimed)
  const claimableTotal = claimable.reduce((s, r) => s + r.amount, 0)

  /**
   * One claim, painted before it lands.
   *
   * The optimistic write is deliberately conservative: it adds the points and
   * marks the one card claimed, and nothing else. Anything richer (re-deriving
   * eligibility, say) would be guessing at server state, and this exists to feel
   * instant, not to be clever.
   */
  const run = useCallback((
    keys: KarmaRewardKey[],
    amount: number,
    call: () => Promise<Awaited<ReturnType<typeof claimKarmaReward>>>,
    busy: KarmaRewardKey | 'all',
  ) => {
    if (busyKey) return
    setBusyKey(busy)

    const prevBalance = balance
    const prevStates = states
    const prevEntries = entries

    // ── optimistic ──
    if (balance !== null) setBalance(balance + amount)
    setStates(s => {
      const next = { ...s }
      for (const k of keys) next[k] = { ...(next[k] ?? { eligible: true, claimed: false }), claimed: true }
      return next
    })
    setEntries(e => [
      ...keys.map(k => ({
        id: `optimistic-${k}`,
        delta: KARMA_REWARDS.find(r => r.key === k)?.amount ?? 0,
        kind: 'earn',
        action: `reward:${k}`,
        createdAt: new Date().toISOString(),
      })),
      ...e,
    ].slice(0, 15))
    if (amount > 0) setWin({ n: amount, at: Date.now() })

    startTransition(async () => {
      const res = await call()
      if (!res.ok) {
        // A failed optimistic claim left painted is worse than never painting it.
        setBalance(prevBalance)
        setStates(prevStates)
        setEntries(prevEntries)
        setWin(null)
        setBusyKey(null)
        toast(res.error, 'error')
        return
      }
      // ── reconcile with the real numbers ──
      setBalance(res.data.balance)
      setStates(res.data.states)
      setEntries(e => {
        const real = e.filter(x => !x.id.startsWith('optimistic-'))
        return [
          ...keys.map(k => ({
            id: `claimed-${k}`,
            delta: KARMA_REWARDS.find(r => r.key === k)?.amount ?? 0,
            kind: 'earn',
            action: `reward:${k}`,
            createdAt: new Date().toISOString(),
          })),
          ...real,
        ].slice(0, 15)
      })
      setBusyKey(null)
      if (res.data.already && res.data.amount === 0) toast('Això ja ho tenies reclamat 👍', 'success')
      else toast(`+${res.data.amount} Punts de Carma ✨`, 'success')
    })
  }, [balance, states, entries, busyKey, toast])

  const claimOne = (key: KarmaRewardKey) => {
    const amount = KARMA_REWARDS.find(r => r.key === key)?.amount ?? 0
    run([key], amount, () => claimKarmaReward(key), key)
  }
  const claimAll = () => {
    if (!claimable.length) return
    run(claimable.map(r => r.key), claimableTotal, () => claimAllKarmaRewards(), 'all')
  }

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
      <section className="gold-trace gold-trace-aura relative overflow-hidden rounded-2xl border border-accent/30 bg-bg-elevated p-6 sm:p-8">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-subtle">Saldo actual</p>
            <p className="relative mt-1 flex items-baseline gap-2 text-5xl font-extrabold tracking-tight text-text">
              {infinite
                ? <span className="inline-flex items-center gap-2 text-accent"><InfinityIcon className="h-10 w-10" /> Il·limitats</span>
                : <>
                    <span className="tabular-nums">{karma.available ? shown ?? '—' : '—'}</span>
                    <span className="text-lg font-bold text-muted">punts</span>
                  </>}
              {/* The flourish. Keyed on the timestamp so a second claim replays it. */}
              {win && (
                <span key={win.at} className="karma-pop absolute -top-5 left-0 text-base font-extrabold text-accent">
                  +{win.n}
                </span>
              )}
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
                href="/#punts"
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-text">
              <Gift className="h-5 w-5 text-accent" /> Reptes — guanya punts extra
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Recompenses d’un sol cop. Completa’ls al teu ritme; els punts guanyats no caduquen mentre no els gastis.
            </p>
          </div>

          {/* ONE TRIP FOR ALL OF THEM. Five claims used to be five round trips
              and five full re-renders of this route. */}
          {claimable.length > 1 && (
            <Button
              glow
              onClick={claimAll}
              loading={busyKey === 'all'}
              disabled={!!busyKey}
              iconLeft={<Sparkles className="h-4 w-4" />}
            >
              Reclama-ho tot · +{claimableTotal}
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {/* Claimable first: the thing you can act on should never be below the
              thing you cannot. */}
          {[...KARMA_REWARDS]
            .sort((a, b) => {
              const rank = (k: KarmaRewardKey) =>
                states[k]?.eligible && !states[k]?.claimed ? 0 : states[k]?.claimed ? 2 : 1
              return rank(a.key) - rank(b.key)
            })
            .map((r) => (
              <ChallengeCard
                key={r.key}
                rewardKey={r.key}
                state={states[r.key] ?? { eligible: false, claimed: false }}
                busy={busyKey === r.key || (busyKey === 'all' && states[r.key]?.eligible && !states[r.key]?.claimed)}
                disabled={!!busyKey}
                onClaim={() => claimOne(r.key)}
              />
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
                <span className="shrink-0 text-sm font-extrabold text-text">
                  {c.punts === 0 ? <span className="text-success">gratis</span> : <>{c.punts} <span className="text-xs font-semibold text-muted">punts</span></>}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-subtle">Publicar i clonar la teva web no costen mai res: els punts són per a la IA.</p>
        </section>

        {/* ── Moviments recents ── */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight text-text">Moviments recents</h2>
          {entries.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              Encara cap moviment — escriu el teu primer article amb l’agent i estrena el comptador ✨
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {entries.map((e) => (
                <div key={e.id} className={cn('flex items-center gap-3 px-4 py-2.5', e.id.startsWith('optimistic-') && 'opacity-70')}>
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

      {/* `pending` is read so the transition is not an unused binding; the cards
          own their own spinners, which is what makes only ONE of them move. */}
      <span className="sr-only" aria-live="polite">{pending ? 'Reclamant…' : ''}</span>
    </div>
  )
}

/* ───────────────────────── Targeta de repte ───────────────────────── */
function ChallengeCard({ rewardKey, state, busy, disabled, onClaim }: {
  rewardKey: KarmaRewardKey
  state: RewardState
  busy: boolean
  disabled: boolean
  onClaim: () => void
}) {
  const reward = KARMA_REWARDS.find((r) => r.key === rewardKey)!
  const claimable = state.eligible && !state.claimed

  return (
    <div className={cn(
      'flex flex-col gap-3 rounded-2xl border bg-bg-elevated p-4 transition-colors',
      state.claimed ? 'border-success/30' : claimable ? 'gold-trace gold-trace-hover border-accent/40' : 'border-border',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold leading-snug text-text">{reward.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{reward.description}</p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold transition-colors',
          state.claimed ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent',
        )}>
          +{reward.amount}
        </span>
      </div>
      <div className="mt-auto">
        {state.claimed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Completat
          </span>
        ) : claimable ? (
          <Button onClick={onClaim} loading={busy} disabled={disabled} size="sm" glow iconLeft={<Sparkles className="h-3.5 w-3.5" />}>
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
