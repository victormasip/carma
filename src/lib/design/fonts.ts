// The art director's typeface catalogue.
//
// A genome carries a FontId, never a family string. That is what keeps the type
// axis inside the "no free strings" rule from genome.ts, and it is also what lets
// the director reason about type: an id resolves to a CLASSIFICATION (category,
// contrast, whether it has an optical-size axis, whether it has oldstyle figures),
// and the cohesion rules are written against the classification, not the name.
//
// Relationship to `render/googleFonts.ts`: that file is the Studio's PICKER — ~70
// families with a fallback stack, tuned for a human browsing a dropdown. This file
// is the GENERATOR's catalogue: fewer families, more metadata per family, and every
// stack here matches byte-for-byte what the shipped templates already emit, so a
// preset genome reproduces its template's `fontHeading` / `fontBody` exactly.

export type FontCategory = 'sans' | 'geometric' | 'grotesk' | 'serif' | 'display-serif' | 'slab' | 'mono'

export type FontDef = {
  /** Exact Google Fonts family name. */
  family: string
  /** The full CSS stack, including fallbacks. Matches templates.ts verbatim. */
  stack: string
  category: FontCategory
  /** Weights the family actually serves, in the order we request them. */
  weights: number[]
  /** Variable optical-size axis range, when the family has one. */
  opsz?: [number, number]
  /** Supports `font-variant-numeric: oldstyle-nums` in a way worth switching on. */
  oldstyle?: boolean
  /** Stroke-contrast read. Drives cohesion: a high-contrast display serif at small
   *  sizes in a dense feed is a legibility bug, not a style. */
  contrast: 'low' | 'medium' | 'high'
  /**
   * How LOUD this face is, 0..2. Feeds the energy budget in cohesion.ts.
   * A neutral grotesk is 0; a high-contrast display serif or a heavy display is 2.
   */
  energy: 0 | 1 | 2
  /**
   * Fallback metric overrides (`size-adjust`, `ascent-override`, …) that make the
   * swap invisible and kill the CLS that preloading alone leaves behind.
   *
   * DELIBERATELY EMPTY. Real values must be MEASURED from the actual font files;
   * inventing them would ship a worse layout shift than shipping none, and this
   * project has a standing rule against printing a figure no file produced. The
   * measuring step is a build script in a later wave — see the plan, §10.
   */
  fallbackAdjust?: { sizeAdjust: string; ascent: string; descent: string; lineGap: string }
}

export const FONTS = {
  // ── Sans / grotesk ─────────────────────────────────────────────────────────
  inter: {
    family: 'Inter', stack: "'Inter', system-ui, sans-serif",
    category: 'sans', weights: [400, 500, 600, 700], contrast: 'low', energy: 0,
  },
  interTight: {
    family: 'Inter Tight', stack: "'Inter Tight', system-ui, sans-serif",
    category: 'sans', weights: [400, 500, 600, 700, 800], contrast: 'low', energy: 0,
  },
  plusJakarta: {
    family: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans', system-ui, sans-serif",
    category: 'sans', weights: [400, 500, 600, 700, 800], contrast: 'low', energy: 1,
  },
  dmSans: {
    family: 'DM Sans', stack: "'DM Sans', system-ui, sans-serif",
    category: 'geometric', weights: [400, 500, 700], contrast: 'low', energy: 0,
  },
  manrope: {
    family: 'Manrope', stack: "'Manrope', system-ui, sans-serif",
    category: 'sans', weights: [400, 500, 600, 700, 800], contrast: 'low', energy: 0,
  },
  workSans: {
    family: 'Work Sans', stack: "'Work Sans', system-ui, sans-serif",
    category: 'sans', weights: [400, 500, 600, 700], contrast: 'low', energy: 0,
  },
  jost: {
    family: 'Jost', stack: "'Jost', system-ui, sans-serif",
    category: 'geometric', weights: [300, 400, 500, 600], contrast: 'low', energy: 1,
  },
  spaceGrotesk: {
    family: 'Space Grotesk', stack: "'Space Grotesk', system-ui, sans-serif",
    category: 'grotesk', weights: [500, 600, 700], contrast: 'low', energy: 1,
  },
  archivo: {
    family: 'Archivo', stack: "'Archivo', system-ui, sans-serif",
    category: 'grotesk', weights: [500, 600, 700, 800, 900], contrast: 'low', energy: 2,
  },
  outfit: {
    family: 'Outfit', stack: "'Outfit', system-ui, sans-serif",
    category: 'geometric', weights: [400, 500, 600, 700, 800], contrast: 'low', energy: 1,
  },
  figtree: {
    family: 'Figtree', stack: "'Figtree', system-ui, sans-serif",
    category: 'sans', weights: [400, 500, 600, 700, 800], contrast: 'low', energy: 0,
  },
  sora: {
    family: 'Sora', stack: "'Sora', system-ui, sans-serif",
    category: 'grotesk', weights: [400, 500, 600, 700, 800], contrast: 'low', energy: 1,
  },

  // ── Serif ──────────────────────────────────────────────────────────────────
  newsreader: {
    family: 'Newsreader', stack: "'Newsreader', Georgia, serif",
    category: 'serif', weights: [400, 500, 600], opsz: [6, 72],
    oldstyle: true, contrast: 'medium', energy: 1,
  },
  sourceSerif: {
    family: 'Source Serif 4', stack: "'Source Serif 4', Georgia, serif",
    category: 'serif', weights: [400, 500, 600, 700], opsz: [8, 60],
    oldstyle: true, contrast: 'medium', energy: 1,
  },
  loraSerif: {
    family: 'Lora', stack: "'Lora', Georgia, serif",
    category: 'serif', weights: [400, 500, 600, 700], oldstyle: true, contrast: 'medium', energy: 1,
  },
  ptSerif: {
    family: 'PT Serif', stack: "'PT Serif', Georgia, serif",
    category: 'serif', weights: [400, 700], contrast: 'medium', energy: 0,
  },
  libreBaskerville: {
    family: 'Libre Baskerville', stack: "'Libre Baskerville', Georgia, serif",
    category: 'serif', weights: [400, 700], oldstyle: true, contrast: 'high', energy: 1,
  },
  // W4 PREP — `serif/high` was the catalogue's only ONE-FACE cell, which meant every
  // classic brand classified there got a forced choice no amount of anti-repetition
  // could vary. It is a genuinely thin category on the open web (high stroke contrast
  // is a DISPLAY property — at text sizes the thin strokes disappear, which is the
  // same fact the `display-serif-needs-air` cohesion rule already encodes), so it is
  // deepened deliberately rather than padded.
  eczar: {
    family: 'Eczar', stack: "'Eczar', Georgia, serif",
    category: 'serif', weights: [400, 500, 600, 700, 800], oldstyle: true, contrast: 'high', energy: 1,
  },
  lusitana: {
    family: 'Lusitana', stack: "'Lusitana', Georgia, serif",
    category: 'serif', weights: [400, 700], oldstyle: true, contrast: 'high', energy: 1,
  },
  ebGaramond: {
    family: 'EB Garamond', stack: "'EB Garamond', Garamond, Georgia, serif",
    category: 'serif', weights: [400, 500, 600, 700, 800], oldstyle: true, contrast: 'medium', energy: 1,
  },
  literata: {
    family: 'Literata', stack: "'Literata', Georgia, serif",
    category: 'serif', weights: [400, 500, 600, 700], oldstyle: true, contrast: 'medium', energy: 1,
  },

  // ── Display serif ──────────────────────────────────────────────────────────
  fraunces: {
    family: 'Fraunces', stack: "'Fraunces', Georgia, 'Times New Roman', serif",
    category: 'display-serif', weights: [500, 600, 700], opsz: [9, 144],
    oldstyle: true, contrast: 'high', energy: 2,
  },
  cormorant: {
    family: 'Cormorant Garamond', stack: "'Cormorant Garamond', Georgia, serif",
    category: 'display-serif', weights: [400, 500, 600],
    oldstyle: true, contrast: 'high', energy: 2,
  },
  playfair: {
    family: 'Playfair Display', stack: "'Playfair Display', Georgia, serif",
    category: 'display-serif', weights: [400, 500, 600, 700, 800], opsz: [5, 1200],
    oldstyle: true, contrast: 'high', energy: 2,
  },
  instrumentSerif: {
    family: 'Instrument Serif', stack: "'Instrument Serif', Georgia, serif",
    category: 'display-serif', weights: [400], contrast: 'high', energy: 2,
  },
  bodoniModa: {
    family: 'Bodoni Moda', stack: "'Bodoni Moda', Didot, Georgia, serif",
    category: 'display-serif', weights: [400, 500, 600, 700, 800, 900],
    oldstyle: true, contrast: 'high', energy: 2,
  },

  // ── Mono ───────────────────────────────────────────────────────────────────
  jetbrainsMono: {
    family: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, monospace",
    category: 'mono', weights: [400, 500, 700], contrast: 'low', energy: 1,
  },
  ibmPlexMono: {
    family: 'IBM Plex Mono', stack: "'IBM Plex Mono', ui-monospace, monospace",
    category: 'mono', weights: [400, 500, 600], contrast: 'low', energy: 1,
  },
} as const satisfies Record<string, FontDef>

export type FontId = keyof typeof FONTS

export const FONT_IDS = Object.keys(FONTS) as FontId[]

export function isFontId(v: unknown): v is FontId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FONTS, v)
}

export function font(id: FontId): FontDef {
  return FONTS[id] as FontDef
}

/** The FontId whose stack is exactly `stack`, if any. Used to round-trip templates. */
export function fontIdForStack(stack: string): FontId | null {
  const needle = stack.trim()
  for (const id of FONT_IDS) if (font(id).stack === needle) return id
  return null
}

/**
 * The Google Fonts CSS2 URL for a family at a set of weights.
 *
 * Two shapes, and the difference is not cosmetic: a family with an optical-size
 * axis must request `opsz,wght@<min>..<max>,<w>` or the browser gets a static
 * instance and `font-optical-sizing: auto` silently does nothing.
 */
export function fontHref(id: FontId, weights: number[]): string {
  const f = font(id)
  const fam = f.family.replace(/ /g, '+')
  const ws = [...new Set(weights)].sort((a, b) => a - b)
  if (f.opsz) {
    const [lo, hi] = f.opsz
    const spec = ws.map(w => `${lo}..${hi},${w}`).join(';')
    return `https://fonts.googleapis.com/css2?family=${fam}:opsz,wght@${spec}&display=swap`
  }
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${ws.join(';')}&display=swap`
}

/** Weights this family can actually serve, from a wish-list. Never invents one. */
export function clampWeights(id: FontId, wanted: number[]): number[] {
  const have = font(id).weights
  const out = new Set<number>()
  for (const w of wanted) {
    let best = have[0]
    for (const h of have) if (Math.abs(h - w) < Math.abs(best - w)) best = h
    out.add(best)
  }
  return [...out].sort((a, b) => a - b)
}
