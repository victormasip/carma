// Brand Brain — the distillation pass (server-only).
//
// One LLM call turns the raw corpus (website prose + documents + a voice note)
// into the structured brand the WhatsApp agent reads on every write turn.
//
// THE ONE DESIGN DECISION THAT MATTERS HERE
// ─────────────────────────────────────────
// Verbatim exemplars are chosen BY INDEX, not written.
//
// The single highest-value field in the profile is 3–5 sentences in the brand's
// OWN words — few-shot examples beat any quantity of adjectives for making
// generated prose sound like them. But if you ask a model to "quote sentences
// from the text", it paraphrases: tidies the punctuation, fixes the grammar,
// smooths the rhythm. And rhythm is precisely the thing we were trying to capture.
//
// So the candidate sentences are numbered, the model returns INDICES, and we look
// the sentences back up ourselves. It cannot rewrite what it never emits.
//
// Follows the existing profiler's conventions (whatsapp/profile.ts): OpenAI with a
// strict JSON schema, WA_MOCK_AGENT for credit-free tests, and every failure
// degrading to null rather than throwing — a brand capture that fails must cost
// the owner a nicety, never their onboarding.

import { WA_ROUTER_MODEL, WA_MOCK_AGENT } from '@/lib/whatsapp/config'
import { isLocale, type Locale } from '@/lib/i18n/config'
import type { BrandBrain, BrandCorpus } from './types'

/** Prose budget handed to the model. Beyond this the marginal sentence adds nothing. */
const MAX_CORPUS_CHARS = 48_000
const MAX_CANDIDATES = 60

const BRAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    identity: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        tagline: { type: 'string' },
        what_they_sell: { type: 'string' },
        proof_points: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'tagline', 'what_they_sell', 'proof_points'],
    },
    audience: {
      type: 'object',
      additionalProperties: false,
      properties: {
        who: { type: 'string' },
        register: { type: 'string' },
        problems: { type: 'array', items: { type: 'string' } },
      },
      required: ['who', 'register', 'problems'],
    },
    industry: { type: 'string' },
    voice: {
      type: 'object',
      additionalProperties: false,
      properties: {
        descriptors: { type: 'array', items: { type: 'string' } },
        register: { type: 'string' },
        banned_words: { type: 'array', items: { type: 'string' } },
        sentence_length: { type: 'string', enum: ['short', 'medium', 'long'] },
        emoji_policy: { type: 'string' },
        // INDICES into the numbered candidate list — never free text.
        exemplar_indices: { type: 'array', items: { type: 'integer' } },
      },
      required: ['descriptors', 'register', 'banned_words', 'sentence_length', 'emoji_policy', 'exemplar_indices'],
    },
    pillars: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
          coverage: { type: 'string', enum: ['covered', 'thin', 'gap'] },
        },
        required: ['name', 'keywords', 'coverage'],
      },
    },
    imagery_style: { type: 'string' },
    never_claim: { type: 'array', items: { type: 'string' } },
    writing_dos: { type: 'array', items: { type: 'string' } },
    writing_donts: { type: 'array', items: { type: 'string' } },
    language: { type: 'string' },
  },
  required: [
    'identity', 'audience', 'industry', 'voice', 'pillars',
    'imagery_style', 'never_claim', 'writing_dos', 'writing_donts', 'language',
  ],
}

const SYSTEM = `You are a brand analyst. You are given everything a business has told us about itself: prose from their website, text from documents they uploaded, and sometimes a transcript of the owner describing the business out loud. From that, produce a compact, concrete brand profile that a writer will use to draft articles in this brand's voice.

HARD RULES:
- Never invent facts. If the material does not say it, leave the field thin rather than plausible. A generic profile is worse than a short one, because it teaches the writer to produce generic articles.
- Be specific to THIS business. "Quality service and customer focus" describes nothing. "Structural surveys for pre-1960 Eixample buildings" describes them.
- Write every value in the brand's OWN language (the language the material is written in), not in English, unless the material is English.
- exemplar_indices: pick 3 to 5 indices from the numbered CANDIDATE SENTENCES list. Choose the ones that best capture how this brand actually writes — its rhythm, its vocabulary, its level of formality. Prefer sentences that sound like a person wrote them over slogans. Return ONLY indices; never write your own sentence.
- banned_words: words or phrases this brand visibly avoids, or that would clash with its register. Keep it short and real.
- never_claim: only claims that would be unsafe, regulated or untrue for this business (medical/legal/financial guarantees, superlatives they never use). Empty array if nothing applies.
- The owner's spoken description, when present, is the most authoritative source about what they sell and who they serve — it is them telling you directly. Website prose is the most authoritative source for VOICE.

Return ONLY the JSON object.`

function buildUserMessage(corpus: BrandCorpus): string {
  const parts: string[] = []
  parts.push(`BUSINESS: ${corpus.siteName || '(unknown)'}`)
  if (corpus.originUrl) parts.push(`WEBSITE: ${corpus.originUrl}`)
  if (corpus.visual.fonts.length) parts.push(`TYPOGRAPHY SEEN: ${corpus.visual.fonts.join(', ')}`)
  if (corpus.visual.colors.length) parts.push(`COLOURS SEEN: ${corpus.visual.colors.join(', ')}`)
  parts.push('')
  parts.push('--- MATERIAL ---')
  parts.push(corpus.text.slice(0, MAX_CORPUS_CHARS))
  parts.push('')
  parts.push('--- CANDIDATE SENTENCES (choose exemplar_indices from these) ---')
  corpus.candidateSentences.slice(0, MAX_CANDIDATES).forEach((s, i) => parts.push(`[${i}] ${s}`))
  return parts.join('\n')
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown, cap: number): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, cap) : []

/**
 * Resolve the model's chosen indices back into the ORIGINAL sentences.
 *
 * Out-of-range indices are dropped silently. If the model returns nothing usable
 * we fall back to the longest few candidates — having real sentences from the
 * brand matters more than having the *best* real sentences.
 */
function resolveExemplars(indices: unknown, candidates: string[]): string[] {
  const picked: string[] = []
  const seen = new Set<number>()
  if (Array.isArray(indices)) {
    for (const raw of indices) {
      const i = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
      if (!Number.isInteger(i) || i < 0 || i >= candidates.length || seen.has(i)) continue
      seen.add(i)
      picked.push(candidates[i])
      if (picked.length >= 5) break
    }
  }
  if (picked.length > 0) return picked
  return [...candidates]
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
}

/** Deterministic profile for WA_MOCK_AGENT / no API key. Never spends credit. */
function mockBrain(corpus: BrandCorpus): BrandBrain {
  return {
    identity: {
      name: corpus.siteName || null,
      tagline: null,
      whatTheySell: null,
      proofPoints: [],
    },
    audience: { who: null, register: null, problems: [] },
    voice: {
      descriptors: ['clar', 'proper'],
      register: 'informal',
      bannedWords: [],
      sentenceLength: 'medium',
      emojiPolicy: 'moderat',
      exemplars: corpus.candidateSentences.slice(0, 3),
    },
    pillars: [],
    visual: corpus.visual,
    constraints: { neverClaim: [] },
    locale: isLocale(corpus.detectedLocale ?? '') ? (corpus.detectedLocale as Locale) : null,
    sources: corpus.sources,
    capturedAt: new Date().toISOString(),
  }
}

export type DistilledBrand = {
  brain: BrandBrain
  /** The 030-column values, so the caller can write both shapes in one upsert. */
  industry: string | null
  writingDos: string[]
  writingDonts: string[]
}

/**
 * Distil a corpus into a Brand Brain. Returns null only when there is genuinely
 * nothing to work with; every other failure degrades to the deterministic profile
 * so the owner still ends onboarding with an agent that knows something.
 */
export async function distilBrand(corpus: BrandCorpus): Promise<DistilledBrand | null> {
  if (!corpus.text.trim() && corpus.candidateSentences.length === 0) return null

  if (WA_MOCK_AGENT || !process.env.OPENAI_API_KEY) {
    const brain = mockBrain(corpus)
    return { brain, industry: null, writingDos: [], writingDonts: [] }
  }

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ maxRetries: 1 })
    const completion = await client.chat.completions.create(
      {
        model: WA_ROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUserMessage(corpus) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'carma_brand_brain', strict: true, schema: BRAND_SCHEMA },
        },
      },
      { timeout: 60_000 },
    )

    const p = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>
    const identity = (p.identity ?? {}) as Record<string, unknown>
    const audience = (p.audience ?? {}) as Record<string, unknown>
    const voice = (p.voice ?? {}) as Record<string, unknown>

    const lang = str(p.language).slice(0, 2).toLowerCase()
    const locale: Locale | null = isLocale(lang)
      ? (lang as Locale)
      : isLocale(corpus.detectedLocale ?? '')
        ? (corpus.detectedLocale as Locale)
        : null

    const brain: BrandBrain = {
      identity: {
        name: str(identity.name) || corpus.siteName || null,
        tagline: str(identity.tagline) || null,
        whatTheySell: str(identity.what_they_sell) || null,
        proofPoints: strArr(identity.proof_points, 6),
      },
      audience: {
        who: str(audience.who) || null,
        register: str(audience.register) || null,
        problems: strArr(audience.problems, 6),
      },
      voice: {
        descriptors: strArr(voice.descriptors, 6),
        register: str(voice.register) || null,
        bannedWords: strArr(voice.banned_words, 12),
        sentenceLength: str(voice.sentence_length) || null,
        emojiPolicy: str(voice.emoji_policy) || null,
        exemplars: resolveExemplars(voice.exemplar_indices, corpus.candidateSentences),
      },
      pillars: Array.isArray(p.pillars)
        ? (p.pillars as Record<string, unknown>[]).slice(0, 6).map(x => ({
            name: str(x.name),
            keywords: strArr(x.keywords, 8),
            coverage: str(x.coverage) || null,
          })).filter(x => x.name)
        : [],
      visual: { ...corpus.visual, imageryStyle: str(p.imagery_style) || null },
      constraints: { neverClaim: strArr(p.never_claim, 8) },
      locale,
      sources: corpus.sources,
      capturedAt: new Date().toISOString(),
    }

    return {
      brain,
      industry: str(p.industry) || null,
      writingDos: strArr(p.writing_dos, 6),
      writingDonts: strArr(p.writing_donts, 6),
    }
  } catch (e) {
    console.error('[brand/distil] failed:', e instanceof Error ? e.message : e)
    // Still return something: the candidate sentences alone already make the
    // agent write more like this brand than an empty profile would.
    const brain = mockBrain(corpus)
    return { brain, industry: null, writingDos: [], writingDonts: [] }
  }
}
