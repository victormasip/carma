// OKLCH colour engine — the reason a generated palette can be trusted.
//
// The old model was REPAIR: capture a site's colours, audit them
// (`scrape/chromeContrast.ts`, 488 lines), patch the failures, and ship a
// `contrastGuardScript()` to every rendered page in case the patch missed one.
// That is the right architecture for colours we did not choose. It is the wrong
// one for colours we generate.
//
// Here contrast is a CONSTRUCTION CONSTRAINT. The palette is expanded from one
// brand seed in OKLCH — a perceptual space, so equal lightness steps look equal —
// and every text/ground pair is walked down its own lightness ramp until it clears
// the declared floor. We never ask whether the design passes. A failing design is
// not representable.
//
// WCAG 2.x relative luminance is used for the floor rather than APCA, on purpose:
// it is what `chromeContrast.ts` already computes, what our a11y pass is measured
// against, and what a customer's own auditor will run. APCA is the better model
// and is worth revisiting when it lands in a normative spec; shipping two contrast
// definitions in one codebase is worse than shipping the older one consistently.

import { contrastRatio, parseColor, type Rgb } from '@/lib/scrape/chromeContrast'
import type { ContrastFloor, Ground, Oklch, PaletteRole, Saturation, Scheme } from '@/lib/design/genome'

// ─── sRGB ↔ OKLab ↔ OKLCH (Björn Ottosson, 2020) ─────────────────────────────

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export function hexToRgb(hex: string): Rgb | null {
  return parseColor(hex)
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = srgbToLinear(r / 255), lg = srgbToLinear(g / 255), lb = srgbToLinear(b / 255)
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  const c = Math.sqrt(A * A + B * B)
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

function oklchToRgbRaw({ l, c, h }: Oklch): { r: number; g: number; b: number; inGamut: boolean } {
  const rad = (h * Math.PI) / 180
  const A = c * Math.cos(rad)
  const B = c * Math.sin(rad)
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B
  const s_ = l - 0.0894841775 * A - 1.2914855480 * B
  const L = l_ * l_ * l_, M = m_ * m_ * m_, S = s_ * s_ * s_
  const lr = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S
  const lg = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S
  const lb = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S
  const eps = 1e-4
  const inGamut = [lr, lg, lb].every(v => v >= -eps && v <= 1 + eps)
  return {
    r: linearToSrgb(clamp01(lr)) * 255,
    g: linearToSrgb(clamp01(lg)) * 255,
    b: linearToSrgb(clamp01(lb)) * 255,
    inGamut,
  }
}

/**
 * OKLCH → hex, gamut-mapped.
 *
 * Out-of-gamut colours are brought back by REDUCING CHROMA at constant lightness
 * and hue, which preserves the two things a reader perceives (how light it is, what
 * colour it is) and sacrifices the one they don't (how saturated it could have
 * been). Naive per-channel clipping instead shifts the hue, which is how generated
 * palettes end up with a "brand blue" that arrives purple.
 */
export function oklchToHex(input: Oklch): string {
  const l = Math.max(0, Math.min(1, input.l))
  const h = ((input.h % 360) + 360) % 360
  let lo = 0, hi = Math.max(0, Math.min(0.4, input.c))
  if (oklchToRgbRaw({ l, c: hi, h }).inGamut) return rgbToHex(oklchToRgbRaw({ l, c: hi, h }))
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (oklchToRgbRaw({ l, c: mid, h }).inGamut) lo = mid
    else hi = mid
  }
  return rgbToHex(oklchToRgbRaw({ l, c: lo, h }))
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToOklch(rgb) : null
}

// ─── Contrast ────────────────────────────────────────────────────────────────

export const FLOOR: Record<ContrastFloor, { body: number; large: number; ui: number }> = {
  AA: { body: 4.5, large: 3, ui: 3 },
  AAA: { body: 7, large: 4.5, ui: 3 },
}

export function ratio(a: string, b: string): number {
  const ra = parseColor(a), rb = parseColor(b)
  if (!ra || !rb) return 1
  return contrastRatio(ra, rb)
}

// ─── Palette derivation ──────────────────────────────────────────────────────

const CHROMA: Record<Saturation, number> = { muted: 0.55, natural: 1, vivid: 1.35 }

/** The counter-hue a scheme implies, when the genome does not pin one. */
export function counterHueFor(scheme: Scheme, h: number): number {
  const at = (deg: number) => ((h + deg) % 360 + 360) % 360
  switch (scheme) {
    case 'monochrome': return h
    case 'analogous': return at(28)
    case 'complementary': return at(180)
    case 'split': return at(150)
    case 'duotone': return at(200)
    case 'triad': return at(120)
  }
}

export type DerivedPalette = Record<PaletteRole, string>

/**
 * Expand one brand seed into the seven roles the renderer consumes, plus `link`.
 *
 * Every pair that carries text is contrast-enforced before it is returned, so a
 * caller cannot receive an illegible palette even by asking for one.
 */
export function derivePalette(opts: {
  seed: Oklch
  scheme: Scheme
  ground: Ground
  saturation: Saturation
  contrast: ContrastFloor
  counterHue?: number
}): DerivedPalette {
  const { seed, scheme, ground, saturation, contrast } = opts
  const floor = FLOOR[contrast]
  const k = CHROMA[saturation]
  const h = ((seed.h % 360) + 360) % 360
  const ch = opts.counterHue ?? counterHueFor(scheme, h)

  const accent = oklchToHex({ l: seed.l, c: seed.c * k, h })

  // The ground carries a whisper of the brand hue rather than being neutral grey.
  // It is the cheapest thing in the whole system that reads as "designed": a paper
  // that is 0.008 chroma toward the brand is not perceived as coloured, it is
  // perceived as warm or cool, which is exactly the intent.
  let bg: string, surface: string, text: string, border: string, muted: string
  if (ground === 'ink') {
    bg = oklchToHex({ l: 0.16, c: 0.012 * k, h })
    surface = oklchToHex({ l: 0.22, c: 0.014 * k, h })
    text = oklchToHex({ l: 0.95, c: 0.008, h })
    border = oklchToHex({ l: 0.30, c: 0.015 * k, h })
    muted = oklchToHex({ l: 0.68, c: 0.018 * k, h })
  } else if (ground === 'tinted') {
    bg = oklchToHex({ l: 0.965, c: 0.022 * k, h })
    surface = oklchToHex({ l: 0.99, c: 0.010 * k, h })
    text = oklchToHex({ l: 0.22, c: 0.020 * k, h })
    border = oklchToHex({ l: 0.90, c: 0.020 * k, h })
    muted = oklchToHex({ l: 0.55, c: 0.022 * k, h })
  } else {
    bg = oklchToHex({ l: 0.985, c: 0.006 * k, h })
    surface = oklchToHex({ l: 1, c: 0, h })
    text = oklchToHex({ l: 0.20, c: 0.014 * k, h })
    border = oklchToHex({ l: 0.92, c: 0.008 * k, h })
    muted = oklchToHex({ l: 0.55, c: 0.014 * k, h })
  }

  // A duotone/split/triad scheme spends its second hue on the accent's partner,
  // which is what the link becomes when the accent itself cannot carry body text.
  const linkSeed = scheme === 'monochrome' || scheme === 'analogous'
    ? accent
    : oklchToHex({ l: seed.l, c: seed.c * k, h: ch })

  text = enforceContrast(text, bg, floor.body)
  muted = enforceContrast(muted, bg, floor.large)
  const link = enforceContrast(linkSeed, bg, floor.body)

  return { primary: text, accent, bg, surface, text, muted, border, link }
}

/**
 * Apply explicit pins over a derived palette.
 *
 * `enforce` is the interesting parameter and it exists because two different
 * things both look like "a pinned colour":
 *
 *   · A GENERATED genome's pins are the customer's own brand colours, lifted off
 *     their site by the grabber. There, repair is the entire point — we are not
 *     going to reproduce their illegible grey-on-grey just because they shipped it.
 *
 *   · A PRESET genome's pins re-express a template that is ALREADY LIVE on
 *     customer blogs. Silently "fixing" those would be an unannounced redesign of
 *     every site using that look. So presets pass `enforce: false`, and the
 *     failures come back in `reported` instead — visible in the W0 gate, fixed
 *     deliberately or not at all, never by accident.
 */
export function repairPins(
  base: DerivedPalette,
  pins: Partial<Record<PaletteRole, string>> | undefined,
  contrast: ContrastFloor,
  enforce = true,
): { palette: DerivedPalette; repaired: PaletteRole[]; reported: { role: PaletteRole; ratio: number; need: number }[] } {
  const out: DerivedPalette = { ...base }
  const repaired: PaletteRole[] = []
  const reported: { role: PaletteRole; ratio: number; need: number }[] = []
  if (pins) {
    for (const [role, value] of Object.entries(pins) as [PaletteRole, string][]) {
      if (typeof value !== 'string' || !parseColor(value)) continue
      out[role] = value
    }
  }
  const floor = FLOOR[contrast]
  const check: [PaletteRole, number][] = [['text', floor.body], ['link', floor.body], ['muted', floor.large]]
  for (const [role, need] of check) {
    const have = ratio(out[role], out.bg)
    if (have >= need) continue
    if (enforce) {
      out[role] = enforceContrast(out[role], out.bg, need)
      repaired.push(role)
    } else {
      reported.push({ role, ratio: Math.round(have * 100) / 100, need })
    }
  }
  return { palette: out, repaired, reported }
}
