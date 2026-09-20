// W4 — THE LLM ART DIRECTOR (rung 1).
//
// The model's job here is NOT to be a better calculator. W3 already does the
// arithmetic, in 0.4ms, for free, and it holds 0.635 distinctiveness on its own.
// If this file only reproduced that, it would be a worse version of it with a bill
// attached.
//
// What the model is here for is the one thing the arithmetic structurally cannot
// do: KNOW WHAT THE BUSINESS IS. `evidence.ts` can measure that a site uses a blue
// geometric sans at 30px section rhythm with three hue clusters. It cannot know
// that one of those sites is a paediatric dental clinic and the other is a
// forensic-accounting practice, and that those two want opposite things from the
// same measurements — warmth and generous air in one case, restraint and density in
// the other. The evidence is identical; the correct design is not.
//
// So the prompt is built around that asymmetry, and the output schema deliberately
// asks for a `rationale` naming something about THIS BUSINESS. A rationale that
// merely restates the measurements is a rationale that earned nothing.
//
// EVERYTHING ELSE IS UNCHANGED. The model's choices go through exactly the same
// pipeline as the deterministic director's — `validateGenome` runs the untrusted-
// input boundary, then `completeGenome` samples whatever was left unstated (never
// defaults, see sample.ts) and `applyCohesion` enforces the register allow-lists,
// the pairwise rules and the energy budget. The model is an art director working
// inside a house style, not a new engine.
//
// FAIL-OPEN, WHOLESALE. No key, a timeout, a refusal, malformed JSON, a
// hallucinated font id, two variants in the same register — every one of those
// degrades silently to W3. Wholesale rather than per-variant on purpose: the three
// variants carry guarantees ABOUT EACH OTHER (three registers, three faces, three
// lane structures), and a set half-derived from a model and half from the maths
// satisfies none of them.

import Anthropic from '@anthropic-ai/sdk'
import {
  CORNERS, DIVIDERS, DROP_CAPS, ENTRANCES, FIGURES, FOOTER_ARCHETYPES, GROUNDS,
  HEADER_ARCHETYPES, HEADING_CASES, HOVERS, LANES, LEADINGS, LEADS, LEXICON,
  QUOTE_MARKS, REGISTERS, RHYTHMS, SATURATIONS, SCALES, SCHEMES, TRACKINGS,
  TRANSITIONS, TREATMENTS, UNDERLINES, type Genome, type Register,
} from '@/lib/design/genome'
import { FONT_IDS, font, isFontId, type FontId } from '@/lib/design/fonts'
import { REGISTER_RULES } from '@/lib/design/cohesion'
import { genomeDistance, seedFrom, type RecentUse } from '@/lib/design/sample'
import { validateGenome } from '@/lib/design/validate'
import type { DesignEvidence } from '@/lib/design/evidence'
import {
  DIRECTOR_VERSION, directDeterministic,
  type Directed, type Direction, type VariantName,
} from '@/lib/design/director'

// Following the project convention (cf. WRITING_GEN_MODEL, TRANSLATE_LLM_MODEL).
export const DESIGN_LLM_MODEL = process.env.DESIGN_LLM_MODEL || 'claude-opus-5'
/**
 * Canned response instead of a call — for gating the parse and fail-open paths.
 *
 * READ AT CALL TIME, NOT AT IMPORT. A module-level `const` captured the value
 * before any test could set it, so the gate's "mock" run made twelve real API
 * calls. Config that a test needs to toggle cannot be frozen at import.
 */
export const designLlmMock = (): boolean => process.env.DESIGN_LLM_MOCK === '1'

const TIMEOUT_MS = 45_000

export type DirectedByModel = Directed & {
  /** `directed` = the model's design. `derived` = it fell back to W3. */
  source: 'directed' | 'derived'
  model: string | null
  /** Why it fell back, when it did. Empty on success. This is the training signal. */
  violations: string[]
  usage: { input: number; output: number } | null
  /** One line per variant, in the brand's own terms. Shown to the owner. */
  rationale: Partial<Record<VariantName, string>>
  ms: number
}

// ─── The output schema ───────────────────────────────────────────────────────
//
// Only the axes where JUDGEMENT beats measurement. The model does not choose the
// palette seed (that is the grabber's prominence ranking, which is evidence, not
// taste), the pins (an amplitude rule), the budget, or the chrome POLICY — that one
// is floored by `sourceQuality` and is a consent decision, not a design one.

const enumOf = (values: readonly (string | number)[]) => ({ enum: [...values] })

const VARIANT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['register', 'rationale', 'palette', 'type', 'space', 'feed', 'ornament', 'motion', 'imagery', 'chrome'],
  properties: {
    register: enumOf(REGISTERS),
    rationale: {
      type: 'string',
      description:
        'One sentence naming something about THIS BUSINESS that drove the choice. Not a restatement of the measurements — the maths already has those.',
    },
    palette: {
      type: 'object', additionalProperties: false,
      required: ['scheme', 'ground', 'saturation'],
      properties: { scheme: enumOf(SCHEMES), ground: enumOf(GROUNDS), saturation: enumOf(SATURATIONS) },
    },
    type: {
      type: 'object', additionalProperties: false,
      required: ['heading', 'body', 'scale', 'leading', 'headingCase', 'headingTracking', 'figures'],
      properties: {
        heading: enumOf(FONT_IDS),
        body: enumOf(FONT_IDS),
        scale: enumOf(SCALES),
        leading: enumOf(LEADINGS),
        headingCase: enumOf(HEADING_CASES),
        headingTracking: enumOf(TRACKINGS),
        figures: enumOf(FIGURES),
      },
    },
    space: {
      type: 'object', additionalProperties: false,
      required: ['density', 'lanes'],
      properties: { density: enumOf(['compact', 'comfortable', 'generous', 'vast']), lanes: enumOf(LANES) },
    },
    feed: {
      type: 'object', additionalProperties: false,
      required: ['rhythm', 'columns', 'lead', 'numbering'],
      properties: {
        rhythm: enumOf(RHYTHMS), columns: enumOf(['2', '3', '4']),
        lead: enumOf(LEADS), numbering: { type: 'boolean' },
      },
    },
    ornament: {
      type: 'object', additionalProperties: false,
      required: ['dropCap', 'quoteMark', 'grain', 'divider', 'corner', 'underline'],
      properties: {
        dropCap: enumOf(DROP_CAPS), quoteMark: enumOf(QUOTE_MARKS), grain: enumOf([0, 1, 2]),
        divider: enumOf(DIVIDERS), corner: enumOf(CORNERS), underline: enumOf(UNDERLINES),
      },
    },
    motion: {
      type: 'object', additionalProperties: false,
      required: ['entrance', 'hover', 'transition', 'intensity'],
      properties: {
        entrance: enumOf(ENTRANCES), hover: enumOf(HOVERS),
        transition: enumOf(TRANSITIONS), intensity: enumOf([0, 1, 2]),
      },
    },
    imagery: {
      type: 'object', additionalProperties: false,
      required: ['treatment'],
      properties: { treatment: enumOf(TREATMENTS) },
    },
    chrome: {
      type: 'object', additionalProperties: false,
      required: ['header', 'footer', 'sticky'],
      properties: { header: enumOf(HEADER_ARCHETYPES), footer: enumOf(FOOTER_ARCHETYPES), sticky: { type: 'boolean' } },
    },
  },
} as const

/**
 * `$defs` + `$ref`, and it is not a style preference.
 *
 * Inlining the variant schema three times returns a 400: *"The compiled grammar is
 * too large, which would cause performance issues."* The font enum alone is 28
 * alternations, named twice per variant, and structured output compiles the whole
 * schema into a sampling grammar — so three copies is three times the grammar.
 *
 * Probed against the live API before committing to it: the reference form compiles,
 * the inlined form does not. One call still returns all three variants, which
 * matters because the variants carry guarantees ABOUT EACH OTHER and three
 * independent calls could not coordinate on them.
 */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reading', 'faithful', 'elevated', 'reimagined'],
  properties: {
    reading: {
      type: 'string',
      description: 'Two sentences on what this business actually is, and what that means for how its writing should look.',
    },
    faithful: { $ref: '#/$defs/variant' },
    elevated: { $ref: '#/$defs/variant' },
    reimagined: { $ref: '#/$defs/variant' },
  },
  $defs: { variant: VARIANT_SCHEMA },
} as const

// ─── The prompt ──────────────────────────────────────────────────────────────

function registerCatalogue(): string {
  return REGISTERS.map(r => {
    const A = REGISTER_RULES[r]
    return `  ${r.padEnd(13)} ${A.brief}\n${' '.repeat(17)}budget ${A.energyCap} loud decisions · headings: ${A.headingCats.join('/')} · grounds: ${A.ground.join('/')}`
  }).join('\n')
}

function fontCatalogue(): string {
  const byCat = new Map<string, string[]>()
  for (const id of FONT_IDS) {
    const f = font(id)
    const k = `${f.category}/${f.contrast}`
    byCat.set(k, [...(byCat.get(k) ?? []), `${id} (${f.family})`])
  }
  return [...byCat.entries()].sort().map(([k, v]) => `  ${k.padEnd(20)} ${v.join(', ')}`).join('\n')
}

const SYSTEM = `You are the art director for Carma, which builds a blog for a business from
whatever it can learn about that business.

THE ONE STANDARD EVERYTHING IS JUDGED BY

  ${LEXICON}.

Typography that was chosen rather than defaulted. Spatial rhythm that was composed.
Colour that was reasoned about. Restraint. A page that is a pleasure to read on a
phone on a bus. This is an editorial standard, not an experimental one: no 3D, no
scroll-jacking, no cursor effects, nothing that makes a reader wait.

WHY YOU ARE HERE, AND WHAT YOU MUST NOT DO

A deterministic engine has already designed this blog from the measurements, in
under a millisecond, for free. It reads colour prominence, classifies the typeface,
measures the heading ramp, measures the spatial rhythm, and picks a coherent design.
It is good. You are not here to redo its arithmetic.

You are here for the one thing it structurally cannot do: KNOW WHAT THE BUSINESS IS.
The engine can see that two sites both use a blue geometric sans with 30px section
spacing. It cannot see that one is a paediatric dental clinic and the other is a
forensic-accounting practice — and that those two want opposite things from the same
measurements. Warmth, air and a soft corner for one. Restraint, density and a hard
edge for the other. The evidence is identical; the right design is not.

So: read the business. Then design for it. Every rationale you write must name
something about THIS business — what it sells, who it sells to, what it feels like to
walk in the door. A rationale that restates the measurements has earned nothing,
because the measurements were already free.

THE THREE VARIANTS

You produce three, and they are three AMPLITUDES of one reading, not three attempts:

  faithful    The blog this business's own designer would have made. Respect what
              they have. Their density, their kind of typeface, their composition.
  elevated    Their brand, your art direction. The same business, designed properly.
              Keep what identifies them; replace what merely happened to them.
  reimagined  What this business could look like if it were braver. A real leap. The
              ground inverts — a light brand goes to ink, a dark brand to paper.

HARD RULES (a violation means your entire response is discarded and the maths ships)

  1. The three variants MUST be in three DIFFERENT registers. Three tabs in one
     register is three tabs nobody clicks twice.
  2. Every choice must be inside its register's allow-list, below. A design the
     guardrails have to repair is a design you did not think through.
  3. Stay under the register's energy budget. Loudness is counted: a vivid palette,
     a heavy display face, an oversize quote mark, grain, a big type scale, staggered
     motion. A design is allowed TWO loud moves — one hero, everything else supports.
  4. Typefaces come from the catalogue by ID. Nothing else exists.
  5. Never put a filter over photographs of people. A duotone on a team photo is a
     stylistic flourish applied to someone's face and no business asked for it.

THE REGISTERS

${registerCatalogue()}

THE TYPEFACES (category/stroke-contrast — use the id, not the name)

${fontCatalogue()}

A NOTE ON STROKE CONTRAST. A high-contrast face is a DISPLAY property: its thin
strokes vanish at small sizes. Never pair one with a compact density — that is a
legibility defect, not a style.`

function evidenceDigest(ev: DesignEvidence, baseline: Directed): string {
  const q = ev.sourceQuality
  const lines: string[] = []
  lines.push(`URL: ${ev.url}`)
  lines.push(`\nWHAT THEIR SITE MEASURES AS`)
  lines.push(`  brand colour     ${ev.palette.brand ?? '—'} (${ev.palette.ranked[0]?.why ?? 'nothing carried weight'})`)
  lines.push(`  palette          ${ev.palette.coherence.note}`)
  lines.push(`  background       ${ev.tokens.colorBg}`)
  lines.push(`  headings         ${ev.type.heading.family} — ${ev.type.heading.category}, ${ev.type.heading.contrast} stroke contrast`)
  lines.push(`  body             ${ev.type.body.family} — ${ev.type.body.category}`)
  lines.push(`  heading ramp     ${ev.type.scale.score === null ? 'not judgeable' : `${ev.type.scale.score}/100 — ${ev.type.scale.note}`}`)
  lines.push(`  spatial rhythm   ${ev.density.note}`)
  lines.push(`  imagery          ${ev.imagery.note}`)
  lines.push(`  their own blog   ${ev.feed?.card ? `${ev.feed.card.columns ?? '?'} cards per row` : 'none detected'}`)
  lines.push(`\nHOW GOOD THEIR CURRENT DESIGN IS`)
  lines.push(`  ${q.score}/100 → ${q.verdict}`)
  lines.push(`  ${q.summary}`)
  for (const d of q.deductions) lines.push(`  −${d.points} ${d.axis}: ${d.why}`)
  lines.push(`\nWHAT THE DETERMINISTIC ENGINE ALREADY CONCLUDED`)
  lines.push(`  register prior   ${ev.registerPrior.register} — ${ev.registerPrior.why}`)
  for (const v of [baseline.faithful, baseline.elevated, baseline.reimagined]) {
    const g = v.genome
    lines.push(`  ${v.variant.padEnd(11)} ${g.register} · ${font(g.type.heading).family} + ${font(g.type.body).family} · ${g.palette.ground} · ${g.space.density} · ${g.feed.rhythm}`)
  }
  lines.push(`\nDisagree with it wherever knowing the business tells you something the`)
  lines.push(`measurements could not. Agree with it where it is simply right — matching it`)
  lines.push(`is not a failure, but matching it everywhere means you read nothing.`)
  return lines.join('\n')
}

/** The synthesis brief, when onboarding produced one. This is the business, in words. */
export type BrandBrief = {
  understanding?: string | null
  sector?: string | null
  audience?: string | null
  edge?: string | null
}

function briefDigest(b: BrandBrief | null | undefined): string {
  if (!b || !(b.understanding || b.sector || b.audience || b.edge)) {
    return '\nWHAT THE BUSINESS IS\n  Nothing beyond the site itself. Read it from the evidence above.'
  }
  const l = ['\nWHAT THE BUSINESS IS']
  if (b.understanding) l.push(`  ${b.understanding}`)
  if (b.sector) l.push(`  sector    ${b.sector}`)
  if (b.audience) l.push(`  audience  ${b.audience}`)
  if (b.edge) l.push(`  edge      ${b.edge}`)
  return l.join('\n')
}

// ─── Assembly ────────────────────────────────────────────────────────────────

type RawVariant = Record<string, unknown>

/**
 * One model-chosen variant → a validated genome.
 *
 * The palette SEED, the pins and the chrome policy are not the model's to choose:
 * the seed is the grabber's prominence ranking (evidence, not taste), the pins are
 * the amplitude rule that defines what each variant MEANS, and the policy is floored
 * by `sourceQuality` because it decides whether we touch a customer's header.
 */
function assemble(
  raw: RawVariant,
  variant: VariantName,
  ev: DesignEvidence,
  baseline: Direction,
  seed: number,
  recent: RecentUse,
): { direction: Direction; violations: string[] } {
  const violations: string[] = []
  const reg = typeof raw.register === 'string' && (REGISTERS as readonly string[]).includes(raw.register)
    ? raw.register as Register
    : (violations.push(`${variant}: unknown register ${JSON.stringify(raw.register)}`), baseline.genome.register)

  const t = (raw.type ?? {}) as Record<string, unknown>
  const pickFont = (v: unknown, fallback: FontId, label: string): FontId => {
    if (isFontId(v)) return v
    violations.push(`${variant}: ${label} "${String(v)}" is not a catalogue font id`)
    return fallback
  }

  const base = baseline.genome
  const partial = {
    register: reg,
    seed,
    origin: { source: 'directed' as const, seed, variant },
    palette: {
      // Evidence, not taste — the model does not get to re-pick the brand colour.
      seed: base.palette.seed,
      contrast: 'AA' as const,
      ...(base.palette.pins ? { pins: base.palette.pins } : {}),
      ...((raw.palette as Record<string, unknown>) ?? {}),
    },
    type: {
      heading: pickFont(t.heading, base.type.heading, 'type.heading'),
      body: pickFont(t.body, base.type.body, 'type.body'),
      ...(base.type.basePx ? { basePx: base.type.basePx } : {}),
      ...Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'heading' && k !== 'body')),
      opticalSizing: Boolean(font(pickFont(t.heading, base.type.heading, 'type.heading')).opsz),
    },
    space: {
      ...((raw.space as Record<string, unknown>) ?? {}),
      ...(base.space.maxWidthPx ? { maxWidthPx: base.space.maxWidthPx } : {}),
    },
    feed: { mode: 'grid' as const, ...((raw.feed as Record<string, unknown>) ?? {}) },
    ornament: {
      ...((raw.ornament as Record<string, unknown>) ?? {}),
      ...(base.ornament.radiusPx !== undefined ? { radiusPx: base.ornament.radiusPx } : {}),
    },
    motion: (raw.motion ?? {}) as Record<string, unknown>,
    imagery: { fit: 'cover' as const, ...((raw.imagery as Record<string, unknown>) ?? {}) },
    chrome: {
      // The POLICY is the deterministic director's — it is floored by sourceQuality
      // and decides whether we touch a customer's navigation. The ARCHETYPE is taste.
      policy: baseline.chrome,
      ...((raw.chrome as Record<string, unknown>) ?? {}),
    },
    budget: { faces: 4, cssKb: 14, js: 0 as const },
    ...(base.prose ? { prose: base.prose } : {}),
  }

  const res = validateGenome(partial, { recent, fallbackSeed: seed })
  violations.push(...res.violations.map(v => `${variant}: ${v}`))
  return {
    direction: {
      variant,
      register: res.genome.register,
      genome: res.genome,
      chrome: baseline.chrome,
      trace: [{
        axis: '*', value: 'directed',
        from: typeof raw.rationale === 'string' ? raw.rationale.slice(0, 400) : 'no rationale given',
        rule: `model ${DESIGN_LLM_MODEL}`,
      }],
      repairs: res.repairs,
    },
    violations,
  }
}

/**
 * A canned response representing a GOOD one.
 *
 * The first version varied only the register and the typefaces, and the gate
 * promptly rejected it: 0.308 apart, under the 0.33 floor. That was the guarantee
 * working, not the guarantee misfiring — but it made the mock useless for testing
 * the happy path. A mock that cannot pass the checks the real thing must pass is
 * testing the wrong thing.
 */
function mockResponse(): Record<string, unknown> {
  return {
    reading: 'A mocked reading, for gating the parse, the assembly and the fail-open without a key.',
    faithful: {
      register: 'quiet', rationale: 'mock: what their own designer would have made',
      palette: { scheme: 'monochrome', ground: 'paper', saturation: 'natural' },
      type: { heading: 'inter', body: 'inter', scale: 1.333, leading: 'normal', headingCase: 'sentence', headingTracking: 'normal', figures: 'lining' },
      space: { density: 'comfortable', lanes: 'single' },
      feed: { rhythm: 'minimal', columns: '3', lead: 'none', numbering: false },
      ornament: { dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule', corner: 'soft', underline: 'hover' },
      motion: { entrance: 'none', hover: 'none', transition: 'none', intensity: 0 },
      imagery: { treatment: 'none' },
      chrome: { header: 'split', footer: 'columns', sticky: true },
    },
    elevated: {
      register: 'classic', rationale: 'mock: their brand, designed properly',
      palette: { scheme: 'monochrome', ground: 'tinted', saturation: 'natural' },
      type: { heading: 'ebGaramond', body: 'workSans', scale: 1.5, leading: 'airy', headingCase: 'sentence', headingTracking: 'normal', figures: 'lining' },
      space: { density: 'generous', lanes: 'content-wide' },
      feed: { rhythm: 'editorial', columns: '2', lead: 'first', numbering: false },
      ornament: { dropCap: 'raised', quoteMark: 'rule', grain: 0, divider: 'rule', corner: 'soft', underline: 'always-thin' },
      motion: { entrance: 'fade', hover: 'lift', transition: 'crossfade', intensity: 1 },
      imagery: { treatment: 'none' },
      chrome: { header: 'masthead', footer: 'columns', sticky: false },
    },
    reimagined: {
      register: 'severe', rationale: 'mock: what it could be if it were braver',
      palette: { scheme: 'monochrome', ground: 'ink', saturation: 'natural' },
      type: { heading: 'spaceGrotesk', body: 'inter', scale: 1.25, leading: 'tight', headingCase: 'sentence', headingTracking: 'normal', figures: 'lining' },
      space: { density: 'compact', lanes: 'content-wide-full' },
      feed: { rhythm: 'overlay', columns: '3', lead: 'first', numbering: false },
      ornament: { dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule', corner: 'square', underline: 'hover' },
      motion: { entrance: 'rise', hover: 'shift', transition: 'none', intensity: 0 },
      imagery: { treatment: 'none' },
      chrome: { header: 'stack', footer: 'statement', sticky: false },
    },
  }
}

// ─── The entry point ─────────────────────────────────────────────────────────

export async function directWithModel(
  evidence: DesignEvidence,
  opts: { siteId?: string; recent?: RecentUse; brief?: BrandBrief | null } = {},
): Promise<DirectedByModel> {
  const started = Date.now()
  const baseline = directDeterministic(evidence, opts)
  const fallback = (violations: string[], model: string | null = null): DirectedByModel => ({
    ...baseline, source: 'derived', model, violations, usage: null, rationale: {}, ms: Date.now() - started,
  })

  const mock = designLlmMock()
  if (!mock && !process.env.ANTHROPIC_API_KEY) {
    return fallback(['no ANTHROPIC_API_KEY — the deterministic director is the design'])
  }

  let payload: Record<string, unknown>
  let usage: DirectedByModel['usage'] = null

  if (mock) {
    payload = mockResponse()
  } else {
    try {
      const client = new Anthropic({ maxRetries: 1 })
      const res = await client.messages.create(
        {
          model: DESIGN_LLM_MODEL,
          max_tokens: 8000,
          // Art direction is a judgement task with a lot of interacting
          // constraints — exactly what adaptive thinking is for.
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'high',
            format: { type: 'json_schema', schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> },
          },
          system: SYSTEM,
          messages: [{ role: 'user', content: `${evidenceDigest(evidence, baseline)}\n${briefDigest(opts.brief)}` }],
        },
        { timeout: TIMEOUT_MS },
      )
      if (res.stop_reason === 'refusal') return fallback(['the model declined the request'], DESIGN_LLM_MODEL)
      usage = { input: res.usage.input_tokens, output: res.usage.output_tokens }
      const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
      payload = JSON.parse(text) as Record<string, unknown>
    } catch (e) {
      return fallback([`model call failed: ${e instanceof Error ? e.message : String(e)}`], DESIGN_LLM_MODEL)
    }
  }

  const model = mock ? 'mock' : DESIGN_LLM_MODEL
  const base = seedFrom(opts.siteId ?? evidence.url ?? 'carma', DIRECTOR_VERSION, 'llm')
  const recent = opts.recent ?? {}
  const violations: string[] = []
  const out: Partial<Record<VariantName, Direction>> = {}
  const rationale: DirectedByModel['rationale'] = {}

  for (const variant of ['faithful', 'elevated', 'reimagined'] as const) {
    const raw = payload[variant]
    if (!raw || typeof raw !== 'object') return fallback([`${variant}: missing from the response`], model)
    const r = assemble(raw as RawVariant, variant, evidence, baseline[variant], seedFrom(base, variant), recent)
    violations.push(...r.violations)
    out[variant] = r.direction
    const why = (raw as RawVariant).rationale
    if (typeof why === 'string') rationale[variant] = why.trim().slice(0, 400)
  }

  if (violations.length) return fallback(violations, model)

  // The guarantees the three variants make ABOUT EACH OTHER. These are product
  // requirements, not preferences, and they are the reason the fallback is
  // wholesale: a set half-designed by a model and half by the maths satisfies none
  // of them.
  const three = [out.faithful!, out.elevated!, out.reimagined!]
  const registers = new Set(three.map(d => d.genome.register))
  if (registers.size !== 3) {
    return fallback([`the three variants share a register (${[...registers].join(', ')})`], model)
  }
  const minPair = Math.min(
    genomeDistance(three[0].genome, three[1].genome),
    genomeDistance(three[1].genome, three[2].genome),
    genomeDistance(three[0].genome, three[2].genome),
  )
  if (minPair < 0.33) return fallback([`two variants are only ${minPair.toFixed(3)} apart`], model)

  return {
    faithful: out.faithful!, elevated: out.elevated!, reimagined: out.reimagined!,
    ms: Date.now() - started, degraded: false,
    source: 'directed', model, violations: [], usage, rationale,
  }
}

/** For the eval: what the model chose that the arithmetic did not. */
export function disagreements(a: Directed, b: DirectedByModel): { variant: VariantName; axis: string; maths: string; model: string }[] {
  const out: { variant: VariantName; axis: string; maths: string; model: string }[] = []
  const axes: [string, (g: Genome) => string][] = [
    ['register', g => g.register],
    ['type.heading', g => font(g.type.heading).family],
    ['type.body', g => font(g.type.body).family],
    ['type.scale', g => String(g.type.scale)],
    ['type.headingCase', g => g.type.headingCase],
    ['space.density', g => g.space.density],
    ['space.lanes', g => g.space.lanes],
    ['feed.rhythm', g => g.feed.rhythm],
    ['feed.columns', g => g.feed.columns],
    ['ornament.corner', g => g.ornament.corner],
    ['ornament.dropCap', g => g.ornament.dropCap],
    ['ornament.quoteMark', g => g.ornament.quoteMark],
    ['motion.entrance', g => g.motion.entrance],
    ['palette.ground', g => g.palette.ground],
    ['palette.saturation', g => g.palette.saturation],
  ]
  for (const variant of ['faithful', 'elevated', 'reimagined'] as const) {
    for (const [axis, of] of axes) {
      const m = of(a[variant].genome), l = of(b[variant].genome)
      if (m !== l) out.push({ variant, axis, maths: m, model: l })
    }
  }
  return out
}

/** Exposed for the gate: the exact schema the model is constrained to. */
export const DESIGN_OUTPUT_SCHEMA = OUTPUT_SCHEMA
