// Shared builders for the public /render routes AND the dashboard preview.
//
// Model (Magic Wand — RAW HTML INJECTION, "Top/Bottom sandwich"):
//   · We inject the target site's REAL <head> assets (extracted_head: its
//     stylesheets, inline <style>, font links, scripts — absolutised to the
//     origin) into the render document's <head>.
//   · The page is captured as a SANDWICH around its main content: extracted_header
//     is the "Top" (everything before the main content — opening wrappers + the
//     header), extracted_footer is the "Bottom" (everything after — the footer,
//     the matching wrapper CLOSERS, and the late scripts). The body is rendered as
//     <body{extracted_body_attrs}> so the source's global background/typography
//     rules apply. The injected head CSS then styles all of it 1:1.
//   · The Carma blog (feed / article — OUR template, .carma-root) renders BETWEEN
//     Top and Bottom inside a Declarative Shadow DOM. The whole body is STITCHED
//     server-side into ONE well-formed document (stitchChrome): we parse
//     `Top + slot + Bottom` with a spec-compliant HTML5 parser — repairing any
//     malformed/unclosed markup — then splice the (balanced) blog host into the
//     slot. We NEVER ship unbalanced "open in header / close in footer" halves to
//     the browser. The source's wrappers re-wrap our blog (correct layout) while
//     the Shadow DOM keeps the client's global CSS (resets, body{}, *{}) from
//     piercing in and ours from leaking out. No iframe anywhere.
//
//   For backward compatibility two older formats are tolerated (see parseRegion):
//   the starter-template `{ html, css }` JSON (rendered scoped, self-contained) and
//   the pre-pivot `{ html, css, mode:'shadow' }` JSON (degraded to its raw .html).

import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'
import type { BlogSignature, CardStyle } from '@/lib/scrape/blogDetect'
import { scopeChromeCss } from '@/lib/render/scopeCss'
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, isLocale, normalizeLocale, type Locale } from '@/lib/i18n/config'
import { parse } from 'node-html-parser'
import { responsiveCardImage, responsiveFeaturedImage, transformContentImages } from './image'
import { buildArticleJsonLd, buildBlogJsonLd, buildBreadcrumbJsonLd, maybeBuildFaqJsonLd } from './seo'
import { normalizeFragment } from '@/lib/scrape/headerFooter'

type ChromeI18nEntry = { header?: string | null; footer?: string | null; section_title?: string | null }

type Theme = {
  extracted_head?: string | null   // the target's real <head> assets (CSS/fonts/scripts), absolutised
  extracted_header?: string | null // RAW "Top" HTML (light DOM): wrappers + header — or legacy { html, css } JSON
  extracted_footer?: string | null // RAW "Bottom" HTML (light DOM): footer + wrapper closers + late scripts
  extracted_body_attrs?: string | null // the source <body>'s attributes (class/style/data-*)
  extracted_card?: string | null   // legacy — captured article-card TEMPLATE (unused; native cards now)
  font_links?: string[] | null
  design_tokens?: Partial<DesignTokens> | null
  section_title?: string | null // the client's news/blog page heading (default locale)
  default_locale?: string | null // which locale the base chrome represents
  chrome_i18n?: Record<string, ChromeI18nEntry> | null // translated chrome per locale
  blog_signature?: BlogSignature | null // detected native article-card design to replicate
} | null

// A resolved chrome region. `raw` = inject `html` verbatim into the light DOM
// (the new model; client head CSS styles it). `scoped` = a self-contained
// starter-template component whose `css` is force-namespaced via scopeChromeCss.
type ChromeKind = 'raw' | 'scoped'
type ChromeRegion = { kind: ChromeKind; html: string; css: string }

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

// Plain-text rendering of HTML for the JSON-LD `articleBody`. The article prose
// renders inside a Shadow DOM (invisible to crawlers), so this is the crawlable
// copy of the body that powers Search rich results + AI-chatbot citations.
function htmlToPlainText(html: string, cap = 12_000): string {
  if (!html) return ''
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > cap ? text.slice(0, cap) : text
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

// The slug that uniquely addresses this post in a given locale.
//   · Default locale → the flat `slug` column (canonical for the post).
//   · Non-default → the variant's own `slug` if set, else fall back to the flat
//     slug + ?lang= (works because the route auto-detects from either).
// This is the source of truth for every link we emit: card links, the language
// switcher, the back-to-listing link, and the canonical URL.
function slugForLocale(post: Post, locale: Locale): { slug: string; needsLang: boolean } {
  if (locale === postDefaultLocale(post)) return { slug: post.slug, needsLang: false }
  const variant = post.i18n?.[locale]
  const localized = (variant?.slug ?? '').trim()
  if (localized) return { slug: localized, needsLang: false }
  // No localized slug — fall back to the flat slug with ?lang= so the route
  // still serves the correct language for this article.
  return { slug: post.slug, needsLang: true }
}

// URL for a given (post, locale) — the LOCALIZED slug is the URL.
function articleUrl(siteId: string, post: Post, locale: Locale): string {
  const { slug, needsLang } = slugForLocale(post, locale)
  const path = `/render/${siteId}/${encodeURIComponent(slug)}`
  return needsLang ? `${path}?lang=${locale}` : path
}

// URL for the LISTING in a given locale. The listing has no slug, so we still
// use ?lang= for non-default locales (and a clean path for the default).
function listingUrl(siteId: string, locale: Locale): string {
  return locale === DEFAULT_LOCALE
    ? `/render/${siteId}`
    : `/render/${siteId}?lang=${locale}`
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

// Compact pure-CSS language switcher (body fallback used only when a site has no
// header to host the switcher). Each locale's link is resolved INDEPENDENTLY,
// so the article view's switcher points at each language's own localized slug.
function buildLangSwitcher(locales: Locale[], current: Locale, urlForLocale: (l: Locale) => string): string {
  if (locales.length < 2) return ''
  const items = locales.map(loc => {
    const active = loc === current
    return `<a class="carma-lang${active ? ' is-active' : ''}" href="${escapeAttr(urlForLocale(loc))}"${active ? ' aria-current="true"' : ''} hreflang="${loc}" title="${escapeAttr(LOCALE_META[loc].label)}">${LOCALE_META[loc].flag} ${escapeHtml(loc.toUpperCase())}</a>`
  }).join('')
  return `<nav class="carma-langbar" aria-label="Language">${items}</nav>`
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

// Perceived lightness (0 = black … 1 = white) of a CSS colour, or null if we
// can't parse it. Handles #hex (3/6/8) and rgb()/rgba(). Used to guarantee the
// blog is legible regardless of what palette the source site (or a bad scrape)
// produced — see ensureReadableTokens.
function colorLightness(input: string | undefined): number | null {
  if (!input) return null
  const s = input.trim().toLowerCase()
  let r: number, g: number, b: number
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('')
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16)
  } else {
    const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
    if (!m) return null
    r = parseFloat(m[1]); g = parseFloat(m[2]); b = parseFloat(m[3])
  }
  // Rec. 601 luma, normalised 0..1.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// The public renderer MUST be legible (CTO mandate): a scraped dark palette, a
// low-contrast pair, or an unreadable surface would make the blog ugly/unusable.
// If the blog surface isn't a light, well-contrasted background, we fall back to
// the clean light defaults for the surface colours — while KEEPING the brand
// accent/primary + fonts + radius + layout so it still feels on-brand. Combined
// with `color-scheme:light` on the blog host, this also neutralises any inherited
// system / client dark mode.
function ensureReadableTokens(t: DesignTokens): DesignTokens {
  const bg = colorLightness(t.colorBg)
  const text = colorLightness(t.colorText)
  const darkSurface = bg !== null && bg < 0.6
  const lowContrast = bg !== null && text !== null && Math.abs(bg - text) < 0.4
  if (!darkSurface && !lowContrast) return t
  return {
    ...t,
    colorBg: DEFAULT_TOKENS.colorBg,
    colorSurface: DEFAULT_TOKENS.colorSurface,
    colorText: DEFAULT_TOKENS.colorText,
    colorMuted: DEFAULT_TOKENS.colorMuted,
    colorBorder: DEFAULT_TOKENS.colorBorder,
  }
}

function tokensOf(theme: Theme): DesignTokens {
  return ensureReadableTokens({ ...DEFAULT_TOKENS, ...(theme?.design_tokens ?? {}) })
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
  color-scheme:light!important;
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

/* Article — magazine-grade typography with a centered prose column and
   media that "bleeds" out for breathing room. Fluid type via clamp() scales
   smoothly from phone → desktop with no breakpoints needed. */
.carma-article{max-width:880px!important;margin:0 auto!important;padding:.5rem clamp(1rem,3vw,1.5rem) 0!important}
.carma-back{display:inline-flex!important;align-items:center!important;gap:.5rem!important;color:var(--ct-text)!important;font-weight:700!important;font-size:.95rem!important;margin-bottom:2.5rem!important;padding:.6rem 1.15rem!important;border:1px solid var(--ct-border)!important;border-radius:9999px!important;background:var(--ct-surface)!important;text-decoration:none!important;line-height:1!important;transition:color .15s ease,border-color .15s ease,background .15s ease!important}
.carma-back:hover{color:var(--ct-accent)!important;border-color:var(--ct-accent)!important}
.carma-article-header{margin:0 0 2.75rem!important;max-inline-size:70ch!important;margin-inline:auto!important}
.carma-article-title{font-family:var(--ct-font-heading)!important;font-size:clamp(2rem,1.5rem + 2.2vw,3.25rem)!important;font-weight:800!important;margin:0 0 1rem!important;line-height:1.08!important;letter-spacing:-0.02em!important;color:var(--ct-text)!important}
.carma-article-lede{font-size:clamp(1.05rem,1rem + 0.4vw,1.2rem)!important;line-height:1.55!important;color:var(--ct-muted)!important;margin:0 0 1.25rem!important;font-weight:400!important}
.carma-article-meta{font-size:.85rem!important;color:var(--ct-muted)!important;margin:0!important;display:flex!important;gap:.6rem!important;flex-wrap:wrap!important;align-items:center!important}
.carma-article-image-wrap{margin:0 0 2.25rem!important;border-radius:var(--ct-radius-lg)!important;overflow:hidden!important;background:var(--ct-border)!important;aspect-ratio:16/9!important}
.carma-article-image-wrap picture,.carma-article-image-wrap img{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important}
.carma-article-image{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;margin:0!important;border-radius:0!important}
.carma-article-content{font-family:var(--ct-font-body)!important;font-size:clamp(1.0625rem,1.02rem + 0.18vw,1.18rem)!important;color:var(--ct-text)!important;line-height:${t.bodyLineHeight ?? '1.8'}!important;max-inline-size:70ch!important;margin-inline:auto!important}
.carma-article-content > *{max-inline-size:70ch!important;margin-inline:auto!important}
.carma-article-content p{margin:${t.paragraphSpacing ?? '1.45rem'} 0!important}
.carma-article-content p:first-of-type{margin-top:0!important}
.carma-article-content h2{font-family:var(--ct-font-heading)!important;font-size:clamp(1.45rem,1.25rem + 0.8vw,1.85rem)!important;font-weight:${t.headingWeight ?? '700'}!important;margin:2.25rem 0 .75rem!important;line-height:${t.headingLineHeight ?? '1.2'}!important;letter-spacing:-0.012em!important;color:var(--ct-text)!important}
.carma-article-content h3{font-family:var(--ct-font-heading)!important;font-size:clamp(1.2rem,1.1rem + 0.4vw,1.45rem)!important;font-weight:${t.headingWeight ?? '700'}!important;margin:1.75rem 0 .6rem!important;line-height:${t.headingLineHeight ?? '1.3'}!important;color:var(--ct-text)!important}
.carma-article-content picture,.carma-article-content img{display:block;margin:1.5rem 0!important;border-radius:var(--ct-radius)!important;width:100%!important;height:auto!important}
.carma-article-content figure picture,.carma-article-content figure img{margin:0!important}
/* Media bleed: figures and galleries break out past the 70ch prose column up to
   the article container's edge for a magazine feel. */
.carma-article-content figure.carma-figure,
.carma-article-content .carma-gallery,
.carma-article-content .carma-columns,
.carma-article-content > picture,
.carma-article-content > img{
  max-inline-size:none!important;
  width:100%!important;
  margin-inline:0!important;
}
@media (min-width:900px){
  .carma-article-content figure.carma-figure,
  .carma-article-content .carma-gallery{margin-inline:-2.5rem!important;width:calc(100% + 5rem)!important}
}
.carma-article-content a{color:${t.linkColor ?? 'var(--ct-accent)'}!important;text-decoration:${t.linkUnderline === 'none' ? 'none' : 'underline'}!important;text-decoration-thickness:1px!important;text-underline-offset:2px!important}
${t.linkUnderline === 'hover' ? '.carma-article-content a{text-decoration:none!important}.carma-article-content a:hover{text-decoration:underline!important}' : ''}
.carma-article-content blockquote{border-left:4px solid ${t.blockquoteBorderColor ?? 'var(--ct-accent)'}!important;margin:1.5rem 0!important;padding:.5rem 0 .5rem 1.25rem!important;color:var(--ct-muted)!important;font-style:${t.blockquoteStyle ?? 'italic'}!important}
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

// ─── Native card replication (GOAL 2) ────────────────────────────────────────
//
// When the Theme Grabber detected the client's existing blog and extracted its
// article-card style (blog_signature.card), we emit CSS that overrides OUR feed
// defaults so the Carma feed mirrors their native cards: column count, gap, card
// radius/border/shadow/background, image aspect ratio and title type. Emitted
// AFTER buildTemplateCss (and !important) so it wins; absent → premium defaults.
// Values come from the client's own CSS; we still strip CSS-structural chars
// defensively (the whole stylesheet is also </style>-guarded by renderBlogHost).
function buildNativeCardCss(card: CardStyle | null | undefined): string {
  if (!card) return ''
  const safe = (v: string): string => v.replace(/[{}<>;]/g, '').trim()
  const rules: string[] = []

  if (card.gap) rules.push(`.carma-grid{gap:${safe(card.gap)}!important}`)
  if (card.columns) {
    rules.push(`@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(${Math.round(card.columns)},minmax(0,1fr))!important}}`)
  }

  const box: string[] = []
  if (card.radius) box.push(`border-radius:${safe(card.radius)}!important`)
  if (card.border) box.push(`border:${safe(card.border)}!important`)
  if (card.shadow) box.push(`box-shadow:${safe(card.shadow)}!important`)
  if (card.background) box.push(`background:${safe(card.background)}!important`)
  if (box.length) rules.push(`.carma-card{${box.join(';')}}`)

  if (card.imageAspect) rules.push(`.carma-card-media{aspect-ratio:${safe(card.imageAspect)}!important}`)

  const title: string[] = []
  if (card.titleSize) title.push(`font-size:${safe(card.titleSize)}!important`)
  if (card.titleWeight) title.push(`font-weight:${safe(card.titleWeight)}!important`)
  if (card.titleColor) title.push(`color:${safe(card.titleColor)}!important`)
  if (title.length) rules.push(`.carma-card-title{${title.join(';')}}`)

  return rules.length ? `\n/* Native card replication — captured from the source blog */\n${rules.join('\n')}` : ''
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

// ─── Injected client <head> (the 1:1 clone's styling) ───────────────────────────
//
// extracted_head is the target's real head assets (stylesheets / inline <style> /
// font links / scripts), already absolutised + filtered (title/meta/canonical/base
// stripped) at capture time. Injecting it makes the target's own CSS style the
// light-DOM header/footer exactly as on the source. We add a render-time
// defense-in-depth pass for OLD stored data and hand edits: strip <base> (would
// rewrite our blog URLs), <title>/<meta> (ours win), and the http-equiv refresh /
// CSP metas (would navigate away or block our inline styles). Scripts are KEPT —
// the client's own site JS powers its native menus.
function sanitizeInjectedHead(html: string): string {
  if (!html?.trim()) return ''
  return html
    .replace(/<base\b[^>]*\/?>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '')
    .replace(/<meta\b[^>]*\/?>/gi, '')
    // Stray </head>/<body> can't appear mid-fragment, but neutralise just in case.
    .replace(/<\/?(head|body|html)\b[^>]*>/gi, '')
}

function buildHead(theme: Theme, title: string, tokens: DesignTokens, seo?: HeadSeo): string {
  const ogTitle = seo?.ogTitle ?? title
  const parts: string[] = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
  ]
  // OUR SEO / social meta — applied from the post's SEO tab. These OWN the head
  // (the injected client head has its <title>/<meta> stripped).
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
  // Fonts for OUR blog template (token-driven). Link-loaded fonts register at the
  // document level, so they're available inside the blog's shadow root too.
  const fonts = buildFontLinks(theme)
  if (fonts) parts.push(fonts)
  // OUR base reset — emitted BEFORE the client head so the client's own body{}
  // rules (background, global type) WIN and the page reads like the source. The
  // page background is the SOURCE's real bg (not the forced-light blog surface), so
  // light-on-dark chrome stays readable.
  parts.push(`<style>${buildPageResetCss(pageBackground(theme, tokens))}</style>`)
  // THE CLIENT'S REAL HEAD — its stylesheets / fonts / scripts. This is what makes
  // the injected light-DOM Top/Bottom look 1:1 with the source site.
  const clientHead = sanitizeInjectedHead(theme?.extracted_head ?? '')
  if (clientHead) parts.push(clientHead)
  // Host box-guard — emitted LAST so it ALWAYS wins: the blog's shadow host stays a
  // normal full-width block wherever the source's wrappers drop it. (The blog's own
  // token-driven stylesheet lives INSIDE the shadow root, see renderBlogHost.)
  parts.push(`<style>${buildHostGuardCss()}</style>`)
  return parts.join('\n')
}

// The page (light-DOM) background. CRITICAL: this is the SOURCE's REAL background,
// NOT the readability-forced token bg. The injected chrome often has light text
// designed for a dark site, or a transparent header that inherits the page bg —
// forcing the page white made that text unreadable (white-on-white). The BLOG stays
// readable regardless because it paints its OWN opaque, readability-forced surface
// inside the Shadow DOM (:host). We only accept a clean, self-contained CSS colour
// token (no rule-breakout chars); otherwise we fall back to the forced token bg.
function pageBackground(theme: Theme, tokens: DesignTokens): string {
  const raw = theme?.design_tokens?.colorBg
  const safe = typeof raw === 'string' ? raw.trim() : ''
  if (safe && /^[#a-z0-9(),.%/\s-]+$/i.test(safe) && !/[{}<>;]/.test(safe)) return safe
  return tokens.colorBg
}

// Document base reset, emitted BEFORE the injected client head so the client's own
// body{} rules win. We set only a margin reset + the source's real page background
// (so transparent/inherit chrome reads correctly). We set NO global font/typography
// — the client's injected CSS owns the chrome's look, and the blog owns its own
// inside the shadow.
function buildPageResetCss(bg: string): string {
  return `html{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:${bg}}`
}

// The blog shadow-host box-guard, emitted AFTER the client head so it always wins.
// The host sits exactly where the source's main content did; we force it to behave
// as a normal full-width block so inherited wrapper CSS (float/flex/position) can't
// collapse it. The host's background is painted by :host inside the shadow root.
function buildHostGuardCss(): string {
  return `.carma-embed-host{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;flex:1 1 auto!important;min-width:0!important;float:none!important;position:static!important;margin:0!important;padding:0!important}`
}

// ─── Chrome region resolution (raw injection · scoped template) ─────────────────

// Parse a stored chrome region into a render-ready form, tolerating three shapes:
//   1. RAW HTML (the new model)      → kind:'raw', injected verbatim (light DOM).
//   2. starter-template { html, css } → kind:'scoped', css force-namespaced.
//   3. legacy { html, css, mode }     → degrade to kind:'raw' using .html only,
//      so pre-pivot sites never render literal JSON before they re-capture. (The
//      old shadow CSS is dropped; without the client head the markup still shows.)
function parseRegion(value: string | null | undefined): ChromeRegion | null {
  if (!value) return null
  const s = value.trim()
  if (!s) return null
  if (!s.startsWith('{')) return { kind: 'raw', html: s, css: '' }
  try {
    const o = JSON.parse(s) as { html?: unknown; css?: unknown; mode?: unknown }
    if (typeof o.html !== 'string' || !o.html.trim()) return null
    // A starter template (no `mode`) carries self-contained CSS → render scoped.
    // A legacy `mode:'shadow'` capture → degrade to raw HTML (drop the old CSS).
    if (o.mode === undefined && typeof o.css === 'string') {
      return { kind: 'scoped', html: o.html, css: o.css }
    }
    return { kind: 'raw', html: o.html, css: '' }
  } catch {
    // Not valid JSON despite the leading brace — treat the whole thing as raw HTML.
    return { kind: 'raw', html: s, css: '' }
  }
}

// The DSD-attach polyfill + a best-effort menu-interaction shim. The Carma blog
// itself now renders inside a Declarative Shadow DOM, so this is ALWAYS emitted
// (old engines without native DSD support need the attach; the menu shim only
// helps the injected chrome whose JS we didn't keep, and is otherwise inert).
const DSD_RUNTIME = `(function(){
  try{
    if(!Object.prototype.hasOwnProperty.call(HTMLTemplateElement.prototype,'shadowRootMode')){
      document.querySelectorAll('template[shadowrootmode]').forEach(function(tpl){
        var host=tpl.parentNode; if(!host||!host.attachShadow||host.shadowRoot) return;
        try{ var sr=host.attachShadow({mode:tpl.getAttribute('shadowrootmode')||'open'}); sr.appendChild(tpl.content); tpl.remove(); }catch(e){}
      });
    }
  }catch(e){}
})();`

function runtimeScript(): string {
  return `<script>${DSD_RUNTIME}</script>`
}

// Client-side readability guard for the INJECTED chrome (light DOM only). The raw
// header/footer carry the source's OWN colours; when a transparent header that
// expected a hero image, or a colour rule we couldn't capture, leaves LIGHT text on
// a LIGHT effective background, it's unreadable (the reported white-on-white). This
// post-load pass detects exactly that — clearly light text over a clearly light,
// image-less effective background — and darkens just that text. It runs in the
// browser (where computed styles exist, so it's deterministic + free, no LLM). It
// NEVER touches the blog (the Shadow DOM is out of reach of light-DOM
// querySelectorAll; we also skip the host element) and never touches text that sits
// on a dark background or a background image/gradient (which provides its own
// contrast). Conservative thresholds keep it from misfiring on healthy pages.
const CONTRAST_GUARD = `(function(){
  function L(c){var m=c&&c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(',').map(parseFloat);if(p.length>3&&p[3]===0)return null;return (0.299*p[0]+0.587*p[1]+0.114*p[2])/255;}
  function bg(el){var n=el;while(n&&n.nodeType===1){var s=getComputedStyle(n);if(s.backgroundImage&&s.backgroundImage!=='none')return -1;var l=L(s.backgroundColor);if(l!==null)return l;n=n.parentElement;}return 1;}
  function run(){try{
    var host=document.querySelector('.carma-embed-host');
    var body=document.body;if(!body)return;var els=body.querySelectorAll('*');
    for(var i=0;i<els.length;i++){var el=els[i];
      if(host&&(el===host||host.contains(el)))continue;
      var has=false,ch=el.childNodes;for(var j=0;j<ch.length;j++){if(ch[j].nodeType===3&&ch[j].textContent.trim()){has=true;break;}}
      if(!has)continue;
      var tl=L(getComputedStyle(el).color);if(tl===null||tl<0.72)continue;
      var bl=bg(el);if(bl===-1||bl<=0.6)continue;
      el.style.setProperty('color','#1c1c1c','important');
    }
  }catch(e){}}
  if(document.readyState!=='loading')run();else document.addEventListener('DOMContentLoaded',run);
  setTimeout(run,700);
})();`

function contrastGuardScript(): string {
  return `<script>${CONTRAST_GUARD}</script>`
}

// Cookieless analytics beacon — fires one view on load, skipping the dashboard's
// live preview (?preview=1). Values are our own (uuid/enum), so interpolating
// them into the inline script is injection-safe.
function trackingScript(siteId: string, postId: string | null, kind: 'article' | 'listing'): string {
  const payload = JSON.stringify({ siteId, postId, kind })
  return `<script>(function(){try{if(location.search.indexOf('preview=1')>=0)return;var d=${payload};d.path=location.pathname;d.locale=document.documentElement.lang||null;fetch('/api/track',{method:'POST',keepalive:true,headers:{'Content-Type':'text/plain'},body:JSON.stringify(d)}).catch(function(){});}catch(e){}})();</script>`
}

// The locale the base chrome (extracted_header/footer/section_title) represents.
function chromeDefaultLocale(theme: Theme): Locale {
  return normalizeLocale(theme?.default_locale, DEFAULT_LOCALE)
}

// The stored chrome region for a given locale: the translated version from
// chrome_i18n when present, else the base (default-locale) chrome.
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

// Strip <script> tags from a markup fragment. Used only for the SCOPED
// starter-template path (those are our own templates, scriptless by design — this
// is pure defense-in-depth for hand edits). RAW chrome KEEPS the client's scripts.
function stripScriptTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
}

// The HTML for ONE chrome region (the "Top" = header column, the "Bottom" =
// footer column), BEFORE stitching. We do NOT balance it here — stitchChrome
// balances the whole assembly server-side.
//   · SCOPED → a self-contained starter-template component: its CSS is forced
//     under [data-carma-chrome="…"] + an all:initial reset (zero bleed). Balanced.
//   · RAW    → the client's real markup (a sandwich half, or a legacy region).
//     Returned verbatim; stitchChrome makes the final document well-formed.
function regionHtml(theme: Theme, region: 'header' | 'footer', locale: Locale): string {
  const data = parseRegion(chromeRegionRaw(theme, region, locale))
  if (!data) return ''
  if (data.kind === 'scoped') {
    const css = scopeChromeCss(data.css.replace(/<\/style/gi, '<\\/style'), region)
    return `<div class="cx-host cx-host-${region}" data-carma-chrome="${region}"><style>${css}</style>
${stripScriptTags(data.html)}
</div>`
  }
  return data.html
}

// The single marker we stitch the blog into. A comment is inert markup, survives a
// spec-compliant parse round-trip, and is trivially located for the final swap.
const BLOG_SLOT = '<!--CARMA_BLOG_SLOT-->'

// ── Server-side DOM stitching (the bulletproof assembly) ──────────────────────
//
// We assemble the page body as ONE well-formed document BEFORE serving it — never
// shipping unbalanced "open tags in the header / close tags in the footer" halves
// (which were fragile: any DOM tooling, hydration or aggressive HTML minifier
// between us and the browser could mis-nest them and break the layout).
//
// How: parse `before + SLOT + after` with a spec-compliant HTML5 parser (parse5
// via normalizeFragment). That REPAIRS any malformed/unclosed markup and yields a
// BALANCED shell with the slot still in place (between the header and footer,
// inside whatever wrappers bracket them). We then splice the blog host — itself a
// self-contained, balanced Shadow-DOM unit — into that slot with a function
// replacer (so `$&`-style sequences in the blog HTML are never reinterpreted). The
// result is a fully balanced body: the client's wrappers wrap our blog, and the
// browser receives valid HTML it can never mis-parse.
function stitchChrome(before: string, after: string, blogHostHtml: string): string {
  const shell = normalizeFragment(`${before}\n${BLOG_SLOT}\n${after}`)
  if (shell.includes(BLOG_SLOT)) {
    return shell.replace(BLOG_SLOT, () => `\n${blogHostHtml}\n`)
  }
  // Defensive: if the parser ever dropped the slot (it shouldn't), fall back to a
  // balanced concatenation so we still serve a valid document with the blog.
  return `${shell}\n${blogHostHtml}`
}

// The <body> opening tag carrying the source's attributes (so its global
// background / typography rules match). on*-handlers are stripped defensively.
function sanitizeBodyAttrs(attrs: string | null | undefined): string {
  const s = (attrs ?? '').trim()
  if (!s) return ''
  return s.replace(/\son[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').trim()
}
function bodyOpenTag(theme: Theme): string {
  const attrs = sanitizeBodyAttrs(theme?.extracted_body_attrs)
  return attrs ? `<body ${attrs}>` : '<body>'
}

function buildCard(post: Post, siteId: string, locale: Locale): string {
  const loc = localizePost(post, locale)
  // Each card links to THIS post's slug in the listing's current language. The
  // localized slug (if any) becomes the URL — that's the canonical address of
  // the post in that language.
  const href = articleUrl(siteId, post, locale)
  const media = loc.featured_image
    ? `<div class="carma-card-media">${responsiveCardImage(loc.featured_image, loc.title)}</div>`
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
//
// The render body is: [header — LIGHT DOM] + [blog — SHADOW DOM] + [footer — LIGHT
// DOM]. The header/footer are the client's real markup, styled by the injected
// client head CSS (1:1 clone). The blog is OUR template, isolated behind a
// Declarative Shadow DOM so the client's global CSS can't break it and ours can't
// leak onto the chrome. The blog's token-driven stylesheet lives INSIDE the
// shadow root via renderBlogHost.

// Wrap OUR blog markup in the Declarative-Shadow-DOM host. The template CSS is
// emitted INSIDE the shadow <style> so it is fully encapsulated. We bind the
// design tokens to :host too (inside a shadow tree :root matches the host
// document's <html>, not our wrapper) and give :host the page background + an
// explicit base font/color so nothing is inherited across the boundary from the
// client's body{} rules.
function renderBlogHost(innerHtml: string, tokens: DesignTokens, extraCss = ''): string {
  const css = `${buildTemplateCss(tokens).replace(':root{', ':root,:host{')}
:host{display:block;color-scheme:light;background:var(--ct-bg);color:var(--ct-text);font-family:var(--ct-font-body);font-size:var(--ct-size);line-height:1.65}${extraCss}`
  // The CSS is rawtext inside <style>: escape any literal </style>/</template>
  // so it can't terminate the block early.
  const guardCss = (s: string) => s.replace(/<\/(template|style)/gi, '<\\/$1')
  // The blog inner is (partly) arbitrary post content. Balance it with a
  // spec-compliant parse FIRST: a stray <template>/<style> or an unclosed tag in
  // the content would otherwise consume the host's own </template> and leave the
  // Declarative Shadow DOM open — swallowing the light-DOM footer (isolation
  // breach + broken layout). After balancing, every nested template/style is a
  // matched pair, so the closing </template> we append always closes the HOST.
  const safeInner = normalizeFragment(innerHtml)
  return `<div class="carma-embed-host"><template shadowrootmode="open"><style>${guardCss(css)}</style>
${safeInner}
</template></div>`
}

// OUR blog markup for the listing (the .carma-root <main>). Returned WITHOUT the
// shadow host wrapper so it can be reused both inside renderBlogHost (full page)
// and inside the embed loader's own shadow root (fragment).
function listingBlogInner(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale): string {
  const tokens = tokensOf(theme)
  const available = LOCALES.filter(l => posts.some(p => postLocales(p).includes(l)))
  const urlForLocale = (l: Locale) => listingUrl(siteId, l)
  // The language switcher lives on OUR navigation surface (clicking the client's
  // own nav navigates to the source site, so it can't host our switcher).
  const bodySwitcher = buildLangSwitcher(available, locale, urlForLocale)

  const sectionTitle = localizedSectionTitle(theme, locale)
  const feed = posts.length === 0
    ? buildEmptyState(siteName, locale)
    : `<div class="carma-grid">\n${posts.map(p => buildCard(p, siteId, locale)).join('\n')}\n</div>`

  const crumb = tokens.showBreadcrumb
    ? `<nav class="carma-breadcrumb"><a href="${escapeAttr(urlForLocale(locale))}">${escapeHtml(RENDER_STRINGS[locale].home)}</a><span>›</span><span>${escapeHtml(sectionTitle)}</span></nav>`
    : ''
  const hasImage = !!tokens.headingImage
  const headStyle = hasImage ? ` style="background-image:url('${escapeAttr(tokens.headingImage!)}')"` : ''
  const head = `<div class="carma-section-head${hasImage ? ' has-image' : ''}"${headStyle}>${crumb}<h1 class="carma-section-title">${escapeHtml(sectionTitle)}</h1></div>`

  return `<main class="carma-root carma-main">
${bodySwitcher}
${head}
${feed}
</main>`
}

// Full render body: the client's shell (LIGHT DOM) STITCHED around the blog
// (SHADOW DOM) into one well-formed document, server-side.
function listingBodyHtml(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale): string {
  const tokens = tokensOf(theme)
  const blog = renderBlogHost(
    listingBlogInner(theme, siteName, siteId, posts, locale),
    tokens,
    buildNativeCardCss(theme?.blog_signature?.card),
  )
  return stitchChrome(regionHtml(theme, 'header', locale), regionHtml(theme, 'footer', locale), blog)
}

// OUR blog markup for the article view (the .carma-root <main>), sans shadow host.
function articleBlogInner(theme: Theme, siteId: string, post: Post, locale: Locale): string {
  const loc = localizePost(post, locale)
  const s = RENDER_STRINGS[locale]
  const available = postLocales(post)
  // CRITICAL: each language gets its OWN URL via its localized slug. The
  // switcher links to /render/<siteId>/<localized-slug-for-locale> directly,
  // so a Spanish user clicking "English" lands on the English slug — no
  // ?lang= juggling, no 404s, no slug↔URL drift.
  const urlForLocale = (l: Locale) => articleUrl(siteId, post, l)
  const bodySwitcher = buildLangSwitcher(available, locale, urlForLocale)

  // Pre-fill TOC, then rewrite every <img> to a responsive <picture> with
  // WebP/AVIF + srcset (CLS-safe). This is what gives "magazine-grade" image
  // quality without touching the upload pipeline.
  const contentHtml = transformContentImages(fillTableOfContents(getContentHtml(loc)))

  const featured = loc.featured_image
    ? `<figure class="carma-article-image-wrap">${responsiveFeaturedImage(loc.featured_image, loc.title)}</figure>`
    : ''

  const metaParts: string[] = []
  if (loc.author_name) metaParts.push(`<span>${escapeHtml(loc.author_name)}</span>`)
  metaParts.push(`<time datetime="${escapeAttr(loc.created_at)}">${escapeHtml(formatDate(loc.created_at, locale))}</time>`)
  if (loc.categories?.length) metaParts.push(`<span class="carma-cat">${loc.categories.map(escapeHtml).join(', ')}</span>`)

  const lede = loc.excerpt ? `<p class="carma-article-lede">${escapeHtml(loc.excerpt)}</p>` : ''

  return `<main class="carma-root carma-main">
  <article class="carma-article">
    <a href="${escapeAttr(listingUrl(siteId, locale))}" class="carma-back" rel="up">${escapeHtml(s.back)}</a>
    ${bodySwitcher}
    <header class="carma-article-header">
      <h1 class="carma-article-title">${escapeHtml(loc.title)}</h1>
      ${lede}
      <div class="carma-article-meta">${metaParts.join('<span>·</span>')}</div>
    </header>
    ${featured}
    <div class="carma-article-content">
      ${contentHtml}
    </div>
  </article>
</main>`
}

function articleBodyHtml(theme: Theme, siteId: string, post: Post, locale: Locale): string {
  const tokens = tokensOf(theme)
  const blog = renderBlogHost(articleBlogInner(theme, siteId, post, locale), tokens)
  return stitchChrome(regionHtml(theme, 'header', locale), regionHtml(theme, 'footer', locale), blog)
}

// ─── Full standalone documents (used by the iframe embed + direct visit) ──────

export function buildListingPage(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale = DEFAULT_LOCALE): string {
  const tokens = tokensOf(theme)
  const jsonLd = buildBlogJsonLd({
    url: listingUrl(siteId, locale),
    name: siteName,
    locale,
  })
  return `<!doctype html>
<html lang="${locale}">
<head>
${buildHead(theme, siteName, tokens)}
${jsonLd}
</head>
${bodyOpenTag(theme)}
${listingBodyHtml(theme, siteName, siteId, posts, locale)}
${runtimeScript()}
${contrastGuardScript()}
${trackingScript(siteId, null, 'listing')}
</body>
</html>`
}

export function buildArticlePage(theme: Theme, siteName: string, siteId: string, post: Post, locale: Locale = DEFAULT_LOCALE): string {
  const tokens = tokensOf(theme)
  const loc = localizePost(post, locale)
  const m = (post.meta ?? {}) as Record<string, unknown>
  const seoTitle = loc.seo_title?.trim() || loc.title
  const description = loc.seo_description?.trim() || loc.excerpt || null
  const canonical = typeof m.canonical === 'string' && m.canonical.trim() ? m.canonical.trim() : null
  const seo: HeadSeo = {
    description,
    image: loc.featured_image || null,
    canonical,
    noindex: m.noindex === true,
    ogTitle: seoTitle,
    type: 'article',
  }

  // Structured data: Article + Breadcrumb + (optional) FAQ.
  // The Article schema is what powers both Google Search rich results AND
  // AI-chatbot citations (Perplexity/Claude/ChatGPT lean on these fields).
  const articleHref = canonical ?? articleUrl(siteId, post, locale)
  const listingHref = listingUrl(siteId, locale)
  const sectionTitle = localizedSectionTitle(theme, locale)
  const jsonLd = [
    buildArticleJsonLd({
      url: articleHref,
      headline: loc.title,
      description,
      image: loc.featured_image,
      authorName: loc.author_name,
      datePublished: loc.created_at,
      locale,
      siteName,
      section: loc.categories?.[0] ?? null,
      keywords: loc.tags ?? null,
      // The prose renders in a Shadow DOM — ship the body as crawlable JSON-LD.
      articleBody: htmlToPlainText(getContentHtml(loc)),
    }),
    buildBreadcrumbJsonLd({
      listingUrl: listingHref,
      listingName: sectionTitle,
      articleUrl: articleHref,
      articleName: loc.title,
    }),
    maybeBuildFaqJsonLd(getContentHtml(loc)),
  ].filter(Boolean).join('\n')

  return `<!doctype html>
<html lang="${locale}">
<head>
${buildHead(theme, `${seoTitle} · ${siteName}`, tokens, seo)}
${jsonLd}
</head>
${bodyOpenTag(theme)}
${articleBodyHtml(theme, siteId, post, locale)}
${runtimeScript()}
${contrastGuardScript()}
${trackingScript(siteId, post.id, 'article')}
</body>
</html>`
}

// ─── Embeddable fragment (Shadow-DOM script embed) ────────────────────────────
//
// A self-contained, style-isolated payload the client loader drops into a shadow
// root on the customer's own page. The embed ships ONLY the Carma blog (feed /
// article — `html`) + OUR token-driven stylesheet (`css`); the customer's page
// supplies its own header/footer around it. We deliberately do NOT inject the
// captured site's chrome or its global CSS into a third-party page (that's the
// standalone /render page's job, where the client head can be injected safely).
// Because it renders in the loader's shadow root, the customer's native CSS
// cannot bleed in and ours cannot leak out.

export type RenderFragment = { css: string; html: string; fonts: string[] }

// Shadow-DOM-safe stylesheet. The template defines the design tokens on :root,
// but inside a shadow tree :root matches nothing (it points at the host
// document's <html>), so we also bind them to :host.
function fragmentCss(t: DesignTokens, extraCss = ''): string {
  return `${buildTemplateCss(t).replace(':root{', ':root,:host{')}
:host{display:block;color-scheme:light;background:var(--ct-bg);color:var(--ct-text);font-family:var(--ct-font-body);box-sizing:border-box}${extraCss}`
}

export function buildListingFragment(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale = DEFAULT_LOCALE): RenderFragment {
  return {
    css: fragmentCss(tokensOf(theme), buildNativeCardCss(theme?.blog_signature?.card)),
    html: listingBlogInner(theme, siteName, siteId, posts, locale),
    fonts: collectFontHrefs(theme),
  }
}

export function buildArticleFragment(theme: Theme, siteId: string, post: Post, locale: Locale = DEFAULT_LOCALE): RenderFragment {
  return {
    css: fragmentCss(tokensOf(theme)),
    html: articleBlogInner(theme, siteId, post, locale),
    fonts: collectFontHrefs(theme),
  }
}

export function buildErrorPage(message: string, code = 404, lang = 'ca'): { html: string; status: number } {
  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}">
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
