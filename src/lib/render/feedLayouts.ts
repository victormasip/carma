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
// It is emitted with `!important`, AFTER the base feed CSS and the native-card
// replication, so an explicit user choice always wins.
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
.carma-grid{display:flex!important;flex-direction:column!important;gap:0!important;width:100%!important;max-width:980px!important;margin-left:auto!important;margin-right:auto!important}
.carma-card{background:transparent!important;border:0!important;border-top:1px solid var(--ct-border)!important;border-radius:0!important;box-shadow:none!important;padding:2.25rem 0!important}
.carma-card:first-child{border-top:0!important;padding-top:.5rem!important}
.carma-card:hover{transform:none!important;box-shadow:none!important}
.carma-card-link{flex-direction:row!important;align-items:center!important;gap:2rem!important}
.carma-card-media{aspect-ratio:4/3!important;width:42%!important;max-width:380px!important;border-radius:var(--ct-radius-lg)!important;overflow:hidden!important;order:2!important}
.carma-card-body{padding:0!important;gap:.85rem!important;order:1!important}
.carma-card-title{font-size:1.65rem!important;line-height:1.18!important}
.carma-card-excerpt{font-size:1rem!important;-webkit-line-clamp:3!important}
@media (max-width:680px){
  .carma-card-link{flex-direction:column!important;align-items:stretch!important;gap:1rem!important}
  .carma-card-media{width:100%!important;max-width:none!important;aspect-ratio:16/9!important;order:1!important}
  .carma-card-body{order:2!important}
  .carma-card-title{font-size:1.35rem!important}
}`.trim()

// ── 2. Magazine — dense 3-col grid, tight gap, crisp small frame, 16/9 ─────────
const magazine = `
.carma-grid{display:grid!important;grid-template-columns:1fr!important;gap:1.25rem!important;width:100%!important}
@media (min-width:640px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
.carma-card{border-radius:calc(var(--ct-radius) * .6)!important;border:1px solid var(--ct-border)!important;box-shadow:none!important}
.carma-card:hover{transform:translateY(-2px)!important;box-shadow:0 10px 24px -16px rgba(0,0,0,.35)!important}
.carma-card-media{aspect-ratio:16/9!important}
.carma-card-body{padding:1rem 1.05rem 1.2rem!important;gap:.5rem!important}
.carma-card-title{font-size:1.08rem!important;line-height:1.28!important}
.carma-card-excerpt{font-size:.88rem!important;-webkit-line-clamp:2!important}`.trim()

// ── 3. Minimal — borderless list, lots of whitespace, small square thumb ───────
const minimal = `
.carma-grid{display:flex!important;flex-direction:column!important;gap:0!important;width:100%!important;max-width:760px!important;margin-left:auto!important;margin-right:auto!important}
.carma-card{background:transparent!important;border:0!important;border-bottom:1px solid var(--ct-border)!important;border-radius:0!important;box-shadow:none!important;padding:1.75rem 0!important}
.carma-card:hover{transform:none!important;box-shadow:none!important}
.carma-card-link{flex-direction:row!important;align-items:center!important;gap:1.5rem!important}
.carma-card-media{aspect-ratio:1/1!important;width:88px!important;flex:0 0 88px!important;border-radius:var(--ct-radius)!important;overflow:hidden!important;order:2!important}
.carma-card-body{padding:0!important;gap:.4rem!important;order:1!important}
.carma-card-title{font-size:1.2rem!important;line-height:1.3!important}
.carma-card-excerpt{font-size:.92rem!important;-webkit-line-clamp:1!important}
@media (max-width:560px){.carma-card-media{width:64px!important;flex-basis:64px!important}}`.trim()

// ── 4. Grid XL — 2 big cards per row, large radius, prominent shadow, 3/2 ───────
const gridxl = `
.carma-grid{display:grid!important;grid-template-columns:1fr!important;gap:2.25rem!important;width:100%!important;max-width:1240px!important;margin-left:auto!important;margin-right:auto!important}
@media (min-width:820px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
.carma-card{border-radius:calc(var(--ct-radius-lg) * 1.25)!important;box-shadow:0 18px 48px -28px rgba(0,0,0,.4)!important}
.carma-card:hover{transform:translateY(-6px)!important;box-shadow:0 32px 70px -30px rgba(0,0,0,.5)!important}
.carma-card-media{aspect-ratio:3/2!important}
.carma-card-body{padding:1.75rem 1.85rem 2rem!important;gap:.85rem!important}
.carma-card-title{font-size:1.6rem!important;line-height:1.2!important}
.carma-card-excerpt{font-size:1rem!important;-webkit-line-clamp:3!important}`.trim()

// ── 5. Overlay — text sits on the image behind a scrim, portrait 4/5, 3-col ─────
//  The scrim + light text are intrinsic to the overlay look (legibility over any
//  photo), so they're set here — the only place a preset touches colour. Cards
//  WITHOUT an image keep the inherited brand colours (scoped via :has()).
const overlay = `
.carma-grid{display:grid!important;grid-template-columns:1fr!important;gap:1.5rem!important;width:100%!important}
@media (min-width:600px){.carma-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media (min-width:1024px){.carma-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
.carma-card:has(.carma-card-media){position:relative!important;aspect-ratio:4/5!important;border:0!important;box-shadow:0 12px 30px -20px rgba(0,0,0,.5)!important}
.carma-card:has(.carma-card-media) .carma-card-link{position:relative!important;display:block!important;height:100%!important}
.carma-card:has(.carma-card-media) .carma-card-media{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;aspect-ratio:auto!important}
.carma-card:has(.carma-card-media) .carma-card-media::after{content:''!important;position:absolute!important;inset:0!important;background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.35) 42%,rgba(0,0,0,0) 70%)!important}
.carma-card:has(.carma-card-media) .carma-card-body{position:absolute!important;inset:auto 0 0 0!important;z-index:1!important;padding:1.25rem 1.3rem 1.4rem!important;gap:.5rem!important}
.carma-card:has(.carma-card-media) .carma-card-title{color:#fff!important;font-size:1.25rem!important;line-height:1.22!important}
.carma-card:has(.carma-card-media) .carma-card-excerpt{color:rgba(255,255,255,.85)!important;-webkit-line-clamp:2!important}
.carma-card:has(.carma-card-media) .carma-meta{color:rgba(255,255,255,.85)!important}
.carma-card:has(.carma-card-media):hover{transform:translateY(-4px)!important}`.trim()

// ── 6. Compact — 4 dense cards per row, tiny gap/frame, small type ─────────────
const compact = `
.carma-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:.9rem!important;width:100%!important}
@media (min-width:760px){.carma-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media (min-width:1100px){.carma-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
.carma-card{border-radius:calc(var(--ct-radius) * .7)!important;box-shadow:none!important;border:1px solid var(--ct-border)!important}
.carma-card:hover{transform:translateY(-2px)!important;box-shadow:0 8px 18px -14px rgba(0,0,0,.3)!important}
.carma-card-media{aspect-ratio:16/9!important}
.carma-card-body{padding:.8rem .85rem .9rem!important;gap:.35rem!important}
.carma-card-title{font-size:.95rem!important;line-height:1.25!important}
.carma-card-excerpt{font-size:.8rem!important;-webkit-line-clamp:2!important}
.carma-meta{font-size:.68rem!important}`.trim()

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
