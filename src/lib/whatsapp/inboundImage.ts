// A PHOTO THE OWNER SENT, TURNED INTO A COVER (server-only).
//
// Founder, 2026-09-17: "allow users to upload photos via WhatsApp. The agent must
// ask if they want to use it as a cover image, automatically upscale/adjust it for
// quality, and fit it into the article perfectly."
//
// Until now an inbound image was answered with "encara no sé escriure a partir
// d'imatges" and the media reference was filed away, which is the worst of both
// worlds: we kept their photo and did nothing with it.
//
// WHY THIS IS NOT JUST "UPLOAD THE BYTES"
// WhatsApp photos are the hardest input a blog cover ever gets:
//   · portrait. Phones shoot 3:4; a blog hero is ~3:2. A naive resize letterboxes
//     or squashes; a naive crop decapitates people. We crop with sharp's
//     attention strategy, which keeps the region with the most entropy — in
//     practice, the subject.
//   · rotated. EXIF orientation is why a photo that looked fine in the camera
//     roll arrives on its side. `rotate()` with no argument applies the EXIF
//     transform and then strips it, so no downstream viewer applies it twice.
//   · small. WhatsApp re-compresses aggressively; a forwarded photo can arrive
//     at 800px. Enlarging is normally the wrong instinct, but a cover box is
//     fixed, so the choice is between an upscale and a blurry stretch by the
//     browser. We upscale with Lanczos3 and then sharpen, which is what makes
//     the difference visible rather than theoretical.
//   · heavy. A 4 MB JPEG as a hero is a broken Core Web Vital. Out comes WebP.
//
// Every failure returns a reason instead of throwing: a photo we cannot use must
// cost the owner a nicety, never their article.

import sharp from 'sharp'
import type { createAdminClient } from '@/lib/supabase/admin'
import { downloadKapsoMedia } from './transcribe'

type Admin = ReturnType<typeof createAdminClient>

const BUCKET = 'post-media'

/** The cover box. 3:2 — the same shape the generated covers use, so a page never
 *  jumps depending on where its image came from. */
export const COVER_W = 1536
export const COVER_H = 1024

/** Refuse anything that cannot plausibly be a photo before decoding it. */
const MAX_INPUT_BYTES = 16 * 1024 * 1024
/** Below this the source is a thumbnail, not a photo, and no amount of Lanczos
 *  will make it a hero. We still use it — we just say it was small. */
const MIN_USEFUL_WIDTH = 420

export type ProcessedImage = {
  bytes: Buffer
  contentType: 'image/webp'
  width: number
  height: number
  /** True when we had to enlarge the source to fill the cover box. */
  upscaled: boolean
  /** The source's own dimensions, for an honest message back to the owner. */
  sourceWidth: number
  sourceHeight: number
}

export type ImageResult =
  | { ok: true; url: string; image: ProcessedImage }
  | { ok: false; reason: 'download' | 'decode' | 'too_small' | 'upload' | 'unsupported'; detail?: string }

/**
 * Normalise an arbitrary phone photo into a web-ready cover.
 *
 * Pure apart from sharp: takes bytes, returns bytes, so it is testable without a
 * network or a bucket.
 */
export async function processCoverImage(input: Buffer): Promise<ProcessedImage | { error: ImageResult }> {
  if (input.length > MAX_INPUT_BYTES) {
    return { error: { ok: false, reason: 'unsupported', detail: 'image too large' } }
  }
  try {
    const img = sharp(input, { failOn: 'none' })
    const meta = await img.metadata()
    const sourceWidth = meta.width ?? 0
    const sourceHeight = meta.height ?? 0
    if (!sourceWidth || !sourceHeight) {
      return { error: { ok: false, reason: 'decode', detail: 'no dimensions' } }
    }

    const upscaled = sourceWidth < COVER_W || sourceHeight < COVER_H

    const bytes = await img
      // 1. EXIF orientation applied and then dropped, so nobody applies it twice.
      .rotate()
      // 2. Fill the cover box exactly. `attention` keeps the busiest region,
      //    which on a phone photo is almost always the thing they photographed.
      //    withoutEnlargement stays FALSE on purpose: see the header note.
      .resize({
        width: COVER_W,
        height: COVER_H,
        fit: 'cover',
        position: sharp.strategy.attention,
        kernel: 'lanczos3',
        withoutEnlargement: false,
      })
      // 3. Undo the softness that either an upscale or WhatsApp's own
      //    re-compression leaves behind. Gentle: this is a photograph, not a
      //    screenshot, and over-sharpening reads as cheap.
      .sharpen({ sigma: upscaled ? 1.2 : 0.7 })
      // 4. A hero that costs 4 MB is a broken page. Quality 82 is the knee of
      //    the curve for photographic content at this size.
      .webp({ quality: 82, effort: 5 })
      .toBuffer()

    return {
      bytes,
      contentType: 'image/webp',
      width: COVER_W,
      height: COVER_H,
      upscaled,
      sourceWidth,
      sourceHeight,
    }
  } catch (e) {
    return { error: { ok: false, reason: 'decode', detail: e instanceof Error ? e.message : String(e) } }
  }
}

/** True when the source was too small for the result to be genuinely good. */
export function wasThumbnail(image: ProcessedImage): boolean {
  return image.sourceWidth < MIN_USEFUL_WIDTH
}

async function upload(admin: Admin, siteId: string, postId: string, image: ProcessedImage): Promise<string | null> {
  const path = `${siteId}/photo-${postId}-${Date.now()}.webp`
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, image.bytes, { contentType: image.contentType, cacheControl: '31536000', upsert: true })
  if (error) {
    console.error('[wa/image] upload failed:', error.message)
    return null
  }
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * The whole path: Kapso media → bytes → cover → bucket → posts.featured_image.
 *
 * `meta.cover_status = 'owner_photo'` records WHERE the cover came from, which is
 * what stops the proactive "want me to make you a cover?" nudge from pestering
 * someone who just sent one.
 */
export async function attachOwnerPhoto(
  admin: Admin,
  postId: string,
  siteId: string,
  media: { mediaId?: string | null; mediaUrl?: string | null; phoneNumberId?: string | null },
): Promise<ImageResult> {
  const downloaded = await downloadKapsoMedia({
    mediaId: media.mediaId ?? null,
    mediaUrl: media.mediaUrl ?? null,
    phoneNumberId: media.phoneNumberId ?? null,
  })
  if (!downloaded) return { ok: false, reason: 'download' }

  const processed = await processCoverImage(Buffer.from(downloaded.body))
  if ('error' in processed) return processed.error

  const url = await upload(admin, siteId, postId, processed)
  if (!url) return { ok: false, reason: 'upload' }

  try {
    const { data: post } = await admin.from('posts').select('meta').eq('id', postId).maybeSingle()
    const meta = ((post?.meta as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
    await admin.from('posts')
      .update({ featured_image: url, meta: { ...meta, cover_status: 'owner_photo' } })
      .eq('id', postId)
  } catch (e) {
    // The bytes are in the bucket and the URL is good; only the row write failed.
    return { ok: false, reason: 'upload', detail: e instanceof Error ? e.message : String(e) }
  }

  return { ok: true, url, image: processed }
}
