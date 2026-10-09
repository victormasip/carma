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
import { feedLayoutCss } from '@/lib/render/feedLayouts'
import {
  buildListingModuleParts, buildArticleModuleParts, modulesRuntimeScript,
  type ModulePost, type ModuleHelpers, type ListingModuleParts, type ArticleModuleParts,
} from '@/lib/render/modules'
import type { SiteModules } from '@/lib/modules/registry'
import type { BlogSignature, CardStyle } from '@/lib/scrape/blogDetect'
import { buildBlogCss, UNLAYER_JS } from '@/lib/render/blogCss'
import { scopeChromeCss } from '@/lib/render/scopeCss'
import { contrastRatio, parseColor } from '@/lib/scrape/chromeContrast'
import { stripCompiledHead } from '@/lib/scrape/chromeCompiler'
import { BCP47, DEFAULT_LOCALE, LOCALES, LOCALE_META, isLocale, normalizeLocale, uiLocale, type Locale, type UiLocale } from '@/lib/i18n/config'
import { parse } from 'node-html-parser'
import { responsiveCardImage, responsiveFeaturedImage, transformContentImages, DEFAULT_SIZES_CARD, DEFAULT_SIZES_FEATURED } from './image'
import { imagePreloadLink } from './imageMarkup'
import { embedInnerHtml, tocInnerHtml } from './blockMarkup'
import { buildArticleJsonLd, buildBlogJsonLd, buildBreadcrumbJsonLd, maybeBuildFaqJsonLd } from './seo'
import { normalizeFragment } from '@/lib/scrape/headerFooter'
import { FEED_PATH, type FeedPost } from '@/lib/render/feed'
import { scrubHeadAssets, scrubTree, type P5Node } from '@/lib/render/chromeSafety'
import { extractLinkTree, isRebuiltRegion, safePanelBar, safePanelDrawer, SAFE_PANEL_JS, treeLinks, type LinkTree, type SafeTokens } from '@/lib/render/safePanel'
import { stripHarmony } from '@/lib/design/revealTypes'
import { parseFragment, serialize } from 'parse5'
import { createHash } from 'node:crypto'

export { unlayerCss, UNLAYER_SHIM_MARK } from '@/lib/render/blogCss'

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
  modules?: SiteModules | null // Smart Modules config (migration 024); absent ⇒ no modules
  // ── Chrome Compiler (migration 032) ──
  compiled_chrome_css?: string | null    // critical CSS for the chrome; null ⇒ raw-injection fallback
  /** IGNORED since W0: no customer script runs on a Carma page, whatever this says. */
  chrome_scripts_enabled?: boolean | null
  /** `faithful: false` (set at capture, W0) ⇒ their markup is not shown: SAFE PANEL bar. */
  chrome_compile_stats?: { faithful?: boolean } | Record<string, unknown> | null
  /** The page their chrome was captured from — links in it resolve against this. */
  base_url?: string | null
  reference_url?: string | null
  // ── Design genome (W5) ──
  // The compiler's EXTRA stylesheet — only what tokens cannot carry (lanes, drop
  // caps, motion…). It rides in the `overrides` layer after the feed layout, so a
  // genome refines its own rhythm. Not persisted yet (no migration): today only the
  // Door's live preview sets it. Compiled by our own pure compiler from a validated
  // genome, never from free text.
  genome_css?: string | null
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
  // Optional: LISTING queries deliberately omit the body (cards never render it);
  // the article route always selects it.
  content?: { html?: string } | Record<string, unknown> | null
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
  /** Preview-only flag: render a clear "sample/demo" badge on the card so
   *  placeholder posts are never mistaken for real content. */
  demo?: boolean
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

function formatDate(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  try {
    return new Date(iso).toLocaleDateString(BCP47[locale], { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return iso }
}

// The few UI strings the render emits itself (everything else is the client's
// own content). Localized in the UI languages; a content site in another
// language borrows the closest one via uiLocale().
const RENDER_STRINGS: Record<UiLocale, { back: string; home: string; articles: string; emptyTitle: string; emptyDesc: (s: string) => string }> = {
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

// ─── Link context (clean URLs — Super MVP Fase 4) ─────────────────────────────
//
// Every URL the renderer emits is built from a LinkCtx, because the same markup
// ships to three different address spaces:
//
//   · Public blog on a tenant subdomain → base '' → `/hola-mon`, `/es/hola-mundo`
//     This is what visitors see and what search engines index.
//   · Canonical / dashboard preview     → base '/render/<uuid>' (unchanged)
//   · Embed fragment on the customer's own page → an ABSOLUTE blog origin, so a
//     link inside their WordPress page still reaches the blog.
//
// The old code hardcoded `/render/${siteId}/…` into every link, which is why the
// pretty subdomain URL existed but was never linked to: a visitor on
// blog.carma.cat clicked an article and landed on
// blog.carma.cat/render/8f3a…/hola-mon. The rewrite already worked; the links
// didn't.
export type LinkCtx = {
  /** '' (site-relative), '/render/<uuid>', or an absolute origin. No trailing slash. */
  base: string
  /** The SITE's default locale — the one that gets the bare, canonical root URL. */
  siteDefault?: Locale | null
}

/** Default context — preserves the historic `/render/<uuid>` behaviour for every
 *  caller that doesn't care (dashboard preview, grabber lab, template preview). */
function defaultLink(siteId: string, theme?: Theme): LinkCtx {
  return { base: `/render/${siteId}`, siteDefault: themeDefaultLocale(theme) }
}

/** The site's configured default locale, or null when the theme predates migration 008. */
function themeDefaultLocale(theme?: Theme): Locale | null {
  const dl = theme?.default_locale
  return dl && isLocale(dl) ? (dl as Locale) : null
}

function joinPath(base: string, ...segs: string[]): string {
  const b = base.replace(/\/+$/, '')
  const p = segs.filter(Boolean).map(s => encodeURIComponent(s)).join('/')
  if (!p) return b || '/'
  return `${b}/${p}`
}

// URL for a given (post, locale) — the LOCALIZED slug is the URL.
//
// Locale is a PATH SEGMENT, never `?lang=`: `/es/hola-mundo`, not
// `/hola-mon?lang=es`. Query-param locales gave us no clean hreflang structure
// and are weak SEO. The default locale stays unprefixed.
//
// `needsLang` (no localized slug for this locale) is the one case that still
// carries `?lang=`, because there is no distinct slug to route on — the flat slug
// has to be told which language to render.
function articleUrl(link: LinkCtx, post: Post, locale: Locale): string {
  const { slug, needsLang } = slugForLocale(post, locale)
  const isDefault = locale === postDefaultLocale(post)
  if (needsLang) return `${joinPath(link.base, slug)}?lang=${locale}`
  return isDefault ? joinPath(link.base, slug) : joinPath(link.base, locale, slug)
}

// URL for the LISTING in a given locale.
//
// History: this used to force `?lang=` on EVERY listing link — including the
// platform default — because a bare `/render/<id>` resolves to the SITE's default
// locale, which is not always the platform default, so "Català" on a Spanish site
// landed back on Spanish. Locale path segments fix that at the source: `/es` is
// unambiguous in a way `?lang=es` bolted onto a defaulting route never was.
//
// The site's own default locale gets the bare root, which is what we want
// canonicalised and indexed.
function listingUrl(link: LinkCtx, locale: Locale): string {
  if (link.siteDefault && locale === link.siteDefault) return joinPath(link.base)
  return joinPath(link.base, locale)
}

/**
 * URL of the RSS feed for a locale — the listing URL plus `/rss.xml`.
 *
 * The default locale's feed sits at the blog root (`/rss.xml`), every other
 * locale under its own prefix (`/es/rss.xml`), so a reader that subscribes to
 * the Spanish blog gets Spanish articles and Spanish links.
 */
function feedUrl(link: LinkCtx, locale: Locale): string {
  const base = listingUrl(link, locale)
  return base === '/' ? `/${FEED_PATH}` : `${base}/${FEED_PATH}`
}

/**
 * The feed's items for one locale, with FULLY QUALIFIED links.
 *
 * Lives here, beside `articleUrl`, on purpose: the feed must address articles
 * exactly the way the HTML does — same localized slugs, same locale prefixes —
 * or a subscriber's click lands on a 404 that nobody sees because it happened
 * inside someone else's reader app.
 */
export function buildFeedItems(
  posts: Post[],
  locale: Locale,
  link: LinkCtx,
  /** Absolute origin (`https://blog.carma.cat`), prepended to every path. */
  origin: string,
): FeedPost[] {
  const abs = (u: string) => (/^https?:\/\//i.test(u) ? u : `${origin.replace(/\/+$/, '')}${u.startsWith('/') ? u : `/${u}`}`)
  return posts.map(post => {
    const loc = localizePost(post, locale)
    return {
      id: post.id,
      title: loc.title,
      url: abs(articleUrl(link, post, locale)),
      excerpt: loc.seo_description?.trim() || loc.excerpt || null,
      author: loc.author_name,
      categories: loc.categories,
      date: loc.created_at,
    }
  })
}

/** The blog's own feed address for a locale, fully qualified. */
export function feedUrlFor(link: LinkCtx, locale: Locale, origin: string): string {
  const u = feedUrl(link, locale)
  return /^https?:\/\//i.test(u) ? u : `${origin.replace(/\/+$/, '')}${u}`
}

/** The listing address for a locale, fully qualified. */
export function listingUrlFor(link: LinkCtx, locale: Locale, origin: string): string {
  const u = listingUrl(link, locale)
  return /^https?:\/\//i.test(u) ? u : `${origin.replace(/\/+$/, '')}${u === '/' ? '' : u}` || origin
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
    return `<a class="carma-lang${active ? ' is-active' : ''}" href="${escapeAttr(urlForLocale(loc))}"${active ? ' aria-current="true"' : ''} hreflang="${loc}" title="${escapeAttr(LOCALE_META[loc].label)}">${escapeHtml(LOCALE_META[loc].native)}</a>`
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

    const inner = tocInnerHtml(headings)

    for (const nav of navs) nav.set_content(inner)
    return root.toString()
  } catch {
    return html
  }
}

// Turn video-embed placeholders (`<div data-carma-embed>`, stored iframe-free by
// the editor) into a sandboxed iframe. The src is built ONLY from a strictly
// validated provider + id — never from the raw pasted URL — so no arbitrary
// iframe/URL is ever emitted. Unknown/invalid embeds render empty.
function fillEmbeds(html: string): string {
  if (!html.includes('data-carma-embed')) return html
  try {
    const root = parse(html)
    const nodes = root.querySelectorAll('[data-carma-embed]')
    if (nodes.length === 0) return html
    for (const el of nodes) {
      el.set_content(embedInnerHtml(el.getAttribute('data-provider') ?? '', el.getAttribute('data-embed-id') ?? ''))
    }
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
//
// ── 2026-09-21: A DARK THEME IS NOT AN UNREADABLE ONE ────────────────────────
// The original guard fired on DARKNESS (`bg < 0.6`) as a proxy for illegibility.
// That proxy was wrong in one direction and the cost was invisible until something
// tried to ship a dark design on purpose:
//
//   · NOIR, our own shipped dark template, has been rendering LIGHT on every
//     customer blog using it. Its pair is #eef2f6 on #08090c — 16.8:1, roughly four
//     times the AA floor — and the guard replaced it with white anyway.
//   · Measured on the design engine's own output: 36 of 36 dark generated designs
//     were flattened to #ffffff at a measured 16.8:1.
//
// So the guard now asks the question it always meant to ask — CAN THIS BE READ —
// instead of the question it was actually asking, which was "is this light". This
// is a strict NARROWING: every palette it used to leave alone it still leaves
// alone, and it now also leaves alone pairs that provably clear AA. An illegible
// palette, dark or light, is still replaced.
function ensureReadableTokens(t: DesignTokens): DesignTokens {
  const bg = colorLightness(t.colorBg)
  const text = colorLightness(t.colorText)
  const darkSurface = bg !== null && bg < 0.6
  const lowContrast = bg !== null && text !== null && Math.abs(bg - text) < 0.4

  // Measured, not estimated: Rec. 601 luma (above) is a cheap ordering heuristic,
  // but whether text can be READ is a WCAG relative-luminance question and nothing
  // else. When the real ratio clears the body floor, there is nothing to repair.
  const fg = parseColor(t.colorText), ground = parseColor(t.colorBg)
  if (fg && ground && contrastRatio(fg, ground) >= 4.5) return t

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
  const hrefs = collectFontHrefs(theme)
  if (hrefs.length === 0) return ''
  // Preconnect to each font provider before requesting its stylesheet — shaves
  // the DNS+TLS round trips off the critical text-rendering path (FCP). Google
  // Fonts serves the CSS from fonts.googleapis.com but the woff2 files from
  // fonts.gstatic.com, so that pair is warmed together.
  const origins = new Set<string>()
  for (const href of hrefs) {
    try {
      const o = new URL(href).origin
      origins.add(o)
      if (o === 'https://fonts.googleapis.com') origins.add('https://fonts.gstatic.com')
    } catch { /* invalid URL already filtered upstream */ }
  }
  const preconnect = [...origins]
    .map(o => `<link rel="preconnect" href="${escapeAttr(o)}" crossorigin />`)
    .join('\n')
  const sheets = hrefs
    .map(href => `<link rel="stylesheet" href="${escapeAttr(href)}" />`)
    .join('\n')
  return `${preconnect}\n${sheets}`
}

// ─── Injected client <head> (the 1:1 clone's styling) ───────────────────────────
//
// extracted_head is the target's real head assets (stylesheets / inline <style> /
// font links), absolutised at capture time. Injecting it makes the target's own CSS
// style the light-DOM header/footer as on the source. W0: their SCRIPTS no longer
// come with it — on any path, for any site, whatever `chrome_scripts_enabled` says.
// What survives is what styles a page (scrubHeadAssets): stylesheets, <style>,
// connection hints. Their menus run on OUR runtime (safePanel.ts) instead.

function buildHead(theme: Theme, title: string, tokens: DesignTokens, seo?: HeadSeo, feedHref?: string, chrome?: ResolvedChrome, preload = ''): string {
  const ogTitle = seo?.ogTitle ?? title
  const parts: string[] = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
  ]
  // The LCP image, requested with the document (imageMarkup.ts#imagePreloadLink) —
  // before any stylesheet, so nothing queues in front of it.
  if (preload) parts.push(preload)
  // RSS AUTODISCOVERY. Without this line the feed exists and nothing finds it:
  // readers, "follow" buttons and aggregators all look for exactly this tag.
  if (feedHref) {
    parts.push(`<link rel="alternate" type="application/rss+xml" title="${escapeAttr(title)}" href="${escapeAttr(feedHref)}" />`)
  }
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

  // THE CHROME'S STYLING — this is what makes the injected light-DOM Top/Bottom
  // look 1:1 with the source site. Two paths:
  //
  //   · COMPILED (Super MVP Fase 4, the fast path): one inline <style> holding only
  //     the rules the captured chrome actually uses, produced once at capture time
  //     by scrape/chromeCompiler.ts. No cross-origin request, nothing
  //     render-blocking, no third-party JS. This is the single biggest LCP win
  //     available on a cloned WordPress site.
  //   · RAW (the legacy path): the target's real <head> injected verbatim. Kept as
  //     the fallback for every site captured BEFORE the compiler existed, so no
  //     live blog changes appearance until its owner re-captures.
  //
  // `compiled_chrome_css` being non-null is the switch. W0: a `harmonise` block (their
  // header repainted in a design's palette — deleted for every site with a website)
  // is cut out of stored CSS here, so their header renders as theirs again.
  //
  // In SAFE PANEL's BAR mode none of their markup is on the page, so none of their
  // CSS is either: the bar is ours, in their tokens, in its own shadow root.
  if (chrome?.mode !== 'bar') {
    const compiled = stripHarmony(theme?.compiled_chrome_css ?? '').trim()
    if (compiled) {
      parts.push(`<style>${compiled}</style>`)
      const residualHead = scrubHeadAssets(stripCompiledHead(theme?.extracted_head ?? '', { keepScripts: false }))
      if (residualHead) parts.push(residualHead)
    } else {
      const clientHead = scrubHeadAssets(theme?.extracted_head ?? '')
      if (clientHead) parts.push(clientHead)
    }
  }
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
  // overflow-x:clip — no horizontal scroll on any rendered blog, ever. `clip`
  // (not `hidden`) doesn't create a scroll container, so the injected chrome's
  // position:sticky headers keep working.
  return `html{box-sizing:border-box}
html,body{margin:0;padding:0;overflow-x:clip}
body{background:${bg}}`
}

// The blog shadow-host box-guard, emitted AFTER the client head so it always wins.
// The host sits exactly where the source's main content did; we force it to behave
// as a normal full-width block so inherited wrapper CSS (float/flex/position) can't
// collapse it. The host's background is painted by :host inside the shadow root.
function buildHostGuardCss(): string {
  // overflow-x:clip (mobile audit 2026-07-06): on /embed we do NOT own the host
  // page's <body>, so a too-wide element inside the shadow (table, wide grid,
  // long URL) used to stretch the CUSTOMER's page into horizontal scroll. Clip
  // at the host edge instead — `clip` creates no scroll container, so sticky
  // chrome inside keeps working (same rationale as the html,body rule).
  return `.carma-embed-host{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;flex:1 1 auto!important;min-width:0!important;float:none!important;position:static!important;margin:0!important;padding:0!important;overflow-x:clip!important}`
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
//
// The polyfill also FLATTENS the blog's cascade layers when the browser has no
// @layer (it would otherwise drop every layered block whole — an unstyled blog).
// Every engine shipped @layer before native DSD, so this branch is exactly the
// population that needs it; a modern browser never reaches it. See blogCss.ts.
const DSD_RUNTIME = `(function(){
  try{
    if(!Object.prototype.hasOwnProperty.call(HTMLTemplateElement.prototype,'shadowRootMode')){
      var flat=typeof CSSLayerBlockRule==='undefined'?${UNLAYER_JS}:null;
      document.querySelectorAll('template[shadowrootmode]').forEach(function(tpl){
        var host=tpl.parentNode; if(!host||!host.attachShadow||host.shadowRoot) return;
        try{ if(flat) tpl.content.querySelectorAll('style').forEach(function(s){s.textContent=flat(s.textContent)}); var sr=host.attachShadow({mode:tpl.getAttribute('shadowrootmode')||'open'}); sr.appendChild(tpl.content); tpl.remove(); }catch(e){}
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
  return theme?.section_title?.trim() || RENDER_STRINGS[uiLocale(locale)].articles
}

// ─── W0: the chrome a page wears ──────────────────────────────────────────────
//
// One decision per page, made here and nowhere else (reboot plan §3.2, W0):
//
//   none    no chrome stored.
//   scoped  one of OUR starter templates — a business with no website (Ø). The
//           only place generated chrome survives.
//   keep    THEIR captured markup, scrubbed of every script (chromeSafety.ts);
//           their dead burger opens SAFE PANEL's drawer.
//   bar     SAFE PANEL instead of their markup: a capture marked unfaithful, or a
//           header W6 DREW for them (`rebuild` — deleted: it kept a median 35% of
//           their links and none of their legal ones). Their logo + every link.
//
// `harmonise` has no mode: its CSS block is cut out of their stored CSS in
// buildHead, which leaves their header exactly as captured.

export type ChromeMode = 'none' | 'scoped' | 'keep' | 'bar'
type ResolvedChrome = {
  mode: ChromeMode
  /** keep / scoped: the Top region · bar: the SAFE PANEL header host. */
  before: string
  /** keep / scoped: the Bottom region · bar: the SAFE PANEL footer host. */
  after: string
  /** Their navigation, for SAFE PANEL (keep: the drawer · bar: already drawn). */
  tree: LinkTree | null
}

const SAFE_STRINGS: Record<UiLocale, { menu: string; close: string }> = {
  ca: { menu: 'Menú', close: 'Tanca el menú' },
  es: { menu: 'Menú', close: 'Cerrar el menú' },
  en: { menu: 'Menu', close: 'Close the menu' },
}

function safeTokens(theme: Theme, tokens: DesignTokens): SafeTokens {
  return {
    bg: pageBackground(theme, tokens), surface: tokens.colorSurface, text: tokens.colorText, muted: tokens.colorMuted,
    border: tokens.colorBorder, accent: tokens.colorAccent, fontBody: tokens.fontBody, fontHeading: tokens.fontHeading,
    maxWidth: tokens.maxWidth,
  }
}

/** Where their logo links to: their homepage, as their own header does. */
function homeOf(base: string | null, tree: LinkTree): string {
  try { if (base) return `${new URL(base).origin}/` } catch { /* fall through */ }
  const first = treeLinks(tree).find(l => /^https?:/i.test(l.href))
  try { if (first) return `${new URL(first.href).origin}/` } catch { /* fall through */ }
  return '/'
}

// A starter template's header is STORED when the template is applied (site_themes),
// so a fix to templates.ts only reaches new sites. Their navs must not wrap on a
// phone: the swap from the fallback face to the web font wrapped a link and moved
// the whole blog down 32px (CLS 0.143 on a 412px screen, 2026-10-09). Patched here,
// where every stored copy passes; the classes are ours and exist nowhere else.
const TEMPLATE_HEADER_PATCH = '@media (max-width:640px){.cx-ed-nav,.cx-at-nav{flex-wrap:nowrap;justify-content:safe center;overflow-x:auto;scrollbar-width:none}.cx-ed-nav a,.cx-at-nav a{flex:none;white-space:nowrap}}'

// A starter template's region: self-contained CSS forced under
// [data-carma-chrome="…"] behind an all:initial wall (zero bleed either way).
function scopedRegion(data: ChromeRegion | null, region: 'header' | 'footer'): string {
  if (!data) return ''
  const own = region === 'header' ? `${data.css}\n${TEMPLATE_HEADER_PATCH}` : data.css
  const css = scopeChromeCss(own.replace(/<\/style/gi, '<\\/style'), region)
  return `<div class="cx-host cx-host-${region}" data-carma-chrome="${region}"><style>${css}</style>
${data.html}
</div>`
}

function resolveChrome(theme: Theme, siteName: string, locale: Locale): ResolvedChrome {
  const head = parseRegion(chromeRegionRaw(theme, 'header', locale))
  const foot = parseRegion(chromeRegionRaw(theme, 'footer', locale))
  if (!head && !foot) return { mode: 'none', before: '', after: '', tree: null }

  const base = theme?.base_url || theme?.reference_url || null
  const rebuilt = (head?.kind === 'scoped' && isRebuiltRegion(head.html)) || (foot?.kind === 'scoped' && isRebuiltRegion(foot.html))
  const unfaithful = (theme?.chrome_compile_stats as { faithful?: boolean } | null | undefined)?.faithful === false
  if (rebuilt || unfaithful) {
    const tree = extractLinkTree(head?.html ?? '', foot?.html ?? '', base)
    const tokens = tokensOf(theme)
    const bar = safePanelBar(tree, {
      siteName, home: homeOf(base, tree), tokens: safeTokens(theme, tokens), menuLabel: SAFE_STRINGS[uiLocale(locale)].menu,
    })
    return { mode: 'bar', before: bar.header, after: bar.footer, tree }
  }
  if (head?.kind === 'scoped' || foot?.kind === 'scoped') {
    return { mode: 'scoped', before: scopedRegion(head, 'header'), after: scopedRegion(foot, 'footer'), tree: null }
  }
  return {
    mode: 'keep', before: head?.html ?? '', after: foot?.html ?? '',
    tree: extractLinkTree(head?.html ?? '', foot?.html ?? '', base),
  }
}

// The single marker we stitch the blog into. A comment is inert markup, survives a
// spec-compliant parse round-trip, and is trivially located for the final swap.
const BLOG_SLOT = '<!--CARMA_BLOG_SLOT-->'

/**
 * Everything after this comment is a script WE wrote. The page's CSP lists the
 * hashes of the scripts after the LAST occurrence (ours is always the last: it is
 * appended after their chrome) — so a script that slipped through the scrub, which
 * can only sit before it, has no hash and does not run. See pageCsp.
 */
export const SCRIPTS_MARK = '<!--carma:scripts-->'

/**
 * The Content-Security-Policy of a rendered blog page: our scripts by hash, no
 * plugins, no <base>. Their CSS, fonts and images load as before — what the
 * policy refuses is code we did not write.
 */
export function pageCsp(html: string): string {
  const i = html.lastIndexOf(SCRIPTS_MARK)
  const hashes = new Set<string>()
  if (i >= 0) {
    for (const m of html.slice(i).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1] ?? '')?.[1] ?? '').toLowerCase()
      if (type && !/javascript|module/.test(type)) continue
      hashes.add(`'sha256-${createHash('sha256').update(m[2] ?? '', 'utf8').digest('base64')}'`)
    }
  }
  return [`script-src ${hashes.size ? [...hashes].join(' ') : "'none'"}`, "object-src 'none'", "base-uri 'none'"].join('; ')
}

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
//
// W0: the SAME parse is where their chrome loses every script (scrubTree) — one
// walk, on every render, so every site already stored is clean without a data
// migration. A parse that fails serves no chrome at all, never the raw markup.
function stitchChrome(before: string, after: string, slot: (burgers: number) => string): { html: string; burgers: number } {
  let shell = ''
  let burgers = 0
  try {
    const frag = parseFragment(`${before}\n${BLOG_SLOT}\n${after}`) as unknown as P5Node
    burgers = scrubTree(frag).burgers
    shell = serialize(frag as never)
  } catch { shell = '' }
  const inner = slot(burgers)
  if (shell.includes(BLOG_SLOT)) return { html: shell.replace(BLOG_SLOT, () => `\n${inner}\n`), burgers }
  // Defensive: if the parser ever dropped the slot (it shouldn't), fall back to a
  // balanced concatenation so we still serve a valid document with the blog.
  return { html: `${shell}\n${inner}`, burgers }
}

/**
 * The page body around OUR blog host: their chrome (scrubbed) or SAFE PANEL's bar,
 * plus — when their header is kept and we recognised its burger — the drawer that
 * burger now opens. `script` says whether SAFE_PANEL_JS must ship with the page.
 *
 * No burger recognised → no drawer and nothing added to their page: our own
 * control would also appear on headers whose navigation is visible on phones, and
 * fidelity comes first. (W2's browser capture can see visibility; then it can.)
 */
function chromeBody(theme: Theme, chrome: ResolvedChrome, blogHostHtml: string, siteName: string, locale: Locale): { html: string; script: boolean } {
  if (chrome.mode === 'bar') return { html: `${chrome.before}\n${blogHostHtml}\n${chrome.after}`, script: true }
  const tree = chrome.mode === 'keep' ? chrome.tree : null
  const menu = !!tree && treeLinks(tree).length >= 2
  const stitched = stitchChrome(chrome.before, chrome.after, () => blogHostHtml)
  if (!menu || stitched.burgers === 0) return { html: stitched.html, script: false }
  const s = SAFE_STRINGS[uiLocale(locale)]
  const drawer = safePanelDrawer(tree!, {
    siteName, tokens: safeTokens(theme, tokensOf(theme)), menuLabel: s.menu, closeLabel: s.close,
  })
  return { html: `${stitched.html}\n${drawer}`, script: true }
}

// The <body> opening tag carrying the source's attributes (so its global
// background / typography rules match). on*-handlers are stripped defensively.
// SAFE PANEL's bar wears none of their markup, so none of their body classes.
function sanitizeBodyAttrs(attrs: string | null | undefined): string {
  const s = (attrs ?? '').trim()
  if (!s) return ''
  return s.replace(/\son[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').trim()
}
function bodyOpenTag(theme: Theme, chrome: ResolvedChrome): string {
  if (chrome.mode === 'bar') return '<body>'
  const attrs = sanitizeBodyAttrs(theme?.extracted_body_attrs)
  return attrs ? `<body ${attrs}>` : '<body>'
}

/** The scripts every page ends with — after SCRIPTS_MARK, so the CSP can hash exactly these. */
function pageScripts(theme: Theme, siteId: string, postId: string | null, kind: 'article' | 'listing', chrome: ResolvedChrome, safePanel: boolean): string {
  return [
    SCRIPTS_MARK,
    runtimeScript(),
    modulesRuntimeScript(theme?.modules ?? null, siteId, postId ?? undefined),
    // The readability guard repairs THEIR light-DOM chrome; the bar is ours.
    chrome.mode === 'keep' ? contrastGuardScript() : '',
    safePanel ? `<script>${SAFE_PANEL_JS}</script>` : '',
    trackingScript(siteId, postId, kind),
  ].filter(Boolean).join('\n')
}

// Localized label for demo/sample cards (preview-only). See Post.demo + buildCard.
const DEMO_BADGE: Record<UiLocale, string> = {
  ca: 'Article de mostra',
  es: 'Artículo de muestra',
  en: 'Sample article',
}

// The preview-only banner shown above a fully-demo feed, so a user in onboarding /
// theme-selection instantly understands these are examples of how THEIR blog will
// look — never mistaking them for imported content. Kept warm + confident (not a
// "placeholder" apology) so the preview still inspires.
const DEMO_BANNER: Record<UiLocale, { chip: string; title: string; desc: string }> = {
  ca: {
    chip: 'Vista prèvia',
    title: 'Articles de mostra',
    desc: 'Aquests exemples ensenyen com quedarà el teu blog amb aquest disseny. Publica els teus articles i substituiran la mostra a l’instant.',
  },
  es: {
    chip: 'Vista previa',
    title: 'Artículos de muestra',
    desc: 'Estos ejemplos muestran cómo quedará tu blog con este diseño. Publica tus artículos y sustituirán la muestra al instante.',
  },
  en: {
    chip: 'Preview',
    title: 'Sample articles',
    desc: 'These examples show how your blog will look with this design. Publish your own and they’ll replace the samples instantly.',
  },
}

function buildDemoBanner(locale: Locale): string {
  const b = DEMO_BANNER[uiLocale(locale)] ?? DEMO_BANNER.ca
  return `<div class="carma-demo-banner" role="note">
  <span class="carma-demo-banner-chip">✦ ${escapeHtml(b.chip)}</span>
  <span class="carma-demo-banner-text">
    <p class="carma-demo-banner-title">${escapeHtml(b.title)}</p>
    <p class="carma-demo-banner-desc">${escapeHtml(b.desc)}</p>
  </span>
</div>`
}

// `rank` = the card's place in the feed: the first card's image is the listing's
// LCP candidate, the next two are above the fold on a desktop grid (imageMarkup.ts).
function buildCard(post: Post, link: LinkCtx, locale: Locale, rank = Infinity): string {
  const loc = localizePost(post, locale)
  // Each card links to THIS post's slug in the listing's current language. The
  // localized slug (if any) becomes the URL — that's the canonical address of
  // the post in that language.
  const href = articleUrl(link, post, locale)
  const media = loc.featured_image
    ? `<div class="carma-card-media">${responsiveCardImage(loc.featured_image, loc.title, rank)}</div>`
    : ''
  const excerpt = loc.excerpt ? `<p class="carma-card-excerpt">${escapeHtml(loc.excerpt)}</p>` : ''
  const cat = loc.categories?.[0] ? `<span class="carma-cat">${escapeHtml(loc.categories[0])}</span><span>·</span>` : ''
  // Data hooks for the client-side Smart Modules (search + category filter). Inert
  // when no module is enabled; never affect the default render's appearance.
  const cats = (loc.categories ?? []).map(c => c.toLowerCase()).join(',')
  // Search matches title + excerpt + categories + tags, so a query for a topic or a
  // category name surfaces the article (title-only search felt broken).
  const searchText = `${loc.title} ${loc.excerpt ?? ''} ${(loc.categories ?? []).join(' ')} ${(loc.tags ?? []).join(' ')}`.toLowerCase()
  // Preview-only demo posts get an unmistakable badge so they're never confused
  // with real content (onboarding / theme-selection grids).
  const demoBadge = post.demo
    ? `<span class="carma-card-demo">${escapeHtml(DEMO_BADGE[uiLocale(locale)] ?? DEMO_BADGE.ca)}</span>`
    : ''
  // Real posts carry their id so the Theme Studio can map a clicked card back to
  // the post and inline-edit its title/excerpt. Demo/sample cards get no id (not
  // editable — there's nothing to persist).
  const postIdAttr = post.demo ? '' : ` data-carma-post="${escapeAttr(post.id)}"`
  return `<article class="carma-card" data-carma-cats="${escapeAttr(cats)}" data-carma-search="${escapeAttr(searchText)}"${postIdAttr}>${demoBadge}<a class="carma-card-link" href="${escapeAttr(href)}">
  ${media}
  <div class="carma-card-body">
    <div class="carma-meta">${cat}<time datetime="${escapeAttr(loc.created_at)}">${escapeHtml(formatDate(loc.created_at, locale))}</time></div>
    <h2 class="carma-card-title">${escapeHtml(loc.title)}</h2>
    ${excerpt}
  </div>
</a></article>`
}

function buildEmptyState(siteName: string, locale: Locale): string {
  const s = RENDER_STRINGS[uiLocale(locale)]
  return `<div class="carma-empty">
  <h2 class="carma-empty-title">${escapeHtml(s.emptyTitle)}</h2>
  <p class="carma-empty-desc">${s.emptyDesc(siteName)}</p>
</div>`
}

// ─── Smart Modules bridge ─────────────────────────────────────────────────────
//
// Maps the renderer's localized posts + helpers into the module engine's neutral
// data shape, then asks it for the HTML/CSS to weave in. Pure; returns empty
// parts when no module is enabled (so the default render is byte-for-byte
// unchanged).

type ArticleExtra = { siblings?: Post[]; unlocked?: boolean }

function moduleHelpers(locale: Locale): ModuleHelpers {
  return {
    esc: escapeHtml,
    escAttr: escapeAttr,
    img: (src, alt) => responsiveCardImage(src, alt),
    fmtDate: (iso) => formatDate(iso, locale),
  }
}

function toModulePost(post: Post, link: LinkCtx, locale: Locale): ModulePost {
  const loc = localizePost(post, locale)
  return {
    id: post.id,
    title: loc.title,
    excerpt: loc.excerpt,
    image: loc.featured_image,
    categories: loc.categories ?? [],
    tags: loc.tags ?? [],
    author: loc.author_name,
    date: loc.created_at,
    url: articleUrl(link, post, locale),
  }
}

function listingModuleParts(theme: Theme, siteId: string, link: LinkCtx, posts: Post[], locale: Locale): ListingModuleParts {
  return buildListingModuleParts(
    theme?.modules ?? null,
    posts.map(p => toModulePost(p, link, locale)),
    locale,
    moduleHelpers(locale),
  )
}

function articleModuleParts(
  theme: Theme, siteId: string, link: LinkCtx, post: Post, locale: Locale, contentHtml: string, extra?: ArticleExtra,
): ArticleModuleParts {
  const cur = toModulePost(post, link, locale)
  const sibsRaw = (extra?.siblings ?? []).map(p => toModulePost(p, link, locale))
  // Ensure the current post is present, then order newest→oldest so prev/next is
  // correct regardless of how the route fetched the neighbours.
  const merged = sibsRaw.some(s => s.id === cur.id) ? sibsRaw.slice() : [...sibsRaw, cur]
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return buildArticleModuleParts(theme?.modules ?? null, {
    post: cur,
    contentHtml,
    siblings: merged,
    unlocked: extra?.unlocked ?? true,
    locale,
    h: moduleHelpers(locale),
  })
}

// ─── Body builders (shared by full-page render AND the embeddable fragment) ───
//
// The render body is: [header — LIGHT DOM] + [blog — SHADOW DOM] + [footer — LIGHT
// DOM]. The header/footer are the client's real markup, styled by the injected
// client head CSS (1:1 clone). The blog is OUR template, isolated behind a
// Declarative Shadow DOM so the client's global CSS can't break it and ours can't
// leak onto the chrome. The blog's token-driven stylesheet lives INSIDE the
// shadow root via renderBlogHost.

// Wrap OUR blog markup in the Declarative-Shadow-DOM host. The blog's layered
// stylesheet (blogCss.ts) is emitted INSIDE the shadow <style>, so it is fully
// encapsulated — which is the whole reason it no longer needs `!important`.
// `card` is the captured native card (it closes `ornament`); `overrides` are the
// decisions layered over the template, in precedence order.
function renderBlogHost(innerHtml: string, tokens: DesignTokens, overrides = '', card?: CardStyle | null): string {
  const css = buildBlogCss(tokens, { host: 'page', card, overrides })
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

// The `overrides` layer, in precedence order: the owner's structural feed layout,
// then the genome's own layer (which refines that rhythm), then the modules. Each
// is a decision layered over the template, and a tie goes to the later one. The
// article has no feed, so no layout. (The captured native card is not a decision —
// it is the template's own card, tuned to the source — see buildBlogCss.)
function listingOverrides(theme: Theme, tokens: DesignTokens, modulesCss: string): string {
  return [
    feedLayoutCss(tokens.feedLayout),
    theme?.genome_css ?? '',
    modulesCss,
  ].filter(s => s.trim()).join('\n')
}

function articleOverrides(theme: Theme, modulesCss: string): string {
  return [theme?.genome_css ?? '', modulesCss].filter(s => s.trim()).join('\n')
}

// OUR blog markup for the listing (the .carma-root <main>). Returned WITHOUT the
// shadow host wrapper so it can be reused both inside renderBlogHost (full page)
// and inside the embed loader's own shadow root (fragment).
// STRICT locale filtering (founder directive 2026-06-30): the feed shows ONLY the
// posts that actually have content in the active language — a Spanish-only article
// must never appear under the Catalan tab. If the active locale has no content but
// other languages do (rare: a site default with no posts in it), fall back to the
// first language that does, so a real catalogue never renders as an empty feed.
// Shared by the feed and by the <head> (which preloads the first card's image).
function feedPosts(posts: Post[], locale: Locale): { available: Locale[]; feedLocale: Locale; visiblePosts: Post[] } {
  const available = LOCALES.filter(l => posts.some(p => postLocales(p).includes(l)))
  const feedLocale = available.includes(locale) ? locale : (available[0] ?? locale)
  return { available, feedLocale, visiblePosts: posts.filter(p => postLocales(p).includes(feedLocale)) }
}

function listingBlogInner(theme: Theme, siteName: string, link: LinkCtx, posts: Post[], locale: Locale, parts: ListingModuleParts): string {
  const tokens = tokensOf(theme)
  const urlForLocale = (l: Locale) => listingUrl(link, l)
  const { available, feedLocale, visiblePosts } = feedPosts(posts, locale)
  // The language switcher lives on OUR navigation surface (clicking the client's
  // own nav navigates to the source site, so it can't host our switcher).
  const bodySwitcher = buildLangSwitcher(available, feedLocale, urlForLocale)

  const sectionTitle = localizedSectionTitle(theme, locale)
  // Preview-only: when EVERY visible card is demo content, surface a clear banner
  // so sample articles are never mistaken for imported/real posts. Demo posts are
  // injected only under ?preview, so this never shows on the public render.
  const isDemoFeed = visiblePosts.length > 0 && visiblePosts.every(p => p.demo)
  const demoBanner = isDemoFeed ? buildDemoBanner(locale) : ''
  const feed = visiblePosts.length === 0
    ? buildEmptyState(siteName, locale)
    : `<div class="carma-grid">\n${visiblePosts.map((p, i) => buildCard(p, link, feedLocale, i)).join('\n')}\n</div>`

  const crumb = tokens.showBreadcrumb
    ? `<nav class="carma-breadcrumb"><a href="${escapeAttr(urlForLocale(locale))}">${escapeHtml(RENDER_STRINGS[uiLocale(locale)].home)}</a><span>›</span><span>${escapeHtml(sectionTitle)}</span></nav>`
    : ''
  const hasImage = !!tokens.headingImage
  const headStyle = hasImage ? ` style="background-image:url('${escapeAttr(tokens.headingImage!)}')"` : ''
  const head = `<div class="carma-section-head${hasImage ? ' has-image' : ''}"${headStyle}>${crumb}<h1 class="carma-section-title">${escapeHtml(sectionTitle)}</h1></div>`

  return `${parts.top}
<main class="carma-root carma-main">
${bodySwitcher}
${head}
${demoBanner}
${parts.beforeFeed}
${feed}
${parts.afterFeed}
</main>
${parts.overlays}`
}

// Full render body: the client's shell (LIGHT DOM) STITCHED around the blog
// (SHADOW DOM) into one well-formed document, server-side.
function listingBodyHtml(theme: Theme, siteName: string, siteId: string, link: LinkCtx, posts: Post[], locale: Locale, chrome: ResolvedChrome): { html: string; script: boolean } {
  const tokens = tokensOf(theme)
  const parts = listingModuleParts(theme, siteId, link, posts, locale)
  const blog = renderBlogHost(
    listingBlogInner(theme, siteName, link, posts, locale, parts),
    tokens,
    listingOverrides(theme, tokens, parts.css),
    theme?.blog_signature?.card,
  )
  return chromeBody(theme, chrome, blog, siteName, locale)
}

// OUR blog markup for the article view (the .carma-root <main>), sans shadow host.
// `parts` carries the Smart Modules HTML + the (possibly paywalled) content.
function articleBlogInner(theme: Theme, link: LinkCtx, post: Post, locale: Locale, parts: ArticleModuleParts): string {
  const loc = localizePost(post, locale)
  const s = RENDER_STRINGS[uiLocale(locale)]
  const available = postLocales(post)
  // CRITICAL: each language gets its OWN URL via its localized slug. The
  // switcher links to /render/<siteId>/<localized-slug-for-locale> directly,
  // so a Spanish user clicking "English" lands on the English slug — no
  // ?lang= juggling, no 404s, no slug↔URL drift.
  const urlForLocale = (l: Locale) => articleUrl(link, post, l)
  const bodySwitcher = buildLangSwitcher(available, locale, urlForLocale)

  const featured = loc.featured_image
    ? `<figure class="carma-article-image-wrap">${responsiveFeaturedImage(loc.featured_image, loc.title)}</figure>`
    : ''

  const metaParts: string[] = []
  if (loc.author_name) metaParts.push(`<span>${escapeHtml(loc.author_name)}</span>`)
  metaParts.push(`<time datetime="${escapeAttr(loc.created_at)}">${escapeHtml(formatDate(loc.created_at, locale))}</time>`)
  if (loc.categories?.length) metaParts.push(`<span class="carma-cat">${loc.categories.map(escapeHtml).join(', ')}</span>`)

  const lede = loc.excerpt ? `<p class="carma-article-lede">${escapeHtml(loc.excerpt)}</p>` : ''

  return `${parts.top}
<main class="carma-root carma-main">
  <article class="carma-article">
    <a href="${escapeAttr(listingUrl(link, locale))}" class="carma-back" rel="up">${escapeHtml(s.back)}</a>
    ${bodySwitcher}
    <header class="carma-article-header">
      <h1 class="carma-article-title">${escapeHtml(loc.title)}</h1>
      ${lede}
      <div class="carma-article-meta">${metaParts.join('<span>·</span>')}</div>
    </header>
    ${parts.beforeContent}
    ${featured}
    <div class="carma-article-content">
      ${parts.content}
    </div>
    ${parts.afterContent}
  </article>
  ${parts.overlays}
</main>`
}

// Build the base content (TOC fill + responsive images), then run the modules
// (paywall transform, related, etc.) so we compute the content exactly once.
function articleSetup(theme: Theme, siteId: string, link: LinkCtx, post: Post, locale: Locale, extra?: ArticleExtra): ArticleModuleParts {
  const loc = localizePost(post, locale)
  const baseContent = transformContentImages(fillEmbeds(fillTableOfContents(getContentHtml(loc))))
  return articleModuleParts(theme, siteId, link, post, locale, baseContent, extra)
}

/**
 * W7 — what the article page gives a WRITER to write on.
 *
 * EXACTLY the stylesheet this post's shadow root receives — the same tokens, the
 * same Genome CSS and the same modules CSS, through the same `buildBlogCss` call
 * as `renderBlogHost` below — and the same font links as the page's head. The
 * editor's canvas (components/editor/canvas) renders these, so the page being
 * written on is the page being read: by construction, never by imitation.
 */
export function articleCanvasParts(
  theme: Parameters<typeof buildArticlePage>[0],
  siteId: string,
  post: Parameters<typeof buildArticlePage>[3],
  locale: Locale,
): { shadowCss: string; fontLinksHtml: string } {
  const tokens = tokensOf(theme)
  const parts = articleSetup(theme, siteId, defaultLink(siteId, theme), post, locale)
  return {
    shadowCss: buildBlogCss(tokens, { host: 'page', overrides: articleOverrides(theme, parts.css) }),
    fontLinksHtml: buildFontLinks(theme),
  }
}

function articleBodyHtml(theme: Theme, siteName: string, link: LinkCtx, post: Post, locale: Locale, parts: ArticleModuleParts, chrome: ResolvedChrome): { html: string; script: boolean } {
  const tokens = tokensOf(theme)
  const blog = renderBlogHost(articleBlogInner(theme, link, post, locale, parts), tokens, articleOverrides(theme, parts.css))
  return chromeBody(theme, chrome, blog, siteName, locale)
}

// ─── Full standalone documents (used by the iframe embed + direct visit) ──────

export function buildListingPage(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale = DEFAULT_LOCALE, link?: LinkCtx): string {
  const tokens = tokensOf(theme)
  const ctx = link ?? defaultLink(siteId, theme)
  const chrome = resolveChrome(theme, siteName, locale)
  const jsonLd = buildBlogJsonLd({
    url: listingUrl(ctx, locale),
    name: siteName,
    locale,
  })
  const body = listingBodyHtml(theme, siteName, siteId, ctx, posts, locale, chrome)
  // The first card is the listing's LCP candidate: when it has an image, fetch it
  // with the document instead of after the shadow root's parse.
  const { feedLocale, visiblePosts } = feedPosts(posts, locale)
  const lead = visiblePosts[0] ? localizePost(visiblePosts[0], feedLocale).featured_image : null
  return `<!doctype html>
<html lang="${locale}">
<head>
${buildHead(theme, siteName, tokens, undefined, feedUrl(ctx, locale), chrome, imagePreloadLink(lead, DEFAULT_SIZES_CARD))}
${jsonLd}
</head>
${bodyOpenTag(theme, chrome)}
${body.html}
${pageScripts(theme, siteId, null, 'listing', chrome, body.script)}
</body>
</html>`
}

export function buildArticlePage(theme: Theme, siteName: string, siteId: string, post: Post, locale: Locale = DEFAULT_LOCALE, extra?: ArticleExtra, link?: LinkCtx): string {
  const tokens = tokensOf(theme)
  const ctx = link ?? defaultLink(siteId, theme)
  const loc = localizePost(post, locale)
  const chrome = resolveChrome(theme, siteName, locale)
  // Compute the module parts ONCE here so the structured data uses the VISIBLE
  // (post-paywall) content — a locked article must never leak its hidden body via
  // JSON-LD / FAQ schema. When unlocked, parts.content is the full article.
  const parts = articleSetup(theme, siteId, ctx, post, locale, extra)
  const visibleContent = parts.content
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
  const articleHref = canonical ?? articleUrl(ctx, post, locale)
  const listingHref = listingUrl(ctx, locale)
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
      // VISIBLE content only: a paywalled article exposes just the free preview.
      articleBody: htmlToPlainText(visibleContent),
    }),
    buildBreadcrumbJsonLd({
      listingUrl: listingHref,
      listingName: sectionTitle,
      articleUrl: articleHref,
      articleName: loc.title,
    }),
    maybeBuildFaqJsonLd(visibleContent),
  ].filter(Boolean).join('\n')

  const body = articleBodyHtml(theme, siteName, ctx, post, locale, parts, chrome)
  return `<!doctype html>
<html lang="${locale}">
<head>
${buildHead(theme, `${seoTitle} · ${siteName}`, tokens, seo, feedUrl(ctx, locale), chrome, imagePreloadLink(loc.featured_image, DEFAULT_SIZES_FEATURED, false))}
${jsonLd}
</head>
${bodyOpenTag(theme, chrome)}
${body.html}
${pageScripts(theme, siteId, post.id, 'article', chrome, body.script)}
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

// The same layered sheet, for the embed loader's own shadow root. The host rule
// differs: inside a customer's page the blog claims only its own box model.
function fragmentCss(t: DesignTokens, overrides = '', card?: CardStyle | null): string {
  return buildBlogCss(t, { host: 'fragment', card, overrides })
}

export function buildListingFragment(theme: Theme, siteName: string, siteId: string, posts: Post[], locale: Locale = DEFAULT_LOCALE, link?: LinkCtx): RenderFragment {
  const tokens = tokensOf(theme)
  const ctx = link ?? defaultLink(siteId, theme)
  const parts = listingModuleParts(theme, siteId, ctx, posts, locale)
  return {
    css: fragmentCss(tokens, listingOverrides(theme, tokens, parts.css), theme?.blog_signature?.card),
    html: listingBlogInner(theme, siteName, ctx, posts, locale, parts),
    fonts: collectFontHrefs(theme),
  }
}

export function buildArticleFragment(theme: Theme, siteId: string, post: Post, locale: Locale = DEFAULT_LOCALE, extra?: ArticleExtra, link?: LinkCtx): RenderFragment {
  const tokens = tokensOf(theme)
  const ctx = link ?? defaultLink(siteId, theme)
  const parts = articleSetup(theme, siteId, ctx, post, locale, extra)
  return {
    css: fragmentCss(tokens, articleOverrides(theme, parts.css)),
    html: articleBlogInner(theme, ctx, post, locale, parts),
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
