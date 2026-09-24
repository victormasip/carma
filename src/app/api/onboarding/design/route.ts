import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { directWithModel, directionCacheKey, type DirectedByModel } from '@/lib/design/llm'
import { toRevealVariants, verifyDesignToken } from '@/lib/design/reveal'
import { designDb, domainOf, getChrome, getDirection, putDirection } from '@/lib/design/store'
import { validateGenome } from '@/lib/design/validate'
import { REVEAL_ORDER, type DesignUpgradeResponse, type RevealVariantName } from '@/lib/design/revealTypes'
import type { Genome } from '@/lib/design/genome'

// The art director thinks for ~41s at the median (W4, measured live), and llm.ts
// allows one retry on a 45s timeout. The Door stops waiting at 90s either way.
export const maxDuration = 120

const HOUR = 60 * 60 * 1000

/** Two visitors on one instance asking for the same domain at once share ONE call. */
const inflight = new Map<string, Promise<DirectedByModel>>()

/**
 * W5 — THE SEMANTIC UPGRADE, asked for in the background.
 *
 * The Door has already painted the deterministic director's three designs. This
 * route runs the art director (W4) over the SAME evidence and answers with its
 * three, which the Door crossfades in place. Every failure — a missing key, a
 * refusal, a timeout, a malformed answer, a spent budget — answers `derived`,
 * and the Door keeps what it has without saying a word.
 *
 * It accepts nothing but a token our own glimpse signed (see reveal.ts): the
 * model's input is evidence WE measured, never a prompt a stranger wrote, and
 * every call was preceded by a rate-limited scrape. On top of that, this is the
 * most expensive call reachable without an account, so it has the tightest
 * budget on the Door.
 *
 * W6 — IT REMEMBERS. The answer is cached per domain (design/store.ts): the second
 * visitor to type nike.com is served the first one's designs from memory or from
 * migration 039's table, and no model is called. Only a MISS spends the budget.
 */
export async function POST(request: NextRequest) {
  const keep = (status = 200) =>
    NextResponse.json({ source: 'derived' } satisfies DesignUpgradeResponse, {
      status, headers: { 'Cache-Control': 'no-store' },
    })

  let body: unknown
  try { body = await request.json() } catch { return keep(400) }
  const payload = verifyDesignToken((body as { token?: unknown } | null)?.token)
  if (!payload) return keep(403)

  const ctx = { siteName: payload.siteName, locale: payload.locale, pitches: payload.pitches, siteUrl: payload.siteUrl ?? null }
  const db = designDb()
  const domain = domainOf(payload.evidence.url)
  const key = directionCacheKey(payload.evidence)

  // A HIT costs nothing — no model call, no budget spent. The genomes are validated
  // again on the way out: this is stored data, and stored data is input.
  // Their captured header decides the rung each preview draws; a miss (another
  // instance, no migration 039) leaves the genome's own rung to the preview.
  const capture = payload.siteUrl ? (await getChrome(db, domainOf(payload.siteUrl))) ?? undefined : null
  const hit = await getDirection(db, domain, key)
  if (hit && hit.variants.length === 3) {
    const byName = Object.fromEntries(hit.variants.map(v => [v.variant, { genome: validateGenome(v.genome).genome as Genome }]))
    if (REVEAL_ORDER.every(n => byName[n])) {
      const why = Object.fromEntries(hit.variants.filter(v => v.rationale).map(v => [v.variant, v.rationale as string])) as Partial<Record<RevealVariantName, string>>
      return NextResponse.json(
        { source: 'directed', variants: toRevealVariants(byName as Record<RevealVariantName, { genome: Genome }>, ctx, why, capture), cached: hit.cached } satisfies DesignUpgradeResponse,
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }

  // Counted only for tokens that verify AND miss the cache, so neither garbage nor
  // a popular domain can spend a real visitor's budget.
  if (!rateLimit(`design:direct:${clientIp(request)}`, 3, HOUR).ok) return keep(429)

  const flightKey = `${domain}|${key}`
  let run = inflight.get(flightKey)
  if (!run) {
    run = directWithModel(payload.evidence, {
      siteId: payload.evidence.url,
      brief: { ...(payload.brief ?? {}), locale: payload.locale },
    }).finally(() => inflight.delete(flightKey))
    inflight.set(flightKey, run)
  }
  const directed = await run
  if (directed.source !== 'directed') {
    // The fail-open is the product working as designed; the reason is the signal.
    console.info('[design] upgrade kept W3:', directed.violations.slice(0, 3).join(' | '))
    return keep()
  }

  await putDirection(db, domain, key, {
    model: directed.model ?? 'unknown',
    costUsd: directed.usage?.costUsd ?? null,
    variants: REVEAL_ORDER.map(v => ({ variant: v, genome: directed[v].genome, rationale: directed.rationale[v] ?? null })),
  })
  if (directed.usage) console.info(`[design] art director ${directed.model}: ${directed.usage.input} in · ${directed.usage.output} out · $${directed.usage.costUsd?.toFixed(4) ?? '?'}`)

  return NextResponse.json(
    { source: 'directed', variants: toRevealVariants(directed, ctx, directed.rationale, capture) } satisfies DesignUpgradeResponse,
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
