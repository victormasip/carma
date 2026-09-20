// W3 — THE DETERMINISTIC ART DIRECTOR.
//
// Evidence in, three genomes out, with NO LANGUAGE MODEL ANYWHERE.
//
// WHY THIS IS RUNG 3 AND NOT AN AFTERTHOUGHT
// ──────────────────────────────────────────
// The plan's art-director ladder (§7.1) degrades: a directed genome falls to a
// validated one, a validated one falls to a DERIVED one, and a derived one falls
// to a preset. This file is that third rung, and it is the one that has to be good,
// because it is what runs when the API key is missing, when the provider is down,
// when the request times out, when the customer is on the free tier, and in every
// single test. A fallback nobody would ship on its own is not a fallback, it is a
// crash with better manners.
//
// So the standard here is not "adequate until the model arrives". It is: a design
// this engine produces on its own should be one we are happy to put in front of a
// customer. W4's model has to BEAT this, and having something real to beat is the
// only way we will ever know whether the model is earning its cost.
//
// THE THREE VARIANTS ARE NOT THREE PROMPTS. They are one derivation run at three
// AMPLITUDES, which is why they can be guaranteed distinct rather than hoped to be:
//
//   FIDEL       their colours pinned, their typeface (or its nearest sibling),
//               their density, their feed. The blog their own designer would have
//               made. Chrome: keep.
//   ELEVAT      their brand hue, OUR neutrals. Same typeface CATEGORY, better face.
//               One structural upgrade (a wide lane), restrained motion.
//               Chrome: harmonise.
//   REIMAGINAT  their hue as a seed and nothing else pinned. A different register,
//               a different rhythm, ornament on. Chrome: rebuild.
//
// Every decision records WHERE IT CAME FROM (`DerivationStep`). That trace is not
// decoration: it is how a reveal explains itself to an owner ("we kept your green
// because it paints your logo and your booking button"), how the eval attributes a
// bad design to a bad rule, and how the W4 model gets told what the deterministic
// path already concluded.

import {
  SCALES, type ChromePolicy, type Genome, type Oklch, type PaletteRole,
  type Register, type Scale,
} from '@/lib/design/genome'
import { FONT_IDS, font, type FontCategory, type FontId } from '@/lib/design/fonts'
import { hexToOklch } from '@/lib/design/color'
import { parseColor } from '@/lib/scrape/chromeContrast'
import { REGISTER_RULES, applyCohesion } from '@/lib/design/cohesion'
import { completeGenome, pickAvoiding, rngFrom, seedFrom, type RecentUse } from '@/lib/design/sample'
import { registerVariants, type DesignEvidence, type TypeRead } from '@/lib/design/evidence'
import type { FeedLayout } from '@/lib/scrape/tokens'

export const DIRECTOR_VERSION = 'deterministic-1.0.0'

export type VariantName = 'faithful' | 'elevated' | 'reimagined'

export type DerivationStep = {
  axis: string
  value: string
  /** The evidence this came from — a measurement, never a preference. */
  from: string
  /** The named rule that turned that evidence into this value. */
  rule: string
}

export type Direction = {
  variant: VariantName
  register: Register
  genome: Genome
  chrome: ChromePolicy
  trace: DerivationStep[]
  /** What cohesion changed after the derivation. Should normally be empty. */
  repairs: { rule: string; why: string }[]
}

export type Directed = {
  faithful: Direction
  elevated: Direction
  reimagined: Direction
  /** Wall-clock for the whole derivation, in milliseconds. */
  ms: number
  /** True when the derivation threw and the preset floor caught it. */
  degraded: boolean
}

/** 0 = keep it theirs, 1 = lift it, 2 = rethink it. One knob, three designs. */
const AMP: Record<VariantName, 0 | 1 | 2> = { faithful: 0, elevated: 1, reimagined: 2 }

// ─── Typeface selection ──────────────────────────────────────────────────────

/**
 * The catalogue face closest to what the site is already using.
 *
 * Preference order is the point: the EXACT face if we host it, then a face of the
 * same category AND stroke contrast (a reader would struggle to tell them apart),
 * then the same category, then anything the register allows. `avoid` lets the
 * elevated variant ask for "the same kind of face, but not the one they had".
 */
function nearestFace(
  read: TypeRead,
  allowed: readonly FontCategory[],
  rng: () => number,
  opts: { avoid?: readonly FontId[]; ignoreExact?: boolean; recent?: readonly string[] } = {},
): { id: FontId; why: string } {
  const avoid = new Set(opts.avoid ?? [])
  const pool = FONT_IDS.filter(id => allowed.includes(font(id).category) && !avoid.has(id))
  const fallback = pool[0] ?? FONT_IDS[0]

  if (!opts.ignoreExact && read.catalogueId && pool.includes(read.catalogueId as FontId)) {
    return { id: read.catalogueId as FontId, why: `we host ${read.family} itself` }
  }
  // THE RNG IS NOT OPTIONAL, and the first corpus run is why. Taking `[0]` from the
  // matching set is deterministic, defensible, and made Inter the heading face of
  // 29% of all generated designs — the house face this whole plan exists to avoid.
  // The draw is still fully deterministic: the seed is the site's own.
  //
  // It draws through `pickAvoiding` rather than raw rng so the recency window
  // reaches THE DIRECTOR'S OWN CHOICES too. The second corpus run found this gap:
  // `sample.ts` had anti-repetition, `completeGenome` used it, and the director
  // quietly bypassed it for the one axis a reader notices first.
  const pick = (xs: FontId[]) => pickAvoiding(rng, xs, opts.recent ?? [])
  // A cell with one face in it is not a choice, it is a lookup — and no amount of
  // anti-repetition can vary a lookup. So an exact category+contrast match is only
  // honoured when there is something to choose BETWEEN; below that the search widens
  // to the whole category, which is a smaller compromise than a monoculture.
  const sameBoth = pool.filter(id => font(id).category === read.category && font(id).contrast === read.contrast)
  if (sameBoth.length >= 2) {
    const id = pick(sameBoth)
    return { id, why: `${font(id).family} is the same ${read.category} at the same stroke contrast as ${read.family}` }
  }
  const sameCat = pool.filter(id => font(id).category === read.category)
  if (sameCat.length) {
    const id = pick(sameCat)
    return { id, why: `${font(id).family} is the nearest ${read.category} we host to ${read.family}` }
  }
  // No face of their category belongs to this register — which is not a gap in the
  // catalogue, it is the variant DOING ITS JOB. A geometric sans site offered a
  // `classic` alternative is being shown what it would look like with a serif, on
  // purpose.
  const id = pool.length ? pick(pool) : fallback
  return {
    id,
    why: `a ${read.category} has no place in the ${allowed.join('/')} of this register — ${font(id).family} is what it becomes here`,
  }
}

// ─── Scale from the source's own headings ────────────────────────────────────

function scaleFromSizes(sizes: Record<string, number>): { scale: Scale; why: string } | null {
  const ramp = ['h1', 'h2', 'h3', 'h4'].map(t => sizes[t]).filter((n): n is number => typeof n === 'number')
  if (ramp.length < 3) return null
  const ratios: number[] = []
  for (let i = 1; i < ramp.length; i++) if (ramp[i] > 0 && ramp[i - 1] > ramp[i]) ratios.push(ramp[i - 1] / ramp[i])
  if (!ratios.length) return null
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
  let best: Scale = SCALES[0]
  for (const s of SCALES) if (Math.abs(s - mean) < Math.abs(best - mean)) best = s
  return { scale: best, why: `their heading ramp steps by ${mean.toFixed(2)}× on average` }
}

// ─── Feed rhythm from the card they already have ─────────────────────────────

function rhythmFromCard(ev: DesignEvidence): { rhythm: FeedLayout; why: string } | null {
  const card = ev.feed?.card
  if (!card) return null
  const cols = card.columns ?? 0
  const framed = Boolean(card.border || card.shadow || card.background)
  const radius = parseFloat(card.radius ?? '0') || 0
  if (cols >= 4) return { rhythm: 'compact', why: 'their blog already runs four cards per row' }
  if (cols === 1) return { rhythm: 'editorial', why: 'their blog is a single column of rows' }
  if (cols === 2) return { rhythm: 'gridxl', why: `two cards per row with a ${radius}px corner` }
  if (cols === 3) return { rhythm: framed ? 'magazine' : 'minimal', why: `three cards per row, ${framed ? 'framed' : 'frameless'}` }
  return null
}

// ─── Colour ──────────────────────────────────────────────────────────────────

function seedFromEvidence(ev: DesignEvidence): { seed: Oklch; why: string } {
  const brand = ev.palette.brand
  if (brand) {
    const o = hexToOklch(brand)
    if (o) return { seed: o, why: `${brand} — ${ev.palette.ranked[0]?.why ?? 'the most prominent colour on the page'}` }
  }
  const accent = hexToOklch(ev.tokens.colorAccent)
  if (accent) return { seed: accent, why: `no colour carried weight; fell back to the extracted accent ${ev.tokens.colorAccent}` }
  // A site we could read nothing from still gets a real design — a mid-chroma blue
  // is the honest "we have no information" answer, not a failure.
  return { seed: { l: 0.55, c: 0.13, h: 250 }, why: 'no readable colour anywhere; used the neutral default seed' }
}

/**
 * Which colours are PINNED, per amplitude. This is the clearest expression of what
 * the three variants actually mean, and it is three lines:
 *
 *   faithful    their whole palette, verbatim. It is their site.
 *   elevated    their brand colour only. We regenerate every neutral around it, so
 *               the greys stop being whatever their theme shipped and start being a
 *               ramp that holds contrast by construction.
 *   reimagined  nothing. The hue survives as a seed; everything else is ours.
 */
function pinsFor(ev: DesignEvidence, amp: 0 | 1 | 2): {
  pins: Partial<Record<PaletteRole, string>> | undefined
  why: string
} {
  const t = ev.tokens
  // THE ACCENT COMES FROM PROMINENCE, NOT FROM THE TOKEN EXTRACTOR.
  //
  // Found by reading a real trace: New Look's blog was compiling with
  // `accent: #ffffff`, because `extractTokens` had resolved a white CSS variable
  // while `rankBrandColors` had correctly identified the olive `#8a7046` that paints
  // their logo and their booking button. The seed used the good answer and the pin
  // used the bad one, so W2's entire colour improvement stopped at the edge of the
  // genome. They agree now, and prominence wins.
  const brandAccent = ev.palette.brand ?? t.colorAccent
  // A PIN MUST BE A COLOUR WE CAN READ. `rgba( 0, 0, 0, .7 )` and
  // `hsl(0deg 0% calc(1*1%)/90%)` are perfectly good CSS that our parser declines,
  // and pinning one produces a genome the validator rejects — 14 of 297 on the first
  // corpus run. Unreadable is not the same as absent: we simply cannot claim to
  // reproduce a value we never resolved, so the engine derives that role instead.
  const readable = (v: string | undefined | null): string | undefined =>
    (typeof v === 'string' && parseColor(v) ? v : undefined)
  const put = (into: Partial<Record<PaletteRole, string>>, role: PaletteRole, v: string | undefined | null) => {
    const c = readable(v)
    if (c) into[role] = c
  }

  if (amp === 0) {
    const pins: Partial<Record<PaletteRole, string>> = {}
    put(pins, 'primary', t.colorPrimary); put(pins, 'accent', brandAccent)
    put(pins, 'bg', t.colorBg); put(pins, 'surface', t.colorSurface)
    put(pins, 'text', t.colorText); put(pins, 'muted', t.colorMuted)
    put(pins, 'border', t.colorBorder); put(pins, 'link', t.linkColor)
    const missed = 8 - Object.keys(pins).length
    return {
      pins: Object.keys(pins).length ? pins : undefined,
      why: missed === 0
        ? 'their palette, verbatim — contrast still enforced on every text pair'
        : `their palette, verbatim, minus ${missed} role${missed === 1 ? '' : 's'} whose colour we could not resolve`,
    }
  }
  if (amp === 1) {
    const accent = readable(brandAccent)
    return accent
      ? { pins: { accent }, why: 'their brand colour kept; every neutral regenerated around it' }
      : { pins: undefined, why: 'their accent was unreadable; the seed hue carries the brand instead' }
  }
  return { pins: undefined, why: 'nothing pinned — the hue survives as a seed, the system supplies the rest' }
}

/**
 * REIMAGINAT INVERTS THE GROUND. Founder call, and the measurement behind it is
 * blunt: Fidel and Elevat both derive the ground from the customer's own
 * background, and customers' backgrounds are light, so 87% of everything the engine
 * produced was paper. Two thirds of that is correct — a faithful variant of a light
 * site should be light. The third that is not is Reimaginat, whose entire job is to
 * show them something they would not have asked for.
 *
 * So at amplitude 2 the ground flips: light sources explore ink, dark sources
 * explore paper. It is still constrained by the register's allow-list — a
 * reimagining cohesion has to repair is not a reimagining, it is a mistake — and
 * where a register carries no ink at all, a brand-tinted ground is the furthest it
 * can travel from plain paper.
 */
function chooseGround(
  allowed: readonly Genome['palette']['ground'][],
  ctx: { sourceIsDark: boolean; bgC: number; amp: 0 | 1 | 2 },
): { ground: Genome['palette']['ground']; why: string; rule: string } {
  const has = (g: Genome['palette']['ground']) => allowed.includes(g)

  if (ctx.amp === 2) {
    const want: Genome['palette']['ground'] = ctx.sourceIsDark ? 'paper' : 'ink'
    if (has(want)) {
      return {
        ground: want,
        why: `inverted from their ${ctx.sourceIsDark ? 'dark' : 'light'} ground`,
        rule: 'reimagined inverts the ground',
      }
    }
    if (!ctx.sourceIsDark && has('tinted')) {
      return {
        ground: 'tinted',
        why: 'this register carries no ink, so a brand-tinted ground is the furthest it travels from plain paper',
        rule: 'reimagined inverts the ground (register has no ink)',
      }
    }
  }

  const derived: Genome['palette']['ground'] = ctx.sourceIsDark ? 'ink' : ctx.bgC > 0.012 ? 'tinted' : 'paper'
  if (has(derived)) {
    return { ground: derived, why: 'inherited from their own ground', rule: 'background lightness → ground' }
  }
  // The register wins over the inheritance. Never emit a ground cohesion would have
  // to repair — a repaired derivation is one that was not thought through.
  return {
    ground: allowed[0],
    why: `their ${derived} ground is not in this register`,
    rule: 'nearest in-register ground',
  }
}

// ─── The chrome rung ─────────────────────────────────────────────────────────

const RUNG_ORDER: ChromePolicy[] = ['keep', 'harmonise', 'rebuild', 'replace']

/**
 * The variant asks for a rung; the verdict sets a FLOOR.
 *
 * Fidel would like to keep the customer's header. When `sourceQuality` says
 * `start-fresh`, keeping it means bolting a pristine blog under markup we have just
 * scored 28/100 — the exact seam the founder called grotesque. So the rung is the
 * higher of what the variant wants and what the evidence will allow.
 */
function chromeRung(variant: VariantName, ev: DesignEvidence): { policy: ChromePolicy; why: string } {
  const wanted: ChromePolicy = variant === 'faithful' ? 'keep' : variant === 'elevated' ? 'harmonise' : 'rebuild'
  const floor: ChromePolicy = ev.sourceQuality.verdict === 'inherit' ? 'keep'
    : ev.sourceQuality.verdict === 'inherit-brand-only' ? 'harmonise' : 'rebuild'
  const policy = RUNG_ORDER[Math.max(RUNG_ORDER.indexOf(wanted), RUNG_ORDER.indexOf(floor))]
  return {
    policy,
    why: policy === wanted
      ? `${variant} asks for ${wanted}`
      : `${variant} asks for ${wanted}, but sourceQuality ${ev.sourceQuality.score}/100 (${ev.sourceQuality.verdict}) floors it at ${floor}`,
  }
}

// ─── One variant ─────────────────────────────────────────────────────────────

function deriveOne(
  ev: DesignEvidence,
  variant: VariantName,
  register: Register,
  seed: number,
  recent: RecentUse,
  avoidFaces: readonly FontId[] = [],
): Direction {
  const amp = AMP[variant]
  const A = REGISTER_RULES[register]
  const rng = rngFrom(seed)
  const trace: DerivationStep[] = []
  const step = (axis: string, value: unknown, from: string, rule: string) =>
    trace.push({ axis, value: String(value), from, rule })

  // ── Colour ────────────────────────────────────────────────────────────────
  const { seed: paletteSeed, why: seedWhy } = seedFromEvidence(ev)
  step('palette.seed', `oklch(${paletteSeed.l.toFixed(2)} ${paletteSeed.c.toFixed(3)} ${Math.round(paletteSeed.h)})`, seedWhy, 'seedFromEvidence')

  const hueCount = ev.palette.coherence.hues.length
  const scheme: Genome['palette']['scheme'] = hueCount >= 3 ? 'split' : hueCount === 2 ? 'analogous' : 'monochrome'
  step('palette.scheme', scheme, `${ev.palette.coherence.note}`, 'hue clusters → scheme')

  const bgL = hexToOklch(ev.tokens.colorBg)?.l ?? 1
  const bgC = hexToOklch(ev.tokens.colorBg)?.c ?? 0
  const sourceIsDark = bgL < 0.45
  const { ground, why: groundWhy, rule: groundRule } = chooseGround(A.ground, { sourceIsDark, bgC, amp })
  step('palette.ground', ground, `their background ${ev.tokens.colorBg} sits at L ${bgL.toFixed(2)} C ${bgC.toFixed(3)} — ${groundWhy}`, groundRule)

  const saturation: Genome['palette']['saturation'] = paletteSeed.c < 0.08 ? 'muted' : paletteSeed.c < 0.17 ? 'natural' : 'vivid'
  step('palette.saturation', saturation, `the brand colour carries ${paletteSeed.c.toFixed(3)} chroma`, 'seed chroma → saturation')

  const { pins, why: pinWhy } = pinsFor(ev, amp)
  step('palette.pins', pins ? Object.keys(pins).join(', ') : 'none', pinWhy, `amplitude ${amp}`)

  // ── Type ──────────────────────────────────────────────────────────────────
  const headCats = A.headingCats
  const bodyCats = A.bodyCats
  // Elevat must not land on the face Fidel already chose, or the two tabs differ by
  // nothing a reader would notice. Reimaginat ignores the source face entirely.
  const head = nearestFace(ev.type.heading, headCats, rng, {
    avoid: avoidFaces, ignoreExact: amp === 2, recent: recent['type.heading'],
  })
  step('type.heading', font(head.id).family, `they set headings in ${ev.type.heading.family} (${ev.type.heading.category}, ${ev.type.heading.contrast} contrast, via ${ev.type.heading.source})`, head.why)

  const body = nearestFace(ev.type.body, bodyCats, rng, {
    avoid: avoidFaces, ignoreExact: amp === 2, recent: recent['type.body'],
  })
  step('type.body', font(body.id).family, `they set body text in ${ev.type.body.family} (${ev.type.body.category})`, body.why)

  const measuredScale = scaleFromSizes(ev.type.scale.sizes)
  // A site whose own ramp is broken should not have that ramp copied: when the
  // scale-sanity score is poor, the measurement is evidence of a defect rather than
  // of an intention, and the register's own scale is the better answer.
  const scaleUsable = measuredScale && (ev.type.scale.score ?? 0) >= 55 && amp < 2
  const scale = scaleUsable ? measuredScale!.scale : undefined
  if (scale) step('type.scale', scale, measuredScale!.why, 'measured heading ramp → nearest scale step')
  else step('type.scale', 'sampled in-register', ev.type.scale.score === null ? 'their headings declare no judgeable ramp' : `their ramp scores ${ev.type.scale.score}/100 — not worth copying`, 'sampled from the register')

  const measure = ev.density.measureCh && ev.density.measureCh >= 50 && ev.density.measureCh <= 95
    ? Math.max(58, Math.min(78, ev.density.measureCh))
    : undefined
  if (measure) step('type.measure', `${measure}ch`, `their container implies ${ev.density.measureCh}ch of measure`, 'container ÷ font size, clamped to 58–78')

  const basePx = (() => {
    const m = /^([\d.]+)px$/.exec(ev.tokens.baseFontSize)
    const n = m ? parseFloat(m[1]) : NaN
    return Number.isFinite(n) && n >= 14 && n <= 21 ? Math.round(n) : undefined
  })()
  if (basePx) step('type.basePx', `${basePx}px`, `their body text is set at ${ev.tokens.baseFontSize}`, 'source base size, sanity-bounded')

  // ── Space ─────────────────────────────────────────────────────────────────
  // Density is COMPOSITION, not brand, so only Fidel inherits it. Letting Elevat
  // copy it too left the two tabs sharing ground, density and base size — 0.369
  // apart at the closest, which is two tabs a reader would call the same design.
  const density = ev.density.measured && amp === 0 ? ev.density.verdict : undefined
  if (density) step('space.density', density, `sections breathe at ${ev.density.structuralSpacingP75}px`, 'structural spacing p75 → density')
  else step('space.density', 'sampled in-register', ev.density.measured ? 'only Fidel inherits spatial rhythm' : 'too few structural spacings to judge', 'sampled from the register')

  // THE ONE STRUCTURAL UPGRADE PER STEP. Lanes are what stop an article being a
  // centred column, and they are also the safest thing to add: the prose keeps its
  // measure either way, only figures and quotes gain room.
  const lanes: Genome['space']['lanes'] = amp === 0 ? 'single' : amp === 1 ? 'content-wide' : 'content-wide-full'
  step('space.lanes', lanes, `amplitude ${amp}`, 'faithful keeps one column; elevated lets figures breathe; reimagined opens a full-bleed lane')

  const maxWidthPx = (() => {
    const m = /^([\d.]+)px$/.exec(ev.tokens.maxWidth)
    const n = m ? parseFloat(m[1]) : NaN
    return Number.isFinite(n) && n >= 900 && n <= 1600 && amp === 0 ? Math.round(n) : undefined
  })()
  if (maxWidthPx) step('space.maxWidthPx', `${maxWidthPx}px`, `their container is ${ev.tokens.maxWidth}`, 'source container width (faithful only)')

  // ── Feed ──────────────────────────────────────────────────────────────────
  const cardRhythm = amp === 0 ? rhythmFromCard(ev) : null
  if (cardRhythm) step('feed.rhythm', cardRhythm.rhythm, cardRhythm.why, 'their own card grid → nearest shipped rhythm')
  else step('feed.rhythm', 'sampled in-register', ev.feed?.card ? 'only Fidel copies a feed — composition is art direction' : 'no blog card pattern detected on their site', 'sampled from the register')

  const columns = ev.feed?.card?.columns && amp === 0
    ? (String(Math.min(4, Math.max(2, ev.feed.card.columns))) as '2' | '3' | '4')
    : undefined
  if (columns) step('feed.columns', columns, `their feed runs ${ev.feed!.card!.columns} across`, 'source column count')

  // ── Ornament ──────────────────────────────────────────────────────────────
  const radiusPx = (() => {
    const m = /^([\d.]+)px$/.exec(ev.tokens.radius)
    const n = m ? parseFloat(m[1]) : NaN
    return Number.isFinite(n) && n >= 0 && n <= 40 && amp === 0 ? Math.round(n) : undefined
  })()
  const corner: Genome['ornament']['corner'] | undefined =
    radiusPx === undefined ? undefined : radiusPx === 0 ? 'square' : radiusPx >= 20 ? 'pill' : 'soft'
  if (corner) step('ornament.corner', `${corner} (${radiusPx}px)`, `their corners are ${ev.tokens.radius}`, 'source radius → corner family')

  const underline: Genome['ornament']['underline'] = ev.tokens.linkUnderline === 'always' ? 'always-thin'
    : ev.tokens.linkUnderline === 'none' ? 'none'
      : amp === 0 ? 'hover' : 'hover-grow'
  step('ornament.underline', underline, `their links are underlined "${ev.tokens.linkUnderline ?? 'hover'}"`, amp === 0 ? 'source underline, verbatim' : 'source underline, animated')

  // Ornament amplitude. Held back hard at amp 0 so a faithful design adds NOTHING
  // its source did not have — that is the whole promise of the Fidel tab.
  const ornamentExtras = amp === 0
    ? { dropCap: 'none' as const, quoteMark: 'none' as const, grain: 0 as const, divider: 'rule' as const }
    : amp === 1
      ? { dropCap: 'none' as const, quoteMark: 'rule' as const, grain: 0 as const, divider: 'rule' as const }
      : undefined // reimagined samples its own, in-register
  step('ornament.extras', ornamentExtras ? 'held at source level' : 'sampled in-register', `amplitude ${amp}`, 'faithful adds no ornament the source did not have')

  // ── Motion ────────────────────────────────────────────────────────────────
  const motion = amp === 0
    ? { entrance: 'none' as const, hover: 'none' as const, transition: 'none' as const, intensity: 0 as const }
    : amp === 1
      ? { entrance: 'fade' as const, hover: 'lift' as const, transition: 'crossfade' as const, intensity: 1 as const }
      : undefined
  step('motion', motion ? `${motion.entrance}/${motion.hover}` : 'sampled in-register', `amplitude ${amp}`, 'zero JS at every amplitude — all scroll-driven CSS')

  // ── Imagery ───────────────────────────────────────────────────────────────
  // NEVER filter photographs of people. A duotone over a team photo is a stylistic
  // flourish applied to someone's face, and no business asked for it.
  const treatment: Genome['imagery']['treatment'] | undefined =
    ev.imagery.kind === 'people' || amp === 0 ? 'none' : undefined
  if (treatment) {
    step('imagery.treatment', 'none', ev.imagery.kind === 'people' ? 'their imagery is photographs of people' : `amplitude ${amp}`,
      ev.imagery.kind === 'people' ? 'never filter a face' : 'faithful leaves imagery alone')
  }

  // ── Chrome ────────────────────────────────────────────────────────────────
  const rung = chromeRung(variant, ev)
  step('chrome.policy', rung.policy, rung.why, 'variant intent, floored by sourceQuality')

  // ── Assemble ──────────────────────────────────────────────────────────────
  const partial = {
    register,
    seed,
    origin: { source: 'derived' as const, seed, variant },
    palette: {
      seed: paletteSeed, scheme, ground, saturation, contrast: 'AA' as const,
      ...(pins ? { pins } : {}),
    },
    type: {
      heading: head.id, body: body.id,
      ...(scale ? { scale } : {}),
      ...(measure ? { measure } : {}),
      ...(basePx ? { basePx } : {}),
      opticalSizing: Boolean(font(head.id).opsz),
    },
    space: {
      lanes,
      ...(density ? { density: density as Genome['space']['density'] } : {}),
      ...(maxWidthPx ? { maxWidthPx } : {}),
    },
    feed: {
      mode: 'grid' as const,
      ...(cardRhythm ? { rhythm: cardRhythm.rhythm } : {}),
      ...(columns ? { columns } : {}),
      lead: amp === 0 ? ('none' as const) : ('first' as const),
      numbering: false,
    },
    ornament: {
      underline,
      ...(corner ? { corner } : {}),
      ...(radiusPx !== undefined ? { radiusPx } : {}),
      ...(ornamentExtras ?? {}),
    },
    ...(motion ? { motion } : {}),
    imagery: { fit: 'cover' as const, ...(treatment ? { treatment } : {}) },
    chrome: {
      policy: rung.policy,
      header: (amp === 0 ? 'split' : amp === 1 ? 'masthead' : 'stack') as Genome['chrome']['header'],
      footer: (amp === 2 ? 'statement' : 'columns') as Genome['chrome']['footer'],
      sticky: amp < 2,
    },
    budget: { faces: 4, cssKb: 14, js: 0 as const },
    ...(ev.tokens.blockquoteStyle || ev.tokens.blockquoteBorderColor
      ? {
        prose: {
          ...(ev.tokens.blockquoteStyle ? { blockquoteStyle: ev.tokens.blockquoteStyle } : {}),
          ...(amp === 0 && ev.tokens.blockquoteBorderColor ? { blockquoteBorderColor: ev.tokens.blockquoteBorderColor } : {}),
        },
      }
      : {}),
  }

  // Anything left unstated is SAMPLED from the register, never defaulted (sample.ts
  // explains why at length), then cohesion settles pairwise conflicts and energy.
  const completed = completeGenome(partial, recent)
  const { genome, repairs } = applyCohesion(completed)
  return { variant, register, genome, chrome: rung.policy, trace, repairs }
}

// ─── The entry point ─────────────────────────────────────────────────────────

/** The floor under the floor: a valid genome even if everything above threw. */
function presetFloor(register: Register, seed: number, variant: VariantName): Direction {
  const { genome } = applyCohesion(completeGenome({ register, seed, origin: { source: 'derived', seed, variant } }))
  return {
    variant, register, genome, chrome: 'harmonise',
    trace: [{ axis: '*', value: register, from: 'the derivation threw', rule: 'preset floor' }],
    repairs: [],
  }
}

/**
 * Evidence → three genomes, deterministically.
 *
 * NEVER THROWS. Every stage is individually caught and every stage has a floor,
 * because this is the last rung of the ladder: if this throws, a customer sees an
 * error instead of a blog. The `degraded` flag says whether the floor was used, so
 * a silent catch can never masquerade as a successful derivation.
 */
export function directDeterministic(
  evidence: DesignEvidence,
  opts: { siteId?: string; recent?: RecentUse } = {},
): Directed {
  const started = Date.now()
  let degraded = false

  // The seed is per-site AND per-variant: two businesses with identical evidence
  // still get different designs, and one business's three tabs never collide on the
  // axes the derivation leaves to the sampler.
  const base = seedFrom(opts.siteId ?? evidence.url ?? 'carma', DIRECTOR_VERSION)
  const recent = opts.recent ?? {}

  let priors: ReturnType<typeof registerVariants>
  try {
    priors = registerVariants(evidence.registerPrior.register)
  } catch {
    degraded = true
    priors = { faithful: 'contemporary', elevated: 'quiet', reimagined: 'bold' }
  }

  const build = (variant: VariantName, register: Register, avoid: readonly FontId[] = []): Direction => {
    const seed = seedFrom(base, variant)
    try {
      return deriveOne(evidence, variant, register, seed, recent, avoid)
    } catch {
      degraded = true
      return presetFloor(register, seed, variant)
    }
  }

  // Order matters: Fidel is derived first so Elevat and Reimaginat can be told which
  // faces are already spoken for. Three tabs that differ only in their colour ramp
  // are three tabs nobody will click twice.
  const faithful = build('faithful', priors.faithful)
  const taken = [faithful.genome.type.heading, faithful.genome.type.body]
  const elevated = build('elevated', priors.elevated, taken)
  const reimagined = build('reimagined', priors.reimagined, [...taken, elevated.genome.type.heading])

  return { faithful, elevated, reimagined, ms: Date.now() - started, degraded }
}

/** Render one variant's derivation as readable lines. Used by the gate and the Lab. */
export function explain(d: Direction): string[] {
  return d.trace.map(s => `${s.axis.padEnd(22)} ${s.value.padEnd(28)} ← ${s.from}${s.rule ? `  [${s.rule}]` : ''}`)
}
