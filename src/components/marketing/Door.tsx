'use client'

// THE DOOR — the only real ask on the landing page.
//
// It is the same question the product opens with ("Explica'ns qui sou"), asked
// logged out, on the marketing page, before any account exists. Paste a URL,
// drop a PDF anywhere on the page, or hold and talk. Then Carma reads you, on
// screen, and shows you your own sentences — and only then asks for an email.
//
// The registration wall does not disappear; it moves to the moment where it is
// worth paying. See lib/onboarding/glimpse.ts for why the logged-out half runs
// with no model and no database.
//
// BUDGET. This is one of four client islands on the landing and the only large
// one, so: no animation library (every motion here is a CSS class in
// landing.css), no form library, and the voice recorder is loaded on demand —
// a visitor who never taps "parla" never downloads MediaRecorder handling.

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileText, Globe, Mic, Palette, PenLine, RotateCcw, Upload, X } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { isAcceptedDocument, ACCEPT_ATTR } from '@/lib/onboarding/documentTypes'
import {
  writeDoorCarry, type GlimpseEvent, type GlimpseResult, type GlimpseStep,
} from '@/lib/onboarding/glimpse'
import type { LandingCopy } from './copy'
import { cn } from '@/lib/cn'

// Only downloaded when the visitor actually decides to talk.
//
// NOT `{ ssr: false }`. That flag makes Next treat this whole island as
// client-only, and the server then emits an empty Suspense placeholder where the
// Door should be — the one element on the page that has to exist in the HTML.
// The recorder touches no browser API until a handler runs, so rendering its
// idle button on the server costs nothing and keeps the page whole without
// JavaScript. The code-splitting (the actual point) is unaffected.
const VoiceRecorder = dynamic(() => import('@/components/onboarding/VoiceRecorder'))

const MAX_FILES = 3

/**
 * KEEP THE DOOR WHERE THE VISITOR LEFT IT.
 *
 * Founder, 2026-09-17: "quan enten la web sen va cap a dalt o prems per parlar
 * tambe torna cap a dalt de la pgina hauria de quedarse sempre mateix marcador
 * o tenir efecte perque es vegi millor."
 *
 * Both jumps were real, and they had the same shape: the Door replaces its whole
 * body between phases (a 3-line form becomes a 700px reveal; a button becomes a
 * recorder), so the scroll offset that used to sit over the card ends up
 * pointing at whatever now occupies that height — usually the top of the page.
 *
 * Rather than fight the browser's scroll anchoring across a mount that large, we
 * take the position deliberately: after the swap, put the card back under the
 * nav and flash its ring so the change reads as an EVENT instead of a
 * teleportation. That is the second half of what was asked — "o tenir efecte
 * perque es vegi millor".
 *
 * A card already sitting comfortably in view is left alone: scrolling something
 * the visitor can already see is its own kind of jump.
 */
function keepInView(el: HTMLElement | null) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const top = 96   // the floating nav
  const settled = r.top >= top && r.top <= window.innerHeight * 0.45
  if (settled) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: window.scrollY + r.top - top, behavior: reduce ? 'auto' : 'smooth' })
}

type Phase = 'idle' | 'running' | 'reveal' | 'fail'

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

/** A pasted domain is the common case; a typed sentence is the other one. */
function looksLikeUrl(v: string): boolean {
  const s = v.trim()
  if (!s || /\s/.test(s)) return false
  return /^https?:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s)
}

export default function Door({
  c, variant = 'hero', id,
}: {
  c: LandingCopy['door']
  /** The hero Door owns the page-wide dropzone; the closing one does not. */
  variant?: 'hero' | 'close'
  id?: string
}) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [audio, setAudio] = useState<Blob | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pct, setPct] = useState(0)
  const [detail, setDetail] = useState<string | null>(null)
  const [step, setStep] = useState<GlimpseStep | null>(null)
  const [result, setResult] = useState<GlimpseResult | null>(null)
  const [rateMsg, setRateMsg] = useState<string | null>(null)
  // Bumping this remounts the knot, which restarts its one-shot flare. Cheaper
  // and more reliable than removing and re-adding a class across a frame.
  const [flare, setFlare] = useState(0)

  /** Copy carries {n} placeholders, not functions — see the note in copy.ts. */
  const count = (one: string, many: string, n: number) => (n === 1 ? one : many.replace('{n}', String(n)))

  // Bumping this replays the "something happened here" ring on the card.
  const [arrived, setArrived] = useState(0)

  const cardRef = useRef<HTMLDivElement>(null)
  const magnetRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const isUrl = looksLikeUrl(value)
  const hasInput = Boolean(value.trim() || files.length || audio)

  /* ── What the page says back, before anything is submitted ─────────────── */
  const reaction =
    audio ? c.sawVoice
    : files.length ? count(c.sawFileOne, c.sawFileMany, files.length)
    : isUrl ? c.sawUrl
    : value.trim().length > 12 ? c.sawText
    : null

  const pulse = useCallback(() => setFlare(f => f + 1), [])

  /** Re-anchor + flash, after React has painted the new body. */
  const land = useCallback(() => {
    setArrived(a => a + 1)
    requestAnimationFrame(() => requestAnimationFrame(() => keepInView(cardRef.current)))
  }, [])

  const addFiles = useCallback((incoming: File[]) => {
    const ok = incoming.filter(isAcceptedDocument)
    if (!ok.length) return
    setFiles(prev => [...prev, ...ok].slice(0, MAX_FILES))
    pulse()
  }, [pulse])

  /* ── The whole page is a drop target ───────────────────────────────────────
     A marketing page that accepts a document is the most "impossible" moment
     here, and it costs two window listeners. `dragover` must preventDefault or
     the browser navigates to the file instead of letting us have it. */
  useEffect(() => {
    if (variant !== 'hero') return
    let depth = 0
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
    }
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      depth += 1
      setDropping(true)
    }
    const leave = () => { depth = Math.max(0, depth - 1); if (depth === 0) setDropping(false) }
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      depth = 0
      setDropping(false)
      addFiles(Array.from(e.dataTransfer.files))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [variant, addFiles])

  /* ── Magnetic submit ───────────────────────────────────────────────────────
     The button leans toward the pointer within 120px, 8px maximum. Two custom
     properties; the transform itself is composited. Fine pointers only — there
     is nothing to lean toward on a touchscreen. */
  useEffect(() => {
    const el = magnetRef.current
    if (!el) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const dist = Math.hypot(dx, dy)
      const k = dist > 120 ? 0 : (1 - dist / 120) * 8
      el.style.setProperty('--mag-x', `${(dx / (dist || 1)) * k}px`)
      el.style.setProperty('--mag-y', `${(dy / (dist || 1)) * k}px`)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [phase])

  useEffect(() => () => abortRef.current?.abort(), [])

  /* ── Submit: stream the glimpse ────────────────────────────────────────── */
  const submit = useCallback(async () => {
    if (!hasInput || phase === 'running') return
    setPhase('running')
    setPct(0)
    setDetail(null)
    setStep(null)
    setRateMsg(null)
    pulse()

    const form = new FormData()
    if (isUrl) form.set('url', normalizeUrl(value))
    else if (value.trim()) form.set('text', value.trim())
    for (const f of files) form.append('documents', f)
    if (audio) form.set('audio', audio, 'voice.webm')

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/onboarding/glimpse', { method: 'POST', body: form, signal: ctrl.signal })
      if (res.status === 429) { setRateMsg(c.tooFast); setPhase('idle'); return }
      if (!res.ok || !res.body) { setPhase('fail'); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let got: GlimpseResult | null = null

      for (;;) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        buffer += decoder.decode(chunk, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          let ev: GlimpseEvent
          try { ev = JSON.parse(line.slice(6)) as GlimpseEvent } catch { continue }
          if (ev.type === 'progress') { setPct(ev.pct); setStep(ev.step); if (ev.detail) setDetail(ev.detail) }
          else if (ev.type === 'result') { got = ev.result }
          else if (ev.type === 'error') { got = null }
        }
      }

      if (got) { setResult(got); setPct(100); setPhase('reveal'); pulse(); land() }
      else { setPhase('fail'); land() }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setPhase('fail'); land()
    }
  }, [hasInput, phase, isUrl, value, files, audio, c.tooFast, pulse, land])

  /* ── Into the product ──────────────────────────────────────────────────────
     THE WHOLE GLIMPSE crosses the boundary, not just the URL.

     The first version carried two strings, so the moment the visitor signed up
     the product re-scraped the same six pages it had just finished reading to
     them — and made them watch a progress bar do it again. Carrying the corpus,
     the palette, the quotes and the synthesis means onboarding has nothing left
     to fetch: it remembers what it knows, writes it down, and spends its time
     going deeper instead of going back. */
  const enter = useCallback(() => {
    const url = isUrl ? normalizeUrl(value) : ''
    const parts = [
      !isUrl && value.trim() ? value.trim() : '',
      result?.heard ?? '',
    ].filter(Boolean)
    writeDoorCarry({
      url,
      text: parts.join('\n\n'),
      siteName: result?.siteName ?? null,
      locale: result?.locale ?? null,
      glimpse: result,
    })
    router.push(url ? `/registre?url=${encodeURIComponent(url)}` : '/registre')
  }, [isUrl, value, result, router])

  const reset = () => {
    abortRef.current?.abort()
    setPhase('idle'); setResult(null); setPct(0); setDetail(null)
    inputRef.current?.focus()
  }

  /* ════════════════════════════════════════════════════════════════════════ */

  return (
    <div id={id} className="relative mx-auto w-full max-w-2xl">
      {variant === 'hero' && (
        <div className={cn('door-veil', dropping && 'door-veil--on')} aria-hidden>
          <div className="flex h-full items-center justify-center">
            <div className="rounded-3xl border-2 border-dashed border-accent bg-bg-elevated/90 px-8 py-6 text-center shadow-pop backdrop-blur-sm">
              <Upload className="mx-auto h-7 w-7 text-accent" />
              <p className="mt-3 text-xl font-extrabold text-text">{c.dropTitle}</p>
              <p className="mt-1 text-sm font-medium text-muted">{c.dropBody}</p>
            </div>
          </div>
        </div>
      )}

      <div
        ref={cardRef}
        className={cn(
          'door scroll-mt-24 rounded-3xl border border-border bg-bg-elevated/70 p-5 shadow-card backdrop-blur-sm sm:p-6',
          dropping && 'door--dropping',
        )}
      >
        {arrived > 0 && <span key={arrived} className="door-ring" aria-hidden />}
        {/* ── The mark, always present, reacting ──────────────────────────── */}
        <div className="mb-4 flex items-center gap-3">
          <span key={flare} className={cn('shrink-0', phase === 'running' ? 'knot-thinking' : 'knot-flare')}>
            <EndlessKnot size={26} />
          </span>
          <p className="text-left text-lg font-extrabold tracking-tight text-text sm:text-xl">
            {phase === 'running' ? `${step === 'think' ? c.thinking : c.reading}${detail ? ` · ${detail}` : '…'}`
              : phase === 'reveal' ? c.revealTitle
              : phase === 'fail' ? c.failTitle
              : variant === 'close' ? c.titleClose
              : c.title}
          </p>
        </div>

        {/* ── IDLE ─────────────────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <form
            onSubmit={e => { e.preventDefault(); void submit() }}
            className="text-left"
          >
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <label className="relative flex min-w-0 flex-1 items-center">
                <span className="pointer-events-none absolute left-4 text-subtle">
                  {isUrl ? <Globe className="h-5 w-5" /> : value.trim() ? <PenLine className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
                </span>
                <input
                  ref={inputRef}
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onPaste={() => pulse()}
                  aria-label={c.aria}
                  placeholder={c.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    'h-14 w-full rounded-2xl border border-border bg-surface pl-12 pr-4',
                    'text-base font-semibold text-text placeholder:font-medium placeholder:text-subtle',
                    'outline-none transition-colors focus:border-accent',
                  )}
                />
              </label>

              <button
                ref={magnetRef}
                type="submit"
                disabled={!hasInput}
                className={cn(
                  'magnet btn-gold gold-trace [--gold-trace-w:1.5px]',
                  'inline-flex h-14 shrink-0 items-center justify-center rounded-2xl px-6 text-base font-extrabold',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                )}
              >
                <span className="relative z-[1] inline-flex items-center gap-2">
                  <span className="hidden sm:inline">{c.cta}</span>
                  <span className="sm:hidden">{c.ctaShort}</span>
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </div>

            {/* Chips: what we have so far */}
            {(files.length > 0 || audio) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="door-chip inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text">
                    <FileText className="h-3.5 w-3.5 text-accent" />
                    <span className="max-w-[12rem] truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="cursor-pointer text-subtle hover:text-danger" aria-label={c.dropTitle}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {audio && (
                  <span className="door-chip inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-text">
                    <Mic className="h-3.5 w-3.5 text-accent" />
                    {c.sawVoice}
                    <button type="button" onClick={() => { setAudio(null); setVoiceOpen(false) }} className="cursor-pointer text-subtle hover:text-danger" aria-label={c.dropTitle}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* The page, listening */}
            <p className="mt-3 min-h-[1.25rem] text-sm font-medium text-muted" aria-live="polite">
              {rateMsg ?? reaction ?? c.hint}
            </p>

            {/* Voice + upload, secondary by placement, first-class by size on touch */}
            {!audio && (
              <div className="mt-3">
                {voiceOpen ? (
                  <Suspense
                    fallback={
                      <div className="flex h-[52px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-muted">
                        <span className="knot-thinking inline-flex"><EndlessKnot size={16} /></span>
                        {c.voiceCta}…
                      </div>
                    }
                  >
                    <VoiceRecorder labels={c.voice} onRecording={r => { setAudio(r?.blob ?? null); if (r) pulse() }} />
                  </Suspense>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setVoiceOpen(true); land() }}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/50 hover:bg-surface-hover"
                    >
                      <Mic className="h-4 w-4 text-accent" /> {c.voiceCta}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/50 hover:bg-surface-hover"
                    >
                      <Upload className="h-4 w-4 text-accent" /> PDF · DOCX · TXT
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept={ACCEPT_ATTR}
                      hidden
                      onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* NO WEBSITE AT ALL. The founder had to hunt for this ("opcio de
                començar sense web falta o esta molt amagada a tot arreeu") — so
                it now sits under the one input it is the alternative to, on both
                the hero Door and the closing one. */}
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3.5 text-sm">
              <span className="font-semibold text-muted">{c.noWebLead}</span>
              <Link
                href="/registre?nova=1"
                className="group inline-flex items-center gap-1.5 font-extrabold text-accent no-underline underline-offset-4 hover:underline"
              >
                <Palette className="h-3.5 w-3.5" />
                {c.noWebCta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </p>
          </form>
        )}

        {/* ── RUNNING ──────────────────────────────────────────────────────── */}
        {phase === 'running' && (
          <div className="text-left">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="glimpse-bar h-full w-full rounded-full bg-gradient-to-r from-[#d9a400] to-[#ffe066]"
                style={{ ['--pct' as string]: Math.max(0.04, pct / 100) }}
              />
            </div>
            <p className="mt-3 text-sm font-medium text-muted">{c.voiceHint}</p>
          </div>
        )}

        {/* ── REVEAL ───────────────────────────────────────────────────────── */}
        {phase === 'reveal' && result && (
          <div className="text-left">
            <ul className="flex flex-wrap gap-2">
              {result.pages > 0 && (
                <li className="glimpse-line rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text">
                  {count(c.revealPagesOne, c.revealPagesMany, result.pages)}
                </li>
              )}
              {result.siteName && (
                <li className="glimpse-line rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text">
                  {result.siteName}
                </li>
              )}
              {result.docs.map(d => (
                <li key={d.name} className="glimpse-line rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text">
                  {d.name} · {d.words}
                </li>
              ))}
            </ul>

            {result.palette.length > 0 && (
              <div className="mt-3 flex gap-1.5" aria-hidden>
                {result.palette.map(col => (
                  <span key={col} className="glimpse-line h-7 flex-1 rounded-lg border border-black/10" style={{ background: col }} />
                ))}
              </div>
            )}

            {/* ── BRAND BRAIN 2.0 — what she UNDERSTOOD ────────────────────
                This is the half that separates "it read my site" from "it gets
                my business". Everything below is synthesised, never quoted. */}
            {result.synthesis?.understanding && (
              <div className="glimpse-line mt-5 rounded-2xl border border-accent/25 bg-accent-soft/40 p-4">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{c.understoodTitle}</p>
                <p className="mt-2 font-display text-lg leading-snug text-text">{result.synthesis.understanding}</p>

                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {([
                    [c.sectorLabel, result.synthesis.sector],
                    [c.audienceLabel, result.synthesis.audience],
                  ] as const).filter(([, v]) => v).map(([label, value]) => (
                    // role="presentation": the only <div> a <dl> is allowed to
                    // contain is one wrapping a single term/definition group.
                    <div key={label} role="presentation">
                      <dt className="text-[0.68rem] font-extrabold uppercase tracking-wider text-subtle">{label}</dt>
                      <dd className="text-sm font-medium leading-snug text-text">{value}</dd>
                    </div>
                  ))}
                </dl>

                {result.synthesis.edge && (
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    <span className="font-bold text-text">{c.edgeLabel}: </span>
                    {result.synthesis.edge}
                  </p>
                )}

                {result.synthesis.gaps.length > 0 && (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    <span className="font-bold text-text">{c.gapsLabel}: </span>
                    {result.synthesis.gaps.join(' · ')}
                  </p>
                )}
              </div>
            )}

            {/* ── The three pitches. The moment the visitor decides. ───────── */}
            {result.synthesis && result.synthesis.pitches.length > 0 && (
              <div className="mt-5">
                <p className="font-display text-xl leading-tight text-text">{c.pitchesTitle}</p>
                <p className="mt-1 text-sm text-muted">{c.pitchesLead}</p>
                <ol className="mt-3 space-y-2.5">
                  {result.synthesis.pitches.map((pitch, i) => (
                    <li
                      key={pitch.title}
                      className="pitch-card rounded-2xl border border-border bg-surface p-4"
                      style={{ animationDelay: `${i * 110}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-on-accent">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-display text-lg font-semibold leading-snug text-text">{pitch.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted">{pitch.angle}</p>
                          {pitch.why && (
                            <p className="mt-1.5 text-sm leading-relaxed text-subtle">
                              <span className="font-bold">{c.pitchWhy}: </span>{pitch.why}
                            </p>
                          )}
                          {pitch.keyword && (
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-[0.7rem] font-semibold text-muted">
                              {c.pitchKeyword}: <span className="font-extrabold text-text">{pitch.keyword}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* THE QUOTE BLOCK IS GONE (founder, 2026-09-17).
                It printed two real sentences from the visitor's site under "and
                these sentences are yours", followed by "we kept them, literally.
                That is how I learn to write like you."

                Two problems, and the second is the fatal one. It read as a
                parlour trick — of course a scraper can quote a page back. And it
                advertised the exact thing the product promises NOT to do: the
                agent does not reuse anyone's sentences, it learns a voice and
                writes new ones. LA VEU now says that in as many words, so the
                Door would have been contradicting the page it sits on.

                `result.quotes` still crosses into onboarding — the Brand Brain
                reads them as signal. They are simply never printed as a boast. */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={enter}
                className="btn-gold gold-trace [--gold-trace-w:1.5px] inline-flex h-13 items-center justify-center rounded-2xl px-6 py-3.5 text-base font-extrabold"
              >
                <span className="relative z-[1] inline-flex items-center gap-2">{c.revealCta} <ArrowRight className="h-4 w-4" /></span>
              </button>
              <button type="button" onClick={reset} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-accent">
                <RotateCcw className="h-3.5 w-3.5" /> {c.revealBack}
              </button>
            </div>
          </div>
        )}

        {/* ── FAIL ─────────────────────────────────────────────────────────── */}
        {phase === 'fail' && (
          <div className="text-left">
            <p className="text-base leading-relaxed text-muted">{c.failBody}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={enter}
                className="btn-gold gold-trace [--gold-trace-w:1.5px] inline-flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
              >
                <span className="relative z-[1] inline-flex items-center gap-2">{c.failCta} <ArrowRight className="h-4 w-4" /></span>
              </button>
              <button type="button" onClick={reset} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-accent">
                <RotateCcw className="h-3.5 w-3.5" /> {c.revealBack}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
