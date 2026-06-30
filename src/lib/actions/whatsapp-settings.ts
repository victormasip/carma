'use server'

// WhatsApp Settings — owner-facing server actions (T7 onboarding).
//
// Reads happen in the Settings server page via the user's RLS-scoped client.
// WRITES land here: migration 027 has no INSERT/UPDATE/DELETE RLS policies (every
// mutation is service-role by design), so each action authenticates the caller
// (auth.uid()), authorizes ownership, then writes with the admin client. The
// phone never goes `active` from here — that happens in the webhook when the
// owner texts the code (which is also the GDPR opt-in).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mintVerifyCode, normalizePhoneE164 } from '@/lib/whatsapp/verify'
import { WA_VERIFY_CODE_TTL_MIN } from '@/lib/whatsapp/config'

export type ActionResult = { ok: true } | { ok: false; error: string }

const SETTINGS_PATH = '/dashboard/settings'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function freshCode() {
  return {
    verify_code: mintVerifyCode(),
    verify_expires_at: new Date(Date.now() + WA_VERIFY_CODE_TTL_MIN * 60_000).toISOString(),
  }
}

/** Add (or re-issue the code for) the owner's WhatsApp number → status `pending`. */
export async function addPhoneNumber(raw: string): Promise<ActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'No autenticat.' }

  const phone = normalizePhoneE164(raw)
  if (!phone) return { ok: false, error: 'Número no vàlid. Inclou el prefix del país (ex. +34 600 00 00 00).' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('wa_identities')
    .select('id, user_id, status')
    .eq('phone_e164', phone)
    .maybeSingle()

  if (existing) {
    if (existing.user_id !== user.id) {
      return { ok: false, error: 'Aquest número ja està vinculat a un altre compte.' }
    }
    if (existing.status === 'active') {
      return { ok: false, error: 'Aquest número ja està verificat.' }
    }
    // Pending and mine → issue a fresh code.
    const { error } = await admin
      .from('wa_identities')
      .update({ status: 'pending', ...freshCode() })
      .eq('id', existing.id)
    if (error) return { ok: false, error: 'No s\'ha pogut actualitzar el número.' }
    revalidatePath(SETTINGS_PATH)
    return { ok: true }
  }

  const { error } = await admin.from('wa_identities').insert({
    phone_e164: phone,
    user_id: user.id,
    status: 'pending',
    ...freshCode(),
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Aquest número ja està en ús.' }
    return { ok: false, error: 'No s\'ha pogut afegir el número.' }
  }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

/** Issue a new code for a still-pending number the caller owns. */
export async function regenerateVerifyCode(identityId: string): Promise<ActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'No autenticat.' }

  const admin = createAdminClient()
  const { data: identity } = await admin
    .from('wa_identities')
    .select('id, user_id, status')
    .eq('id', identityId)
    .maybeSingle()
  if (!identity || identity.user_id !== user.id) return { ok: false, error: 'Número no trobat.' }
  if (identity.status === 'active') return { ok: false, error: 'Aquest número ja està verificat.' }

  const { error } = await admin
    .from('wa_identities')
    .update({ status: 'pending', ...freshCode() })
    .eq('id', identityId)
  if (error) return { ok: false, error: 'No s\'ha pogut generar el codi.' }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

/** Unbind a number the caller owns (CASCADE drops its threads/scoping). */
export async function removePhoneNumber(identityId: string): Promise<ActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'No autenticat.' }

  const admin = createAdminClient()
  const { data: identity } = await admin
    .from('wa_identities')
    .select('id, user_id')
    .eq('id', identityId)
    .maybeSingle()
  if (!identity || identity.user_id !== user.id) return { ok: false, error: 'Número no trobat.' }

  const { error } = await admin.from('wa_identities').delete().eq('id', identityId)
  if (error) return { ok: false, error: 'No s\'ha pogut eliminar el número.' }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

/**
 * Scope which of the owner's sites this number may publish to (G2 allow-list).
 * `siteIds` = the checked sites. Selecting ALL of them clears the scoping rows
 * (empty = "all candidates", per the webhook resolver), so the default stays
 * future-proof if the owner gains a new site.
 */
export async function setIdentitySites(identityId: string, siteIds: string[]): Promise<ActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'No autenticat.' }

  const admin = createAdminClient()
  const { data: identity } = await admin
    .from('wa_identities')
    .select('id, user_id')
    .eq('id', identityId)
    .maybeSingle()
  if (!identity || identity.user_id !== user.id) return { ok: false, error: 'Número no trobat.' }

  // Authorize the selection against the sites the owner actually belongs to.
  const { data: memberships } = await admin
    .from('site_users')
    .select('site_id')
    .eq('user_id', user.id)
  const allowed = new Set((memberships ?? []).map((r) => r.site_id as string))
  const chosen = siteIds.filter((id) => allowed.has(id))
  if (chosen.length === 0) {
    return { ok: false, error: 'Tria com a mínim un lloc on l\'agent pugui publicar.' }
  }

  // Always replace the current scoping for this identity.
  await admin.from('wa_identity_sites').delete().eq('identity_id', identityId)

  // All sites selected ⇒ leave it empty (= every candidate, the default).
  if (chosen.length < allowed.size) {
    const rows = chosen.map((site_id) => ({ identity_id: identityId, site_id }))
    const { error } = await admin.from('wa_identity_sites').insert(rows)
    if (error) return { ok: false, error: 'No s\'ha pogut desar l\'abast.' }
  }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}
