// WhatsApp Agent — REAL AI cover-image generation (server-only, P2.5 / CEO C-10).
//
// Every agent-published article should ship with a real cover image — the most
// visible week-1 quality gap was imageless posts. This kills the old "nano-banana"
// stub: it now calls a real image provider (OpenAI Images — K1: keep OpenAI for the
// WA channel, no new provider/keys), stores the bytes in the existing public
// `post-media` bucket (migration 013), and sets posts.featured_image to the clean URL.
//
// Best-effort by contract: a provider hiccup never blocks the draft/publish — the
// article just ships without a cover and cover_status records the failure. openai is
// imported lazily so this module stays import-safe for the plain-node test harness.

import type { createAdminClient } from '@/lib/supabase/admin'
import { WA_MOCK_AGENT } from './config'

type Admin = ReturnType<typeof createAdminClient>

const BUCKET = 'post-media'
const IMAGE_MODEL = process.env.WA_IMAGE_MODEL || 'gpt-image-1'
// Cost control: 'low' is plenty for a blog hero; overridable for premium looks.
const IMAGE_QUALITY = (process.env.WA_IMAGE_QUALITY || 'low') as 'low' | 'medium' | 'high' | 'auto'
// 3:2 landscape — closest gpt-image-1 size to a 1.91:1 social/blog hero.
const IMAGE_SIZE = process.env.WA_IMAGE_SIZE || '1536x1024'

export type CoverImageRequest = {
  title: string
  excerpt?: string
  /** A short brand/style hint (site name, niche) to steer the look. */
  brandHint?: string
}

export type CoverImageResult =
  | { ok: true; bytes: Buffer; contentType: string; prompt: string }
  | { ok: false; reason: 'not_configured' | 'error'; detail?: string }

/** True when the real image provider can run (key present, not in mock mode). */
export function coverImageEnabled(): boolean {
  if (WA_MOCK_AGENT) return false
  if (/^(0|false|no|off)$/i.test((process.env.WA_COVER_IMAGES || '').trim())) return false
  return !!process.env.OPENAI_API_KEY
}

/** Build the text prompt for the image model. Pure + testable. */
export function buildCoverPrompt(req: CoverImageRequest): string {
  const bits = [
    `Editorial blog hero image for an article titled "${req.title}".`,
    req.excerpt ? `Theme: ${req.excerpt}.` : '',
    req.brandHint ? `Brand context: ${req.brandHint}.` : '',
    'Photographic, clean, modern, premium, no text or lettering, soft natural lighting, wide aspect.',
  ].filter(Boolean)
  return bits.join(' ')
}

/**
 * Low-level provider call — OpenAI Images → PNG bytes. Returns `not_configured` when
 * disabled and `error` on any provider failure (never throws). openai is lazy-imported.
 */
export async function generateCoverImage(req: CoverImageRequest): Promise<CoverImageResult> {
  if (!coverImageEnabled()) return { ok: false, reason: 'not_configured' }
  const prompt = buildCoverPrompt(req)
  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ maxRetries: 1 })
    const res = await client.images.generate(
      { model: IMAGE_MODEL, prompt, size: IMAGE_SIZE, quality: IMAGE_QUALITY, n: 1 },
      { timeout: 90_000 },
    )
    const b64 = res.data?.[0]?.b64_json
    if (b64) return { ok: true, bytes: Buffer.from(b64, 'base64'), contentType: 'image/png', prompt }
    // Some models/params return a URL instead of b64 — fetch the bytes.
    const url = res.data?.[0]?.url
    if (url) {
      const r = await fetch(url)
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        return { ok: true, bytes: buf, contentType: r.headers.get('content-type') || 'image/png', prompt }
      }
    }
    return { ok: false, reason: 'error', detail: 'no image data returned' }
  } catch (e) {
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) }
  }
}

/** Upload cover bytes to the public post-media bucket → clean public URL (or null). */
async function uploadCover(admin: Admin, siteId: string, postId: string, bytes: Buffer, contentType: string): Promise<string | null> {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('jpeg') ? 'jpg' : 'png'
  const path = `${siteId}/cover-${postId}-${Date.now()}.${ext}`
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, cacheControl: '31536000', upsert: true })
  if (error) {
    console.error('[wa/cover] upload failed:', error.message)
    return null
  }
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// ─── Orchestrator: generate + attach a cover for a post (server-only) ─────────
export type CoverResult =
  | { ok: true; url: string; prompt: string }
  | { ok: false; reason: 'no_post' | 'not_configured' | 'error' }

/**
 * Generate a real cover image and attach it as posts.featured_image (via the
 * post-media bucket). Records durable state on the post's meta (cover_status:
 * generating → done | failed). Never throws. This is what the write executor calls
 * so every agent draft carries a real cover, and what the webhook Yes/No offer uses.
 */
export async function generateAndAttachCover(
  admin: Admin,
  postId: string,
  context?: { siteId?: string | null; title?: string; excerpt?: string; brandHint?: string },
): Promise<CoverResult> {
  try {
    if (!coverImageEnabled()) return { ok: false, reason: 'not_configured' }

    const { data: post } = await admin.from('posts').select('title, excerpt, meta, site_id').eq('id', postId).maybeSingle()
    if (!post) return { ok: false, reason: 'no_post' }

    const siteId = String(context?.siteId || post.site_id || '')
    const title = context?.title || String(post.title ?? '')
    const excerpt = context?.excerpt || String(post.excerpt ?? '')
    const meta = ((post.meta as Record<string, unknown> | null) ?? {}) as Record<string, unknown>

    await admin.from('posts').update({ meta: { ...meta, cover_status: 'generating' } }).eq('id', postId)

    const gen = await generateCoverImage({ title, excerpt, brandHint: context?.brandHint })
    if (!gen.ok) {
      await admin.from('posts').update({ meta: { ...meta, cover_status: 'failed' } }).eq('id', postId)
      return { ok: false, reason: gen.reason === 'not_configured' ? 'not_configured' : 'error' }
    }

    const url = siteId ? await uploadCover(admin, siteId, postId, gen.bytes, gen.contentType) : null
    if (!url) {
      await admin.from('posts').update({ meta: { ...meta, cover_status: 'failed' } }).eq('id', postId)
      return { ok: false, reason: 'error' }
    }

    await admin.from('posts')
      .update({ featured_image: url, meta: { ...meta, cover_status: 'done', cover_prompt: gen.prompt } })
      .eq('id', postId)
    return { ok: true, url, prompt: gen.prompt }
  } catch {
    return { ok: false, reason: 'error' }
  }
}
