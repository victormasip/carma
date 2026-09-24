// W6 — where designs are remembered (server-only).
//
// Three kinds of memory, all behind migration 039, and ALL FAIL-OPEN: if the table
// is not there (PostgREST says PGRST205; Postgres says 42P01), or there is no
// database configured at all (a test run), every read is a miss and every write is
// a no-op — the product behaves exactly as it did before W6. The house rule — and
// how W6 shipped safely either way. (039 is applied in production: checked
// column by column on 2026-09-24.)
//
//   · the art director's answers, per domain — so two anonymous visitors who type
//     the same domain pay for ONE model call;
//   · the captured header per domain — so the Door's previews can show it without
//     reading the site again;
//   · a site's genomes — its designs as rows, with the evidence they came from.
//
// Each cache has a small per-instance memo in front of the table. On Fluid compute
// an instance serves many requests, so the memo absorbs the common case (the three
// previews a visitor opens within seconds) and still works with no table at all.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Genome } from '@/lib/design/genome'
import type { ChromeCapture } from '@/lib/design/chrome'
import { CAPTURE_VERSION, type RevealVariantName } from '@/lib/design/revealTypes'

export type Db = SupabaseClient

/** The service-role client, or null when no database is configured. */
export function designDb(): Db | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  try { return createAdminClient() } catch { return null }
}

/** "The table is not there" — PostgREST and Postgres spell it differently. */
export function isAbsent(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST204' || error.code === '42703' ||
    /could not find the table|does not exist/i.test(error.message ?? '')
}

/** nike.com, www.nike.com and https://www.nike.com/es are one business. */
export function domainOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return url.toLowerCase() }
}

// ─── A tiny LRU with a TTL ───────────────────────────────────────────────────

class Memo<V> {
  private map = new Map<string, { v: V; at: number }>()
  private max: number
  private ttlMs: number
  constructor(max: number, ttlMs: number) { this.max = max; this.ttlMs = ttlMs }
  get(k: string): V | null {
    const e = this.map.get(k)
    if (!e) return null
    if (Date.now() - e.at > this.ttlMs) { this.map.delete(k); return null }
    this.map.delete(k); this.map.set(k, e) // refresh recency
    return e.v
  }
  set(k: string, v: V): void {
    this.map.delete(k)
    this.map.set(k, { v, at: Date.now() })
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }
  clear(): void { this.map.clear() }
  /** Live entries, without refreshing their recency. */
  *entries(): IterableIterator<[string, V]> {
    const now = Date.now()
    for (const [k, e] of this.map) if (now - e.at <= this.ttlMs) yield [k, e.v]
  }
}

const DAY = 24 * 60 * 60 * 1000
/** A site redesigns rarely; a stale direction costs a little quality, never money. */
export const DIRECTION_TTL_MS = 30 * DAY
export const CHROME_TTL_MS = 7 * DAY

// ─── The art director's answers ──────────────────────────────────────────────

export type CachedVariant = { variant: RevealVariantName; genome: Genome; rationale: string | null }
export type CachedDirection = { model: string; variants: CachedVariant[]; costUsd: number | null; cached: 'memo' | 'db' }

const directions = new Memo<Omit<CachedDirection, 'cached'>>(200, DIRECTION_TTL_MS)

export async function getDirection(db: Db | null, domain: string, key: string): Promise<CachedDirection | null> {
  const k = `${domain}|${key}`
  const hit = directions.get(k)
  if (hit) return { ...hit, cached: 'memo' }
  if (!db) return null
  try {
    const since = new Date(Date.now() - DIRECTION_TTL_MS).toISOString()
    const { data, error } = await db.from('design_direction_cache')
      .select('model, variants, cost_usd, hits')
      .eq('domain', domain).eq('cache_key', key).gte('created_at', since)
      .maybeSingle()
    if (error || !data) { if (error && !isAbsent(error)) console.error('[design/store] direction read:', error.code, error.message); return null }
    const row = { model: String(data.model), variants: data.variants as CachedVariant[], costUsd: data.cost_usd === null ? null : Number(data.cost_usd) }
    directions.set(k, row)
    // Best-effort bookkeeping: how often the cache is saving us a call.
    void db.from('design_direction_cache')
      .update({ hits: Number(data.hits ?? 0) + 1, last_hit_at: new Date().toISOString() })
      .eq('domain', domain).eq('cache_key', key)
      .then(() => {}, () => {})
    return { ...row, cached: 'db' }
  } catch { return null }
}

export async function putDirection(
  db: Db | null, domain: string, key: string, row: Omit<CachedDirection, 'cached'>,
): Promise<void> {
  directions.set(`${domain}|${key}`, row)
  if (!db) return
  try {
    const { error } = await db.from('design_direction_cache').upsert({
      domain, cache_key: key, model: row.model, variants: row.variants,
      cost_usd: row.costUsd, hits: 0, created_at: new Date().toISOString(),
    }, { onConflict: 'domain,cache_key' })
    if (error && !isAbsent(error)) console.error('[design/store] direction write:', error.code, error.message)
  } catch { /* the memo still has it */ }
}

// ─── The captured header ─────────────────────────────────────────────────────

const chromes = new Memo<ChromeCapture>(200, CHROME_TTL_MS)

export async function getChrome(db: Db | null, domain: string): Promise<ChromeCapture | null> {
  const hit = chromes.get(domain)
  if (hit) return hit
  if (!db) return null
  try {
    const since = new Date(Date.now() - CHROME_TTL_MS).toISOString()
    const { data, error } = await db.from('design_chrome_cache')
      .select('capture').eq('domain', domain).gte('captured_at', since).maybeSingle()
    if (error || !data?.capture) { if (error && !isAbsent(error)) console.error('[design/store] chrome read:', error.code, error.message); return null }
    const capture = data.capture as ChromeCapture
    // Made under older rules (sanitiser, gate, fields): a miss, and the fresh
    // capture the caller takes next overwrites it.
    if (capture.v !== CAPTURE_VERSION) return null
    chromes.set(domain, capture)
    return capture
  } catch { return null }
}

export async function putChrome(db: Db | null, domain: string, capture: ChromeCapture): Promise<void> {
  chromes.set(domain, capture)
  if (!db) return
  try {
    const { error } = await db.from('design_chrome_cache')
      .upsert({ domain, capture, captured_at: new Date().toISOString() }, { onConflict: 'domain' })
    if (error && !isAbsent(error)) console.error('[design/store] chrome write:', error.code, error.message)
  } catch { /* the memo still has it */ }
}

// ─── A site's genomes ────────────────────────────────────────────────────────

export type GenomeRowInput = {
  siteId: string
  userId: string | null
  genome: Genome
  genomeId: string
  /** `edited`: a genome whose provenance could not be verified (see actions/design.ts). */
  source: 'derived' | 'directed' | 'edited'
  variant: RevealVariantName
  evidence: unknown | null
  brief: unknown | null
  compiledCss: string
  compilerVersion: string
}

/**
 * Make this genome the site's active design: the previous active row is retired
 * (history is rows — nothing is overwritten), the new one inserted active.
 * `persisted: false` means migration 039 is not applied yet; the caller still
 * applies the design to the theme, so the owner loses nothing but the history.
 */
export async function saveActiveGenome(db: Db | null, row: GenomeRowInput): Promise<{ persisted: boolean; id: string | null; reason?: string }> {
  if (!db) return { persisted: false, id: null, reason: 'no database configured' }
  try {
    const off = await db.from('site_design_genomes').update({ is_active: false }).eq('site_id', row.siteId).eq('is_active', true)
    if (off.error) return { persisted: false, id: null, reason: isAbsent(off.error) ? 'migration 039 not applied' : off.error.message }
    const { data, error } = await db.from('site_design_genomes').insert({
      site_id: row.siteId,
      genome: row.genome,
      genome_id: row.genomeId,
      genome_version: row.genome.v ?? 1,
      source: row.source,
      variant: row.variant,
      evidence: row.evidence,
      brief: row.brief,
      is_active: true,
      compiled_css: row.compiledCss,
      compiled_at: new Date().toISOString(),
      compiler_version: row.compilerVersion,
      created_by: row.userId,
    }).select('id').single()
    if (error) return { persisted: false, id: null, reason: isAbsent(error) ? 'migration 039 not applied' : error.message }
    return { persisted: true, id: String(data.id) }
  } catch (e) {
    return { persisted: false, id: null, reason: e instanceof Error ? e.message : 'unknown' }
  }
}

export type ActiveGenome = { genome: Genome; genomeId: string; compiledCss: string | null; compilerVersion: string | null }

/** The site's active genome, or null (none chosen, or no migration 039). */
export async function loadActiveGenome(db: Db | null, siteId: string): Promise<ActiveGenome | null> {
  if (!db) return null
  try {
    const { data, error } = await db.from('site_design_genomes')
      .select('genome, genome_id, compiled_css, compiler_version')
      .eq('site_id', siteId).eq('is_active', true).maybeSingle()
    if (error || !data) { if (error && !isAbsent(error)) console.error('[design/store] genome read:', error.code, error.message); return null }
    return {
      genome: data.genome as Genome,
      genomeId: String(data.genome_id),
      compiledCss: (data.compiled_css as string | null) ?? null,
      compilerVersion: (data.compiler_version as string | null) ?? null,
    }
  } catch { return null }
}

/**
 * Was this genome really one the art director answered for this domain? Read from
 * the direction cache (memo, then table), so a browser's claim of `directed` is
 * checked rather than believed. `id` maps a stored genome to the id the caller
 * compares with — the caller owns the hashing, this file stays free of it.
 */
export async function directedFor(db: Db | null, domain: string, id: (g: Genome) => string): Promise<Set<string>> {
  const out = new Set<string>()
  for (const [k, row] of directions.entries()) {
    if (k.startsWith(`${domain}|`)) for (const v of row.variants) out.add(id(v.genome))
  }
  if (!db) return out
  try {
    const { data, error } = await db.from('design_direction_cache').select('variants').eq('domain', domain).limit(20)
    if (error) return out
    for (const r of data ?? []) for (const v of (r.variants as CachedVariant[] | null) ?? []) out.add(id(v.genome))
  } catch { /* the memo's answer stands */ }
  return out
}

/** For the gates: forget everything this instance remembers. */
export function clearDesignMemo(): void {
  directions.clear()
  chromes.clear()
}
