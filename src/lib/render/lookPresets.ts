// "Look & Feel" presets — the unified Theme picker that REPLACES the previously
// separate "Blog Style" (estil) and "Blog Layout" (disposició) controls. One
// click sets a complete look: the structural feed layout AND the matching feel
// tokens (radii, heading weight, reading rhythm, link/blockquote style).
//
// As with feedLayouts.ts / stylePresets.ts, a look NEVER touches the captured
// brand — colours and font families always stay from the clone. The active look
// is identified by `tokens.feedLayout` (each look owns a unique layout id), so we
// need no extra marker token.
//
// Client-safe module (type-only import): shared by the dashboard picker and any
// server code that wants to resolve a look.

import type { DesignTokens, FeedLayout } from '@/lib/scrape/tokens'

export type GlyphKind = 'standard' | 'editorial' | 'magazine' | 'minimal' | 'gridxl' | 'overlay' | 'compact'

export type LookPreset = {
  /** Also the active-state key (matches tokens.feedLayout). */
  id: FeedLayout
  name: string
  tagline: string
  glyph: GlyphKind
  /** Feel + layout patch over the CURRENT tokens. `undefined` clears an override
   *  back to the renderer default / captured value. */
  patch: Partial<DesignTokens>
}

export const LOOK_PRESETS: readonly LookPreset[] = [
  {
    id: 'standard', name: 'Predeterminat', glyph: 'standard',
    tagline: 'El clon tal qual: net, equilibrat i amb la teva marca de sempre.',
    patch: {
      feedLayout: 'standard', radius: '10px', radiusLg: '16px',
      headingWeight: undefined, bodyLineHeight: undefined, paragraphSpacing: undefined,
      linkUnderline: undefined, blockquoteStyle: undefined,
    },
  },
  {
    id: 'editorial', name: 'Editorial', glyph: 'editorial',
    tagline: 'Files amples i airejades amb línies separadores. Lectura pausada i elegant.',
    patch: {
      feedLayout: 'editorial', radius: '8px', radiusLg: '14px',
      headingWeight: '700', bodyLineHeight: '1.8', paragraphSpacing: '1.7rem',
      linkUnderline: 'hover', blockquoteStyle: 'normal',
    },
  },
  {
    id: 'magazine', name: 'Magazine', glyph: 'magazine',
    tagline: 'Graella densa de 3 columnes amb targetes nítides. Dinàmic i ple de contingut.',
    patch: {
      feedLayout: 'magazine', radius: '12px', radiusLg: '18px',
      headingWeight: '700', bodyLineHeight: '1.7', paragraphSpacing: '1.5rem',
      linkUnderline: 'always', blockquoteStyle: 'italic',
    },
  },
  {
    id: 'minimal', name: 'Minimal', glyph: 'minimal',
    tagline: 'Llista neta sense marcs, amb molt aire. Sobri i directe.',
    patch: {
      feedLayout: 'minimal', radius: '4px', radiusLg: '8px',
      headingWeight: '600', bodyLineHeight: '1.85', paragraphSpacing: '1.75rem',
      linkUnderline: 'hover', blockquoteStyle: 'normal',
    },
  },
  {
    id: 'gridxl', name: 'Grid XL', glyph: 'gridxl',
    tagline: 'Dues targetes grans per fila amb imatges generoses i ombra profunda. Impactant.',
    patch: {
      feedLayout: 'gridxl', radius: '14px', radiusLg: '24px',
      headingWeight: '800', bodyLineHeight: '1.65', paragraphSpacing: '1.4rem',
      linkUnderline: 'none', blockquoteStyle: 'italic',
    },
  },
  {
    id: 'overlay', name: 'Overlay', glyph: 'overlay',
    tagline: 'El text se superposa sobre la imatge amb un degradat. Cinematogràfic i modern.',
    patch: {
      feedLayout: 'overlay', radius: '14px', radiusLg: '20px',
      headingWeight: '700', bodyLineHeight: '1.7', paragraphSpacing: '1.5rem',
      linkUnderline: 'none', blockquoteStyle: 'italic',
    },
  },
  {
    id: 'compact', name: 'Compacte', glyph: 'compact',
    tagline: 'Quatre targetes per fila, ràpides d’escanejar. Ideal per a molts articles.',
    patch: {
      feedLayout: 'compact', radius: '8px', radiusLg: '12px',
      headingWeight: '700', bodyLineHeight: '1.6', paragraphSpacing: '1.4rem',
      linkUnderline: 'hover', blockquoteStyle: 'normal',
    },
  },
]
