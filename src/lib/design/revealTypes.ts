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
   * genome always has the same id, which is what a future `site_design_genomes`
   * row will be keyed on. Nothing is stored under it yet.
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
}

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
  | { source: 'directed'; variants: RevealVariant[] }
  | { source: 'derived' }
