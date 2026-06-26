// WhatsApp Agent — voice-note download + transcription (T3, server-only).
//
// Provider pivot (founder directive 2026-06-26): Twilio → Kapso. Two steps the
// worker (T4) calls when an inbound message is audio:
//   1. downloadKapsoMedia — pull the voice-note bytes off Kapso. Kapso mirrors
//      inbound media to a Kapso-hosted URL (message.kapso.media_url, passed through
//      the job); if that isn't present we resolve it from the Meta media id via
//      Kapso's media endpoint. Either way the bytes are fetched through our hardened
//      safeFetchBinary (SSRF-guarded, byte-capped, redirect-safe — no Twilio Basic-
//      auth / S3 redirect dance anymore).
//   2. transcribeAudio — OpenAI Whisper (whisper-1) → plain text (unchanged).
//
// Provider: OpenAI for transcription (founder directive). The dashboard's article
// generation stays on Anthropic Opus 4.8.

import OpenAI, { toFile } from 'openai'
import { safeFetchBinary } from '@/lib/scrape/http'
import { KAPSO_API_BASE, KAPSO_GRAPH_VERSION } from './config'

// whisper-1 is the directed model; overridable per the project's env convention.
const TRANSCRIBE_MODEL = process.env.WA_TRANSCRIBE_MODEL || 'whisper-1'

// OpenAI Whisper's hard upload limit is 25 MB; cap the download at the same bound.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

function kapsoApiKey(): string | null {
  return process.env.KAPSO_API_KEY || null
}

// The X-API-Key header authenticates Kapso-hosted media. safeFetchBinary sends it on
// the FIRST hop only and DROPS it across redirects, so the key never leaks to a CDN /
// signed-storage URL Kapso may redirect to. (Harmless if a non-Kapso CDN ignores it.)
function kapsoMediaHeaders(): Record<string, string> | undefined {
  const key = kapsoApiKey()
  return key ? { 'X-API-Key': key } : undefined
}

export type DownloadedMedia = { body: Uint8Array; contentType: string }

type KapsoMediaRef = {
  /** Meta media id (message.<type>.id) — used to resolve a fresh URL if needed. */
  mediaId: string | null
  /** The phone number id the message arrived on (Kapso proxy routing). */
  phoneNumberId: string | null
  /** Kapso-mirrored media URL from the webhook (message.kapso.media_url), if present. */
  mediaUrl: string | null
}

// Ask Kapso's Meta-compatible media endpoint to resolve a media id → a download URL.
// Returns null on any failure (the worker treats a null download as transient → retry).
async function resolveMediaUrl(mediaId: string, phoneNumberId: string | null): Promise<string | null> {
  const key = kapsoApiKey()
  if (!key) return null
  const qs = phoneNumberId ? `?phone_number_id=${encodeURIComponent(phoneNumberId)}` : ''
  const url = `${KAPSO_API_BASE}/${KAPSO_GRAPH_VERSION}/${encodeURIComponent(mediaId)}${qs}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(url, { headers: { 'X-API-Key': key }, signal: ctrl.signal })
    if (!res.ok) {
      console.error('[wa/kapso] media resolve failed', res.status)
      return null
    }
    const json = (await res.json()) as { url?: unknown }
    return typeof json.url === 'string' ? json.url : null
  } catch (e) {
    console.error('[wa/kapso] media resolve error', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Download an inbound WhatsApp voice note via Kapso. Prefers the mirrored URL from
 * the webhook; falls back to resolving the media id. Returns null on any failure
 * (blocked host, oversize, network) — the worker turns a null into a retryable error.
 */
export async function downloadKapsoMedia(ref: KapsoMediaRef): Promise<DownloadedMedia | null> {
  // The URLs Kapso hands us come from a signature-verified webhook / authenticated
  // API, not user input; safeFetchBinary still applies the SSRF guard + 25 MB cap on
  // every hop. No host allowlist here (Kapso may redirect to its own storage/CDN host).
  let url = ref.mediaUrl
  if (!url && ref.mediaId) url = await resolveMediaUrl(ref.mediaId, ref.phoneNumberId)
  if (!url) return null

  const res = await safeFetchBinary(url, {
    headers: kapsoMediaHeaders(),
    maxBytes: MAX_AUDIO_BYTES,
    timeout: 20_000,
  })
  return res ? { body: res.body, contentType: res.contentType } : null
}

// Whisper needs a filename with a known audio extension. WhatsApp voice notes
// arrive as audio/ogg (opus); map the rest of the common types too.
const EXT_BY_TYPE: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
}

function extForType(contentType: string): string {
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return EXT_BY_TYPE[base] ?? 'ogg'
}

/**
 * Transcribe an audio buffer with OpenAI Whisper. Throws on missing key or a
 * provider error (the worker catches it → localized casual retry, E10).
 * `language` is an optional ISO-639-1 hint; Whisper auto-detects when omitted.
 */
export async function transcribeAudio(
  audio: Uint8Array,
  contentType: string,
  opts: { language?: string } = {},
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no està configurada')

  const client = new OpenAI({ maxRetries: 1 })
  const file = await toFile(Buffer.from(audio), `voice.${extForType(contentType)}`, {
    type: contentType.split(';')[0]?.trim() || 'audio/ogg',
  })

  const res = await client.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    ...(opts.language ? { language: opts.language } : {}),
  })

  return (res.text ?? '').trim()
}
