// W6 — adopting a design chosen on the Door (server-only, pure).
//
// Everything the hand-off decides without a database or a session: what the
// carried genome really is, whether our arithmetic would have produced it, what it
// compiles to, and whether the site's freshly captured header is shown as theirs or
// as SAFE PANEL (W0). actions/design.ts wraps this with the auth, the provenance
// check that needs the direction cache, and the write — and the gates test it.

import { validateGenome } from '@/lib/design/validate'
import { compileGenome } from '@/lib/design/compile'
import { directDeterministic } from '@/lib/design/director'
import { genomeId, verifyDesignToken, type DesignTokenPayload } from '@/lib/design/reveal'
import { REVEAL_ORDER, type RevealVariantName } from '@/lib/design/revealTypes'
import type { Compiled, Genome } from '@/lib/design/genome'
import type { DesignTokens } from '@/lib/scrape/tokens'
import type { DoorDesignChoice } from '@/lib/onboarding/glimpse'

/** The chosen design outlives the Door's 1h upgrade window: signup takes time. */
export const ADOPT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

/** What the Studio has just captured of their site, as far as the header goes. */
export type AdoptCapture = {
  /** The captured header region (raw HTML), or null when there is none. */
  header: string | null
  /** The page the capture read — links in the header resolve against it. */
  baseUrl: string | null
  /** Did the chrome compiler understand their CSS? Their markup is only shown if so. */
  styled: boolean
}

/**
 * How the Studio should treat the header it has just captured (W0): show it as
 * captured, or show SAFE PANEL — their logo and every link — instead. Never
 * repainted, never redrawn: those rungs are gone for every site with a website.
 */
export type AdoptChrome =
  | { policy: 'keep' }
  | { policy: 'safe_panel' }

export type AdoptionPlan = {
  genome: Genome
  genomeId: string
  variant: RevealVariantName
  /** The signed evidence and brief, or null when the signature does not hold. */
  payload: DesignTokenPayload | null
  /** Our arithmetic, run again on the signed evidence, lands on this very genome. */
  derived: boolean
  compiled: Compiled
  /** The genome's tokens, stamped with its id (see DesignTokens.genome). */
  tokens: DesignTokens
  /** The genome's own font stylesheets. */
  fontLinks: string[]
  chrome: AdoptChrome
}

const isVariant = (v: unknown): v is RevealVariantName => REVEAL_ORDER.includes(v as RevealVariantName)

/** The id a genome has once it has been through validation — both sides of every comparison. */
export const validatedId = (g: unknown): string => genomeId(validateGenome(g).genome as Genome)

/**
 * The carried choice, verified and compiled. Null only for something that is not
 * a choice at all; a tampered genome is repaired (validation) and simply stops
 * counting as `derived`.
 */
export function planAdoption(choice: DoorDesignChoice | null | undefined, capture: AdoptCapture): AdoptionPlan | null {
  if (!choice || typeof choice !== 'object' || !isVariant(choice.variant)) return null

  // The genome spent an hour in a browser: validation repairs anything a hand
  // could have changed, so what we compile is always a genome WE would emit.
  const genome = validateGenome(choice.genome).genome as Genome
  const id = genomeId(genome)

  // The evidence is only trusted with our signature on it.
  const payload = typeof choice.evidence === 'string' ? verifyDesignToken(choice.evidence, ADOPT_TOKEN_TTL_MS) : null
  let derived = false
  if (payload) {
    const again = directDeterministic(payload.evidence, { siteId: payload.evidence.url })
    derived = validatedId(again[choice.variant].genome) === id
  }

  const compiled = compileGenome(genome)

  // THE HEADER (W0): what the preview showed, applied to the Studio's fresh
  // capture — never more faithful than that capture can be. SAFE PANEL when the
  // preview showed it, or when the Studio's capture is unstyled; their markup only
  // when both say it can be shown. (The capture's own fidelity verdict, recorded
  // with its compile stats, can still demote `keep` at render time.)
  const chrome: AdoptChrome = choice.chrome === 'safe_panel' || !capture.header || !capture.styled
    ? { policy: 'safe_panel' }
    : { policy: 'keep' }

  return {
    genome, genomeId: id, variant: choice.variant, payload, derived, compiled,
    tokens: { ...compiled.tokens, genome: id },
    fontLinks: compiled.fonts.map(f => f.href),
    chrome,
  }
}
