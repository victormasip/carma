'use server'

// Account self-service actions for the Settings page: display name + password.
// Both operate ONLY on the signed-in user via their own session (no admin client,
// no user id taken from the client), so a caller can never touch another account.

import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

const MIN_PASSWORD = 8

// `profiles.town` only exists after migration 036.
const UNDEFINED_COLUMN = '42703'

/** Update the display name (stored in auth user_metadata.full_name — no schema
 *  dependency). Shown in the dashboard sidebar + settings account card. */
export async function updateDisplayName(name: string): Promise<Result> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!clean) return { ok: false, error: 'El nom no pot estar buit.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticat.' }

  const { error } = await supabase.auth.updateUser({ data: { full_name: clean } })
  if (error) return { ok: false, error: error.message }

  // Best-effort mirror onto profiles if a name column exists (ignored otherwise).
  return { ok: true }
}

/** Change the password. Verifies the CURRENT password first (re-auth) so a
 *  hijacked-but-idle tab can't silently rotate credentials, then sets the new one. */
export async function updatePassword(currentPassword: string, newPassword: string): Promise<Result> {
  if (newPassword.length < MIN_PASSWORD) {
    return { ok: false, error: `La nova contrasenya ha de tenir com a mínim ${MIN_PASSWORD} caràcters.` }
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: 'La nova contrasenya ha de ser diferent de l’actual.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: 'No autenticat.' }

  // Re-authenticate with the current password. signInWithPassword on the same
  // user just refreshes the active session (same identity), so it's a safe
  // verification step — a wrong current password fails here, before any change.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (reauthError) return { ok: false, error: 'La contrasenya actual no és correcta.' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * The town this person writes from.
 *
 * THE MAP CANNOT BE DRAWN FROM DATA WE NEVER ASK FOR. The community map on the
 * landing page plots one soft dot per member town, and the interaction plan
 * makes `perfil_complet` (+15 punts) depend on it — but nothing in the product
 * had ever asked. This is that question, and it is the whole feature: one
 * optional free-text field on the profile.
 *
 * It lives on `profiles`, not on `sites`: a person lives somewhere, a blog does
 * not, and one person can own three blogs.
 *
 * Optional by design — an empty value clears it. We do not geocode, we do not
 * infer from an IP, and we never show it next to anything the person did not opt
 * into showing (`sites.showcase`).
 */
export async function updateTown(town: string, country?: string): Promise<Result & { town?: string }> {
  const clean = town.trim().replace(/\s+/g, ' ').slice(0, 80)
  const cleanCountry = (country ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticat.' }

  const { error } = await supabase
    .from('profiles')
    .update({ town: clean || null, ...(cleanCountry ? { country: cleanCountry } : {}) })
    .eq('id', user.id)

  if (error?.code === UNDEFINED_COLUMN) {
    return { ok: false, error: 'El mapa de la comunitat encara no està actiu (migració 036 pendent).' }
  }
  if (error) return { ok: false, error: error.message }
  return { ok: true, town: clean }
}
