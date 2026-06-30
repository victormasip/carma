// Outbound WhatsApp via the Kapso REST API (server-only).
//
// Provider pivot (founder directive 2026-06-26): Twilio → Kapso. The worker (T4)
// sends the clarification question or the "draft ready → review link" reply through
// Kapso's Meta WhatsApp proxy:
//   POST {KAPSO_API_BASE}/{graph}/{phone_number_id}/messages   (X-API-Key)
// with a standard Meta text-message body.

import { KAPSO_API_BASE, KAPSO_GRAPH_VERSION } from './config'

/** Build the public review-link URL for a freshly minted token. */
export function reviewUrl(rawToken: string): string {
  const base = (process.env.WA_REVIEW_BASE_URL || 'https://carma.cat').replace(/\/+$/, '')
  return `${base}/review/${rawToken}`
}

/**
 * Send a WhatsApp text via Kapso. Returns true on success, false on any failure
 * (the worker logs and continues; a failed send must not crash the job).
 *
 * `phoneNumberId` is the Kapso/Meta phone number id the message routes through. We
 * fall back to KAPSO_PHONE_NUMBER_ID (the single prepaid-SIM number) when a caller
 * has no per-message id — e.g. the fail-safe apology in runDueJobs.
 */
export async function sendWhatsApp(
  toPhoneE164: string,
  body: string,
  phoneNumberId?: string | null,
): Promise<boolean> {
  const apiKey = process.env.KAPSO_API_KEY
  const pnid = phoneNumberId || process.env.KAPSO_PHONE_NUMBER_ID
  if (!apiKey || !pnid) {
    console.error('[wa/kapso] missing KAPSO_API_KEY or phone_number_id; cannot send')
    return false
  }
  const to = toPhoneE164.replace(/^whatsapp:/, '').trim()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(`${KAPSO_API_BASE}/${KAPSO_GRAPH_VERSION}/${encodeURIComponent(pnid)}/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body },
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[wa/kapso] send failed', res.status, detail.slice(0, 300))
      return false
    }
    return true
  } catch (e) {
    console.error('[wa/kapso] send error', e instanceof Error ? e.message : e)
    return false
  } finally {
    clearTimeout(timer)
  }
}

// ─── Interactive reply buttons (Approve / Edit / …) ───────────────────────────
// WhatsApp limits: ≤3 buttons, title ≤20 chars (emoji included), id ≤256 chars,
// body ≤1024 chars. We clamp defensively so a too-long title can never 400 the send.
export type WaButton = { id: string; title: string }

/**
 * Send an interactive button message via Kapso. On any failure (or if WhatsApp
 * rejects interactive for this number), the caller should fall back to a plain
 * text send so the owner is never left without the review link. Returns true on a
 * 2xx send.
 */
export async function sendWhatsAppButtons(
  toPhoneE164: string,
  body: string,
  buttons: WaButton[],
  phoneNumberId?: string | null,
): Promise<boolean> {
  const apiKey = process.env.KAPSO_API_KEY
  const pnid = phoneNumberId || process.env.KAPSO_PHONE_NUMBER_ID
  if (!apiKey || !pnid) {
    console.error('[wa/kapso] missing KAPSO_API_KEY or phone_number_id; cannot send buttons')
    return false
  }
  const to = toPhoneE164.replace(/^whatsapp:/, '').trim()
  const action = {
    buttons: buttons.slice(0, 3).map((b) => ({
      type: 'reply',
      reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
    })),
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(`${KAPSO_API_BASE}/${KAPSO_GRAPH_VERSION}/${encodeURIComponent(pnid)}/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: { type: 'button', body: { text: body.slice(0, 1024) }, action },
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[wa/kapso] button send failed', res.status, detail.slice(0, 300))
      return false
    }
    return true
  } catch (e) {
    console.error('[wa/kapso] button send error', e instanceof Error ? e.message : e)
    return false
  } finally {
    clearTimeout(timer)
  }
}
