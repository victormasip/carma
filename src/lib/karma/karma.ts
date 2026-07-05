// Punts de Carma — el helper transversal (server-only).
//
// TOTA operació cara (esborranys IA, revisions, Whisper, portades, clonacions,
// torns d'agent) passa per aquí abans de gastar ni un cèntim d'API. Els diners
// de veritat es mouen a les RPCs atòmiques de la migració 028 (karma_spend /
// karma_earn / karma_refund / karma_balance): fila de cartera bloquejada
// (FOR UPDATE) + claus de dedupe → feines paral·leles del webhook no poden
// descomptar dos cops, i els reintents at-least-once cobren exactament un.
//
// Contractes de disseny (docs/plans/2026-07-05-punts-de-carma.md):
//   · SUPERADMIN = punts infinits: curtcircuit aquí (ni RPC) + guarda a la RPC.
//   · FAIL-OPEN: si la migració 028 no s'ha executat (42883/42P01) o la RPC
//     falla, l'operació S'AUTORITZA i es registra un warn — una fallada de la
//     infraestructura de facturació mai tomba el producte (mateixa convenció
//     42703-safe que la resta del repo).
//   · La denegació mai és seca: outOfPuntsMessage() dona el missatge càlid de
//     marca (WhatsApp) i la consola retorna un resultat tipat que la UI
//     converteix en una invitació a millorar de pla o guanyar punts.

import { createAdminClient } from '@/lib/supabase/admin'
import { KARMA_COSTS, KARMA_ALLOCATIONS, type KarmaAction, type KarmaPlan, type KarmaRewardKey, KARMA_REWARDS } from './config'

type Admin = ReturnType<typeof createAdminClient>

export type KarmaSpendResult =
  | { ok: true; balance: number | null; already?: boolean }
  | { ok: false; reason: 'insufficient'; balance: number; needed: number }

export type KarmaBalance = {
  /** null = infinit (superadmin) o desconegut (pre-migració — la UI ho amaga). */
  balance: number | null
  plan: KarmaPlan
  allocation: number | null
  superadmin: boolean
  /** false quan la migració 028 encara no existeix — la UI no ensenya números. */
  available: boolean
}

// La migració 028 pot no estar executada (42883 funció inexistent, 42P01 taula
// inexistent, PGRST202 schema-cache). En aquests casos: fail-open + un únic warn.
const MISSING_CODES = new Set(['42883', '42P01', 'PGRST202'])
let warnedMissing = false
function warnMissingOnce(where: string, code?: string, message?: string) {
  if (warnedMissing) return
  warnedMissing = true
  console.warn(`[karma] ${where}: la migració 028 no sembla executada (${code ?? '?'} ${message ?? ''}) — Punts de Carma en mode fail-open`)
}

function isMissingMigration(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code && MISSING_CODES.has(error.code)) return true
  return /karma_(spend|earn|refund|balance|wallets|ledger)/i.test(error.message ?? '') &&
    /not (exist|found)|schema cache/i.test(error.message ?? '')
}

/**
 * Descompta punts de forma atòmica. `dedupeKey` fa la crida idempotent (els
 * reintents d'una mateixa feina cobren un sol cop). `cost` permet sobreescriure
 * el preu de catàleg (p. ex. el net de 5 d'una clarificació).
 */
export async function spendKarma(
  userId: string,
  action: KarmaAction,
  opts: { ref?: string; dedupeKey?: string; cost?: number } = {},
  admin: Admin = createAdminClient(),
): Promise<KarmaSpendResult> {
  const cost = opts.cost ?? KARMA_COSTS[action]
  try {
    const { data, error } = await admin.rpc('karma_spend', {
      p_user: userId,
      p_cost: cost,
      p_action: action,
      p_ref: opts.ref ?? null,
      p_dedupe: opts.dedupeKey ?? null,
    })
    if (error) {
      if (isMissingMigration(error)) warnMissingOnce('spend', error.code, error.message)
      else console.error(`[karma] spend ${action} ha fallat:`, error.message)
      return { ok: true, balance: null } // fail-open
    }
    const r = (data ?? {}) as { ok?: boolean; balance?: number | null; already?: boolean; reason?: string; needed?: number }
    if (r.ok === false) {
      return { ok: false, reason: 'insufficient', balance: r.balance ?? 0, needed: r.needed ?? cost }
    }
    return { ok: true, balance: r.balance ?? null, ...(r.already ? { already: true } : {}) }
  } catch (e) {
    console.error('[karma] spend error de xarxa:', e instanceof Error ? e.message : e)
    return { ok: true, balance: null } // fail-open
  }
}

/** Retorn de punts (feina fallida, clarificació…). Best-effort i idempotent. */
export async function refundKarma(
  userId: string,
  amount: number,
  action: string,
  opts: { ref?: string; dedupeKey?: string } = {},
  admin: Admin = createAdminClient(),
): Promise<void> {
  if (amount <= 0) return
  try {
    const { error } = await admin.rpc('karma_refund', {
      p_user: userId,
      p_amount: amount,
      p_action: action,
      p_ref: opts.ref ?? null,
      p_dedupe: opts.dedupeKey ?? null,
    })
    if (error && !isMissingMigration(error)) console.error('[karma] refund ha fallat:', error.message)
  } catch { /* best-effort */ }
}

/**
 * Retorna els punts gastats en una feina que ha mort definitivament (worker,
 * WA_JOB_MAX_ATTEMPTS exhaurits). Busca els spends amb ref = jobId i els
 * retorna un a un, cadascun amb dedupe per si aquest camí també es reintenta.
 */
export async function refundJobSpends(admin: Admin, userId: string, jobId: string): Promise<void> {
  try {
    const { data, error } = await admin
      .from('karma_ledger')
      .select('id, delta')
      .eq('user_id', userId)
      .eq('ref', jobId)
      .eq('kind', 'spend')
    if (error || !data?.length) return
    for (const row of data) {
      await refundKarma(userId, Math.abs(row.delta as number), 'job_failed_refund', {
        ref: jobId,
        dedupeKey: `refund:${row.id}`,
      }, admin)
    }
  } catch { /* best-effort */ }
}

export type KarmaEarnResult = { ok: boolean; balance: number | null; already: boolean }

/** Recompensa d'un sol cop (reptes). Idempotent per (usuari, repte) per sempre. */
export async function earnKarmaReward(
  userId: string,
  reward: KarmaRewardKey,
  admin: Admin = createAdminClient(),
): Promise<KarmaEarnResult> {
  const def = KARMA_REWARDS.find((r) => r.key === reward)
  if (!def) return { ok: false, balance: null, already: false }
  try {
    const { data, error } = await admin.rpc('karma_earn', {
      p_user: userId,
      p_amount: def.amount,
      p_action: `reward:${reward}`,
      p_ref: null,
      p_dedupe: `reward:${reward}`,
    })
    if (error) {
      if (isMissingMigration(error)) warnMissingOnce('earn', error.code, error.message)
      else console.error('[karma] earn ha fallat:', error.message)
      return { ok: false, balance: null, already: false }
    }
    const r = (data ?? {}) as { balance?: number | null; already?: boolean }
    return { ok: true, balance: r.balance ?? null, already: !!r.already }
  } catch {
    return { ok: false, balance: null, already: false }
  }
}

/** Saldo actual (amb renovació mensual mandrosa a la mateixa crida). */
export async function getKarma(
  userId: string,
  admin: Admin = createAdminClient(),
): Promise<KarmaBalance> {
  try {
    const { data, error } = await admin.rpc('karma_balance', { p_user: userId })
    if (error) {
      if (isMissingMigration(error)) warnMissingOnce('balance', error.code, error.message)
      else console.error('[karma] balance ha fallat:', error.message)
      return { balance: null, plan: 'free', allocation: null, superadmin: false, available: false }
    }
    const r = (data ?? {}) as { balance?: number | null; plan?: string; allocation?: number | null; superadmin?: boolean }
    const plan = (['free', 'premium', 'gold', 'agency'].includes(r.plan ?? '') ? r.plan : 'free') as KarmaPlan
    return {
      balance: r.balance ?? null,
      plan,
      allocation: r.allocation ?? KARMA_ALLOCATIONS[plan],
      superadmin: !!r.superadmin,
      available: true,
    }
  } catch {
    return { balance: null, plan: 'free', allocation: null, superadmin: false, available: false }
  }
}

// ─── Missatgeria de marca quan s'acaben els punts ─────────────────────────────

/** Base pública de l'app (mateix patró que reviewUrl a kapso.ts). */
export function karmaPageUrl(): string {
  const base = (process.env.WA_REVIEW_BASE_URL || 'https://carma.cat').replace(/\/+$/, '')
  return `${base}/dashboard/karma`
}

/**
 * El missatge càlid de WhatsApp quan no queden punts — mai un error sec. Zero
 * despesa d'LLM: és determinista a propòsit (no podem pagar una resposta LLM
 * per dir que no queden punts).
 */
export function outOfPuntsMessage(): string {
  return (
    'Ostres, t’has quedat sense Punts de Carma per aquest mes! 😅 ' +
    'Es renoven el dia 1, però no cal esperar: pots guanyar punts extra completant reptes ' +
    `o passar a un pla superior aquí 👉 ${karmaPageUrl()} 💛`
  )
}

/** La variant curta per a la consola web (la UI hi afegeix els botons). */
export function outOfPuntsConsoleMessage(): string {
  return 'T’has quedat sense Punts de Carma per aquest mes. Guanya’n més completant reptes o puja de pla — i seguim escrivint!'
}
