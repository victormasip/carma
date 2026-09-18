'use client'

// Brand Brain capture — progress, then the reveal (Fase 1).
//
// Two jobs, and the second one is the point.
//
// PROGRESS: narrate real findings, never a spinner. "Llegint la teva web" →
// "3 pàgines llegides" → "5 frases teves memoritzades". Every line is something
// that actually happened, which is what separates a product that is working from
// a product that is stalling.
//
// REVEAL: show the owner what we understood, in their own words, before anything
// else happens. This is the moment the product earns trust — they see their own
// sentences quoted back and realise the agent isn't going to write generic filler.
// It also gives them a chance to say "that's wrong" before an article exists.

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Check, Loader2, Minus, Sparkles, ArrowRight, AlertCircle, PenLine, Mic, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Wordmark from '@/components/ui/Wordmark'
import { refineBrandProfile } from '@/lib/actions/brand'
import { BRAND_STEPS, type BrandBrain, type BrandEvent, type BrandStepId } from '@/lib/brand/types'
import { cn } from '@/lib/cn'

// The mic is a decision, not a default: most owners type or paste. Loading
// the recorder (and the MediaRecorder plumbing behind it) only when the tab
// is opened keeps it off every first paint — the same split Door already
// makes on the landing. `next/dynamic` rather than `lazy`, so no Suspense
// boundary is needed for a component that renders inside a tab panel.
const VoiceRecorder = dynamic(() => import('@/components/onboarding/VoiceRecorder'))

type StepState = { status: 'pending' | 'running' | 'done' | 'skipped'; detail?: string }

/** No SSE event for this long and we stop waiting. See the watchdog below. */
const STALL_MS = 45_000

export type BrandCaptureViewProps = {
  siteId: string
  siteName: string
  input: { url: string; text: string; files: File[]; audio: Blob | null }
  /**
   * What the landing Door already read, if the owner came through it.
   *
   * Its presence turns this screen from "reading your website" into "I remember
   * your website" — the scrape is skipped server-side and the whole pass drops
   * from ~60s to ~10s. It is a plain JSON blob carried in sessionStorage; see
   * BrandSeed in lib/brand/capture.ts.
   */
  seed?: unknown | null
  /** Fired when the owner has seen the reveal and wants to continue. */
  onContinue: (brain: BrandBrain | null) => void
}

/**
 * A progress bar that keeps moving between the events that drive it.
 *
 * THE BUG. The bar was bound directly to the SSE `pct`, which arrives five
 * times in a run that can last a minute — so it sat perfectly still for ten,
 * fifteen, thirty seconds at a stretch. A frozen progress bar is not "no news",
 * it reads as a crash, and this screen is precisely where an owner decides
 * whether the product works (founder QA, 2026-09-18).
 *
 * THE SHAPE. Real milestones remain the truth; between them the bar CREEPS
 * towards a ceiling a little above the last one, asymptotically, so it is always
 * moving and never overtakes reality. The ceiling is capped at 90% until the run
 * actually resolves — the last tenth belongs to the result, not to a guess.
 *
 * TWO THINGS MAKE THIS CHEAP:
 *   · it writes the scale straight to the node as a custom property behind a
 *     constant `transform: scaleX(var(--cap))`, so the browser composites it and
 *     no React render happens per frame — and a re-render can never yank the bar
 *     back to the value the JSX declares, because that value never changes. The
 *     old bar animated `width`, which is layout, for up to a minute;
 *   · the effect re-runs only when a milestone lands — five times, not sixty
 *     times a second.
 *
 * It stays alive under reduced motion on purpose: this is feedback, not
 * decoration, and it carries the same exemption `.knot-thinking` does.
 */
function useCreepingProgress(pct: number, settled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Never below where the server has already got to, never above 90 until the
    // run is over. The +14 is the headroom the creep is allowed to spend.
    const ceiling = settled ? 100 : Math.min(90, Math.max(pct, 4) + 14)
    // The animated value lives in a custom property, NOT in the `transform`
    // string: the element's inline `transform` is then a constant that React
    // re-renders to the identical value forever, so a milestone landing can
    // never yank the bar back to where the JSX says it started.
    const read = () => (parseFloat(el.style.getPropertyValue('--cap')) || 0.04) * 100
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(200, now - last)
      last = now
      const from = read()
      // Exponential approach: fast while the gap is wide, imperceptible as it
      // closes — which is exactly how a real download feels.
      const k = 1 - Math.exp(-dt / (settled ? 160 : 2600))
      const next = Math.min(ceiling, from + (ceiling - from) * k)
      el.style.setProperty('--cap', (next / 100).toFixed(4))
      if (ceiling - next > 0.08) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pct, settled])

  return ref
}

export default function BrandCaptureView({ siteId, siteName, input, seed, onContinue }: BrandCaptureViewProps) {
  const [steps, setSteps] = useState<Record<BrandStepId, StepState>>(() => ({
    read: { status: 'pending' }, documents: { status: 'pending' }, voice: { status: 'pending' },
    distil: { status: 'pending' }, save: { status: 'pending' },
  }))
  const [pct, setPct] = useState(0)
  const [brain, setBrain] = useState<BrandBrain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const fired = useRef(false)
  // `pct` is the last thing the server actually told us; the bar eases towards
  // a little beyond it and parks at 90% until the run resolves.
  const barRef = useCreepingProgress(pct, finished || !!brain)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    const ctrl = new AbortController()
    const form = new FormData()
    form.set('siteId', siteId)
    form.set('siteName', siteName)
    if (input.url) form.set('url', input.url)
    if (input.text) form.set('text', input.text)
    if (input.audio) form.set('audio', input.audio, 'voice.webm')
    for (const f of input.files) form.append('documents', f)
    if (seed) { try { form.set('seed', JSON.stringify(seed)) } catch { /* unserialisable: read it ourselves */ } }

    // A WATCHDOG, because "es queda penjat" is a real failure mode: a stalled
    // upstream, a proxy that buffers, a serverless instance that dies mid-stream.
    // Any of them leaves an SSE reader waiting forever and the owner staring at a
    // progress bar that will never move again. Every event resets the timer; if
    // nothing arrives for STALL_MS the capture is abandoned and the owner is
    // moved along with what we have, which is never nothing.
    let stall: ReturnType<typeof setTimeout> | null = null
    const bump = () => {
      if (stall) clearTimeout(stall)
      stall = setTimeout(() => ctrl.abort(), STALL_MS)
    }

    void (async () => {
      try {
        bump()
        const res = await fetch('/api/onboarding/brand', { method: 'POST', body: form, signal: ctrl.signal })
        if (!res.ok || !res.body) {
          const msg = await res.json().catch(() => null)
          setError((msg as { error?: string } | null)?.error ?? 'No hem pogut analitzar la marca.')
          setFinished(true)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          bump()
          buf += decoder.decode(value, { stream: true })
          // SSE frames are separated by a blank line.
          const frames = buf.split('\n\n')
          buf = frames.pop() ?? ''
          for (const frame of frames) {
            const line = frame.split('\n').find(l => l.startsWith('data:'))
            if (!line) continue
            let ev: BrandEvent
            try { ev = JSON.parse(line.slice(5).trim()) as BrandEvent } catch { continue }
            if (ev.type === 'progress') {
              setSteps(prev => ({ ...prev, [ev.step]: { status: ev.status, detail: ev.detail } }))
              setPct(p => Math.max(p, ev.pct))
            } else if (ev.type === 'error') {
              setError(ev.error)
            } else if (ev.type === 'result') {
              setBrain(ev.brain)
              setPct(100)
            }
          }
        }
      } catch (e) {
        // An abort here is almost always OUR watchdog firing, not the owner
        // navigating away — and either way the honest thing is to stop waiting
        // and move them along with what we have.
        setError(
          (e as Error)?.name === 'AbortError'
            ? 'L’anàlisi ha trigat massa. Continuem amb el que ja sabem.'
            : 'S’ha interromput l’anàlisi.',
        )
      } finally {
        if (stall) clearTimeout(stall)
        setFinished(true)
      }
    })()

    // NO ABORT ON CLEANUP. This is the whole bug, and it had two faces.
    //
    // React Strict Mode (on, in next.config.ts) mounts every effect, tears it
    // down, and mounts it again. `fired` is a ref, so it survives that remount —
    // which means the SECOND mount returns early and never starts a request,
    // while the teardown between the two mounts had already aborted the FIRST
    // one. Exactly one request is ever made, and it is cancelled milliseconds
    // after it starts.
    //
    // Before the watchdog, an abort was swallowed silently: `finished` went true
    // with no brain and no error, the component fell through to the progress
    // view, and it sat there forever. That was "es queda penjat".
    // After the watchdog, the same abort surfaced as a message — "l'anàlisi ha
    // trigat massa" in under a second, which is what made the real cause
    // visible at last.
    //
    // So the cleanup does nothing. On a genuine unmount the request finishes in
    // the background and its setState calls are no-ops; the watchdog still
    // bounds it, and `maxDuration` bounds it server-side. A request that
    // outlives a navigation is a far smaller problem than a capture that can
    // never run.
    return undefined
    // Deliberately empty: this is a one-shot, guarded by `fired`. Putting the
    // inputs in here re-runs it on every identity change and re-opens the bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reveal ────────────────────────────────────────────────────────────────
  if (finished && brain) {
    return <BrandReveal siteId={siteId} brain={brain} onContinue={onContinue} />
  }

  // ── Failed, but never a dead end ──────────────────────────────────────────
  if (finished && error) {
    return (
      <div className="mx-auto w-full max-w-lg text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <AlertCircle className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-bold text-text">No hem pogut llegir-ho tot</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{error}</p>
        <p className="mt-1.5 text-sm text-subtle">
          Res perdut: continuem amb el teu blog i l&apos;agent aprendrà la teva veu sobre la marxa.
        </p>
        <Button glow className="mt-6" onClick={() => onContinue(null)} iconRight={<ArrowRight className="h-4 w-4" />}>
          Continuar
        </Button>
      </div>
    )
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="text-center">
        <Wordmark size="text-lg" />
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-text">
          Estem coneixent <span className="text-accent">{siteName}</span>
        </h2>
        <p className="mt-2 text-sm text-muted">Un moment — això només passa un cop.</p>
      </div>

      {/* THE BAR MOVES BETWEEN EVENTS, NOT ONLY ON THEM.
          See useCreepingProgress: five SSE milestones over a minute left it
          frozen for ten seconds at a time, which reads as a crash. */}
      <div className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          ref={barRef}
          className="h-full w-full origin-left bg-accent"
          style={{ transform: 'scaleX(var(--cap, 0.04))' }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(100, Math.max(4, pct)))}
          aria-label="Progrés de l’anàlisi"
        />
      </div>

      <ul className="mt-6 space-y-1">
        {BRAND_STEPS.map(step => {
          const st = steps[step.id]
          if (st.status === 'skipped' && !st.detail) return null
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                st.status === 'running' && 'bg-accent-soft',
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {st.status === 'done' && <Check className="h-4 w-4 text-success" strokeWidth={3} />}
                {st.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                {st.status === 'skipped' && <Minus className="h-3.5 w-3.5 text-subtle" />}
                {st.status === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn(
                  'block text-sm font-medium',
                  st.status === 'pending' ? 'text-subtle' : st.status === 'skipped' ? 'text-subtle' : 'text-text',
                )}>
                  {step.label}
                </span>
                {st.detail && <span className="block text-xs text-muted">{st.detail}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * WHAT WE UNDERSTOOD — and the owner's chance to correct it.
 *
 * Founder, 2026-09-17: "when Carma presents what it learned about the user, DO
 * NOT force them forward. Give the user an interface to modify, alter, or
 * improve this profile (via text/voice) before continuing. If not just let them
 * continue."
 *
 * Both halves of that sentence are load-bearing, and together they decide the
 * design:
 *
 *   · CORRECTION IS AVAILABLE, NOT COMPULSORY. The default state is the reveal
 *     with one gold button, exactly as before — the owner who agrees loses
 *     nothing. "Hi ha res que no quadra?" opens the editor beside it.
 *   · WHEN IT IS OPEN, EVERY FACT IS A FIELD. What you sell, who reads you, the
 *     tone words, the themes — typed straight in and applied verbatim. The owner
 *     is the authority on their own business; there is nothing to infer.
 *   · AND THERE IS A WAY TO SAY IT IN WORDS, typed or spoken, because the most
 *     valuable correction is usually the one that does not fit in a field: "we
 *     are not a shop, we are a workshop, and never call us cheap."
 *
 * This matters more than it looks. The profile is what every future article is
 * written against, so a wrong sentence here is wrong in fifty articles — and the
 * moment the owner is most able to catch it is the moment they first read it.
 *
 * WHAT IS NO LONGER SHOWN: the verbatim-exemplars panel ("Frases teves, tal com
 * les vas escriure"). The mechanism stays — few-shot sentences in the owner's own
 * words are still the highest-leverage field in the profile — but advertising it
 * was confusing, and it contradicted the promise the landing now makes in as many
 * words: she learns HOW you write, she does not reuse WHAT you wrote.
 */
function BrandReveal({ siteId, brain, onContinue }: {
  siteId: string
  brain: BrandBrain
  onContinue: (brain: BrandBrain) => void
}) {
  const [current, setCurrent] = useState<BrandBrain>(brain)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ack, setAck] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [audio, setAudio] = useState<Blob | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)

  // The four facts, as strings. Re-seeded when the editor opens rather than held
  // in sync, so a save followed by a second edit starts from what is on screen.
  const [sell, setSell] = useState('')
  const [who, setWho] = useState('')
  const [tone, setTone] = useState('')
  const [themes, setThemes] = useState('')

  const openEditor = () => {
    setSell(current.identity.whatTheySell ?? '')
    setWho(current.audience.who ?? '')
    setTone(current.voice.descriptors.join(', '))
    setThemes(current.pillars.map(p => p.name).join(', '))
    setErr(null)
    setEditing(true)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setErr(null)
    try {
      const form = new FormData()
      form.set('siteId', siteId)
      form.set('whatTheySell', sell)
      form.set('audience', who)
      form.set('descriptors', tone)
      form.set('pillars', themes)
      if (note.trim()) form.set('note', note.trim())
      if (audio) form.set('audio', audio, 'correccio.webm')
      const res = await refineBrandProfile(form)
      if (!res.ok) { setErr(res.error); return }
      setCurrent(res.brain)
      setAck(res.acknowledgement ?? 'Apuntat. Ho tindre en compte a cada article.')
      setNote('')
      setAudio(null)
      setVoiceOpen(false)
      setEditing(false)
    } catch {
      setErr('No hem pogut desar-ho. Torna-ho a provar.')
    } finally {
      setSaving(false)
    }
  }

  const facts: { label: string; value: string }[] = []
  if (current.identity.whatTheySell) facts.push({ label: 'Que feu', value: current.identity.whatTheySell })
  if (current.audience.who) facts.push({ label: 'Per a qui', value: current.audience.who })
  if (current.voice.descriptors.length) facts.push({ label: 'To de veu', value: current.voice.descriptors.slice(0, 4).join(' \u00b7 ') })
  if (current.pillars.length) facts.push({ label: 'Temes', value: current.pillars.slice(0, 4).map(p => p.name).join(' \u00b7 ') })

  return (
    <div className="zen-fade-up mx-auto w-full max-w-2xl">
      <div className="text-center">
        <span className="zen-pop mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-[0_8px_24px_-6px_rgba(245,188,0,0.6)]">
          <Sparkles className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Ja et conec<span className="text-accent">.</span>
        </h2>
        <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-muted">
          Aix\u00f2 \u00e9s el que he ent\u00e8s de la teva marca. Ho far\u00e9 servir a cada article \u2014 aix\u00ed que si hi ha res que no quadra, corregeix-m\u2019ho ara.
        </p>
      </div>

      {ack && (
        <p className="zen-fade-up mt-5 flex items-start gap-2.5 rounded-2xl border border-accent/25 bg-accent-soft/50 px-4 py-3 text-sm font-semibold leading-relaxed text-text">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={3} /> {ack}
        </p>
      )}

      {!editing && facts.length > 0 && (
        <dl className="mt-7 grid gap-3 sm:grid-cols-2">
          {facts.map(f => (
            // role="presentation" — a <dl>'s only legal <div> child is one that
            // wraps exactly one <dt>/<dd> group, which is what this is.
            <div key={f.label} role="presentation" className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <dt className="text-xs font-bold uppercase tracking-wider text-subtle">{f.label}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-text">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing && (
        <div className="zen-fade-up mt-7 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="Que feu" value={sell} onChange={setSell} placeholder="Reformes integrals de pisos antics" multiline />
            <EditField label="Per a qui" value={who} onChange={setWho} placeholder="Propietaris del barri que hi volen viure, no revendre" multiline />
            <EditField label="To de veu" value={tone} onChange={setTone} placeholder="directe, proper, sense floritures" hint="Separa\u2019ls amb comes" />
            <EditField label="Temes" value={themes} onChange={setThemes} placeholder="Reformes, Materials, Pressupostos" hint="Separa\u2019ls amb comes" />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <p className="text-xs font-bold uppercase tracking-wider text-subtle">Explica\u2019m qualsevol altra cosa</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              El que no cap en una casella: qu\u00e8 no sou, com no us hem de dir mai, un detall que ho canvia tot.
            </p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="No som una botiga, som un taller. I no ens diguis mai \u00abbarats\u00bb."
              className="mt-2.5 w-full resize-none rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent focus:bg-surface"
            />
            <div className="mt-2.5">
              {audio ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-text">
                  <Mic className="h-3.5 w-3.5 text-accent" /> Nota de veu a punt
                  <button type="button" onClick={() => { setAudio(null); setVoiceOpen(false) }} className="cursor-pointer text-subtle hover:text-danger" aria-label="Descartar la nota de veu">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : voiceOpen ? (
                <VoiceRecorder onRecording={r => setAudio(r?.blob ?? null)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setVoiceOpen(true)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3.5 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/50 hover:bg-surface-hover"
                >
                  <Mic className="h-4 w-4 text-accent" /> Prefereixo dir-ho parlant
                </button>
              )}
            </div>
          </div>

          {err && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </p>
          )}
        </div>
      )}

      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {editing ? (
          <>
            <Button glow size="lg" onClick={() => void save()} loading={saving} iconLeft={<Check className="h-4 w-4" />}>
              Desa-ho i continuem
            </Button>
            <button
              type="button"
              onClick={() => { setEditing(false); setErr(null) }}
              disabled={saving}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
            >
              Deixa-ho com estava
            </button>
          </>
        ) : (
          <>
            <Button glow size="lg" onClick={() => onContinue(current)} iconRight={<ArrowRight className="h-4 w-4" />}>
              Perfecte, continuem
            </Button>
            <button
              type="button"
              onClick={openEditor}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-text"
            >
              <PenLine className="h-3.5 w-3.5" /> Hi ha res que no quadra?
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** One correctable fact. A textarea where a sentence belongs, an input where a
 *  list belongs — the shape of the control is half the instruction. */
function EditField({ label, value, onChange, placeholder, hint, multiline = false }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  hint?: string
  multiline?: boolean
}) {
  const cls = 'mt-1.5 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent focus:bg-surface'
  return (
    <label className="block rounded-2xl border border-border bg-surface p-4 shadow-card">
      <span className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} placeholder={placeholder} className={cls + ' resize-none'} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
      {hint && <span className="mt-1 block text-[0.7rem] text-subtle">{hint}</span>}
    </label>
  )
}
