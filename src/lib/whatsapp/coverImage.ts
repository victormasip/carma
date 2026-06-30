// WhatsApp Agent — AI cover-image generation (server-only).
//
// Founder directive 2026-06-30: the agent proactively offers to generate a cover
// image for a draft (the "nano-banana" external image API). The ENTIRE logical flow
// is real — load the post for context, build the prompt, write DB state, set the
// featured image — only the external image-provider FETCH is stubbed (behind
// NANO_BANANA_API_KEY). Enabling the real provider later is a one-function change in
// `generateCoverImage` with zero churn in the worker/webhook/state machine.

import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

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
 * Low-level provider call. STUB: returns `not_configured` until the nano-banana
 * provider is wired. The signature + error contract are final so the orchestrator
 * below can gate on the result without later refactors. The eventual implementation:
 *   POST {NANO_BANANA_API_BASE}/generate  { prompt, aspect }  → { url }
 */
export async function generateCoverImage(req: CoverImageRequest): Promise<CoverImageResult> {
  if (!coverImageEnabled()) return { ok: false, reason: 'not_configured' }
  // Real fetch lands here in the follow-up; mocked for now even when keys are set.
  void req
  return { ok: false, reason: 'error', detail: 'cover image provider fetch not implemented yet' }
}

// ─── Orchestrator: the full Free-Flow cover step (server-only) ────────────────
export type NanoBananaResult =
  | { ok: true; mocked: true; prompt: string }
  | { ok: true; mocked: false; url: string; prompt: string }
  | { ok: false; reason: 'no_post' | 'error' }

/**
 * Generate (and attach) a cover image for a post — the function the WhatsApp agent
 * invokes when the owner taps "Sí" on the cover-image offer. The whole flow is real:
 *
 *   1. Load the post for prompt context (title + lede), unless `context` supplies it.
 *   2. Build the image prompt from the title/lede + an optional brand hint.
 *   3. Write DB state on the post (`meta.cover_status` + `meta.cover_prompt`) so the
 *      request is durable and observable — `generating` → `done` | `mock_pending`.
 *   4. Call the provider. On a real URL, set `posts.featured_image` + `cover_status:'done'`.
 *      While the fetch is stubbed, land in `mock_pending` (state recorded, image pending).
 *
 * Returns a discriminated result the caller turns into the WhatsApp reply. Never throws.
 */
export async function generateNanoBananaCover(
  admin: Admin,
  postId: string,
  context?: { siteId?: string | null; title?: string; excerpt?: string; brandHint?: string },
): Promise<NanoBananaResult> {
  try {
    const { data: post } = await admin
      .from('posts').select('title, excerpt, meta').eq('id', postId).maybeSingle()
    if (!post) return { ok: false, reason: 'no_post' }

    const title = context?.title || String(post.title ?? '')
    const excerpt = context?.excerpt || String(post.excerpt ?? '')
    const meta = ((post.meta as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
    const prompt = buildCoverPrompt({ title, excerpt, brandHint: context?.brandHint })

    // (3) durable request state — recorded even while the fetch is mocked.
    await admin.from('posts').update({ meta: { ...meta, cover_status: 'generating', cover_prompt: prompt } }).eq('id', postId)

    // (4) provider call (stubbed). A real URL attaches as the featured image.
    const provider = await generateCoverImage({ title, excerpt, brandHint: context?.brandHint })
    if (provider.ok) {
      await admin.from('posts')
        .update({ featured_image: provider.url, meta: { ...meta, cover_status: 'done', cover_prompt: prompt } })
        .eq('id', postId)
      return { ok: true, mocked: false, url: provider.url, prompt }
    }

    await admin.from('posts').update({ meta: { ...meta, cover_status: 'mock_pending', cover_prompt: prompt } }).eq('id', postId)
    return { ok: true, mocked: true, prompt }
  } catch {
    return { ok: false, reason: 'error' }
  }
}
