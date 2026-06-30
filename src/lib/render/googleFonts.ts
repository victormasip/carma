// Curated Google Fonts catalog for the Carma Studio typography picker.
//
// A full Google Fonts API integration needs an API key + a network round-trip on
// every keystroke. For a premium, instant, offline-friendly picker we ship a
// hand-picked list of the ~70 best web fonts (the ones real brands actually use),
// each with a sane fallback stack and a category for grouping/search. Picking one
// sets the font token AND adds its CSS URL to the theme's font_links, which the
// public render already loads (src/lib/render/theme.ts → collectFontHrefs).

export type FontCategory = 'sans' | 'serif' | 'display' | 'mono' | 'handwriting'

export type GoogleFont = {
  /** Exact Google Fonts family name (used in the CSS2 url + the font-family). */
  family: string
  category: FontCategory
}

const FALLBACK: Record<FontCategory, string> = {
  sans: 'system-ui, sans-serif',
  serif: 'Georgia, serif',
  display: 'system-ui, sans-serif',
  mono: 'ui-monospace, monospace',
  handwriting: 'cursive',
}

// Weights we request per family — covers body (400/500) + headings (600/700/800)
// without over-fetching. Google serves only the weights a family actually has.
const WEIGHTS = '400;500;600;700;800'

export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans
  { family: 'Inter', category: 'sans' },
  { family: 'Roboto', category: 'sans' },
  { family: 'Open Sans', category: 'sans' },
  { family: 'Montserrat', category: 'sans' },
  { family: 'Poppins', category: 'sans' },
  { family: 'Lato', category: 'sans' },
  { family: 'Work Sans', category: 'sans' },
  { family: 'Nunito', category: 'sans' },
  { family: 'Nunito Sans', category: 'sans' },
  { family: 'Manrope', category: 'sans' },
  { family: 'DM Sans', category: 'sans' },
  { family: 'Source Sans 3', category: 'sans' },
  { family: 'Rubik', category: 'sans' },
  { family: 'Mulish', category: 'sans' },
  { family: 'Karla', category: 'sans' },
  { family: 'Figtree', category: 'sans' },
  { family: 'Plus Jakarta Sans', category: 'sans' },
  { family: 'Outfit', category: 'sans' },
  { family: 'Albert Sans', category: 'sans' },
  { family: 'Be Vietnam Pro', category: 'sans' },
  { family: 'Onest', category: 'sans' },
  { family: 'Geist', category: 'sans' },
  { family: 'Hanken Grotesk', category: 'sans' },
  { family: 'Sora', category: 'sans' },
  { family: 'Epilogue', category: 'sans' },
  { family: 'Lexend', category: 'sans' },
  { family: 'PT Sans', category: 'sans' },
  { family: 'Assistant', category: 'sans' },
  { family: 'Barlow', category: 'sans' },
  { family: 'Cabin', category: 'sans' },
  // Serif
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Merriweather', category: 'serif' },
  { family: 'Lora', category: 'serif' },
  { family: 'PT Serif', category: 'serif' },
  { family: 'Source Serif 4', category: 'serif' },
  { family: 'Libre Baskerville', category: 'serif' },
  { family: 'Crimson Pro', category: 'serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  { family: 'EB Garamond', category: 'serif' },
  { family: 'Bitter', category: 'serif' },
  { family: 'Spectral', category: 'serif' },
  { family: 'Noto Serif', category: 'serif' },
  { family: 'Frank Ruhl Libre', category: 'serif' },
  { family: 'Fraunces', category: 'serif' },
  { family: 'Newsreader', category: 'serif' },
  { family: 'DM Serif Display', category: 'serif' },
  { family: 'Zilla Slab', category: 'serif' },
  // Display
  { family: 'Space Grotesk', category: 'display' },
  { family: 'Bebas Neue', category: 'display' },
  { family: 'Archivo', category: 'display' },
  { family: 'Archivo Black', category: 'display' },
  { family: 'Anton', category: 'display' },
  { family: 'Oswald', category: 'display' },
  { family: 'Syne', category: 'display' },
  { family: 'Clash Display', category: 'display' },
  { family: 'Unbounded', category: 'display' },
  { family: 'Righteous', category: 'display' },
  { family: 'Fredoka', category: 'display' },
  { family: 'Chivo', category: 'display' },
  // Mono
  { family: 'JetBrains Mono', category: 'mono' },
  { family: 'Space Mono', category: 'mono' },
  { family: 'IBM Plex Mono', category: 'mono' },
  { family: 'Roboto Mono', category: 'mono' },
  { family: 'Fira Code', category: 'mono' },
  // Handwriting
  { family: 'Caveat', category: 'handwriting' },
  { family: 'Dancing Script', category: 'handwriting' },
  { family: 'Pacifico', category: 'handwriting' },
]

const BY_FAMILY = new Map(GOOGLE_FONTS.map((f) => [f.family.toLowerCase(), f]))

/** The CSS `font-family` value for a picked Google font (quoted + fallback). */
export function fontStack(font: GoogleFont): string {
  return `"${font.family}", ${FALLBACK[font.category]}`
}

/** The Google Fonts CSS2 stylesheet URL for one family (the render loads this). */
export function googleFontCssUrl(family: string): string {
  const name = family.trim().replace(/\s+/g, '+')
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${WEIGHTS}&display=swap`
}

/** Pull the primary family name out of a font-family stack ("Inter", … → Inter). */
export function primaryFamily(stack: string | undefined | null): string {
  const first = (stack ?? '').split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? ''
  return first
}

/** Look up a catalog font by the primary family of a stack (case-insensitive). */
export function findGoogleFont(stack: string | undefined | null): GoogleFont | undefined {
  return BY_FAMILY.get(primaryFamily(stack).toLowerCase())
}

/** Filter the catalog by a free-text query (matches family + category). */
export function searchFonts(query: string): GoogleFont[] {
  const q = query.trim().toLowerCase()
  if (!q) return GOOGLE_FONTS
  return GOOGLE_FONTS.filter((f) => f.family.toLowerCase().includes(q) || f.category.includes(q))
}
