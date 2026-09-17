// WhatsApp Agent — owner memory operations (§2.3, pure + import-safe).
//
// Standing preferences live in wa_identities.memory as DATA (never instructions that
// can touch the L0 shell — E-18). The router proposes a `remember`/`forget` slot; the
// worker applies it DETERMINISTICALLY here (no LLM decides what to store or evict).
// FIFO-capped; eviction is surfaced so the worker can ANNOUNCE it (E-11/C-11) — a
// silently broken promise is a worse trust breach than no memory at all.

import type { WaOwnerMemory } from './types'

const FACT_MAX_LEN = 200

/** The stored facts as plain strings, for the router's USER PREFERENCES block. */
export function factsToStrings(memory: WaOwnerMemory | null | undefined): string[] {
  return (memory?.facts ?? []).map((f) => f.text).filter((t) => typeof t === 'string' && t.trim())
}

/**
 * Append a durable preference (newest wins), FIFO-capped at `max`. De-dupes a
 * near-identical fact (moves it to newest, no eviction). Returns the evicted fact's
 * text when the cap pushed one out, so the caller can announce it.
 */
export function applyRemember(
  memory: WaOwnerMemory | null | undefined,
  text: string,
  opts: { sourceMsg?: string; max: number },
): { memory: WaOwnerMemory; evicted: string | null } {
  const facts = [...(memory?.facts ?? [])]
  const clean = text.trim().slice(0, FACT_MAX_LEN)
  if (!clean) return { memory: { facts }, evicted: null }

  const dupeIdx = facts.findIndex((f) => f.text.trim().toLowerCase() === clean.toLowerCase())
  if (dupeIdx >= 0) facts.splice(dupeIdx, 1)
  facts.push({ text: clean, learned_at: new Date().toISOString(), ...(opts.sourceMsg ? { source_msg: opts.sourceMsg } : {}) })

  let evicted: string | null = null
  while (facts.length > Math.max(1, opts.max)) {
    const removed = facts.shift()
    if (removed) evicted = removed.text
  }
  return { memory: { facts }, evicted }
}

/**
 * Remove the best string-match fact for a "forget" request. Deterministic: exact
 * match → substring either way → token overlap. Returns the removed fact's text, or
 * null when nothing matched (the caller then says it had nothing to forget).
 */
export function applyForget(
  memory: WaOwnerMemory | null | undefined,
  topic: string,
): { memory: WaOwnerMemory; removed: string | null } {
  const facts = [...(memory?.facts ?? [])]
  const t = topic.trim().toLowerCase()
  if (!t) return { memory: { facts }, removed: null }

  let idx = facts.findIndex((f) => f.text.trim().toLowerCase() === t)
  if (idx < 0) idx = facts.findIndex((f) => { const fl = f.text.toLowerCase(); return fl.includes(t) || t.includes(fl) })
  if (idx < 0) {
    const words = t.split(/\s+/).filter((w) => w.length > 3)
    if (words.length) idx = facts.findIndex((f) => { const fl = f.text.toLowerCase(); return words.some((w) => fl.includes(w)) })
  }
  if (idx < 0) return { memory: { facts }, removed: null }

  const [removed] = facts.splice(idx, 1)
  return { memory: { facts }, removed: removed?.text ?? null }
}
