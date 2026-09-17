// WHICH feature did the owner just name? — pure, import-safe, no framework.
//
// Split out of apply.ts so it can be unit-tested in plain node: apply.ts imports
// `next/cache` for the revalidation, and that does not resolve outside a Next
// build. This half has no dependency but the registry.
//
// Deliberately a LOOKUP, not a model call. "Activa els comentaris" has exactly
// one correct answer every single time, and a name the catalogue does not know
// must fail loudly rather than turn into the nearest-sounding feature — the
// failure mode where "pagament" switches on a paywall.

import { MODULES } from './registry'

/**
 * Fold a phrase to bare words.
 *
 * THE APOSTROPHE BECOMES A SPACE, and that is the whole trick. Catalan elides
 * constantly — "l'índex", "m'agrada", "barra d'anuncis" — so deleting the
 * apostrophe glues two words into one ("lindex") and nothing matches, while
 * keeping it breaks the word boundary instead. Turning it into a space gives
 * "l index" and "m agrada", which behave like the two words they are.
 */
function norm(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Does `hay` contain `needle` as whole words?
 *
 * ALWAYS whole words, never a substring. The first version substring-matched
 * anything longer than six characters, and the test suite immediately found what
 * that costs: "m'agradaria escriure sobre bicicletes" switched on the Likes
 * module, because the module is called "M'agrada" and "magrada" sits inside
 * "magradaria". A message about bicycles must not change the blog.
 */
function saysIt(hay: string, needle: string): boolean {
  const n = norm(needle)
  if (!n) return false
  const pattern = n.split(' ').map(escapeRe).join('\\s+')
  return new RegExp(`(^|\\s)${pattern}($|\\s)`).test(hay)
}

/**
 * Every module the owner just named, by its catalogue name, its id, or any of the
 * words people actually use for it.
 */
export function matchModules(text: string): { id: string; name: string }[] {
  const hay = norm(text)
  if (!hay) return []

  const hits: { id: string; name: string }[] = []
  for (const def of MODULES) {
    const names = [def.name, def.id, ...(EXTRA_NAMES[def.id] ?? [])]
    if (names.some(n => saysIt(hay, n))) hits.push({ id: def.id, name: def.name })
  }
  return hits
}

/**
 * The words people actually use, per module. Catalan first, then es/en.
 *
 * Kept generous but never GENERIC: every entry here has to be a phrase that can
 * only mean this feature. "barra" alone would match half the messages about a
 * bar; "barra d'anuncis" can only be the announcement bar.
 */
const EXTRA_NAMES: Record<string, string[]> = {
  search: ['cercador', 'cerca', 'buscador', 'busqueda', 'search'],
  categoryFilters: ['filtres', 'filtres per tema', 'categories', 'filtros', 'filters'],
  featuredHero: ['destacat', 'destacats', 'destacado', 'featured', 'portada del blog'],
  relatedPosts: ['relacionats', 'articles relacionats', 'relacionados', 'related'],
  prevNext: ['anterior i seguent', 'anterior y siguiente', 'prev next'],
  socialShare: ['compartir', 'xarxes', 'xarxes socials', 'redes', 'share'],
  backToTop: ['tornar a dalt', 'volver arriba', 'back to top'],
  readingProgress: ['progres de lectura', 'temps de lectura', 'progreso', 'reading time'],
  tableOfContents: ['index', 'taula de continguts', 'indice', 'toc', 'table of contents'],
  authorCard: ['fitxa autor', 'fitxa de l autor', 'firma', 'byline', 'author card'],
  newsletter: ['newsletter', 'butlleti', 'boletin', 'subscripcio', 'suscripcion'],
  paywall: ['mur de pagament', 'paywall', 'muro de pago', 'contingut premium'],
  announcementBar: ['barra d anuncis', 'anuncis', 'anuncio', 'announcement bar'],
  darkModeToggle: ['mode fosc', 'modo oscuro', 'dark mode'],
  keyTakeaways: ['punts clau', 'puntos clave', 'takeaways'],
  pullQuote: ['cites', 'cites destacades', 'cita destacada', 'frase destacada', 'pull quote'],
  readNext: ['continua llegint', 'sigue leyendo', 'read next'],
  whatsappShare: ['whatsapp'],
  likes: ['aplaudiments', 'likes', 'me gusta'],
  comments: ['comentaris', 'comentarios', 'comments', 'la conversa'],
}
