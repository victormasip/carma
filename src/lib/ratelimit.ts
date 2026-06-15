// Lightweight, dependency-free rate limiter for the public + cost-heavy API
// routes (`/api/leads`, `/api/v1/posts`, `/api/theme/analyze`).
//
// Strategy: fixed-window counters in an in-process Map. Zero infra, zero deps.
// CAVEAT: on serverless / multi-instance hosts (Netlify, Vercel) each instance
// keeps its own window, so the effective global limit is `limit × instances`.
// That is still a hard ceiling that stops runaway cost/abuse. For a STRICT global
// limit, swap the body of `rateLimit` for an Upstash/Redis `INCR`+`EXPIRE` (the
// call sites and the return shape stay the same). Key by caller identity: IP for
// public routes, api_key / user id for authenticated ones.

type Bucket = { count: number; resetAt: number }

const store = new Map<string, Bucket>()

function pruneExpired(now: number) {
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k)
}

export type RateResult = { ok: boolean; retryAfter: number; remaining: number }

/**
 * Record one hit against `key`. Returns `ok:false` (with `retryAfter` seconds)
 * once `limit` hits land inside the rolling `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now()
  const b = store.get(key)
  if (!b || b.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    // Bound memory on hosts that keep the module warm across many keys.
    if (store.size > 10_000) pruneExpired(now)
    return { ok: true, retryAfter: 0, remaining: limit - 1 }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)), remaining: 0 }
  }
  b.count += 1
  return { ok: true, retryAfter: 0, remaining: limit - b.count }
}

/** Best-effort caller IP from the proxy headers (Netlify / Vercel / Cloudflare). */
export function clientIp(req: Request): string {
  const h = req.headers
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim() || 'unknown'
  return (
    h.get('x-real-ip') ||
    h.get('x-nf-client-connection-ip') ||
    h.get('cf-connecting-ip') ||
    'unknown'
  )
}
