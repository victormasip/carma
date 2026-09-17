// BRAND BRAIN 2.0 — the synthesis pass behind the landing Door (server-only).
//
// WHAT CHANGED, AND WHY
// ─────────────────────
// The first Door shipped a deliberately model-free reveal: real pages read, real
// palette, and two of the brand's own sentences pulled out by a deterministic
// extractor. That was honest and it cost nothing — but the founder's read was
// correct: quoting a business back at itself is not understanding. It proves we
// can READ. It does not prove we can THINK.
//
// So this pass does the thinking, and it is judged by one standard:
//
//   Every sentence it produces must be one that ONLY this business could have
//   been given. A line that would fit any competitor in the same sector is a
//   failure, no matter how well written.
//
// It combines two sources the visitor cannot combine themselves:
//   · what their own site actually says (specifics: years, place, products,
//     process, the promises they make);
//   · what the model knows about that sector — the questions customers ask, the
//     seasonality, what the neighbours are already publishing and where the hole
//     is.
//
// The output is a short understanding, the ground it stands on, and THREE
// article pitches. The pitches are the point: nothing demonstrates "this thing
// gets my business" faster than three headlines the owner wishes they had
// thought of.
//
// COST AND SAFETY. This is an LLM call on an UNAUTHENTICATED endpoint, which the
// first version of the Door deliberately avoided. It is now allowed, bounded:
//   · the cheap router model, not the writer;
//   · a hard corpus cap (12k chars — a home page plus a couple of pages);
//   · its own rate-limit budget in the route, tighter than the scrape's;
//   · a 30s timeout and total fail-open — no key, a refusal, a timeout or a
//     malformed payload all degrade to `null`, and the reveal falls back to the
//     deterministic findings that never needed a model at all.

import { WA_ROUTER_MODEL, WA_MOCK_AGENT } from '@/lib/whatsapp/config'

/** Prose handed to the model. Past this the marginal paragraph adds nothing. */
const MAX_CORPUS_CHARS = 12_000

export type ArticlePitch = {
  /** A headline in the brand's own language and register, ready to publish. */
  title: string
  /** One line on what the piece actually argues or shows. */
  angle: string
  /** Why THIS business, now — the specific hook it stands on. */
  why: string
  /** The search term it goes after. */
  keyword: string
}

export type BrandSynthesis = {
  /** Two sentences on what this business actually is. Synthesised, never quoted. */
  understanding: string
  /** The field, named the way the owner would name it. */
  sector: string
  /** Who they serve, concretely. */
  audience: string
  /** What sets them apart, drawn from evidence on the page. */
  edge: string
  /** Things their audience wants that their site never covers. */
  gaps: string[]
  /** Three proposals. The whole point of the pass. */
  pitches: ArticlePitch[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    understanding: { type: 'string' },
    sector: { type: 'string' },
    audience: { type: 'string' },
    edge: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
    pitches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          angle: { type: 'string' },
          why: { type: 'string' },
          keyword: { type: 'string' },
        },
        required: ['title', 'angle', 'why', 'keyword'],
      },
    },
  },
  required: ['understanding', 'sector', 'audience', 'edge', 'gaps', 'pitches'],
} as const

const SYSTEM = `You are Carma, a Catalan publishing agent meeting a business for the first time.

You have just read their website. Your job is to prove, in about ten seconds of
reading, that you understand their business better than a generic tool would —
and then to propose three articles they should publish.

THE STANDARD YOU ARE JUDGED BY
Every sentence you write must be one that ONLY this business could have been
given. If a line would fit any competitor in the same sector, it has failed.
Use their specifics: the year they started, the town, the process they describe,
the products they name, the promises they make, the people they mention.

DO NOT QUOTE. You are not summarising the page back at them — they wrote it, they
know what it says. Synthesise: say what the business IS, what it is actually
selling underneath what it says it sells, and who is paying for it.

THE THREE PITCHES ARE THE POINT
Combine two things the owner cannot combine alone:
  1. what their own site tells you about them, and
  2. what you know about their sector — the questions their customers actually
     ask, the seasonality of their trade, what their competitors publish and
     where the obvious hole is, what someone types into a search box at the
     moment they are about to buy.

A good pitch is specific, useful, and writable this week. It has a headline that
earns a click without lying, an angle you could hand to a writer, and a reason it
works for THIS business right now. Avoid: "5 tips", "the ultimate guide", "why X
matters", anything a content farm would publish.

LANGUAGE
Write everything — understanding, sector, audience, edge, gaps, and every pitch —
in the language the website is written in. If that is Catalan, write Catalan, and
use the register the site uses (tu or vostè, warm or formal). Never mix languages.

LENGTH
understanding: two sentences, maximum 45 words.
sector: a short noun phrase.
audience: one sentence.
edge: one sentence, and it must cite something concrete from the page.
gaps: two or three short phrases.
pitches: exactly three.`

function buildUserMessage(input: {
  siteName: string | null
  url: string | null
  locale: string | null
  prose: string
}): string {
  const parts: string[] = []
  if (input.siteName) parts.push(`BUSINESS NAME: ${input.siteName}`)
  if (input.url) parts.push(`WEBSITE: ${input.url}`)
  if (input.locale) parts.push(`SITE LANGUAGE: ${input.locale}`)
  parts.push(`\nWHAT THEIR WEBSITE SAYS:\n${input.prose.slice(0, MAX_CORPUS_CHARS)}`)
  parts.push(
    '\nNow: understand them, then propose three articles only they could publish.',
  )
  return parts.join('\n')
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function strArr(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : []
}

/**
 * Synthesise a brand and propose three articles.
 *
 * Returns null on every failure path — no key, mock mode, a refusal, a timeout,
 * a malformed payload, or a result too thin to be worth showing. The caller
 * always has the deterministic findings to fall back on, so a null here costs
 * the visitor a flourish and never the reveal.
 */
export async function synthesiseBrand(input: {
  siteName: string | null
  url: string | null
  locale: string | null
  prose: string
}): Promise<BrandSynthesis | null> {
  const prose = input.prose.trim()
  // Below this there is nothing to be smart about, and a model asked to be smart
  // about nothing invents things. Better to show the honest findings alone.
  if (prose.length < 400) return null
  if (WA_MOCK_AGENT || !process.env.OPENAI_API_KEY) return null

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ maxRetries: 0 })
    const completion = await client.chat.completions.create(
      {
        model: WA_ROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUserMessage({ ...input, prose }) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'carma_brand_synthesis', strict: true, schema: SCHEMA },
        },
      },
      { timeout: 30_000 },
    )

    const p = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>

    const pitches: ArticlePitch[] = (Array.isArray(p.pitches) ? p.pitches : [])
      .map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>
        return {
          title: str(o.title),
          angle: str(o.angle),
          why: str(o.why),
          keyword: str(o.keyword),
        }
      })
      .filter(pitch => pitch.title && pitch.angle)
      .slice(0, 3)

    const understanding = str(p.understanding)
    // A reveal with no understanding and no pitches is worse than no reveal: it
    // is a loading state that resolved into nothing.
    if (!understanding && pitches.length === 0) return null

    return {
      understanding,
      sector: str(p.sector),
      audience: str(p.audience),
      edge: str(p.edge),
      gaps: strArr(p.gaps, 3),
      pitches,
    }
  } catch (e) {
    console.error('[synthesis] failed:', e instanceof Error ? e.message : e)
    return null
  }
}
