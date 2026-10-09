// W5 — DOOR A: the shapes that cross the wire between the reveal and the server.
//
// Types and one tiny constant, nothing else: this file is imported by the landing's
// client island, and the design engine behind it (evidence, director, compiler,
// the model) must never follow it into a visitor's bundle. See reveal.ts.

import type { Genome, Ground, Register } from '@/lib/design/genome'

export type RevealVariantName = 'faithful' | 'elevated' | 'reimagined'

/** The order the tabs are drawn in — least to most change. */
export const REVEAL_ORDER: readonly RevealVariantName[] = ['faithful', 'elevated', 'reimagined']

export type RevealVariant = {
  variant: RevealVariantName
  /**
   * A content hash of the genome (`g_` + 16 hex). Stable and derivable: the same
   * genome always has the same id — the `genome_id` of the `site_design_genomes`
   * row it becomes once an owner adopts it (W6), and the stamp on their tokens.
   */
  id: string
  genome: Genome
  register: Register
  /** Display names of the two faces, resolved server-side from the catalogue. */
  heading: string
  body: string
  ground: Ground
  /** [ground, text, accent, primary], compiled — for the tab's swatch strip. */
  swatches: string[]
  /** The live render of this variant: the real renderer, the real genome. */
  preview: string
  /** The art director's one line on WHY, in the site's language. W3 has none. */
  why: string | null
  /**
   * What this variant's preview did with their header (W0): their markup as it is,
   * or SAFE PANEL (their logo and every link, in a frame we own). `ours` only when
   * there is no website to read a header from. What the preview shows is what the
   * hand-off applies — it rides in the carry. Since W0 it is the same for all three
   * variants: they differ in the BODY only.
   */
  chrome: RevealChrome
}

/**
 * What a preview can do with their header (design/chrome.ts#drawnPolicy). The
 * W6 rungs `harmonise` (their header repainted) and `rebuild` (their header
 * redrawn by us) are gone for every site with a website (reboot plan §3.8).
 */
export type RevealChrome = 'keep' | 'safe_panel' | 'ours'
export const REVEAL_CHROME: readonly RevealChrome[] = ['keep', 'safe_panel', 'ours']

/** A number we can quote instead of an opinion — see `preferredFor` in reveal.ts. */
export type RevealAdvice = { kind: 'body' | 'link'; ratio: number }

export type RevealDesign = {
  /**
   * The evidence and the brief this design was made from, signed by the server
   * (HMAC). Opaque here. It is what buys the model upgrade — the upgrade endpoint
   * accepts nothing else — and what the hand-off carries into signup. Null when
   * the server has no key to sign with: then there is simply no upgrade.
   */
  token: string | null
  /** `derived` = W3, the arithmetic. `directed` = W4, the art director. */
  source: 'derived' | 'directed'
  variants: RevealVariant[]
  /** Which tab opens first. Elevat only when there is a number to say why. */
  preferred: RevealVariantName
  advice: RevealAdvice | null
}

/** What the upgrade endpoint answers. Anything but `directed` means "keep W3". */
export type DesignUpgradeResponse =
  /** `cached`: served from the per-domain memory (W6) — no model call was made. */
  | { source: 'directed'; variants: RevealVariant[]; cached?: 'memo' | 'db' }
  | { source: 'derived' }

/**
 * Brackets a harmonised-chrome block inside a site's chrome CSS (W6). Nothing
 * writes one any more (W0); sites that adopted one before carry it in their stored
 * CSS, and the render cuts it out (stripHarmony) so their header is theirs again.
 */
export const HARMONY_MARK = '/*carma:harmonise*/'

/**
 * The shape of a captured header (design/chrome.ts). Captures are REMEMBERED for a
 * week (design/store.ts), so one made under older rules must not be served as if
 * it were made under these: bump this whenever what a capture holds, or how it is
 * sanitised, changes. Here, not in chrome.ts, so the store (which the blog render
 * imports) stays free of the capture machinery.
 * 2 = logo tone + the faithful gate + the parse5 sanitiser.
 */
export const CAPTURE_VERSION = 2

/** A chrome CSS string with every harmonised block removed (a design applied twice left two). */
export function stripHarmony(css: string): string {
  let out = css
  for (let a = out.indexOf(HARMONY_MARK); a >= 0; a = out.indexOf(HARMONY_MARK)) {
    const b = out.indexOf(HARMONY_MARK, a + HARMONY_MARK.length)
    out = out.slice(0, a) + (b < 0 ? '' : out.slice(b + HARMONY_MARK.length))
  }
  return out.trim()
}
