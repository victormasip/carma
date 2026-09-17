import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { isValidHttpUrl, isSafeUrl } from '@/lib/scrape/http'
import { scrapeBrandSite, candidateSentences } from '@/lib/brand/scrape'
import { parseDocuments, isAcceptedDocument } from '@/lib/brand/documents'
import { transcribeAudio } from '@/lib/whatsapp/transcribe'
import { synthesiseBrand } from '@/lib/onboarding/synthesis'
import {
  glimpseFloor, glimpseWeight, pickQuotes, CARRY_PROSE_CAP,
  type GlimpseEvent, type GlimpseResult, type GlimpseStep,
} from '@/lib/onboarding/glimpse'

// node-html-parser, pdf-parse and mammoth all need the Node runtime. A glimpse is
// at most 6 polite page fetches plus document parsing, so it is far cheaper than
// the authenticated capture — but a slow origin can still take a while.
export const maxDuration = 60

/**
 * THE GLIMPSE — the landing Door's public, logged-out capture.
 *
 * Reads the visitor's real site (and any document or voice note they drop on the
 * landing) and streams back what it actually found: pages read, real palette and
 * typefaces, and two of their own sentences, verbatim. No model is called and
 * nothing is written to the database — see lib/onboarding/glimpse.ts for why
 * that is the honest design rather than a shortcut.
 *
 * THREAT MODEL. This is an unauthenticated endpoint that makes outbound fetches
 * on behalf of a stranger, so it is bounded on every axis:
 *
 *   · SSRF — every fetch goes through `isSafeUrl` + `safeFetch` (the guard
 *     hardened in the 2026-06-06 backend audit), which is the same door the
 *     authenticated import routes use.
 *   · Rate — three independent budgets per IP (below). The expensive inputs get
 *     the tightest ones: a scrape is 6 fetches, a transcript is a paid API call.
 *   · Cost — no LLM, ever. The only paid call on this route is Whisper, and it
 *     is capped at two per hour per IP and 60 seconds of audio.
 *   · Data — nothing is persisted. The result exists only in the response
 *     stream; what crosses into signup is carried by the browser, not by us.
 */

const MAX_FILES = 3
const MAX_TEXT_CHARS = 2_000
const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const HOUR = 60 * 60 * 1000

function sse(event: GlimpseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/** A one-shot error as a real HTTP status (the stream hasn't started yet). */
function fail(error: string, code: 'rate' | 'input' | 'unreadable', status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request)

  // Budget 1 — the route as a whole. Generous: a curious visitor who pastes,
  // reconsiders and pastes again is not an attacker.
  if (!rateLimit(`glimpse:${ip}`, 12, HOUR).ok) {
    return fail('Massa intents. Torna-ho a provar d’aquí una estona.', 'rate', 429)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail('Formulari invàlid', 'input', 400)
  }

  const rawUrl = String(form.get('url') ?? '').trim()
  const url = rawUrl && isValidHttpUrl(rawUrl) && isSafeUrl(rawUrl) ? rawUrl : ''
  const typed = String(form.get('text') ?? '').trim().slice(0, MAX_TEXT_CHARS)

  const documents = form.getAll('documents')
    .filter((f): f is File => f instanceof File)
    .filter(isAcceptedDocument)
    .slice(0, MAX_FILES)

  let audio: { bytes: Uint8Array; contentType: string } | null = null
  const audioFile = form.get('audio')
  if (audioFile instanceof File && audioFile.size > 0 && audioFile.size <= MAX_AUDIO_BYTES) {
    audio = { bytes: new Uint8Array(await audioFile.arrayBuffer()), contentType: audioFile.type || 'audio/webm' }
  }

  if (!url && !typed && documents.length === 0 && !audio) {
    return fail('Cal una web, un document, una nota de veu o una descripció.', 'input', 400)
  }

  // Budget 2 — the scrape. Six outbound fetches against a third party.
  if (url && !rateLimit(`glimpse:scrape:${ip}`, 6, HOUR).ok) {
    return fail('Massa webs seguides. Torna-ho a provar d’aquí una estona.', 'rate', 429)
  }
  // Budget 3 — Whisper.
  if (audio && !rateLimit(`glimpse:voice:${ip}`, 2, HOUR).ok) {
    return fail('Massa notes de veu seguides. Prova-ho d’aquí una estona.', 'rate', 429)
  }
  // Budget 4 — the synthesis (Brand Brain 2.0). The one unbounded-cost call on a
  // public endpoint, so it gets the tightest budget of the four AND, unlike the
  // others, running out of it does not fail the request: the visitor still gets
  // the full deterministic reveal, just without the pitches. A paywall on a
  // marketing page would be absurd; a quiet ceiling is not.
  const synthesisAllowed = rateLimit(`glimpse:think:${ip}`, 4, HOUR).ok

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: GlimpseEvent) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(sse(event))) } catch { closed = true }
      }
      const progress = (step: GlimpseStep, status: 'running' | 'done' | 'skipped', detail?: string) => {
        const pct = status === 'running' ? glimpseFloor(step) : glimpseFloor(step) + glimpseWeight(step)
        send({ type: 'progress', step, status, pct, detail })
      }

      const result: GlimpseResult = {
        siteName: null, pages: 0, quotes: [], palette: [], fonts: [], locale: null,
        docs: [], heard: null, synthesis: null, prose: '',
      }
      // Everything readable, kept for the synthesis pass at the end.
      let corpus = ''

      try {
        // ── Their website ────────────────────────────────────────────────────
        if (url) {
          progress('read', 'running')
          const scraped = await scrapeBrandSite(url)
          if (scraped.pages.length > 0) {
            result.pages = scraped.pages.length
            result.siteName = scraped.siteName
            result.locale = scraped.detectedLocale
            result.palette = scraped.visual.colors.slice(0, 6)
            result.fonts = scraped.visual.fonts.slice(0, 3)

            const prose = scraped.pages.map(p => p.text).join('\n')
            corpus = prose
            const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'la teva web' } })()
            result.quotes = pickQuotes(candidateSentences(prose)).map(text => ({ text, from: host }))

            progress('read', 'done', `${scraped.pages.length} pàgines`)
          } else {
            progress('read', 'skipped', 'no s’ha pogut llegir')
          }
        } else {
          progress('read', 'skipped')
        }

        // ── Documents they dropped ───────────────────────────────────────────
        if (documents.length > 0) {
          progress('documents', 'running', `${documents.length}`)
          const parsed = await parseDocuments(documents)
          result.docs = parsed.map(d => ({
            name: d.source.label,
            words: d.text.trim().split(/\s+/).filter(Boolean).length,
          }))
          const docText = parsed.map(d => d.text).join('\n')
          corpus = corpus ? `${corpus}\n\n${docText}` : docText
          // A document is a voice source too — if the site gave us nothing to
          // quote, quote the document instead. Same extractor, same honesty.
          if (result.quotes.length === 0 && parsed.length > 0) {
            result.quotes = pickQuotes(candidateSentences(docText))
              .map(text => ({ text, from: parsed[0]!.source.label }))
          }
          progress('documents', parsed.length ? 'done' : 'skipped', `${parsed.length} llegits`)
        } else {
          progress('documents', 'skipped')
        }

        // ── What they said ───────────────────────────────────────────────────
        if (audio) {
          progress('voice', 'running')
          try {
            const { text } = await transcribeAudio(audio.bytes, audio.contentType, {
              language: result.locale ?? undefined,
            })
            const clean = text.trim()
            if (clean.length > 15) {
              result.heard = clean.slice(0, 600)
              progress('voice', 'done', `${clean.split(/\s+/).length} paraules`)
            } else {
              progress('voice', 'skipped', 'no s’ha entès prou bé')
            }
          } catch (e) {
            console.error('[glimpse] transcription failed:', e instanceof Error ? e.message : e)
            progress('voice', 'skipped', 'no s’ha pogut transcriure')
          }
        } else {
          progress('voice', 'skipped')
        }

        // ── What we understood, and what they should write ───────────────────
        // The only paid-inference call on this route. Budget 4 (below) is what
        // stops a public endpoint turning into an unbounded bill, and every
        // failure path here degrades to `synthesis: null` — the reveal is built
        // to be worth reading without it.
        if (typed) corpus = corpus ? `${corpus}\n\n${typed}` : typed
        if (result.heard) corpus = corpus ? `${corpus}\n\n${result.heard}` : result.heard

        if (corpus.trim().length >= 400 && synthesisAllowed) {
          progress('think', 'running')
          const synthesis = await synthesiseBrand({
            siteName: result.siteName,
            url: url || null,
            locale: result.locale,
            prose: corpus,
          })
          result.synthesis = synthesis
          progress(
            'think',
            synthesis ? 'done' : 'skipped',
            synthesis ? `${synthesis.pitches.length} idees` : undefined,
          )
        } else {
          progress('think', 'skipped')
        }

        // Hand the corpus back so onboarding never has to fetch it again.
        result.prose = corpus.slice(0, CARRY_PROSE_CAP)

        progress('listen', 'running')
        // Nothing found anywhere is a real outcome, not an exception: the Door
        // shows a plain "this one won't let me read it" and keeps the funnel
        // moving, instead of pretending it learned something.
        if (result.pages === 0 && result.docs.length === 0 && !result.heard && !typed) {
          send({ type: 'error', error: 'unreadable', code: 'unreadable' })
        } else {
          progress('listen', 'done')
          send({ type: 'result', result })
        }
      } catch (e) {
        console.error('[api/onboarding/glimpse] failed:', e instanceof Error ? e.message : e)
        send({ type: 'error', error: 'unreadable', code: 'unreadable' })
      } finally {
        closed = true
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
