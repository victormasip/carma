// "Look & Feel" style presets — the Framer-style simplification of the Theme
// Studio. One click changes the whole personality of the blog.
//
// Each preset is a partial DesignTokens patch over the CURRENT tokens. The
// cardinal rule (same as feedLayouts.ts): a preset NEVER touches the captured
// brand — colors and font families always stay from the clone/capture. Presets
// only steer the *feel* tokens: radii, heading weight, reading rhythm, link &
// blockquote style, and the feed layout pairing.
//
// `original` is the escape hatch: it clears every feel override (sets them
// back to the renderer defaults / captured values) so the blog returns to the
// untouched clone.
//
// Client-safe module (type-only imports) — shared by the dashboard picker and
// anything server-side that wants to resolve a preset.

import type { DesignTokens } from '@/lib/scrape/tokens'

export type StylePresetId = 'original' | 'minimal' | 'modern' | 'bold'

export type StylePreset = {
  id: StylePresetId
  name: string
  tagline: string
  /** Feel-token patch. `undefined` values clear an override back to defaults. */
  patch: Partial<DesignTokens>
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'original',
    name: 'Predeterminat',
    tagline: 'Net i equilibrat, amb la teva marca de sempre.',
    patch: {
      radius: '10px',
      radiusLg: '16px',
      headingWeight: undefined,
      bodyLineHeight: undefined,
      paragraphSpacing: undefined,
      linkUnderline: undefined,
      blockquoteStyle: undefined,
      feedLayout: 'standard',
    },
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    tagline: 'Sobri i airejat: poc ornament, molt espai en blanc.',
    patch: {
      radius: '4px',
      radiusLg: '8px',
      headingWeight: '600',
      bodyLineHeight: '1.85',
      paragraphSpacing: '1.75rem',
      linkUnderline: 'hover',
      blockquoteStyle: 'normal',
      feedLayout: 'minimal',
    },
  },
  {
    id: 'modern',
    name: 'Modern',
    tagline: 'Targetes nítides, cantonades suaus, ritme còmode.',
    patch: {
      radius: '12px',
      radiusLg: '20px',
      headingWeight: '700',
      bodyLineHeight: '1.75',
      paragraphSpacing: '1.5rem',
      linkUnderline: 'always',
      blockquoteStyle: 'italic',
      feedLayout: 'magazine',
    },
  },
  {
    id: 'bold',
    name: 'Contundent',
    tagline: 'Titulars pesants, targetes grans, presència màxima.',
    patch: {
      radius: '14px',
      radiusLg: '24px',
      headingWeight: '800',
      bodyLineHeight: '1.65',
      paragraphSpacing: '1.35rem',
      linkUnderline: 'none',
      blockquoteStyle: 'italic',
      feedLayout: 'gridxl',
    },
  },
]

export function getStylePreset(id: string | null | undefined): StylePreset | undefined {
  return STYLE_PRESETS.find(p => p.id === id)
}
