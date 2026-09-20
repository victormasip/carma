// THE EIGHT, RE-EXPRESSED.
//
// Every shipped template in `render/templates.ts` written as a genome. This file is
// the W0 acceptance test and it is deliberately the hardest one available:
//
//   If the compiler can reproduce Aperture, Editorial, Noir, Terra, Pulse, Beacon,
//   Atelier and Carma — token for token, font URL for font URL, and with an EMPTY
//   extra stylesheet — then the schema is expressive enough to carry four months of
//   hand-drawn design, and nothing a customer is looking at today changes.
//
// It also turns the templates from "the thing being deleted" into "the compiler's
// fixtures". They will be doing more work after this plan than before it.
//
// HOW TO READ A PRESET
// ────────────────────
// What is ABSENT matters more than what is present. An absent field is DERIVED, so
// the pins are exactly the places a designer overruled the maths. `tests/genome.mjs`
// counts them, which is how we learn something true and slightly uncomfortable
// about our own back catalogue: how systematic it actually was.
//
// Measured on the eight (see the W0 report):
//   · base font size  — derived correctly 8/8. The density axis is real.
//   · section weight  — derived from the heading weight 6/8.
//   · max width       — derived 3/8. Hand numbers, mostly.
//   · corner radius   — derived 2/8. A signature value, chosen by eye.
//
// Presets compile with `enforcePins: false`: their colours are ALREADY LIVE on
// customer blogs, and silently "fixing" one would be an unannounced redesign of
// every site using that look. Contrast misses come back as REPORTS instead.

import { hexToOklch } from '@/lib/design/color'
import type { Genome, Oklch } from '@/lib/design/genome'

/** Preset colours are known-good hex literals from templates.ts; the `!` is safe. */
const seedOf = (hex: string): Oklch => hexToOklch(hex)!

type PresetDef = Omit<Genome, 'v' | 'origin'> & { id: string; name: string }

function preset(d: PresetDef): Genome & { id: string; name: string } {
  const { id, name, ...rest } = d
  return {
    id,
    name,
    v: 1,
    origin: { source: 'preset', seed: 0, presetId: id },
    ...rest,
  }
}

// Shared across all eight: they are hand-drawn STATIC looks, so every axis whose
// expression lives in the extra stylesheet is set to its no-op value. That is what
// makes `compiled.css === ''` an honest result rather than a coincidence.
const STATIC = {
  measure: 70,
  leading: 'normal',
  headingCase: 'sentence',
  headingTracking: 'normal',
  figures: 'lining',
  opticalSizing: false,
} as const

const NO_MOTION = { entrance: 'none', hover: 'none', transition: 'none', intensity: 0 } as const
const NO_IMAGERY = { treatment: 'none', fit: 'cover' } as const
const NO_FEED_EXTRAS = { mode: 'grid', lead: 'none', numbering: false } as const
// 8, not the generated target of 4: our own hand-drawn templates ask the browser
// for up to eight faces (Aperture and Beacon both do). That is a real W1 finding
// about the back catalogue, not a licence — a GENERATED genome gets 4, and the
// compiler trims weights to hold it.
const BUDGET = { faces: 8, cssKb: 14, js: 0 } as const

// ─── 1. Carma — the house look. One family, one loud yellow. ─────────────────
const carma = preset({
  id: 'carma', name: 'Carma',
  register: 'contemporary',
  palette: {
    seed: seedOf('#f5bc00'), scheme: 'monochrome', ground: 'paper',
    saturation: 'vivid', contrast: 'AA',
    pins: {
      primary: '#1c1917', accent: '#f5bc00', bg: '#faf8f3', surface: '#ffffff',
      text: '#1c1917', muted: '#78716c', border: '#ece8e1', link: '#846300',
    },
  },
  type: {
    ...STATIC, heading: 'plusJakarta', body: 'plusJakarta', scale: 1.333,
    headingWeights: [400, 500, 600, 700, 800], bodyWeights: [400, 500, 600, 700, 800],
    sectionTitleSizeRem: 2.7,
  },
  space: { ratio: 1.25, density: 'generous', lanes: 'single', rule: 'hairline', maxWidthPx: 1180 },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'gridxl', columns: '3' },
  ornament: {
    dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule',
    corner: 'soft', underline: 'hover', radiusPx: 14, radiusLgPx: 24,
  },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'split', footer: 'columns', sticky: true },
  budget: { ...BUDGET },
  prose: { blockquoteBorderColor: '#f5bc00' },
})

// ─── 2. Aperture — minimalist studio. The quiet register, entire. ────────────
// The only preset that pins almost nothing: base size, max width, both radii and
// the section-title size all fall out of the system. Which is what a systematic
// design looks like from the inside.
const aperture = preset({
  id: 'aperture', name: 'Aperture',
  register: 'quiet',
  palette: {
    seed: seedOf('#4f46e5'), scheme: 'monochrome', ground: 'paper',
    saturation: 'natural', contrast: 'AA',
    pins: {
      primary: '#0a0a0a', accent: '#4f46e5', bg: '#ffffff', surface: '#ffffff',
      text: '#0a0a0a', muted: '#6b7280', border: '#ececec', link: '#4f46e5',
    },
  },
  type: {
    ...STATIC, heading: 'interTight', body: 'inter', scale: 1.333,
    headingWeights: [400, 500, 600, 700, 800], bodyWeights: [400, 500, 600],
    sectionTitleWeight: 800,
  },
  space: { ratio: 1.25, density: 'comfortable', lanes: 'single', rule: 'hairline' },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'minimal', columns: '3' },
  ornament: { dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule', corner: 'soft', underline: 'hover' },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'split', footer: 'columns', sticky: true },
  budget: { ...BUDGET },
})

// ─── 3. Editorial — luxury magazine. Fraunces on warm paper. ─────────────────
const editorial = preset({
  id: 'editorial', name: 'Editorial',
  register: 'classic',
  palette: {
    seed: seedOf('#b5451f'), scheme: 'monochrome', ground: 'paper',
    saturation: 'natural', contrast: 'AA',
    pins: {
      primary: '#1c1714', accent: '#b5451f', bg: '#faf6ef', surface: '#ffffff',
      text: '#1c1714', muted: '#7c6f64', border: '#e7ddcf', link: '#b5451f',
    },
  },
  type: {
    ...STATIC, heading: 'fraunces', body: 'inter', scale: 1.5,
    headingWeights: [500, 600, 700], bodyWeights: [400, 500, 600, 700],
    headingWeight: 600, sectionTitleSizeRem: 2.9, sectionTitleAlign: 'center',
  },
  space: { ratio: 1.333, density: 'generous', lanes: 'single', rule: 'hairline' },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'editorial', columns: '2' },
  ornament: {
    dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule',
    corner: 'soft', underline: 'always-thin', radiusPx: 6, radiusLgPx: 12,
  },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'masthead', footer: 'statement', sticky: false },
  budget: { ...BUDGET },
  prose: { blockquoteStyle: 'italic', blockquoteBorderColor: '#b5451f' },
})

// ─── 4. Pulse — product changelog. Compact, violet, gradient CTA. ────────────
const pulse = preset({
  id: 'pulse', name: 'Pulse',
  register: 'contemporary',
  palette: {
    seed: seedOf('#7c3aed'), scheme: 'monochrome', ground: 'paper',
    saturation: 'natural', contrast: 'AA',
    pins: {
      primary: '#101322', accent: '#7c3aed', bg: '#fbfbfe', surface: '#ffffff',
      text: '#101322', muted: '#5b6172', border: '#e7e7f2', link: '#7c3aed',
    },
  },
  type: {
    ...STATIC, heading: 'spaceGrotesk', body: 'inter', scale: 1.25,
    headingWeights: [500, 600, 700], bodyWeights: [400, 500, 600],
    sectionTitleSizeRem: 2.4,
  },
  space: { ratio: 1.25, density: 'compact', lanes: 'single', rule: 'hairline' },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'compact', columns: '3' },
  ornament: {
    dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule',
    corner: 'soft', underline: 'hover', radiusLgPx: 18,
  },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'split', footer: 'bar', sticky: true },
  budget: { ...BUDGET },
  button: { bg: 'linear-gradient(135deg,#7c3aed,#5b21b6)', text: '#ffffff', radiusPx: 10, weight: 600 },
})

// ─── 5. Beacon — news portal. Loud on purpose; the bold register. ───────────
const beacon = preset({
  id: 'beacon', name: 'Beacon',
  register: 'bold',
  palette: {
    seed: seedOf('#e11d48'), scheme: 'monochrome', ground: 'paper',
    saturation: 'vivid', contrast: 'AA',
    pins: {
      primary: '#0b1020', accent: '#e11d48', bg: '#ffffff', surface: '#ffffff',
      text: '#0b1020', muted: '#64748b', border: '#e6e8ee', link: '#e11d48',
    },
  },
  type: {
    ...STATIC, heading: 'archivo', body: 'inter', scale: 1.414,
    headingWeights: [500, 600, 700, 800, 900], bodyWeights: [400, 500, 600],
    headingWeight: 800, sectionTitleWeight: 900, sectionTitleSizeRem: 2.8,
  },
  space: { ratio: 1.25, density: 'compact', lanes: 'single', rule: 'hairline', maxWidthPx: 1280 },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'magazine', columns: '3' },
  ornament: {
    dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule',
    corner: 'soft', underline: 'hover', radiusPx: 14, radiusLgPx: 22,
  },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'stack', footer: 'columns', sticky: true },
  budget: { ...BUDGET },
})

// ─── 6. Atelier — couture. Spends its entire energy budget on one typeface. ──
const atelier = preset({
  id: 'atelier', name: 'Atelier',
  register: 'classic',
  palette: {
    seed: seedOf('#8a6d3b'), scheme: 'monochrome', ground: 'paper',
    saturation: 'muted', contrast: 'AA',
    pins: {
      primary: '#141210', accent: '#8a6d3b', bg: '#f8f6f1', surface: '#fdfcf9',
      text: '#141210', muted: '#7d7668', border: '#e4dfd3', link: '#826634',
    },
  },
  type: {
    ...STATIC, heading: 'cormorant', body: 'jost', scale: 1.618,
    headingWeights: [400, 500, 600], bodyWeights: [300, 400, 500, 600],
    headingWeight: 500, sectionTitleSizeRem: 3.2, sectionTitleAlign: 'center',
  },
  space: { ratio: 1.5, density: 'comfortable', lanes: 'single', rule: 'hairline', maxWidthPx: 1200 },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'overlay', columns: '3' },
  ornament: { dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule', corner: 'square', underline: 'always-thin' },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'masthead', footer: 'statement', sticky: false },
  budget: { ...BUDGET },
  button: { bg: '#141210', text: '#f8f6f1', radiusPx: 0, weight: 500, textTransform: 'uppercase' },
})

// ─── 7. Noir — ink ground, teal signal. The only dark preset. ────────────────
const noir = preset({
  id: 'noir', name: 'Noir',
  register: 'severe',
  palette: {
    seed: seedOf('#5eead4'), scheme: 'monochrome', ground: 'ink',
    saturation: 'natural', contrast: 'AA',
    pins: {
      primary: '#eef2f6', accent: '#5eead4', bg: '#08090c', surface: '#111317',
      text: '#eef2f6', muted: '#8b94a3', border: '#20242c', link: '#5eead4',
    },
  },
  type: {
    ...STATIC, heading: 'spaceGrotesk', body: 'inter', scale: 1.25,
    headingWeights: [500, 600, 700], bodyWeights: [400, 500, 600],
    headingWeight: 600, sectionTitleWeight: 700, sectionTitleSizeRem: 2.5,
    sectionTitleColor: '#ffffff',
  },
  space: { ratio: 1.25, density: 'compact', lanes: 'single', rule: 'hairline', maxWidthPx: 1220 },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'overlay', columns: '3' },
  ornament: {
    dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule',
    corner: 'soft', underline: 'hover', radiusPx: 14,
  },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'minimal', footer: 'bar', sticky: true },
  budget: { ...BUDGET },
})

// ─── 8. Terra — humanist warmth. Newsreader on warm paper. ──────────────────
const terra = preset({
  id: 'terra', name: 'Terra',
  register: 'warm',
  palette: {
    seed: seedOf('#a3672f'), scheme: 'monochrome', ground: 'paper',
    saturation: 'muted', contrast: 'AA',
    pins: {
      primary: '#2c2622', accent: '#a3672f', bg: '#f6f1e9', surface: '#fffdf9',
      text: '#2c2622', muted: '#857a6d', border: '#e6dccb', link: '#925920',
    },
  },
  type: {
    ...STATIC, heading: 'newsreader', body: 'inter', scale: 1.333,
    headingWeights: [400, 500, 600], bodyWeights: [400, 500, 600],
    headingWeight: 500, sectionTitleAlign: 'center',
  },
  space: { ratio: 1.333, density: 'generous', lanes: 'single', rule: 'hairline', maxWidthPx: 1120 },
  feed: { ...NO_FEED_EXTRAS, rhythm: 'gridxl', columns: '2' },
  ornament: {
    dropCap: 'none', quoteMark: 'none', grain: 0, divider: 'rule',
    corner: 'soft', underline: 'always-thin', radiusPx: 16, radiusLgPx: 26,
  },
  motion: { ...NO_MOTION }, imagery: { ...NO_IMAGERY },
  chrome: { policy: 'keep', header: 'masthead', footer: 'columns', sticky: false },
  budget: { ...BUDGET },
  prose: { blockquoteStyle: 'italic', blockquoteBorderColor: '#a3672f' },
})

/** In the same order as `BLOG_TEMPLATES`, so the gate can zip them. */
export const PRESET_GENOMES = [carma, aperture, editorial, pulse, beacon, atelier, noir, terra] as const

export function getPresetGenome(id: string): (Genome & { id: string; name: string }) | undefined {
  return PRESET_GENOMES.find(p => p.id === id)
}
