// WhatsApp phone-binding — OTP + phone normalization (server-only).
//
// The Settings page (T7) lets an owner bind their personal WhatsApp number to
// their Carma account. We mint a short numeric code, show it in the dashboard,
// and the owner sends it FROM their phone to the agent number. The webhook then
// matches the code on an inbound message and flips the identity to `active`
// (that inbound also IS the GDPR opt-in — they initiated contact).

import { randomInt } from 'node:crypto'

/** 6-digit numeric OTP shown in Settings and echoed back over WhatsApp. */
export function mintVerifyCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Normalize a user-entered phone to E.164 (`+` + digits) so it maps to the SAME
 * `wa_identities` row the webhook resolves from an inbound message. The webhook
 * computes `'+' + from.replace(/[^\d]/g,'')`; we mirror that exactly. Returns null
 * when the input can't be a real international number.
 */
export function normalizePhoneE164(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return '+' + digits
}

/** True when an inbound message's digits contain a (non-expired) verify code. */
export function inboundMatchesCode(text: string | null | undefined, code: string | null): boolean {
  if (!text || !code) return false
  return text.replace(/[^\d]/g, '').includes(code)
}
