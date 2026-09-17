'use client'

// Hold-to-talk capture for the Brand Brain (Fase 1).
//
// The founder's line was "the voice feature is the magic", and the thing that
// makes it magic is that it costs the owner no decisions: press, talk, release.
// No format picker, no upload dialog, no "are you sure".
//
// Three details carry that feeling:
//   · The level meter is real. A fake animated waveform is immediately obvious
//     and makes the whole product feel like a demo; this reads the actual
//     analyser, so the bars move when THEY move.
//   · It works on touch and mouse and keyboard. Press-and-hold is a mouse idiom;
//     on a phone it is a long-press fight with text selection, so touch gets a
//     tap-to-start / tap-to-stop toggle instead.
//   · Permission denial is a sentence, not a dead button.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Below this a recording is a slip of the finger, not a description. */
const MIN_MS = 900
/** Whisper's practical sweet spot; also keeps the upload small on mobile data. */
const MAX_MS = 120_000
const BARS = 14

export type VoiceRecorderLabels = {
  cta: string
  ctaHint: string
  stop: string
  note: string
  noteHint: string
  discard: string
  play: string
  pause: string
  tooShort: string
  denied: string
}

/** Catalan by default — the product is ca-first and every onboarding call site
 *  relies on these. The landing passes its own so an English visitor does not
 *  meet a Catalan button. */
export const VOICE_LABELS_CA: VoiceRecorderLabels = {
  cta: 'Prem i parla',
  ctaHint: '· explica\u2019ns el negoci en 30 segons',
  stop: 'Parar',
  note: 'Nota de veu',
  noteHint: 'La far\u00e9 servir per entendre com parles del teu negoci.',
  discard: 'Descartar la nota de veu',
  play: 'Escoltar',
  pause: 'Pausar',
  tooShort: 'Massa curt \u2014 mant\u00e9n premut mentre parles.',
  denied: 'No podem accedir al micr\u00f2fon. Revisa els permisos del navegador.',
}

export type VoiceRecorderProps = {
  /** Fired when a usable recording exists (or null when the owner discards it). */
  onRecording: (rec: { blob: Blob; durationMs: number } | null) => void
  disabled?: boolean
  labels?: VoiceRecorderLabels
}

function mmss(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function VoiceRecorder({ onRecording, disabled, labels = VOICE_LABELS_CA }: VoiceRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'done'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  // The object URL is STATE, not a ref: it is rendered, and reading a ref during
  // render is both a react-hooks v6 error and a real staleness bug (the <audio>
  // would keep the previous take's src after a re-record).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const barsRef = useRef<(HTMLSpanElement | null)[]>([])
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    recorderRef.current = null
  }, [])

  useEffect(() => () => {
    teardown()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [teardown])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    rec.stop()
  }, [])

  const start = useCallback(async () => {
    if (disabled || state === 'recording') return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Level meter — the analyser is read per frame and written straight to a CSS
      // custom property, so the bars are a compositor-only scaleY. No React state
      // per frame, no re-render, no layout.
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(data)
        for (let i = 0; i < BARS; i++) {
          const v = data[Math.floor((i / BARS) * data.length)] / 255
          barsRef.current[i]?.style.setProperty('--vu', String(Math.max(0.08, v * 1.6)))
        }
        const ms = performance.now() - startedAtRef.current
        setElapsed(ms)
        if (ms >= MAX_MS) { stop(); return }
        rafRef.current = requestAnimationFrame(tick)
      }

      // webm/opus everywhere modern; Safari gives mp4. Whisper takes both.
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        const durationMs = performance.now() - startedAtRef.current
        teardown()
        if (durationMs < MIN_MS) {
          setState('idle')
          setElapsed(0)
          setError(labels.tooShort)
          return
        }
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        const url = URL.createObjectURL(blob)
        previewUrlRef.current = url
        setPreviewUrl(url)
        setState('done')
        onRecording({ blob, durationMs })
      }

      startedAtRef.current = performance.now()
      rec.start()
      setState('recording')
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setError(labels.denied)
      setState('idle')
      teardown()
    }
  }, [disabled, state, stop, teardown, onRecording, labels.tooShort, labels.denied])

  /**
   * Press-and-hold. Starts the recording and binds the RELEASE to the window,
   * because starting re-renders this component into its recording state and any
   * handler bound to the idle button dies with it. `pointercancel` and `blur`
   * count as a release too — a hold interrupted by a notification or an
   * alt-tab should stop cleanly rather than record the room.
   */
  const startHeld = useCallback(async () => {
    const release = () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      stop()
    }
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') release() }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    await start()
  }, [start, stop])

  const discard = () => {
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null }
    setPreviewUrl(null)
    previewRef.current?.pause()
    setPlaying(false)
    setState('idle')
    setElapsed(0)
    onRecording(null)
  }

  // ── Recorded ──────────────────────────────────────────────────────────────
  if (state === 'done') {
    return (
      <div className="zen-fade-up flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3">
        <button
          type="button"
          onClick={() => {
            const el = previewRef.current
            if (!el) return
            if (el.paused) { void el.play(); setPlaying(true) } else { el.pause(); setPlaying(false) }
          }}
          aria-label={playing ? labels.pause : labels.play}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">{labels.note} · {mmss(elapsed)}</span>
          <span className="block text-xs text-muted">{labels.noteHint}</span>
        </span>
        <button
          type="button"
          onClick={discard}
          aria-label={labels.discard}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-bg-elevated hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {previewUrl && (
          <audio ref={previewRef} src={previewUrl} onEnded={() => setPlaying(false)} hidden />
        )}
      </div>
    )
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  if (state === 'recording') {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger text-white">
          <span className="zen-breathe absolute inset-0 rounded-full bg-danger/40" aria-hidden />
          <Mic className="relative h-4 w-4" />
        </span>
        <span className="flex h-8 min-w-0 flex-1 items-center gap-[3px]" aria-hidden>
          {Array.from({ length: BARS }).map((_, i) => (
            <span
              key={i}
              ref={el => { barsRef.current[i] = el }}
              className="vu-bar h-full w-full rounded-full bg-accent"
            />
          ))}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-text">{mmss(elapsed)}</span>
        <button
          type="button"
          onClick={stop}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-text px-3 py-2 text-xs font-bold text-bg-elevated"
        >
          <Square className="h-3 w-3 fill-current" /> {labels.stop}
        </button>
      </div>
    )
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <button
        type="button"
        disabled={disabled}
        // Mouse/pen: press and hold. Touch: tap to start (a long-press on a phone
        // fights text selection and the context menu, and loses).
        //
        // The release listener goes on the WINDOW, not this button: starting a
        // recording re-renders this whole branch away, so a `pointerup` handler
        // bound here would be attached to an element that no longer exists by the
        // time the owner lets go — the recording would never stop.
        onPointerDown={e => { if (e.pointerType !== 'touch') void startHeld() }}
        onClick={e => { if ((e as unknown as PointerEvent).pointerType === 'touch') void start() }}
        onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void startHeld() } }}
        className={cn(
          'group flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border border-border',
          'bg-surface px-4 py-3.5 text-sm font-semibold text-text transition-colors',
          'hover:border-accent/50 hover:bg-surface-hover disabled:opacity-60',
        )}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent transition-transform group-hover:scale-105">
          <Mic className="h-4 w-4" />
        </span>
        {labels.cta}
        <span className="text-xs font-medium text-subtle">{labels.ctaHint}</span>
      </button>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
