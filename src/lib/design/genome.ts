// THE DESIGN GENOME — the artefact a generated design actually is.
//
// A genome is a versioned JSON document that describes A DESIGN without containing
// ANY CODE. It is what the art director writes, what the Studio edits, what the
// database stores, what the compiler consumes, and what a diff shows when an owner
// says "put it back how it was".
//
// THE ONE DESIGN RULE
// ───────────────────
// Every field is an enum, a number with a declared range, or an id from a
// whitelist. No free string in this file ever reaches CSS. Brand text (site name,
// section title, nav labels) travels separately and is HTML-escaped exactly as it
// is today. That single rule is why `validate.ts` is short and why there is no CSS
// sanitiser anywhere in this system: you cannot mis-parse a string you were never
// sent.
//
// THE SPINE: `register`
// ─────────────────────
// Founder critique #1 ("the Frankenstein risk") is correct and it is the most
// important thing in this file. Orthogonal axes multiply cleanly and produce
// monsters: vivid colour + oldstyle serif + mosaic feed + vast spacing is
// arithmetically valid and aesthetically incoherent.
//
// The fix is not more rules bolted on afterwards. It is a SPINE. Every genome
// declares a `register` — the family of design decisions it belongs to — and each
// register publishes an ALLOW-LIST per axis. A choice outside the register's list
// is not a warning; it is repaired to the nearest in-register value before the
// compiler ever sees it (see cohesion.ts).
//
// This deliberately COLLAPSES the combinatorial space. The first draft of the plan
// bragged about ~10^20 representable genomes. That was the wrong number to be proud
// of. We trade it for ~10^9 COHERENT ones, and the trade is the entire point:
//
//   a grammar that can say anything says nothing worth reading.

import type { DesignTokens, FeedLayout } from '@/lib/scrape/tokens'
import type { FontId } from '@/lib/design/fonts'

export const GENOME_VERSION = 1 as const

/**
 * THE NORTH STAR, as one string, shared by the docs, the Studio copy and the
 * art-director prompt.
 *
 * Founder critique #5: internally "Awwwards-level" is useful shorthand. In a
 * PROMPT it is actively harmful — the token pulls immersive 3D, WebGL and
 * scroll-jacking out of a model's training distribution, which is the opposite of
 * what a blog needs and what the Awwwards rubric actually rewards (Design 40% +
 * Usability 30%). So the model is never shown that word. It is shown this one.
 */
export const LEXICON = 'Premium Editorial Magazine Elegance' as const

// ─── Registers — the six families a design can belong to ─────────────────────

export const REGISTERS = [
  'quiet', 'classic', 'contemporary', 'bold', 'warm', 'severe',
] as const
export type Register = (typeof REGISTERS)[number]

// ─── Axis vocabularies ────────────────────────────────────────────────────────

export const SCHEMES = ['monochrome', 'analogous', 'complementary', 'split', 'duotone', 'triad'] as const
export const GROUNDS = ['paper', 'ink', 'tinted'] as const
export const SATURATIONS = ['muted', 'natural', 'vivid'] as const
export const CONTRAST_FLOORS = ['AA', 'AAA'] as const

export const SCALES = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618] as const
export const LEADINGS = ['tight', 'normal', 'airy'] as const
export const HEADING_CASES = ['sentence', 'title', 'upper'] as const
export const TRACKINGS = ['tight', 'normal', 'loose'] as const
export const FIGURES = ['lining', 'oldstyle'] as const

export const RATIOS = [1.25, 1.333, 1.5, 1.618] as const
export const DENSITIES = ['compact', 'comfortable', 'generous', 'vast'] as const
export const LANES = ['single', 'content-wide', 'content-wide-full'] as const
export const RULES = ['none', 'hairline', 'heavy'] as const

// W0 REUSES THE SHIPPED FEED LAYOUTS ON PURPOSE.
//
// `feedLayouts.ts` already contains seven structurally different, tested,
// production feeds built over the same markup. Inventing a parallel rhythm
// vocabulary in W0 would mean re-deriving CSS that already works and re-earning
// `test:render`'s 247 invariants for no user-visible gain. The genome therefore
// speaks the FeedLayout vocabulary today; widening it (mosaic, ribbon, index) is a
// later wave, and it is additive.
export const RHYTHMS: readonly FeedLayout[] =
  ['standard', 'editorial', 'magazine', 'minimal', 'gridxl', 'overlay', 'compact'] as const

export const LEADS = ['none', 'first'] as const
export const COLUMNS = ['2', '3', '4'] as const
export const FEED_MODES = ['grid', 'list'] as const

export const DROP_CAPS = ['none', 'raised', 'sunken'] as const
export const QUOTE_MARKS = ['none', 'oversize', 'rule'] as const
export const DIVIDERS = ['none', 'rule', 'mark', 'gradient'] as const
export const CORNERS = ['square', 'soft', 'pill', 'cut'] as const
// `hover` is the renderer's own plain hover underline and costs no extra CSS;
// `hover-grow` is the animated version. Keeping both means a genome can ask for
// the baseline explicitly instead of getting it by omission — see sample.ts on why
// nothing in this system is allowed a default.
export const UNDERLINES = ['none', 'hover', 'hover-grow', 'always-thin', 'offset'] as const

export const ENTRANCES = ['none', 'fade', 'rise', 'mask', 'stagger'] as const
export const HOVERS = ['none', 'lift', 'zoom', 'tint', 'shift'] as const
export const TRANSITIONS = ['none', 'crossfade', 'shared-image'] as const

export const TREATMENTS = ['none', 'duotone', 'grayscale', 'warm', 'grain'] as const

/**
 * THE CHROME LADDER — founder critique #3, and the plan's worst mistake.
 *
 * The first draft said a clone's header is NEVER regenerated. That is wrong, and
 * the founder's counterexample is exactly right: bolt a pristine editorial blog
 * under a 2011 header with a pixelated logo and a 3px drop shadow and the seam is
 * grotesque. Respecting the source is not the same as inheriting its mistakes.
 *
 * The resolution is to name what is actually sacred. It is NOT the markup. It is
 * the NAVIGATION and the IDENTITY: where the links go, what they are called, the
 * logo, the brand name. A `box-shadow: 3px 3px 0 #999` is not information about a
 * business; a menu item called "Pressupostos" that points at /pressupostos is.
 *
 *   keep       capture verbatim. The source is good; touching it would be vandalism.
 *   harmonise  their markup and their nav, RE-TOKENISED: our palette, our type
 *              scale, our spacing, applied to the chrome we already restyle through
 *              scopeChromeCss/compileChromeCss. The seam disappears; nothing moves.
 *   rebuild    their CONTENT (logo, nav labels, hrefs, CTA text) re-laid into a
 *              generated chrome archetype. Their navigation survives; their markup
 *              does not.
 *   replace    full generation. From-scratch sites, or an explicit owner decision.
 *
 * The three reveal variants map onto this exactly:
 *   Fidel → keep · Elevat → harmonise · Reimaginat → rebuild.
 */
export const CHROME_POLICIES = ['keep', 'harmonise', 'rebuild', 'replace'] as const
export const HEADER_ARCHETYPES = ['masthead', 'split', 'stack', 'rail', 'minimal'] as const
export const FOOTER_ARCHETYPES = ['columns', 'bar', 'statement'] as const

export type Scheme = (typeof SCHEMES)[number]
export type Ground = (typeof GROUNDS)[number]
export type Saturation = (typeof SATURATIONS)[number]
export type ContrastFloor = (typeof CONTRAST_FLOORS)[number]
export type Scale = (typeof SCALES)[number]
export type Leading = (typeof LEADINGS)[number]
export type HeadingCase = (typeof HEADING_CASES)[number]
export type Tracking = (typeof TRACKINGS)[number]
export type Figures = (typeof FIGURES)[number]
export type Ratio = (typeof RATIOS)[number]
export type Density = (typeof DENSITIES)[number]
export type Lanes = (typeof LANES)[number]
export type RuleWeight = (typeof RULES)[number]
export type Lead = (typeof LEADS)[number]
export type Columns = (typeof COLUMNS)[number]
export type FeedMode = (typeof FEED_MODES)[number]
export type DropCap = (typeof DROP_CAPS)[number]
export type QuoteMark = (typeof QUOTE_MARKS)[number]
export type Divider = (typeof DIVIDERS)[number]
export type Corner = (typeof CORNERS)[number]
export type Underline = (typeof UNDERLINES)[number]
export type Entrance = (typeof ENTRANCES)[number]
export type Hover = (typeof HOVERS)[number]
export type Transition = (typeof TRANSITIONS)[number]
export type Treatment = (typeof TREATMENTS)[number]
export type ChromePolicy = (typeof CHROME_POLICIES)[number]
export type HeaderArchetype = (typeof HEADER_ARCHETYPES)[number]
export type FooterArchetype = (typeof FOOTER_ARCHETYPES)[number]

/** OKLCH. l 0..1, c 0..0.4, h 0..360. The brand's colour, before any expansion. */
export type Oklch = { l: number; c: number; h: number }

/** Colour roles the compiler derives — and that a human may pin. */
export type PaletteRole =
  | 'primary' | 'accent' | 'bg' | 'surface' | 'text' | 'muted' | 'border' | 'link'

export type Genome = {
  v: typeof GENOME_VERSION

  /** The spine. Every allow-list in cohesion.ts is keyed on this. */
  register: Register

  origin: {
    source: 'derived' | 'directed' | 'preset' | 'edited' | 'nudged'
    /** Deterministic variation seed. See sample.ts — this is the anti-mean device. */
    seed: number
    parent?: string
    variant?: 'faithful' | 'elevated' | 'reimagined'
    /** Preset lineage, when this genome re-expresses a shipped template. */
    presetId?: string
  }

  palette: {
    seed: Oklch
    scheme: Scheme
    ground: Ground
    saturation: Saturation
    contrast: ContrastFloor
    /** Second hue for duotone/split/triad. Derived from the scheme when absent. */
    counterHue?: number
    /**
     * Explicit values that override what the engine would derive.
     *
     * NOT a loophole — the opposite. A design system computes by default and lets a
     * human overrule where they made a deliberate call, and that is exactly what
     * the Studio's direct-manipulation gestures write. Every pin is still validated
     * for contrast; a pin that fails the declared floor is repaired, not honoured.
     */
    pins?: Partial<Record<PaletteRole, string>>
  }

  type: {
    heading: FontId
    body: FontId
    accentFace?: FontId
    scale: Scale
    /** Body measure in ch. The strongest single readability lever we have. */
    measure: number
    leading: Leading
    headingCase: HeadingCase
    headingTracking: Tracking
    figures: Figures
    opticalSizing: boolean
    /** Weight pins. The shipped templates chose these by hand; see presets.ts. */
    headingWeights?: number[]
    bodyWeights?: number[]
    /** Base font size in px. Clamped 15..19 by the renderer either way. */
    basePx?: number
    /** Explicit heading/section-title weights, when the register's default is wrong. */
    headingWeight?: number
    sectionTitleWeight?: number
    sectionTitleSizeRem?: number
    sectionTitleAlign?: 'left' | 'center' | 'right'
    /** Section-title colour, when it is deliberately not the body text colour. */
    sectionTitleColor?: string
  }

  space: {
    ratio: Ratio
    density: Density
    lanes: Lanes
    rule: RuleWeight
    /** Content max-width in px. Derived from density when absent. */
    maxWidthPx?: number
  }

  feed: {
    rhythm: FeedLayout
    mode: FeedMode
    columns: Columns
    lead: Lead
    numbering: boolean
  }

  ornament: {
    dropCap: DropCap
    quoteMark: QuoteMark
    grain: 0 | 1 | 2
    divider: Divider
    corner: Corner
    underline: Underline
    /** Corner radius in px. Derived from `corner` when absent. */
    radiusPx?: number
    radiusLgPx?: number
  }

  motion: {
    entrance: Entrance
    hover: Hover
    transition: Transition
    intensity: 0 | 1 | 2
  }

  imagery: {
    treatment: Treatment
    fit: 'cover' | 'contain'
  }

  chrome: {
    policy: ChromePolicy
    header: HeaderArchetype
    footer: FooterArchetype
    sticky: boolean
  }

  /** Hard ceilings. The compiler enforces them by DROPPING LAYERS, not by wishing. */
  budget: { faces: number; cssKb: number; js: 0 }

  /**
   * Button styling, when the brand has one worth keeping.
   *
   * Carried verbatim rather than derived: `scrape/tokens.ts` detects a real CTA off
   * the source site, and a brand's button is one of the few things a business owner
   * recognises instantly. Values are re-validated by the compiler.
   */
  button?: {
    bg?: string
    text?: string
    radiusPx?: number
    weight?: number
    textTransform?: 'uppercase' | 'none' | 'capitalize' | 'lowercase'
    paddingY?: string
    paddingX?: string
    border?: string
    shadow?: string
  }

  /** Prose details tokens already carry; kept so a genome round-trips a template. */
  prose?: {
    bodyLineHeight?: number
    paragraphSpacingRem?: number
    blockquoteStyle?: 'italic' | 'normal'
    blockquoteBorderColor?: string
    headingLineHeight?: number
  }
}

/**
 * Sizes the compiler can know FOR CERTAIN.
 *
 * No gzip figure and no font-byte figure: gzip belongs to whoever is holding a
 * zlib (the perf gate does it), and real font weight can only be measured from the
 * actual files. This project does not print numbers no file produced, so the
 * compiler reports the two things it can count — stylesheet characters, and how
 * many faces it asked the browser to fetch.
 */
export type CompiledBytes = { css: number; faces: number }

export type Compiled = {
  /** The projection every existing consumer already understands. */
  tokens: DesignTokens
  /**
   * The ADDITIONAL stylesheet — only what tokens cannot carry (lanes, ornament,
   * motion, numbering, type features).
   *
   * For a genome that re-expresses a shipped template this is EMPTY BY
   * CONSTRUCTION, which is how W0 proves zero visual regression: the renderer
   * receives exactly the bytes it receives today.
   */
  css: string
  fonts: { family: string; href: string; preload: boolean; stack: string }[]
  /** What the budget cut, and why. Surfaced in the Studio, never silent. */
  dropped: { layer: string; reason: string }[]
  /** What cohesion repaired on the way in. Surfaced in the eval, never silent. */
  repairs: { rule: string; why: string }[]
  energy: number
  bytes: CompiledBytes
  compilerVersion: string
}
