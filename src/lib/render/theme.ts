// Shared builders for the public /render routes AND the dashboard preview.
//
// Model (Magic Wand — LLM Reconstruction Engine):
//   · We no longer transplant the client's real CSS. Claude REBUILDS each region
//     (header/footer) as a pristine, self-contained component: clean semantic
//     HTML + a tiny dedicated stylesheet whose selectors are namespaced under
//     `[data-carma-chrome="header|footer"]`.
//   · At render time scopeChromeCss() force-scopes every selector under that
//     namespace and prepends an `all:initial` reset on the wrapper — so the
//     chrome cannot leak styles OUT and the page cannot leak styles IN. Zero
//     collisions, no iframe, no Shadow DOM, fully native + responsive.
//   · extracted_header/footer = JSON { html, css } (the rebuilt component).
//     extracted_head is no longer used. The blog feed between them is OUR
//     template (.carma-root).

import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import { scopeChromeCss } from '@/lib/render/scopeCss'
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, isLocale, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { parse, type HTMLElement } from 'node-html-parser'

type ChromeI18nEntry = { header?: string | null; footer?: string | null; section_title?: string | null }

type Theme = {
  extracted_head?: string | null // legacy — no longer used for chrome
  extracted_header?: string | null // JSON { html, css } — rebuilt component (default locale)
  extracted_footer?: string | null // JSON { html, css } — rebuilt component (default locale)
  font_links?: string[] | null
  design_tokens?: Partial<DesignTokens> | null
  section_title?: string | null // the client's news/blog page heading (default locale)
  default_locale?: string | null // which locale the base chrome represents
  chrome_i18n?: Record<string, ChromeI18nEntry> | null // translated chrome per locale
} | null

type ChromeRegion = { html: string; css?: string }

type LocalizedVariant = {
  title?: string | null
  slug?: string | null
  content?: { html?: string } | Record<string, unknown> | null
  excerpt?: string | null
  seo_title?: string | null
  seo_description?: string | null
}

type Post = {
  id: string
  title: string
  slug: string
  content: { html?: string } | Record<string, unknown> | null
  excerpt: string | null
  featured_image: string | null
  categories: string[] | null
  tags: string[] | null
  author_name: string | null
  created_at: string
  is_published: boolean
  seo_title?: string | null
  seo_description?: string | null
  meta?: Record<string, unknown> | null
  i18n?: Record<string, LocalizedVariant> | null
  default_locale?: string | null
}

type HeadSeo = {
  description?: string | null
  image?: string | null
  canonical?: string | null
  noindex?: boolean
  ogTitle?: string | null
  type?: 'article' | 'website'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
const escapeAttr = escapeHtml

const BCP47: Record<Locale, string> = { en: 'en-US', es: 'es-ES', ca: 'ca-ES' }

function formatDate(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  try {
    return new Date(iso).toLocaleDateString(BCP47[locale], { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return iso }
}

// The few UI strings the render emits itself (everything else is the client's
// own content). Localized so a non-default-language blog reads natively.
const RENDER_STRINGS: Record<Locale, { back: string; home: string; articles: string; emptyTitle: string; emptyDesc: (s: string) => string }> = {
  en: {
    back: '← Back to list', home: 'Home', articles: 'Articles',
    emptyTitle: 'No published articles yet',
    emptyDesc: (s) => `When you publish articles on Carma for <strong>${escapeHtml(s)}</strong>, they'll appear here styled like your site.`,
  },
  es: {
    back: '← Volver al listado', home: 'Inicio', articles: 'Artículos',
    emptyTitle: 'Aún no hay artículos publicados',
    emptyDesc: (s) => `Cuando publiques artículos en Carma para <strong>${escapeHtml(s)}</strong>, aparecerán aquí con el diseño de tu sitio.`,
  },
  ca: {
    back: '← Tornar al llistat', home: 'Inici', articles: 'Articles',
    emptyTitle: 'Encara no hi ha articles publicats',
    emptyDesc: (s) => `Quan publiquis articles a Carma per <strong>${escapeHtml(s)}</strong>, apareixeran aquí amb el disseny del teu lloc.`,
  },
}

function htmlFromContent(c: LocalizedVariant['content'] | Post['content']): string {
  if (c && typeof c === 'object' && 'html' in c && typeof (c as { html: unknown }).html === 'string') {
    return (c as { html: string }).html
  }
  return ''
}

function getContentHtml(post: Post): string {
  return htmlFromContent(post.content)
}

function postDefaultLocale(post: Post): Locale {
  return normalizeLocale(post.default_locale, DEFAULT_LOCALE)
}

// Locales (in platform order) for which this post has real content. The default
// locale (flat columns) is always present.
function postLocales(post: Post): Locale[] {
  const set = new Set<Locale>([postDefaultLocale(post)])
  for (const [loc, v] of Object.entries(post.i18n ?? {})) {
    if (!isLocale(loc) || !v) continue
    if ((v.title ?? '').trim() || htmlFromContent(v.content).trim()) set.add(loc)
  }
  return LOCALES.filter(l => set.has(l))
}

// Overlay a non-default locale's variant onto the post. Any field the variant
// leaves empty falls back to the default-locale (flat) value.
function localizePost(post: Post, locale: Locale): Post {
  if (locale === postDefaultLocale(post)) return post
  const v = post.i18n?.[locale]
  if (!v) return post
  return {
    ...post,
    title: (v.title ?? '').trim() || post.title,
    content: htmlFromContent(v.content).trim() ? (v.content as Post['content']) : post.content,
    excerpt: (v.excerpt ?? '').trim() ? v.excerpt! : post.excerpt,
    seo_title: (v.seo_title ?? '').trim() ? v.seo_title! : post.seo_title,
    seo_description: (v.seo_description ?? '').trim() ? v.seo_description! : post.seo_description,
  }
}

// Append the locale as a query param for non-default locales (keeps default URLs clean).
function withLang(path: string, locale: Locale): string {
  return locale === DEFAULT_LOCALE ? path : `${path}?lang=${locale}`
}

// Compact pure-CSS language switcher (body fallback used only when a site has no
// header to host the switcher). `basePath` is the page the links point at.
function buildLangSwitcher(locales: Locale[], current: Locale, basePath: string): string {
  if (locales.length < 2) return ''
  const items = locales.map(loc => {
    const active = loc === current
    return `<a class="carma-lang${active ? ' is-active' : ''}" href="${escapeAttr(withLang(basePath, loc))}"${active ? ' aria-current="true"' : ''} hreflang="${loc}" title="${escapeAttr(LOCALE_META[loc].label)}">${LOCALE_META[loc].flag} ${escapeHtml(loc.toUpperCase())}</a>`
  }).join('')
  return `<nav class="carma-langbar" aria-label="Language">${items}</nav>`
}

type LangContext = { locales: Locale[]; current: Locale; basePath: string; tokens: DesignTokens }

// The <a> items for the in-header switcher. `linkClass` lets reused native
// containers keep their own link styling (we clone the source link's class).
function buildLangItems(ctx: LangContext, linkClass: string): string {
  return ctx.locales.map(loc => {
    const active = loc === ctx.current
    // For a reused NATIVE selector we add the common "active" class names too, so
    // the site's own CSS highlights the current language; `is-active` drives our
    // injected switcher's styling.
    const cls = ['cx-lang-link', active ? 'is-active active current selected' : '', linkClass].filter(Boolean).join(' ')
    return `<a class="${escapeAttr(cls)}" href="${escapeAttr(withLang(ctx.basePath, loc))}" hreflang="${loc}" data-carma-lang="${loc}"${active ? ' aria-current="page"' : ''}>${LOCALE_META[loc].flag} ${escapeHtml(loc.toUpperCase())}</a>`
  }).join('')
}

// Find a native language selector inside the header: first by hreflang anchors,
// then by a small links container whose class/id hints at "language".
function findNativeLangSelector(root: HTMLElement): { container: HTMLElement; linkClass: string } | null {
  // 1. hreflang anchors (≥2 = a real switcher). Climb to the smallest container
  //    that holds ALL of them WITHOUT also wrapping a big nav (guards against
  //    accidentally replacing the whole header).
  const hrefLang = root.querySelectorAll('a[hreflang]')
  if (hrefLang.length >= 2) {
    let c = hrefLang[0].parentNode as unknown as HTMLElement | null
    for (let hops = 0; c && hops < 3; hops++) {
      const inside = c.querySelectorAll('a[hreflang]').length
      const totalLinks = c.querySelectorAll('a').length
      if (inside === hrefLang.length && totalLinks <= hrefLang.length + 1) {
        return { container: c, linkClass: hrefLang[0].getAttribute('class') ?? '' }
      }
      c = c.parentNode as unknown as HTMLElement | null
    }
  }
  // 2. A small links container whose class/id hints at "language".
  const LANG_RE = /lang|locale|idioma|language|lengua|lleng/i
  for (const el of root.querySelectorAll('ul, nav, div, span')) {
    const hint = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`
    if (!LANG_RE.test(hint)) continue
    const links = el.querySelectorAll('a')
    if (links.length >= 1 && links.length <= 8) {
      return { container: el, linkClass: links[0]?.getAttribute('class') ?? '' }
    }
  }
  return null
}

// Put the language switcher INSIDE the header chrome. If the header already has a
// native selector we reuse its container (keeping its native styling) and just
// swap the options; otherwise we append our own, styled with the site's tokens.
// Returns the (possibly modified) header HTML + any extra un-namespaced CSS to
// fold into the header's scoped stylesheet.
function injectHeaderLangSwitcher(headerHtml: string, ctx: LangContext): { html: string; css: string } {
  if (ctx.locales.length < 2) return { html: headerHtml, css: '' }
  let root: HTMLElement
  try { root = parse(headerHtml) } catch { return { html: headerHtml, css: '' } }

  const native = findNativeLangSelector(root)
  if (native) {
    native.container.set_content(buildLangItems(ctx, native.linkClass))
    native.container.setAttribute('data-carma-langs', '')
    return { html: root.toString(), css: '' } // inherits the native styling
  }

  // No native selector — inject our own into a sensible header host.
  const host = root.querySelector('nav') ?? root.querySelector('header, div, section') ?? root
  try {
    host.insertAdjacentHTML('beforeend', `<div class="cx-carma-langs" data-carma-langs>${buildLangItems(ctx, '')}</div>`)
  } catch { return { html: headerHtml, css: '' } }

  const t = ctx.tokens
  // Un-namespaced — scopeChromeCss prefixes [data-carma-chrome="header"] for us.
  const css = `
.cx-carma-langs{display:inline-flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin-left:auto}
.cx-carma-langs .cx-lang-link{display:inline-flex;align-items:center;gap:.28rem;font-family:${t.fontBody};font-size:.78rem;font-weight:700;line-height:1;padding:.38rem .68rem;border-radius:9999px;text-decoration:none;color:${t.colorText};border:1px solid ${t.colorBorder};background:transparent;transition:color .15s ease,border-color .15s ease,background .15s ease}
.cx-carma-langs .cx-lang-link:hover{border-color:${t.colorAccent};color:${t.colorAccent}}
.cx-carma-langs .cx-lang-link.is-active{background:${t.colorAccent};border-color:${t.colorAccent};color:#fff}`
  return { html: root.toString(), css }
}

// Fill any Table-of-Contents placeholder (`<nav data-carma-toc>`) from the
// article's headings, linking to the ids emitted by the HeadingId extension.
// Keeps the saved content minimal and the TOC always in sync with the headings.
function fillTableOfContents(html: string): string {
  if (!html.includes('data-carma-toc')) return html
  try {
    const root = parse(html)
    const navs = root.querySelectorAll('nav.carma-toc')
    if (navs.length === 0) return html

    const headings = root.querySelectorAll('h1, h2, h3')
      .map(h => ({
        level: Number(h.tagName.replace(/\D/g, '')) || 2,
        id: h.getAttribute('id') ?? '',
        text: h.text.trim(),
      }))
      .filter(h => h.text && h.id)

    const inner = headings.length
      ? `<div class="carma-toc-title">Índex</div><ol>${headings
          .map(h => `<li class="lvl-${h.level}"><a href="#${escapeAttr(h.id)}">${escapeHtml(h.text)}</a></li>`)
          .join('')}</ol>`
      : ''

    for (const nav of navs) nav.set_content(inner)
    return root.toString()
  } catch {
    return html
  }
}

function tokensOf(theme: Theme): DesignTokens {
  return { ...DEFAULT_TOKENS, ...(theme?.design_tokens ?? {}) }
}

// ─── Token-driven CSS ───────────────────────────────────────────────────────

function buildLayoutCss(t: DesignTokens): string {
  const cols = t.columns === '2' ? 2 : t.columns === '4' ? 4 : 3
  if (t.layout === 'list') {
    // Stacked, horizontal media-left cards; collapse to vertical on mobile.
    return `
.carma-grid{display:flex!important;flex-direction:column!important;gap:1.25rem!important;width:100%!important}
.carma-card-link{flex-direction:row!important;align-items:stretch!important}
.carma-card-media{aspect-ratio:auto!important;width:38%!important;max-width:360px!important;min-height:200px!important}
.carma-card-body{justify-content:center!important}
@media (max-width:680px){
  .carma-card-link{flex-direction:column!important}
  .carma-card-media{width:100%!important;aspect-ratio:16/9!important;max-width:none!important;min-height:0!important}
}`.trim()
  }
  return `
.carma-grid{display:grid!important;grid-template-columns:1fr!important;gap:1.75rem!important;width:100%!important}
@media (min-width:640px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(${cols},minmax(0,1fr))!important}}`.trim()
}

function buildTemplateCss(t: DesignTokens): string {
  return `
:root{
  --ct-primary:${t.colorPrimary};
  --ct-accent:${t.colorAccent};
  --ct-bg:${t.colorBg};
  --ct-surface:${t.colorSurface};
  --ct-text:${t.colorText};
  --ct-muted:${t.colorMuted};
  --ct-border:${t.colorBorder};
  --ct-font-heading:${t.fontHeading};
  --ct-font-body:${t.fontBody};
  --ct-size:${t.baseFontSize};
  --ct-radius:${t.radius};
  --ct-radius-lg:${t.radiusLg};
  --ct-max:${t.maxWidth};
}

/* Render-document base — this standalone page only. Never reaches the chrome
   shadow roots (encapsulated) nor the dashboard (separate document). */
html,body{margin:0;padding:0;background:var(--ct-bg)}

/* ── Isolation reset ──
   The render document ships ZERO of the client's CSS (the chrome carries its own
   namespaced styles), so nothing can cascade in. These !important resets + an
   own stacking/containment context make the blog structurally immune to any
   inherited or future page styles — our layout is fully self-governed. */
.carma-root,.carma-root *,.carma-root *::before,.carma-root *::after{box-sizing:border-box!important}
.carma-root{
  display:block!important;
  width:100%!important;
  isolation:isolate!important;
  background:var(--ct-bg)!important;
  color:var(--ct-text)!important;
  font-family:var(--ct-font-body)!important;
  font-size:var(--ct-size)!important;
  line-height:1.65!important;
  -webkit-font-smoothing:antialiased;
}
.carma-root h1,.carma-root h2,.carma-root h3,.carma-root h4,.carma-root h5,.carma-root h6{
  font-family:var(--ct-font-heading)!important;
  color:var(--ct-text)!important;
  font-style:normal!important;
  text-transform:none!important;
  letter-spacing:normal!important;
  line-height:1.2!important;
  margin:0!important;
}
.carma-root a{color:inherit!important;text-decoration:none!important;background:none!important}
.carma-root img{display:block!important;max-width:100%!important;border:none!important;outline:none!important}
.carma-root p{margin:0!important}
.carma-root ul,.carma-root ol{list-style:none!important;margin:0!important;padding:0!important}

/* ── Layout ──
   Full-width fluid blog area. We intentionally do NOT use the scraped --ct-max
   here (sites often expose a narrow container, which cramped the grid). The feed
   uses the full width up to a generous cap, with fluid side padding. */
.carma-main{width:100%!important;max-width:1600px!important;margin:0 auto!important;padding:3rem clamp(1rem,4vw,3.5rem)!important}

/* Language switcher */
.carma-langbar{display:flex!important;gap:.4rem!important;flex-wrap:wrap!important;margin:0 0 1.1rem!important}
.carma-langbar .carma-lang{display:inline-flex!important;align-items:center!important;gap:.3rem!important;padding:.4rem .75rem!important;border:1px solid var(--ct-border)!important;border-radius:9999px!important;font-size:.78rem!important;font-weight:700!important;color:var(--ct-muted)!important;text-decoration:none!important;background:var(--ct-surface)!important;line-height:1!important;transition:color .15s ease,border-color .15s ease,background .15s ease!important}
.carma-langbar .carma-lang:hover{color:var(--ct-text)!important;border-color:var(--ct-accent)!important}
.carma-langbar .carma-lang.is-active{background:var(--ct-accent)!important;border-color:var(--ct-accent)!important;color:#fff!important}

/* Section heading — fully styleable from the Theme Studio */
.carma-section-head{margin:0 0 1.5rem!important}
.carma-section-head.has-image{background-size:cover!important;background-position:center!important;border-radius:var(--ct-radius-lg)!important;padding:2.75rem 2rem!important;position:relative!important;overflow:hidden!important}
.carma-section-head.has-image::before{content:''!important;position:absolute!important;inset:0!important;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.5))!important}
.carma-section-head.has-image .carma-breadcrumb,.carma-section-head.has-image .carma-section-title{position:relative!important;z-index:1!important}
.carma-breadcrumb{display:flex!important;gap:.5rem!important;align-items:center!important;font-size:.85rem!important;color:var(--ct-muted)!important;margin:0 0 .6rem!important}
.carma-breadcrumb a{color:var(--ct-accent)!important;text-decoration:none!important}
.carma-section-head.has-image .carma-breadcrumb{color:rgba(255,255,255,.85)!important}
.carma-section-head.has-image .carma-breadcrumb a{color:#fff!important}
.carma-root .carma-section-head .carma-section-title{font-family:var(--ct-font-heading)!important;font-size:${t.sectionTitleSize ?? '1.6rem'}!important;font-weight:${t.sectionTitleWeight ?? '800'}!important;color:${t.sectionTitleColor ?? 'var(--ct-text)'}!important;text-align:${t.sectionTitleAlign ?? 'left'}!important;max-width:${t.sectionTitleWidth ?? '100%'}!important;${t.sectionTitleAlign === 'center' ? 'margin-left:auto!important;margin-right:auto!important;' : ''}${t.sectionTitleHeight ? `min-height:${t.sectionTitleHeight}!important;display:flex!important;align-items:center!important;` : ''}margin-top:0!important;margin-bottom:0!important;line-height:1.2!important}

.carma-card{background:var(--ct-surface)!important;border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;box-shadow:0 4px 6px -1px rgba(0,0,0,.07),0 2px 4px -2px rgba(0,0,0,.05)!important;transition:transform .2s ease,box-shadow .2s ease}
.carma-card:hover{transform:translateY(-4px)!important;box-shadow:0 18px 40px -18px rgba(0,0,0,.3)!important}
.carma-card-link{display:flex!important;flex-direction:column!important;flex:1!important;color:inherit!important;text-decoration:none!important}
.carma-card-media{aspect-ratio:16/9!important;background:var(--ct-border)!important;overflow:hidden!important;flex-shrink:0!important}
.carma-card-media img{width:100%!important;height:100%!important;object-fit:cover!important;transition:transform .35s ease}
.carma-card:hover .carma-card-media img{transform:scale(1.05)!important}
.carma-card-body{padding:1.3rem 1.4rem 1.55rem!important;display:flex!important;flex-direction:column!important;gap:.65rem!important;flex:1!important}
.carma-card-title{font-size:1.2rem!important;font-weight:700!important;color:var(--ct-text)!important;margin:0!important;line-height:1.3!important}
.carma-card-excerpt{color:var(--ct-muted)!important;font-size:.93rem!important;margin:0!important;line-height:1.6!important;display:-webkit-box!important;-webkit-line-clamp:3;-webkit-box-orient:vertical!important;overflow:hidden!important;flex:1!important}
.carma-meta{font-size:.76rem!important;color:var(--ct-muted)!important;font-weight:600!important;display:flex!important;gap:.5rem!important;align-items:center!important;flex-wrap:wrap!important;text-transform:uppercase!important;letter-spacing:.03em!important}
.carma-meta .carma-cat{color:var(--ct-accent)!important}
.carma-card-link:hover .carma-card-title{color:var(--ct-accent)!important}

/* Article */
.carma-article{max-width:760px!important;margin:0 auto!important}
.carma-back{display:inline-flex!important;align-items:center!important;gap:.4rem!important;color:var(--ct-accent)!important;font-weight:600!important;font-size:.88rem!important;margin-bottom:1.5rem!important;text-decoration:none!important}
.carma-article-title{font-size:2.5rem!important;font-weight:800!important;margin:0 0 1rem!important;line-height:1.15!important;color:var(--ct-text)!important}
.carma-article-meta{font-size:.9rem!important;color:var(--ct-muted)!important;margin-bottom:1.75rem!important;display:flex!important;gap:.6rem!important;flex-wrap:wrap!important}
.carma-article-image{width:100%!important;max-height:460px!important;object-fit:cover!important;border-radius:var(--ct-radius-lg)!important;margin-bottom:2rem!important}
.carma-article-content{font-size:1.08rem!important;color:var(--ct-text)!important;line-height:1.8!important}
.carma-article-content p{margin:1.15rem 0!important}
.carma-article-content h2{font-family:var(--ct-font-heading)!important;font-size:1.6rem!important;margin:2rem 0 .75rem!important;color:var(--ct-text)!important}
.carma-article-content h3{font-family:var(--ct-font-heading)!important;font-size:1.3rem!important;margin:1.6rem 0 .6rem!important;color:var(--ct-text)!important}
.carma-article-content img{border-radius:var(--ct-radius);margin:1.5rem 0!important}
.carma-article-content a{color:var(--ct-accent)!important;text-decoration:underline!important}
.carma-article-content blockquote{border-left:4px solid var(--ct-accent)!important;margin:1.5rem 0!important;padding:.5rem 0 .5rem 1.25rem!important;color:var(--ct-muted)!important;font-style:italic!important}
.carma-article-content ul,.carma-article-content ol{padding-left:1.4rem!important;margin:1.15rem 0!important;list-style:revert!important}
.carma-article-content .carma-callout{position:relative!important;margin:1.5rem 0!important;padding:1.1rem 1.25rem 1.1rem 3.1rem!important;border-radius:var(--ct-radius-lg)!important;border:1px solid!important;font-size:1rem!important;line-height:1.65!important}
.carma-article-content .carma-callout>*:first-child{margin-top:0!important}
.carma-article-content .carma-callout>*:last-child{margin-bottom:0!important}
.carma-article-content .carma-callout::before{position:absolute!important;left:1.05rem!important;top:1rem!important;font-size:1.15rem!important}
.carma-article-content .carma-callout[data-variant="info"]{background:#eff6ff!important;border-color:#bfdbfe!important;color:#1e3a8a!important}
.carma-article-content .carma-callout[data-variant="info"]::before{content:"💡"!important}
.carma-article-content .carma-callout[data-variant="success"]{background:#ecfdf5!important;border-color:#a7f3d0!important;color:#065f46!important}
.carma-article-content .carma-callout[data-variant="success"]::before{content:"✅"!important}
.carma-article-content .carma-callout[data-variant="warning"]{background:#fffbeb!important;border-color:#fde68a!important;color:#92400e!important}
.carma-article-content .carma-callout[data-variant="warning"]::before{content:"⚠️"!important}
.carma-article-content .carma-callout[data-variant="danger"]{background:#fef2f2!important;border-color:#fecaca!important;color:#991b1b!important}
.carma-article-content .carma-callout[data-variant="danger"]::before{content:"🚫"!important}
.carma-article-content .carma-gallery{position:relative!important;margin:1.6rem 0!important}
.carma-article-content .carma-gallery-track{display:flex!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important;scroll-behavior:smooth!important;border-radius:var(--ct-radius-lg)!important;gap:0!important}
.carma-article-content .carma-slide{position:relative!important;flex:0 0 100%!important;scroll-snap-align:center!important;aspect-ratio:16/9!important}
.carma-article-content .carma-gallery-item{display:block!important;width:100%!important;height:100%!important;text-decoration:none!important;cursor:zoom-in!important;background:var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;overflow:hidden!important}
.carma-article-content .carma-gallery-item img{width:100%!important;height:100%!important;object-fit:cover!important;margin:0!important}
.carma-article-content .carma-slide-arrow{position:absolute!important;top:50%!important;transform:translateY(-50%)!important;z-index:2!important;display:flex!important;align-items:center!important;justify-content:center!important;width:44px!important;height:44px!important;border-radius:9999px!important;background:rgba(255,255,255,.9)!important;color:#1c1917!important;text-decoration:none!important;font-size:26px!important;line-height:1!important;box-shadow:0 4px 14px -4px rgba(0,0,0,.4)!important}
.carma-article-content .carma-slide-arrow:hover{background:#fff!important}
.carma-article-content .carma-slide-arrow.prev{left:14px!important}
.carma-article-content .carma-slide-arrow.next{right:14px!important}
.carma-article-content .carma-lightbox{display:none!important}
.carma-article-content .carma-lightbox:target{display:flex!important;position:fixed!important;inset:0!important;z-index:9999!important;align-items:center!important;justify-content:center!important;background:rgba(0,0,0,.88)!important}
.carma-article-content .carma-lightbox-backdrop{position:absolute!important;inset:0!important}
.carma-article-content .carma-lightbox-img{max-width:88vw!important;max-height:85vh!important;object-fit:contain!important;border-radius:8px!important;position:relative!important;z-index:1!important;margin:0!important}
.carma-article-content .carma-lightbox-nav,.carma-article-content .carma-lightbox-close{position:absolute!important;z-index:2!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:9999px!important;background:rgba(255,255,255,.16)!important;color:#fff!important;text-decoration:none!important;line-height:1!important}
.carma-article-content .carma-lightbox-nav{top:50%!important;transform:translateY(-50%)!important;width:48px!important;height:48px!important;font-size:30px!important}
.carma-article-content .carma-lightbox-nav:hover,.carma-article-content .carma-lightbox-close:hover{background:rgba(255,255,255,.32)!important}
.carma-article-content .carma-lightbox-nav.prev{left:16px!important}
.carma-article-content .carma-lightbox-nav.next{right:16px!important}
.carma-article-content .carma-lightbox-close{top:16px!important;right:16px!important;width:40px!important;height:40px!important;font-size:24px!important}
.carma-article-content figure.carma-figure{margin:1.75rem 0!important}
.carma-article-content figure.carma-figure img{width:100%!important;border-radius:var(--ct-radius-lg)!important;margin:0 0 .5rem!important}
.carma-article-content figure.carma-figure figcaption{text-align:center!important;font-size:.88rem!important;color:var(--ct-muted)!important;font-style:italic!important}
.carma-article-content .carma-columns{display:grid!important;grid-template-columns:1fr 1fr!important;gap:1.5rem!important;margin:1.6rem 0!important}
.carma-article-content .carma-column{min-width:0!important}
.carma-article-content .carma-column>*:first-child{margin-top:0!important}
@media (max-width:640px){.carma-article-content .carma-columns{grid-template-columns:1fr!important}}
.carma-article-content details.carma-toggle{border:1px solid var(--ct-border)!important;border-radius:var(--ct-radius)!important;padding:.5rem 1.2rem!important;margin:1.5rem 0!important;background:var(--ct-surface)!important}
.carma-article-content details.carma-toggle>summary{cursor:pointer!important;font-weight:700!important;list-style:none!important;padding:.5rem 0!important;color:var(--ct-text)!important}
.carma-article-content details.carma-toggle>summary::-webkit-details-marker{display:none!important}
.carma-article-content details.carma-toggle>summary::before{content:'▸'!important;display:inline-block!important;margin-right:.5rem!important;transition:transform .2s ease!important;color:var(--ct-muted)!important}
.carma-article-content details.carma-toggle[open]>summary::before{transform:rotate(90deg)!important}
.carma-article-content .carma-toc{display:block!important;border:1px solid var(--ct-border)!important;border-left:3px solid var(--ct-accent)!important;border-radius:var(--ct-radius)!important;padding:1rem 1.25rem!important;margin:1.75rem 0!important;background:var(--ct-surface)!important}
.carma-article-content .carma-toc-title{font-size:.78rem!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.08em!important;color:var(--ct-muted)!important;margin:0 0 .5rem!important}
.carma-article-content .carma-toc ol{list-style:none!important;margin:0!important;padding:0!important}
.carma-article-content .carma-toc li{margin:.25rem 0!important}
.carma-article-content .carma-toc li.lvl-2{padding-left:.85rem!important}
.carma-article-content .carma-toc li.lvl-3{padding-left:1.7rem!important;font-size:.95em!important}
.carma-article-content .carma-toc a{color:var(--ct-text)!important;text-decoration:none!important}
.carma-article-content .carma-toc a:hover{color:var(--ct-accent)!important;text-decoration:underline!important}
.carma-article-content .carma-button-wrap{margin:1.6rem 0!important}
.carma-article-content .carma-button-wrap[data-align=center]{text-align:center!important}
.carma-article-content .carma-button-wrap[data-align=right]{text-align:right!important}
.carma-article-content a.carma-button{display:inline-block!important;background:var(--ct-accent)!important;color:#fff!important;font-weight:700!important;padding:.7rem 1.5rem!important;border-radius:var(--ct-radius)!important;text-decoration:none!important;transition:opacity .2s ease!important}
.carma-article-content a.carma-button:hover{opacity:.88!important}

/* Empty state */
.carma-empty{text-align:center!important;padding:4.5rem 2rem!important;background:var(--ct-surface)!important;border:2px dashed var(--ct-border)!important;border-radius:var(--ct-radius-lg)!important;max-width:560px!important;margin:0 auto!important}
.carma-empty-title{font-size:1.3rem!important;font-weight:800!important;margin:0 0 .6rem!important;color:var(--ct-text)!important}
.carma-empty-desc{color:var(--ct-muted)!important;margin:0!important;font-size:.95rem!important}

@media (max-width:720px){
  .carma-article-title{font-size:1.9rem!important}
}

/* Feed layout (grid/list) — emitted LAST so it overrides the card defaults above. */
${buildLayoutCss(t)}
`.trim()
}

function isFontStylesheet(href: string): boolean {
  return /fonts\.(googleapis|gstatic)\.com|use\.typekit|typography\.com|cloud\.typography|fonts\.adobe|fonts\.bunny|fontawesome/i.test(href)
}

// The validated, de-duplicated font stylesheet URLs for this theme. Only http(s)
// font-provider URLs survive — never an arbitrary client stylesheet.
function collectFontHrefs(theme: Theme): string[] {
  const links = theme?.font_links ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const href of links) {
    if (!href || seen.has(href)) continue
    seen.add(href)
    if (!/^https?:\/\//i.test(href) || !isFontStylesheet(href)) continue
    out.push(href)
  }
  return out
}

function buildFontLinks(theme: Theme): string {
  return collectFontHrefs(theme)
    .map(href => `<link rel="stylesheet" href="${escapeAttr(href)}" />`)
    .join('\n')
}

function buildHead(theme: Theme, title: string, tokens: DesignTokens, seo?: HeadSeo): string {
  const ogTitle = seo?.ogTitle ?? title
  const parts: string[] = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
  ]
  // SEO / social meta — applied from the post's SEO tab.
  if (seo?.description) parts.push(`<meta name="description" content="${escapeAttr(seo.description)}" />`)
  if (seo?.canonical) parts.push(`<link rel="canonical" href="${escapeAttr(seo.canonical)}" />`)
  parts.push(`<meta name="robots" content="${seo?.noindex ? 'noindex, nofollow' : 'index, follow'}" />`)
  parts.push(`<meta property="og:type" content="${seo?.type ?? 'website'}" />`)
  parts.push(`<meta property="og:title" content="${escapeAttr(ogTitle)}" />`)
  if (seo?.description) parts.push(`<meta property="og:description" content="${escapeAttr(seo.description)}" />`)
  if (seo?.image) parts.push(`<meta property="og:image" content="${escapeAttr(seo.image)}" />`)
  parts.push(`<meta name="twitter:card" content="${seo?.image ? 'summary_large_image' : 'summary'}" />`)
  parts.push(`<meta name="twitter:title" content="${escapeAttr(ogTitle)}" />`)
  if (seo?.description) parts.push(`<meta name="twitter:description" content="${escapeAttr(seo.description)}" />`)
  if (seo?.image) parts.push(`<meta name="twitter:image" content="${escapeAttr(seo.image)}" />`)
  // Fonts for our middle template (and, being document-scoped, also available to
  // the chrome shadow roots).
  const fonts = buildFontLinks(theme)
  if (fonts) parts.push(fonts)
  // OUR template CSS (.carma-root) + the chrome host shell. No client CSS lives
  // here — each rebuilt region carries its own scoped stylesheet inline.
  parts.push(`<style>${buildTemplateCss(tokens)}\n.cx-host{display:block}</style>`)
  return parts.join('\n')
}

// ─── Native chrome via LLM reconstruction + deterministic scoping ─────────────

function parseRegion(json: string | null | undefined): ChromeRegion | null {
  if (!json) return null
  const s = json.trim()
  if (!s.startsWith('{')) return null
  try {
    const o = JSON.parse(s) as ChromeRegion
    return o && typeof o.html === 'string' && o.html.trim() ? o : null
  } catch { return null }
}

// The locale the base chrome (extracted_header/footer/section_title) represents.
function chromeDefaultLocale(theme: Theme): Locale {
  return normalizeLocale(theme?.default_locale, DEFAULT_LOCALE)
}

// The raw JSON string for a chrome region in a given locale: the translated
// version from chrome_i18n when present, else the base (default-locale) chrome.
function chromeRegionRaw(theme: Theme, region: 'header' | 'footer', locale: Locale): string | null {
  if (locale !== chromeDefaultLocale(theme)) {
    const entry = theme?.chrome_i18n?.[locale]
    const v = region === 'header' ? entry?.header : entry?.footer
    if (v && v.trim()) return v
  }
  return (region === 'header' ? theme?.extracted_header : theme?.extracted_footer) ?? null
}

// The section/listing heading in a given locale (translated, else base, else the
// localized default literal).
function localizedSectionTitle(theme: Theme, locale: Locale): string {
  if (locale !== chromeDefaultLocale(theme)) {
    const t = theme?.chrome_i18n?.[locale]?.section_title
    if (t && t.trim()) return t.trim()
  }
  return theme?.section_title?.trim() || RENDER_STRINGS[locale].articles
}

function buildChrome(theme: Theme, region: 'header' | 'footer', locale: Locale, lang?: LangContext): string {
  const data = parseRegion(chromeRegionRaw(theme, region, locale))
  if (!data) return ''
  let html = data.html
  let rawCss = data.css ?? ''
  // Host the language switcher inside the HEADER (reusing a native selector when
  // present, else injecting our own styled with the site tokens).
  if (region === 'header' && lang && lang.locales.length >= 2) {
    const injected = injectHeaderLangSwitcher(html, lang)
    html = injected.html
    if (injected.css) rawCss += `\n${injected.css}`
  }
  // Guard against a `</style>` breakout, then force every selector under the
  // region namespace + prepend the all:initial isolation reset.
  const css = scopeChromeCss(rawCss.replace(/<\/style/gi, '<\\/style'), region)
  // Defense-in-depth: hand-edited chrome bypasses the analyze-time script strip.
  const safeHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
  return `<div class="cx-host cx-host-${region}" data-carma-chrome="${region}"><style>${css}</style>
${safeHtml}
</div>`
}

function buildCard(post: Post, siteId: string, locale: Locale): string {
  const loc = localizePost(post, locale)
  const href = withLang(`/render/${siteId}/${encodeURIComponent(post.slug)}`, locale)
  const media = loc.featured_image
    ? `<div class="carma-card-media"><img src="${escapeAttr(loc.featured_image)}" alt="${escapeAttr(loc.title)}" loading="lazy" /></div>`
    : ''
  const excerpt = loc.excerpt ? `<p class="carma-card-excerpt">${escapeHtml(loc.excerpt)}</p>` : ''
  const cat = loc.categories?.[0] ? `<span class="carma-cat">${escapeHtml(loc.categories[0])}</span><span>·</span>` : ''
  return `<article class="carma-card"><a class="carma-card-link" href="${escapeAttr(href)}">
  ${media}
  <div class="carma-card-body">
    <div class="carma-meta">${cat}<time datetime="${escapeAttr(loc.created_at)}">${escapeHtml(formatDate(loc.created_at, locale))}</time></div>
    <h2 class="carma-card-title">${escapeHtml(loc.title)}</h2>
    ${excerpt}
  </div>
</a></article>`
}

function buildEmptyState(siteName: string, locale: Locale): string {
  const s = RENDER_STRINGS[locale]
  return `<div class="carma-empty">
  <h2 class="carma-empty-title">${escapeHtml(s.emptyTitle)}</h2>
  <p class="carma-empty-desc">${s.emptyDesc(siteName)}</p>
</div>`
}

// ─── Body builders (shared by full-page render AND the embeddable fragment) ───

function listingBodyHtml(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale): string {
  const tokens = tokensOf(theme)
  const basePath = `/render/${siteId}`
  // Offer every locale that at least one published post provides.
  const available = LOCALES.filter(l => posts.some(p => postLocales(p).includes(l)))

  // The language switcher lives INSIDE the inherited header (serving both the
  // listing and the article). Only if there's no header do we fall back to a
  // small switcher above the feed.
  const header = buildChrome(theme, 'header', locale, { locales: available, current: locale, basePath, tokens })
  const footer = buildChrome(theme, 'footer', locale)
  const bodySwitcher = header ? '' : buildLangSwitcher(available, locale, basePath)

  const sectionTitle = localizedSectionTitle(theme, locale)
  const feed = posts.length === 0
    ? buildEmptyState(siteName, locale)
    : `<div class="carma-grid">\n${posts.map(p => buildCard(p, siteId, locale)).join('\n')}\n</div>`

  const crumb = tokens.showBreadcrumb
    ? `<nav class="carma-breadcrumb"><a href="${escapeAttr(withLang(basePath, locale))}">${escapeHtml(RENDER_STRINGS[locale].home)}</a><span>›</span><span>${escapeHtml(sectionTitle)}</span></nav>`
    : ''
  const hasImage = !!tokens.headingImage
  const headStyle = hasImage ? ` style="background-image:url('${escapeAttr(tokens.headingImage!)}')"` : ''
  const head = `<div class="carma-section-head${hasImage ? ' has-image' : ''}"${headStyle}>${crumb}<h1 class="carma-section-title">${escapeHtml(sectionTitle)}</h1></div>`

  return `${header}
<main class="carma-root carma-main">
${bodySwitcher}
${head}
${feed}
</main>
${footer}`
}

function articleBodyHtml(theme: Theme, siteId: string, post: Post, locale: Locale): string {
  const tokens = tokensOf(theme)
  const loc = localizePost(post, locale)
  const s = RENDER_STRINGS[locale]
  const available = postLocales(post)
  const basePath = `/render/${siteId}/${encodeURIComponent(post.slug)}`

  // Switcher hosted in the inherited header; body fallback only if no header.
  const header = buildChrome(theme, 'header', locale, { locales: available, current: locale, basePath, tokens })
  const footer = buildChrome(theme, 'footer', locale)
  const bodySwitcher = header ? '' : buildLangSwitcher(available, locale, basePath)

  const contentHtml = fillTableOfContents(getContentHtml(loc))
  const featured = loc.featured_image
    ? `<img src="${escapeAttr(loc.featured_image)}" alt="${escapeAttr(loc.title)}" class="carma-article-image" />`
    : ''

  const metaParts: string[] = []
  if (loc.author_name) metaParts.push(`<span>${escapeHtml(loc.author_name)}</span>`)
  metaParts.push(`<time datetime="${escapeAttr(loc.created_at)}">${escapeHtml(formatDate(loc.created_at, locale))}</time>`)
  if (loc.categories?.length) metaParts.push(`<span class="carma-cat">${loc.categories.map(escapeHtml).join(', ')}</span>`)

  return `${header}
<main class="carma-root carma-main">
  <article class="carma-article">
    <a href="${escapeAttr(withLang(`/render/${siteId}`, locale))}" class="carma-back">${escapeHtml(s.back)}</a>
    ${bodySwitcher}
    <h1 class="carma-article-title">${escapeHtml(loc.title)}</h1>
    <div class="carma-article-meta">${metaParts.join('<span>·</span>')}</div>
    ${featured}
    <div class="carma-article-content">
      ${contentHtml}
    </div>
  </article>
</main>
${footer}`
}

// ─── Full standalone documents (used by the iframe embed + direct visit) ──────

export function buildListingPage(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale = DEFAULT_LOCALE): string {
  const tokens = tokensOf(theme)
  return `<!doctype html>
<html lang="${locale}">
<head>
${buildHead(theme, siteName, tokens)}
</head>
<body>
${listingBodyHtml(theme, siteName, siteId, posts, locale)}
</body>
</html>`
}

export function buildArticlePage(theme: Theme, siteName: string, siteId: string, post: Post, locale: Locale = DEFAULT_LOCALE): string {
  const tokens = tokensOf(theme)
  const loc = localizePost(post, locale)
  const m = (post.meta ?? {}) as Record<string, unknown>
  const seoTitle = loc.seo_title?.trim() || loc.title
  const seo: HeadSeo = {
    description: loc.seo_description?.trim() || loc.excerpt || null,
    image: loc.featured_image || null,
    canonical: typeof m.canonical === 'string' && m.canonical.trim() ? m.canonical.trim() : null,
    noindex: m.noindex === true,
    ogTitle: seoTitle,
    type: 'article',
  }
  return `<!doctype html>
<html lang="${locale}">
<head>
${buildHead(theme, `${seoTitle} · ${siteName}`, tokens, seo)}
</head>
<body>
${articleBodyHtml(theme, siteId, post, locale)}
</body>
</html>`
}

// ─── Embeddable fragment (Shadow-DOM script embed) ────────────────────────────
//
// A self-contained, style-isolated payload the client loader drops into a shadow
// root on the customer's own page. `css` carries OUR token-driven template
// stylesheet; `html` carries the chrome (each region already inlines its own
// scoped <style>) plus the .carma-root feed/article. `fonts` are hoisted to the
// host document head by the loader so @font-face resolves. Because it renders in
// a shadow root, the customer's native CSS cannot bleed in and ours cannot leak
// out — the blog looks identical to the standalone render on ANY site.

export type RenderFragment = { css: string; html: string; fonts: string[] }

// Shadow-DOM-safe stylesheet. The template defines the design tokens on :root,
// but inside a shadow tree :root matches nothing (it points at the host
// document's <html>), so we also bind them to :host. The host gets the page
// background so the chrome sits on the right canvas, exactly like the standalone
// document's <body>.
function fragmentCss(t: DesignTokens): string {
  return `${buildTemplateCss(t).replace(':root{', ':root,:host{')}
:host{display:block;background:var(--ct-bg);box-sizing:border-box}
.cx-host{display:block}`
}

export function buildListingFragment(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale = DEFAULT_LOCALE): RenderFragment {
  return {
    css: fragmentCss(tokensOf(theme)),
    html: listingBodyHtml(theme, siteName, siteId, posts, locale),
    fonts: collectFontHrefs(theme),
  }
}

export function buildArticleFragment(theme: Theme, siteId: string, post: Post, locale: Locale = DEFAULT_LOCALE): RenderFragment {
  return {
    css: fragmentCss(tokensOf(theme)),
    html: articleBodyHtml(theme, siteId, post, locale),
    fonts: collectFontHrefs(theme),
  }
}

export function buildErrorPage(message: string, code = 404): { html: string; status: number } {
  const html = `<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${code} · Carma</title>
<style>
*{box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:1rem;font-family:system-ui,sans-serif;color:#444;text-align:center;padding:2rem;margin:0;background:#fafafa}
.err-code{font-size:3rem;margin:0;color:#999;font-weight:800}
.err-msg{margin:0;font-size:1rem;max-width:32rem}
</style>
</head>
<body>
<p class="err-code">${code}</p>
<p class="err-msg">${escapeHtml(message)}</p>
</body>
</html>`
  return { html, status: code }
}
