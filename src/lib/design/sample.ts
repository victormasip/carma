// DISTINCTIVENESS — the machinery that stops this becoming one infinite template.
//
// FOUNDER CRITIQUE #2, and it is the failure mode that kills products like this.
// A language model asked to design something returns the centre of its training
// distribution, every time, with remarkable consistency. Ask a hundred times and
// you get one design a hundred times: Inter, near-black on near-white, 1.25 scale,
// soft corners, fade-in. It will be tasteful. It will also mean we shipped eight
// templates again, wearing a costume.
//
// Four devices, in the order they matter:
//
//   1. NO AXIS HAS A DEFAULT. This is the big one and it is architectural, not a
//      prompt trick. A default is precisely the mechanism by which a generator
//      regresses: give `motion.entrance` a default of 'fade' and 80% of blogs get
//      fade, because a model that is unsure omits the field. So an omitted field is
//      not filled with a default here — it is SAMPLED from the register's allowed
//      set, deterministically, from the genome's own seed.
//
//   2. THE SEED IS PER-SITE. Two businesses with identical evidence still get
//      different designs, because the seed is a hash of the site id and the
//      variant. Determinism without uniformity.
//
//   3. ANTI-REPETITION SAMPLING. The sampler is handed the values recently used
//      across the corpus and down-weights them. This is the only device here that
//      directly optimises the metric we actually care about, and it costs nothing.
//
//   4. MUTUAL DISTANCE ON VARIANTS. The three designs a customer is shown must be
//      genuinely far apart — `genomeDistance` is the gate, and a variant that lands
//      too close to its sibling is resampled rather than shown.
//
// Everything is deterministic: same seed, same corpus, same genome. That is what
// makes the eval meaningful and what makes "regenerate" reproducible.

import {
  LEADINGS, RATIOS, TRACKINGS, UNDERLINES, type Genome, type Register,
} from '@/lib/design/genome'
import { REGISTER_RULES } from '@/lib/design/cohesion'
import { FONT_IDS, font, type FontId } from '@/lib/design/fonts'

// ─── Deterministic PRNG ──────────────────────────────────────────────────────

/** mulberry32 — small, fast, good enough, and identical on every machine. */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A stable 32-bit seed from any string (site id, variant, evidence digest). */
export function seedFrom(...parts: (string | number)[]): number {
  let h = 2166136261 >>> 0
  for (const p of parts) {
    const s = String(p)
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
  }
  return h >>> 0
}

export type RecentUse = Partial<Record<string, string[]>>

/**
 * Pick from `values`, down-weighting anything the corpus has used recently.
 *
 * The penalty is exponential in how recently the value was used, so the first
 * blog in a niche gets a free choice and the tenth is pushed firmly elsewhere.
 * A value is never made impossible — if every option is saturated, the sampler
 * still returns one rather than failing.
 */
export function pickAvoiding<T extends string | number>(
  rng: () => number,
  values: readonly T[],
  recent: readonly string[] = [],
): T {
  if (values.length === 0) throw new Error('pickAvoiding: empty candidate set')
  if (values.length === 1) return values[0]
  const weights = values.map(v => {
    const i = recent.indexOf(String(v))
    if (i < 0) return 1
    // Most recent use is index 0 and is penalised hardest.
    return Math.max(0.05, 1 / Math.pow(2, recent.length - i))
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < values.length; i++) {
    r -= weights[i]
    if (r <= 0) return values[i]
  }
  return values[values.length - 1]
}

function fontsInCats(cats: readonly string[]): FontId[] {
  return FONT_IDS.filter(id => cats.includes(font(id).category))
}

/**
 * A genome under construction: every axis optional, and every FIELD inside an axis
 * optional too.
 *
 * The first version used `Partial<Omit<Genome, …>>`, which makes the axis objects
 * optional but still demands them WHOLE — so a caller that had derived
 * `space.density` from evidence but wanted `space.ratio` sampled had to invent a
 * ratio, which is exactly the defaulting this module exists to prevent. W3 found it
 * the moment a real caller tried to state some of an axis and leave the rest open.
 */
type PartialAxes = {
  [K in keyof Omit<Genome, 'v' | 'register' | 'origin'>]?: Partial<NonNullable<Genome[K]>>
}

export type PartialGenome = {
  register: Register
  seed: number
} & PartialAxes & { origin?: Partial<Genome['origin']> }

/**
 * Fill every unspecified axis by SAMPLING, never by defaulting.
 *
 * Anything the art director stated is preserved verbatim; anything it left out is
 * drawn from the register's allow-list with the anti-repetition weighting. The
 * result always passes `applyCohesion` structurally because every draw is already
 * in-register — cohesion then only has to resolve pairwise conflicts and energy.
 */
export function completeGenome(input: PartialGenome, recent: RecentUse = {}): Genome {
  const A = REGISTER_RULES[input.register]
  const rng = rngFrom(input.seed)
  const R = (k: string) => recent[k] ?? []

  const headingCats = A.headingCats
  const bodyCats = A.bodyCats
  const heading = input.type?.heading ?? pickAvoiding(rng, fontsInCats(headingCats), R('type.heading'))
  // A body face is drawn from a different family than the heading unless the
  // register is happy with a single-family design; one-family systems are a real
  // and good choice (Carma itself is one), so we allow it rather than forbid it.
  const bodyPool = fontsInCats(bodyCats)
  const body = input.type?.body ?? pickAvoiding(rng, bodyPool, R('type.body'))

  const g: Genome = {
    v: 1,
    register: input.register,
    origin: {
      source: input.origin?.source ?? 'derived',
      seed: input.seed,
      ...(input.origin?.parent ? { parent: input.origin.parent } : {}),
      ...(input.origin?.variant ? { variant: input.origin.variant } : {}),
      ...(input.origin?.presetId ? { presetId: input.origin.presetId } : {}),
    },
    palette: {
      seed: input.palette?.seed ?? { l: 0.55, c: 0.14, h: Math.floor(rng() * 360) },
      scheme: input.palette?.scheme ?? pickAvoiding(rng, A.scheme, R('palette.scheme')),
      ground: input.palette?.ground ?? pickAvoiding(rng, A.ground, R('palette.ground')),
      saturation: input.palette?.saturation ?? pickAvoiding(rng, A.saturation, R('palette.saturation')),
      contrast: input.palette?.contrast ?? 'AA',
      ...(input.palette?.counterHue !== undefined ? { counterHue: input.palette.counterHue } : {}),
      ...(input.palette?.pins ? { pins: input.palette.pins } : {}),
    },
    type: {
      heading,
      body,
      ...(input.type?.accentFace ? { accentFace: input.type.accentFace } : {}),
      scale: input.type?.scale ?? pickAvoiding(rng, A.scale, R('type.scale')),
      measure: input.type?.measure ?? 58 + Math.floor(rng() * 21),
      leading: input.type?.leading ?? pickAvoiding(rng, LEADINGS, R('type.leading')),
      headingCase: input.type?.headingCase ?? pickAvoiding(rng, A.headingCase, R('type.headingCase')),
      headingTracking: input.type?.headingTracking ?? pickAvoiding(rng, TRACKINGS, R('type.headingTracking')),
      figures: input.type?.figures ?? pickAvoiding(rng, A.figures, R('type.figures')),
      opticalSizing: input.type?.opticalSizing ?? Boolean(font(heading).opsz),
      ...(input.type?.headingWeights ? { headingWeights: input.type.headingWeights } : {}),
      ...(input.type?.bodyWeights ? { bodyWeights: input.type.bodyWeights } : {}),
      ...(input.type?.basePx !== undefined ? { basePx: input.type.basePx } : {}),
      ...(input.type?.headingWeight !== undefined ? { headingWeight: input.type.headingWeight } : {}),
      ...(input.type?.sectionTitleWeight !== undefined ? { sectionTitleWeight: input.type.sectionTitleWeight } : {}),
      ...(input.type?.sectionTitleSizeRem !== undefined ? { sectionTitleSizeRem: input.type.sectionTitleSizeRem } : {}),
      ...(input.type?.sectionTitleAlign ? { sectionTitleAlign: input.type.sectionTitleAlign } : {}),
    },
    space: {
      ratio: input.space?.ratio ?? pickAvoiding(rng, RATIOS, R('space.ratio')),
      density: input.space?.density ?? pickAvoiding(rng, A.density, R('space.density')),
      lanes: input.space?.lanes ?? pickAvoiding(rng, ['single', 'content-wide', 'content-wide-full'] as const, R('space.lanes')),
      rule: input.space?.rule ?? pickAvoiding(rng, ['none', 'hairline', 'heavy'] as const, R('space.rule')),
      ...(input.space?.maxWidthPx !== undefined ? { maxWidthPx: input.space.maxWidthPx } : {}),
    },
    feed: {
      rhythm: input.feed?.rhythm ?? pickAvoiding(rng, A.rhythm, R('feed.rhythm')),
      mode: input.feed?.mode ?? 'grid',
      columns: input.feed?.columns ?? pickAvoiding(rng, ['2', '3', '4'] as const, R('feed.columns')),
      lead: input.feed?.lead ?? pickAvoiding(rng, ['none', 'first'] as const, R('feed.lead')),
      numbering: input.feed?.numbering ?? rng() < 0.15,
    },
    ornament: {
      dropCap: input.ornament?.dropCap ?? pickAvoiding(rng, A.dropCap, R('ornament.dropCap')),
      quoteMark: input.ornament?.quoteMark ?? pickAvoiding(rng, A.quoteMark, R('ornament.quoteMark')),
      grain: input.ornament?.grain ?? pickAvoiding(rng, A.grain, R('ornament.grain')),
      divider: input.ornament?.divider ?? pickAvoiding(rng, A.divider, R('ornament.divider')),
      corner: input.ornament?.corner ?? pickAvoiding(rng, A.corner, R('ornament.corner')),
      underline: input.ornament?.underline ?? pickAvoiding(rng, UNDERLINES, R('ornament.underline')),
      ...(input.ornament?.radiusPx !== undefined ? { radiusPx: input.ornament.radiusPx } : {}),
      ...(input.ornament?.radiusLgPx !== undefined ? { radiusLgPx: input.ornament.radiusLgPx } : {}),
    },
    motion: {
      entrance: input.motion?.entrance ?? pickAvoiding(rng, A.entrance, R('motion.entrance')),
      hover: input.motion?.hover ?? pickAvoiding(rng, A.hover, R('motion.hover')),
      transition: input.motion?.transition ?? pickAvoiding(rng, A.transition, R('motion.transition')),
      intensity: input.motion?.intensity ?? (rng() < 0.6 ? 1 : 0),
    },
    imagery: {
      treatment: input.imagery?.treatment ?? pickAvoiding(rng, A.treatment, R('imagery.treatment')),
      fit: input.imagery?.fit ?? 'cover',
    },
    chrome: {
      // `harmonise` is the only defensible fallback rung: `keep` would bolt our blog
      // under markup nobody has judged, and `rebuild` would discard a header we have
      // no reason to distrust. The director overrides this from the verdict.
      policy: input.chrome?.policy ?? 'harmonise',
      header: input.chrome?.header ?? pickAvoiding(rng, ['masthead', 'split', 'stack', 'rail', 'minimal'] as const, R('chrome.header')),
      footer: input.chrome?.footer ?? pickAvoiding(rng, ['columns', 'bar', 'statement'] as const, R('chrome.footer')),
      sticky: input.chrome?.sticky ?? rng() < 0.7,
    },
    budget: {
      faces: input.budget?.faces ?? 4,
      cssKb: input.budget?.cssKb ?? 14,
      js: 0,
    },
    ...(input.button ? { button: input.button } : {}),
    ...(input.prose ? { prose: input.prose } : {}),
  }
  return g
}

// ─── Distance ────────────────────────────────────────────────────────────────

/** The axes distinctiveness is measured over, and what each is worth. Structure
 *  and colour carry more than texture, because that is what a reader notices from
 *  across a room. */
const AXES: { key: string; weight: number; of: (g: Genome) => string | number }[] = [
  { key: 'register', weight: 3, of: g => g.register },
  { key: 'palette.ground', weight: 2, of: g => g.palette.ground },
  { key: 'palette.scheme', weight: 1, of: g => g.palette.scheme },
  { key: 'palette.saturation', weight: 1, of: g => g.palette.saturation },
  { key: 'type.heading', weight: 3, of: g => g.type.heading },
  { key: 'type.body', weight: 2, of: g => g.type.body },
  { key: 'type.scale', weight: 1, of: g => g.type.scale },
  { key: 'type.headingCase', weight: 1, of: g => g.type.headingCase },
  { key: 'space.density', weight: 2, of: g => g.space.density },
  { key: 'space.lanes', weight: 1, of: g => g.space.lanes },
  { key: 'feed.rhythm', weight: 3, of: g => g.feed.rhythm },
  { key: 'feed.columns', weight: 1, of: g => g.feed.columns },
  { key: 'ornament.dropCap', weight: 1, of: g => g.ornament.dropCap },
  { key: 'ornament.quoteMark', weight: 1, of: g => g.ornament.quoteMark },
  { key: 'ornament.corner', weight: 1, of: g => g.ornament.corner },
  { key: 'motion.entrance', weight: 1, of: g => g.motion.entrance },
  { key: 'imagery.treatment', weight: 1, of: g => g.imagery.treatment },
]

const AXIS_TOTAL = AXES.reduce((a, b) => a + b.weight, 0)

/**
 * 0 = identical, 1 = share nothing.
 *
 * Hue is folded in separately because two blogs can differ on every categorical
 * axis and still read as the same blog if they are both blue — colour is the first
 * thing a person compares and the last thing a categorical diff notices.
 */
export function genomeDistance(a: Genome, b: Genome): number {
  let d = 0
  for (const ax of AXES) if (ax.of(a) !== ax.of(b)) d += ax.weight
  const categorical = d / AXIS_TOTAL
  const dh = Math.abs(((a.palette.seed.h - b.palette.seed.h + 540) % 360) - 180) / 180
  return Math.round((categorical * 0.8 + dh * 0.2) * 1000) / 1000
}

/** Mean pairwise distance over a corpus. THE metric for "bespoke". */
export function distinctiveness(genomes: Genome[]): number {
  if (genomes.length < 2) return 1
  let sum = 0, n = 0
  for (let i = 0; i < genomes.length; i++) {
    for (let j = i + 1; j < genomes.length; j++) { sum += genomeDistance(genomes[i], genomes[j]); n++ }
  }
  return Math.round((sum / n) * 1000) / 1000
}
