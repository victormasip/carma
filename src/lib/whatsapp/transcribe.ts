// WhatsApp Agent — voice-note transcription (T3, server-only).
//
// Two steps the worker (T4) calls when an inbound message is audio:
//   1. downloadTwilioMedia — pull the voice note off Twilio's media URL with Basic
//      auth, through safeFetchBinary (SSRF-guarded, byte-capped, redirect-safe).
//   2. transcribeAudio — OpenAI Whisper (whisper-1) → plain text.
//
// Provider: OpenAI for the WhatsApp agent ecosystem (founder directive). The
// dashboard's article generation stays on Anthropic Opus 4.8.

import OpenAI, { toFile } from 'openai'
import { safeFetchBinary } from '@/lib/scrape/http'

// whisper-1 is the directed model; overridable per the project's env convention.
const TRANSCRIBE_MODEL = process.env.WA_TRANSCRIBE_MODEL || 'whisper-1'

// Hosts Twilio serves media from. safeFetchBinary checks this on the FIRST hop;
// Twilio commonly 307s to a pre-signed CDN/S3 URL, which the SSRF guard re-checks
// on each hop (no allowlist on the redirect target, which Twilio chooses).
const TWILIO_MEDIA_HOSTS = ['api.twilio.com', 'twiliocdn.com', 'media.twiliocdn.com']

// OpenAI Whisper's hard upload limit is 25 MB; cap the download at the same bound.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

function twilioAuthHeader(): string | null {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
}

export type DownloadedMedia = { body: Uint8Array; contentType: string }

/** Download a Twilio media URL (Basic auth) safely. Returns null on any failure. */
export async function downloadTwilioMedia(mediaUrl: string): Promise<DownloadedMedia | null> {
  const auth = twilioAuthHeader()
  const res = await safeFetchBinary(mediaUrl, {
    headers: auth ? { Authorization: auth } : undefined,
    maxBytes: MAX_AUDIO_BYTES,
    allowHosts: TWILIO_MEDIA_HOSTS,
    timeout: 20_000,
  })
  return res ? { body: res.body, contentType: res.contentType } : null
}

// Whisper needs a filename with a known audio extension. WhatsApp voice notes
// arrive as audio/ogg (opus); map the rest of the common Twilio types too.
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
 * provider error (the worker catches it → localized "no t'he entès" retry, E10).
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
