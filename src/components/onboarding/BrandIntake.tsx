'use client'

// The unified onboarding surface (Fase 1).
//
// WAS: a two-card fork — "Clone my web" (a URL field) on the left, "Start from a
// template" on the right. Two decisions before the owner had told us anything
// about themselves, and a Brand Brain that stayed empty either way.
//
// NOW: one question, and every answer is valid.
//
//     Explica'ns qui sou.
//     Enganxa la teva web · deixa anar els teus documents · o prem i parla.
//
// The surface accepts a URL, files dropped anywhere on it, a voice note, or typed
// text — in any combination — and the system works out what to do with it. The
// template path stays, demoted to the honest escape hatch it is: "I don't have a
// website yet."
//
// Everything the owner gives here goes into the Brand Brain, which is written to
// `site_brain_profiles` BEFORE the first article, so the WhatsApp agent knows the
// brand on turn one instead of after enough posts to distil.

import { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Globe, FileText, X, Sparkles, ArrowRight, Wand2, Palette, Upload, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/cn'

// The mic is a decision, not a default: most owners type or paste. Loading
// the recorder (and the MediaRecorder plumbing behind it) only when the tab
// is opened keeps it off every first paint — the same split Door already
// makes on the landing. `next/dynamic` rather than `lazy`, so no Suspense
// boundary is needed for a component that renders inside a tab panel.
const VoiceRecorder = dynamic(() => import('./VoiceRecorder'))

const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MAX_FILES = 6

function isAccepted(f: File): boolean {
  const t = (f.type || '').toLowerCase()
  if (t === 'application/pdf' || t.includes('wordprocessingml') || t.startsWith('text/')) return true
  return /\.(pdf|docx|txt|md)$/i.test(f.name)
}

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

/** A pasted URL is the common case; a typed sentence is the other one. */
function looksLikeUrl(v: string): boolean {
  const s = v.trim()
  if (!s || /\s/.test(s)) return false
  return /^https?:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s)
}

export type BrandIntakeValue = {
  url: string
  text: string
  files: File[]
  audio: Blob | null
}

export default function BrandIntake({
  siteName, initialUrl, onSubmit, onNoWebsite, busy,
}: {
  siteName: string
  initialUrl?: string
  onSubmit: (v: BrandIntakeValue) => void
  onNoWebsite: () => void
  busy?: boolean
}) {
  const [input, setInput] = useState(initialUrl ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [audio, setAudio] = useState<Blob | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return
    const next = Array.from(incoming).filter(isAccepted)
    if (next.length === 0) return
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}:${f.size}`))
      return [...prev, ...next.filter(f => !seen.has(`${f.name}:${f.size}`))].slice(0, MAX_FILES)
    })
  }, [])

  const urlish = looksLikeUrl(input)
  const hasAnything = urlish || input.trim().length > 12 || files.length > 0 || !!audio

  const submit = () => {
    if (!hasAnything || busy) return
    onSubmit({
      url: urlish ? normalizeUrl(input) : '',
      text: urlish ? '' : input.trim(),
      files,
      audio,
    })
  }

  return (
    // Drop target is the WHOLE surface, not a 200px dashed box. Someone dragging a
    // brand guide should be able to let go anywhere and have it work.
    <div
      onDragEnter={e => { e.preventDefault(); dragDepth.current++; setDragging(true) }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={e => { e.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}
      onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); addFiles(e.dataTransfer?.files ?? null) }}
      className={cn('w-full rounded-3xl transition-shadow', dragging && 'drop-active')}
    >
      <div className="text-center">
        <span className="eyebrow-chip inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
          <Sparkles className="h-3.5 w-3.5" /> {siteName}
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Explica&apos;ns qui sou<span className="text-accent">.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          Enganxa la teva web, deixa anar els teus documents, o prem i parla.
          Amb el que ens donis, el teu agent aprendrà a escriure com tu — abans del primer article.
        </p>
      </div>

      {/* ── The one input ──────────────────────────────────────────────────── */}
      <div className="gold-trace gold-trace-aura [--gold-trace-w:1px] relative mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-transparent bg-surface p-5 shadow-card sm:p-6">
        <label htmlFor="brand-intake" className="sr-only">La teva web o una descripció del negoci</label>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-3.5 top-3.5 h-4.5 w-4.5 text-subtle" />
          <textarea
            id="brand-intake"
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onPaste={e => {
              const dropped = e.clipboardData?.files
              if (dropped && dropped.length) { e.preventDefault(); addFiles(dropped) }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
            }}
            placeholder="la-meva-web.com — o descriu el negoci amb les teves paraules"
            disabled={busy}
            className="w-full resize-none rounded-xl border border-border bg-surface-subtle py-3 pl-11 pr-3 text-base text-text outline-none transition-colors placeholder:text-subtle focus:border-accent focus:bg-surface disabled:opacity-60"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
        </div>

        {/* ── Secondary inputs ─────────────────────────────────────────────── */}
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="group flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm font-semibold text-text transition-colors hover:border-accent/50 hover:bg-surface-hover disabled:opacity-60"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent transition-transform group-hover:scale-105">
              <Upload className="h-4 w-4" />
            </span>
            Afegeix documents
            <span className="hidden text-xs font-medium text-subtle sm:inline">· PDF, Word</span>
          </button>
          <VoiceRecorder onRecording={r => setAudio(r?.blob ?? null)} disabled={busy} />
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />

        {files.length > 0 && (
          <ul className="zen-fade-up mt-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-subtle py-1.5 pl-2.5 pr-1.5 text-xs"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="max-w-[14rem] truncate font-medium text-text">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Treure ${f.name}`}
                  onClick={() => setFiles(prev => prev.filter((_, n) => n !== i))}
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-subtle transition-colors hover:bg-bg-elevated hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button
          glow
          size="lg"
          fullWidth
          className="mt-4 !h-13"
          disabled={!hasAnything}
          loading={busy}
          onClick={submit}
          iconLeft={<Wand2 className="h-4 w-4" />}
        >
          {busy ? 'Entenent la teva marca…' : 'Crea el meu blog'}
        </Button>

        {/* What each input buys them — stated, not implied. */}
        <ul className="mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-subtle">
          <Hint on={urlish}>Clonem el disseny i aprenem la teva veu</Hint>
          <Hint on={files.length > 0}>Llegim els teus documents</Hint>
          <Hint on={!!audio}>T&apos;escoltem</Hint>
        </ul>
      </div>

      {/* ── The other path, not a footnote ─────────────────────────────────
          For an owner with no website this is not an escape hatch, it is THE
          route — and it used to be a grey text link under four lines of hints. */}
      <div className="mx-auto mt-7 max-w-2xl">
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-subtle">o</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <button
          type="button"
          onClick={onNoWebsite}
          disabled={busy}
          className="group mt-4 flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/60 hover:bg-surface-hover disabled:opacity-60"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Palette className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-extrabold tracking-tight text-text">
              Encara no tinc web
            </span>
            <span className="mt-0.5 block text-sm leading-snug text-muted">
              Tria un disseny i tens el blog en marxa igualment. La teva veu l&apos;aprèn parlant amb tu.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
        </button>
      </div>

      {dragging && (
        <p className="mt-4 text-center text-sm font-semibold text-accent">
          Deixa-ho anar on vulguis.
        </p>
      )}
    </div>
  )
}

/** A hint that lights up once the owner has actually provided that input. */
function Hint({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5 transition-colors', on && 'text-success')}>
      {on
        ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
        : <span className="h-1 w-1 rounded-full bg-border-strong" aria-hidden />}
      {children}
    </li>
  )
}
