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

/**
 * An optional enum field that REPORTS when it is present and wrong.
 *
 * The first version just dropped an unrecognised value and let the sampler fill the
 * gap. That is the right RUNTIME behaviour — a design missing one axis is still a
 * design — but it is the wrong AUDIT behaviour, and W4 is where the difference bit:
 * a model naming a font we do not host, or a register that does not exist, produced
 * a perfectly valid genome and an empty `violations` array. We learned nothing, and
 * the fail-open never fired because nothing reported a failure.
 *
 * So a field that is absent stays silent, and a field that is present and invalid
 * is named. `violations` is the cheapest training signal this system will ever get;
 * swallowing it to keep the happy path tidy is a bad trade.
 */
function optEnum<K extends string, T extends string | number>(
  v: unknown, allowed: readonly T[], key: K, path: string, report: (m: string) => void,
): { [P in K]?: T } {
  if (v === undefined) return {} as { [P in K]?: T }
  const m = oneOf(v, allowed)
  if (m === undefined) {
    const shown = allowed.slice(0, 8).join(' | ') + (allowed.length > 8 ? ' | …' : '')
    report(`${path} ${JSON.stringify(v)} is not one of ${shown}`)
    return {} as { [P in K]?: T }
  }
  return { [key]: m } as { [P in K]?: T }
}

/** Same contract as `optEnum`, but for a field that has a fallback rather than
 *  being omitted. Present-and-wrong is still reported. */
function enumOr<T extends string | number>(
  v: unknown, allowed: readonly T[], fallback: T, path: string, report: (m: string) => void,
): T {
  if (v === undefined) return fallback
  const m = oneOf(v, allowed)
  if (m === undefined) {
    report(`${path} ${JSON.stringify(v)} is not one of ${allowed.slice(0, 8).join(' | ')}`)
    return fallback
  }
  return m
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
      ...optEnum(rawOrigin.variant, ['faithful', 'elevated', 'reimagined'] as const, 'variant', 'origin.variant', bad),
      ...(typeof rawOrigin.presetId === 'string' ? { presetId: rawOrigin.presetId.slice(0, 64) } : {}),
    },
    palette: {
      ...(paletteSeed ? { seed: paletteSeed } : {}),
      ...optEnum(rawPalette.scheme, SCHEMES, 'scheme', 'palette.scheme', bad),
      ...optEnum(rawPalette.ground, GROUNDS, 'ground', 'palette.ground', bad),
      ...optEnum(rawPalette.saturation, SATURATIONS, 'saturation', 'palette.saturation', bad),
      ...optEnum(rawPalette.contrast, CONTRAST_FLOORS, 'contrast', 'palette.contrast', bad),
      ...(num(rawPalette.counterHue, 0, 360) !== undefined ? { counterHue: num(rawPalette.counterHue, 0, 360) } : {}),
      ...(Object.keys(pins).length ? { pins } : {}),
    } as PartialGenome['palette'],
    type: {
      ...(heading ? { heading } : {}),
      ...(body ? { body } : {}),
      ...(accentFace ? { accentFace } : {}),
      ...optEnum(rawType.scale, SCALES, 'scale', 'type.scale', bad),
      ...(num(rawType.measure, 40, 120) !== undefined ? { measure: num(rawType.measure, 40, 120) } : {}),
      ...optEnum(rawType.leading, LEADINGS, 'leading', 'type.leading', bad),
      ...optEnum(rawType.headingCase, HEADING_CASES, 'headingCase', 'type.headingCase', bad),
      ...optEnum(rawType.headingTracking, TRACKINGS, 'headingTracking', 'type.headingTracking', bad),
      ...optEnum(rawType.figures, FIGURES, 'figures', 'type.figures', bad),
      ...(typeof rawType.opticalSizing === 'boolean' ? { opticalSizing: rawType.opticalSizing } : {}),
      ...(weights(rawType.headingWeights) ? { headingWeights: weights(rawType.headingWeights) } : {}),
      ...(weights(rawType.bodyWeights) ? { bodyWeights: weights(rawType.bodyWeights) } : {}),
      ...(num(rawType.basePx, 12, 24) !== undefined ? { basePx: num(rawType.basePx, 12, 24) } : {}),
      ...(intIn(rawType.headingWeight, 100, 900) !== undefined ? { headingWeight: intIn(rawType.headingWeight, 100, 900) } : {}),
      ...(intIn(rawType.sectionTitleWeight, 100, 900) !== undefined ? { sectionTitleWeight: intIn(rawType.sectionTitleWeight, 100, 900) } : {}),
      ...(num(rawType.sectionTitleSizeRem, 1, 8) !== undefined ? { sectionTitleSizeRem: num(rawType.sectionTitleSizeRem, 1, 8) } : {}),
      ...optEnum(rawType.sectionTitleAlign, ['left', 'center', 'right'] as const, 'sectionTitleAlign', 'type.sectionTitleAlign', bad),
      ...(safeColor(rawType.sectionTitleColor) ? { sectionTitleColor: safeColor(rawType.sectionTitleColor) } : {}),
    } as PartialGenome['type'],
    space: {
      ...optEnum(rawSpace.ratio, RATIOS, 'ratio', 'space.ratio', bad),
      ...optEnum(rawSpace.density, ['compact', 'comfortable', 'generous', 'vast'] as const, 'density', 'space.density', bad),
      ...optEnum(rawSpace.lanes, LANES, 'lanes', 'space.lanes', bad),
      ...optEnum(rawSpace.rule, RULES, 'rule', 'space.rule', bad),
      ...(intIn(rawSpace.maxWidthPx, 640, 1920) !== undefined ? { maxWidthPx: intIn(rawSpace.maxWidthPx, 640, 1920) } : {}),
    } as PartialGenome['space'],
    feed: {
      ...optEnum(rawFeed.rhythm, RHYTHMS, 'rhythm', 'feed.rhythm', bad),
      ...optEnum(rawFeed.mode, FEED_MODES, 'mode', 'feed.mode', bad),
      ...optEnum(rawFeed.columns, COLUMNS, 'columns', 'feed.columns', bad),
      ...optEnum(rawFeed.lead, LEADS, 'lead', 'feed.lead', bad),
      ...(typeof rawFeed.numbering === 'boolean' ? { numbering: rawFeed.numbering } : {}),
    } as PartialGenome['feed'],
    ornament: {
      ...optEnum(rawOrn.dropCap, DROP_CAPS, 'dropCap', 'ornament.dropCap', bad),
      ...optEnum(rawOrn.quoteMark, QUOTE_MARKS, 'quoteMark', 'ornament.quoteMark', bad),
      ...optEnum(rawOrn.grain, [0, 1, 2] as const, 'grain', 'ornament.grain', bad),
      ...optEnum(rawOrn.divider, DIVIDERS, 'divider', 'ornament.divider', bad),
      ...optEnum(rawOrn.corner, CORNERS, 'corner', 'ornament.corner', bad),
      ...optEnum(rawOrn.underline, UNDERLINES, 'underline', 'ornament.underline', bad),
      ...(intIn(rawOrn.radiusPx, 0, 64) !== undefined ? { radiusPx: intIn(rawOrn.radiusPx, 0, 64) } : {}),
      ...(intIn(rawOrn.radiusLgPx, 0, 96) !== undefined ? { radiusLgPx: intIn(rawOrn.radiusLgPx, 0, 96) } : {}),
    } as PartialGenome['ornament'],
    motion: {
      ...optEnum(rawMotion.entrance, ENTRANCES, 'entrance', 'motion.entrance', bad),
      ...optEnum(rawMotion.hover, HOVERS, 'hover', 'motion.hover', bad),
      ...optEnum(rawMotion.transition, TRANSITIONS, 'transition', 'motion.transition', bad),
      ...optEnum(rawMotion.intensity, [0, 1, 2] as const, 'intensity', 'motion.intensity', bad),
    } as PartialGenome['motion'],
    imagery: {
      ...optEnum(rawImg.treatment, TREATMENTS, 'treatment', 'imagery.treatment', bad),
      ...optEnum(rawImg.fit, ['cover', 'contain'] as const, 'fit', 'imagery.fit', bad),
    } as PartialGenome['imagery'],
    ...(Object.keys(rawChrome).length
      ? {
        chrome: {
          policy: enumOr(rawChrome.policy, CHROME_POLICIES, 'harmonise', 'chrome.policy', bad),
          header: enumOr(rawChrome.header, HEADER_ARCHETYPES, 'masthead', 'chrome.header', bad),
          footer: enumOr(rawChrome.footer, FOOTER_ARCHETYPES, 'columns', 'chrome.footer', bad),
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
  if (rawButton.textTransform !== undefined) {
    const tt = oneOf(rawButton.textTransform, ['uppercase', 'none', 'capitalize', 'lowercase'] as const)
    if (tt) button.textTransform = tt
    else bad(`button.textTransform ${JSON.stringify(rawButton.textTransform)} is not a text-transform`)
  }
  if (safeCssValue(rawButton.paddingY, 24)) button.paddingY = safeCssValue(rawButton.paddingY, 24)
  if (safeCssValue(rawButton.paddingX, 24)) button.paddingX = safeCssValue(rawButton.paddingX, 24)
  if (safeCssValue(rawButton.border, 64)) button.border = safeCssValue(rawButton.border, 64)
  if (safeCssValue(rawButton.shadow, 96)) button.shadow = safeCssValue(rawButton.shadow, 96)
  if (Object.keys(button).length) partial.button = button

  const prose: NonNullable<Genome['prose']> = {}
  if (num(rawProse.bodyLineHeight, 1.2, 2.2) !== undefined) prose.bodyLineHeight = num(rawProse.bodyLineHeight, 1.2, 2.2)
  if (num(rawProse.paragraphSpacingRem, 0.4, 3) !== undefined) prose.paragraphSpacingRem = num(rawProse.paragraphSpacingRem, 0.4, 3)
  if (rawProse.blockquoteStyle !== undefined) {
    const bs = oneOf(rawProse.blockquoteStyle, ['italic', 'normal'] as const)
    if (bs) prose.blockquoteStyle = bs
    else bad(`prose.blockquoteStyle ${JSON.stringify(rawProse.blockquoteStyle)} is not italic | normal`)
  }
  if (safeColor(rawProse.blockquoteBorderColor)) prose.blockquoteBorderColor = safeColor(rawProse.blockquoteBorderColor)
  if (num(rawProse.headingLineHeight, 0.9, 1.8) !== undefined) prose.headingLineHeight = num(rawProse.headingLineHeight, 0.9, 1.8)
  if (Object.keys(prose).length) partial.prose = prose

  const completed = completeGenome(partial, opts.recent ?? {})
  const { genome, repairs } = applyCohesion(completed)
  return { ok: violations.length === 0, genome, violations, repairs }
}
