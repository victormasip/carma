// The blog's own stylesheet — the CSS that lives INSIDE the Declarative Shadow DOM.
//
// Split out of theme.ts in W5 (the cascade surgery). theme.ts assembles documents;
// this file owns what they look like.
//
// ── WHY THERE IS NO `!important` HERE ANY MORE ──────────────────────────────────
// Every declaration below used to carry `!important`: ~590 of them, a scar from the
// era when our CSS sat in the same document as the customer's and had to out-shout
// it. Since the Magic Wand pivot the blog renders inside a shadow root, where no
// author stylesheet but ours can reach an element. Inside that boundary
// `!important` protected us from nothing — it only fought US: every later rule
// (a feed layout, a captured card, a module, a genome) had to shout too, and the
// winner of each fight was decided by selector specificity, i.e. by accident.
//
// Cascade layers replace the shouting with an ORDER, declared once:
//
//     reset → tokens → structure → type → ornament → motion → overrides
//
// A later layer beats an earlier one whatever the specificity; inside a layer the
// usual rules apply. So "an explicit choice beats the template" is now a sentence in
// the stylesheet instead of an arms race — and it is what finally lets the genome's
// own layer apply at all (see test:cascade §5: 5 of its 16 probed effects were
// silently ignored by the all-`!important` base it was written against).
//
// ── WHAT STILL SHOUTS, AND WHY ──────────────────────────────────────────────────
//   · The light-DOM host guard (theme.ts, buildHostGuardCss). It sits in the
//     customer's document, next to their CSS, with no boundary protecting it.
//   · Smart Modules' CSS (modules.ts), carried verbatim inside `overrides`. It is
//     scoped to `.carma-mod-*`, so inside the layer its importance is inert —
//     changing 239 lines to prove nothing was not this surgery's job.
//   · The Studio's live CSS, injected UNLAYERED at runtime — an unlayered rule
//     outranks every layer, which is exactly the authority a live edit should have.
//
// ── THE LAYERS ARE NAMED BY CONCERN, AND ORDERED BY GENERALITY ──────────────────
// Order within a layer is the original source order, unchanged. Rules were placed
// so that no two declarations that fight over one property on one element cross a
// layer boundary in the wrong direction — e.g. every component that styles its own
// links (gallery, lightbox, TOC, button) sits in `ornament`, AFTER the generic
// article-link rule in `type`, because it used to beat it on specificity and must
// still beat it on order. `npm run test:cascade` proves the result computes
// identically to the pre-surgery stylesheet, property by property, in Chrome.
//
// ── THREE DECLARATIONS WERE DELETED, DELIBERATELY ───────────────────────────────
// They had never rendered: the isolation reset (`.carma-root p`, `.carma-root a`,
// specificity 0,1,1) silently beat them (0,1,0), both `!important`. Layers would
// have brought them back to life on every published blog at once — an unannounced
// redesign. Removing them is what keeps the page identical:
//   · `.carma-article-lede{margin:0 0 1.4rem}`   (the lede has always sat flush)
//   · `.carma-demo-banner-desc{margin:.12rem 0 0}`
//   · `.carma-back{background:var(--ct-surface)}` (the pill has always been clear)
// Restoring any of them is now a one-line design decision, not a specificity fight.
//
// ── OLD BROWSERS ────────────────────────────────────────────────────────────────
// A browser without @layer drops each `@layer {}` block WHOLE — for us, an unstyled
// blog. Every engine shipped @layer before native Declarative Shadow DOM, so every
// such browser already runs theme.ts's DSD polyfill; the polyfill flattens the
// layers back into one sheet first (`UNLAYER_JS`). Flattened, source order IS the
// layer order, so the only thing an old browser loses is the layer precedence
// itself — never a rule.

import type { DesignTokens } from '@/lib/scrape/tokens'
import type { CardStyle } from '@/lib/scrape/blogDetect'

export const BLOG_LAYERS = ['reset', 'tokens', 'structure', 'type', 'ornament', 'motion', 'overrides'] as const
export type BlogLayer = (typeof BLOG_LAYERS)[number]

/** Declared once, first, so the order holds whatever order the blocks arrive in. */
export const LAYER_ORDER = `@layer ${BLOG_LAYERS.map(l => `carma.${l}`).join(',')};`

// The block syntax is FIXED so the flattener can undo it with three regular
// expressions: `@layer carma.<name>{` … `}/*/carma.<name>*/`. The closing sentinel
// is what makes that safe — a bare `}` would be indistinguishable from a rule's.
const LAYER_STATEMENT = /@layer [a-z.,]+;/g
const LAYER_OPEN = /@layer carma\.[a-z]+\{/g
const LAYER_CLOSE = /\}\/\*\/carma\.[a-z]+\*\//g

function layer(name: BlogLayer, css: string): string {
  return `@layer carma.${name}{\n${css.trim()}\n}/*/carma.${name}*/`
}

/** The layered sheet, as one sheet: wrappers removed, every rule kept, in order. */
export function unlayerCss(css: string): string {
  return css.replace(LAYER_STATEMENT, '').replace(LAYER_OPEN, '').replace(LAYER_CLOSE, '')
}

/**
 * The same flattener as browser JavaScript, built from the SAME regex literals so
 * the shipped shim cannot drift from the tested function.
 */
export const UNLAYER_JS =
  `function(c){return c.replace(${LAYER_STATEMENT},'').replace(${LAYER_OPEN},'').replace(${LAYER_CLOSE},'')}`

/** A substring only the shim contains — the gate checks the runtime carries it. */
export const UNLAYER_SHIM_MARK = String(LAYER_CLOSE)

// ─── Readability guards ──────────────────────────────────────────────────────
// Scraped typographic tokens flow straight into the generated CSS, so a site
// that ships 13px body text or a 1.3 line-height would reproduce that cramped
// reading experience on the blog. Brand IDENTITY tokens (colors, fonts, radii)
// pass through untouched; READABILITY tokens get clamped to a humane range.

/** Clamp the scraped base font size to 15–19px (accepts px/rem/em/%). */
function clampBaseFontSize(raw: string): string {
  const m = /^([\d.]+)(px|rem|em|%)$/.exec((raw ?? '').trim())
  if (!m) return '16px'
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || n <= 0) return '16px'
  const px = m[2] === 'px' ? n : m[2] === '%' ? (n / 100) * 16 : n * 16
  return `${Math.min(19, Math.max(15, Math.round(px * 100) / 100))}px`
}

/** Clamp a unitless line-height token to [min,max]; non-numeric → fallback. */
function clampLineHeight(raw: string | undefined, fallback: number, min: number, max: number): string {
  const n = parseFloat(String(raw ?? ''))
  if (!Number.isFinite(n)) return String(fallback)
  return String(Math.min(max, Math.max(min, n)))
}

// Strip anything that could break out of a CSS declaration/rule. Scraped token
// values flow into a <style> block, so every interpolated value passes through
// this first (the values are also regex-validated at extraction time).
function cssValueSafe(v: string | undefined | null, fallback: string): string {
  const s = (v ?? '').trim()
  if (!s) return fallback
  return /[{}<>;]/.test(s) ? fallback : s
}

// ─── carma.tokens ────────────────────────────────────────────────────────────
// Inside a shadow tree `:root` matches the HOST document's <html>, not us, so the
// variables are bound to `:host` as well. The host paints its own ground and sets
// an explicit base, so nothing is inherited across the boundary from the client's
// body{} rules.

export type HostContext = 'page' | 'fragment'

function tokensCss(t: DesignTokens, host: HostContext): string {
  const vars = `:root,:host{
  --ct-primary:${t.colorPrimary};
  --ct-accent:${t.colorAccent};
  --ct-bg:${t.colorBg};
  --ct-surface:${t.colorSurface};
  --ct-text:${t.colorText};
  --ct-muted:${t.colorMuted};
  --ct-border:${t.colorBorder};
  --ct-font-heading:${t.fontHeading};
  --ct-font-body:${t.fontBody};
  --ct-size:${clampBaseFontSize(t.baseFontSize)};
  --ct-radius:${t.radius};
  --ct-radius-lg:${t.radiusLg};
  --ct-max:${t.maxWidth};
}`
  // The standalone page sets the reading size and leading on the host; the embed
  // fragment sits inside a customer's page and only claims its own box model.
  const hostRule = host === 'page'
    ? ':host{display:block;color-scheme:light;background:var(--ct-bg);color:var(--ct-text);font-family:var(--ct-font-body);font-size:var(--ct-size);line-height:1.65}'
    : ':host{display:block;color-scheme:light;background:var(--ct-bg);color:var(--ct-text);font-family:var(--ct-font-body);box-sizing:border-box}'
  return `${vars}\n${hostRule}`
}

// ─── carma.reset ─────────────────────────────────────────────────────────────
// The isolation reset. It used to be what made the blog "structurally immune" to
// the client's CSS; the shadow root does that now. What it still does is give
// every element the same neutral starting point, whatever template or module
// renders into it.

const RESET_CSS = `
/* Render-document base — this standalone page only. Never reaches the chrome
   shadow roots (encapsulated) nor the dashboard (separate document). */
html,body{margin:0;padding:0;background:var(--ct-bg)}
.carma-root,.carma-root *,.carma-root *::before,.carma-root *::after{box-sizing:border-box}
.carma-root{display:block;width:100%;isolation:isolate;color-scheme:light;background:var(--ct-bg);color:var(--ct-text);font-family:var(--ct-font-body);font-size:var(--ct-size);line-height:1.65;-webkit-font-smoothing:antialiased}
/* :where() keeps this at (0,1,0) so any class rule on a heading can win. */
.carma-root :where(h1,h2,h3,h4,h5,h6){font-family:var(--ct-font-heading);color:var(--ct-text);font-style:normal;text-transform:none;letter-spacing:normal;line-height:1.2;margin:0}
.carma-root a{color:inherit;text-decoration:none;background:none}
.carma-root img{display:block;max-width:100%;border:none;outline:none}
.carma-root p{margin:0}
.carma-root ul,.carma-root ol{list-style:none;margin:0;padding:0}
/* Brand-tinted text selection — the blog feels art-directed down to the drag. */
.carma-root ::selection{background:color-mix(in srgb,var(--ct-accent) 24%,transparent)}`

// ─── carma.structure ─────────────────────────────────────────────────────────
// Boxes: the feed and article containers, the card frame, media geometry and the
// block components whose job is layout (figures, galleries, columns, embeds).

/** The feed grid (grid/list, 2–4 columns). Emitted last in `structure`. */
function feedGridCss(t: DesignTokens): string {
  const cols = t.columns === '2' ? 2 : t.columns === '4' ? 4 : 3
  if (t.layout === 'list') {
    // Stacked, horizontal media-left cards; collapse to vertical on mobile.
    return `
.carma-grid{display:flex;flex-direction:column;gap:1.25rem;width:100%}
.carma-card-link{flex-direction:row;align-items:stretch}
.carma-card-media{aspect-ratio:auto;width:38%;max-width:360px;min-height:200px}
.carma-card-body{justify-content:center}
@media (max-width:680px){
  .carma-card-link{flex-direction:column}
  .carma-card-media{width:100%;aspect-ratio:16/9;max-width:none;min-height:0}
}`.trim()
  }
  return `
.carma-grid{display:grid;grid-template-columns:1fr;gap:1.75rem;width:100%}
@media (min-width:640px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(${cols},minmax(0,1fr))}}`.trim()
}

function structureCss(t: DesignTokens): string {
  return `
/* The feed/article container MIRRORS the cloned site's own content width (--ct-max)
   so the blog lines up with the cloned header + footer. clamp() floors a too-narrow
   mis-extraction and caps a runaway one. */
.carma-main{width:100%;max-width:clamp(720px,var(--ct-max),1600px);margin:0 auto;padding:3rem clamp(1rem,3vw,2rem)}
.carma-langbar{display:flex;gap:.4rem;flex-wrap:wrap;margin:0 0 1.1rem}
.carma-section-head{margin:0 0 1.5rem}
.carma-section-head.has-image{background-size:cover;background-position:center;border-radius:var(--ct-radius-lg);padding:2.75rem 2rem;position:relative;overflow:hidden}
.carma-section-head.has-image::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.5))}
.carma-section-head.has-image .carma-breadcrumb,.carma-section-head.has-image .carma-section-title{position:relative;z-index:1}
.carma-card{background:var(--ct-surface);border:1px solid var(--ct-border);border-radius:var(--ct-radius-lg);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px -12px rgba(0,0,0,.12);position:relative}
.carma-card-link{display:flex;flex-direction:column;flex:1;color:inherit;text-decoration:none}
.carma-card-media{aspect-ratio:16/9;background:var(--ct-border);overflow:hidden;flex-shrink:0}
.carma-card-media img{width:100%;height:100%;object-fit:cover}
.carma-card-body{padding:1.3rem 1.4rem 1.55rem;display:flex;flex-direction:column;gap:.65rem;flex:1}
/* Article — a centred prose column, media that "bleeds" out for breathing room. */
.carma-article{max-width:880px;margin:0 auto;padding:.5rem clamp(1rem,3vw,1.5rem) 0}
.carma-article-header{margin:0 0 3rem;max-inline-size:70ch;margin-inline:auto}
.carma-article-image-wrap{margin:0 0 2.25rem;border-radius:var(--ct-radius-lg);overflow:hidden;background:var(--ct-border);aspect-ratio:16/9}
.carma-article-image-wrap picture,.carma-article-image-wrap img{display:block;width:100%;height:100%;object-fit:cover}
.carma-article-image{display:block;width:100%;height:100%;object-fit:cover;margin:0;border-radius:0}
.carma-article-content{max-inline-size:70ch;margin-inline:auto}
.carma-article-content > *{max-inline-size:70ch;margin-inline:auto}
.carma-article-content picture,.carma-article-content img{display:block;margin:1.5rem 0;border-radius:var(--ct-radius);width:100%;height:auto}
.carma-article-content figure picture,.carma-article-content figure img{margin:0}
/* Media bleed: figures and galleries break out past the 70ch prose column. */
.carma-article-content figure.carma-figure,
.carma-article-content .carma-gallery,
.carma-article-content .carma-columns,
.carma-article-content > picture,
.carma-article-content > img{
  max-inline-size:none;
  width:100%;
  margin-inline:0;
}
@media (min-width:900px){
  .carma-article-content figure.carma-figure,
  .carma-article-content .carma-gallery{margin-inline:-2.5rem;width:calc(100% + 5rem)}
}
.carma-article-content .carma-gallery{position:relative;margin:1.6rem 0}
.carma-article-content .carma-gallery-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;border-radius:var(--ct-radius-lg);gap:0}
.carma-article-content .carma-slide{position:relative;flex:0 0 100%;scroll-snap-align:center;aspect-ratio:16/9}
.carma-article-content figure.carma-figure{margin:1.75rem 0}
.carma-article-content figure.carma-figure img{width:100%;border-radius:var(--ct-radius-lg);margin:0 0 .5rem}
.carma-article-content .carma-columns{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin:1.6rem 0}
.carma-article-content .carma-column{min-width:0}
.carma-article-content .carma-column>*:first-child{margin-top:0}
@media (max-width:640px){.carma-article-content .carma-columns{grid-template-columns:1fr}}
.carma-article-content .carma-embed{position:relative;width:100%;aspect-ratio:16/9;margin:1.85rem 0;border-radius:var(--ct-radius);overflow:hidden;background:var(--ct-surface)}
.carma-article-content .carma-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.carma-empty{text-align:center;padding:4.5rem 2rem;background:var(--ct-surface);border:2px dashed var(--ct-border);border-radius:var(--ct-radius-lg);max-width:560px;margin:0 auto}
${feedGridCss(t)}`
}

// ─── carma.type ──────────────────────────────────────────────────────────────
// Every piece of text, from the section title to a table cell. Magazine-grade:
// fluid clamp() sizes, one modular scale for the article's heading ladder.

function typeCss(t: DesignTokens): string {
  const center = t.sectionTitleAlign === 'center' ? 'margin-left:auto;margin-right:auto;' : ''
  const height = t.sectionTitleHeight ? `min-height:${t.sectionTitleHeight};display:flex;align-items:center;` : ''
  return `
.carma-breadcrumb{display:flex;gap:.5rem;align-items:center;font-size:.85rem;color:var(--ct-muted);margin:0 0 .6rem}
.carma-breadcrumb a{color:var(--ct-accent);text-decoration:none}
.carma-section-head.has-image .carma-breadcrumb{color:rgba(255,255,255,.85)}
.carma-section-head.has-image .carma-breadcrumb a{color:#fff}
/* Section heading — fully styleable from the Theme Studio. */
.carma-root .carma-section-head .carma-section-title{font-family:var(--ct-font-heading);font-size:${t.sectionTitleSize ?? '1.6rem'};font-weight:${t.sectionTitleWeight ?? '800'};color:${t.sectionTitleColor ?? 'var(--ct-text)'};text-align:${t.sectionTitleAlign ?? 'left'};max-width:${t.sectionTitleWidth ?? '100%'};${center}${height}margin-top:0;margin-bottom:0;line-height:1.2}
.carma-card-title{font-family:var(--ct-font-heading);font-size:1.25rem;font-weight:700;color:var(--ct-text);margin:0;line-height:1.3;letter-spacing:-0.01em;text-wrap:balance}
.carma-card-excerpt{color:var(--ct-muted);font-size:.9375rem;margin:0;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1}
.carma-meta{font-size:.8125rem;color:var(--ct-muted);font-weight:600;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;text-transform:uppercase;letter-spacing:.04em}
.carma-meta .carma-cat{color:var(--ct-accent)}
/* A commanding hero title: fluid 2.25rem → 3.75rem, tight leading, negative
   tracking, so it reads as a masthead rather than a big <p>. */
.carma-article-title{font-family:var(--ct-font-heading);font-size:clamp(2.25rem,1.5rem + 3.2vw,3.75rem);font-weight:800;margin:0 0 1.15rem;line-height:1.04;letter-spacing:-0.025em;color:var(--ct-text);text-wrap:balance}
.carma-article-lede{font-size:clamp(1.2rem,1.08rem + 0.55vw,1.4rem);line-height:1.55;color:var(--ct-muted);font-weight:400;text-wrap:pretty}
.carma-article-meta{font-size:.8125rem;color:var(--ct-muted);margin:0;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.carma-article-content{font-family:var(--ct-font-body);font-size:clamp(1.0625rem,1.03rem + 0.25vw,1.125rem);color:var(--ct-text);line-height:${clampLineHeight(t.bodyLineHeight, 1.75, 1.6, 1.9)}}
.carma-article-content p{margin:${t.paragraphSpacing ?? '1.5rem'} 0;text-wrap:pretty;hyphens:auto;-webkit-hyphens:auto}
.carma-article-content p:first-of-type{margin-top:0}
/* Heading ladder — one modular scale (≈1.25) against the 1.125rem body. */
.carma-article-content h2{font-family:var(--ct-font-heading);font-size:clamp(1.6rem,1.4rem + 0.85vw,2rem);font-weight:${t.headingWeight ?? '700'};margin:2.5rem 0 .9rem;line-height:${clampLineHeight(t.headingLineHeight, 1.25, 1.1, 1.45)};letter-spacing:-0.015em;color:var(--ct-text);text-wrap:balance}
.carma-article-content h3{font-family:var(--ct-font-heading);font-size:clamp(1.3rem,1.2rem + 0.5vw,1.5rem);font-weight:${t.headingWeight ?? '700'};margin:2rem 0 .65rem;line-height:${clampLineHeight(t.headingLineHeight, 1.3, 1.15, 1.45)};letter-spacing:-0.008em;color:var(--ct-text);text-wrap:balance}
.carma-article-content h4{font-family:var(--ct-font-heading);font-size:1.17rem;font-weight:700;margin:1.75rem 0 .5rem;line-height:1.35;color:var(--ct-text)}
.carma-article-content h5{font-family:var(--ct-font-heading);font-size:1.05rem;font-weight:700;margin:1.5rem 0 .4rem;line-height:1.4;color:var(--ct-text)}
.carma-article-content h6{font-family:var(--ct-font-heading);font-size:.8125rem;font-weight:800;margin:1.5rem 0 .4rem;line-height:1.4;color:var(--ct-muted);text-transform:uppercase;letter-spacing:.07em}
.carma-article-content a{color:${t.linkColor ?? 'var(--ct-accent)'};text-decoration:${t.linkUnderline === 'none' ? 'none' : 'underline'};text-decoration-thickness:1px;text-underline-offset:2px}
${t.linkUnderline === 'hover' ? '.carma-article-content a{text-decoration:none}' : ''}
.carma-article-content blockquote{border-left:3px solid ${t.blockquoteBorderColor ?? 'var(--ct-accent)'};margin:2rem 0;padding:.25rem 0 .25rem 1.5rem;color:var(--ct-text);font-style:${t.blockquoteStyle ?? 'italic'};font-size:1.1em;line-height:1.6}
.carma-article-content blockquote p{margin:.6em 0}
.carma-article-content ul,.carma-article-content ol{padding-left:1.5rem;margin:1.25rem 0;list-style:revert}
.carma-article-content li{margin:.4em 0}
.carma-article-content li p{margin:0}
.carma-article-content li::marker{color:var(--ct-accent)}
/* Editor/render parity: every block the editor (or a WordPress import) can
   produce must look deliberate here. */
.carma-article-content strong{font-weight:700}
.carma-article-content code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.875em;background:color-mix(in srgb,var(--ct-text) 7%,transparent);border-radius:5px;padding:.15em .4em}
.carma-article-content pre{background:var(--ct-text);color:var(--ct-bg);border-radius:var(--ct-radius-lg);padding:1.1rem 1.3rem;margin:1.75rem 0;overflow-x:auto;font-size:.875rem;line-height:1.65}
.carma-article-content pre code{background:none;padding:0;font-size:inherit;color:inherit}
.carma-article-content table{display:block;width:100%;max-width:100%;overflow-x:auto;border-collapse:collapse;margin:1.75rem 0;font-size:.95em;line-height:1.5}
.carma-article-content th{text-align:left;font-weight:700;font-size:.8125rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ct-muted);padding:.6rem .75rem;border-bottom:2px solid var(--ct-border)}
.carma-article-content td{padding:.65rem .75rem;border-bottom:1px solid var(--ct-border);vertical-align:top}
.carma-article-content tr:last-child td{border-bottom:none}
.carma-article-content figure.carma-figure figcaption{text-align:center;font-size:.85rem;color:var(--ct-muted);font-style:italic;margin-top:.65rem;line-height:1.5}
.carma-empty-title{font-size:1.3rem;font-weight:800;margin:0 0 .6rem;color:var(--ct-text)}
.carma-empty-desc{color:var(--ct-muted);margin:0;font-size:.95rem}`
}

// ─── carma.ornament ──────────────────────────────────────────────────────────
// Components with an identity of their own. They come AFTER `type` on purpose:
// several style their own links, and must beat the generic article-link rule.

// The brand's primary-button styling (detected in tokens.ts) applied to the
// article CTA, so a call-to-action on the blog looks like the source site's
// buttons. Falls back to the on-brand accent pill.
function buttonCss(t: DesignTokens): string {
  const bg = cssValueSafe(t.buttonBg, 'var(--ct-accent)')
  const color = cssValueSafe(t.buttonText, '#fff')
  const weight = cssValueSafe(t.buttonWeight, '700')
  const py = cssValueSafe(t.buttonPaddingY, '.7rem')
  const px = cssValueSafe(t.buttonPaddingX, '1.5rem')
  const radius = cssValueSafe(t.buttonRadius, 'var(--ct-radius)')
  const border = t.buttonBorder ? `border:${cssValueSafe(t.buttonBorder, 'none')};` : ''
  const shadow = t.buttonShadow ? `box-shadow:${cssValueSafe(t.buttonShadow, 'none')};` : ''
  const transform = t.buttonTextTransform ? `text-transform:${cssValueSafe(t.buttonTextTransform, 'none')};` : ''
  return `.carma-article-content a.carma-button{display:inline-block;background:${bg};color:${color};font-weight:${weight};padding:${py} ${px};border-radius:${radius};${border}${shadow}${transform}text-decoration:none;transition:opacity .2s ease,transform .2s ease}`
}

function ornamentCss(t: DesignTokens): string {
  return `
/* These two open the layer on purpose. At (0,2,1) each beats every (0,2,0)
   component below it — as it always did — while the CTA button and the TOC links,
   declared later at the same specificity, still beat them. Moved to a later layer
   they would win everywhere; moved earlier they would lose everywhere. */
.carma-root a:focus-visible{outline:2px solid var(--ct-accent);outline-offset:3px;border-radius:2px}
${t.linkUnderline === 'hover' ? '.carma-article-content a:hover{text-decoration:underline}' : ''}
.carma-langbar .carma-lang{display:inline-flex;align-items:center;gap:.3rem;padding:.4rem .75rem;border:1px solid var(--ct-border);border-radius:9999px;font-size:.78rem;font-weight:700;color:var(--ct-muted);text-decoration:none;background:var(--ct-surface);line-height:1}
.carma-langbar .carma-lang.is-active{background:var(--ct-accent);border-color:var(--ct-accent);color:#fff}
.carma-card-demo{position:absolute;top:.7rem;left:.7rem;z-index:3;display:inline-flex;align-items:center;background:rgba(17,24,39,.9);color:#fff;font-size:.62rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;padding:.3rem .6rem;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.28);pointer-events:none}
/* Preview-only "these are sample articles" banner — on-brand, never a warning box,
   shown only when the whole feed is demo content. */
.carma-demo-banner{display:flex;align-items:center;gap:.85rem;margin:0 0 1.6rem;padding:.85rem 1.1rem;border:1px solid color-mix(in srgb,var(--ct-accent) 32%,transparent);background:color-mix(in srgb,var(--ct-accent) 8%,var(--ct-surface));border-radius:var(--ct-radius-lg)}
.carma-demo-banner-chip{display:inline-flex;align-items:center;gap:.35rem;flex-shrink:0;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ct-accent);background:color-mix(in srgb,var(--ct-accent) 16%,transparent);padding:.3rem .6rem;border-radius:999px;line-height:1}
.carma-demo-banner-text{min-width:0}
.carma-demo-banner-title{font-family:var(--ct-font-heading);font-weight:800;font-size:.95rem;color:var(--ct-text);margin:0;line-height:1.3}
.carma-demo-banner-desc{color:var(--ct-muted);font-size:.85rem;line-height:1.5}
@media (max-width:560px){.carma-demo-banner{align-items:flex-start;flex-direction:column;gap:.55rem}}
.carma-back{display:inline-flex;align-items:center;gap:.5rem;color:var(--ct-text);font-weight:700;font-size:.95rem;margin-bottom:2.5rem;padding:.6rem 1.15rem;border:1px solid var(--ct-border);border-radius:9999px;text-decoration:none;line-height:1}
.carma-article-content hr{border:none;border-top:2px solid var(--ct-border);width:88px;margin:2.75rem auto}
.carma-article-content .carma-callout{position:relative;margin:1.5rem 0;padding:1.1rem 1.25rem 1.1rem 3.1rem;border-radius:var(--ct-radius-lg);border:1px solid;font-size:1rem;line-height:1.65}
.carma-article-content .carma-callout>*:first-child{margin-top:0}
.carma-article-content .carma-callout>*:last-child{margin-bottom:0}
.carma-article-content .carma-callout::before{position:absolute;left:1.05rem;top:1rem;font-size:1.15rem}
.carma-article-content .carma-callout[data-variant="info"]{background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a}
.carma-article-content .carma-callout[data-variant="info"]::before{content:"💡"}
.carma-article-content .carma-callout[data-variant="success"]{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
.carma-article-content .carma-callout[data-variant="success"]::before{content:"✅"}
.carma-article-content .carma-callout[data-variant="warning"]{background:#fffbeb;border-color:#fde68a;color:#92400e}
.carma-article-content .carma-callout[data-variant="warning"]::before{content:"⚠️"}
.carma-article-content .carma-callout[data-variant="danger"]{background:#fef2f2;border-color:#fecaca;color:#991b1b}
.carma-article-content .carma-callout[data-variant="danger"]::before{content:"🚫"}
.carma-article-content .carma-gallery-item{display:block;width:100%;height:100%;text-decoration:none;cursor:zoom-in;background:var(--ct-border);border-radius:var(--ct-radius-lg);overflow:hidden}
.carma-article-content .carma-gallery-item img{width:100%;height:100%;object-fit:cover;margin:0}
.carma-article-content .carma-slide-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:2;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:9999px;background:rgba(255,255,255,.9);color:#1c1917;text-decoration:none;font-size:26px;line-height:1;box-shadow:0 4px 14px -4px rgba(0,0,0,.4)}
.carma-article-content .carma-slide-arrow.prev{left:14px}
.carma-article-content .carma-slide-arrow.next{right:14px}
.carma-article-content .carma-lightbox{display:none}
.carma-article-content .carma-lightbox:target{display:flex;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(0,0,0,.88)}
.carma-article-content .carma-lightbox-backdrop{position:absolute;inset:0}
.carma-article-content .carma-lightbox-img{max-width:88vw;max-height:85vh;object-fit:contain;border-radius:8px;position:relative;z-index:1;margin:0}
.carma-article-content .carma-lightbox-nav,.carma-article-content .carma-lightbox-close{position:absolute;z-index:2;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:rgba(255,255,255,.16);color:#fff;text-decoration:none;line-height:1}
.carma-article-content .carma-lightbox-nav{top:50%;transform:translateY(-50%);width:48px;height:48px;font-size:30px}
.carma-article-content .carma-lightbox-nav.prev{left:16px}
.carma-article-content .carma-lightbox-nav.next{right:16px}
.carma-article-content .carma-lightbox-close{top:16px;right:16px;width:40px;height:40px;font-size:24px}
.carma-article-content details.carma-toggle{border:1px solid var(--ct-border);border-radius:var(--ct-radius);padding:.5rem 1.2rem;margin:1.5rem 0;background:var(--ct-surface)}
.carma-article-content details.carma-toggle>summary{cursor:pointer;font-weight:700;list-style:none;padding:.5rem 0;color:var(--ct-text)}
.carma-article-content details.carma-toggle>summary::-webkit-details-marker{display:none}
.carma-article-content details.carma-toggle>summary::before{content:'▸';display:inline-block;margin-right:.5rem;color:var(--ct-muted)}
.carma-article-content .carma-toc{display:block;border:1px solid var(--ct-border);border-left:3px solid var(--ct-accent);border-radius:var(--ct-radius);padding:1rem 1.25rem;margin:1.75rem 0;background:var(--ct-surface)}
.carma-article-content .carma-toc-title{font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--ct-muted);margin:0 0 .5rem}
.carma-article-content .carma-toc ol{list-style:none;margin:0;padding:0}
.carma-article-content .carma-toc li{margin:.25rem 0}
.carma-article-content .carma-toc li.lvl-2{padding-left:.85rem}
.carma-article-content .carma-toc li.lvl-3{padding-left:1.7rem;font-size:.95em}
.carma-article-content .carma-toc a{color:var(--ct-text);text-decoration:none}
.carma-article-content .carma-button-wrap{margin:1.6rem 0}
.carma-article-content .carma-button-wrap[data-align=center]{text-align:center}
.carma-article-content .carma-button-wrap[data-align=right]{text-align:right}
.carma-article-content a.carma-button{display:inline-block;background:var(--ct-accent);color:#fff;font-weight:700;padding:.7rem 1.5rem;border-radius:var(--ct-radius);text-decoration:none;transition:opacity .2s ease}
${buttonCss(t)}`
}

// ─── carma.motion ────────────────────────────────────────────────────────────
// Everything that moves or answers the pointer: transitions, hover, disclosure.
// One layer, so a reduced-motion policy — if one is ever wanted — has exactly one
// place to live. (Nothing here changes under reduced motion today; this surgery
// moved no pixel, and that would have moved several.)

const MOTION_CSS = `
.carma-card{transition:transform .25s cubic-bezier(.2,.6,.3,1),box-shadow .25s cubic-bezier(.2,.6,.3,1)}
.carma-card:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(0,0,0,.04),0 20px 44px -16px rgba(0,0,0,.18)}
.carma-card-media img{transition:transform .45s cubic-bezier(.2,.6,.3,1)}
.carma-card:hover .carma-card-media img{transform:scale(1.04)}
.carma-card-link:hover .carma-card-title{color:var(--ct-accent)}
.carma-langbar .carma-lang{transition:color .15s ease,border-color .15s ease,background .15s ease}
.carma-langbar .carma-lang:hover{color:var(--ct-text);border-color:var(--ct-accent)}
.carma-back{transition:color .15s ease,border-color .15s ease,background .15s ease}
.carma-back:hover{color:var(--ct-accent);border-color:var(--ct-accent)}
.carma-article-content .carma-slide-arrow:hover{background:#fff}
.carma-article-content .carma-lightbox-nav:hover,.carma-article-content .carma-lightbox-close:hover{background:rgba(255,255,255,.32)}
.carma-article-content details.carma-toggle>summary::before{transition:transform .2s ease}
.carma-article-content details.carma-toggle[open]>summary::before{transform:rotate(90deg)}
.carma-article-content .carma-toc a:hover{color:var(--ct-accent);text-decoration:underline}
.carma-article-content a.carma-button:hover{opacity:.9;transform:translateY(-1px)}`

// ─── The captured card (closes carma.ornament) ───────────────────────────────

/**
 * Native card replication: when the Theme Grabber detected the client's own blog
 * and extracted its card style, the feed mirrors it — columns, gap, frame, image
 * aspect, title type. Values come from the client's CSS; structural characters are
 * still stripped defensively (the sheet is also </style>-guarded by the host).
 */
function nativeCardCss(card: CardStyle | null | undefined): string {
  if (!card) return ''
  const safe = (v: string): string => v.replace(/[{}<>;]/g, '').trim()
  const rules: string[] = []

  if (card.gap) rules.push(`.carma-grid{gap:${safe(card.gap)}}`)
  if (card.columns) {
    rules.push(`@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(${Math.round(card.columns)},minmax(0,1fr))}}`)
  }

  const box: string[] = []
  if (card.radius) box.push(`border-radius:${safe(card.radius)}`)
  if (card.border) box.push(`border:${safe(card.border)}`)
  if (card.shadow) box.push(`box-shadow:${safe(card.shadow)}`)
  if (card.background) box.push(`background:${safe(card.background)}`)
  if (box.length) rules.push(`.carma-card{${box.join(';')}}`)

  if (card.imageAspect) rules.push(`.carma-card-media{aspect-ratio:${safe(card.imageAspect)}}`)

  const title: string[] = []
  if (card.titleSize) title.push(`font-size:${safe(card.titleSize)}`)
  if (card.titleWeight) title.push(`font-weight:${safe(card.titleWeight)}`)
  if (card.titleColor) title.push(`color:${safe(card.titleColor)}`)
  if (title.length) rules.push(`.carma-card-title{${title.join(';')}}`)

  return rules.length ? `/* Native card replication — captured from the source blog */\n${rules.join('\n')}` : ''
}

/**
 * The whole shadow stylesheet.
 *
 * `card` is the captured native card. It is NOT an override: it is the template's
 * own card, tuned to the source blog — so it closes `ornament`. From there it beats
 * the card's base frame and type (earlier layers), while our hover affordances in
 * `motion` still beat it, exactly as they did on specificity before layers.
 *
 * `overrides` is everything that is a DECISION layered over the template, already
 * in precedence order — the feed layout, then the genome, then the modules. They
 * share the last layer and settle ties by that order.
 */
export function buildBlogCss(
  t: DesignTokens,
  opts: { host: HostContext; card?: CardStyle | null; overrides?: string },
): string {
  const card = nativeCardCss(opts.card)
  return [
    LAYER_ORDER,
    layer('reset', RESET_CSS),
    layer('tokens', tokensCss(t, opts.host)),
    layer('structure', structureCss(t)),
    layer('type', typeCss(t)),
    layer('ornament', card ? `${ornamentCss(t)}\n${card}` : ornamentCss(t)),
    layer('motion', MOTION_CSS),
    layer('overrides', opts.overrides ?? ''),
  ].join('\n')
}
