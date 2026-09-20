// THE COMPILER — genome in, CSS out, deterministically.
//
// This is the "studio" half of the architecture. The art director chooses; this
// holds the pen. Same genome in, same bytes out, every time, on every machine —
// which is what makes the output cacheable, golden-file testable, diffable in a
// code review, and safe to put in front of a browser.
//
// TWO OUTPUTS, AND THE SPLIT IS THE WHOLE MIGRATION STRATEGY
// ─────────────────────────────────────────────────────────
//   · `tokens`  the DesignTokens projection. Every existing consumer — theme.ts,
//               feedLayouts.ts, embedParams.ts, the Studio — already speaks this,
//               so a genome drops into the running renderer with no change to it.
//   · `css`     the ADDITIONAL layer: only what tokens cannot carry (article lanes,
//               drop caps, quote marks, grain, motion, numbering, type features).
//
// The consequence is the W0 acceptance property, and it is a strong one:
//
//   A genome that re-expresses a shipped template compiles to EXACTLY that
//   template's tokens and to an EMPTY extra stylesheet.
//
// Which means: zero visual regression, by construction, not by inspection. The
// renderer receives the same bytes it receives today. Nothing to eyeball.
//
// NOTHING HERE TOUCHES THE NETWORK, THE CLOCK, OR A MODEL. It is a pure function,
// so the render path can call it inline without a cache and without a fallback.

import type { DesignTokens } from '@/lib/scrape/tokens'
import {
  type Compiled, type Genome, type Density, type Register,
} from '@/lib/design/genome'
import { clampWeights, font, fontHref, type FontId } from '@/lib/design/fonts'
import { derivePalette, repairPins } from '@/lib/design/color'
import { applyCohesion, energyOf, REGISTER_RULES } from '@/lib/design/cohesion'

export const COMPILER_VERSION = 'genome-1.0.0'

// ─── Derivations ─────────────────────────────────────────────────────────────
//
// Every value below is DERIVED when the genome does not pin it. The pins are not
// an escape hatch from the system; they are how a human decision survives a
// regeneration. Where a shipped template pins something, that is a record of a
// designer having deliberately overruled the maths — worth keeping, worth seeing.

const BASE_PX: Record<Density, number> = { compact: 16, comfortable: 17, generous: 18, vast: 18 }
const MAX_WIDTH: Record<Density, number> = { compact: 1240, comfortable: 1180, generous: 1160, vast: 1100 }

/** Corner radius, in px, before any pin. `cut` shares square's geometry and adds
 *  its clipped corner in the extra layer. */
const RADIUS: Record<Genome['ornament']['corner'], [number, number]> = {
  square: [0, 0], soft: [12, 20], pill: [24, 36], cut: [0, 0],
}

/**
 * The section title's size, from the type scale.
 *
 * `1.95 × ratio` is a fitted constant, not a law: it reproduces the range our own
 * designers converged on by hand (2.4rem–3.2rem across eight templates) from the
 * scale alone. Where a template's hand value disagrees, it pins — and the W0 gate
 * counts how often, which is a genuinely interesting number about how systematic
 * our own design work already was.
 */
function sectionTitleRem(scale: number): number {
  return Math.round(1.95 * scale * 100) / 100
}

/** The heading weight a register reaches for, from what the face can serve. */
function deriveHeadingWeight(id: FontId, register: Register): number {
  const have = font(id).weights
  const ceiling = register === 'bold' || register === 'contemporary' ? 900 : 700
  const usable = have.filter(w => w <= ceiling)
  return (usable.length ? usable : have)[Math.max(0, (usable.length ? usable : have).length - 1)]
}

const UNDERLINE_TOKEN: Record<Genome['ornament']['underline'], DesignTokens['linkUnderline']> = {
  none: 'none', hover: 'hover', 'hover-grow': 'hover', 'always-thin': 'always', offset: 'hover',
}

const LEADING_VALUE: Record<Genome['type']['leading'], number | null> = {
  // `normal` means "whatever the renderer already does" (1.75 in theme.ts), and
  // emitting nothing is how a genome says that. The other two are real overrides.
  tight: 1.6, normal: null, airy: 1.85,
}

const TRACKING_EM: Record<Genome['type']['headingTracking'], string | null> = {
  tight: '-0.025em', normal: null, loose: '0.06em',
}

// ─── Token projection ────────────────────────────────────────────────────────

function project(g: Genome, opts: { enforcePins: boolean }): {
  tokens: DesignTokens
  paletteReports: { role: string; ratio: number; need: number }[]
  paletteRepairs: string[]
} {
  const base = derivePalette({
    seed: g.palette.seed,
    scheme: g.palette.scheme,
    ground: g.palette.ground,
    saturation: g.palette.saturation,
    contrast: g.palette.contrast,
    counterHue: g.palette.counterHue,
  })
  const { palette, repaired, reported } = repairPins(base, g.palette.pins, g.palette.contrast, opts.enforcePins)

  const basePx = g.type.basePx ?? BASE_PX[g.space.density]
  const maxWidthPx = g.space.maxWidthPx ?? MAX_WIDTH[g.space.density]
  const [r, rl] = RADIUS[g.ornament.corner]
  const radius = g.ornament.radiusPx ?? r
  const radiusLg = g.ornament.radiusLgPx ?? rl
  const headingWeight = g.type.headingWeight ?? deriveHeadingWeight(g.type.heading, g.register)
  const sectionTitleWeight = g.type.sectionTitleWeight ?? headingWeight
  const sectionTitleSize = g.type.sectionTitleSizeRem ?? sectionTitleRem(g.type.scale)

  const tokens: DesignTokens = {
    colorPrimary: palette.primary,
    colorAccent: palette.accent,
    colorBg: palette.bg,
    colorSurface: palette.surface,
    colorText: palette.text,
    colorMuted: palette.muted,
    colorBorder: palette.border,
    fontHeading: font(g.type.heading).stack,
    fontBody: font(g.type.body).stack,
    baseFontSize: `${basePx}px`,
    radius: `${radius}px`,
    radiusLg: `${radiusLg}px`,
    maxWidth: `${maxWidthPx}px`,
    layout: g.feed.mode,
    columns: g.feed.columns,
    feedLayout: g.feed.rhythm,
    sectionTitleColor: g.type.sectionTitleColor ?? palette.text,
    sectionTitleSize: `${sectionTitleSize}rem`,
    sectionTitleWeight: String(sectionTitleWeight),
    sectionTitleAlign: g.type.sectionTitleAlign ?? 'left',
    headingWeight: String(headingWeight),
    linkColor: palette.link,
    linkUnderline: UNDERLINE_TOKEN[g.ornament.underline],
  }

  // Optional keys are emitted ONLY when the genome actually asks for them. A token
  // object with a key set to its own default is not the same object as one without
  // the key — the renderer branches on presence in several places, and the W0 gate
  // compares key sets exactly.
  if (g.prose?.blockquoteStyle) tokens.blockquoteStyle = g.prose.blockquoteStyle
  if (g.prose?.blockquoteBorderColor) tokens.blockquoteBorderColor = g.prose.blockquoteBorderColor
  if (g.prose?.bodyLineHeight !== undefined) tokens.bodyLineHeight = String(g.prose.bodyLineHeight)
  else {
    const lead = LEADING_VALUE[g.type.leading]
    if (lead !== null) tokens.bodyLineHeight = String(lead)
  }
  if (g.prose?.paragraphSpacingRem !== undefined) tokens.paragraphSpacing = `${g.prose.paragraphSpacingRem}rem`
  if (g.prose?.headingLineHeight !== undefined) tokens.headingLineHeight = String(g.prose.headingLineHeight)

  if (g.button) {
    const b = g.button
    if (b.bg) tokens.buttonBg = b.bg
    if (b.text) tokens.buttonText = b.text
    if (b.radiusPx !== undefined) tokens.buttonRadius = `${b.radiusPx}px`
    if (b.weight !== undefined) tokens.buttonWeight = String(b.weight)
    if (b.textTransform) tokens.buttonTextTransform = b.textTransform
    if (b.paddingY) tokens.buttonPaddingY = b.paddingY
    if (b.paddingX) tokens.buttonPaddingX = b.paddingX
    if (b.border) tokens.buttonBorder = b.border
    if (b.shadow) tokens.buttonShadow = b.shadow
  }

  return { tokens, paletteReports: reported, paletteRepairs: repaired }
}

// ─── The extra stylesheet ────────────────────────────────────────────────────
//
// Each block is a named LAYER so the budget can shed it by name and report what it
// took. Every selector targets the markup `theme.ts` already emits — the genome
// never generates HTML for the blog body.

type Layer = { name: string; css: string }

function typeLayers(g: Genome): Layer[] {
  const out: Layer[] = []
  if (g.type.opticalSizing && font(g.type.heading).opsz) {
    out.push({
      name: 'type.opticalSizing',
      css: '.carma-root h1,.carma-root h2,.carma-root h3,.carma-article-title,.carma-card-title{font-optical-sizing:auto}',
    })
  }
  if (g.type.figures === 'oldstyle' && font(g.type.body).oldstyle) {
    out.push({
      name: 'type.figures',
      css: '.carma-article-content,.carma-meta,.carma-article-meta{font-variant-numeric:oldstyle-nums proportional-nums}',
    })
  }
  const track = TRACKING_EM[g.type.headingTracking]
  const caseRule = g.type.headingCase === 'upper' ? 'text-transform:uppercase;'
    : g.type.headingCase === 'title' ? 'text-transform:capitalize;' : ''
  if (track || caseRule) {
    out.push({
      name: 'type.headingStyle',
      css: `.carma-article-title,.carma-card-title,.carma-section-title{${caseRule}${track ? `letter-spacing:${track};` : ''}}`,
    })
  }
  // NOTE, deliberately not emitted in W0: `text-wrap: pretty` on body paragraphs.
  // `theme.ts` already balances titles and prettifies the lede, but not prose. It
  // belongs in the renderer's own baseline rather than in a genome layer — putting
  // it here would mean every genome carries it, including the eight that must
  // compile to an empty stylesheet to prove zero regression. Filed as a renderer
  // change, not a design axis.
  return out
}

function spaceLayers(g: Genome): Layer[] {
  if (g.space.lanes === 'single') return []
  const wide = g.space.lanes === 'content-wide-full' ? '9rem' : '6rem'
  const full = g.space.lanes === 'content-wide-full'
  // THE BLEED GRID. One rule, and an article stops being a centred column: figures
  // and pull-quotes can break out to `wide` (and `full`) while the prose keeps its
  // measure. It is the single most recognisable move in editorial layout.
  return [{
    name: 'space.lanes',
    css: `.carma-article-content{display:grid;grid-template-columns:[full-start] minmax(1rem,1fr) [wide-start] minmax(0,${wide}) [content-start] min(${g.type.measure}ch,100% - 2rem) [content-end] minmax(0,${wide}) [wide-end] minmax(1rem,1fr) [full-end];max-inline-size:none!important}
.carma-article-content>*{grid-column:content}
.carma-article-content>[data-lane="wide"],.carma-article-content>figure.carma-figure{grid-column:wide}${full ? `
.carma-article-content>[data-lane="full"]{grid-column:full}` : ''}`,
  }]
}

function ornamentLayers(g: Genome): Layer[] {
  const out: Layer[] = []
  if (g.ornament.dropCap !== 'none') {
    const n = g.ornament.dropCap === 'sunken' ? 3 : 2
    out.push({
      name: 'ornament.dropCap',
      css: `.carma-article-content>p:first-of-type::first-letter{-webkit-initial-letter:${n};initial-letter:${n};margin-right:.08em;font-weight:${g.ornament.dropCap === 'sunken' ? 600 : 700};color:var(--ct-accent)}`,
    })
  }
  if (g.ornament.quoteMark === 'oversize') {
    out.push({
      name: 'ornament.quoteMark',
      css: '.carma-article-content blockquote{position:relative;padding-left:2.4rem!important;border-left:0!important}.carma-article-content blockquote::before{content:"\\201C";position:absolute;left:0;top:-.15em;font-size:3.2em;line-height:1;color:var(--ct-accent);opacity:.35}',
    })
  } else if (g.ornament.quoteMark === 'rule') {
    out.push({ name: 'ornament.quoteMark', css: '' })
  }
  if (g.ornament.grain > 0) {
    const a = g.ornament.grain === 2 ? 0.045 : 0.025
    // Grain as a repeating gradient rather than a noise PNG: no extra request, no
    // decode, and it survives the byte budget.
    out.push({
      name: 'ornament.grain',
      css: `.carma-root::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:1;opacity:${a};background-image:repeating-conic-gradient(currentColor 0% 25%,transparent 0% 50%);background-size:3px 3px}`,
    })
  }
  if (g.ornament.divider === 'mark') {
    out.push({
      name: 'ornament.divider',
      css: '.carma-article-content hr{border:0!important;width:auto!important;text-align:center;overflow:visible}.carma-article-content hr::after{content:"\\2042";display:block;color:var(--ct-muted);font-size:1.2rem;line-height:1}',
    })
  } else if (g.ornament.divider === 'gradient') {
    out.push({
      name: 'ornament.divider',
      css: '.carma-article-content hr{border:0!important;height:2px!important;width:100%!important;background:linear-gradient(90deg,transparent,var(--ct-accent),transparent)}',
    })
  }
  if (g.ornament.corner === 'cut') {
    out.push({
      name: 'ornament.corner',
      css: '.carma-card{clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)}',
    })
  }
  if (g.ornament.underline === 'offset') {
    out.push({
      name: 'ornament.underline',
      css: '.carma-article-content a{text-underline-offset:.28em!important;text-decoration-thickness:1px!important}',
    })
  } else if (g.ornament.underline === 'hover-grow') {
    out.push({
      name: 'ornament.underline',
      css: '.carma-article-content a{text-decoration-thickness:1px!important;transition:text-decoration-thickness .15s ease}.carma-article-content a:hover{text-decoration-thickness:2px!important}',
    })
  }
  return out.filter(l => l.css)
}

function feedLayers(g: Genome): Layer[] {
  const out: Layer[] = []
  if (g.feed.numbering) {
    out.push({
      name: 'feed.numbering',
      css: '.carma-grid{counter-reset:carma-item}.carma-card{counter-increment:carma-item}.carma-card-body::before{content:counter(carma-item,decimal-leading-zero);display:block;font-size:.72rem;font-weight:700;letter-spacing:.12em;color:var(--ct-muted)}',
    })
  }
  if (g.feed.lead === 'first' && g.feed.mode === 'grid') {
    out.push({
      name: 'feed.lead',
      css: '@media (min-width:1024px){.carma-grid>.carma-card:first-child{grid-column:1/-1}.carma-grid>.carma-card:first-child .carma-card-link{flex-direction:row;align-items:center;gap:2rem}.carma-grid>.carma-card:first-child .carma-card-media{width:55%;aspect-ratio:16/9}.carma-grid>.carma-card:first-child .carma-card-title{font-size:2rem}}',
    })
  }
  return out
}

function motionLayers(g: Genome): Layer[] {
  const out: Layer[] = []
  const hover: Record<Genome['motion']['hover'], string> = {
    none: '',
    lift: '',
    zoom: '.carma-card-media img{transition:transform .5s cubic-bezier(.2,.6,.3,1)}.carma-card:hover .carma-card-media img{transform:scale(1.04)}',
    tint: '.carma-card-media{position:relative}.carma-card-media::after{content:"";position:absolute;inset:0;background:var(--ct-accent);opacity:0;transition:opacity .3s ease;mix-blend-mode:multiply}.carma-card:hover .carma-card-media::after{opacity:.18}',
    shift: '.carma-card-title{transition:transform .25s cubic-bezier(.2,.6,.3,1)}.carma-card:hover .carma-card-title{transform:translateX(.3rem)}',
  }
  const entrance: Record<Genome['motion']['entrance'], string> = {
    none: '', fade: '', // `fade` is the renderer's own baseline — nothing to add.
    rise: '@keyframes carma-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}.carma-card,.carma-article-content>h2{animation:carma-rise linear both;animation-timeline:view();animation-range:entry 0% cover 22%}',
    mask: '@keyframes carma-mask{from{opacity:0;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}.carma-card,.carma-article-content>figure{animation:carma-mask linear both;animation-timeline:view();animation-range:entry 0% cover 28%}',
    stagger: '@keyframes carma-rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}.carma-card{animation:carma-rise linear both;animation-timeline:view();animation-range:entry 0% cover 30%}.carma-card:nth-child(2n){animation-range:entry 0% cover 40%}.carma-card:nth-child(3n){animation-range:entry 0% cover 50%}',
  }
  const body = [entrance[g.motion.entrance], hover[g.motion.hover]].filter(Boolean).join('')
  if (body) {
    // EVERY motion rule lives behind the reduced-motion guard. Two project scars
    // are encoded here: the global reduced-motion kill rule means brand motion
    // needs its own guard rather than relying on inheritance, and an
    // `animation: … !important` on an element destroys a scroll timeline declared
    // on that same element — so nothing in this file emits `animation` with
    // `!important`.
    out.push({ name: 'motion', css: `@media (prefers-reduced-motion:no-preference){${body}}` })
  }
  if (g.motion.transition !== 'none') {
    const shared = g.motion.transition === 'shared-image'
      ? '.carma-article-image-wrap img{view-transition-name:carma-lead}' : ''
    out.push({
      name: 'motion.transition',
      css: `@view-transition{navigation:auto}${shared}`,
    })
  }
  return out
}

function imageryLayers(g: Genome): Layer[] {
  const f: Record<Genome['imagery']['treatment'], string> = {
    none: '',
    grayscale: 'filter:grayscale(1);transition:filter .4s ease',
    warm: 'filter:sepia(.18) saturate(1.08)',
    grain: 'filter:contrast(1.04) saturate(.94)',
    duotone: 'filter:grayscale(1) contrast(1.1)',
  }
  const out: Layer[] = []
  if (f[g.imagery.treatment]) {
    const hoverOff = g.imagery.treatment === 'grayscale'
      ? '.carma-card:hover .carma-card-media img{filter:grayscale(0)}' : ''
    out.push({
      name: 'imagery.treatment',
      css: `.carma-card-media img,.carma-article-image-wrap img{${f[g.imagery.treatment]}}${hoverOff}`,
    })
  }
  if (g.imagery.fit === 'contain') {
    out.push({ name: 'imagery.fit', css: '.carma-card-media img{object-fit:contain}' })
  }
  return out
}

// ─── Fonts ───────────────────────────────────────────────────────────────────

function fontPlan(g: Genome): { family: string; href: string; preload: boolean; stack: string; faces: number }[] {
  const wanted: { id: FontId; weights: number[]; preload: boolean }[] = []
  const headingWeight = g.type.headingWeight ?? deriveHeadingWeight(g.type.heading, g.register)
  const sectionWeight = g.type.sectionTitleWeight ?? headingWeight
  wanted.push({
    id: g.type.heading,
    weights: g.type.headingWeights ?? clampWeights(g.type.heading, [400, 500, 600, headingWeight, sectionWeight]),
    preload: true,
  })
  wanted.push({
    id: g.type.body,
    weights: g.type.bodyWeights ?? clampWeights(g.type.body, [400, 500, 600]),
    preload: true,
  })
  if (g.type.accentFace) {
    wanted.push({ id: g.type.accentFace, weights: clampWeights(g.type.accentFace, [500, 700]), preload: false })
  }

  // One request per FAMILY. A single-family design (Carma is one) must not ask the
  // browser for the same family twice with different weight subsets.
  const byFamily = new Map<string, { id: FontId; weights: Set<number>; preload: boolean }>()
  for (const w of wanted) {
    const fam = font(w.id).family
    const cur = byFamily.get(fam)
    if (cur) { for (const n of w.weights) cur.weights.add(n); cur.preload ||= w.preload }
    else byFamily.set(fam, { id: w.id, weights: new Set(w.weights), preload: w.preload })
  }
  return [...byFamily.values()].map(e => {
    const weights = [...e.weights].sort((a, b) => a - b)
    return {
      family: font(e.id).family,
      href: fontHref(e.id, weights),
      preload: e.preload,
      stack: font(e.id).stack,
      faces: weights.length,
    }
  })
}

// ─── The pass ────────────────────────────────────────────────────────────────

export type CompileOptions = {
  /**
   * Repair pinned colours that miss the declared contrast floor.
   *
   * True for anything generated (the pins are a customer's own brand colours and
   * we are not reproducing their illegible grey-on-grey). False for presets, whose
   * pins re-express a look already live on customer blogs — there a failure is
   * REPORTED so it can be fixed deliberately, never patched behind our backs.
   */
  enforcePins?: boolean
  /** Skip cohesion. Only the W0 gate uses this, to prove presets need no repair. */
  skipCohesion?: boolean
}

export function compileGenome(input: Genome, opts: CompileOptions = {}): Compiled {
  const enforcePins = opts.enforcePins ?? (input.origin.source !== 'preset')
  const { genome: g, repairs } = opts.skipCohesion
    ? { genome: input, repairs: [] as { rule: string; why: string }[] }
    : applyCohesion(input)

  const { tokens, paletteReports, paletteRepairs } = project(g, { enforcePins })
  for (const role of paletteRepairs) {
    repairs.push({ rule: `contrast:${role}`, why: `${role} did not clear the ${g.palette.contrast} floor against the page ground` })
  }
  for (const r of paletteReports) {
    repairs.push({ rule: `contrast:reported:${r.role}`, why: `${r.role} sits at ${r.ratio}:1 against the ground, below the ${r.need}:1 floor — pinned, so left alone` })
  }

  const dropped: Compiled['dropped'] = []
  let trimmed: Genome = g
  let fonts = fontPlan(trimmed)
  const count = () => fonts.reduce((a, f) => a + f.faces, 0)

  // FACE BUDGET. Fonts are the measured cause of this product's LCP problem, so
  // this is the budget that matters most, and it is enforced in a published order:
  // the accent face has no structural job, body weights past regular and semibold
  // are convenience, and the heading only truly needs the weights it actually sets.
  const headingWeight = trimmed.type.headingWeight ?? deriveHeadingWeight(trimmed.type.heading, trimmed.register)
  const sectionWeight = trimmed.type.sectionTitleWeight ?? headingWeight
  const trims: { label: string; apply: (x: Genome) => Genome | null }[] = [
    {
      label: 'type.accentFace',
      apply: x => (x.type.accentFace ? { ...x, type: { ...x.type, accentFace: undefined } } : null),
    },
    {
      label: 'type.bodyWeights',
      apply: x => {
        const want = clampWeights(x.type.body, [400, 600])
        const have = x.type.bodyWeights ?? clampWeights(x.type.body, [400, 500, 600])
        return have.length > want.length ? { ...x, type: { ...x.type, bodyWeights: want } } : null
      },
    },
    {
      label: 'type.headingWeights',
      apply: x => {
        const want = clampWeights(x.type.heading, [...new Set([headingWeight, sectionWeight])])
        const have = x.type.headingWeights
          ?? clampWeights(x.type.heading, [400, 500, 600, headingWeight, sectionWeight])
        return have.length > want.length ? { ...x, type: { ...x.type, headingWeights: want } } : null
      },
    },
  ]
  for (const t of trims) {
    if (count() <= g.budget.faces) break
    const next = t.apply(trimmed)
    if (!next) continue
    trimmed = next
    fonts = fontPlan(trimmed)
    dropped.push({ layer: t.label, reason: `over the ${g.budget.faces}-face budget` })
  }
  const faces = count()

  // Layers, in cascade order. Ordering is not cosmetic: structure before texture
  // before motion, so a later layer can rely on an earlier one having run.
  const layers: Layer[] = [
    ...typeLayers(g), ...spaceLayers(g), ...ornamentLayers(g),
    ...feedLayers(g), ...motionLayers(g), ...imageryLayers(g),
  ].filter(l => l.css.trim())

  // Byte budget. Shed from the END of the list — the cheapest signal is always
  // last by construction of the order above — and say what was taken.
  const limit = g.budget.cssKb * 1024
  const size = (ls: Layer[]) => ls.reduce((a, l) => a + l.css.length + 1, 0)
  while (size(layers) > limit && layers.length) {
    const gone = layers.pop()!
    dropped.push({ layer: gone.name, reason: `extra stylesheet over ${g.budget.cssKb}KB` })
  }

  const css = layers.map(l => l.css).join('\n')

  return {
    tokens,
    css,
    fonts: fonts.map(({ family, href, preload, stack }) => ({ family, href, preload, stack })),
    dropped,
    repairs,
    energy: energyOf(g),
    bytes: { css: css.length, faces },
    compilerVersion: COMPILER_VERSION,
  }
}

/** The register's one-line brief. Shown in the Studio; given to the art director. */
export function registerBrief(r: Register): string {
  return REGISTER_RULES[r].brief
}
