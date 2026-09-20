// COHESION — the guardrails that stop the grammar producing monsters.
//
// FOUNDER CRITIQUE #1, and it was the right catch. Orthogonal axes multiply
// cleanly and compose badly: `vivid + oldstyle serif + mosaic + vast` is
// arithmetically valid and aesthetically incoherent. A generator with 30
// independent axes and no spine does not produce 10^20 designs. It produces 10^20
// ways to be wrong, a handful of which happen to look deliberate.
//
// There are three layers of defence here, in the order they run:
//
//   1. THE REGISTER ALLOW-LIST. Every genome belongs to one of six families, and
//      each family publishes what it may use per axis. A choice outside the list is
//      repaired to the nearest in-register value. This is the spine: it is what
//      makes "vivid + oldstyle serif" unrepresentable rather than merely discouraged,
//      because oldstyle figures live in `classic`/`warm` and vivid lives in
//      `contemporary`/`bold`, and no register lists both.
//
//   2. PAIRWISE RULES. A small set of combinations that are wrong for a REASON that
//      is specific rather than stylistic — a drop cap fighting an oversize quote in
//      one column, uppercase at tight tracking, a mono body at 70ch, a high-contrast
//      display serif in a compact grid. Each carries its reason in the code.
//
//   3. THE ENERGY BUDGET. The one that does the real work. Every axis value has a
//      LOUDNESS cost, and a register caps the total. This encodes the oldest rule in
//      art direction — one hero, everything else supports — as arithmetic. A design
//      is allowed two loud moves. Ask for six and the compiler sheds them, in a
//      fixed published order, and tells you which it took.
//
// Everything here is DETERMINISTIC and reports what it did. A silent guardrail is
// indistinguishable from a bug.

import {
  DENSITIES, SCALES, type Density, type Genome, type Register, type Scale,
} from '@/lib/design/genome'
import { FONT_IDS, font, type FontCategory, type FontId } from '@/lib/design/fonts'
import { counterHueFor } from '@/lib/design/color'

export type Repair = { rule: string; why: string }

type Allow = {
  scheme: readonly Genome['palette']['scheme'][]
  ground: readonly Genome['palette']['ground'][]
  saturation: readonly Genome['palette']['saturation'][]
  headingCats: readonly FontCategory[]
  bodyCats: readonly FontCategory[]
  headingCase: readonly Genome['type']['headingCase'][]
  figures: readonly Genome['type']['figures'][]
  scale: readonly Scale[]
  density: readonly Density[]
  rhythm: readonly Genome['feed']['rhythm'][]
  dropCap: readonly Genome['ornament']['dropCap'][]
  quoteMark: readonly Genome['ornament']['quoteMark'][]
  grain: readonly (0 | 1 | 2)[]
  divider: readonly Genome['ornament']['divider'][]
  corner: readonly Genome['ornament']['corner'][]
  entrance: readonly Genome['motion']['entrance'][]
  hover: readonly Genome['motion']['hover'][]
  transition: readonly Genome['motion']['transition'][]
  treatment: readonly Genome['imagery']['treatment'][]
  /** Maximum total loudness. The whole anti-Frankenstein device in one number. */
  energyCap: number
  /** One line the Studio can show, and the art-director prompt can be given. */
  brief: string
}

/**
 * The six registers.
 *
 * These are not moods invented at a whiteboard — they are the families our own
 * eight shipped templates already fall into, which is the check that they cover
 * real design rather than a taxonomy: quiet=Aperture, classic=Editorial+Atelier,
 * contemporary=Carma+Pulse, bold=Beacon, warm=Terra, severe=Noir.
 */
export const REGISTER_RULES: Record<Register, Allow> = {
  quiet: {
    brief: 'Restraint as the statement. Nothing raises its voice; the white space does the work.',
    scheme: ['monochrome', 'analogous'],
    ground: ['paper', 'tinted'],
    saturation: ['muted', 'natural'],
    headingCats: ['sans', 'geometric', 'grotesk', 'serif'],
    bodyCats: ['sans', 'geometric', 'serif'],
    headingCase: ['sentence', 'title'],
    figures: ['lining', 'oldstyle'],
    scale: [1.125, 1.2, 1.25, 1.333],
    density: ['comfortable', 'generous', 'vast'],
    rhythm: ['standard', 'minimal', 'editorial'],
    dropCap: ['none'],
    quoteMark: ['none', 'rule'],
    grain: [0],
    divider: ['none', 'rule'],
    corner: ['square', 'soft'],
    entrance: ['none', 'fade'],
    hover: ['none', 'lift'],
    transition: ['none', 'crossfade'],
    treatment: ['none', 'grayscale'],
    energyCap: 2,
  },
  classic: {
    brief: 'Print heritage. A serif that has read a book, hairline rules, a centred masthead.',
    scheme: ['monochrome', 'analogous', 'complementary', 'split'],
    ground: ['paper', 'tinted'],
    saturation: ['muted', 'natural'],
    headingCats: ['serif', 'display-serif', 'slab'],
    bodyCats: ['sans', 'serif', 'geometric'],
    headingCase: ['sentence', 'title'],
    figures: ['lining', 'oldstyle'],
    scale: [1.25, 1.333, 1.414, 1.5, 1.618],
    density: ['comfortable', 'generous', 'vast'],
    rhythm: ['editorial', 'standard', 'minimal', 'gridxl', 'overlay', 'magazine'],
    dropCap: ['none', 'raised', 'sunken'],
    quoteMark: ['none', 'rule', 'oversize'],
    grain: [0, 1],
    divider: ['none', 'rule', 'mark'],
    corner: ['square', 'soft'],
    entrance: ['none', 'fade', 'rise'],
    hover: ['none', 'lift', 'zoom'],
    transition: ['none', 'crossfade', 'shared-image'],
    treatment: ['none', 'grayscale', 'warm'],
    // 5, not 4, and the reason is in our own back catalogue: `classic` has to hold
    // both a restrained Editorial (3 loud decisions) and an Atelier that spends its
    // whole budget on one enormous Cormorant (5). A cap that excluded Atelier would
    // be a cap that excluded a design we already shipped and are proud of.
    energyCap: 5,
  },
  contemporary: {
    brief: 'Modern product publishing. Clean grotesks, tight grids, colour used as a signal.',
    scheme: ['monochrome', 'analogous', 'complementary', 'split', 'triad'],
    ground: ['paper', 'tinted', 'ink'],
    saturation: ['natural', 'vivid'],
    headingCats: ['sans', 'geometric', 'grotesk', 'slab'],
    bodyCats: ['sans', 'geometric', 'grotesk'],
    headingCase: ['sentence', 'title', 'upper'],
    figures: ['lining'],
    scale: [1.125, 1.2, 1.25, 1.333, 1.414, 1.5],
    density: ['compact', 'comfortable', 'generous'],
    rhythm: ['standard', 'magazine', 'minimal', 'gridxl', 'overlay', 'compact', 'editorial'],
    dropCap: ['none'],
    quoteMark: ['none', 'rule'],
    grain: [0, 1],
    divider: ['none', 'rule', 'gradient'],
    corner: ['square', 'soft', 'pill'],
    entrance: ['none', 'fade', 'rise'],
    hover: ['none', 'lift', 'zoom', 'tint'],
    transition: ['none', 'crossfade', 'shared-image'],
    treatment: ['none', 'grayscale', 'duotone'],
    energyCap: 4,
  },
  bold: {
    brief: 'Loud on purpose. Heavy type, a colour that commits, a feed with a clear lead.',
    scheme: ['monochrome', 'analogous', 'complementary', 'split', 'duotone', 'triad'],
    ground: ['paper', 'ink', 'tinted'],
    saturation: ['natural', 'vivid'],
    headingCats: ['grotesk', 'sans', 'geometric', 'display-serif', 'slab'],
    bodyCats: ['sans', 'geometric', 'grotesk'],
    headingCase: ['sentence', 'title', 'upper'],
    figures: ['lining'],
    scale: [1.333, 1.414, 1.5, 1.618],
    density: ['compact', 'comfortable'],
    rhythm: ['magazine', 'gridxl', 'overlay', 'standard', 'compact', 'editorial', 'minimal'],
    dropCap: ['none', 'raised'],
    quoteMark: ['none', 'oversize', 'rule'],
    grain: [0, 1, 2],
    divider: ['none', 'rule', 'mark', 'gradient'],
    corner: ['square', 'soft', 'pill', 'cut'],
    entrance: ['none', 'fade', 'rise', 'mask', 'stagger'],
    hover: ['none', 'lift', 'zoom', 'tint', 'shift'],
    transition: ['none', 'crossfade', 'shared-image'],
    treatment: ['none', 'grayscale', 'duotone', 'warm', 'grain'],
    energyCap: 6,
  },
  warm: {
    brief: 'Humanist and unhurried. Paper that has a temperature, a serif you would trust.',
    scheme: ['monochrome', 'analogous', 'split'],
    ground: ['paper', 'tinted'],
    saturation: ['muted', 'natural'],
    headingCats: ['serif', 'display-serif', 'slab', 'sans'],
    bodyCats: ['sans', 'serif', 'geometric'],
    headingCase: ['sentence', 'title'],
    figures: ['lining', 'oldstyle'],
    scale: [1.25, 1.333, 1.414, 1.5],
    density: ['comfortable', 'generous', 'vast'],
    rhythm: ['standard', 'editorial', 'gridxl', 'magazine', 'minimal'],
    dropCap: ['none', 'raised'],
    quoteMark: ['none', 'rule', 'oversize'],
    grain: [0, 1],
    divider: ['none', 'rule', 'mark'],
    corner: ['soft', 'pill'],
    entrance: ['none', 'fade', 'rise'],
    hover: ['none', 'lift', 'zoom'],
    transition: ['none', 'crossfade'],
    treatment: ['none', 'warm', 'grain'],
    energyCap: 4,
  },
  severe: {
    brief: 'Ink, edges and no decoration. Everything earns its place or leaves.',
    scheme: ['monochrome', 'complementary', 'duotone'],
    ground: ['ink', 'paper'],
    saturation: ['muted', 'natural', 'vivid'],
    headingCats: ['grotesk', 'sans', 'mono', 'geometric'],
    bodyCats: ['sans', 'grotesk', 'mono'],
    headingCase: ['sentence', 'upper'],
    figures: ['lining'],
    scale: [1.2, 1.25, 1.333, 1.414, 1.5],
    density: ['compact', 'comfortable'],
    rhythm: ['standard', 'compact', 'magazine', 'overlay', 'minimal'],
    dropCap: ['none'],
    quoteMark: ['none', 'rule'],
    grain: [0, 1],
    divider: ['none', 'rule'],
    corner: ['square', 'soft'],
    entrance: ['none', 'fade', 'rise'],
    hover: ['none', 'lift', 'shift'],
    transition: ['none', 'crossfade'],
    treatment: ['none', 'grayscale', 'duotone'],
    energyCap: 5,
  },
}

// ─── The energy model ────────────────────────────────────────────────────────
//
// Loudness, 0..2 per decision. The numbers are judgements, not measurements, and
// they are written down here precisely so they can be argued with in one place
// instead of being implicit in a thousand prompt tokens.

const E_SCHEME: Record<Genome['palette']['scheme'], number> =
  { monochrome: 0, analogous: 0, complementary: 1, split: 1, duotone: 2, triad: 2 }
const E_SATURATION: Record<Genome['palette']['saturation'], number> = { muted: 0, natural: 0, vivid: 1 }
const E_GROUND: Record<Genome['palette']['ground'], number> = { paper: 0, tinted: 1, ink: 1 }
const E_CASE: Record<Genome['type']['headingCase'], number> = { sentence: 0, title: 0, upper: 1 }
// DENSITY COSTS NOTHING, and getting this wrong cost a gate run to discover.
//
// The first version priced `compact` at 1 and `vast` at 2, on the theory that both
// are strong choices. They are — but loudness and density are different things, and
// pricing them together made the shedder collapse every over-budget design onto
// `comfortable`. The distinctiveness check caught it immediately: 47% of a
// 100-genome corpus landed on one density value.
//
// The energy budget measures DECORATION AND CONTRAST — how many things are shouting.
// Airy and dense are not louder or quieter than each other, they are different. What
// keeps density in line is the register's allow-list, which is the right instrument
// for a structural choice.
const E_DENSITY: Record<Density, number> = { compact: 0, comfortable: 0, generous: 0, vast: 0 }
const E_RHYTHM: Record<Genome['feed']['rhythm'], number> =
  { standard: 0, editorial: 0, magazine: 0, minimal: 0, compact: 0, gridxl: 1, overlay: 1 }
const E_DROPCAP: Record<Genome['ornament']['dropCap'], number> = { none: 0, raised: 1, sunken: 1 }
const E_QUOTE: Record<Genome['ornament']['quoteMark'], number> = { none: 0, rule: 0, oversize: 2 }
const E_DIVIDER: Record<Genome['ornament']['divider'], number> = { none: 0, rule: 0, mark: 1, gradient: 1 }
const E_CORNER: Record<Genome['ornament']['corner'], number> = { square: 0, soft: 0, pill: 1, cut: 1 }
const E_ENTRANCE: Record<Genome['motion']['entrance'], number> = { none: 0, fade: 0, rise: 1, mask: 2, stagger: 2 }
const E_HOVER: Record<Genome['motion']['hover'], number> = { none: 0, lift: 0, zoom: 1, tint: 1, shift: 1 }
const E_TREATMENT: Record<Genome['imagery']['treatment'], number> =
  { none: 0, grayscale: 1, warm: 1, grain: 1, duotone: 2 }

function scaleEnergy(s: Scale): number {
  return s >= 1.618 ? 2 : s >= 1.414 ? 1 : 0
}

export function energyOf(g: Genome): number {
  return (
    E_SCHEME[g.palette.scheme] + E_SATURATION[g.palette.saturation] + E_GROUND[g.palette.ground]
    + font(g.type.heading).energy + E_CASE[g.type.headingCase] + scaleEnergy(g.type.scale)
    + E_DENSITY[g.space.density]
    + E_RHYTHM[g.feed.rhythm] + (g.feed.numbering ? 1 : 0)
    + E_DROPCAP[g.ornament.dropCap] + E_QUOTE[g.ornament.quoteMark] + g.ornament.grain
    + E_DIVIDER[g.ornament.divider] + E_CORNER[g.ornament.corner]
    + E_ENTRANCE[g.motion.entrance] + E_HOVER[g.motion.hover] + g.motion.intensity
    + E_TREATMENT[g.imagery.treatment]
  )
}

/**
 * The shedding order when a design is over budget.
 *
 * PUBLISHED AND FIXED, because a budget that sheds unpredictably is worse than no
 * budget: nobody can reason about what they will get. It runs cheapest-signal
 * first — texture before decoration before motion before the structural decisions
 * that carry the brand.
 */
function quietestFont(cats: readonly FontCategory[]): FontId | null {
  let best: FontId | null = null
  for (const id of FONT_IDS) {
    if (!cats.includes(font(id).category)) continue
    if (best === null || font(id).energy < font(best).energy) best = id
  }
  return best
}

/** Register-aware shed steps, appended after the universal ones below. */
function structuralShed(A: Allow): { label: string; apply: (g: Genome) => Genome | null }[] {
  return [
    {
      label: 'palette.ground',
      apply: g => (E_GROUND[g.palette.ground] > 0 && A.ground.includes('paper')
        ? { ...g, palette: { ...g.palette, ground: 'paper' } } : null),
    },
    {
      label: 'feed.rhythm',
      apply: g => {
        if (E_RHYTHM[g.feed.rhythm] === 0) return null
        const calm = A.rhythm.find(r => E_RHYTHM[r] === 0)
        return calm ? { ...g, feed: { ...g.feed, rhythm: calm } } : null
      },
    },
    {
      // LAST RESORT, and the most consequential: the typeface is usually the single
      // loudest decision in a design, so a budget that could never touch it would be
      // a budget that never bound. Swapping to the quietest face the register allows
      // is a real change and it is reported as one.
      label: 'type.heading',
      apply: g => {
        if (font(g.type.heading).energy === 0) return null
        const quiet = quietestFont(A.headingCats)
        return quiet && quiet !== g.type.heading ? { ...g, type: { ...g.type, heading: quiet } } : null
      },
    },
  ]
}

const SHED: { label: string; apply: (g: Genome) => Genome | null }[] = [
  { label: 'imagery.grain', apply: g => (g.ornament.grain > 0 ? { ...g, ornament: { ...g.ornament, grain: 0 } } : null) },
  { label: 'imagery.treatment', apply: g => (g.imagery.treatment !== 'none' ? { ...g, imagery: { ...g.imagery, treatment: 'none' } } : null) },
  { label: 'motion.intensity', apply: g => (g.motion.intensity > 0 ? { ...g, motion: { ...g.motion, intensity: 0 } } : null) },
  { label: 'motion.entrance', apply: g => (E_ENTRANCE[g.motion.entrance] > 0 ? { ...g, motion: { ...g.motion, entrance: 'fade' } } : null) },
  { label: 'motion.hover', apply: g => (E_HOVER[g.motion.hover] > 0 ? { ...g, motion: { ...g.motion, hover: 'lift' } } : null) },
  { label: 'ornament.quoteMark', apply: g => (E_QUOTE[g.ornament.quoteMark] > 0 ? { ...g, ornament: { ...g.ornament, quoteMark: 'rule' } } : null) },
  { label: 'ornament.dropCap', apply: g => (E_DROPCAP[g.ornament.dropCap] > 0 ? { ...g, ornament: { ...g.ornament, dropCap: 'none' } } : null) },
  { label: 'ornament.divider', apply: g => (E_DIVIDER[g.ornament.divider] > 0 ? { ...g, ornament: { ...g.ornament, divider: 'rule' } } : null) },
  { label: 'ornament.corner', apply: g => (E_CORNER[g.ornament.corner] > 0 ? { ...g, ornament: { ...g.ornament, corner: 'soft' } } : null) },
  { label: 'feed.numbering', apply: g => (g.feed.numbering ? { ...g, feed: { ...g.feed, numbering: false } } : null) },
  { label: 'palette.saturation', apply: g => (g.palette.saturation === 'vivid' ? { ...g, palette: { ...g.palette, saturation: 'natural' } } : null) },
  { label: 'palette.scheme', apply: g => (E_SCHEME[g.palette.scheme] > 1 ? { ...g, palette: { ...g.palette, scheme: 'complementary' } } : null) },
  { label: 'type.scale', apply: g => (scaleEnergy(g.type.scale) > 0 ? { ...g, type: { ...g.type, scale: 1.333 } } : null) },
]

// ─── Nearest-allowed repair ──────────────────────────────────────────────────

/** Ordered axes repair to the nearest legal neighbour; unordered ones to the
 *  register's canonical (first-listed) value, which is why the lists above are
 *  written most-typical-first rather than alphabetically. */
function nearest<T>(value: T, allowed: readonly T[], ordered?: readonly T[]): T {
  if (allowed.includes(value)) return value
  if (ordered) {
    const i = ordered.indexOf(value)
    if (i >= 0) {
      let best = allowed[0], bestD = Infinity
      for (const a of allowed) {
        const d = Math.abs(ordered.indexOf(a) - i)
        if (d < bestD) { bestD = d; best = a }
      }
      return best
    }
  }
  return allowed[0]
}

// ─── The pass ────────────────────────────────────────────────────────────────

export function applyCohesion(input: Genome): { genome: Genome; repairs: Repair[] } {
  const repairs: Repair[] = []
  const note = (rule: string, why: string) => repairs.push({ rule, why })
  const A = REGISTER_RULES[input.register]
  let g: Genome = structuredClone(input)

  // ── 1. Register allow-lists ────────────────────────────────────────────────
  const fix = <T,>(path: string, value: T, allowed: readonly T[], ordered?: readonly T[]): T => {
    const next = nearest(value, allowed, ordered)
    if (next !== value) note(`register:${path}`, `${String(value)} is not in the ${input.register} register — moved to ${String(next)}`)
    return next
  }

  g.palette.scheme = fix('palette.scheme', g.palette.scheme, A.scheme)
  g.palette.ground = fix('palette.ground', g.palette.ground, A.ground)
  g.palette.saturation = fix('palette.saturation', g.palette.saturation, A.saturation)
  g.type.headingCase = fix('type.headingCase', g.type.headingCase, A.headingCase)
  g.type.figures = fix('type.figures', g.type.figures, A.figures)
  g.type.scale = fix('type.scale', g.type.scale, A.scale, SCALES)
  g.space.density = fix('space.density', g.space.density, A.density, DENSITIES)
  g.feed.rhythm = fix('feed.rhythm', g.feed.rhythm, A.rhythm)
  g.ornament.dropCap = fix('ornament.dropCap', g.ornament.dropCap, A.dropCap)
  g.ornament.quoteMark = fix('ornament.quoteMark', g.ornament.quoteMark, A.quoteMark)
  g.ornament.grain = fix('ornament.grain', g.ornament.grain, A.grain)
  g.ornament.divider = fix('ornament.divider', g.ornament.divider, A.divider)
  g.ornament.corner = fix('ornament.corner', g.ornament.corner, A.corner)
  g.motion.entrance = fix('motion.entrance', g.motion.entrance, A.entrance)
  g.motion.hover = fix('motion.hover', g.motion.hover, A.hover)
  g.motion.transition = fix('motion.transition', g.motion.transition, A.transition)
  g.imagery.treatment = fix('imagery.treatment', g.imagery.treatment, A.treatment)

  // Typeface category is where a register is most often violated, because a font
  // id looks innocent until you know what it is.
  const hCat = font(g.type.heading).category
  if (!A.headingCats.includes(hCat)) {
    note('register:type.heading', `a ${hCat} heading does not belong to the ${input.register} register`)
  }
  const bCat = font(g.type.body).category
  if (!A.bodyCats.includes(bCat)) {
    note('register:type.body', `a ${bCat} body face does not belong to the ${input.register} register`)
  }

  // ── 2. Pairwise rules — each one has a reason, not a preference ────────────

  // Two display gestures competing for the same first line. Print settles this the
  // same way: you get the drop cap or you get the quote, never both.
  if (g.ornament.dropCap !== 'none' && g.ornament.quoteMark === 'oversize') {
    g.ornament.quoteMark = 'rule'
    note('pair:ornament-collision', 'a drop cap and an oversize quote mark fight over the same column')
  }

  // Oldstyle figures on a face that has none is a declaration the browser ignores;
  // it reads as a bug in the type, not a choice.
  if (g.type.figures === 'oldstyle' && !font(g.type.body).oldstyle) {
    g.type.figures = 'lining'
    note('pair:oldstyle-unsupported', `${font(g.type.body).family} has no oldstyle figures`)
  }

  // Same for optical sizing: no axis, no effect, and a misleading genome.
  if (g.type.opticalSizing && !font(g.type.heading).opsz) {
    g.type.opticalSizing = false
    note('pair:opsz-unsupported', `${font(g.type.heading).family} has no optical-size axis`)
  }

  // A high-contrast display serif needs air to survive: hairlines disappear at
  // small sizes in a tight grid, and the result reads as broken rendering.
  if (font(g.type.heading).contrast === 'high' && g.space.density === 'compact') {
    g.space.density = 'comfortable'
    note('pair:display-serif-needs-air', `${font(g.type.heading).family} is high-contrast and cannot carry a compact grid`)
  }

  // Monospace is a texture, not a body face. Past ~62ch it stops being readable.
  if (font(g.type.body).category === 'mono' && g.type.measure > 62) {
    g.type.measure = 62
    note('pair:mono-measure', 'a monospaced body face is unreadable past 62ch')
  }

  // Uppercase without letterspacing is the most recognisable amateur tell in
  // typography. If a design commits to caps, it pays for the tracking.
  if (g.type.headingCase === 'upper' && g.type.headingTracking === 'tight') {
    g.type.headingTracking = 'normal'
    note('pair:upper-needs-tracking', 'uppercase set tight is the classic untrained-eye signature')
  }

  // Grain over ink bands badly on 8-bit gradients.
  if (g.ornament.grain === 2 && g.palette.ground === 'ink') {
    g.ornament.grain = 1
    note('pair:grain-on-ink', 'heavy grain bands visibly over a dark ground')
  }

  // Four columns inside vast spacing is two decisions cancelling each other out.
  if (g.space.density === 'vast' && g.feed.columns === '4') {
    g.feed.columns = '3'
    note('pair:vast-four-up', 'vast spacing and a four-up grid are the same decision made twice, in opposite directions')
  }

  // A two-hue scheme whose hues are neighbours is a one-hue scheme with extra steps.
  if (['duotone', 'split', 'triad', 'complementary'].includes(g.palette.scheme)) {
    const h = g.palette.seed.h
    const ch = g.palette.counterHue
    const delta = ch === undefined ? 999 : Math.abs(((ch - h + 540) % 360) - 180)
    if (ch !== undefined && delta > 160) {
      g.palette.counterHue = counterHueFor(g.palette.scheme, h)
      note('pair:degenerate-counterhue', 'the second hue was too close to the first to read as a second hue')
    }
  }

  // Measure is a hard readability range, not a taste axis.
  const m = Math.round(Math.max(58, Math.min(78, g.type.measure)))
  if (m !== g.type.measure) {
    note('pair:measure-range', `measure clamped to ${m}ch — outside 58–78 is a readability defect`)
    g.type.measure = m
  }

  // ── 3. The energy budget ───────────────────────────────────────────────────
  let energy = energyOf(g)
  if (energy > A.energyCap) {
    const before = energy
    const taken: string[] = []
    for (const step of [...SHED, ...structuralShed(A)]) {
      if (energy <= A.energyCap) break
      const next = step.apply(g)
      if (!next) continue
      g = next
      taken.push(step.label)
      energy = energyOf(g)
    }
    note(
      'energy:over-budget',
      `${before} loud decisions against a cap of ${A.energyCap} for ${input.register}; shed ${taken.join(', ')} (now ${energy})`,
    )
  }

  return { genome: g, repairs }
}
