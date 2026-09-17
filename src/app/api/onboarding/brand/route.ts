import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidHttpUrl, isSafeUrl } from '@/lib/scrape/http'
import { isAcceptedDocument } from '@/lib/brand/documents'
import { captureBrandBrain, hasBrandInput, type BrandSeed } from '@/lib/brand/capture'
import {
  brandStepFloor, brandStepWeight, type BrandEvent, type BrandStepId,
} from '@/lib/brand/types'

// node-html-parser, pdf-parse and mammoth all need the Node runtime.
// A capture does up to 6 polite page fetches + document parsing + Whisper + one
// LLM pass, so it needs room; 120s is comfortably above the observed worst case.
export const maxDuration = 120

// Caps. The owner is uploading their own brand material, not a dataset.
const MAX_FILES = 6
const MAX_TEXT_CHARS = 4_000
const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // Whisper's own upload limit

function sse(event: BrandEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/**
 * Build the Brand Brain from whatever the owner gave us, streaming progress.
 *
 * Multipart rather than JSON because this is the one endpoint that takes files and
 * audio. SSE rather than a plain POST because the capture takes 20–60s and a
 * silent spinner for a minute is exactly the "loading screens last too long"
 * problem the rest of this overhaul removed.
 *
 * Auth: the caller must be a MEMBER of the site (unlike /api/theme/analyze, which
 * binds to no site and writes nothing — this one writes the site's brand profile).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Formulari invàlid' }, { status: 400 })
  }

  const siteId = String(form.get('siteId') ?? '').trim()
  if (!siteId) return NextResponse.json({ error: 'Falta el lloc' }, { status: 400 })

  // Membership gate. Superadmins pass; everyone else must be on site_users.
  const admin = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if ((profile as { role?: string } | null)?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users').select('user_id').eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Accés denegat' }, { status: 403 })
  }

  // ── Inputs, all optional but at least one required ────────────────────────
  const rawUrl = String(form.get('url') ?? '').trim()
  const url = rawUrl && isValidHttpUrl(rawUrl) && isSafeUrl(rawUrl) ? rawUrl : ''
  const text = String(form.get('text') ?? '').trim().slice(0, MAX_TEXT_CHARS)
  const language = String(form.get('language') ?? '').trim().slice(0, 5) || null

  const documents = form.getAll('documents')
    .filter((f): f is File => f instanceof File)
    .filter(isAcceptedDocument)
    .slice(0, MAX_FILES)

  let audio: { bytes: Uint8Array; contentType: string } | null = null
  const audioFile = form.get('audio')
  if (audioFile instanceof File && audioFile.size > 0 && audioFile.size <= MAX_AUDIO_BYTES) {
    audio = {
      bytes: new Uint8Array(await audioFile.arrayBuffer()),
      contentType: audioFile.type || 'audio/webm',
    }
  }

  // What the landing Door already read. Its presence skips the re-scrape — see
  // BrandSeed in lib/brand/capture.ts for why that was the bug and not an
  // optimisation. Parsed defensively: it arrives from the browser, so every
  // field is coerced and the prose is re-capped server-side.
  let seed: BrandSeed | null = null
  const rawSeed = String(form.get('seed') ?? '').trim()
  if (rawSeed) {
    try {
      const o = JSON.parse(rawSeed) as Record<string, unknown>
      const prose = typeof o.prose === 'string' ? o.prose.slice(0, 40_000) : ''
      if (prose.trim().length > 200) {
        seed = {
          prose,
          siteName: typeof o.siteName === 'string' ? o.siteName.slice(0, 160) : null,
          locale: typeof o.locale === 'string' ? o.locale.slice(0, 5) : null,
          palette: Array.isArray(o.palette) ? o.palette.filter(x => typeof x === 'string').slice(0, 6) as string[] : [],
          fonts: Array.isArray(o.fonts) ? o.fonts.filter(x => typeof x === 'string').slice(0, 3) as string[] : [],
          pages: Number.isFinite(o.pages) ? Math.max(0, Math.min(20, Number(o.pages))) : 0,
        }
      }
    } catch { /* a malformed seed simply means we read the site ourselves */ }
  }

  const input = { siteId, siteName: String(form.get('siteName') ?? '').trim(), url, text, audio, documents, language, seed }
  if (!hasBrandInput(input)) {
    return NextResponse.json({ error: 'Cal com a mínim una web, un document, una nota de veu o una descripció.' }, { status: 400 })
  }

  // The site's origin_url is worth recording even when the capture later fails —
  // it is what the clone pipeline and the agent's site context both read.
  if (url) {
    try { await admin.from('sites').update({ origin_url: url }).eq('id', siteId) } catch { /* best-effort */ }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: BrandEvent) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(sse(event))) } catch { closed = true }
      }
      const progress = (step: BrandStepId, status: 'running' | 'done' | 'skipped', detail?: string) => {
        const pct = status === 'running'
          ? brandStepFloor(step)
          : brandStepFloor(step) + brandStepWeight(step)
        send({ type: 'progress', step, status, pct, detail })
      }

      try {
        const report = await captureBrandBrain(admin, input, progress)
        if (!report) {
          send({ type: 'error', error: 'No hem trobat prou material per entendre la marca.' })
        } else {
          send({ type: 'result', brain: report.brain })
        }
      } catch (e) {
        console.error('[api/onboarding/brand] capture failed:', e instanceof Error ? e.message : e)
        send({ type: 'error', error: 'No hem pogut completar l’anàlisi. Pots continuar i fer-ho més tard.' })
      } finally {
        closed = true
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Proxies that buffer would defeat the point of streaming progress.
      'X-Accel-Buffering': 'no',
    },
  })
}
