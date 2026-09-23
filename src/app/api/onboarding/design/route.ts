import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { directWithModel } from '@/lib/design/llm'
import { toRevealVariants, verifyDesignToken } from '@/lib/design/reveal'
import type { DesignUpgradeResponse } from '@/lib/design/revealTypes'

// The art director thinks for ~41s at the median (W4, measured live), and llm.ts
// allows one retry on a 45s timeout. The Door stops waiting at 90s either way.
export const maxDuration = 120

const HOUR = 60 * 60 * 1000

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

  // Counted only for tokens that verify, so garbage cannot spend a real visitor's budget.
  if (!rateLimit(`design:direct:${clientIp(request)}`, 3, HOUR).ok) return keep(429)

  const directed = await directWithModel(payload.evidence, {
    siteId: payload.evidence.url,
    brief: { ...(payload.brief ?? {}), locale: payload.locale },
  })
  if (directed.source !== 'directed') {
    // The fail-open is the product working as designed; the reason is the signal.
    console.info('[design] upgrade kept W3:', directed.violations.slice(0, 3).join(' | '))
    return keep()
  }

  const ctx = { siteName: payload.siteName, locale: payload.locale, pitches: payload.pitches }
  return NextResponse.json(
    { source: 'directed', variants: toRevealVariants(directed, ctx, directed.rationale) } satisfies DesignUpgradeResponse,
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
