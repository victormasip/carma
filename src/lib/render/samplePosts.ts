// Demo articles injected ONLY into preview renders (`/render/<id>?preview=1`)
// when a site has no published posts yet — so the onboarding / theme-selection
// grid shows a full, beautiful feed instead of a bare "no articles" empty state.
//
// These are NEVER served on the public render (which carries no `?preview`
// flag), so real visitors never see placeholder content. Shape matches the post
// rows `buildListingPage`/`buildListingFragment` consume (same fields the
// template-preview route already uses successfully).

import { uiLocale, type Locale, type UiLocale } from '@/lib/i18n/config'

type Sample = { title: string; excerpt: string; cat: string; seed: string }

// Placeholder copy exists only in the UI languages; a French/Italian/… preview
// site borrows the closest one (uiLocale) — these are demo cards, never served
// to real visitors.
const SAMPLES: Record<UiLocale, Sample[]> = {
  ca: [
    { title: 'Com construir una marca que perduri en el temps', excerpt: 'Una guia pràctica sobre identitat, to de veu i consistència visual a cada punt de contacte.', cat: 'Estratègia', seed: 'carma-a' },
    { title: 'Les tendències de disseny editorial per al 2026', excerpt: 'El que ve en tipografia, color i composició per a publicacions digitals modernes.', cat: 'Disseny', seed: 'carma-b' },
    { title: 'Escriure per a humans i per a cercadors alhora', excerpt: 'SEO modern sense sacrificar la veu de la teva marca ni la qualitat editorial.', cat: 'Contingut', seed: 'carma-c' },
    { title: 'L’art de la portada: imatges que conviden a llegir', excerpt: 'Com triar i tractar la fotografia destacada perquè cada article respiri.', cat: 'Fotografia', seed: 'carma-d' },
    { title: 'Newsletter: convertir lectors en una comunitat', excerpt: 'Estratègies provades per fer créixer i fidelitzar la teva audiència.', cat: 'Creixement', seed: 'carma-e' },
    { title: 'Un sistema de color que funciona a tot arreu', excerpt: 'Paletes accessibles, coherents i fàcils de mantenir en mode clar i fosc.', cat: 'Disseny', seed: 'carma-f' },
  ],
  es: [
    { title: 'Cómo construir una marca que perdure en el tiempo', excerpt: 'Una guía práctica sobre identidad, tono de voz y consistencia visual en cada punto de contacto.', cat: 'Estrategia', seed: 'carma-a' },
    { title: 'Las tendencias de diseño editorial para 2026', excerpt: 'Lo que viene en tipografía, color y composición para publicaciones digitales modernas.', cat: 'Diseño', seed: 'carma-b' },
    { title: 'Escribir para personas y buscadores a la vez', excerpt: 'SEO moderno sin sacrificar la voz de tu marca ni la calidad editorial.', cat: 'Contenido', seed: 'carma-c' },
    { title: 'El arte de la portada: imágenes que invitan a leer', excerpt: 'Cómo elegir y tratar la fotografía destacada para que cada artículo respire.', cat: 'Fotografía', seed: 'carma-d' },
    { title: 'Newsletter: convertir lectores en una comunidad', excerpt: 'Estrategias probadas para hacer crecer y fidelizar a tu audiencia.', cat: 'Crecimiento', seed: 'carma-e' },
    { title: 'Un sistema de color que funciona en todas partes', excerpt: 'Paletas accesibles, coherentes y fáciles de mantener en modo claro y oscuro.', cat: 'Diseño', seed: 'carma-f' },
  ],
  en: [
    { title: 'How to build a brand that lasts', excerpt: 'A practical guide to identity, tone of voice and visual consistency at every touchpoint.', cat: 'Strategy', seed: 'carma-a' },
    { title: 'Editorial design trends for 2026', excerpt: 'What’s next in typography, color and composition for modern digital publications.', cat: 'Design', seed: 'carma-b' },
    { title: 'Writing for humans and search engines at once', excerpt: 'Modern SEO without sacrificing your brand voice or editorial quality.', cat: 'Content', seed: 'carma-c' },
    { title: 'The art of the cover image: photos that invite a read', excerpt: 'How to pick and treat the featured photo so every article can breathe.', cat: 'Photography', seed: 'carma-d' },
    { title: 'Newsletter: turning readers into a community', excerpt: 'Proven strategies to grow and retain your audience over time.', cat: 'Growth', seed: 'carma-e' },
    { title: 'A color system that works everywhere', excerpt: 'Accessible, coherent palettes that are easy to maintain in light and dark mode.', cat: 'Design', seed: 'carma-f' },
  ],
}

export function buildSamplePosts(locale: Locale, authorName = 'Carma') {
  const set = SAMPLES[uiLocale(locale)] ?? SAMPLES.ca
  return set.map((s, i) => ({
    id: `sample-${i}`,
    title: s.title,
    slug: `demo-${i}`,
    content: { html: '' },
    excerpt: s.excerpt,
    featured_image: `https://picsum.photos/seed/${s.seed}/900/560`,
    categories: [s.cat],
    tags: [] as string[],
    author_name: authorName,
    created_at: new Date(Date.now() - i * 3 * 86_400_000).toISOString(),
    is_published: true,
    demo: true,
  }))
}

// ── Sample ARTICLE (rich body) ────────────────────────────────────────────────
// Used by the article render in preview mode (`?preview`) when a site has no
// published post yet, so the dashboard's Smart-Modules ARTICLE preview (table of
// contents, reading progress, paywall, related, author card, share…) always has a
// real article to render against. Headings give the TOC something to index; the
// several paragraphs give reading-time + paywall preview blocks real content.

type ArticleSample = { title: string; excerpt: string; cat: string; tags: string[]; html: string }

const ARTICLE_SAMPLES: Record<UiLocale, ArticleSample> = {
  ca: {
    title: 'Com construir una marca editorial que perduri',
    excerpt: 'Identitat, veu i constància: la guia pràctica per fer que cada article reforci la teva marca.',
    cat: 'Estratègia',
    tags: ['marca', 'contingut', 'seo'],
    html: `<p>Una marca editorial sòlida no es construeix amb un article, sinó amb la suma de molts. Aquesta és una mostra de com es veurà el teu contingut amb els mòduls actius.</p>
<h2>La veu de la teva marca</h2>
<p>El to de veu és el fil invisible que connecta tots els teus articles. Ha de ser reconeixible al primer paràgraf i coherent fins a l'últim.</p>
<p>Defineix tres adjectius que descriguin com vols sonar i revisa cada text contra ells abans de publicar.</p>
<h3>Constància per sobre d'intensitat</h3>
<p>Publicar amb regularitat val més que publicar molt de cop. El teu públic aprèn a esperar-te, i els cercadors premien la freqüència sostinguda.</p>
<h2>Mesura el que funciona</h2>
<p>No tot el contingut rendeix igual. Mira quins temes generen més lectura i dobla l'aposta pel que funciona.</p>
<p>Una bona estratègia editorial és, sobretot, un bon sistema d'aprenentatge continu.</p>`,
  },
  es: {
    title: 'Cómo construir una marca editorial que perdure',
    excerpt: 'Identidad, voz y constancia: la guía práctica para que cada artículo refuerce tu marca.',
    cat: 'Estrategia',
    tags: ['marca', 'contenido', 'seo'],
    html: `<p>Una marca editorial sólida no se construye con un artículo, sino con la suma de muchos. Esta es una muestra de cómo se verá tu contenido con los módulos activos.</p>
<h2>La voz de tu marca</h2>
<p>El tono de voz es el hilo invisible que conecta todos tus artículos. Debe ser reconocible en el primer párrafo y coherente hasta el último.</p>
<p>Define tres adjetivos que describan cómo quieres sonar y revisa cada texto contra ellos antes de publicar.</p>
<h3>Constancia por encima de intensidad</h3>
<p>Publicar con regularidad vale más que publicar mucho de golpe. Tu público aprende a esperarte y los buscadores premian la frecuencia sostenida.</p>
<h2>Mide lo que funciona</h2>
<p>No todo el contenido rinde igual. Observa qué temas generan más lectura y redobla la apuesta por lo que funciona.</p>
<p>Una buena estrategia editorial es, sobre todo, un buen sistema de aprendizaje continuo.</p>`,
  },
  en: {
    title: 'How to build an editorial brand that lasts',
    excerpt: 'Identity, voice and consistency: the practical guide to make every article strengthen your brand.',
    cat: 'Strategy',
    tags: ['brand', 'content', 'seo'],
    html: `<p>A strong editorial brand isn't built with one article, but with the sum of many. This is a sample of how your content will look with the modules turned on.</p>
<h2>Your brand voice</h2>
<p>Tone of voice is the invisible thread connecting all your articles. It should be recognizable by the first paragraph and consistent to the last.</p>
<p>Pick three adjectives that describe how you want to sound, and check every piece against them before publishing.</p>
<h3>Consistency over intensity</h3>
<p>Publishing regularly beats publishing a lot at once. Your audience learns to expect you, and search engines reward sustained frequency.</p>
<h2>Measure what works</h2>
<p>Not all content performs the same. Watch which topics drive the most reading and double down on what works.</p>
<p>A good editorial strategy is, above all, a good system for continuous learning.</p>`,
  },
}

export function buildSampleArticle(locale: Locale, authorName = 'Carma') {
  const a = ARTICLE_SAMPLES[uiLocale(locale)] ?? ARTICLE_SAMPLES.ca
  return {
    id: 'sample-article',
    title: a.title,
    slug: SAMPLE_ARTICLE_SLUG,
    content: { html: a.html },
    excerpt: a.excerpt,
    featured_image: 'https://picsum.photos/seed/carma-article/1200/675',
    categories: [a.cat],
    tags: a.tags,
    author_name: authorName,
    created_at: new Date().toISOString(),
    is_published: true,
    demo: true,
  }
}

/** Sentinel slug the dashboard uses to request the article preview when the site
 *  has no published post yet. The article render serves the sample for it. */
export const SAMPLE_ARTICLE_SLUG = '__carma_demo__'

// ── SEEDABLE starter posts (template onboarding) ─────────────────────────────
// Unlike the preview-only samples above (demo:true, empty bodies), these become
// REAL posts in the database when a user starts from a template: the blog is
// born alive — full cards on the feed, full articles behind them — and every
// piece is the user's to edit or delete. Bodies are generated from a localized
// skeleton so all samples read as genuine, useful articles.

const SEED_BODY: Record<UiLocale, (s: Sample) => string> = {
  ca: (s) => `<p>${s.excerpt} En aquest article t'expliquem el nostre enfocament, pas a pas i sense fum.</p>
<h2>Per què és important</h2>
<p>Les marques que destaquen no ho fan per casualitat: darrere hi ha decisions petites preses amb criteri i mantingudes en el temps. ${s.title.replace(/\.$/, '')} és una d'aquelles palanques que semblen menors fins que en veus l'efecte acumulat.</p>
<p>La bona notícia és que no cal cap gran pressupost per començar — només un mètode clar.</p>
<h2>Com aplicar-ho, en quatre passos</h2>
<ul>
<li><strong>Observa</strong> el que ja tens: què funciona i què fa soroll.</li>
<li><strong>Decideix</strong> un criteri simple i escriu-lo — si no està escrit, no existeix.</li>
<li><strong>Aplica'l</strong> a una peça petita aquesta mateixa setmana.</li>
<li><strong>Revisa</strong> el resultat al cap de quinze dies i ajusta.</li>
</ul>
<blockquote>La constància guanya la intensitat: val més un pas cada setmana que deu passos un sol dia.</blockquote>
<h3>Per acabar</h3>
<p>Comença petit, mesura i repeteix. La resta és qüestió de temps.</p>
<p><em>Aquest article és de mostra: edita'l des del panell o esborra'l quan tinguis contingut propi.</em></p>`,
  es: (s) => `<p>${s.excerpt} En este artículo te contamos nuestro enfoque, paso a paso y sin humo.</p>
<h2>Por qué importa</h2>
<p>Las marcas que destacan no lo hacen por casualidad: detrás hay decisiones pequeñas tomadas con criterio y sostenidas en el tiempo. ${s.title.replace(/\.$/, '')} es una de esas palancas que parecen menores hasta que ves su efecto acumulado.</p>
<p>La buena noticia es que no hace falta un gran presupuesto para empezar — solo un método claro.</p>
<h2>Cómo aplicarlo, en cuatro pasos</h2>
<ul>
<li><strong>Observa</strong> lo que ya tienes: qué funciona y qué hace ruido.</li>
<li><strong>Decide</strong> un criterio simple y escríbelo — si no está escrito, no existe.</li>
<li><strong>Aplícalo</strong> a una pieza pequeña esta misma semana.</li>
<li><strong>Revisa</strong> el resultado a los quince días y ajusta.</li>
</ul>
<blockquote>La constancia gana a la intensidad: vale más un paso cada semana que diez pasos en un solo día.</blockquote>
<h3>Para terminar</h3>
<p>Empieza pequeño, mide y repite. El resto es cuestión de tiempo.</p>
<p><em>Este artículo es de muestra: edítalo desde el panel o bórralo cuando tengas contenido propio.</em></p>`,
  en: (s) => `<p>${s.excerpt} In this article we walk through our approach, step by step and with zero fluff.</p>
<h2>Why it matters</h2>
<p>Brands that stand out don't do it by accident: behind them are small decisions made with judgement and sustained over time. ${s.title.replace(/\.$/, '')} is one of those levers that looks minor until you see its compound effect.</p>
<p>The good news: you don't need a big budget to start — just a clear method.</p>
<h2>How to apply it, in four steps</h2>
<ul>
<li><strong>Observe</strong> what you already have: what works and what's noise.</li>
<li><strong>Decide</strong> on one simple rule and write it down — unwritten rules don't exist.</li>
<li><strong>Apply it</strong> to one small piece this very week.</li>
<li><strong>Review</strong> the result two weeks later and adjust.</li>
</ul>
<blockquote>Consistency beats intensity: one step every week is worth more than ten steps in a single day.</blockquote>
<h3>Wrapping up</h3>
<p>Start small, measure, repeat. The rest is a matter of time.</p>
<p><em>This is a sample article: edit it from the dashboard, or delete it once you have your own content.</em></p>`,
}

function seedSlug(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80)
}

export type SeedPost = {
  title: string
  slug: string
  excerpt: string
  contentHtml: string
  featured_image: string
  categories: string[]
  created_at: string
}

/** The 4 starter posts a template blog is born with (locale-aware, real slugs). */
export function buildSeedPosts(locale: Locale): SeedPost[] {
  const ui = uiLocale(locale)
  const set = SAMPLES[ui] ?? SAMPLES.ca
  const body = SEED_BODY[ui] ?? SEED_BODY.ca
  return set.slice(0, 4).map((s, i) => ({
    title: s.title,
    slug: seedSlug(s.title),
    excerpt: s.excerpt,
    contentHtml: body(s),
    featured_image: `https://picsum.photos/seed/${s.seed}/1200/675`,
    categories: [s.cat],
    created_at: new Date(Date.now() - i * 3 * 86_400_000).toISOString(),
  }))
}
