// Brand Brain — the capture orchestrator (server-only).
//
// Takes whatever the owner gave us at onboarding and turns it into a persisted
// brand profile. Everything is optional except "at least one of them":
//
//   URL       → deep scrape (home + the pages that explain them)   → voice + facts
//   documents → PDF / DOCX / TXT / MD                              → facts
//   voice     → Whisper transcript of them describing the business → facts, first-hand
//   text      → whatever they typed                                → facts, first-hand
//
// Ordering matters in the corpus we hand the distiller. The owner's OWN words
// (voice, typed text) go first, because they are the most authoritative statement
// of what the business does. Website prose goes after, because it is the most
// authoritative sample of how they WRITE — and the distiller is told exactly that.

import { transcribeAudio } from '@/lib/whatsapp/transcribe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { scrapeBrandSite, candidateSentences } from './scrape'
import { parseDocuments } from './documents'
import { distilBrand } from './distil'
import { saveBrandBrain } from './persist'
import { emptyBrandVisual, type BrandBrain, type BrandCorpus, type BrandSource, type BrandStepId } from './types'

type Admin = ReturnType<typeof createAdminClient>

/**
 * WHAT THE LANDING DOOR ALREADY FOUND OUT.
 *
 * The visitor watched Carma read their website on the marketing page, sentence
 * by sentence, before they had an account. Then they signed up — and the first
 * version of this pipeline threw all of it away and scraped the same six pages
 * again, in front of them, behind a second progress bar.
 *
 * A seed is the fix. When it arrives, `scrapeBrandSite` is SKIPPED entirely and
 * the corpus comes from memory. What used to be six polite HTTP fetches plus a
 * model call becomes a model call — the wait goes from ~60s to ~10s, and, more
 * to the point, the product stops visibly forgetting what it just told you.
 */
export type BrandSeed = {
  /** The prose the Door already read. Its presence is what skips the scrape. */
  prose: string
  siteName: string | null
  locale: string | null
  palette: string[]
  fonts: string[]
  /** How many pages the Door actually read, for honest progress copy. */
  pages: number
}

export type BrandCaptureInput = {
  siteId: string
  siteName: string
  url?: string | null
  /** Free text the owner typed. */
  text?: string | null
  /** Voice note recorded in the browser. */
  audio?: { bytes: Uint8Array; contentType: string } | null
  documents?: File[]
  /** Hint for Whisper; the brand's own language when we already know it. */
  language?: string | null
  /** Everything the landing Door already learned. See {@link BrandSeed}. */
  seed?: BrandSeed | null
}

export type BrandCaptureReport = {
  brain: BrandBrain
  saved: boolean
  /** Human-readable note per step, for the onboarding UI. */
  notes: Partial<Record<BrandStepId, string>>
}

/** Emitted as the capture runs so the UI can narrate instead of spinning. */
export type BrandProgress = (
  step: BrandStepId,
  status: 'running' | 'done' | 'skipped',
  detail?: string,
) => void

const noop: BrandProgress = () => {}

/**
 * Run the whole capture. Best-effort by design: a failed source contributes
 * nothing and the rest proceeds. Returns null only when NO source produced any
 * usable material — the caller then keeps the owner moving rather than blocking.
 */
export async function captureBrandBrain(
  admin: Admin,
  input: BrandCaptureInput,
  onProgress: BrandProgress = noop,
): Promise<BrandCaptureReport | null> {
  const ownWords: string[] = []
  const siteProse: string[] = []
  const sources: BrandSource[] = []
  const notes: BrandCaptureReport['notes'] = {}
  let visual = emptyBrandVisual()
  let detectedLocale: string | null = null
  let siteName = input.siteName

  // ── The owner's own words first — most authoritative about WHAT they do ────
  const typed = (input.text ?? '').trim()
  if (typed) {
    ownWords.push(typed)
    sources.push({ kind: 'text', label: 'El que has escrit', chars: typed.length })
  }

  // ── Voice ──────────────────────────────────────────────────────────────────
  if (input.audio && input.audio.bytes.byteLength > 0) {
    onProgress('voice', 'running')
    try {
      const { text } = await transcribeAudio(input.audio.bytes, input.audio.contentType, {
        language: input.language ?? undefined,
      })
      const clean = text.trim()
      if (clean.length > 20) {
        ownWords.push(clean)
        sources.push({ kind: 'voice', label: 'La teva nota de veu', chars: clean.length })
        notes.voice = `${clean.split(/\s+/).length} paraules transcrites`
        onProgress('voice', 'done', notes.voice)
      } else {
        onProgress('voice', 'skipped', 'no s’ha entès prou bé')
      }
    } catch (e) {
      console.error('[brand/capture] transcription failed:', e instanceof Error ? e.message : e)
      onProgress('voice', 'skipped', 'no s’ha pogut transcriure')
    }
  } else {
    onProgress('voice', 'skipped')
  }

  // ── Documents ──────────────────────────────────────────────────────────────
  const files = input.documents ?? []
  if (files.length > 0) {
    onProgress('documents', 'running', `${files.length} fitxer${files.length > 1 ? 's' : ''}`)
    const parsed = await parseDocuments(files)
    for (const d of parsed) {
      ownWords.push(d.text)
      sources.push(d.source)
    }
    const skipped = files.length - parsed.length
    notes.documents = parsed.length
      ? `${parsed.length} llegit${parsed.length > 1 ? 's' : ''}${skipped ? ` · ${skipped} sense text` : ''}`
      : 'cap document llegible'
    onProgress('documents', parsed.length ? 'done' : 'skipped', notes.documents)
  } else {
    onProgress('documents', 'skipped')
  }

  // ── Website ────────────────────────────────────────────────────────────────
  const url = (input.url ?? '').trim()
  const seed = input.seed

  if (seed?.prose?.trim()) {
    // REMEMBERED, not re-read. The Door already did this work while the visitor
    // watched; doing it twice is the bug, not the thoroughness.
    onProgress('read', 'running', 'des del que ja hem llegit')
    siteProse.push(seed.prose)
    sources.push({
      kind: 'url',
      label: seed.siteName || url || 'la teva web',
      chars: seed.prose.length,
    })
    if (seed.palette.length || seed.fonts.length) {
      visual = { ...visual, colors: seed.palette, fonts: seed.fonts }
    }
    detectedLocale = seed.locale
    if (seed.siteName && !siteName) siteName = seed.siteName
    notes.read = seed.pages > 0
      ? `${seed.pages} pàgines, ja llegides`
      : 'ja llegit'
    onProgress('read', 'done', notes.read)
  } else if (url) {
    onProgress('read', 'running')
    const scraped = await scrapeBrandSite(url)
    if (scraped.pages.length > 0) {
      for (const page of scraped.pages) siteProse.push(page.text)
      sources.push(...scraped.sources)
      visual = scraped.visual
      detectedLocale = scraped.detectedLocale
      if (scraped.siteName && !siteName) siteName = scraped.siteName
      notes.read = `${scraped.pages.length} pàgin${scraped.pages.length > 1 ? 'es' : 'a'} llegid${scraped.pages.length > 1 ? 'es' : 'a'}`
      onProgress('read', 'done', notes.read)
    } else {
      notes.read = 'no hem pogut llegir la web'
      onProgress('read', 'skipped', notes.read)
    }
  } else {
    onProgress('read', 'skipped')
  }

  // ── Distil ─────────────────────────────────────────────────────────────────
  // Candidate exemplars come from the WEBSITE prose only. A voice transcript is
  // speech, and a brand does not write the way it talks — quoting a transcript
  // back as a writing sample would teach the agent the wrong register entirely.
  const candidates = candidateSentences(siteProse.join('\n'))

  const corpus: BrandCorpus = {
    siteName,
    originUrl: url || null,
    text: [
      ownWords.length ? `WHAT THE OWNER SAYS ABOUT THE BUSINESS:\n${ownWords.join('\n\n')}` : '',
      siteProse.length ? `THEIR WEBSITE (use this for VOICE):\n${siteProse.join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n'),
    candidateSentences: candidates,
    visual,
    sources,
    detectedLocale,
  }

  if (!corpus.text.trim()) return null

  onProgress('distil', 'running')
  const distilled = await distilBrand(corpus)
  if (!distilled) {
    onProgress('distil', 'skipped', 'no hi havia prou material')
    return null
  }
  notes.distil = distilled.brain.voice.exemplars.length
    ? `${distilled.brain.voice.exemplars.length} frases teves memoritzades`
    : 'perfil bàsic'
  onProgress('distil', 'done', notes.distil)

  // ── Save ───────────────────────────────────────────────────────────────────
  onProgress('save', 'running')
  const saved = await saveBrandBrain(admin, input.siteId, distilled)
  onProgress('save', saved ? 'done' : 'skipped', saved ? undefined : 'no s’ha pogut desar')

  return { brain: distilled.brain, saved, notes }
}

/** True when there is at least one source worth running a capture for. */
export function hasBrandInput(input: Partial<BrandCaptureInput>): boolean {
  return Boolean(
    (input.url ?? '').trim() ||
    (input.text ?? '').trim() ||
    (input.seed?.prose ?? '').trim() ||
    (input.audio && input.audio.bytes.byteLength > 0) ||
    (input.documents && input.documents.length > 0),
  )
}
