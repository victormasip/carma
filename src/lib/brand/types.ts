// Brand Brain — the shape of what we learn about a brand at onboarding.
//
// WHY THIS EXISTS (audit 2026-09-16)
// ──────────────────────────────────
// `site_brain_profiles` (migration 030) already fed the WhatsApp agent a brand
// profile — but it was distilled OFFLINE FROM ALREADY-PUBLISHED ARTICLES, and
// classified `seed` below WA_PROFILE_MIN_POSTS. So a brand-new owner's agent knew
// almost nothing about them on turn one, which is exactly when it matters most:
// the first article is the one that decides whether they believe the product.
//
// The Brand Brain fills that gap at ONBOARDING, from whatever the owner gives us:
// their website, documents they drop in, or thirty seconds of talking.

import type { Locale } from '@/lib/i18n/config'

/** Where one piece of evidence came from — kept so the profile is auditable. */
export type BrandSourceKind = 'url' | 'document' | 'voice' | 'text'

export type BrandSource = {
  kind: BrandSourceKind
  /** Page URL, file name, or a short label for a voice note. */
  label: string
  /** Characters of usable text this source contributed. */
  chars: number
}

export type BrandIdentity = {
  /** The brand as it calls itself, not the domain. */
  name: string | null
  tagline: string | null
  /** What they ACTUALLY sell, in one sentence. The single most useful field for
   *  stopping the writer from producing generic industry filler. */
  whatTheySell: string | null
  /** Concrete proof they use: years in business, certifications, numbers, awards. */
  proofPoints: string[]
}

export type BrandAudience = {
  who: string | null
  /** The register THEY use with that audience — tu/vostè, formal/informal. */
  register: string | null
  /** The problems the audience is paying to solve. Drives article angles. */
  problems: string[]
}

export type BrandVoice = {
  descriptors: string[]
  register: string | null
  /** Words and phrases this brand never uses. Enforced as a hard rule downstream. */
  bannedWords: string[]
  /** 'short' | 'medium' | 'long' — how they actually write, not how they'd describe it. */
  sentenceLength: string | null
  emojiPolicy: string | null
  /**
   * THE HIGHEST-LEVERAGE FIELD IN THE WHOLE PLAN.
   *
   * 3–5 sentences copied VERBATIM from the brand's own material. Few-shot
   * exemplars in their own words beat any quantity of adjectives for making
   * generated prose sound like them — "warm and professional" describes a
   * thousand brands; one of their real sentences describes exactly one.
   *
   * Must be quoted exactly. If the distiller paraphrases, the value is gone.
   */
  exemplars: string[]
}

export type BrandPillar = {
  name: string
  keywords: string[]
  /** 'covered' | 'thin' | 'gap' — where the blog already is on this theme. */
  coverage?: string | null
}

export type BrandVisual = {
  fonts: string[]
  colors: string[]
  logoUrl: string | null
  imageryStyle: string | null
}

export type BrandConstraints = {
  /** Claims they must never make — regulated language, guarantees, superlatives. */
  neverClaim: string[]
}

export type BrandBrain = {
  identity: BrandIdentity
  audience: BrandAudience
  voice: BrandVoice
  pillars: BrandPillar[]
  visual: BrandVisual
  constraints: BrandConstraints
  /** The language the brand writes in — drives the article locale. */
  locale: Locale | null
  sources: BrandSource[]
  capturedAt: string
}

/** Raw material handed to the distiller, before any LLM sees it. */
export type BrandCorpus = {
  siteName: string
  originUrl: string | null
  /** Concatenated, de-duplicated prose from every source. */
  text: string
  /** Candidate verbatim sentences, pre-extracted so the LLM only has to CHOOSE. */
  candidateSentences: string[]
  visual: BrandVisual
  sources: BrandSource[]
  /** Detected from the source markup (`<html lang>` / og:locale), when available. */
  detectedLocale: string | null
}

/** Progress events streamed to the onboarding UI while the Brain is built. */
export type BrandStepId = 'read' | 'documents' | 'voice' | 'distil' | 'save'

export type BrandEvent =
  | { type: 'progress'; step: BrandStepId; status: 'running' | 'done' | 'skipped'; pct: number; detail?: string }
  | { type: 'error'; step?: BrandStepId; error: string }
  | { type: 'result'; brain: BrandBrain }

export const BRAND_STEPS: { id: BrandStepId; label: string; weight: number }[] = [
  { id: 'read', label: 'Llegint la teva web', weight: 40 },
  { id: 'documents', label: 'Llegint els teus documents', weight: 15 },
  { id: 'voice', label: 'Escoltant-te', weight: 10 },
  { id: 'distil', label: 'Entenent la teva marca', weight: 30 },
  { id: 'save', label: 'Ensenyant-ho a l’agent', weight: 5 },
]

export function brandStepFloor(id: BrandStepId): number {
  let acc = 0
  for (const s of BRAND_STEPS) {
    if (s.id === id) return acc
    acc += s.weight
  }
  return acc
}

export function brandStepWeight(id: BrandStepId): number {
  return BRAND_STEPS.find(s => s.id === id)?.weight ?? 0
}

export function emptyBrandVisual(): BrandVisual {
  return { fonts: [], colors: [], logoUrl: null, imageryStyle: null }
}
