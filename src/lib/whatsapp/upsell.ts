// WhatsApp Agent — context-aware "out of punts" message (§3.3, D1/D3, server-safe).
//
// At zero balance the turn is deterministic ON PURPOSE — we can't pay an LLM to say
// there's no budget (the zero-balance-is-LLM-free rule, K3) — but it should be the
// premium conversation the product deserves, not one static string. This renders the
// warm upsell: owner's name, real plan/allocation, real paths (reptes / upgrade), and
// a promise that the idea is HELD so nothing is lost.
//
// PURE + import-safe (no admin / openai / next imports) → unit-testable directly.

import { KARMA_ALLOCATIONS, KARMA_COSTS, type KarmaPlan } from '@/lib/karma/config'

export type UnclaimedChallenge = { title: string; amount: number }

export type OutOfPuntsContext = {
  ownerName?: string | null
  plan?: KarmaPlan
  /** the inbound idea is held (pending_brief/pending_action) → reassure it's not lost. */
  heldIdea?: boolean
  /** unclaimed reptes the owner can redeem right now (one indexed read upstream). */
  unclaimedChallenges?: UnclaimedChallenge[]
  /** D3: ran out MID-flow — the draft is publishable free; only edits need punts. */
  variant?: 'default' | 'mid_flow'
}

function karmaUrl(): string {
  const base = (process.env.WA_REVIEW_BASE_URL || 'https://carma.cat').replace(/\/+$/, '')
  return `${base}/dashboard/karma`
}

const NEXT_PLAN: Record<KarmaPlan, KarmaPlan | null> = {
  free: 'premium',
  premium: 'gold',
  gold: 'agency',
  agency: null,
}
const PLAN_LABEL: Record<KarmaPlan, string> = {
  free: 'Free',
  premium: 'Premium',
  gold: 'Gold',
  agency: 'Agència',
}

/**
 * The warm, deterministic zero-punts message. With NO context it matches the classic
 * one-liner byte-for-byte (so WA_BRAIN_V2-off behaviour is unchanged); with context
 * it becomes the §3.3 premium upsell.
 */
export function outOfPuntsMessage(ctx?: OutOfPuntsContext): string {
  const url = karmaUrl()
  if (!ctx) {
    return (
      'Ostres, t’has quedat sense Punts de Carma per aquest mes! 😅 ' +
      'Es renoven el dia 1, però no cal esperar: pots guanyar punts extra completant reptes ' +
      `o passar a un pla superior aquí 👉 ${url} 💛`
    )
  }

  const name = ctx.ownerName ? `, ${ctx.ownerName}` : ''
  const plan = ctx.plan ?? 'free'
  const alloc = KARMA_ALLOCATIONS[plan]
  const lines: string[] = []

  if (ctx.variant === 'mid_flow') {
    lines.push(`Ei${name}, se t’han acabat els punts d’aquest mes 😅 L’esborrany és teu i el pots publicar gratis; per retocar-lo em calen punts.`)
  } else {
    lines.push(`M’encanta la idea${name}, i la vull escriure! 😅 Però se t’han acabat els punts d’aquest mes (pla ${PLAN_LABEL[plan]}: ${alloc}/mes).`)
  }

  lines.push('Tens dues sortides ràpides:')
  const top = ctx.unclaimedChallenges?.[0]
  if (top) {
    lines.push(`· Reclama reptes pendents a ${url} (tens «${top.title}» per estrenar: +${top.amount})`)
  } else {
    lines.push(`· Guanya punts extra completant reptes a ${url}`)
  }
  const next = NEXT_PLAN[plan]
  if (next) {
    lines.push(`· O passa a ${PLAN_LABEL[next]} (${KARMA_ALLOCATIONS[next]} punts/mes) i seguim.`)
  }

  if (ctx.heldIdea && ctx.variant !== 'mid_flow') {
    lines.push('La idea me la guardo — quan tinguis punts, m’ho dius i m’hi poso ✍️')
  }
  return lines.join('\n')
}

// ─── Account summary (§2.5 account intent — cost 0, worker-rendered numbers E-19) ──
export type AccountContext = { balance: number | null; plan: KarmaPlan; allocation: number | null; superadmin: boolean }

/**
 * The deterministic, worker-rendered answer to "quants punts tinc / què costa X".
 * The router NEVER types these figures (models mis-copy numbers on a billing surface);
 * they come straight from the ledger balance + the KARMA_COSTS catalogue.
 */
export function accountSummary(ctx: AccountContext): string {
  if (ctx.superadmin) return 'Tens punts il·limitats (superadmin) ✨ Escriu tant com vulguis.'

  const prices = `Preus: un article ${KARMA_COSTS.article_draft} punts · una revisió ${KARMA_COSTS.article_revision} · una nota de veu ${KARMA_COSTS.voice_note}.`
  const alloc = ctx.allocation ?? KARMA_ALLOCATIONS[ctx.plan]
  if (ctx.balance === null) {
    // Balance unknown (pre-028) — honest: give plan + prices, omit a number we don't have.
    return `Ets al pla ${PLAN_LABEL[ctx.plan]} (${alloc} punts/mes). ${prices}`
  }
  const articles = Math.floor(ctx.balance / KARMA_COSTS.article_draft)
  return `Ara mateix tens ${ctx.balance} punts (pla ${PLAN_LABEL[ctx.plan]}, ${alloc}/mes) — per uns ${articles} article${articles === 1 ? '' : 's'}. ${prices}`
}
