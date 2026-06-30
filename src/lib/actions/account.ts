'use server'

// Account self-service actions for the Settings page: display name + password.
// Both operate ONLY on the signed-in user via their own session (no admin client,
// no user id taken from the client), so a caller can never touch another account.

import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

const MIN_PASSWORD = 8

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
