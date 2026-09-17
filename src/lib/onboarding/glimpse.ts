// THE GLIMPSE — the landing Door's logged-out capture.
//
// WHY THIS IS NOT `captureBrandBrain`
// ───────────────────────────────────
// The approved plan put the Brand Brain capture on the landing page, logged out,
// so the registration ask lands AFTER the visitor has seen Carma read them. The
// obvious implementation is to run the real capture anonymously and park the
// result until they sign up. We deliberately do not do that, for three reasons:
//
//   1. COST. The real capture ends in an LLM distillation. Running that for every
//      anonymous paste on a public marketing page is an unbounded bill attached
//      to an unauthenticated endpoint.
//   2. PARKING. A parked brain needs a table, a TTL, a claim-on-signup RPC and a
//      migration — infrastructure whose only job is to survive one navigation.
//   3. IT ISN'T NEEDED. The entire emotional payload of the reveal — "these
//      sentences are yours, we didn't write them" — comes from
//      `candidateSentences()`, which is a DETERMINISTIC EXTRACTOR. No model is
//      involved in finding a brand's real sentences. It never was: the LLM's only
//      job downstream is to CHOOSE among them by index, precisely so it cannot
//      paraphrase. So the honest, free half of the capture is exactly the half
//      the visitor needs to see.
//
// So the glimpse is the real thing, minus the paid inference: a real scrape of
// their real site, their real palette and typefaces, and their own real
// sentences. Nothing here is invented, and nothing here is charged.
//
// The account wall then sits at precisely the right place in the story:
//   you see that we READ you  →  you sign up so we can LEARN you.
//
// What crosses the signup boundary is only ever STRINGS (a URL, a transcript,
// extracted document text), carried in sessionStorage — which is why this needed
// no table, no TTL and no migration.

import type { BrandSynthesis } from './synthesis'

/** One brand sentence we found, verbatim, in the visitor's own material. */
export type GlimpseQuote = { text: string; from: string }

export type GlimpseResult = {
  /** The brand as it calls itself (og:site_name → <title>), never the domain. */
  siteName: string | null
  /** Pages actually read (not attempted). */
  pages: number
  /** Their own sentences, verbatim, chosen by length and rhythm — no model. */
  quotes: GlimpseQuote[]
  /** Real colours and typefaces lifted from their markup. */
  palette: string[]
  fonts: string[]
  /** `<html lang>` / og:locale, when the site declares one. */
  locale: string | null
  /** Documents we could read, by name. */
  docs: { name: string; words: number }[]
  /** What we heard, if they spoke. */
  heard: string | null
  /**
   * The prose we actually read, capped.
   *
   * THIS IS THE FIX FOR THE BROKEN FUNNEL. The Door used to carry only the URL
   * across signup, so onboarding re-scraped the same six pages the visitor had
   * just watched it read — a minute of "reading your website" for a website it
   * had already read, while they sat looking at a progress bar for the second
   * time. Carrying the corpus means the post-signup pass has nothing left to
   * fetch: it remembers, saves, and goes deeper.
   */
  prose: string
  /**
   * BRAND BRAIN 2.0 — what we UNDERSTOOD, plus three article proposals.
   *
   * Null whenever the synthesis could not run or was too thin to show (no API
   * key, rate-limited, a timeout, a site with almost no prose). The reveal is
   * built to be worth reading without it: the deterministic findings above never
   * needed a model.
   */
  synthesis: BrandSynthesis | null
}

export type GlimpseStep = 'read' | 'documents' | 'voice' | 'think' | 'listen'

export type GlimpseEvent =
  | { type: 'progress'; step: GlimpseStep; status: 'running' | 'done' | 'skipped'; pct: number; detail?: string }
  | { type: 'result'; result: GlimpseResult }
  | { type: 'error'; error: string; code?: 'rate' | 'input' | 'unreadable' }

/* ── The carry ──────────────────────────────────────────────────────────────
   Everything the visitor gave the Door, reduced to strings, so it survives the
   hop through registration into the real onboarding. sessionStorage (not local)
   on purpose: it is scoped to this tab and this visit, which is exactly the
   lifetime of an unfinished signup. */

export const DOOR_CARRY_KEY = 'carma.door.v1'

export type DoorCarry = {
  url: string
  /** Typed text + voice transcript + document text, already merged. */
  text: string
  siteName: string | null
  locale: string | null
  /**
   * EVERYTHING the Door learned, so onboarding continues instead of restarting.
   *
   * The first version carried two strings and threw the rest away, which meant
   * the product forgot, in front of the user, the thing it had just spent a
   * minute proving it understood. Now the whole glimpse crosses the boundary:
   * the prose, the palette, the typefaces, the verbatim quotes, and the
   * synthesis with its three pitches.
   *
   * Size: the corpus is capped at 30k characters, so a carry is ~35KB of JSON
   * against a ~5MB sessionStorage budget. Storage is per-tab and expires with
   * the visit, which is exactly the lifetime of an unfinished signup.
   */
  glimpse: GlimpseResult | null
  at: number
}

/** Corpus cap for the carry. Beyond this the marginal paragraph adds nothing. */
export const CARRY_PROSE_CAP = 30_000

/** Older than this and the visitor has moved on; treat it as absent. */
const CARRY_TTL_MS = 60 * 60 * 1000

export function writeDoorCarry(carry: Omit<DoorCarry, 'at'>): void {
  try {
    if (!carry.url && !carry.text) return
    sessionStorage.setItem(DOOR_CARRY_KEY, JSON.stringify({ ...carry, at: Date.now() }))
  } catch {
    /* private mode, blocked storage — the funnel still works, it just forgets */
  }
}

export function readDoorCarry(): DoorCarry | null {
  try {
    const raw = sessionStorage.getItem(DOOR_CARRY_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as DoorCarry
    if (!c || typeof c !== 'object') return null
    if (!c.at || Date.now() - c.at > CARRY_TTL_MS) { sessionStorage.removeItem(DOOR_CARRY_KEY); return null }
    return c
  } catch {
    return null
  }
}

export function clearDoorCarry(): void {
  cached = null
  try { sessionStorage.removeItem(DOOR_CARRY_KEY) } catch { /* nothing to clear */ }
}

/* ── Reading it from React ──────────────────────────────────────────────────
   The carry is read once per page load and never changes afterwards, which makes
   it a textbook `useSyncExternalStore` source rather than an effect that calls
   setState (which react-hooks v6 rejects outright, and rightly: it is a render
   the component did not need).

   `getSnapshot` must be referentially stable or React re-renders forever, so the
   parsed object is memoised at module scope. The server snapshot is null, so the
   HTML never depends on a value only the browser has. */
let cached: DoorCarry | null | undefined

/** Stable client snapshot of the Door's carry. */
export function doorCarrySnapshot(): DoorCarry | null {
  if (cached === undefined) cached = readDoorCarry()
  return cached
}

/** Server snapshot: there is no sessionStorage on the server, and saying so
 *  explicitly is what keeps hydration honest. */
export function doorCarryServerSnapshot(): DoorCarry | null {
  return null
}

/** The carry never changes mid-session, so there is nothing to subscribe to. */
export function subscribeDoorCarry(): () => void {
  return () => {}
}

/* ── Progress weighting (mirrors lib/brand/types.ts, smaller) ─────────────── */

export const GLIMPSE_STEPS: { id: GlimpseStep; weight: number }[] = [
  { id: 'read', weight: 42 },
  { id: 'documents', weight: 10 },
  { id: 'voice', weight: 10 },
  // The synthesis is the long pole and the interesting one, so it gets the
  // biggest slice of the bar: the progress line reads "thinking" for as long as
  // it is actually thinking.
  { id: 'think', weight: 32 },
  { id: 'listen', weight: 6 },
]

export function glimpseFloor(id: GlimpseStep): number {
  let acc = 0
  for (const s of GLIMPSE_STEPS) {
    if (s.id === id) return acc
    acc += s.weight
  }
  return acc
}

export function glimpseWeight(id: GlimpseStep): number {
  return GLIMPSE_STEPS.find(s => s.id === id)?.weight ?? 0
}

/* ── Choosing what to quote back ─────────────────────────────────────────────
   `candidateSentences()` returns up to 60 candidates in document order. We want
   two, and which two matters: they are the visitor's first impression of whether
   this product has any taste.

   Heuristic, in order of weight:
     · length in the 70–170 band — long enough to carry rhythm, short enough to
       read as a quote rather than a paragraph;
     · a first-person plural marker (fem/fem-ho/som/oferim/we/hacemos) — a brand
       talking about itself beats a brand describing a product;
     · earlier in the document wins ties, because the top of a home page is where
       a business says what it actually is.
   Deliberately dumb and deterministic: the same site always quotes the same way,
   which matters when the founder demos it twice in a row. */

const FIRST_PERSON =
  /\b(fem|som|oferim|treballem|creiem|portem|ens\s|el\s+nostre|la\s+nostra|hacemos|somos|ofrecemos|trabajamos|creemos|llevamos|nuestro|nuestra|we\s|our\s|us\s)/i

export function pickQuotes(candidates: string[], limit = 2): string[] {
  const scored = candidates.map((text, i) => {
    const len = text.length
    let score = 0
    if (len >= 70 && len <= 170) score += 3
    else if (len >= 55 && len <= 200) score += 1
    if (FIRST_PERSON.test(text)) score += 2
    // Position: a mild, monotonic preference for earlier sentences.
    score += Math.max(0, 2 - i / 12)
    return { text, score }
  })
  scored.sort((a, b) => b.score - a.score)

  // Never quote two sentences that open the same way — it reads like a bug.
  const out: string[] = []
  const heads = new Set<string>()
  for (const { text } of scored) {
    const head = text.slice(0, 18).toLowerCase()
    if (heads.has(head)) continue
    heads.add(head)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}
