// THE UNTRUSTED-INPUT BOUNDARY.
//
// Everything that reaches `compileGenome` passes through here first, and the rule
// is the one from genome.ts: a genome contains no free strings that reach CSS. So
// this file is mostly a long, boring list of "is this one of these seven values",
// which is exactly what a security boundary should look like.
//
// WHAT MAKES IT DIFFERENT FROM A NORMAL SCHEMA VALIDATOR
// ─────────────────────────────────────────────────────
// An invalid field does NOT fall back to a default. It falls back to a SAMPLE
// (sample.ts). Defaults are how a generator regresses to the mean — a model that
// is unsure omits a field, a default fills it with the same value every time, and
// six months later every blog fades in from the bottom. An omitted or invalid
// field here is drawn from the register's allow-list using the genome's own seed,
// so uncertainty produces variety instead of uniformity.
//
// THERE IS NO CSS SANITISER ANYWHERE IN THIS SYSTEM, and that is the point. CSS
// sanitisers are a known source of parser-discrepancy bugs — the sanitiser's
// grammar and the browser's grammar disagree and something slips through. We never
// receive CSS, so we never have to be right about parsing it. The only two places
// a caller-supplied string survives are colour pins and the button block, and both
// go through `safeCssValue` below, which is an ALLOW-list of characters rather
// than a deny-list of attacks.

import {
  CHROME_POLICIES, CONTRAST_FLOORS, COLUMNS, CORNERS, DIVIDERS, DROP_CAPS, ENTRANCES,
  FEED_MODES, FIGURES, FOOTER_ARCHETYPES, GENOME_VERSION, GROUNDS, HEADER_ARCHETYPES,
  HEADING_CASES, HOVERS, LANES, LEADINGS, LEADS, QUOTE_MARKS, RATIOS, REGISTERS,
  RHYTHMS, RULES, SATURATIONS, SCALES, SCHEMES, TRACKINGS, TRANSITIONS, TREATMENTS,
  UNDERLINES, type Genome, type PaletteRole, type Register,
} from '@/lib/design/genome'
import { isFontId } from '@/lib/design/fonts'
import { applyCohesion, type Repair } from '@/lib/design/cohesion'
import { completeGenome, seedFrom, type PartialGenome, type RecentUse } from '@/lib/design/sample'
import { parseColor } from '@/lib/scrape/chromeContrast'

export type ValidationResult = {
  ok: boolean
  genome: Genome
  /** Everything the input got wrong. Feed this back into the prompt; it is the
   *  cheapest training signal we will ever get. */
  violations: string[]
  /** Everything cohesion changed on the way through. */
  repairs: Repair[]
}

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

function oneOf<T extends string | number>(v: unknown, allowed: readonly T[]): T | undefined {
  return (allowed as readonly unknown[]).includes(v as T) ? v as T : undefined
}

function num(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return Math.min(max, Math.max(min, v))
}

function intIn(v: unknown, min: number, max: number): number | undefined {
  const n = num(v, min, max)
  return n === undefined ? undefined : Math.round(n)
}

/**
 * The only place a caller string becomes part of a stylesheet.
 *
 * An ALLOW-list of characters, deliberately: hex/rgb/hsl colours, `linear-gradient(...)`
 * and length values all live inside this set, while every CSS-structural character
 * (`{`, `}`, `;`, `<`, `>`, `"`, `'`, `\`, `@`) and every fetch-capable construct
 * (`url(`) lives outside it. A value that is not entirely inside the set is dropped,
 * never repaired — a half-understood colour is worse than no colour.
 */
export function safeCssValue(v: unknown, maxLen = 120): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s || s.length > maxLen) return undefined
  if (!/^[a-zA-Z0-9#(),.%/\s_-]+$/.test(s)) return undefined
  if (/url\s*\(|expression|@import|javascript:/i.test(s)) return undefined
  return s
}

function safeColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!safeCssValue(s, 64)) return undefined
  return parseColor(s) ? s : undefined
}

const PALETTE_ROLES: PaletteRole[] = ['primary', 'accent', 'bg', 'surface', 'text', 'muted', 'border', 'link']

/**
 * Validate anything into a compilable genome.
 *
 * Never throws and never returns null: a totally malformed input still produces a
 * genome, because the render path must never depend on a model having behaved.
 * `ok` tells you whether anything was wrong; `violations` tells you what.
 */
export function validateGenome(input: unknown, opts: { recent?: RecentUse; fallbackSeed?: number } = {}): ValidationResult {
  const violations: string[] = []
  const bad = (m: string) => violations.push(m)
  const raw = obj(input)

  if (raw.v !== undefined && raw.v !== GENOME_VERSION) bad(`unknown genome version ${String(raw.v)}`)

  const register = oneOf<Register>(raw.register, REGISTERS)
  if (!register) bad(`register must be one of ${REGISTERS.join(' | ')}`)

  const rawOrigin = obj(raw.origin)
  const seed = intIn(rawOrigin.seed, 0, 0xffffffff)
    ?? opts.fallbackSeed
    ?? seedFrom(JSON.stringify(raw).slice(0, 512))

  const rawPalette = obj(raw.palette)
  const rawSeedColor = obj(rawPalette.seed)
  const paletteSeed = (() => {
    const l = num(rawSeedColor.l, 0, 1)
    const c = num(rawSeedColor.c, 0, 0.4)
    const h = num(rawSeedColor.h, 0, 360)
    if (l === undefined || c === undefined || h === undefined) {
      if (rawPalette.seed !== undefined) bad('palette.seed must be {l:0..1, c:0..0.4, h:0..360}')
      return undefined
    }
    return { l, c, h }
  })()

  const pins: Partial<Record<PaletteRole, string>> = {}
  const rawPins = obj(rawPalette.pins)
  for (const role of PALETTE_ROLES) {
    if (rawPins[role] === undefined) continue
    const c = safeColor(rawPins[role])
    if (c) pins[role] = c
    else bad(`palette.pins.${role} is not a usable colour`)
  }

  const rawType = obj(raw.type)
  const heading = isFontId(rawType.heading) ? rawType.heading : undefined
  if (rawType.heading !== undefined && !heading) bad(`type.heading "${String(rawType.heading)}" is not a catalogue font id`)
  const body = isFontId(rawType.body) ? rawType.body : undefined
  if (rawType.body !== undefined && !body) bad(`type.body "${String(rawType.body)}" is not a catalogue font id`)
  const accentFace = isFontId(rawType.accentFace) ? rawType.accentFace : undefined

  const rawSpace = obj(raw.space)
  const rawFeed = obj(raw.feed)
  const rawOrn = obj(raw.ornament)
  const rawMotion = obj(raw.motion)
  const rawImg = obj(raw.imagery)
  const rawChrome = obj(raw.chrome)
  const rawBudget = obj(raw.budget)
  const rawButton = obj(raw.button)
  const rawProse = obj(raw.prose)

  const weights = (v: unknown): number[] | undefined =>
    Array.isArray(v) && v.length > 0 && v.every(w => typeof w === 'number' && w >= 100 && w <= 900)
      ? (v as number[])
      : undefined

  const partial: PartialGenome = {
    register: register ?? 'contemporary',
    seed,
    origin: {
      source: oneOf(rawOrigin.source, ['derived', 'directed', 'preset', 'edited', 'nudged'] as const) ?? 'directed',
      seed,
      ...(typeof rawOrigin.parent === 'string' ? { parent: rawOrigin.parent.slice(0, 64) } : {}),
      ...(oneOf(rawOrigin.variant, ['faithful', 'elevated', 'reimagined'] as const)
        ? { variant: rawOrigin.variant as Genome['origin']['variant'] } : {}),
      ...(typeof rawOrigin.presetId === 'string' ? { presetId: rawOrigin.presetId.slice(0, 64) } : {}),
    },
    palette: {
      ...(paletteSeed ? { seed: paletteSeed } : {}),
      ...(oneOf(rawPalette.scheme, SCHEMES) ? { scheme: rawPalette.scheme as Genome['palette']['scheme'] } : {}),
      ...(oneOf(rawPalette.ground, GROUNDS) ? { ground: rawPalette.ground as Genome['palette']['ground'] } : {}),
      ...(oneOf(rawPalette.saturation, SATURATIONS) ? { saturation: rawPalette.saturation as Genome['palette']['saturation'] } : {}),
      ...(oneOf(rawPalette.contrast, CONTRAST_FLOORS) ? { contrast: rawPalette.contrast as Genome['palette']['contrast'] } : {}),
      ...(num(rawPalette.counterHue, 0, 360) !== undefined ? { counterHue: num(rawPalette.counterHue, 0, 360) } : {}),
      ...(Object.keys(pins).length ? { pins } : {}),
    } as PartialGenome['palette'],
    type: {
      ...(heading ? { heading } : {}),
      ...(body ? { body } : {}),
      ...(accentFace ? { accentFace } : {}),
      ...(oneOf(rawType.scale, SCALES) ? { scale: rawType.scale as Genome['type']['scale'] } : {}),
      ...(num(rawType.measure, 40, 120) !== undefined ? { measure: num(rawType.measure, 40, 120) } : {}),
      ...(oneOf(rawType.leading, LEADINGS) ? { leading: rawType.leading as Genome['type']['leading'] } : {}),
      ...(oneOf(rawType.headingCase, HEADING_CASES) ? { headingCase: rawType.headingCase as Genome['type']['headingCase'] } : {}),
      ...(oneOf(rawType.headingTracking, TRACKINGS) ? { headingTracking: rawType.headingTracking as Genome['type']['headingTracking'] } : {}),
      ...(oneOf(rawType.figures, FIGURES) ? { figures: rawType.figures as Genome['type']['figures'] } : {}),
      ...(typeof rawType.opticalSizing === 'boolean' ? { opticalSizing: rawType.opticalSizing } : {}),
      ...(weights(rawType.headingWeights) ? { headingWeights: weights(rawType.headingWeights) } : {}),
      ...(weights(rawType.bodyWeights) ? { bodyWeights: weights(rawType.bodyWeights) } : {}),
      ...(num(rawType.basePx, 12, 24) !== undefined ? { basePx: num(rawType.basePx, 12, 24) } : {}),
      ...(intIn(rawType.headingWeight, 100, 900) !== undefined ? { headingWeight: intIn(rawType.headingWeight, 100, 900) } : {}),
      ...(intIn(rawType.sectionTitleWeight, 100, 900) !== undefined ? { sectionTitleWeight: intIn(rawType.sectionTitleWeight, 100, 900) } : {}),
      ...(num(rawType.sectionTitleSizeRem, 1, 8) !== undefined ? { sectionTitleSizeRem: num(rawType.sectionTitleSizeRem, 1, 8) } : {}),
      ...(oneOf(rawType.sectionTitleAlign, ['left', 'center', 'right'] as const)
        ? { sectionTitleAlign: rawType.sectionTitleAlign as 'left' | 'center' | 'right' } : {}),
      ...(safeColor(rawType.sectionTitleColor) ? { sectionTitleColor: safeColor(rawType.sectionTitleColor) } : {}),
    } as PartialGenome['type'],
    space: {
      ...(oneOf(rawSpace.ratio, RATIOS) ? { ratio: rawSpace.ratio as Genome['space']['ratio'] } : {}),
      ...(oneOf(rawSpace.density, ['compact', 'comfortable', 'generous', 'vast'] as const)
        ? { density: rawSpace.density as Genome['space']['density'] } : {}),
      ...(oneOf(rawSpace.lanes, LANES) ? { lanes: rawSpace.lanes as Genome['space']['lanes'] } : {}),
      ...(oneOf(rawSpace.rule, RULES) ? { rule: rawSpace.rule as Genome['space']['rule'] } : {}),
      ...(intIn(rawSpace.maxWidthPx, 640, 1920) !== undefined ? { maxWidthPx: intIn(rawSpace.maxWidthPx, 640, 1920) } : {}),
    } as PartialGenome['space'],
    feed: {
      ...(oneOf(rawFeed.rhythm, RHYTHMS) ? { rhythm: rawFeed.rhythm as Genome['feed']['rhythm'] } : {}),
      ...(oneOf(rawFeed.mode, FEED_MODES) ? { mode: rawFeed.mode as Genome['feed']['mode'] } : {}),
      ...(oneOf(rawFeed.columns, COLUMNS) ? { columns: rawFeed.columns as Genome['feed']['columns'] } : {}),
      ...(oneOf(rawFeed.lead, LEADS) ? { lead: rawFeed.lead as Genome['feed']['lead'] } : {}),
      ...(typeof rawFeed.numbering === 'boolean' ? { numbering: rawFeed.numbering } : {}),
    } as PartialGenome['feed'],
    ornament: {
      ...(oneOf(rawOrn.dropCap, DROP_CAPS) ? { dropCap: rawOrn.dropCap as Genome['ornament']['dropCap'] } : {}),
      ...(oneOf(rawOrn.quoteMark, QUOTE_MARKS) ? { quoteMark: rawOrn.quoteMark as Genome['ornament']['quoteMark'] } : {}),
      ...(oneOf(rawOrn.grain, [0, 1, 2] as const) ? { grain: rawOrn.grain as 0 | 1 | 2 } : {}),
      ...(oneOf(rawOrn.divider, DIVIDERS) ? { divider: rawOrn.divider as Genome['ornament']['divider'] } : {}),
      ...(oneOf(rawOrn.corner, CORNERS) ? { corner: rawOrn.corner as Genome['ornament']['corner'] } : {}),
      ...(oneOf(rawOrn.underline, UNDERLINES) ? { underline: rawOrn.underline as Genome['ornament']['underline'] } : {}),
      ...(intIn(rawOrn.radiusPx, 0, 64) !== undefined ? { radiusPx: intIn(rawOrn.radiusPx, 0, 64) } : {}),
      ...(intIn(rawOrn.radiusLgPx, 0, 96) !== undefined ? { radiusLgPx: intIn(rawOrn.radiusLgPx, 0, 96) } : {}),
    } as PartialGenome['ornament'],
    motion: {
      ...(oneOf(rawMotion.entrance, ENTRANCES) ? { entrance: rawMotion.entrance as Genome['motion']['entrance'] } : {}),
      ...(oneOf(rawMotion.hover, HOVERS) ? { hover: rawMotion.hover as Genome['motion']['hover'] } : {}),
      ...(oneOf(rawMotion.transition, TRANSITIONS) ? { transition: rawMotion.transition as Genome['motion']['transition'] } : {}),
      ...(oneOf(rawMotion.intensity, [0, 1, 2] as const) ? { intensity: rawMotion.intensity as 0 | 1 | 2 } : {}),
    } as PartialGenome['motion'],
    imagery: {
      ...(oneOf(rawImg.treatment, TREATMENTS) ? { treatment: rawImg.treatment as Genome['imagery']['treatment'] } : {}),
      ...(oneOf(rawImg.fit, ['cover', 'contain'] as const) ? { fit: rawImg.fit as 'cover' | 'contain' } : {}),
    } as PartialGenome['imagery'],
    ...(Object.keys(rawChrome).length
      ? {
        chrome: {
          policy: oneOf(rawChrome.policy, CHROME_POLICIES) ?? 'harmonise',
          header: oneOf(rawChrome.header, HEADER_ARCHETYPES) ?? 'masthead',
          footer: oneOf(rawChrome.footer, FOOTER_ARCHETYPES) ?? 'columns',
          sticky: rawChrome.sticky !== false,
        },
      }
      : {}),
    budget: {
      faces: intIn(rawBudget.faces, 1, 12) ?? 4,
      cssKb: intIn(rawBudget.cssKb, 4, 64) ?? 14,
      js: 0,
    },
  }

  // Button and prose are pass-through brand details, each value re-validated.
  const button: NonNullable<Genome['button']> = {}
  if (safeCssValue(rawButton.bg)) button.bg = safeCssValue(rawButton.bg)
  if (safeColor(rawButton.text)) button.text = safeColor(rawButton.text)
  if (intIn(rawButton.radiusPx, 0, 999) !== undefined) button.radiusPx = intIn(rawButton.radiusPx, 0, 999)
  if (intIn(rawButton.weight, 100, 900) !== undefined) button.weight = intIn(rawButton.weight, 100, 900)
  if (oneOf(rawButton.textTransform, ['uppercase', 'none', 'capitalize', 'lowercase'] as const)) {
    button.textTransform = rawButton.textTransform as NonNullable<Genome['button']>['textTransform']
  }
  if (safeCssValue(rawButton.paddingY, 24)) button.paddingY = safeCssValue(rawButton.paddingY, 24)
  if (safeCssValue(rawButton.paddingX, 24)) button.paddingX = safeCssValue(rawButton.paddingX, 24)
  if (safeCssValue(rawButton.border, 64)) button.border = safeCssValue(rawButton.border, 64)
  if (safeCssValue(rawButton.shadow, 96)) button.shadow = safeCssValue(rawButton.shadow, 96)
  if (Object.keys(button).length) partial.button = button

  const prose: NonNullable<Genome['prose']> = {}
  if (num(rawProse.bodyLineHeight, 1.2, 2.2) !== undefined) prose.bodyLineHeight = num(rawProse.bodyLineHeight, 1.2, 2.2)
  if (num(rawProse.paragraphSpacingRem, 0.4, 3) !== undefined) prose.paragraphSpacingRem = num(rawProse.paragraphSpacingRem, 0.4, 3)
  if (oneOf(rawProse.blockquoteStyle, ['italic', 'normal'] as const)) {
    prose.blockquoteStyle = rawProse.blockquoteStyle as 'italic' | 'normal'
  }
  if (safeColor(rawProse.blockquoteBorderColor)) prose.blockquoteBorderColor = safeColor(rawProse.blockquoteBorderColor)
  if (num(rawProse.headingLineHeight, 0.9, 1.8) !== undefined) prose.headingLineHeight = num(rawProse.headingLineHeight, 0.9, 1.8)
  if (Object.keys(prose).length) partial.prose = prose

  const completed = completeGenome(partial, opts.recent ?? {})
  const { genome, repairs } = applyCohesion(completed)
  return { ok: violations.length === 0, genome, violations, repairs }
}
