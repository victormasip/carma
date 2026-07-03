// Source-site FEATURE detection → Carma Smart Modules.
//
// When the Magic Wand captures a page, this pass reads the parsed DOM for the
// interactive features the source blog already offers its readers (a searcher,
// a newsletter box, share buttons, a TOC…) and maps each one to the equivalent
// module in our registry, so the clone doesn't just LOOK like the source — it
// behaves like it. Pure heuristics over static HTML: no network, no LLM, and
// deliberately conservative (a false positive silently enables a module the
// owner can switch off in one click; a noisy one would erode trust in the
// whole capture).
//
// Consumed by the analyze pipeline; ids MUST exist in lib/modules/registry.ts.

import type { HTMLElement } from 'node-html-parser'
import type { DetectedModule } from '@/lib/render/captureProgress'

const text = (el: HTMLElement): string => (el.textContent ?? '').trim().toLowerCase()

export function detectSourceModules(root: HTMLElement): DetectedModule[] {
  const out: DetectedModule[] = []
  const seen = new Set<string>()
  const add = (id: string, label: string, reason: string) => {
    if (seen.has(id)) return
    seen.add(id)
    out.push({ id, label, reason })
  }

  // One pass over class/id-bearing nodes; every class heuristic reads this list.
  const classed = root.querySelectorAll('[class], [id]').map((el) => ({
    el: el as HTMLElement,
    sig: `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''}`.toLowerCase(),
  }))
  const hasClass = (re: RegExp) => classed.some((c) => re.test(c.sig))
  const anchors = root.querySelectorAll('a[href]') as HTMLElement[]

  // ── search ──
  const searchInput =
    root.querySelector('input[type="search"]') ||
    root.querySelector('[role="search"] input') ||
    (root.querySelectorAll('input') as HTMLElement[]).find((i) =>
      /search|cerca|busca|búsqueda|buscar/i.test(
        `${i.getAttribute('name') ?? ''} ${i.getAttribute('id') ?? ''} ${i.getAttribute('placeholder') ?? ''} ${i.getAttribute('class') ?? ''}`,
      ))
  if (searchInput) add('search', 'Cerca', 'el lloc té un cercador')

  // ── newsletter ── an email-capture form that is NOT a comment/login form.
  const newsletterForm = (root.querySelectorAll('form') as HTMLElement[]).find((f) => {
    if (!f.querySelector('input[type="email"]')) return false
    if (f.querySelector('textarea') || f.querySelector('input[type="password"]')) return false
    const sig = `${f.getAttribute('class') ?? ''} ${f.getAttribute('id') ?? ''} ${f.getAttribute('action') ?? ''} ${text(f).slice(0, 300)}`
    return /newsletter|subscri|suscri|butllet|bolet[ií]n|mailchimp|mailerlite|convertkit|substack/i.test(sig)
  })
  if (newsletterForm) add('newsletter', 'Newsletter', 'formulari de subscripció per correu')

  // ── categoryFilters ── several links into a category/tag taxonomy.
  const catLinks = anchors.filter((a) =>
    /\/(category|categoria|categories|tag|tags|etiqueta|tema)\//i.test(a.getAttribute('href') ?? ''))
  if (catLinks.length >= 3) add('categoryFilters', 'Filtres de categoria', `${catLinks.length} enllaços de categories/etiquetes`)

  // ── socialShare ── intent/sharer URLs, or an explicit share block.
  const shareLinks = anchors.filter((a) =>
    /twitter\.com\/intent|x\.com\/intent|facebook\.com\/sharer|linkedin\.com\/(sharing|shareArticle)|wa\.me\/\?text|api\.whatsapp\.com\/send|t\.me\/share|pinterest\.[a-z.]+\/pin\/create/i
      .test(a.getAttribute('href') ?? ''))
  if (shareLinks.length >= 1 || hasClass(/\bshare-?(buttons?|links?|post|article)\b|social-?share/)) {
    add('socialShare', 'Compartir', 'botons de compartir a xarxes')
  }

  // ── tableOfContents ──
  if (hasClass(/\btoc\b|table-?of-?contents|tabla-de-contenidos|taula-de-continguts/) || root.querySelector('nav.toc, #toc, .ez-toc-container, .lwptoc')) {
    add('tableOfContents', 'Índex de continguts', 'els articles porten índex')
  }

  // ── relatedPosts ──
  const relatedHeading = (root.querySelectorAll('h2, h3, h4') as HTMLElement[]).some((h) =>
    /relacionat|related|també et pot|te puede interesar|més articles|art[ií]culos relacionados|you may also like/i.test(text(h)))
  if (relatedHeading || hasClass(/related-?(posts?|articles?|entries)|yarpp|jp-relatedposts/)) {
    add('relatedPosts', 'Articles relacionats', 'secció d’articles relacionats')
  }

  // ── prevNext ── the classic post-to-post navigation (WP ships .post-navigation).
  if (hasClass(/\bpost-?navigation\b|\bnav-?links\b.*|prev-?next/) || root.querySelector('.post-navigation, nav.navigation.post-navigation')) {
    add('prevNext', 'Anterior / següent', 'navegació entre articles')
  }

  // ── authorCard ──
  if (hasClass(/author-?(bio|box|card|info|about)\b/)) {
    add('authorCard', 'Autor', 'targeta d’autor als articles')
  }

  // ── darkModeToggle ──
  if (hasClass(/dark-?mode|theme-?(toggle|switch(er)?)|color-?scheme-?toggle|night-?mode/)) {
    add('darkModeToggle', 'Mode fosc', 'el lloc ofereix mode fosc')
  }

  // ── readingProgress ── require the qualified name; bare "progress-bar" is too generic.
  if (hasClass(/reading-?progress|scroll-?progress|progress-?indicator\b/)) {
    add('readingProgress', 'Progrés de lectura', 'barra de progrés de lectura')
  }

  // ── backToTop ──
  if (hasClass(/back-?to-?top|scroll-?(to-?)?top\b|go-?top\b/) || anchors.some((a) => (a.getAttribute('href') ?? '') === '#top')) {
    add('backToTop', 'Tornar a dalt', 'botó de tornar a dalt')
  }

  // ── announcementBar ── qualified names only (plain "banner"/"topbar" is layout noise).
  if (hasClass(/announcement-?bar|notification-?bar|promo-?bar|top-?bar-?(message|notice)/)) {
    add('announcementBar', 'Barra d’anuncis', 'barra d’avisos a dalt de tot')
  }

  return out
}
