// IMAGES — the owner's own photo, and the cover they never had to ask for.
//
// Founder, 2026-09-17: "allow users to upload photos via WhatsApp. The agent must
// ask if they want to use it as a cover image, automatically upscale/adjust it for
// quality, and fit it into the article perfectly. If no image is provided,
// proactively suggest generating one after publishing."
//
// Three entry points, and they are deliberately different weights:
//
//   offerPhotoAsCover     a draft is on the table and a photo just arrived → ASK,
//                         with buttons. Zero LLM, zero punts.
//   holdPhotoForNextIdea  no draft yet → keep it and ask what it is about. The
//                         photo almost always arrives a beat before the idea.
//   attachHeldPhoto       an article now exists → download, normalise, attach.
//
// Nothing here spends punts: the owner's own photograph is not an AI cost, and
// charging for it would be charging for storage. Generating one, which is a real
// provider bill, still goes through the existing cover_image spend.

import { WA_PENDING_IMAGE_TTL_HOURS } from '../config'
import { WA_BUTTON, WA_TABLES, type WaAgentState } from '../types'
import { attachOwnerPhoto, wasThumbnail } from '../inboundImage'
import { sendWhatsApp, sendWhatsAppButtons } from '../kapso'
import { logOutbound, type Admin, type ExecutorCtx } from './shared'

type PhotoTurn = {
  admin: Admin
  threadId: string
  phone: string
  pnid?: string
  state: WaAgentState
  turnCount: number
}

/** A held photo is only a promise while its media reference still resolves. */
export function heldPhotoIsFresh(state: WaAgentState): boolean {
  const held = state.pending_image
  if (!held?.at) return false
  const age = Date.now() - new Date(held.at).getTime()
  return Number.isFinite(age) && age < WA_PENDING_IMAGE_TTL_HOURS * 3_600_000
}

async function persist({ admin, threadId, state, turnCount }: PhotoTurn): Promise<void> {
  await admin.from(WA_TABLES.threads)
    .update({ turn_count: turnCount + 1, agent_state: { ...state } })
    .eq('id', threadId)
}

/** A draft is waiting and a photo landed: ask, do not assume. */
export async function offerPhotoAsCover(turn: PhotoTurn): Promise<void> {
  const body = 'Quina foto! 📸 La vols de portada de l’article?'
  const ok = await sendWhatsAppButtons(
    turn.phone,
    body,
    [
      { id: WA_BUTTON.photoCover, title: '🖼️ Sí, de portada' },
      { id: WA_BUTTON.photoSkip, title: 'Deixa-la estar' },
    ],
    turn.pnid,
  )
  const sent = ok || (await sendWhatsApp(turn.phone, `${body}\n\nRespon «sí» i te la poso.`, turn.pnid))
  if (sent) await logOutbound(turn.admin, turn.threadId, body)
  await persist(turn)
}

/** No article to put it on yet: hold it, and ask for the half that is missing. */
export async function holdPhotoForNextIdea(turn: PhotoTurn): Promise<void> {
  const body =
    'Me la quedo 📸 Ara explica’m de què va l’article — escrit o amb un àudio — i te la poso de portada.'
  const sent = await sendWhatsApp(turn.phone, body, turn.pnid)
  if (sent) await logOutbound(turn.admin, turn.threadId, body)
  await persist(turn)
}

export type AttachOutcome = { ok: true; url: string; note: string | null } | { ok: false; note: string }

/**
 * Put the held photo on a post. Clears the hold either way — a photo that failed
 * to attach must not linger and get silently reused on the next article.
 */
export async function attachHeldPhoto(
  admin: Admin,
  state: WaAgentState,
  postId: string,
  siteId: string,
): Promise<AttachOutcome | null> {
  const held = state.pending_image
  if (!held) return null
  if (!heldPhotoIsFresh(state)) {
    state.pending_image = undefined
    return { ok: false, note: 'La foto que m’havies enviat ja ha caducat 😕 Torna-me-la a enviar i te la poso.' }
  }

  const res = await attachOwnerPhoto(admin, postId, siteId, {
    mediaId: held.media_id,
    mediaUrl: held.media_url,
    phoneNumberId: held.phone_number_id,
  })
  state.pending_image = undefined

  if (!res.ok) {
    const note =
      res.reason === 'download' ? 'No he pogut recuperar la foto 😕 Torna-me-la a enviar quan vulguis.'
      : res.reason === 'decode' || res.reason === 'unsupported' ? 'Aquesta foto no l’he sabut llegir 😕 Prova amb una altra.'
      : 'No he pogut desar la foto 😕 Torna-ho a provar d’aquí un moment.'
    return { ok: false, note }
  }

  // Be honest about a thumbnail. Enlarging a 300px photo into a 1536px hero is
  // the right call — the box is fixed either way — but the owner deserves to
  // know why it looks soft, and to have the chance to send the original.
  const note = wasThumbnail(res.image)
    ? 'Era una mica petita, així que l’he ampliada i afinada. Si tens l’original, encara quedarà millor.'
    : res.image.upscaled
      ? 'L’he ampliada i retallada a mida de portada.'
      : 'L’he retallada i optimitzada a mida de portada.'
  return { ok: true, url: res.url, note }
}

/**
 * The post-publish offer (founder: "if no image is provided, proactively suggest
 * generating one after publishing").
 *
 * Returns the buttons message when it is worth asking, or null when it is not —
 * the article already has a cover, or we have asked about this one before.
 */
export async function offerGeneratedCover(ctx: ExecutorCtx, postId: string): Promise<boolean> {
  if (ctx.state.cover_offered_for === postId) return false
  try {
    const { data } = await ctx.admin.from('posts').select('featured_image').eq('id', postId).maybeSingle()
    if (data?.featured_image) return false
  } catch {
    return false
  }

  const body = 'Li falta la foto de portada. Vols que te’n prepari una? 🎨'
  const ok = await sendWhatsAppButtons(
    ctx.phone,
    body,
    [
      { id: WA_BUTTON.coverYes, title: '🎨 Sí, fes-me-la' },
      { id: WA_BUTTON.coverNo, title: 'Així està bé' },
    ],
    ctx.pnid,
  )
  if (!ok) return false
  await logOutbound(ctx.admin, ctx.t.id, body)
  ctx.state.cover_offered_for = postId
  return true
}
