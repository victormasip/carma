// Structural feed-layout presets (Phase 3).
//
// These are the "choose your blog layout" options offered after the clone/import.
// Each preset changes ONLY the structure of the article feed — grid template,
// spacing, the card frame (border/radius/padding/shadow), and the image aspect
// ratio. It NEVER sets a colour or a font-family: those always come from the
// cloned brand via the `--ct-*` custom properties the render already defines.
// So a layout can be applied over any captured palette/typography without
// overwriting the client's brand.
//
// The CSS targets the same feed markup the render emits (see buildCard in
// theme.ts): `.carma-grid > .carma-card > .carma-card-link > {.carma-card-media,
// .carma-card-body > {.carma-meta, .carma-card-title, .carma-card-excerpt}}`.
// It is emitted into the `carma.overrides` cascade layer (see blogCss.ts), AFTER
// the base feed CSS and the captured native card, so an explicit user choice always
// wins — by layer order, not by importance. Inside the blog's shadow root nothing
// else competes, so the 62 `!important`s these presets used to carry were inert.
//
// This module is client-safe (only a type-only import) so the onboarding picker
// and the server renderer share one catalogue.

import type { FeedLayout } from '@/lib/scrape/tokens'

export type FeedLayoutDef = {
  id: FeedLayout
  name: string
  tagline: string
  /** Tiny abstract glyph for the card (drawn with divs), describing the shape. */
  preview: 'editorial' | 'magazine' | 'minimal' | 'gridxl' | 'overlay' | 'compact'
  /** Structural CSS — grid/spacing/frame/aspect only, referencing --ct-* vars. */
  css: string
}

// ── 1. Editorial — full-width horizontal rows, airy, divider lines, no shadow ──
const editorial = `
.carma-grid{display:flex;flex-direction:column;gap:0;width:100%;max-width:980px;margin-left:auto;margin-right:auto}
.carma-card{background:transparent;border:0;border-top:1px solid var(--ct-border);border-radius:0;box-shadow:none;padding:2.25rem 0}
.carma-card:first-child{border-top:0;padding-top:.5rem}
.carma-card:hover{transform:none;box-shadow:none}
.carma-card-link{flex-direction:row;align-items:center;gap:2rem}
.carma-card-media{aspect-ratio:4/3;width:42%;max-width:380px;border-radius:var(--ct-radius-lg);overflow:hidden;order:2}
.carma-card-body{padding:0;gap:.85rem;order:1}
.carma-card-title{font-size:1.65rem;line-height:1.18}
.carma-card-excerpt{font-size:1rem;-webkit-line-clamp:3}
@media (max-width:680px){
  .carma-card-link{flex-direction:column;align-items:stretch;gap:1rem}
  .carma-card-media{width:100%;max-width:none;aspect-ratio:16/9;order:1}
  .carma-card-body{order:2}
  .carma-card-title{font-size:1.35rem}
}`.trim()

// ── 2. Magazine — dense 3-col grid, tight gap, crisp small frame, 16/9 ─────────
const magazine = `
.carma-grid{display:grid;grid-template-columns:1fr;gap:1.25rem;width:100%}
@media (min-width:640px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.carma-card{border-radius:calc(var(--ct-radius) * .6);border:1px solid var(--ct-border);box-shadow:none}
.carma-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px -16px rgba(0,0,0,.35)}
.carma-card-media{aspect-ratio:16/9}
.carma-card-body{padding:1rem 1.05rem 1.2rem;gap:.5rem}
.carma-card-title{font-size:1.08rem;line-height:1.28}
.carma-card-excerpt{font-size:.88rem;-webkit-line-clamp:2}`.trim()

// ── 3. Minimal — borderless list, lots of whitespace, small square thumb ───────
const minimal = `
.carma-grid{display:flex;flex-direction:column;gap:0;width:100%;max-width:760px;margin-left:auto;margin-right:auto}
.carma-card{background:transparent;border:0;border-bottom:1px solid var(--ct-border);border-radius:0;box-shadow:none;padding:1.75rem 0}
.carma-card:hover{transform:none;box-shadow:none}
.carma-card-link{flex-direction:row;align-items:center;gap:1.5rem}
.carma-card-media{aspect-ratio:1/1;width:88px;flex:0 0 88px;border-radius:var(--ct-radius);overflow:hidden;order:2}
.carma-card-body{padding:0;gap:.4rem;order:1}
.carma-card-title{font-size:1.2rem;line-height:1.3}
.carma-card-excerpt{font-size:.92rem;-webkit-line-clamp:1}
@media (max-width:560px){.carma-card-media{width:64px;flex-basis:64px}}`.trim()

// ── 4. Grid XL — 2 big cards per row, large radius, prominent shadow, 3/2 ───────
const gridxl = `
.carma-grid{display:grid;grid-template-columns:1fr;gap:2.25rem;width:100%;max-width:1240px;margin-left:auto;margin-right:auto}
@media (min-width:820px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.carma-card{border-radius:calc(var(--ct-radius-lg) * 1.25);box-shadow:0 18px 48px -28px rgba(0,0,0,.4)}
.carma-card:hover{transform:translateY(-6px);box-shadow:0 32px 70px -30px rgba(0,0,0,.5)}
.carma-card-media{aspect-ratio:3/2}
.carma-card-body{padding:1.75rem 1.85rem 2rem;gap:.85rem}
.carma-card-title{font-size:1.6rem;line-height:1.2}
.carma-card-excerpt{font-size:1rem;-webkit-line-clamp:3}`.trim()

// ── 5. Overlay — text sits on the image behind a scrim, portrait 4/5, 3-col ─────
//  The scrim + light text are intrinsic to the overlay look (legibility over any
//  photo), so they're set here — the only place a preset touches colour. Cards
//  WITHOUT an image keep the inherited brand colours (scoped via :has()).
const overlay = `
.carma-grid{display:grid;grid-template-columns:1fr;gap:1.5rem;width:100%}
@media (min-width:600px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.carma-card:has(.carma-card-media){position:relative;aspect-ratio:4/5;border:0;box-shadow:0 12px 30px -20px rgba(0,0,0,.5)}
.carma-card:has(.carma-card-media) .carma-card-link{position:relative;display:block;height:100%}
.carma-card:has(.carma-card-media) .carma-card-media{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto}
.carma-card:has(.carma-card-media) .carma-card-media::after{content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.35) 42%,rgba(0,0,0,0) 70%)}
.carma-card:has(.carma-card-media) .carma-card-body{position:absolute;inset:auto 0 0 0;z-index:1;padding:1.25rem 1.3rem 1.4rem;gap:.5rem}
.carma-card:has(.carma-card-media) .carma-card-title{color:#fff;font-size:1.25rem;line-height:1.22}
.carma-card:has(.carma-card-media) .carma-card-excerpt{color:rgba(255,255,255,.85);-webkit-line-clamp:2}
.carma-card:has(.carma-card-media) .carma-meta{color:rgba(255,255,255,.85)}
.carma-card:has(.carma-card-media):hover{transform:translateY(-4px)}`.trim()

// ── 6. Compact — 4 dense cards per row, tiny gap/frame, small type ─────────────
const compact = `
.carma-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem;width:100%}
@media (min-width:760px){.carma-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:1100px){.carma-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.carma-card{border-radius:calc(var(--ct-radius) * .7);box-shadow:none;border:1px solid var(--ct-border)}
.carma-card:hover{transform:translateY(-2px);box-shadow:0 8px 18px -14px rgba(0,0,0,.3)}
.carma-card-media{aspect-ratio:16/9}
.carma-card-body{padding:.8rem .85rem .9rem;gap:.35rem}
.carma-card-title{font-size:.95rem;line-height:1.25}
.carma-card-excerpt{font-size:.8rem;-webkit-line-clamp:2}
.carma-meta{font-size:.68rem}`.trim()

export const FEED_LAYOUTS: readonly FeedLayoutDef[] = [
  { id: 'editorial', name: 'Editorial', tagline: 'Files amples i airejades amb línies separadores. Elegant i de lectura pausada.', preview: 'editorial', css: editorial },
  { id: 'magazine',  name: 'Magazine',  tagline: 'Graella densa de 3 columnes amb targetes nítides. Dinàmic i ple de contingut.', preview: 'magazine', css: magazine },
  { id: 'minimal',   name: 'Minimal',   tagline: 'Llista neta sense marcs, amb miniatura petita i molt aire. Sobri i directe.', preview: 'minimal', css: minimal },
  { id: 'gridxl',    name: 'Grid XL',   tagline: 'Dues targetes grans per fila amb imatges generoses i ombra profunda. Impactant.', preview: 'gridxl', css: gridxl },
  { id: 'overlay',   name: 'Overlay',   tagline: 'El text se superposa sobre la imatge amb un degradat. Cinematogràfic i modern.', preview: 'overlay', css: overlay },
  { id: 'compact',   name: 'Compacte',  tagline: 'Quatre targetes per fila, compactes i ràpides d’escanejar. Ideal per a molts articles.', preview: 'compact', css: compact },
]

export function getFeedLayout(id: string | null | undefined): FeedLayoutDef | undefined {
  return FEED_LAYOUTS.find(l => l.id === id)
}

/** Structural CSS for the active feed layout ('' for standard/unknown). */
export function feedLayoutCss(id: FeedLayout | null | undefined): string {
  if (!id || id === 'standard') return ''
  return getFeedLayout(id)?.css ?? ''
}
