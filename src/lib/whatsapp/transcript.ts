// WhatsApp Agent — Whisper transcript confidence (§5 C1 / E-16, pure + import-safe).
//
// Split out of transcribe.ts (which imports the OpenAI SDK) so the threshold logic is
// unit-testable in the plain-node harness. verbose_json exposes per-segment
// avg_logprob / no_speech_prob / compression_ratio — the standard Whisper
// hallucination detectors. We aggregate and flag a shaky transcript so the worker
// echoes back to confirm (§3.5) instead of drafting an article about noise.

// Env-overridable thresholds.
const LOW_AVG_LOGPROB = numEnv('WA_WHISPER_MIN_AVG_LOGPROB', -1.0)
const HIGH_NO_SPEECH = numEnv('WA_WHISPER_MAX_NO_SPEECH', 0.6)
const HIGH_COMPRESSION = numEnv('WA_WHISPER_MAX_COMPRESSION', 2.4)

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

export type TranscriptSegment = { avg_logprob?: number; no_speech_prob?: number; compression_ratio?: number }
export type TranscriptConfidence = {
  avgLogprob: number | null
  noSpeechProb: number | null
  compressionRatio: number | null
  /** true ⇒ likely garbled/hallucinated → echo back to confirm, don't draft (C1). */
  lowConfidence: boolean
}

/**
 * Aggregate Whisper's per-segment metrics into one confidence verdict. avg_logprob is
 * meaned; the "bad" signals (no_speech_prob / compression_ratio) take the worst
 * segment. No segments ⇒ we can't judge ⇒ NOT low (never blocks on missing data).
 */
export function assessTranscript(text: string, segments: TranscriptSegment[]): TranscriptConfidence {
  const logs = segments.map((s) => s.avg_logprob).filter((v): v is number => typeof v === 'number')
  const noSpeech = segments.map((s) => s.no_speech_prob).filter((v): v is number => typeof v === 'number')
  const compression = segments.map((s) => s.compression_ratio).filter((v): v is number => typeof v === 'number')

  const avgLogprob = logs.length ? logs.reduce((a, b) => a + b, 0) / logs.length : null
  const noSpeechProb = noSpeech.length ? Math.max(...noSpeech) : null
  const compressionRatio = compression.length ? Math.max(...compression) : null

  const lowConfidence =
    (avgLogprob !== null && avgLogprob < LOW_AVG_LOGPROB) ||
    (noSpeechProb !== null && noSpeechProb > HIGH_NO_SPEECH) ||
    (compressionRatio !== null && compressionRatio > HIGH_COMPRESSION)

  return { avgLogprob, noSpeechProb, compressionRatio, lowConfidence }
}
