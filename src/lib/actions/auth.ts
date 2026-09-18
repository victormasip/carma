'use server'

// SIGN-IN, SIGN-UP AND THE SESSION CHECK — ON THE SERVER.
//
// WHY THIS FILE EXISTS
// ────────────────────
// `/login` and `/registre` were shipping 135.5KB gzip of their own JavaScript,
// 61.6KB of it `@supabase/supabase-js` (236KB raw), to render an email field and
// a password field. `/preview` shipped the same SDK to answer one boolean: is
// this visitor signed in, so should "unlock" point at /benvinguda or /registre?
//
// None of that work has to happen in a browser. A Server Action is an RPC
// boundary — its imports never cross into the client bundle, which is the exact
// property `npm run test:perf` §2 documents and relies on. Moving these four
// calls behind one takes the SDK off all three routes.
//
// IT IS ALSO MORE CORRECT, NOT MERELY LIGHTER
// ───────────────────────────────────────────
// The session cookies are set by `@supabase/ssr`'s server client through
// `cookies().set` (see lib/supabase/server.ts), which is the documented App
// Router pattern: the cookie lands on the action's response, so the very next
// server render already sees the session. The browser client had to set the
// cookie itself and then hope the server agreed on the next navigation.
//
// The OAuth flow gains the most. `signInWithOAuth` with `skipBrowserRedirect`
// returns the provider URL and writes the PKCE verifier as a cookie HERE, on the
// server — which is precisely where `/auth/callback` later needs it to exchange
// the code. The browser flow worked by the verifier cookie happening to be
// readable server-side; this one is that by construction.
//
// `/reset-password` is here too, all but one piece of it. Its main path is
// already server-shaped — /auth/callback exchanges the emailed code and sets the
// cookie before the page even loads — so the session check, the password change
// and the sign-out are all actions. The ONE piece that stays in the browser is
// the legacy hash-flow `onAuthStateChange` listener, and that page now imports
// the SDK dynamically, only when the URL actually carries a hash. On the normal
// PKCE path it is never fetched at all.
//
// See docs/plans/2026-09-18-performance-every-page.md §F4 / W4.

import { createClient } from '@/lib/supabase/server'

export type AuthResult = { ok: true } | { ok: false; error: string }

/**
 * Is there a signed-in user?
 *
 * `getUser()` rather than `getSession()`: getSession trusts whatever is in the
 * cookie, getUser revalidates it against the auth server. On a boolean that
 * decides where a call to action points, the revalidated answer is the one worth
 * having, and it costs one round trip the browser was making anyway.
 */
export async function hasSession(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !!user
  } catch {
    // A missing/invalid env must never wedge a page behind a spinner — the
    // caller treats "unknown" as "logged out" and the funnel still works.
    return false
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type SignUpResult =
  /** `needsConfirmation` = no session came back; the owner must open the email. */
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; error: string }

export async function signUpWithPassword(input: {
  email: string
  password: string
  name: string
  phone: string
  /** Absolute URL the confirmation email should return to (origin is a browser fact). */
  emailRedirectTo: string
}): Promise<SignUpResult> {
  if (input.password.length < 8) {
    return { ok: false, error: 'La contrasenya ha de tenir com a mínim 8 caràcters.' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { full_name: input.name.trim(), phone: input.phone.trim() || null },
      emailRedirectTo: input.emailRedirectTo,
    },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, needsConfirmation: !data.session }
}

/**
 * Start the Google flow. Returns the URL for the browser to travel to; the PKCE
 * verifier is written as a cookie on this response, ready for /auth/callback.
 */
export async function startGoogleOAuth(redirectTo: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error) return { ok: false, error: error.message }
  if (!data?.url) return { ok: false, error: 'No hem pogut obrir la sessió amb Google.' }
  return { ok: true, url: data.url }
}

/**
 * Send the password-recovery email.
 *
 * PKCE: the link must hit the SERVER callback so the cookie verifier is in scope
 * when the code is exchanged — and now the verifier is written on the server in
 * the first place. The callback then forwards to /reset-password with a live
 * recovery session.
 */
export async function sendPasswordReset(email: string, redirectTo: string): Promise<AuthResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Set a new password for the CURRENT session, with no old password required.
 *
 * This is the recovery flow's last step: `/auth/callback` has already exchanged
 * the emailed code and set a recovery session cookie, so "the current session"
 * is precisely the person who proved they own the mailbox.
 *
 * It asks for no current password ON PURPOSE — a recovering user does not have
 * one. That is not a new capability: `supabase.auth.updateUser({ password })` in
 * the browser SDK did exactly this, from a page anyone signed in could open. The
 * difference is only where it runs. For the signed-in, remembers-their-password
 * case, use `updatePassword` in lib/actions/account.ts, which re-authenticates
 * first.
 */
export async function completePasswordRecovery(password: string): Promise<AuthResult> {
  if (password.length < 8) return { ok: false, error: 'La contrasenya ha de tenir almenys 8 caràcters.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No s’ha trobat cap sessió de recuperació activa.' }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** End the session and clear its cookies. */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch { /* already gone is the desired end state either way */ }
}
