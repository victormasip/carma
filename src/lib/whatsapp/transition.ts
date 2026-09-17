// WhatsApp Agent — held-action transition table (§2.6 / E-14, pure + import-safe).
//
// Whether a held pending_action RESUMES or is DROPPED is a correctness call the WORKER
// makes deterministically — never delegated to mini via prose. Given the held action
// and the freshly-routed turn, this returns the decision; the worker acts on it.

import type { RouterResult } from './brain'
import type { WaPendingAction } from './types'

export type HeldDecision =
  | { action: 'resume'; pickIndex: number | null }
  | { action: 'drop' }

// Accent-fold before matching — a JS \b treats accented letters as non-word, so
// "sí," would never match `s[íi]\b`. Fold to ASCII first, then boundary logic works.
const foldLower = (s: string): string => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const YES = /^(si|yes|ok|d'?acord|vale|exacte|es aixo|aixo mateix|correcte|dale|endavant)\b/
const NO = /^(no|nope|que va|per res|negatiu)\b/
const isYes = (raw: string): boolean => YES.test(foldLower(raw)) || raw.trim().startsWith('👍')
const isNo = (raw: string): boolean => NO.test(foldLower(raw)) || raw.trim().startsWith('❌')

/** First standalone 1–2 digit number in the text (a numbered pick), else null. */
export function firstPick(s: string): number | null {
  const m = s.trim().match(/\b(\d{1,2})\b/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null
}

/**
 * The transition table (§2.6). Resume conditions per held `missing`:
 *   · site               → a site_index pick (the router carries it)
 *   · target_post        → a numbered pick (a fresh target hint instead ⇒ drop, and the
 *                          edit executor re-resolves from scratch)
 *   · confirm_transcript → an explicit yes; a fresh audio = a NEW brief (drop); text = drop
 *   · confirm_theme      → an explicit yes
 * Anything else drops the held action and starts the new intent.
 */
export function resolveHeldAction(
  held: WaPendingAction,
  route: RouterResult,
  inboundText: string,
  usedAudio: boolean,
): HeldDecision {
  const text = inboundText.trim()
  switch (held.missing) {
    case 'site':
      return route.siteIndex != null ? { action: 'resume', pickIndex: route.siteIndex } : { action: 'drop' }
    case 'target_post': {
      const pick = firstPick(text)
      return pick != null ? { action: 'resume', pickIndex: pick } : { action: 'drop' }
    }
    case 'confirm_transcript':
      // A fresh audio is a NEW brief, not a confirmation.
      if (usedAudio) return { action: 'drop' }
      if (isYes(text)) return { action: 'resume', pickIndex: null }
      return { action: 'drop' }
    case 'confirm_theme':
      if (isYes(text)) return { action: 'resume', pickIndex: null }
      if (isNo(text)) return { action: 'drop' }
      return { action: 'drop' }
    default:
      return { action: 'drop' }
  }
}
