// Brand Brain — the OWNER'S CORRECTION pass (server-only).
//
// The capture shows the owner what we understood and then asked them to press
// "Perfecte, continuem". Founder, 2026-09-17: "when Carma presents what it
// learned about the user, DO NOT force them forward. Give the user an interface
// to modify, alter, or improve this profile (via text/voice) before continuing."
//
// That is not a nicety. This profile is what every future article is written
// against, so a wrong sentence here ("you sell courses" when you sell the
// software) is wrong in fifty articles, and the moment the owner is most able to
// catch it is the moment they are reading it for the first time.
//
// TWO KINDS OF CORRECTION, AND THEY ARE HANDLED DIFFERENTLY ON PURPOSE
//
//   FIELDS  — what they sell, who they sell to, the tone words, the themes.
//             Typed straight in, applied verbatim, no model involved. The owner
//             is the authority on their own business; there is nothing to infer.
//
//   A NOTE  — "we're not a shop, we're a workshop, and never call us cheap."
//             Typed or spoken. This one needs a model, because it has to be
//             folded into the RIGHT fields. It is a narrow call: it may only
//             rewrite the handful of fields below.
//
// WHAT A CORRECTION MAY NEVER TOUCH: `voice.exemplars`. Those are real sentences
// lifted verbatim from the owner's own material, chosen by index precisely so no
// model can paraphrase them (see distil.ts). A free-text note is the one input
// that could smuggle invented "quotes" into a field the writer treats as ground
// truth, so this pass carries them across untouched, always.

import { WA_ROUTER_MODEL, WA_MOCK_AGENT } from '@/lib/whatsapp/config'
import type { BrandBrain, BrandSource } from './types'

/** Straight-from-the-owner edits. Every one is applied verbatim. */
export type BrandFieldEdits = {
  whatTheySell?: string | null
  audience?: string | null
  /** Tone words, already split. */
  descriptors?: string[]
  /** Theme names, already split. Keywords are preserved where a name survives. */
  pillars?: string[]
}

const REFINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    what_they_sell: { type: ['string', 'null'] },
    audience_who: { type: ['string', 'null'] },
    voice_descriptors: { type: 'array', items: { type: 'string' } },
    banned_words: { type: 'array', items: { type: 'string' } },
    pillars: { type: 'array', items: { type: 'string' } },
    never_claim: { type: 'array', items: { type: 'string' } },
    acknowledgement: { type: 'string' },
  },
  required: [
    'what_they_sell', 'audience_who', 'voice_descriptors', 'banned_words',
    'pillars', 'never_claim', 'acknowledgement',
  ],
}

const SYSTEM = `You are correcting a brand profile using the owner's own words. The owner has just read what we understood about their business and is telling us what is wrong, missing or misleading.

RULES:
- The owner is ALWAYS right about their own business. Where their note contradicts the profile, the note wins outright.
- Return the FULL corrected value of every field, not a diff: fields the note does not touch come back exactly as they were given to you.
- Never invent facts. If the note does not mention something, do not enrich it — copy it across.
- "banned_words" and "never_claim" are where "never call us X" and "we can't claim Y" belong.
- "voice_descriptors": 3-6 short adjectives for how they write. "pillars": 2-6 short theme names.
- "acknowledgement" is ONE short warm sentence, in the owner's own language, naming what you changed. No lists, no emoji spam, never "As an AI".

Return ONLY the JSON object.`

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()))].slice(0, max)
    : []

/** Apply the typed fields. Pure, synchronous, and the only path most owners need. */
export function applyFieldEdits(brain: BrandBrain, edits: BrandFieldEdits): BrandBrain {
  const next: BrandBrain = {
    ...brain,
    identity: { ...brain.identity },
    audience: { ...brain.audience },
    voice: { ...brain.voice },
    pillars: brain.pillars.map(p => ({ ...p })),
    visual: { ...brain.visual },
    constraints: { ...brain.constraints },
  }

  if (edits.whatTheySell !== undefined) next.identity.whatTheySell = edits.whatTheySell?.trim() || null
  if (edits.audience !== undefined) next.audience.who = edits.audience?.trim() || null
  if (edits.descriptors) next.voice.descriptors = strArr(edits.descriptors, 6)
  if (edits.pillars) {
    // Keep the keywords we already distilled for a theme the owner kept, so
    // renaming one theme doesn't silently throw away the other five's keywords.
    const byName = new Map(brain.pillars.map(p => [p.name.toLowerCase(), p]))
    next.pillars = strArr(edits.pillars, 6).map(name => {
      const kept = byName.get(name.toLowerCase())
      return kept ? { ...kept, name } : { name, keywords: [], coverage: null }
    })
  }
  return next
}

export type RefineResult = { brain: BrandBrain; acknowledgement: string | null }

/**
 * Fold a free-text (or transcribed) correction into the profile.
 *
 * Degrades honestly: with no key, in mock mode, or on any provider failure the
 * owner's note is kept as a proof point on the identity rather than silently
 * dropped, so their words still reach the writer even when the model does not.
 */
export async function refineWithNote(brain: BrandBrain, note: string): Promise<RefineResult> {
  const clean = note.trim().slice(0, 2_000)
  if (!clean) return { brain, acknowledgement: null }

  if (WA_MOCK_AGENT || !process.env.OPENAI_API_KEY) return { brain: keepNote(brain, clean), acknowledgement: null }

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ maxRetries: 1 })
    const completion = await client.chat.completions.create(
      {
        model: WA_ROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              'CURRENT PROFILE:',
              `what_they_sell: ${brain.identity.whatTheySell ?? '(unknown)'}`,
              `audience_who: ${brain.audience.who ?? '(unknown)'}`,
              `voice_descriptors: ${brain.voice.descriptors.join(', ') || '(none)'}`,
              `banned_words: ${brain.voice.bannedWords.join(', ') || '(none)'}`,
              `pillars: ${brain.pillars.map(p => p.name).join(', ') || '(none)'}`,
              `never_claim: ${brain.constraints.neverClaim.join(', ') || '(none)'}`,
              '',
              "THE OWNER'S CORRECTION:",
              '"""',
              clean,
              '"""',
            ].join('\n'),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'carma_brand_refine', strict: true, schema: REFINE_SCHEMA },
        },
      },
      { timeout: 45_000 },
    )

    const p = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>
    const next = applyFieldEdits(brain, {
      whatTheySell: str(p.what_they_sell) || brain.identity.whatTheySell,
      audience: str(p.audience_who) || brain.audience.who,
      descriptors: strArr(p.voice_descriptors, 6),
      pillars: strArr(p.pillars, 6),
    })
    next.voice = {
      ...next.voice,
      bannedWords: strArr(p.banned_words, 12),
      // Untouched, always. See the header note.
      exemplars: brain.voice.exemplars,
    }
    next.constraints = { neverClaim: strArr(p.never_claim, 8) }
    return { brain: keepNote(next, clean), acknowledgement: str(p.acknowledgement) || null }
  } catch {
    return { brain: keepNote(brain, clean), acknowledgement: null }
  }
}

/** Record the owner's own sentence as provenance, capped and de-duplicated. */
function keepNote(brain: BrandBrain, note: string): BrandBrain {
  const label = note.length > 60 ? `${note.slice(0, 57)}…` : note
  if (brain.sources.some(s => s.kind === 'text' && s.label === label)) return brain
  const source: BrandSource = { kind: 'text', label, chars: note.length }
  return { ...brain, sources: [...brain.sources, source].slice(-12) }
}
