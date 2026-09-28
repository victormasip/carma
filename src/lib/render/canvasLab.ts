// W7 — the canvas lab: one design, one fixture article, two renderings.
//
// `/lab/canvas` (404 unless CARMA_LAB=1) puts the REAL editor on the canvas for a
// design; `test:editor-fidelity` renders the SAME design and the same article
// through the published article page, and compares the two in Chrome. Both sides
// build their theme and post here, so they cannot disagree about the input.

import { validateGenome } from '@/lib/design/validate'
import { compileGenome } from '@/lib/design/compile'
import { PRESET_GENOMES } from '@/lib/design/presets'
import { DEFAULT_TOKENS } from '@/lib/scrape/tokens'
import { buildCanvasSpec, type CanvasSpec } from '@/lib/render/canvas'
import type { buildArticlePage } from '@/lib/render/theme'
import { isLocale, type Locale } from '@/lib/i18n/config'
import type { Genome } from '@/lib/design/genome'

type Theme = Parameters<typeof buildArticlePage>[0]
type Post = Parameters<typeof buildArticlePage>[3]

const FIGURE_SRC = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#8aa"/><circle cx="800" cy="450" r="300" fill="#244"/></svg>')}`

/**
 * Every block and mark the editor can produce, in the markup its extensions parse.
 * The first paragraph carries the drop cap; the ligature words exercise `fi`/`fl`.
 */
export const LAB_FIXTURE_HTML = [
  '<p>Un paràgraf amb <strong>negreta</strong>, <em>cursiva</em>, <u>subratllat</u>, <s>barrat</s>, <code>codi</code> i un <a href="https://example.com">enllaç</a>. Paraules amb lligadures: office, fluent, affine.</p>',
  '<h2>Un encapçalament de secció</h2>',
  '<p>Un segon paràgraf, perquè el primer és el que rep la caplletra i aquest no.</p>',
  '<h3>Un subtítol</h3>',
  '<ul><li><p>Primer punt</p></li><li><p>Segon punt, una mica més llarg per veure com trenca la línia quan no hi cap.</p></li></ul>',
  '<ol><li><p>Primer pas</p></li><li><p>Segon pas</p></li></ol>',
  '<blockquote><p>Una cita que el Genome vesteix a la seva manera.</p></blockquote>',
  '<pre><code>const blog = "el mateix que llegiran"</code></pre>',
  '<hr>',
  `<figure class="carma-figure"><img src="${FIGURE_SRC}" alt="Figura de prova"><figcaption>Peu de figura</figcaption></figure>`,
  '<div class="carma-callout" data-variant="info"><p>Una targeta destacada.</p></div>',
  '<div class="carma-button-wrap" data-align="left"><a class="carma-button" href="https://example.com">Reserva</a></div>',
  '<div class="carma-columns"><div class="carma-column"><p>Columna A</p></div><div class="carma-column"><p>Columna B</p></div></div>',
  '<details class="carma-toggle"><summary class="carma-toggle-summary">Desplegable</summary><p>Contingut del desplegable</p></details>',
  '<p>Un paràgraf final per tancar l’article.</p>',
].join('')

export const LAB_TITLE = 'Títol de l’article de prova'

/** A design → the theme the render resolves for it (tokens, faces, Genome CSS). */
export function labTheme(genome: Genome, locale: Locale): Theme {
  const compiled = compileGenome(genome)
  return {
    design_tokens: { ...DEFAULT_TOKENS, ...compiled.tokens },
    font_links: compiled.fonts.map(f => f.href),
    genome_css: compiled.css,
    default_locale: locale,
  } as Theme
}

export function labPost(html: string, locale: Locale): Post {
  return {
    id: 'lab', title: LAB_TITLE, slug: 'lab', content: { html }, excerpt: null, featured_image: null,
    categories: [], tags: [], author_name: null, created_at: '2026-09-28T00:00:00.000Z', is_published: true,
    default_locale: locale,
  } as Post
}

/** `?g=` (a base64url genome) or `?preset=` (a shipped look), and `?l=`. */
export function labDesign(q: { g?: string | null; preset?: string | null; l?: string | null }): { genome: Genome; locale: Locale } {
  const locale: Locale = isLocale(q.l) ? q.l : 'ca'
  if (q.g) {
    try { return { genome: validateGenome(JSON.parse(Buffer.from(q.g, 'base64url').toString('utf8'))).genome as Genome, locale } } catch { /* fall through */ }
  }
  return { genome: (PRESET_GENOMES.find(p => p.id === q.preset) ?? PRESET_GENOMES[0]) as Genome, locale }
}

export function labCanvasSpec(genome: Genome, locale: Locale): CanvasSpec {
  return buildCanvasSpec(labTheme(genome, locale), 'lab', labPost(LAB_FIXTURE_HTML, locale), locale)
}
