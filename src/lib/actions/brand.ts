'use server'

// The owner's correction to their own Brand Brain (server half of the reveal).
//
// Founder, 2026-09-17: when Carma shows what it learned, the owner must be able
// to fix it before continuing — by typing, or by talking. See lib/brand/refine.ts
// for why a typed FIELD and a free-text NOTE take different paths, and for the
// one thing a correction may never touch (the verbatim exemplars).
//
// FormData rather than a plain object because a voice note is a File, and a
// Server Action taking FormData is the only way that crosses the boundary
// without a base64 round-trip through the client.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { userCanWriteSite } from '@/lib/auth/siteAccess'
import { readBrandBrain, saveOwnerEditedBrain } from '@/lib/brand/persist'
import { applyFieldEdits, refineWithNote } from '@/lib/brand/refine'
import { transcribeAudio } from '@/lib/whatsapp/transcribe'
import type { BrandBrain } from '@/lib/brand/types'

export type RefineBrandResult =
  | { ok: true; brain: BrandBrain; acknowledgement: string | null; heard: string | null }
  | { ok: false; error: string }

/** Empty string means "the owner cleared it"; absent means "leave it alone". */
function field(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

/** Comma- or newline-separated list, trimmed and de-duplicated. */
function list(form: FormData, key: string): string[] | undefined {
  const v = field(form, key)
  if (v === undefined) return undefined
  return [...new Set(v.split(/[,\n]/).map(s => s.trim()).filter(Boolean))].slice(0, 8)
}

const MAX_AUDIO_BYTES = 12 * 1024 * 1024

export async function refineBrandProfile(form: FormData): Promise<RefineBrandResult> {
  try {
    const siteId = field(form, 'siteId')?.trim()
    if (!siteId) return { ok: false, error: 'Falta el blog' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No has iniciat sessió' }
    if (!(await userCanWriteSite(supabase, user.id, siteId))) {
      return { ok: false, error: 'No tens accés a aquest blog' }
    }

    const admin = createAdminClient()
    const current = await readBrandBrain(admin, siteId)
    if (!current) return { ok: false, error: 'Encara no tenim cap fitxa d’aquesta marca' }

    // 1 — the typed fields, verbatim. The owner is the authority here.
    let brain = applyFieldEdits(current, {
      whatTheySell: field(form, 'whatTheySell'),
      audience: field(form, 'audience'),
      descriptors: list(form, 'descriptors'),
      pillars: list(form, 'pillars'),
    })

    // 2 — a spoken note becomes a typed one. A failed transcription is not a
    //     failed save: the field edits above are already good and must land.
    let heard: string | null = null
    const audio = form.get('audio')
    if (audio instanceof File && audio.size > 0 && audio.size <= MAX_AUDIO_BYTES) {
      try {
        const bytes = new Uint8Array(await audio.arrayBuffer())
        const tr = await transcribeAudio(bytes, audio.type || 'audio/webm')
        heard = tr.text.trim() || null
      } catch {
        heard = null
      }
    }

    // 3 — the free-text correction, folded into the right fields.
    const note = [field(form, 'note')?.trim(), heard].filter(Boolean).join('\n\n')
    let acknowledgement: string | null = null
    if (note) {
      const refined = await refineWithNote(brain, note)
      brain = refined.brain
      acknowledgement = refined.acknowledgement
    }

    const saved = await saveOwnerEditedBrain(admin, siteId, brain)
    if (!saved) return { ok: false, error: 'No hem pogut desar els canvis. Torna-ho a provar.' }

    return { ok: true, brain, acknowledgement, heard }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconegut' }
  }
}
