// Smart Modules — render engine.
//
// Pure builders that turn a site's module config (see registry.ts) into HTML +
// CSS + a vanilla-JS runtime, woven into the public render by theme.ts.
//
// STRICT INHERITANCE (PHASE 4 mandate): every module renders INSIDE the blog's
// Declarative Shadow DOM using ONLY the design tokens (`--ct-*`) and the
// `.carma-*` structural conventions the chosen template already defines. Modules
// never hard-code a brand colour or font — they read the cloned ones — so a
// module dropped onto any captured palette/typography looks native and never
// overwrites the client's brand. All CSS is `!important` (to win over the
// `.carma-root` isolation reset) and scoped under `.carma-mod-*` class names so
// it can't collide with the feed/article CSS or the client chrome.

import { parse } from 'node-html-parser'
import { uiLocale, type Locale, type UiLocale } from '@/lib/i18n/config'
import {
  resolveModule, optStr, optBool, optNum, optArr,
  type SiteModules,
} from '@/lib/modules/registry'

// A CSS value safe to interpolate into a declaration (colours from the option
// picker). Anything that could break out of the rule is dropped.
function safeCss(v: string): string {
  const s = (v || '').trim().slice(0, 60)
  return /[<>{};]/.test(s) ? '' : s
}

// ─── Data the renderer hands us (already localized, URLs precomputed) ──────────

export type ModulePost = {
  id: string
  title: string
  excerpt: string | null
  image: string | null
  categories: string[]
  tags: string[]
  author: string | null
  date: string
  url: string
}

export type ModuleHelpers = {
  esc: (s: string) => string
  escAttr: (s: string) => string
  /** Responsive <picture> for a card/hero image. */
  img: (src: string, alt: string) => string
  /** Locale-formatted date. */
  fmtDate: (iso: string) => string
}

// ─── i18n micro-strings (module UI chrome only) ───────────────────────────────

type Strings = {
  readMin: (n: number) => string
  searchPlaceholder: string
  all: string
  featured: string
  prev: string
  next: string
  share: string
  copy: string
  copied: string
  by: string
  toc: string
  subscribe: string
  emailPh: string
  top: string
  unlock: string
  lightDark: string
}

const STRINGS: Record<UiLocale, Strings> = {
  ca: {
    readMin: n => `${n} min de lectura`, searchPlaceholder: 'Cerca articles…', all: 'Totes',
    featured: 'Destacats', prev: 'Anterior', next: 'Següent', share: 'Comparteix',
    copy: 'Copia l’enllaç', copied: 'Copiat!', by: 'Per', toc: 'En aquesta pàgina',
    subscribe: 'Subscriure’m', emailPh: 'El teu correu electrònic', top: 'A dalt',
    unlock: 'Desbloquejar', lightDark: 'Tema clar/fosc',
  },
  es: {
    readMin: n => `${n} min de lectura`, searchPlaceholder: 'Busca artículos…', all: 'Todas',
    featured: 'Destacados', prev: 'Anterior', next: 'Siguiente', share: 'Compartir',
    copy: 'Copiar enlace', copied: '¡Copiado!', by: 'Por', toc: 'En esta página',
    subscribe: 'Suscribirme', emailPh: 'Tu correo electrónico', top: 'Arriba',
    unlock: 'Desbloquear', lightDark: 'Tema claro/oscuro',
  },
  en: {
    readMin: n => `${n} min read`, searchPlaceholder: 'Search articles…', all: 'All',
    featured: 'Featured', prev: 'Previous', next: 'Next', share: 'Share',
    copy: 'Copy link', copied: 'Copied!', by: 'By', toc: 'On this page',
    subscribe: 'Subscribe', emailPh: 'Your email address', top: 'Top',
    unlock: 'Unlock', lightDark: 'Light/dark theme',
  },
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sec'
}

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

export function readingTimeMin(html: string): number {
  const words = plainText(html).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}

// Ordered display-label → count, deduped case-insensitively (cap 12).
function categoryCounts(posts: ModulePost[]): Map<string, number> {
  const order: string[] = []
  const counts = new Map<string, number>()
  const labels = new Map<string, string>()
  for (const p of posts) for (const c of p.categories) {
    const k = c.trim(); if (!k) continue
    const lk = k.toLowerCase()
    if (!counts.has(lk)) { counts.set(lk, 0); labels.set(lk, k); order.push(lk) }
    counts.set(lk, counts.get(lk)! + 1)
  }
  const out = new Map<string, number>()
  for (const lk of order.slice(0, 12)) out.set(labels.get(lk)!, counts.get(lk)!)
  return out
}

// A compact card used by the hero + related modules (mirrors .carma-card shape so
// it inherits the same look, but with its own class so layouts stay independent).
function modCard(p: ModulePost, h: ModuleHelpers, variant: 'default' | 'wide' | 'mini' = 'default', withImage = true): string {
  const media = (withImage && p.image)
    ? `<div class="carma-mod-card-media">${h.img(p.image, p.title)}</div>` : ''
  const cat = p.categories[0]
    ? `<span class="carma-mod-card-cat">${h.esc(p.categories[0])}</span>` : ''
  const excerpt = variant !== 'mini' && p.excerpt
    ? `<p class="carma-mod-card-excerpt">${h.esc(p.excerpt)}</p>` : ''
  return `<a class="carma-mod-card carma-mod-card-${variant}" href="${h.escAttr(p.url)}">
  ${media}
  <span class="carma-mod-card-body">
    <span class="carma-mod-card-meta">${cat}<time>${h.esc(h.fmtDate(p.date))}</time></span>
    <span class="carma-mod-card-title">${h.esc(p.title)}</span>
    ${excerpt}
  </span>
</a>`
}

// ─── Lead-capture form (shared by Newsletter + Paywall-email-unlock) ──────────

function leadForm(
  h: ModuleHelpers, s: Strings,
  opts: { title?: string; description?: string; buttonText?: string; placeholder?: string; consent?: string; successMessage?: string },
  source: 'newsletter' | 'paywall', postId: string | null,
): string {
  const title = opts.title ? `<p class="carma-mod-news-title">${h.esc(opts.title)}</p>` : ''
  const desc = opts.description ? `<p class="carma-mod-news-desc">${h.esc(opts.description)}</p>` : ''
  const consent = opts.consent ? `<p class="carma-mod-news-consent">${h.esc(opts.consent)}</p>` : ''
  const success = opts.successMessage ? ` data-success="${h.escAttr(opts.successMessage)}"` : ''
  return `${title}${desc}
<form class="carma-mod-news-form" data-carma-lead-form data-source="${source}"${success}${postId ? ` data-post="${h.escAttr(postId)}"` : ''}>
  <input class="carma-mod-news-input" type="email" required placeholder="${h.escAttr(opts.placeholder || s.emailPh)}" aria-label="${h.escAttr(s.emailPh)}" />
  <button class="carma-mod-news-btn" type="submit">${h.esc(opts.buttonText || s.subscribe)}</button>
</form>
${consent}
<p class="carma-mod-news-status" data-carma-lead-status role="status" aria-live="polite"></p>`
}

// The full Newsletter module block (the .carma-mod-news shell + the lead form).
function newsletterHtml(variant: string, o: Record<string, unknown>, postId: string | null, h: ModuleHelpers, s: Strings): string {
  return `<div class="carma-mod-news carma-mod-news-${variant}">${leadForm(h, s, {
    title: optStr(o, 'title'), description: optStr(o, 'description'),
    buttonText: optStr(o, 'buttonText'), placeholder: optStr(o, 'placeholder'),
    consent: optStr(o, 'consent'), successMessage: optStr(o, 'successMessage'),
  }, 'newsletter', postId)}</div>`
}

// ─── LISTING modules ──────────────────────────────────────────────────────────

export type ListingModuleParts = {
  top: string         // full-bleed chrome above <main> (announcement bar)
  beforeFeed: string  // inside <main>, before the feed (hero, search, filters, banner)
  afterFeed: string   // inside <main>, after the feed (newsletter card/footer)
  overlays: string    // fixed elements after </main> (back-to-top, dark toggle)
  css: string
}

export function buildListingModuleParts(
  modules: SiteModules | null | undefined,
  posts: ModulePost[],
  locale: Locale,
  h: ModuleHelpers,
): ListingModuleParts {
  const s = STRINGS[uiLocale(locale)] ?? STRINGS.en
  const css: string[] = [BASE_OVERLAY_CSS]
  const top: string[] = []
  const beforeFeed: string[] = []
  const afterFeed: string[] = []
  const overlays: string[] = []
  let used = false

  const announce = resolveModule(modules, 'announcementBar')
  if (announce?.enabled && optStr(announce.options, 'text')) {
    used = true
    const bottom = optStr(announce.options, 'position', 'top') === 'bottom'
    const html = announcementHtml(announce.variant, announce.options, h)
    if (bottom) overlays.push(html); else top.push(html)
    css.push(ANNOUNCE_CSS)
    const bg = safeCss(optStr(announce.options, 'background'))
    if (bg) css.push(`.carma-mod-announce{background:${bg}!important;color:#fff!important}`)
  }

  const hero = resolveModule(modules, 'featuredHero')
  if (hero?.enabled && posts.length) {
    used = true
    beforeFeed.push(heroHtml(hero.variant, hero.options, posts, h, s))
    css.push(HERO_CSS)
  }

  const search = resolveModule(modules, 'search')
  const filters = resolveModule(modules, 'categoryFilters')
  if ((search?.enabled) || (filters?.enabled)) {
    used = true
    const counts = filters?.enabled ? categoryCounts(posts) : new Map<string, number>()
    beforeFeed.push(discoveryHtml(
      search?.enabled ? search.variant : null, search?.options ?? {},
      filters?.enabled ? filters.variant : null, filters?.options ?? {},
      counts, h, s,
    ))
    css.push(DISCOVERY_CSS)
  }

  const news = resolveModule(modules, 'newsletter')
  if (news?.enabled) {
    used = true
    const block = newsletterHtml(news.variant, news.options, null, h, s)
    if (news.variant === 'banner') beforeFeed.push(block)
    else afterFeed.push(block)
    css.push(NEWS_CSS)
    const accent = safeCss(optStr(news.options, 'accent'))
    if (accent) css.push(`.carma-mod-news .carma-mod-news-btn{background:${accent}!important}`)
  }

  const toTop = resolveModule(modules, 'backToTop')
  if (toTop?.enabled) { used = true; overlays.push(backToTopHtml(toTop.variant, optStr(toTop.options, 'position', 'right'), h, s)); css.push(TOTOP_CSS) }

  const dark = resolveModule(modules, 'darkModeToggle')
  if (dark?.enabled) { used = true; overlays.push(darkToggleHtml(dark.variant, dark.options, h, s)); css.push(DARK_CSS) }

  return {
    top: top.join('\n'),
    beforeFeed: beforeFeed.join('\n'),
    afterFeed: afterFeed.join('\n'),
    overlays: overlays.join('\n'),
    css: used ? css.join('\n') : '',
  }
}

// ─── ARTICLE modules ──────────────────────────────────────────────────────────

export type ArticleModuleParts = {
  content: string        // the (possibly paywalled) article content HTML
  top: string            // full-bleed chrome above <main>
  beforeContent: string  // inside <article>, before the content
  afterContent: string   // inside <article>, after the content
  overlays: string       // fixed elements after </main>
  css: string
}

export function buildArticleModuleParts(
  modules: SiteModules | null | undefined,
  ctx: {
    post: ModulePost
    contentHtml: string
    siblings: ModulePost[]
    unlocked: boolean
    locale: Locale
    h: ModuleHelpers
  },
): ArticleModuleParts {
  const { post, siblings, unlocked, locale, h } = ctx
  const s = STRINGS[uiLocale(locale)] ?? STRINGS.en
  const css: string[] = [BASE_OVERLAY_CSS]
  const top: string[] = []
  const before: string[] = []
  const after: string[] = []
  const overlays: string[] = []
  let content = ctx.contentHtml
  let used = false

  const announce = resolveModule(modules, 'announcementBar')
  if (announce?.enabled && optStr(announce.options, 'text')) {
    used = true
    const bottom = optStr(announce.options, 'position', 'top') === 'bottom'
    const html = announcementHtml(announce.variant, announce.options, h)
    if (bottom) overlays.push(html); else top.push(html)
    css.push(ANNOUNCE_CSS)
    const bg = safeCss(optStr(announce.options, 'background'))
    if (bg) css.push(`.carma-mod-announce{background:${bg}!important;color:#fff!important}`)
  }

  const progress = resolveModule(modules, 'readingProgress')
  if (progress?.enabled) {
    used = true
    const mins = readingTimeMin(content)
    const v = progress.variant
    const atBottom = optStr(progress.options, 'position', 'top') === 'bottom'
    if (v === 'bar' || v === 'both') top.push(`<div class="carma-mod-progress${atBottom ? ' pos-bottom' : ''}" data-carma-progress aria-hidden="true"><span></span></div>`)
    if (v === 'circle') overlays.push(progressCircleHtml())
    if (v === 'badge' || v === 'both') before.push(`<div class="carma-mod-readtime">${h.esc(s.readMin(mins))}</div>`)
    css.push(PROGRESS_CSS)
    const col = safeCss(optStr(progress.options, 'color'))
    if (col) css.push(`.carma-mod-progress>span{background:${col}!important}.carma-mod-progc-fg{stroke:${col}!important}`)
  }

  // Table of contents — ensure heading ids first (so anchors resolve), build the
  // index from the VISIBLE content (post-paywall) below.
  const toc = resolveModule(modules, 'tableOfContents')
  if (toc?.enabled) content = ensureHeadingIds(content)

  const share = resolveModule(modules, 'socialShare')
  if (share?.enabled) {
    used = true
    const html = shareHtml(share.variant, share.options, h, s)
    if (share.variant === 'top') before.push(html)
    else if (share.variant === 'floating') overlays.push(html)
    else after.push(html)
    css.push(SHARE_CSS)
  }

  const author = resolveModule(modules, 'authorCard')
  if (author?.enabled && (post.author || optStr(author.options, 'bio'))) {
    used = true
    const html = authorHtml(author.variant, author.options, post, h, s)
    if (author.variant === 'byline') before.push(html)
    else after.push(html)
    css.push(AUTHOR_CSS)
  }

  // Paywall — STRUCTURAL lock: when locked, the content beyond the preview is
  // removed from the document entirely (not merely hidden), so it never reaches
  // an unauthorized reader. Runs after the heading-id pass and before the TOC so
  // the index reflects only what's visible.
  const paywall = resolveModule(modules, 'paywall')
  let locked = false
  if (paywall?.enabled && !unlocked) {
    const n = optNum(paywall.options, 'previewBlocks', 3)
    const split = splitForPaywall(content, n)
    if (split.truncated) {
      used = true
      locked = true
      content = `<div class="carma-mod-paywall-preview carma-mod-paywall-${paywall.variant}">${split.head}</div>`
      after.unshift(paywallHtml(paywall.variant, paywall.options, post, h, s))
      css.push(PAYWALL_CSS)
    }
  }

  if (toc?.enabled) {
    const depth = optStr(toc.options, 'depth', 'h2h3') === 'h2' ? 2 : 3
    const headings = collectHeadings(content, depth)
    if (headings.length >= 2) {
      used = true
      const html = tocHtml(toc.variant, toc.options, headings, h, s)
      if (toc.variant === 'top') before.push(html)
      else overlays.push(html)
      css.push(TOC_CSS)
    }
  }

  // Related + prev/next need sibling posts; skipped when none were supplied
  // (e.g. the cross-origin embed fragment). Suppressed while content is locked.
  if (!locked && siblings.length > 1) {
    const related = resolveModule(modules, 'relatedPosts')
    if (related?.enabled) {
      const picks = pickRelated(post, siblings, optNum(related.options, 'count', 3), optStr(related.options, 'matchBy', 'smart'))
      if (picks.length) {
        used = true
        after.push(relatedHtml(related.variant, related.options, picks, h, s))
        css.push(RELATED_CSS)
      }
    }
    const pn = resolveModule(modules, 'prevNext')
    if (pn?.enabled) {
      const nav = prevNextOf(post, siblings)
      if (nav.prev || nav.next) {
        used = true
        after.push(prevNextHtml(pn.variant, pn.options, nav, h, s))
        css.push(PREVNEXT_CSS)
      }
    }
  }

  const news = resolveModule(modules, 'newsletter')
  if (news?.enabled && !locked) {
    used = true
    after.push(newsletterHtml(news.variant, news.options, post.id, h, s))
    css.push(NEWS_CSS)
    const accent = safeCss(optStr(news.options, 'accent'))
    if (accent) css.push(`.carma-mod-news .carma-mod-news-btn{background:${accent}!important}`)
  }

  const toTop = resolveModule(modules, 'backToTop')
  if (toTop?.enabled) { used = true; overlays.push(backToTopHtml(toTop.variant, optStr(toTop.options, 'position', 'right'), h, s)); css.push(TOTOP_CSS) }

  const dark = resolveModule(modules, 'darkModeToggle')
  if (dark?.enabled) { used = true; overlays.push(darkToggleHtml(dark.variant, dark.options, h, s)); css.push(DARK_CSS) }

  return {
    content,
    top: top.join('\n'),
    beforeContent: before.join('\n'),
    afterContent: after.join('\n'),
    overlays: overlays.join('\n'),
    css: used ? css.join('\n') : '',
  }
}

// ─── Per-module markup ────────────────────────────────────────────────────────

function announcementHtml(variant: string, o: Record<string, unknown>, h: ModuleHelpers): string {
  const text = optStr(o, 'text')
  if (!text) return ''
  const linkText = optStr(o, 'linkText'), linkUrl = optStr(o, 'linkUrl')
  const link = linkText && linkUrl ? ` <a class="carma-mod-announce-link" href="${h.escAttr(linkUrl)}">${h.esc(linkText)}</a>` : ''
  const close = optBool(o, 'dismissible', true)
    ? `<button class="carma-mod-announce-close" data-carma-announce-close aria-label="Tancar">×</button>` : ''
  const pos = optStr(o, 'position', 'top') === 'bottom' ? ' pos-bottom' : ''
  return `<div class="carma-mod-announce carma-mod-announce-${variant}${pos}" data-carma-announce><span class="carma-mod-announce-text">${h.esc(text)}${link}</span>${close}</div>`
}

function heroHtml(variant: string, o: Record<string, unknown>, posts: ModulePost[], h: ModuleHelpers, s: Strings): string {
  const showExcerpt = optBool(o, 'showExcerpt', true)
  const count = Math.min(5, Math.max(1, optNum(o, 'count', 3)))
  const n = variant === 'spotlight' ? 1 : count
  const top = posts.slice(0, n)
  const heading = optStr(o, 'heading')
  const headHtml = heading ? `<h2 class="carma-mod-hero-heading">${h.esc(heading)}</h2>` : ''
  const big = (p: ModulePost) => {
    const media = p.image ? `<div class="carma-mod-hero-media">${h.img(p.image, p.title)}</div>` : ''
    const cat = p.categories[0] ? `<span class="carma-mod-hero-cat">${h.esc(p.categories[0])}</span>` : ''
    const ex = showExcerpt && p.excerpt ? `<p class="carma-mod-hero-excerpt">${h.esc(p.excerpt)}</p>` : ''
    return `<a class="carma-mod-hero-feature" href="${h.escAttr(p.url)}">${media}<span class="carma-mod-hero-body"><span class="carma-mod-hero-meta">${cat}<time>${h.esc(h.fmtDate(p.date))}</time></span><span class="carma-mod-hero-title">${h.esc(p.title)}</span>${ex}</span></a>`
  }
  let inner: string
  if (variant === 'spotlight') inner = big(top[0])
  else if (variant === 'split') {
    const side = top.slice(1).map(p => modCard(p, h, 'mini')).join('')
    inner = `<div class="carma-mod-hero-main">${big(top[0])}</div><div class="carma-mod-hero-side">${side}</div>`
  } else {
    inner = top.map((p, i) => i === 0 ? big(p) : modCard(p, h, 'default')).join('')
  }
  return `<section class="carma-mod-hero" aria-label="${h.escAttr(heading || s.featured)}">${headHtml}<div class="carma-mod-hero-inner carma-mod-hero-${variant}">${inner}</div></section>`
}

function discoveryHtml(
  searchVariant: string | null, searchOpts: Record<string, unknown>,
  filterVariant: string | null, filterOpts: Record<string, unknown>,
  counts: Map<string, number>, h: ModuleHelpers, s: Strings,
): string {
  const parts: string[] = []
  if (searchVariant) {
    const ph = optStr(searchOpts, 'placeholder') || s.searchPlaceholder
    const count = optBool(searchOpts, 'showCount', true)
      ? `<span class="carma-mod-search-count" data-carma-search-count hidden></span>` : ''
    if (searchVariant === 'command') {
      parts.push(`<button class="carma-mod-search-trigger" data-carma-cmd-open type="button"><span class="carma-mod-search-ic">⌘K</span>${h.esc(ph)}</button>
<div class="carma-mod-cmd" data-carma-cmd hidden><div class="carma-mod-cmd-box"><input class="carma-mod-search-input" data-carma-search-input type="search" placeholder="${h.escAttr(ph)}" aria-label="${h.escAttr(ph)}" />${count}</div></div>`)
    } else if (searchVariant === 'expand') {
      parts.push(`<div class="carma-mod-search carma-mod-search-expand"><button class="carma-mod-search-ic-btn" data-carma-search-expand type="button" aria-label="${h.escAttr(ph)}">⌕</button><input class="carma-mod-search-input" data-carma-search-input type="search" placeholder="${h.escAttr(ph)}" aria-label="${h.escAttr(ph)}" />${count}</div>`)
    } else {
      parts.push(`<div class="carma-mod-search carma-mod-search-bar"><span class="carma-mod-search-ic">⌕</span><input class="carma-mod-search-input" data-carma-search-input type="search" placeholder="${h.escAttr(ph)}" aria-label="${h.escAttr(ph)}" />${count}</div>`)
    }
  }
  const cats = [...counts.keys()]
  if (filterVariant && cats.length) {
    const all = optStr(filterOpts, 'allLabel') || s.all
    const showCounts = optBool(filterOpts, 'showCounts', false)
    const lbl = (c: string) => showCounts ? `${h.esc(c)} <span class="carma-mod-filter-n">${counts.get(c)}</span>` : h.esc(c)
    if (filterVariant === 'dropdown') {
      const opts = [`<option value="">${h.esc(all)}</option>`, ...cats.map(c => `<option value="${h.escAttr(c.toLowerCase())}">${h.esc(c)}${showCounts ? ` (${counts.get(c)})` : ''}</option>`)].join('')
      parts.push(`<select class="carma-mod-filter-select" data-carma-cat-select aria-label="${h.escAttr(all)}">${opts}</select>`)
    } else {
      const btns = [`<button class="carma-mod-filter-btn is-active" data-carma-cat="" type="button">${h.esc(all)}</button>`,
        ...cats.map(c => `<button class="carma-mod-filter-btn" data-carma-cat="${h.escAttr(c.toLowerCase())}" type="button">${lbl(c)}</button>`)].join('')
      parts.push(`<div class="carma-mod-filter carma-mod-filter-${filterVariant}" role="tablist">${btns}</div>`)
    }
  }
  const sticky = optBool(filterOpts, 'sticky', false) ? ' is-sticky' : ''
  return `<div class="carma-mod-discovery${sticky}">${parts.join('\n')}</div>`
}

const SHARE_GLYPHS: Record<string, { label: string; glyph: string }> = {
  x: { label: 'X', glyph: '𝕏' },
  facebook: { label: 'Facebook', glyph: 'f' },
  linkedin: { label: 'LinkedIn', glyph: 'in' },
  whatsapp: { label: 'WhatsApp', glyph: '✆' },
  telegram: { label: 'Telegram', glyph: '✈' },
  email: { label: 'Email', glyph: '✉' },
  copy: { label: 'Copy', glyph: '⧉' },
}

function shareHtml(variant: string, o: Record<string, unknown>, h: ModuleHelpers, s: Strings): string {
  const picked = optArr(o, 'networks', ['x', 'facebook', 'linkedin', 'copy'])
  const nets = picked.filter(id => SHARE_GLYPHS[id])
  if (!nets.length) return ''
  const btns = nets.map(id => {
    const g = SHARE_GLYPHS[id]
    const label = id === 'copy' ? s.copy : g.label
    return `<button class="carma-mod-share-btn carma-mod-share-${id}" data-carma-share="${id}" type="button" title="${h.escAttr(label)}" aria-label="${h.escAttr(label)}"><span class="carma-mod-share-glyph">${g.glyph}</span></button>`
  }).join('')
  const showLabel = optBool(o, 'showLabel', true) && variant !== 'floating'
  const label = showLabel ? `<span class="carma-mod-share-label">${h.esc(s.share)}</span>` : ''
  return `<div class="carma-mod-share carma-mod-share-${variant}" aria-label="${h.escAttr(s.share)}">${label}${btns}</div>`
}

function authorHtml(variant: string, o: Record<string, unknown>, post: ModulePost, h: ModuleHelpers, s: Strings): string {
  const name = post.author || ''
  if (!name) return ''
  const bio = optStr(o, 'bio')
  const avatar = optStr(o, 'avatar')
  const role = optStr(o, 'role')
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  const ava = avatar
    ? `<span class="carma-mod-author-ava"><img src="${h.escAttr(avatar)}" alt="${h.escAttr(name)}" /></span>`
    : `<span class="carma-mod-author-ava carma-mod-author-ava-txt">${h.esc(initials)}</span>`
  const nameLine = role
    ? `<span class="carma-mod-author-name">${h.esc(name)}</span><span class="carma-mod-author-role">${h.esc(role)}</span>`
    : `<span class="carma-mod-author-name">${h.esc(name)}</span>`
  const bioHtml = variant === 'box' && bio ? `<p class="carma-mod-author-bio">${h.esc(bio)}</p>` : ''
  return `<div class="carma-mod-author carma-mod-author-${variant}">${ava}<span class="carma-mod-author-meta"><span class="carma-mod-author-by">${h.esc(s.by)}</span>${nameLine}${bioHtml}</span></div>`
}

function paywallHtml(variant: string, o: Record<string, unknown>, post: ModulePost, h: ModuleHelpers, s: Strings): string {
  const title = optStr(o, 'title') || s.unlock
  const message = optStr(o, 'message')
  const btn = optStr(o, 'buttonText') || s.unlock
  const withEmail = optBool(o, 'unlockWithEmail', true)
  const cta = withEmail
    ? leadForm(h, s, { buttonText: btn, placeholder: s.emailPh }, 'paywall', post.id)
    : `<button class="carma-mod-news-btn carma-mod-paywall-btn" data-carma-unlock type="button">${h.esc(btn)}</button>`
  return `<div class="carma-mod-paywall carma-mod-paywall-${variant}" data-carma-paywall>
  <div class="carma-mod-paywall-lock" aria-hidden="true">🔒</div>
  <p class="carma-mod-paywall-title">${h.esc(title)}</p>
  ${message ? `<p class="carma-mod-paywall-msg">${h.esc(message)}</p>` : ''}
  <div class="carma-mod-paywall-cta">${cta}</div>
</div>`
}

function relatedHtml(variant: string, o: Record<string, unknown>, picks: ModulePost[], h: ModuleHelpers, s: Strings): string {
  const heading = optStr(o, 'heading') || s.featured
  const withImage = optBool(o, 'showImage', true)
  const cards = picks.map(p => modCard(p, h, variant === 'list' ? 'wide' : 'default', withImage)).join('\n')
  return `<section class="carma-mod-related carma-mod-related-${variant}" aria-label="${h.escAttr(heading)}">
  <h2 class="carma-mod-related-head"><span class="carma-mod-ai-spark" aria-hidden="true">✦</span>${h.esc(heading)}</h2>
  <div class="carma-mod-related-grid">${cards}</div>
</section>`
}

function prevNextHtml(variant: string, o: Record<string, unknown>, nav: { prev: ModulePost | null; next: ModulePost | null }, h: ModuleHelpers, s: Strings): string {
  const showImage = optBool(o, 'showImage', false) && variant !== 'minimal'
  const cell = (p: ModulePost | null, dir: 'prev' | 'next') => {
    if (!p) return `<span class="carma-mod-pn-cell carma-mod-pn-empty"></span>`
    const label = dir === 'prev' ? s.prev : s.next
    const thumb = showImage && p.image ? `<span class="carma-mod-pn-thumb">${h.img(p.image, p.title)}</span>` : ''
    return `<a class="carma-mod-pn-cell carma-mod-pn-${dir}" href="${h.escAttr(p.url)}">${thumb}<span class="carma-mod-pn-text"><span class="carma-mod-pn-dir">${dir === 'prev' ? '←' : ''} ${h.esc(label)} ${dir === 'next' ? '→' : ''}</span><span class="carma-mod-pn-title">${h.esc(p.title)}</span></span></a>`
  }
  return `<nav class="carma-mod-pn carma-mod-pn-${variant}" aria-label="${h.escAttr(s.prev)}/${h.escAttr(s.next)}">${cell(nav.prev, 'prev')}${cell(nav.next, 'next')}</nav>`
}

function tocHtml(variant: string, o: Record<string, unknown>, headings: { id: string; text: string; level: number }[], h: ModuleHelpers, s: Strings): string {
  const heading = optStr(o, 'heading') || s.toc
  const numbered = optBool(o, 'numbered', false) ? ' carma-mod-toc-numbered' : ''
  const items = headings.map(x => `<li class="carma-mod-toc-l${x.level}"><a href="#${h.escAttr(x.id)}" data-carma-toc-link>${h.esc(x.text)}</a></li>`).join('')
  const ul = `<ul class="carma-mod-toc-list${numbered}">${items}</ul>`
  const list = `<p class="carma-mod-toc-head">${h.esc(heading)}</p>${ul}`
  if (variant === 'top') {
    return `<details class="carma-mod-toc carma-mod-toc-top" open><summary class="carma-mod-toc-summary">${h.esc(heading)}</summary>${ul}</details>`
  }
  if (variant === 'floating') {
    return `<div class="carma-mod-toc carma-mod-toc-floating"><button class="carma-mod-toc-fab" data-carma-toc-toggle type="button" aria-label="${h.escAttr(heading)}">☰</button><nav class="carma-mod-toc-panel" data-carma-toc-panel hidden>${list}</nav></div>`
  }
  return `<aside class="carma-mod-toc carma-mod-toc-sidebar"><nav class="carma-mod-toc-panel">${list}</nav></aside>`
}

function backToTopHtml(variant: string, position: string, h: ModuleHelpers, s: Strings): string {
  const label = variant === 'pill' ? `<span>${h.esc(s.top)}</span>` : ''
  const pos = position === 'left' ? ' pos-left' : ''
  return `<button class="carma-mod-totop carma-mod-totop-${variant}${pos}" data-carma-totop type="button" aria-label="${h.escAttr(s.top)}"><span class="carma-mod-totop-arrow">↑</span>${label}</button>`
}

function darkToggleHtml(variant: string, o: Record<string, unknown>, h: ModuleHelpers, s: Strings): string {
  const pos = optStr(o, 'position', 'left') === 'right' ? ' pos-right' : ''
  const def = optStr(o, 'default', 'light')
  return `<button class="carma-mod-dark carma-mod-dark-${variant}${pos}" data-carma-darktoggle data-carma-dark-default="${h.escAttr(def)}" type="button" aria-label="${h.escAttr(s.lightDark)}" title="${h.escAttr(s.lightDark)}"><span class="carma-mod-dark-sun">☀</span><span class="carma-mod-dark-moon">☾</span></button>`
}

function progressCircleHtml(): string {
  return `<div class="carma-mod-progc" data-carma-progress-circle aria-hidden="true"><svg viewBox="0 0 36 36"><circle class="carma-mod-progc-bg" cx="18" cy="18" r="16"/><circle class="carma-mod-progc-fg" cx="18" cy="18" r="16"/></svg><span class="carma-mod-progc-arrow" data-carma-totop>↑</span></div>`
}

// ─── Content transforms (server-side, security-critical for the paywall) ──────

function ensureHeadingIds(html: string): string {
  try {
    const root = parse(html)
    let changed = false
    for (const el of root.querySelectorAll('h2, h3, h4')) {
      if (!el.getAttribute('id')) {
        el.setAttribute('id', slugify(el.text || 'sec'))
        changed = true
      }
    }
    return changed ? root.toString() : html
  } catch { return html }
}

function collectHeadings(html: string, depth = 3): { id: string; text: string; level: number }[] {
  try {
    const root = parse(html)
    const out: { id: string; text: string; level: number }[] = []
    for (const el of root.querySelectorAll(depth >= 3 ? 'h2, h3' : 'h2')) {
      const id = el.getAttribute('id')
      const text = (el.text || '').trim()
      if (id && text) out.push({ id, text, level: el.tagName.toLowerCase() === 'h3' ? 3 : 2 })
    }
    return out
  } catch { return [] }
}

// Keep the first `n` top-level blocks; DROP the rest from the document entirely
// (the locked remainder is never sent to the client — true server-side gating).
function splitForPaywall(html: string, n: number): { head: string; truncated: boolean } {
  try {
    const root = parse(html)
    const kept: string[] = []
    let blocks = 0
    let truncated = false
    for (const node of root.childNodes) {
      const isEl = (node as { nodeType?: number }).nodeType === 1
      if (isEl) {
        if (blocks >= n) { truncated = true; break }
        blocks++
      }
      kept.push(node.toString())
    }
    return { head: kept.join(''), truncated: truncated && blocks >= n }
  } catch {
    return { head: html, truncated: false }
  }
}

// ─── Related / prev-next selection ────────────────────────────────────────────

function relatednessScore(a: ModulePost, b: ModulePost, matchBy: string): number {
  const pool = (p: ModulePost) =>
    matchBy === 'tags' ? p.tags : matchBy === 'categories' ? p.categories : [...p.categories, ...p.tags]
  const setA = new Set(pool(a).map(x => x.toLowerCase()))
  let score = 0
  for (const x of pool(b).map(y => y.toLowerCase())) if (setA.has(x)) score++
  return score
}

function pickRelated(post: ModulePost, siblings: ModulePost[], count: number, matchBy = 'smart'): ModulePost[] {
  const others = siblings.filter(p => p.id !== post.id)
  const scored = others
    .map(p => ({ p, score: relatednessScore(post, p, matchBy) }))
    .sort((a, b) => b.score - a.score || (a.p.date < b.p.date ? 1 : -1))
  return scored.slice(0, Math.max(1, count)).map(x => x.p)
}

function prevNextOf(post: ModulePost, siblings: ModulePost[]): { prev: ModulePost | null; next: ModulePost | null } {
  const i = siblings.findIndex(p => p.id === post.id)
  if (i < 0) return { prev: null, next: null }
  // siblings are newest→oldest; "prev" = newer, "next" = older.
  return { prev: i > 0 ? siblings[i - 1] : null, next: i < siblings.length - 1 ? siblings[i + 1] : null }
}

// ─── Runtime (vanilla JS, reaches into the blog's shadow root) ─────────────────

export function modulesRuntimeScript(modules: SiteModules | null | undefined, siteId: string): string {
  if (!modules || !Object.values(modules).some(m => m?.enabled)) return ''
  // siteId is a UUID (injection-safe to interpolate).
  return `<script>(function(){
  function root(){var h=document.querySelector('.carma-embed-host');return h&&h.shadowRoot?h.shadowRoot:document;}
  function init(){
    var R=root(); if(!R) return;
    var host=document.querySelector('.carma-embed-host');
    // Cards/announce carry \`display:...!important\` in the template CSS, so a plain
    // inline \`display=none\` is IGNORED. Toggle with an inline !important instead
    // (highest priority) and revert by REMOVING the property (back to the sheet).
    function showEl(el,show){if(!el)return;if(show){el.style.removeProperty('display');}else{el.style.setProperty('display','none','important');}}
    // ── dark mode (respects the saved pref, else the module's default) ──
    try{var pref=localStorage.getItem('carma-theme');var dbtn=R.querySelector('[data-carma-darktoggle]');var def=dbtn?dbtn.getAttribute('data-carma-dark-default'):null;var sysDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var wantDark=pref?(pref==='dark'):(def==='dark'||(def==='system'&&sysDark));if(wantDark&&host)host.setAttribute('data-carma-theme','dark');}catch(e){}
    R.querySelectorAll('[data-carma-darktoggle]').forEach(function(b){b.addEventListener('click',function(){var sr=b.getRootNode();var h=sr&&sr.host?sr.host:host;if(!h)return;var on=h.getAttribute('data-carma-theme')==='dark';if(on){h.removeAttribute('data-carma-theme');}else{h.setAttribute('data-carma-theme','dark');}try{localStorage.setItem('carma-theme',on?'light':'dark');}catch(e){}});});
    // ── feed filtering (search + categories): instant, accent-insensitive, multi-term ──
    // Diacritics are folded on BOTH the query and the indexed card text (Catalan/
    // Spanish content is full of them), and every whitespace-separated token must
    // match (AND), so "barca lliga" finds "Barça · Lliga". The searchable text is
    // pre-folded once per card so each keystroke is a cheap substring scan.
    function fold(s){return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');}
    var cards=[].slice.call(R.querySelectorAll('.carma-card')).map(function(c){return {el:c,txt:fold(c.getAttribute('data-carma-search')||''),cats:(c.getAttribute('data-carma-cats')||'')};});
    var hero=R.querySelector('.carma-mod-hero');
    var terms=[],cat='';
    var counts=R.querySelectorAll('[data-carma-search-count]');
    // Live "no results" state: a filtered-to-empty feed used to be a blank void that
    // read as broken. Inject a message after the grid and toggle it as the user types.
    var grid=R.querySelector('.carma-grid');var noRes=null;
    if(grid&&grid.parentNode){noRes=document.createElement('p');noRes.className='carma-mod-noresults';noRes.setAttribute('data-carma-noresults','');noRes.hidden=true;noRes.textContent='No s\\u2019ha trobat cap article.';grid.parentNode.insertBefore(noRes,grid.nextSibling);}
    function apply(){var q=terms.length>0;var vis=0;for(var k=0;k<cards.length;k++){var c=cards[k],okT=true;for(var j=0;j<terms.length;j++){if(c.txt.indexOf(terms[j])<0){okT=false;break;}}var okC=!cat||(','+c.cats+',').indexOf(','+cat+',')>=0;var show=okT&&okC;showEl(c.el,show);if(show)vis++;}if(hero)showEl(hero,!(q||cat));counts.forEach(function(el){if(q||cat){el.hidden=false;el.textContent=vis+' '+(vis===1?'resultat':'resultats');}else{el.hidden=true;el.textContent='';}});if(noRes)noRes.hidden=!((q||cat)&&vis===0);}
    function setTerm(v){terms=fold(v).split(/\\s+/).filter(Boolean);apply();}
    R.querySelectorAll('[data-carma-search-input]').forEach(function(i){i.addEventListener('input',function(){setTerm(i.value);});i.addEventListener('search',function(){setTerm(i.value);});i.addEventListener('keydown',function(e){if(e.key==='Escape'&&i.value){e.stopPropagation();i.value='';setTerm('');}});});
    R.querySelectorAll('[data-carma-cat]').forEach(function(b){b.addEventListener('click',function(){cat=b.getAttribute('data-carma-cat')||'';R.querySelectorAll('[data-carma-cat]').forEach(function(x){x.classList.toggle('is-active',x===b);});apply();});});
    R.querySelectorAll('[data-carma-cat-select]').forEach(function(sel){sel.addEventListener('change',function(){cat=sel.value||'';apply();});});
    // expandable search
    R.querySelectorAll('[data-carma-search-expand]').forEach(function(b){b.addEventListener('click',function(){var w=b.parentNode;w.classList.toggle('is-open');var inp=w.querySelector('[data-carma-search-input]');if(inp)inp.focus();});});
    // command palette
    var cmd=R.querySelector('[data-carma-cmd]');
    function openCmd(o){if(!cmd)return;cmd.hidden=!o;if(o){var i=cmd.querySelector('[data-carma-search-input]');if(i)i.focus();}}
    R.querySelectorAll('[data-carma-cmd-open]').forEach(function(b){b.addEventListener('click',function(){openCmd(true);});});
    if(cmd){cmd.addEventListener('click',function(e){if(e.target===cmd)openCmd(false);});}
    document.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();openCmd(true);}if(e.key==='Escape')openCmd(false);});
    // ── announcement dismiss ──
    R.querySelectorAll('[data-carma-announce-close]').forEach(function(b){b.addEventListener('click',function(){var a=b.closest('[data-carma-announce]');if(a)showEl(a,false);});});
    // ── reading progress + back-to-top ──
    var bars=[].slice.call(R.querySelectorAll('[data-carma-progress] span'));
    var circs=[].slice.call(R.querySelectorAll('[data-carma-progress-circle] .carma-mod-progc-fg'));
    var tops=[].slice.call(R.querySelectorAll('[data-carma-totop]'));
    var circWraps=[].slice.call(R.querySelectorAll('[data-carma-progress-circle]'));
    function onScroll(){var d=document.documentElement;var max=(d.scrollHeight-d.clientHeight)||1;var p=Math.min(1,Math.max(0,(window.scrollY||d.scrollTop)/max));bars.forEach(function(b){b.style.width=(p*100).toFixed(1)+'%';});circs.forEach(function(c){c.style.strokeDashoffset=(100-p*100).toFixed(1);});var show=(window.scrollY||d.scrollTop)>500;tops.forEach(function(t){t.classList.toggle('is-on',show);});circWraps.forEach(function(t){t.classList.toggle('is-on',show);});}
    window.addEventListener('scroll',onScroll,{passive:true});onScroll();
    tops.forEach(function(t){t.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});});
    // ── TOC floating toggle + active highlight ──
    R.querySelectorAll('[data-carma-toc-toggle]').forEach(function(b){b.addEventListener('click',function(){var p=b.parentNode.querySelector('[data-carma-toc-panel]');if(p)p.hidden=!p.hidden;});});
    // ── share ──
    function shareUrl(){return location.href;}
    R.querySelectorAll('[data-carma-share]').forEach(function(b){b.addEventListener('click',function(){var net=b.getAttribute('data-carma-share');var u=encodeURIComponent(shareUrl());var t=encodeURIComponent(document.title||'');var url='';if(net==='x')url='https://twitter.com/intent/tweet?url='+u+'&text='+t;else if(net==='facebook')url='https://www.facebook.com/sharer/sharer.php?u='+u;else if(net==='linkedin')url='https://www.linkedin.com/sharing/share-offsite/?url='+u;else if(net==='whatsapp')url='https://wa.me/?text='+t+'%20'+u;else if(net==='telegram')url='https://t.me/share/url?url='+u+'&text='+t;else if(net==='email'){location.href='mailto:?subject='+t+'&body='+u;return;}else if(net==='copy'){try{navigator.clipboard.writeText(shareUrl());var g=b.querySelector('.carma-mod-share-glyph');if(g){var old=g.textContent;g.textContent='✓';setTimeout(function(){g.textContent=old;},1400);}}catch(e){}return;}if(url)window.open(url,'_blank','noopener,noreferrer,width=600,height=520');});});
    // ── lead capture (newsletter + paywall email unlock) ──
    R.querySelectorAll('[data-carma-lead-form]').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var inp=f.querySelector('input[type=email]');var email=inp?inp.value.trim():'';if(!email)return;var src=f.getAttribute('data-source')||'newsletter';var post=f.getAttribute('data-post')||null;var st=f.parentNode.querySelector('[data-carma-lead-status]');var btn=f.querySelector('button');if(btn)btn.disabled=true;fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteId:'${siteId}',email:email,source:src,postId:post})}).then(function(r){return r.json().catch(function(){return{};});}).then(function(res){if(src==='paywall'){location.reload();return;}if(st){st.textContent=f.getAttribute('data-success')||(res&&res.message)||'✓';st.classList.add('is-ok');}f.reset();if(btn)btn.disabled=false;}).catch(function(){if(st){st.textContent='Hi ha hagut un error. Torna-ho a provar.';st.classList.add('is-err');}if(btn)btn.disabled=false;});});});
    // paywall (no email) — best-effort soft unlock by reload (server sets cookie elsewhere)
    R.querySelectorAll('[data-carma-unlock]').forEach(function(b){b.addEventListener('click',function(){fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteId:'${siteId}',source:'paywall',anon:true})}).then(function(){location.reload();}).catch(function(){location.reload();});});});
  }
  if(document.readyState!=='loading')setTimeout(init,0);else document.addEventListener('DOMContentLoaded',init);
})();</script>`
}

// ─── CSS blocks (token-driven, scoped under .carma-mod-*) ──────────────────────

const BASE_OVERLAY_CSS = `
/* Module elements live both inside and outside .carma-root; ensure border-box
   everywhere so paddings never blow out a width (the .carma-root reset only
   covers in-root descendants). */
[class^="carma-mod-"],[class*=" carma-mod-"],[class^="carma-mod-"] *,[class*=" carma-mod-"] *{box-sizing:border-box!important}
/* Dark-mode token overrides — flips the NEUTRALS only, keeping the brand accent
   + fonts (never overwrites the brand). Applied on the shadow host. */
:host([data-carma-theme="dark"]){--ct-bg:#0f1115!important;--ct-surface:#181b20!important;--ct-text:#e9eaec!important;--ct-muted:#9aa3ad!important;--ct-border:#2b2f37!important}
.carma-mod-card{display:flex!important;flex-direction:column!important;text-decoration:none!important;color:inherit!important;background:var(--ct-surface)!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;overflow:hidden!important;transition:transform .2s ease,box-shadow .2s ease!important}
.carma-mod-card:hover{transform:translateY(-3px)!important;box-shadow:0 16px 36px -20px rgba(0,0,0,.34)!important}
.carma-mod-card-media{aspect-ratio:16/9!important;background:var(--ct-border)!important;overflow:hidden!important}
.carma-mod-card-media img,.carma-mod-card-media picture{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
.carma-mod-card-body{display:flex!important;flex-direction:column!important;gap:.45rem!important;padding:1rem 1.1rem 1.15rem!important;flex:1!important}
.carma-mod-card-meta{display:flex!important;gap:.5rem!important;align-items:center!important;font-size:.72rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.03em!important;color:var(--ct-muted)!important}
.carma-mod-card-cat{color:var(--ct-accent)!important}
.carma-mod-card-title{font-family:var(--ct-font-heading)!important;font-size:1.08rem!important;font-weight:700!important;line-height:1.3!important;color:var(--ct-text)!important}
.carma-mod-card:hover .carma-mod-card-title{color:var(--ct-accent)!important}
.carma-mod-card-excerpt{font-size:.9rem!important;line-height:1.55!important;color:var(--ct-muted)!important;display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical!important;overflow:hidden!important}
.carma-mod-card-wide{flex-direction:row!important;align-items:stretch!important}
.carma-mod-card-wide .carma-mod-card-media{width:34%!important;flex:0 0 34%!important;aspect-ratio:4/3!important}
.carma-mod-card-mini .carma-mod-card-media{aspect-ratio:3/2!important}
/* ── V2 positional + deep-option helpers (selectors are specific, so they are
   inert unless the matching element is present) ── */
.carma-mod-announce.pos-bottom{position:fixed!important;bottom:0!important;left:0!important;right:0!important;z-index:50!important}
.carma-mod-progress.pos-bottom{top:auto!important;bottom:0!important}
.carma-mod-totop.pos-left{left:1.5rem!important;right:auto!important}
.carma-mod-dark.pos-right{right:1.5rem!important;left:auto!important}
.carma-mod-discovery.is-sticky{position:sticky!important;top:0!important;z-index:20!important;background:var(--ct-bg)!important;padding:.7rem 0!important}
.carma-mod-search-count{font-size:.8rem!important;font-weight:700!important;color:var(--ct-muted)!important;white-space:nowrap!important}
.carma-mod-search-bar .carma-mod-search-count,.carma-mod-search-expand .carma-mod-search-count{position:absolute!important;right:1rem!important;pointer-events:none!important}
.carma-mod-cmd-box .carma-mod-search-count{display:block!important;margin:.5rem .2rem 0!important}
.carma-mod-filter-n{display:inline-block!important;margin-left:.3rem!important;font-size:.72rem!important;opacity:.7!important;font-variant-numeric:tabular-nums!important}
.carma-mod-hero-heading{font-family:var(--ct-font-heading)!important;font-size:1.05rem!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.05em!important;color:var(--ct-muted)!important;margin:0 0 1rem!important}
.carma-mod-toc-numbered{counter-reset:cmtoc!important}
.carma-mod-toc-numbered li{counter-increment:cmtoc!important}
.carma-mod-toc-numbered a::before{content:counter(cmtoc) '. '!important;color:var(--ct-muted)!important;font-variant-numeric:tabular-nums!important}
.carma-mod-author-role{display:block!important;font-size:.8rem!important;color:var(--ct-muted)!important;font-weight:600!important}
.carma-mod-pn-text{display:flex!important;flex-direction:column!important;gap:.35rem!important}
.carma-mod-pn-next .carma-mod-pn-text{align-items:flex-end!important}
.carma-mod-pn-thumb{display:block!important;width:100%!important;aspect-ratio:16/9!important;border-radius:var(--ct-radius)!important;overflow:hidden!important;margin-bottom:.6rem!important;background:var(--ct-border)!important}
.carma-mod-pn-thumb img,.carma-mod-pn-thumb picture{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
.carma-mod-news-consent{font-size:.75rem!important;color:var(--ct-muted)!important;margin:.6rem 0 0!important;line-height:1.4!important}`.trim()

const ANNOUNCE_CSS = `
.carma-mod-announce{display:flex!important;align-items:center!important;justify-content:center!important;gap:1rem!important;width:100%!important;padding:.7rem 1.25rem!important;font-size:.9rem!important;font-weight:600!important;text-align:center!important}
.carma-mod-announce-text{display:inline!important}
.carma-mod-announce-link{color:inherit!important;text-decoration:underline!important;font-weight:800!important;text-underline-offset:2px!important}
.carma-mod-announce-close{background:transparent!important;border:0!important;color:inherit!important;font-size:1.3rem!important;line-height:1!important;cursor:pointer!important;opacity:.75!important;padding:0 .25rem!important}
.carma-mod-announce-close:hover{opacity:1!important}
.carma-mod-announce-gradient{background:linear-gradient(90deg,var(--ct-primary),var(--ct-accent))!important;color:#fff!important}
.carma-mod-announce-solid{background:var(--ct-accent)!important;color:#fff!important}
.carma-mod-announce-minimal{background:var(--ct-surface)!important;color:var(--ct-text)!important;border-bottom:1px solid var(--ct-border)!important}`.trim()

const HERO_CSS = `
.carma-mod-hero{margin:0 0 2.5rem!important}
.carma-mod-hero-feature{display:flex!important;flex-direction:column!important;text-decoration:none!important;color:inherit!important;border-radius:var(--ct-radius-lg)!important;overflow:hidden!important;background:var(--ct-surface)!important;border:1px solid var(--ct-border)!important}
.carma-mod-hero-media{aspect-ratio:21/9!important;background:var(--ct-border)!important;overflow:hidden!important}
.carma-mod-hero-media img,.carma-mod-hero-media picture{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;transition:transform .4s ease!important}
.carma-mod-hero-feature:hover .carma-mod-hero-media img{transform:scale(1.04)!important}
.carma-mod-hero-body{display:flex!important;flex-direction:column!important;gap:.65rem!important;padding:1.6rem 1.8rem 1.9rem!important}
.carma-mod-hero-meta{display:flex!important;gap:.6rem!important;align-items:center!important;font-size:.76rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.04em!important;color:var(--ct-muted)!important}
.carma-mod-hero-cat{color:var(--ct-accent)!important}
.carma-mod-hero-title{font-family:var(--ct-font-heading)!important;font-size:clamp(1.5rem,1.1rem + 1.6vw,2.4rem)!important;font-weight:800!important;line-height:1.12!important;letter-spacing:-.02em!important;color:var(--ct-text)!important}
.carma-mod-hero-feature:hover .carma-mod-hero-title{color:var(--ct-accent)!important}
.carma-mod-hero-excerpt{font-size:1rem!important;line-height:1.55!important;color:var(--ct-muted)!important;display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical!important;overflow:hidden!important}
.carma-mod-hero-split{display:grid!important;grid-template-columns:1fr!important;gap:1.25rem!important}
@media(min-width:900px){.carma-mod-hero-split{grid-template-columns:1.6fr 1fr!important}}
.carma-mod-hero-side{display:grid!important;gap:1.25rem!important;align-content:start!important}
.carma-mod-hero-magazine{display:grid!important;grid-template-columns:1fr!important;gap:1.25rem!important}
@media(min-width:760px){.carma-mod-hero-magazine{grid-template-columns:2fr 1fr 1fr!important}.carma-mod-hero-magazine .carma-mod-hero-feature{grid-row:span 2!important}}`.trim()

const DISCOVERY_CSS = `
.carma-mod-discovery{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:.9rem!important;margin:0 0 1.75rem!important}
.carma-mod-noresults{margin:2rem 0!important;padding:2rem 1rem!important;text-align:center!important;color:var(--ct-muted)!important;font-family:var(--ct-font-body)!important;font-size:1rem!important;font-weight:600!important}
.carma-mod-search{position:relative!important;display:flex!important;align-items:center!important;flex:1 1 260px!important;min-width:200px!important}
.carma-mod-search-ic{position:absolute!important;left:.9rem!important;font-size:1rem!important;color:var(--ct-muted)!important;pointer-events:none!important}
.carma-mod-search-input{width:100%!important;height:46px!important;padding:0 1rem 0 2.5rem!important;border:1px solid var(--ct-border)!important;border-radius:9999px!important;background:var(--ct-surface)!important;color:var(--ct-text)!important;font-family:var(--ct-font-body)!important;font-size:.95rem!important;outline:none!important}
.carma-mod-search-input:focus{border-color:var(--ct-accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--ct-accent) 22%,transparent)!important}
.carma-mod-search-expand .carma-mod-search-input{width:0!important;padding:0!important;border-color:transparent!important;transition:width .25s ease,padding .25s ease!important}
.carma-mod-search-expand.is-open .carma-mod-search-input{width:100%!important;padding:0 1rem 0 2.5rem!important;border-color:var(--ct-border)!important}
.carma-mod-search-ic-btn{height:46px!important;width:46px!important;border-radius:9999px!important;border:1px solid var(--ct-border)!important;background:var(--ct-surface)!important;color:var(--ct-text)!important;font-size:1.1rem!important;cursor:pointer!important;flex:0 0 auto!important}
.carma-mod-search-expand{flex:0 1 auto!important}
.carma-mod-search-expand.is-open{flex:1 1 260px!important}
.carma-mod-search-trigger{display:inline-flex!important;align-items:center!important;gap:.6rem!important;height:44px!important;padding:0 1.1rem!important;border:1px solid var(--ct-border)!important;border-radius:9999px!important;background:var(--ct-surface)!important;color:var(--ct-muted)!important;font-family:var(--ct-font-body)!important;font-size:.92rem!important;cursor:pointer!important}
.carma-mod-search-trigger .carma-mod-search-ic{position:static!important;font-weight:800!important;font-size:.72rem!important;padding:.15rem .4rem!important;border:1px solid var(--ct-border)!important;border-radius:6px!important}
.carma-mod-cmd{position:fixed!important;inset:0!important;z-index:60!important;background:rgba(0,0,0,.45)!important;display:flex!important;align-items:flex-start!important;justify-content:center!important;padding-top:14vh!important}
.carma-mod-cmd[hidden]{display:none!important}
.carma-mod-cmd-box{width:min(560px,92vw)!important;background:var(--ct-surface)!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;padding:.6rem!important;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)!important}
.carma-mod-cmd-box .carma-mod-search-input{height:52px!important;padding-left:1.1rem!important;border-radius:var(--ct-radius)!important}
.carma-mod-filter{display:flex!important;flex-wrap:wrap!important;gap:.5rem!important}
.carma-mod-filter-btn{height:38px!important;padding:0 .95rem!important;border:1px solid var(--ct-border)!important;border-radius:9999px!important;background:var(--ct-surface)!important;color:var(--ct-muted)!important;font-family:var(--ct-font-body)!important;font-size:.85rem!important;font-weight:700!important;cursor:pointer!important;transition:all .15s ease!important}
.carma-mod-filter-btn:hover{color:var(--ct-text)!important;border-color:var(--ct-accent)!important}
.carma-mod-filter-btn.is-active{background:var(--ct-accent)!important;border-color:var(--ct-accent)!important;color:#fff!important}
.carma-mod-filter-tabs{gap:0!important;border-bottom:1px solid var(--ct-border)!important}
.carma-mod-filter-tabs .carma-mod-filter-btn{border:0!important;border-radius:0!important;background:transparent!important;border-bottom:2px solid transparent!important;height:42px!important}
.carma-mod-filter-tabs .carma-mod-filter-btn.is-active{background:transparent!important;color:var(--ct-accent)!important;border-bottom-color:var(--ct-accent)!important}
.carma-mod-filter-select{height:44px!important;padding:0 1rem!important;border:1px solid var(--ct-border)!important;border-radius:9999px!important;background:var(--ct-surface)!important;color:var(--ct-text)!important;font-family:var(--ct-font-body)!important;font-size:.9rem!important;cursor:pointer!important}`.trim()

const NEWS_CSS = `
.carma-mod-news{margin:2.25rem 0!important;padding:1.9rem!important;border-radius:var(--ct-radius-lg)!important;border:1px solid var(--ct-border)!important;background:var(--ct-surface)!important}
.carma-mod-news-banner{background:linear-gradient(120deg,color-mix(in srgb,var(--ct-accent) 12%,var(--ct-surface)),var(--ct-surface))!important;border-color:color-mix(in srgb,var(--ct-accent) 30%,var(--ct-border))!important}
.carma-mod-news-footer{background:transparent!important;border:0!important;border-top:1px solid var(--ct-border)!important;border-radius:0!important;text-align:center!important}
.carma-mod-news-title{font-family:var(--ct-font-heading)!important;font-size:1.3rem!important;font-weight:800!important;color:var(--ct-text)!important;margin:0 0 .4rem!important}
.carma-mod-news-desc{font-size:.95rem!important;line-height:1.55!important;color:var(--ct-muted)!important;margin:0 0 1.1rem!important}
.carma-mod-news-form{display:flex!important;gap:.6rem!important;flex-wrap:wrap!important}
.carma-mod-news-footer .carma-mod-news-form{justify-content:center!important}
.carma-mod-news-input{flex:1 1 240px!important;min-width:0!important;height:48px!important;padding:0 1.1rem!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius)!important;background:var(--ct-bg)!important;color:var(--ct-text)!important;font-family:var(--ct-font-body)!important;font-size:.95rem!important;outline:none!important}
.carma-mod-news-input:focus{border-color:var(--ct-accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--ct-accent) 22%,transparent)!important}
.carma-mod-news-btn{height:48px!important;padding:0 1.5rem!important;border:0!important;border-radius:var(--ct-radius)!important;background:var(--ct-accent)!important;color:#fff!important;font-family:var(--ct-font-body)!important;font-weight:800!important;font-size:.95rem!important;cursor:pointer!important;transition:opacity .2s ease!important;white-space:nowrap!important}
.carma-mod-news-btn:hover{opacity:.9!important}
.carma-mod-news-btn:disabled{opacity:.6!important;cursor:default!important}
.carma-mod-news-status{margin:.7rem 0 0!important;font-size:.85rem!important;font-weight:700!important;min-height:1em!important}
.carma-mod-news-status.is-ok{color:var(--ct-accent)!important}
.carma-mod-news-status.is-err{color:#dc2626!important}`.trim()

const PAYWALL_CSS = `
.carma-mod-paywall-preview{position:relative!important}
.carma-mod-paywall-preview.carma-mod-paywall-gradient::after{content:''!important;position:absolute!important;left:0!important;right:0!important;bottom:0!important;height:9rem!important;background:linear-gradient(to bottom,transparent,var(--ct-bg))!important;pointer-events:none!important}
.carma-mod-paywall{position:relative!important;margin:1rem auto 0!important;max-inline-size:46rem!important;padding:2.25rem 2rem!important;text-align:center!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;background:var(--ct-surface)!important;box-shadow:0 -10px 30px -24px rgba(0,0,0,.3)!important}
.carma-mod-paywall-blur{backdrop-filter:saturate(1.1)!important}
.carma-mod-paywall-lock{font-size:1.6rem!important;margin-bottom:.4rem!important}
.carma-mod-paywall-title{font-family:var(--ct-font-heading)!important;font-size:1.5rem!important;font-weight:800!important;color:var(--ct-text)!important;margin:0 0 .5rem!important}
.carma-mod-paywall-msg{font-size:.98rem!important;line-height:1.6!important;color:var(--ct-muted)!important;margin:0 auto 1.3rem!important;max-width:34rem!important}
.carma-mod-paywall-cta{max-width:30rem!important;margin:0 auto!important}
.carma-mod-paywall .carma-mod-news-form{justify-content:center!important}
.carma-mod-paywall-btn{width:auto!important;padding:0 1.8rem!important}`.trim()

const SHARE_CSS = `
.carma-mod-share{display:flex!important;align-items:center!important;gap:.55rem!important;margin:1.6rem 0!important;flex-wrap:wrap!important}
.carma-mod-share-label{font-size:.8rem!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.05em!important;color:var(--ct-muted)!important;margin-right:.2rem!important}
.carma-mod-share-btn{width:40px!important;height:40px!important;border-radius:9999px!important;border:1px solid var(--ct-border)!important;background:var(--ct-surface)!important;color:var(--ct-text)!important;cursor:pointer!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:.95rem!important;font-weight:800!important;transition:all .15s ease!important}
.carma-mod-share-btn:hover{background:var(--ct-accent)!important;border-color:var(--ct-accent)!important;color:#fff!important;transform:translateY(-2px)!important}
.carma-mod-share-glyph{line-height:1!important}
.carma-mod-share-floating{position:fixed!important;left:max(1rem,calc(50vw - 600px))!important;top:50%!important;transform:translateY(-50%)!important;flex-direction:column!important;z-index:40!important;margin:0!important;background:var(--ct-surface)!important;padding:.5rem!important;border:1px solid var(--ct-border)!important;border-radius:9999px!important;box-shadow:0 12px 30px -18px rgba(0,0,0,.4)!important}
.carma-mod-share-floating .carma-mod-share-label{display:none!important}
@media(max-width:1180px){.carma-mod-share-floating{display:none!important}}
.carma-mod-share-top{margin:0 0 1.5rem!important}`.trim()

const AUTHOR_CSS = `
.carma-mod-author{display:flex!important;align-items:center!important;gap:1rem!important}
.carma-mod-author-box{margin:2.25rem 0!important;padding:1.5rem!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;background:var(--ct-surface)!important;align-items:flex-start!important}
.carma-mod-author-byline{margin:0 0 1.5rem!important}
.carma-mod-author-inline{margin:1.25rem 0!important}
.carma-mod-author-ava{width:52px!important;height:52px!important;border-radius:9999px!important;overflow:hidden!important;flex:0 0 auto!important;background:var(--ct-accent)!important;color:#fff!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-weight:800!important;font-size:1.05rem!important}
.carma-mod-author-byline .carma-mod-author-ava,.carma-mod-author-inline .carma-mod-author-ava{width:40px!important;height:40px!important;font-size:.85rem!important}
.carma-mod-author-ava img{width:100%!important;height:100%!important;object-fit:cover!important}
.carma-mod-author-meta{display:flex!important;flex-direction:column!important;gap:.15rem!important;min-width:0!important}
.carma-mod-author-by{font-size:.72rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.05em!important;color:var(--ct-muted)!important}
.carma-mod-author-name{font-family:var(--ct-font-heading)!important;font-size:1.05rem!important;font-weight:800!important;color:var(--ct-text)!important}
.carma-mod-author-bio{font-size:.9rem!important;line-height:1.55!important;color:var(--ct-muted)!important;margin:.35rem 0 0!important}`.trim()

const RELATED_CSS = `
.carma-mod-related{margin:3rem auto 0!important;max-inline-size:none!important;width:100%!important;border-top:1px solid var(--ct-border)!important;padding-top:2rem!important}
.carma-mod-related-head{display:flex!important;align-items:center!important;gap:.5rem!important;font-family:var(--ct-font-heading)!important;font-size:1.4rem!important;font-weight:800!important;color:var(--ct-text)!important;margin:0 0 1.4rem!important}
.carma-mod-ai-spark{color:var(--ct-accent)!important;font-size:1.1rem!important}
.carma-mod-related-grid{display:grid!important;grid-template-columns:1fr!important;gap:1.25rem!important}
@media(min-width:640px){.carma-mod-related-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
.carma-mod-related-list .carma-mod-related-grid{grid-template-columns:1fr!important}
.carma-mod-related-carousel .carma-mod-related-grid{display:flex!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important;grid-template-columns:none!important;padding-bottom:.5rem!important}
.carma-mod-related-carousel .carma-mod-card{flex:0 0 78%!important;max-width:320px!important;scroll-snap-align:start!important}`.trim()

const PREVNEXT_CSS = `
.carma-mod-pn{display:grid!important;grid-template-columns:1fr 1fr!important;gap:1rem!important;margin:2.5rem 0 0!important}
.carma-mod-pn-cell{display:flex!important;flex-direction:column!important;gap:.35rem!important;padding:1.1rem 1.3rem!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius)!important;background:var(--ct-surface)!important;text-decoration:none!important;color:inherit!important;transition:border-color .15s ease,transform .15s ease!important}
.carma-mod-pn-cell:hover{border-color:var(--ct-accent)!important;transform:translateY(-2px)!important}
.carma-mod-pn-next{text-align:right!important;align-items:flex-end!important}
.carma-mod-pn-empty{border:0!important;background:transparent!important}
.carma-mod-pn-dir{font-size:.74rem!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.04em!important;color:var(--ct-accent)!important}
.carma-mod-pn-title{font-family:var(--ct-font-heading)!important;font-weight:700!important;color:var(--ct-text)!important;line-height:1.3!important}
.carma-mod-pn-minimal .carma-mod-pn-cell{border:0!important;background:transparent!important;padding:.6rem 0!important}
.carma-mod-pn-minimal .carma-mod-pn-cell:hover{transform:none!important}
.carma-mod-pn-bar{grid-template-columns:1fr 1fr!important;gap:0!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius)!important;overflow:hidden!important}
.carma-mod-pn-bar .carma-mod-pn-cell{border:0!important;border-radius:0!important}
.carma-mod-pn-bar .carma-mod-pn-next{border-left:1px solid var(--ct-border)!important}
@media(max-width:560px){.carma-mod-pn{grid-template-columns:1fr!important}}`.trim()

const TOC_CSS = `
.carma-mod-toc-head{font-size:.74rem!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.07em!important;color:var(--ct-muted)!important;margin:0 0 .6rem!important}
.carma-mod-toc-list{list-style:none!important;margin:0!important;padding:0!important;display:flex!important;flex-direction:column!important;gap:.35rem!important}
.carma-mod-toc-list a{color:var(--ct-muted)!important;text-decoration:none!important;font-size:.9rem!important;line-height:1.4!important;transition:color .15s ease!important}
.carma-mod-toc-list a:hover{color:var(--ct-accent)!important}
.carma-mod-toc-l3{padding-left:.9rem!important;font-size:.85rem!important}
.carma-mod-toc-top{margin:0 0 1.75rem!important;border:1px solid var(--ct-border)!important;border-left:3px solid var(--ct-accent)!important;border-radius:var(--ct-radius)!important;padding:.9rem 1.2rem!important;background:var(--ct-surface)!important}
.carma-mod-toc-top>summary{cursor:pointer!important;font-weight:800!important;color:var(--ct-text)!important;list-style:none!important}
.carma-mod-toc-top>summary::-webkit-details-marker{display:none!important}
.carma-mod-toc-top .carma-mod-toc-list{margin-top:.7rem!important}
.carma-mod-toc-sidebar{position:fixed!important;top:50%!important;transform:translateY(-50%)!important;right:max(1.25rem,calc(50vw - 640px))!important;width:230px!important;max-height:70vh!important;overflow:auto!important;z-index:35!important;background:var(--ct-surface)!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;padding:1.1rem 1.2rem!important;box-shadow:0 16px 40px -24px rgba(0,0,0,.4)!important}
@media(max-width:1280px){.carma-mod-toc-sidebar{display:none!important}}
.carma-mod-toc-floating{position:fixed!important;left:1.25rem!important;bottom:1.25rem!important;z-index:45!important}
.carma-mod-toc-fab{width:48px!important;height:48px!important;border-radius:9999px!important;border:1px solid var(--ct-border)!important;background:var(--ct-surface)!important;color:var(--ct-text)!important;font-size:1.2rem!important;cursor:pointer!important;box-shadow:0 10px 26px -14px rgba(0,0,0,.4)!important}
.carma-mod-toc-panel[hidden]{display:none!important}
.carma-mod-toc-floating .carma-mod-toc-panel{position:absolute!important;bottom:58px!important;left:0!important;width:260px!important;max-height:60vh!important;overflow:auto!important;background:var(--ct-surface)!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;padding:1.1rem 1.2rem!important;box-shadow:0 16px 40px -24px rgba(0,0,0,.4)!important}`.trim()

const PROGRESS_CSS = `
.carma-mod-progress{position:fixed!important;top:0!important;left:0!important;right:0!important;height:4px!important;z-index:55!important;background:color-mix(in srgb,var(--ct-accent) 18%,transparent)!important}
.carma-mod-progress>span{display:block!important;height:100%!important;width:0!important;background:var(--ct-accent)!important;transition:width .08s linear!important}
.carma-mod-readtime{display:inline-flex!important;align-items:center!important;gap:.4rem!important;font-size:.82rem!important;font-weight:700!important;color:var(--ct-muted)!important;margin:0 0 1.25rem!important}
.carma-mod-readtime::before{content:'⏱'!important}
.carma-mod-progc{position:fixed!important;right:1.5rem!important;bottom:1.5rem!important;width:52px!important;height:52px!important;z-index:45!important;opacity:0!important;pointer-events:none!important;transition:opacity .2s ease!important}
.carma-mod-progc.is-on{opacity:1!important;pointer-events:auto!important;cursor:pointer!important}
.carma-mod-progc svg{width:100%!important;height:100%!important;transform:rotate(-90deg)!important}
.carma-mod-progc-bg{fill:var(--ct-surface)!important;stroke:var(--ct-border)!important;stroke-width:3!important}
.carma-mod-progc-fg{fill:none!important;stroke:var(--ct-accent)!important;stroke-width:3!important;stroke-dasharray:100!important;stroke-dashoffset:100!important;stroke-linecap:round!important}
.carma-mod-progc-arrow{position:absolute!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:1.1rem!important;color:var(--ct-text)!important}`.trim()

const TOTOP_CSS = `
.carma-mod-totop{position:fixed!important;right:1.5rem!important;bottom:1.5rem!important;z-index:44!important;display:inline-flex!important;align-items:center!important;gap:.4rem!important;border:1px solid var(--ct-border)!important;background:var(--ct-surface)!important;color:var(--ct-text)!important;cursor:pointer!important;opacity:0!important;transform:translateY(8px)!important;transition:opacity .2s ease,transform .2s ease,background .15s ease!important;pointer-events:none!important;box-shadow:0 12px 30px -16px rgba(0,0,0,.4)!important}
.carma-mod-totop.is-on{opacity:1!important;transform:translateY(0)!important;pointer-events:auto!important}
.carma-mod-totop:hover{background:var(--ct-accent)!important;border-color:var(--ct-accent)!important;color:#fff!important}
.carma-mod-totop-circle{width:48px!important;height:48px!important;border-radius:9999px!important;justify-content:center!important}
.carma-mod-totop-pill{height:44px!important;padding:0 1.1rem!important;border-radius:9999px!important;font-weight:700!important;font-size:.85rem!important}
.carma-mod-totop-minimal{width:42px!important;height:42px!important;border-radius:var(--ct-radius)!important;justify-content:center!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important}
.carma-mod-totop-arrow{font-size:1.1rem!important;line-height:1!important}`.trim()

const DARK_CSS = `
.carma-mod-dark{position:fixed!important;left:1.5rem!important;bottom:1.5rem!important;z-index:44!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border:1px solid var(--ct-border)!important;background:var(--ct-surface)!important;color:var(--ct-text)!important;cursor:pointer!important;box-shadow:0 12px 30px -16px rgba(0,0,0,.4)!important}
.carma-mod-dark-icon{width:48px!important;height:48px!important;border-radius:9999px!important;font-size:1.15rem!important}
.carma-mod-dark-switch{height:44px!important;padding:0 .35rem!important;border-radius:9999px!important;gap:.2rem!important}
.carma-mod-dark-sun,.carma-mod-dark-moon{width:34px!important;height:34px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border-radius:9999px!important;font-size:1rem!important}
.carma-mod-dark-icon .carma-mod-dark-moon{display:none!important}
:host([data-carma-theme="dark"]) .carma-mod-dark-icon .carma-mod-dark-sun{display:none!important}
:host([data-carma-theme="dark"]) .carma-mod-dark-icon .carma-mod-dark-moon{display:inline-flex!important}
.carma-mod-dark-switch .carma-mod-dark-sun{background:var(--ct-accent)!important;color:#fff!important}
.carma-mod-dark-switch .carma-mod-dark-moon{background:transparent!important;color:var(--ct-muted)!important}
:host([data-carma-theme="dark"]) .carma-mod-dark-switch .carma-mod-dark-sun{background:transparent!important;color:var(--ct-muted)!important}
:host([data-carma-theme="dark"]) .carma-mod-dark-switch .carma-mod-dark-moon{background:var(--ct-accent)!important;color:#fff!important}`.trim()
