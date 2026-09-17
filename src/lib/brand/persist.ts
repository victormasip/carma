// Brand Brain — persistence + prompt rendering (server-only).
//
// Writes into `site_brain_profiles`, the table the WhatsApp agent already reads on
// every write turn (whatsapp/persona.ts → buildWritingContext). That is the whole
// point of the design: nothing downstream has to change for the agent to know the
// brand — the row it always read is simply populated at onboarding instead of
// being empty until the owner has published enough articles to distil.
//
// Two shapes go in at once:
//   · the migration-030 columns (industry / audience / tone / content_pillars /
//     writing_rules), so everything already reading them benefits immediately;
//   · `brand` (migration 033), holding what 030 had nowhere to put — identity,
//     verbatim exemplars, visual, constraints, provenance.
//
// 42703-safe throughout: without migration 033 the `brand` column doesn't exist,
// and the write retries without it so the 030 half still lands.

import type { createAdminClient } from '@/lib/supabase/admin'
import type { BrandBrain } from './types'
import type { DistilledBrand } from './distil'

type Admin = ReturnType<typeof createAdminClient>

const UNDEFINED_COLUMN = '42703'

/**
 * Persist a captured Brand Brain. Returns true when the row landed.
 *
 * `source: 'onboarding'` matters: it tells the background profiler that this
 * profile came from the owner's own material and must NOT be overwritten by the
 * thinner distillation-from-published-posts pass. Confidence order is
 * owner_edited > onboarding > auto > seed.
 */
export async function saveBrandBrain(
  admin: Admin,
  siteId: string,
  distilled: DistilledBrand,
): Promise<boolean> {
  const { brain } = distilled

  const base = {
    site_id: siteId,
    industry: distilled.industry,
    audience: brain.audience.who,
    tone: {
      descriptors: brain.voice.descriptors,
      register: brain.voice.register,
      emoji_policy: brain.voice.emojiPolicy,
    },
    content_pillars: brain.pillars.map(p => ({
      name: p.name,
      keywords: p.keywords,
      coverage: p.coverage ?? undefined,
    })),
    writing_rules: { dos: distilled.writingDos, donts: distilled.writingDonts },
    source: 'onboarding',
    generated_at: brain.capturedAt,
    // A profile built from the owner's own material is not stale the moment they
    // publish — only the SEO half of the row ages, and the cron recomputes that.
    stale: false,
  }

  const full = { ...base, brand: brain }

  try {
    let { error } = await admin.from('site_brain_profiles').upsert(full, { onConflict: 'site_id' })
    if (error?.code === UNDEFINED_COLUMN) {
      ;({ error } = await admin.from('site_brain_profiles').upsert(base, { onConflict: 'site_id' }))
    }
    if (error) {
      console.error('[brand/persist] upsert failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[brand/persist] upsert threw:', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Persist a Brand Brain the OWNER has corrected (lib/brand/refine.ts).
 *
 * Separate from saveBrandBrain because the confidence ladder matters downstream:
 * owner_edited > onboarding > auto > seed. The background profiler must never
 * overwrite a profile the owner fixed by hand — that is the whole reason they
 * were allowed to fix it. The 030 mirror columns are rewritten from the brain so
 * anything reading them stays in step with the rich column.
 */
export async function saveOwnerEditedBrain(
  admin: Admin,
  siteId: string,
  brain: BrandBrain,
): Promise<boolean> {
  const base = {
    site_id: siteId,
    audience: brain.audience.who,
    tone: {
      descriptors: brain.voice.descriptors,
      register: brain.voice.register,
      emoji_policy: brain.voice.emojiPolicy,
    },
    content_pillars: brain.pillars.map(p => ({
      name: p.name,
      keywords: p.keywords,
      coverage: p.coverage ?? undefined,
    })),
    source: 'owner_edited',
    generated_at: new Date().toISOString(),
    stale: false,
  }
  const full = { ...base, brand: brain }

  try {
    let { error } = await admin.from('site_brain_profiles').upsert(full, { onConflict: 'site_id' })
    if (error?.code === UNDEFINED_COLUMN) {
      ;({ error } = await admin.from('site_brain_profiles').upsert(base, { onConflict: 'site_id' }))
    }
    if (error) {
      console.error('[brand/persist] owner-edit upsert failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[brand/persist] owner-edit upsert threw:', e instanceof Error ? e.message : e)
    return false
  }
}

/** Read back the rich half of the profile. Null pre-033 or when never captured. */
export async function readBrandBrain(admin: Admin, siteId: string): Promise<BrandBrain | null> {
  try {
    const { data, error } = await admin
      .from('site_brain_profiles')
      .select('brand')
      .eq('site_id', siteId)
      .maybeSingle()
    if (error || !data) return null
    const brand = (data as { brand?: unknown }).brand
    return brand && typeof brand === 'object' ? (brand as BrandBrain) : null
  } catch {
    return null
  }
}

/**
 * Render the Brand Brain as the prompt block the article writer consumes.
 *
 * Appended AFTER the existing BRAND PROFILE block rather than replacing it, so a
 * site with both an onboarding capture and a distilled-from-posts profile gets
 * both — they describe different things (who they are vs. what they've published).
 *
 * The exemplars are emitted last and quoted, because a few-shot block is most
 * effective adjacent to the instruction to write.
 */
export function formatBrandBrain(b: BrandBrain): string {
  const lines: string[] = ['BRAND (captured from the owner’s own material at onboarding):']

  if (b.identity.name) lines.push(`Name: ${b.identity.name}`)
  if (b.identity.tagline) lines.push(`Tagline: ${b.identity.tagline}`)
  if (b.identity.whatTheySell) lines.push(`What they actually sell: ${b.identity.whatTheySell}`)
  if (b.identity.proofPoints.length) lines.push(`Proof points: ${b.identity.proofPoints.join(' · ')}`)

  if (b.audience.who) lines.push(`Audience: ${b.audience.who}`)
  if (b.audience.problems.length) lines.push(`Their problems: ${b.audience.problems.join(' · ')}`)
  if (b.audience.register) lines.push(`Address the reader as: ${b.audience.register}`)

  const voiceBits = [
    b.voice.descriptors.length ? b.voice.descriptors.join(', ') : null,
    b.voice.register ? `register ${b.voice.register}` : null,
    b.voice.sentenceLength ? `${b.voice.sentenceLength} sentences` : null,
    b.voice.emojiPolicy ? `emoji ${b.voice.emojiPolicy}` : null,
  ].filter(Boolean)
  if (voiceBits.length) lines.push(`Voice: ${voiceBits.join(' · ')}`)
  if (b.voice.bannedWords.length) lines.push(`NEVER use these words: ${b.voice.bannedWords.join(', ')}`)

  if (b.pillars.length) {
    lines.push(`Content pillars: ${b.pillars.map(p => p.name).filter(Boolean).join(' · ')}`)
    const gaps = b.pillars.filter(p => p.coverage === 'gap' || p.coverage === 'thin').map(p => p.name)
    if (gaps.length) lines.push(`Under-covered pillars (good angles): ${gaps.join(' · ')}`)
  }

  if (b.constraints.neverClaim.length) {
    lines.push(`NEVER claim: ${b.constraints.neverClaim.join('; ')}`)
  }

  if (b.visual.imageryStyle) lines.push(`Imagery style: ${b.visual.imageryStyle}`)

  // The payload. Verbatim by construction — the distiller picks these by index
  // from the brand's own pages and never emits the text itself.
  if (b.voice.exemplars.length) {
    lines.push('')
    lines.push('HOW THIS BRAND ACTUALLY WRITES — real sentences from their own material.')
    lines.push('Match this rhythm and vocabulary. Do not quote them; write new prose that sounds like them:')
    for (const s of b.voice.exemplars) lines.push(`  «${s}»`)
  }

  return lines.join('\n')
}

/** One-line summary for the onboarding UI — what we learned, in the owner's words. */
export function summariseBrandBrain(b: BrandBrain): string[] {
  const out: string[] = []
  if (b.identity.whatTheySell) out.push(b.identity.whatTheySell)
  if (b.audience.who) out.push(`Per a ${b.audience.who}`)
  if (b.voice.descriptors.length) out.push(`To de veu: ${b.voice.descriptors.slice(0, 3).join(', ')}`)
  if (b.pillars.length) out.push(`Temes: ${b.pillars.slice(0, 3).map(p => p.name).join(' · ')}`)
  if (b.voice.exemplars.length) out.push(`${b.voice.exemplars.length} frases teves memoritzades`)
  return out
}
