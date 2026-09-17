// WhatsApp Agent — per-thread job claim (§2.7 / E-20, server-only).
//
// Split out of worker.ts so it stays dependency-light (types + config only, no
// OpenAI / next-cache) and is unit-testable in isolation (tests/brain-cortex.mjs).
//
// THE BUG THIS FIXES (latent in the shipped agent): the old claimNextJob claimed the
// globally-oldest job; the lease guaranteed at-most-one worker per JOB, not per
// THREAD. Two webhook after() drains running concurrently could process two jobs of
// the SAME thread in parallel → double read/write of agent_state, double replies, a
// clobbered current_post_id and DOUBLE SPEND (the two jobs carry different dedupe
// keys, so both charge). Serializing per thread is the fix.

import type { createAdminClient } from '@/lib/supabase/admin'
import { WA_TABLES, type GenerationJobRow } from './types'
import { WA_JOB_LEASE_MIN } from './config'

type Admin = ReturnType<typeof createAdminClient>

// The claim RPC (migration 030) is absent until 030 is applied → fail open to the
// JS fallback below so the agent keeps draining pre-migration.
const RPC_MISSING = new Set(['42883', '42P01', 'PGRST202', 'PGRST301', 'PGRST202'])

/**
 * Claim the next due job, SERIALIZED PER THREAD. Prefers the atomic SQL claim
 * (claim_next_agent_job, migration 030); falls back to a per-thread-aware JS claim
 * when the RPC is missing. Returns the claimed job row or null when nothing is due.
 */
export async function claimNextJob(admin: Admin): Promise<GenerationJobRow | null> {
  const { data, error } = await admin.rpc('claim_next_agent_job', {
    p_lease_seconds: WA_JOB_LEASE_MIN * 60,
  })
  if (!error) {
    // SETOF → supabase-js returns an array (possibly empty).
    const row = Array.isArray(data) ? data[0] : data
    return (row as GenerationJobRow | null) ?? null
  }
  if (!RPC_MISSING.has(error.code ?? '')) {
    console.error('[wa/claim] claim_next_agent_job failed — falling back to JS claim:', error.message)
  }
  return claimNextJobFallback(admin)
}

/**
 * Pre-030 fallback. Best-effort per-thread serialization without the RPC: exclude
 * any thread that already has a LIVE running job, then claim the oldest remaining.
 * A small read-then-claim race remains (two concurrent drains can still pick two
 * jobs of the same thread) — that residual is exactly what the RPC closes; this
 * fallback only runs until migration 030 is applied.
 */
export async function claimNextJobFallback(admin: Admin): Promise<GenerationJobRow | null> {
  const nowIso = new Date().toISOString()
  const claimable = `status.eq.queued,and(status.eq.running,lease_until.lt.${nowIso})`

  const { data: running } = await admin
    .from(WA_TABLES.jobs)
    .select('thread_id')
    .eq('status', 'running')
    .gt('lease_until', nowIso)
  const busy = [...new Set((running ?? []).map((r) => String(r.thread_id)).filter(Boolean))]

  let query = admin
    .from(WA_TABLES.jobs)
    .select('id, thread_id, attempts')
    .or(claimable)
    .order('created_at', { ascending: true })
    .limit(1)
  if (busy.length) query = query.not('thread_id', 'in', `(${busy.join(',')})`)
  const { data: cand } = await query.maybeSingle()
  if (!cand) return null

  const leaseIso = new Date(Date.now() + WA_JOB_LEASE_MIN * 60_000).toISOString()
  const { data: claimed } = await admin
    .from(WA_TABLES.jobs)
    .update({ status: 'running', lease_until: leaseIso, attempts: (cand.attempts ?? 0) + 1 })
    .eq('id', cand.id)
    .or(claimable) // lost the race if someone already flipped it
    .select('*')
    .maybeSingle()

  return (claimed as GenerationJobRow | null) ?? null
}
