// WhatsApp Agent — AI cover-image generation (FOUNDATION / placeholder, server-only).
//
// Founder directive 2026-06-30: lay the groundwork so the agent can proactively offer
// to generate a cover image for a draft (the "nano-banana" external image API). The
// wiring, types and call-site are defined here; the actual provider call is stubbed
// behind NANO_BANANA_API_KEY so enabling it later is a one-function change with no
// churn in the worker/webhook. Until a key is set, callers get a clean
// `{ ok:false, reason:'not_configured' }` and fall back to "add it from Carma".

export type CoverImageRequest = {
  title: string
  excerpt?: string
  /** A short brand/style hint (site name, niche) to steer the look. */
  brandHint?: string
  /** Target aspect, defaults to a 1.91:1 social/blog hero. */
  aspect?: '1.91:1' | '16:9' | '1:1'
}

export type CoverImageResult =
  | { ok: true; url: string; prompt: string }
  | { ok: false; reason: 'not_configured' | 'error'; detail?: string }

/** True once the external image provider is configured (key present). */
export function coverImageEnabled(): boolean {
  return !!(process.env.NANO_BANANA_API_KEY && process.env.NANO_BANANA_API_BASE)
}

/** Build the text prompt we would send to the image model. Pure + testable. */
export function buildCoverPrompt(req: CoverImageRequest): string {
  const bits = [
    `Editorial blog hero image for an article titled "${req.title}".`,
    req.excerpt ? `Theme: ${req.excerpt}.` : '',
    req.brandHint ? `Brand context: ${req.brandHint}.` : '',
    'Clean, modern, premium, no text overlay, soft natural lighting.',
  ].filter(Boolean)
  return bits.join(' ')
}

/**
 * Generate a cover image for a draft. STUB: returns `not_configured` until the
 * nano-banana provider is wired. The signature and error contract are final so the
 * worker can call this and gate the UX on the result without later refactors.
 */
export async function generateCoverImage(req: CoverImageRequest): Promise<CoverImageResult> {
  if (!coverImageEnabled()) return { ok: false, reason: 'not_configured' }
  // Intentionally not implemented yet — the provider integration lands in a follow-up.
  // Shape of the eventual call (documented for the implementer):
  //   POST {NANO_BANANA_API_BASE}/generate  { prompt, aspect }  → { url }
  return { ok: false, reason: 'error', detail: 'cover image provider not implemented yet' }
}
