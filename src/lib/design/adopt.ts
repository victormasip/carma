// W6 — adopting a design chosen on the Door (server-only, pure).
//
// Everything the hand-off decides without a database or a session: what the
// carried genome really is, whether our arithmetic would have produced it, what it
// compiles to, and how the site's freshly captured header is treated under its
// chrome policy. actions/design.ts wraps this with the auth, the provenance check
// that needs the direction cache, and the write — and the gates test it directly.

import { validateGenome } from '@/lib/design/validate'
import { compileGenome } from '@/lib/design/compile'
import { directDeterministic } from '@/lib/design/director'
import { genomeId, mastheadName, verifyDesignToken, type DesignTokenPayload } from '@/lib/design/reveal'
import { extractNav, harmoniseCss, rebuildChrome, type ChromeNav, type LogoTone } from '@/lib/design/chrome'
import { REVEAL_CHROME, REVEAL_ORDER, type RevealChrome, type RevealVariantName } from '@/lib/design/revealTypes'
import type { ChromePolicy, Compiled, Genome } from '@/lib/design/genome'
import type { DesignTokens } from '@/lib/scrape/tokens'
import type { DoorDesignChoice } from '@/lib/onboarding/glimpse'

/** The chosen design outlives the Door's 1h upgrade window: signup takes time. */
export const ADOPT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const MAX_HEADER = 200_000

/** What the Studio has just captured of their site, as far as the header goes. */
export type AdoptCapture = {
  /** The captured header region (raw HTML), or null when there is none. */
  header: string | null
  /** The page the capture read — links in the header resolve against it. */
  baseUrl: string | null
  /** Did the chrome compiler understand their CSS? Keep/harmonise need it. */
  styled: boolean
  /** Their logo's tone, measured by the caller (design/logoTone.ts) — the only I/O. */
  logoTone?: LogoTone | null
}

/** How the Studio should treat the header it has just captured. */
export type AdoptChrome =
  | { policy: 'keep' }
  | { policy: 'harmonise'; css: string }
  | { policy: 'rebuild'; header: string; footer: string }

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

/** The URL their header's links resolve against, or null. */
export function navBase(url: string | null | undefined): URL | null {
  try { return url ? new URL(url) : null } catch { return null }
}

/** The logo their captured header shows, for the caller to measure. */
export function logoSrcOf(capture: AdoptCapture): string | null {
  const base = navBase(capture.baseUrl)
  return capture.header && base ? extractNav(capture.header.slice(0, MAX_HEADER), base).logo?.src ?? null : null
}

/** The id a genome has once it has been through validation — both sides of every comparison. */
export const validatedId = (g: unknown): string => genomeId(validateGenome(g).genome as Genome)

/**
 * The carried choice, verified and compiled. Null only for something that is not
 * a choice at all; a tampered genome is repaired (validation) and simply stops
 * counting as `derived`.
 */
export function planAdoption(choice: DoorDesignChoice | null | undefined, capture: AdoptCapture, siteName: string): AdoptionPlan | null {
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

  // THE HEADER, ON THE RUNG THE PREVIEW DREW (chrome.ts#drawnPolicy), applied to
  // the Studio's fresh capture. The drawn rung wins over the genome's intent: a
  // Fidel whose header the Door could only redraw is adopted redrawn, not with
  // markup they never saw. Keep and harmonise still need the Studio's capture to be
  // styled — without it both fall to rebuild, exactly as the preview would have.
  let policy: ChromePolicy = REVEAL_CHROME.includes(choice.chrome as RevealChrome) ? choice.chrome as RevealChrome : genome.chrome.policy
  if ((policy === 'keep' || policy === 'harmonise') && (!capture.header || !capture.styled)) policy = 'rebuild'
  const base = navBase(capture.baseUrl)
  const nav: ChromeNav = capture.header && base
    ? extractNav(capture.header.slice(0, MAX_HEADER), base)
    : { logo: null, links: [], cta: null }
  if (nav.logo) nav.logo = { ...nav.logo, tone: capture.logoTone ?? null }
  let chrome: AdoptChrome
  if (policy === 'keep') chrome = { policy: 'keep' }
  else if (policy === 'harmonise') chrome = { policy: 'harmonise', css: harmoniseCss(compiled.tokens, nav.logo) }
  else {
    const name = mastheadName(payload?.siteName) ?? mastheadName(siteName) ?? ''
    const built = rebuildChrome({ nav, siteName: name, genome, tokens: compiled.tokens, homeHref: base ? `${base.origin}/` : '/' })
    chrome = { policy: 'rebuild', header: built.header, footer: built.footer }
  }

  return {
    genome, genomeId: id, variant: choice.variant, payload, derived, compiled,
    tokens: { ...compiled.tokens, genome: id },
    fontLinks: compiled.fonts.map(f => f.href),
    chrome,
  }
}
