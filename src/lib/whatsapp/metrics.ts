// WhatsApp Agent — §11 baseline instrumentation (server-only, superadmin).
//
// "Without these, in six months nobody can say whether the Living Brain moved
// anything" (CEO C-4). One cheap query per metric, ALL best-effort / fail-open: a
// missing table or column (pre-migration) leaves a card blank, never crashes the
// page. Read by /admin/agent. Baseline the four metrics that exist today DURING the
// P0 dogfood week, so v2's effect is measurable against a known starting point.
//
// Data sources are real, not LLM-derived:
//   · Activity/retention  — wa_identities · wa_threads · wa_messages
//   · Draft→publish funnel — wa_article_outcomes · review_tokens
//   · Clarification rate    — karma_ledger (article_draft spends vs clarify_refunds)
//   · Punts economy         — karma_ledger · karma_wallets · profiles
//   · Brand profiles (030)  — site_brain_profiles
//   · Job health (E-20)     — generation_jobs
//
// Metrics that need v2 data (per-intent routing accuracy → the router eval suite;
// upsell→upgrade clicks; nudge→action) are surfaced as "pending" in the UI, not faked.

import type { createAdminClient } from '@/lib/supabase/admin'
import { KARMA_ACTION_LABELS, type KarmaPlan } from '@/lib/karma/config'

type Admin = ReturnType<typeof createAdminClient>

export const WINDOW_DAYS = 7
const sinceIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

// ─── Types ────────────────────────────────────────────────────────────────────
export type ActivityMetrics = {
  activeOwners: number
  pendingOwners: number
  blockedOwners: number
  threadsTotal: number
  threads7d: number
  threadsPerActiveOwnerWeek: number
  inbound7d: number
  outbound7d: number
}
export type FunnelMetrics = {
  draftsTotal: number
  publishedTotal: number
  conversionPct: number | null
  drafts7d: number
  published7d: number
  reviewTokens: { active: number; consumed: number; revoked: number; expired: number }
}
export type ClarifyMetrics = { draftAttempts: number; clarifications: number; clarifyPct: number | null }
export type SpendRow = { action: string; label: string; count: number; punts: number }
export type EconomyMetrics = {
  windowDays: number
  spendByAction: SpendRow[]
  ownersAtZero: number
  planDistribution: { plan: KarmaPlan; count: number }[]
}
export type ProfileMetrics = { total: number; bySource: { source: string; count: number }[]; stale: number }
export type JobMetrics = { queued: number; running: number; done: number; error: number; error7d: number; retried: number }

export type AgentMetrics = {
  generatedAt: string
  windowDays: number
  activity: ActivityMetrics
  funnel: FunnelMetrics
  clarify: ClarifyMetrics
  economy: EconomyMetrics
  profiles: ProfileMetrics
  jobs: JobMetrics
  sources: { wa: boolean; karma: boolean; outcomes: boolean; profiles: boolean }
}

// A large cap: at dogfood scale every table is tiny, and counting in JS keeps the
// queries simple and strongly typed (mirrors /admin/users). Bounds the worst case.
const CAP = 20_000

// ─── Per-group collectors (each self-guards → defaults on any failure) ────────
async function activity(admin: Admin): Promise<ActivityMetrics> {
  const zero: ActivityMetrics = {
    activeOwners: 0, pendingOwners: 0, blockedOwners: 0, threadsTotal: 0, threads7d: 0,
    threadsPerActiveOwnerWeek: 0, inbound7d: 0, outbound7d: 0,
  }
  try {
    const since = sinceIso(WINDOW_DAYS)
    const [ids, tTotal, t7d, inb, outb] = await Promise.all([
      admin.from('wa_identities').select('status').limit(CAP),
      admin.from('wa_threads').select('id', { count: 'exact', head: true }),
      admin.from('wa_threads').select('id', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('wa_messages').select('id', { count: 'exact', head: true }).eq('direction', 'in').gte('created_at', since),
      admin.from('wa_messages').select('id', { count: 'exact', head: true }).eq('direction', 'out').gte('created_at', since),
    ])
    let active = 0, pending = 0, blocked = 0
    for (const r of (ids.data ?? []) as { status: string }[]) {
      if (r.status === 'active') active++
      else if (r.status === 'pending') pending++
      else if (r.status === 'blocked') blocked++
    }
    const threads7d = t7d.count ?? 0
    return {
      activeOwners: active, pendingOwners: pending, blockedOwners: blocked,
      threadsTotal: tTotal.count ?? 0, threads7d,
      threadsPerActiveOwnerWeek: active ? Math.round((threads7d / active) * 100) / 100 : 0,
      inbound7d: inb.count ?? 0, outbound7d: outb.count ?? 0,
    }
  } catch {
    return zero
  }
}

async function funnel(admin: Admin): Promise<FunnelMetrics> {
  const reviewTokens = { active: 0, consumed: 0, revoked: 0, expired: 0 }
  let draftsTotal = 0, publishedTotal = 0, drafts7d = 0, published7d = 0
  const since = sinceIso(WINDOW_DAYS)
  try {
    const { data } = await admin.from('wa_article_outcomes').select('created_at, published_at').limit(CAP)
    for (const r of (data ?? []) as { created_at: string; published_at: string | null }[]) {
      draftsTotal++
      if (r.created_at >= since) drafts7d++
      if (r.published_at) {
        publishedTotal++
        if (r.published_at >= since) published7d++
      }
    }
  } catch { /* pre-migration */ }
  try {
    const { data } = await admin.from('review_tokens').select('status').limit(CAP)
    for (const r of (data ?? []) as { status: keyof typeof reviewTokens }[]) {
      if (r.status in reviewTokens) reviewTokens[r.status]++
    }
  } catch { /* pre-migration */ }
  return {
    draftsTotal, publishedTotal,
    conversionPct: draftsTotal ? Math.round((publishedTotal / draftsTotal) * 1000) / 10 : null,
    drafts7d, published7d, reviewTokens,
  }
}

async function clarify(admin: Admin): Promise<ClarifyMetrics> {
  try {
    const [d, c] = await Promise.all([
      admin.from('karma_ledger').select('id', { count: 'exact', head: true }).eq('action', 'article_draft').eq('kind', 'spend'),
      admin.from('karma_ledger').select('id', { count: 'exact', head: true }).eq('action', 'clarify_refund'),
    ])
    const draftAttempts = d.count ?? 0
    const clarifications = c.count ?? 0
    return { draftAttempts, clarifications, clarifyPct: draftAttempts ? Math.round((clarifications / draftAttempts) * 1000) / 10 : null }
  } catch {
    return { draftAttempts: 0, clarifications: 0, clarifyPct: null }
  }
}

async function economy(admin: Admin): Promise<EconomyMetrics> {
  const since = sinceIso(WINDOW_DAYS)
  const spendMap = new Map<string, { count: number; punts: number }>()
  try {
    const { data } = await admin.from('karma_ledger').select('action, delta').eq('kind', 'spend').gte('created_at', since).limit(CAP)
    for (const r of (data ?? []) as { action: string; delta: number }[]) {
      const cur = spendMap.get(r.action) ?? { count: 0, punts: 0 }
      cur.count++
      cur.punts += Math.abs(r.delta ?? 0)
      spendMap.set(r.action, cur)
    }
  } catch { /* pre-migration */ }
  const spendByAction: SpendRow[] = [...spendMap.entries()]
    .map(([action, v]) => ({ action, label: KARMA_ACTION_LABELS[action] ?? action, count: v.count, punts: v.punts }))
    .sort((a, b) => b.punts - a.punts)

  let ownersAtZero = 0
  try {
    const { count } = await admin.from('karma_wallets').select('user_id', { count: 'exact', head: true }).eq('balance', 0)
    ownersAtZero = count ?? 0
  } catch { /* pre-migration */ }

  const planMap = new Map<string, number>()
  try {
    const { data } = await admin.from('profiles').select('plan').limit(CAP)
    for (const r of (data ?? []) as { plan: string | null }[]) {
      const p = ['free', 'premium', 'gold', 'agency'].includes(r.plan ?? '') ? (r.plan as string) : 'free'
      planMap.set(p, (planMap.get(p) ?? 0) + 1)
    }
  } catch { /* pre-migration → plan column absent */ }
  const planDistribution = (['free', 'premium', 'gold', 'agency'] as KarmaPlan[]).map((plan) => ({ plan, count: planMap.get(plan) ?? 0 }))

  return { windowDays: WINDOW_DAYS, spendByAction, ownersAtZero, planDistribution }
}

async function profiles(admin: Admin): Promise<ProfileMetrics> {
  const bySourceMap = new Map<string, number>()
  let total = 0, stale = 0
  try {
    const { data } = await admin.from('site_brain_profiles').select('source, stale').limit(CAP)
    for (const r of (data ?? []) as { source: string | null; stale: boolean | null }[]) {
      total++
      bySourceMap.set(r.source ?? 'auto', (bySourceMap.get(r.source ?? 'auto') ?? 0) + 1)
      if (r.stale) stale++
    }
  } catch { /* pre-030 */ }
  return { total, bySource: [...bySourceMap.entries()].map(([source, count]) => ({ source, count })), stale }
}

async function jobs(admin: Admin): Promise<JobMetrics> {
  const status = { queued: 0, running: 0, done: 0, error: 0 }
  let retried = 0
  try {
    const { data } = await admin.from('generation_jobs').select('status, attempts').limit(CAP)
    for (const r of (data ?? []) as { status: keyof typeof status; attempts: number }[]) {
      if (r.status in status) status[r.status]++
      if ((r.attempts ?? 0) > 1) retried++
    }
  } catch { /* pre-migration */ }
  let error7d = 0
  try {
    const { count } = await admin.from('generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'error').gte('updated_at', sinceIso(WINDOW_DAYS))
    error7d = count ?? 0
  } catch { /* pre-migration */ }
  return { ...status, error7d, retried }
}

async function probe(admin: Admin, table: string): Promise<boolean> {
  try {
    const { error } = await admin.from(table).select('*', { count: 'exact', head: true }).limit(1)
    return !error
  } catch {
    return false
  }
}

/** Assemble the full instrumentation snapshot. Everything runs in parallel; a broken
 *  source degrades that card only. Never throws. */
export async function getAgentMetrics(admin: Admin): Promise<AgentMetrics> {
  const [act, fun, cla, eco, prof, job, waOk, karmaOk, outcomesOk, profilesOk] = await Promise.all([
    activity(admin), funnel(admin), clarify(admin), economy(admin), profiles(admin), jobs(admin),
    probe(admin, 'wa_identities'), probe(admin, 'karma_ledger'), probe(admin, 'wa_article_outcomes'), probe(admin, 'site_brain_profiles'),
  ])
  return {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    activity: act, funnel: fun, clarify: cla, economy: eco, profiles: prof, jobs: job,
    sources: { wa: waOk, karma: karmaOk, outcomes: outcomesOk, profiles: profilesOk },
  }
}
