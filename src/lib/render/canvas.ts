// W7 — THE WRITING CANVAS: the published article's stylesheet, in an iframe.
//
// The editor does not imitate the blog; it renders it. `articleCanvasParts`
// (theme.ts) returns EXACTLY the stylesheet a post's shadow root receives on the
// published page — same tokens, same Genome CSS, same modules CSS, same
// `buildBlogCss` call — and this file adapts it to the one thing that differs:
// the canvas is a document, not a shadow root.
//
//   · `:host` → `body`. On the published page `:host` is the blog's host element:
//     it paints the ground and starts the inheritance of the body face, size,
//     colour and leading. In the canvas that element is <body>. NOT <html>: the
//     stylesheet sizes with rem, and putting the blog's font size on the root
//     would rescale every rem in it.
//   · one more layer, `carma.editor`, AFTER everything the reader gets, holding
//     only what editing needs: the caret, the selection, placeholders (body,
//     title, lede), node outlines, the cover's controls, focus mode, and
//     ProseMirror's own required base CSS (TipTap
//     injects that into the PARENT document's head, which the iframe cannot see).
//     `test:editor-fidelity` proves this layer never changes a reader-visible
//     property of the content.
//
// Deliberately NOT carried over from TipTap's base CSS:
//   · the ligature switch-off. ProseMirror recommends it for caret placement inside
//     ligatures; the reader sees the ligatures, so the writer does too (the W7.0
//     spike checked the caret);
//   · `pre{white-space:pre-wrap}`. On the blog a long code line scrolls; forcing it
//     to wrap made the phone canvas's code block 23px taller than the reader's
//     (caught by test:editor-fidelity). The UA's `pre` preserves whitespace too;
//   · `white-space:break-spaces`. It gives a space at the end of a line WIDTH, so a
//     word that fits on the reader's line wrapped on the writer's (a Sonnet genome
//     at 390px, caught by the gate). `pre-wrap` lets that space hang, as `normal`
//     does; the only cost is a caret after a line-final space drawn at the line end;
//   · `word-wrap:break-word` — AND the browsers' own editing defaults, which both
//     Chrome's and WebKit's UA sheets put on every contenteditable:
//     `overflow-wrap: break-word`, `line-break: after-white-space` (and WebKit's
//     `-webkit-nbsp-mode: space`). Each moves where a tight line breaks: the lede,
//     the first paragraph and a list item broke at a different word than the
//     reader's (caught by test:editor-pixels — every box still matched). The
//     editable elements `inherit` these from the page instead: the reader's values.

import { articleCanvasParts } from '@/lib/render/theme'
import type { Locale } from '@/lib/i18n/config'

export type CanvasSpec = {
  /** The canvas document's whole stylesheet: the article's, then `carma.editor`. */
  css: string
  /** The article page's own font links (trusted, server-built markup). */
  headHtml: string
  /** The edited locale — the Genome's title case applies under `:lang(en)` only. */
  lang: string
}

export const CANVAS_EDITOR_LAYER = `@layer carma.editor{
html{background:var(--ct-bg)}
html,body{margin:0}
body{padding-bottom:240px}
.carma-article-content.ProseMirror{outline:none;caret-color:var(--ct-accent);position:relative;white-space:pre-wrap}
[contenteditable]{overflow-wrap:inherit;line-break:inherit;-webkit-line-break:inherit;-webkit-nbsp-mode:inherit}
.ProseMirror [contenteditable="false"]{white-space:normal}
.ProseMirror [contenteditable="false"] [contenteditable="true"]{white-space:pre-wrap}
.ProseMirror ::selection{background:color-mix(in srgb,var(--ct-accent) 28%,transparent)}
.ProseMirror .is-empty::before{content:attr(data-placeholder);color:var(--ct-muted);float:left;height:0;pointer-events:none}
.ProseMirror-selectednode{outline:2px solid var(--ct-accent);outline-offset:2px}
.ProseMirror-hideselection *::selection{background:transparent}
.ProseMirror-hideselection{caret-color:transparent}
.ProseMirror-gapcursor{display:none;pointer-events:none;position:absolute}
.ProseMirror-gapcursor:after{content:"";display:block;position:absolute;top:-2px;width:20px;border-top:1px solid var(--ct-text);animation:carma-gapcursor 1.1s steps(2,start) infinite}
@keyframes carma-gapcursor{to{visibility:hidden}}
.ProseMirror-focused .ProseMirror-gapcursor{display:block}
img.ProseMirror-separator{display:inline!important;border:none!important;margin:0!important}
.carma-article-title[contenteditable],.carma-article-lede[contenteditable]{outline:none;caret-color:var(--ct-accent)}
.carma-article-title[data-empty],.carma-article-lede[data-empty]{position:relative;min-height:1lh}
.carma-article-title[data-empty]::before,.carma-article-lede[data-empty]::before{content:attr(data-placeholder);position:absolute;inset-inline:0;color:var(--ct-muted);opacity:.6;pointer-events:none}
.carma-article-header:not(:hover):not(:focus-within) .carma-article-lede[data-empty]{display:none}
.carma-article-image-wrap{position:relative}
.carma-cover-tools{transition:opacity .15s ease}
.carma-article-image-wrap:not(:hover):not(:focus-within)>.carma-cover-tools{opacity:0}
.ProseMirror a.carma-button{cursor:text}
.ProseMirror .carma-embed>.carma-embed-shield{position:absolute;inset:0;z-index:1;cursor:pointer}
.ProseMirror nav.carma-toc:empty::before{content:"Índex — s’omplirà amb els encapçalaments de l’article";color:var(--ct-muted);font-size:.9rem}
.ProseMirror .carma-gallery[data-count="0"]::before{content:"Galeria buida — selecciona-la per afegir-hi imatges";display:block;padding:1.5rem;border:1px dashed var(--ct-border);border-radius:var(--ct-radius-lg);color:var(--ct-muted);font-size:.9rem;text-align:center}
.ProseMirror figure.carma-figure>figcaption:has(>br.ProseMirror-trailingBreak:only-child){position:relative}
.ProseMirror figure.carma-figure>figcaption:has(>br.ProseMirror-trailingBreak:only-child)::before{content:"Afegeix un peu de foto…";position:absolute;inset-inline:0;opacity:.6;pointer-events:none}
.carma-focus-mode .carma-article-content>*{opacity:.3;transition:opacity .25s ease}
.carma-focus-mode .carma-article-content>.carma-focused{opacity:1}
#carma-ui{position:absolute;top:0;left:0;width:100%;height:0;z-index:50}
}`

/** The shadow stylesheet, re-homed onto a document (see the header). */
export function canvasCss(shadowCss: string): string {
  return `${shadowCss.replace(/:host\b(?!\()/g, 'body')}\n${CANVAS_EDITOR_LAYER}`
}

/** A new article's canvas is built before the post exists: nothing but the design. */
export const BLANK_POST = {
  id: 'new', title: '', slug: '', content: { html: '' }, excerpt: null, featured_image: null,
  categories: [], tags: [], author_name: null, created_at: '1970-01-01T00:00:00.000Z', is_published: false,
} satisfies Parameters<typeof articleCanvasParts>[2]

/** Everything the client canvas needs to become this post's article page. */
export function buildCanvasSpec(
  theme: Parameters<typeof articleCanvasParts>[0],
  siteId: string,
  post: Parameters<typeof articleCanvasParts>[2],
  locale: Locale,
): CanvasSpec {
  const { shadowCss, fontLinksHtml } = articleCanvasParts(theme, siteId, post, locale)
  // A literal </style> inside a Genome string would end the canvas's <style> early.
  return { css: canvasCss(shadowCss).replace(/<\/(style)/gi, '<\\/$1'), headHtml: fontLinksHtml, lang: locale }
}
