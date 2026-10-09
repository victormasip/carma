'use server'

// W6 — THE HAND-OFF: the design chosen on the Door becomes the site's design.
//
// On the Door an anonymous visitor picked one of three live blogs ("Aquest.
// Comencem.") and the choice rode through signup in sessionStorage — no row was
// written for someone we did not know. This is the first moment we DO know them
// and a site exists to hang the design on: the onboarding's capture of their
// website. So the adoption happens there, in the capture's own `result` handler
// (ThemeStudioContext), with the fresh capture in hand.
//
// What this action does, and does not, own:
//   · it VERIFIES what the browser carried (design/adopt.ts): the genome is
//     re-validated, the evidence token re-checked against our HMAC, and the
//     claimed provenance recomputed rather than believed — `derived` if our
//     arithmetic lands on it again, `directed` if the art director's cached answer
//     for that domain holds it, honestly `edited` otherwise;
//   · it STORES the genome with its evidence and brief as the site's active design
//     (migration 039). Without 039 it says so and stores nothing;
//   · it RETURNS the theme the genome compiles to — tokens, fonts, and whether
//     their header is shown as captured or as SAFE PANEL. It does NOT write site_themes: the
//     Theme Studio owns that row through a debounced autosave, and a server-side
//     write would be overwritten by the Studio's next save a second later. The
//     Studio applies what this returns and its autosave persists it — the one
//     writer the theme has always had.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateTag } from 'next/cache'
import { siteTag } from '@/lib/render/cache'
import { COMPILER_VERSION } from '@/lib/design/compile'
import { planAdoption, validatedId, type AdoptCapture, type AdoptChrome } from '@/lib/design/adopt'
import { directedFor, domainOf, saveActiveGenome } from '@/lib/design/store'
import type { RevealVariantName } from '@/lib/design/revealTypes'
import type { DesignTokens } from '@/lib/scrape/tokens'
import type { DoorDesignChoice } from '@/lib/onboarding/glimpse'

export type AdoptResult = {
  error?: string
  /** The genome's tokens, stamped with its id (see DesignTokens.genome). */
  tokens?: DesignTokens
  /** The genome's own font stylesheets. The Studio adds the header's own. */
  fontLinks?: string[]
  chrome?: AdoptChrome
  genomeId?: string
  variant?: RevealVariantName
  source?: 'derived' | 'directed' | 'edited'
  /** False when migration 039 is not applied: the design still applies, with no history. */
  persisted?: boolean
  reason?: string
}

// Mirrors assertThemeAccess in actions/theme.ts: an assigned member or a superadmin.
async function assertSiteAccess(siteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()
  if (profile?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users').select('user_id').eq('site_id', siteId).eq('user_id', user.id).single()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }
  return { admin, userId: user.id }
}

/**
 * The chosen design, adopted. Called once, from the onboarding capture's `result`
 * handler. (W0: no logo is fetched to be re-inked any more — their header is never
 * repainted or redrawn, so there is nothing to re-ink.)
 */
export async function adoptDoorDesign(
  siteId: string,
  choice: DoorDesignChoice,
  capture: AdoptCapture,
): Promise<AdoptResult> {
  try {
    const { admin, userId } = await assertSiteAccess(siteId)
    const plan = planAdoption(choice, capture)
    if (!plan) return { error: 'Disseny no vàlid' }

    let source: NonNullable<AdoptResult['source']> = plan.derived ? 'derived' : 'edited'
    if (!plan.derived && plan.payload) {
      const directed = await directedFor(admin, domainOf(plan.payload.evidence.url), validatedId)
      if (directed.has(plan.genomeId)) source = 'directed'
    }

    const saved = await saveActiveGenome(admin, {
      siteId, userId, genome: plan.genome, genomeId: plan.genomeId, source, variant: plan.variant,
      evidence: plan.payload?.evidence ?? null,
      brief: plan.payload?.brief ?? null,
      compiledCss: plan.compiled.css,
      compilerVersion: COMPILER_VERSION,
    })
    if (!saved.persisted) console.info('[design] Door design applied without history:', saved.reason)
    // The blog renders the genome's own stylesheet from the active row, so a new
    // row changes every page. (The Studio's autosave expires the tag again when
    // the tokens land; this covers the moment in between.)
    if (saved.persisted) updateTag(siteTag(siteId))

    return {
      tokens: plan.tokens, fontLinks: plan.fontLinks, chrome: plan.chrome,
      genomeId: plan.genomeId, variant: plan.variant, source,
      persisted: saved.persisted, ...(saved.reason ? { reason: saved.reason } : {}),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
