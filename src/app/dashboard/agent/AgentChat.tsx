'use client'

// Agent Console — talk to the same agent that answers on WhatsApp, from the
// dashboard. One turn = one `consoleAgentTurn` call (the agent decides
// clarify-or-draft); a returned draft renders as a compact card whose primary
// action opens the DRAFT READER (right drawer): the full article, readable,
// with Publish / Open-in-editor / Ask-for-changes right there. Replying while a
// draft is the edit target sends revision instructions (same loop as the phone
// channel).
//
// Layout contract: the component fills whatever height its parent gives it
// (lg), or caps itself to the visible viewport (mobile) — the composer must
// NEVER sit below the fold; only the message list scrolls.

import { useEffect, useRef, useState } from 'react'
import {
  Send, Sparkles, Check, PenLine, ExternalLink, X, ChevronDown, Globe, MessageCircle, BookOpen,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { consoleAgentTurn, consolePublish } from '@/lib/actions/agent-console'
import { togglePublish } from '@/lib/actions/posts'
import type { AgentDraft } from '@/lib/whatsapp/agent'

type Site = { id: string; name: string }

// Filled progressively: `saved` after "open in editor" (the post already
// exists as a draft), `published` once it is live.
type SavedInfo = { postId: string; editorUrl: string; liveUrl: string }
type PublishedInfo = { liveUrl: string; editorUrl: string }

// Body first, id stamped on push — `Omit` over a discriminated union would
// collapse it to the common keys.
type MsgBody =
  | { role: 'user'; text: string }
  | { role: 'agent'; kind: 'text'; text: string }
  | { role: 'agent'; kind: 'error'; text: string }
  | { role: 'agent'; kind: 'draft'; draft: AgentDraft; brief: string; saved?: SavedInfo; published?: PublishedInfo; discarded?: boolean }
type Msg = MsgBody & { id: number }
type DraftMsg = Extract<Msg, { kind: 'draft' }>

// The agent call is one strict-schema completion (no token stream), so the
// waiting bubble narrates honest stages on a timer instead of freezing.
const THINKING_STAGES = [
  'Llegeixo el brief…',
  'Trio l’angle i la intenció de cerca…',
  'Estructuro les seccions…',
  'Escric l’article…',
  'Poleixo el SEO…',
]

const SUGGESTIONS = [
  'Un article sobre les tendències del meu sector aquest any',
  'Una guia per a principiants del nostre producte principal',
  'Respon la pregunta que més ens fan els clients',
]

export default function AgentChat({ sites, initialSiteId }: { sites: Site[]; initialSiteId?: string }) {
  const { toast } = useToast()

  const [siteId, setSiteId] = useState(initialSiteId ?? sites[0]?.id ?? '')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  // The draft currently accepting edit instructions (null = next message is a
  // fresh brief). Identified by message id so the bubble can badge itself.
  const [editTarget, setEditTarget] = useState<{ msgId: number; draft: AgentDraft; brief: string } | null>(null)
  const [publishing, setPublishing] = useState<number | null>(null)
  // Draft reader drawer — points at the draft message it is reading.
  const [readerId, setReaderId] = useState<number | null>(null)

  const nextId = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const site = sites.find((s) => s.id === siteId) ?? sites[0]
  const readerMsg = (msgs.find((m) => m.id === readerId && m.role === 'agent' && m.kind === 'draft') ?? null) as DraftMsg | null

  // Keep the newest message in view (imperative DOM sync, not state).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  // Advance the thinking narration while waiting (async callback setState — ok).
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setStage((s) => Math.min(s + 1, THINKING_STAGES.length - 1)), 2600)
    return () => clearInterval(t)
  }, [busy])

  const push = (m: MsgBody) => {
    const id = nextId.current++
    setMsgs((prev) => [...prev, { ...m, id }])
    return id
  }

  const patchDraft = (msgId: number, patch: Partial<Omit<DraftMsg, 'id' | 'role' | 'kind'>>) => {
    setMsgs((prev) => prev.map((m) =>
      m.id === msgId && m.role === 'agent' && m.kind === 'draft' ? { ...m, ...patch } : m,
    ))
  }

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text || busy || !site) return
    setInput('')
    push({ role: 'user', text })
    setBusy(true)
    setStage(0)

    const editing = editTarget
    const res = await consoleAgentTurn(site.id, editing
      ? {
          editInstructions: text,
          currentDraft: { title: editing.draft.title, contentHtml: editing.draft.contentHtml, excerpt: editing.draft.excerpt },
        }
      : { brief: text })

    setBusy(false)
    if (!res.ok) { push({ role: 'agent', kind: 'error', text: res.error }); return }
    if (res.kind === 'clarify') { push({ role: 'agent', kind: 'text', text: res.message }); return }

    // A fresh draft (or a revision) becomes the new edit target automatically —
    // "keep talking to refine" is the natural mode.
    const brief = editing ? editing.brief : text
    const msgId = push({ role: 'agent', kind: 'draft', draft: res.draft, brief })
    setEditTarget({ msgId, draft: res.draft, brief })
  }

  // ── draft actions (used by both the bubble and the reader drawer) ──────────
  const publish = async (m: DraftMsg) => {
    if (!site || publishing !== null) return
    setPublishing(m.id)
    if (m.saved) {
      // Already saved from "open in editor" — just flip it live.
      const res = await togglePublish(m.saved.postId, site.id, true)
      setPublishing(null)
      if (res.error) { toast(res.error, 'error'); return }
      patchDraft(m.id, { published: { liveUrl: m.saved.liveUrl, editorUrl: m.saved.editorUrl } })
    } else {
      const res = await consolePublish(site.id, m.draft, { publish: true, brief: m.brief })
      setPublishing(null)
      if (!res.ok) { toast(res.error, 'error'); return }
      patchDraft(m.id, { published: { liveUrl: res.liveUrl, editorUrl: res.editorUrl } })
    }
    setEditTarget((t) => (t?.msgId === m.id ? null : t))
    toast('Article publicat!', 'success')
  }

  // Save as an editor draft and open the full editor in a NEW TAB — the chat
  // stays alive, and a later "Publica" flips the SAME post live (no duplicate).
  const openEditor = async (m: DraftMsg) => {
    if (!site || publishing !== null) return
    if (m.saved) { window.open(m.saved.editorUrl, '_blank', 'noopener'); return }
    setPublishing(m.id)
    const res = await consolePublish(site.id, m.draft, { publish: false, brief: m.brief })
    setPublishing(null)
    if (!res.ok) { toast(res.error, 'error'); return }
    patchDraft(m.id, { saved: { postId: res.postId, editorUrl: res.editorUrl, liveUrl: res.liveUrl } })
    window.open(res.editorUrl, '_blank', 'noopener')
  }

  const requestChanges = (m: DraftMsg) => {
    setEditTarget({ msgId: m.id, draft: m.draft, brief: m.brief })
    setReaderId(null)
    inputRef.current?.focus()
  }

  const discard = (msgId: number) => {
    patchDraft(msgId, { discarded: true })
    setEditTarget((t) => (t?.msgId === msgId ? null : t))
    setReaderId((r) => (r === msgId ? null : r))
  }

  if (sites.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-border bg-surface p-8 text-center">
        <Sparkles className="h-7 w-7 text-accent" />
        <p className="mt-3 text-sm font-bold text-text">Primer necessites un blog</p>
        <p className="mt-1 max-w-xs text-sm text-muted">Crea el teu blog i després l&apos;agent hi escriurà articles per tu.</p>
        <Button href="/benvinguda" size="sm" glow className="mt-4">Crear el meu blog</Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:h-full">
      {/* Header: who you're talking to + which blog it writes on */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
            <EndlessKnot size={18} glow />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-text">Agent Carma</p>
            <p className="text-xs leading-tight text-muted">Explica-li una idea i et prepara l&apos;article</p>
          </div>
        </div>
        <SitePicker sites={sites} value={siteId} onChange={setSiteId} disabled={busy} />
      </div>

      {/* Messages — the ONLY part that scrolls. */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <p className="max-w-sm text-sm text-muted">
              Escriu la idea d&apos;un article per a <span className="font-bold text-text">{site?.name}</span> — o prova&apos;n una:
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="cursor-pointer rounded-xl border border-border bg-bg-elevated px-3.5 py-2 text-left text-sm text-muted transition-colors hover:border-accent/40 hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-sm leading-relaxed text-text">
                  {m.text}
                </div>
              </div>
            )
          }
          if (m.kind === 'draft') {
            return (
              <DraftBubble
                key={m.id}
                m={m}
                isEditTarget={editTarget?.msgId === m.id}
                busy={publishing === m.id}
                onRead={() => setReaderId(m.id)}
                onChanges={() => requestChanges(m)}
                onDiscard={() => discard(m.id)}
              />
            )
          }
          return (
            <div key={m.id} className="flex">
              <div className={cn(
                'max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed',
                m.kind === 'error' ? 'border border-danger/25 bg-danger-soft text-danger' : 'bg-surface-subtle text-text',
              )}>
                {m.text}
              </div>
            </div>
          )
        })}

        {busy && (
          <div className="flex">
            <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md bg-surface-subtle px-3.5 py-2.5">
              <EndlessKnot size={16} glow spin />
              <span className="text-sm text-muted">{THINKING_STAGES[stage]}</span>
            </div>
          </div>
        )}
      </div>

      {/* Composer — pinned to the card bottom, always on screen. */}
      <div className="shrink-0 border-t border-border bg-bg-elevated p-3">
        {editTarget && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-1.5">
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-accent">
              <PenLine className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Editant «{editTarget.draft.title}» — el proper missatge són canvis</span>
            </span>
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              title="Començar una idea nova"
              className="cursor-pointer rounded p-0.5 text-accent transition-colors hover:bg-accent/15"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
            }}
            rows={2}
            placeholder={editTarget ? 'Quins canvis vols? (ex.: fes-lo més curt i afegeix exemples)' : 'De què vols l’article? Explica-ho com en una nota de veu…'}
            className="max-h-40 min-h-[3.25rem] flex-1 resize-y rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent"
          />
          <Button onClick={() => void send()} loading={busy} disabled={!input.trim()} glow iconLeft={<Send className="h-4 w-4" />}>
            Envia
          </Button>
        </div>
      </div>

      {/* Draft reader — the full article, readable, with the actions where you decide. */}
      {readerMsg && (
        <DraftReader
          m={readerMsg}
          busy={publishing === readerMsg.id}
          onClose={() => setReaderId(null)}
          onPublish={() => void publish(readerMsg)}
          onOpenEditor={() => void openEditor(readerMsg)}
          onChanges={() => requestChanges(readerMsg)}
        />
      )}
    </div>
  )
}

/* ───────────────────────── Draft card bubble (compact) ───────────────────────── */
function DraftBubble({ m, isEditTarget, busy, onRead, onChanges, onDiscard }: {
  m: DraftMsg
  isEditTarget: boolean
  busy: boolean
  onRead: () => void
  onChanges: () => void
  onDiscard: () => void
}) {
  const { draft, published, saved, discarded } = m
  return (
    <div className="flex">
      <div className={cn(
        'w-full max-w-[92%] overflow-hidden rounded-2xl rounded-bl-md border bg-bg-elevated transition-opacity',
        published ? 'border-success/30' : isEditTarget ? 'border-accent/40' : 'border-border',
        discarded && 'opacity-45',
      )}>
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-subtle px-3.5 py-2">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wider',
            published ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent',
          )}>
            {published
              ? <><Check className="h-3 w-3" /> Publicat</>
              : saved
                ? <><PenLine className="h-3 w-3" /> Desat a l&apos;editor</>
                : <><Sparkles className="h-3 w-3" /> Esborrany a punt</>}
          </span>
          {!published && !discarded && (
            <button
              type="button"
              onClick={onDiscard}
              title="Descartar l'esborrany"
              className="cursor-pointer rounded p-1 text-subtle transition-colors hover:bg-surface-hover hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="space-y-1.5 px-4 py-3">
          <h4 className="text-base font-extrabold leading-snug tracking-tight text-text">{draft.title}</h4>
          {draft.strategy && <p className="text-xs font-medium italic text-muted">{draft.strategy}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3.5 py-2.5">
          {published ? (
            <>
              <Button href={published.liveUrl} target="_blank" rel="noopener noreferrer" size="sm" glow iconLeft={<ExternalLink className="h-3.5 w-3.5" />}>
                Veure l&apos;article
              </Button>
              <Button href={published.editorUrl} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary" iconLeft={<PenLine className="h-3.5 w-3.5" />}>
                Editor
              </Button>
            </>
          ) : discarded ? (
            <span className="text-xs font-medium text-subtle">Esborrany descartat</span>
          ) : (
            <>
              <Button onClick={onRead} loading={busy} size="sm" glow iconLeft={<BookOpen className="h-3.5 w-3.5" />}>
                Llegeix i publica
              </Button>
              <Button onClick={onChanges} disabled={busy} size="sm" variant="secondary" iconLeft={<MessageCircle className="h-3.5 w-3.5" />}>
                Canvis
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────── Draft reader (right drawer) ───────────────────── */
// The article, full and readable, before you press anything — this is where
// approve/publish decisions actually happen. Content is the agent's own
// sanitized HTML (sanitizeHtml server-side), rendered with the token-driven
// .review-prose (same reading typography as /review, dark-mode aware).
function DraftReader({ m, busy, onClose, onPublish, onOpenEditor, onChanges }: {
  m: DraftMsg
  busy: boolean
  onClose: () => void
  onPublish: () => void
  onOpenEditor: () => void
  onChanges: () => void
}) {
  const { draft, published, saved } = m
  const words = draft.contentHtml.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length

  // Escape closes the reader (listener while mounted).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Tancar" onClick={onClose} className="absolute inset-0 cursor-default bg-black/35 backdrop-blur-[2px]" />
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-bg shadow-2xl"
        style={{ animation: 'slidein .28s cubic-bezier(0.16,1,0.3,1)' }}
        role="dialog"
        aria-label="Lector de l'esborrany"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-elevated px-5 py-3">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider',
            published ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent',
          )}>
            {published ? <><Check className="h-3 w-3" /> Publicat</> : <><Sparkles className="h-3 w-3" /> Esborrany</>}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-text"
            aria-label="Tancar el lector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Article */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-10">
          <h1 className="text-balance text-3xl font-extrabold leading-tight tracking-tight text-text">{draft.title}</h1>
          {draft.excerpt && <p className="mt-3 text-lg font-medium leading-relaxed text-muted">{draft.excerpt}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            {draft.categories.map((c) => (
              <span key={c} className="rounded-full bg-surface-subtle px-2 py-0.5 font-semibold text-muted">{c}</span>
            ))}
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{draft.focusKeyword}</span>
            <span className="font-medium text-subtle">· ~{words} paraules</span>
          </div>
          <hr className="my-6 border-border" />
          <div className="review-prose" dangerouslySetInnerHTML={{ __html: draft.contentHtml }} />
        </div>

        {/* Action bar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-bg-elevated px-5 py-3.5">
          {published ? (
            <>
              <Button href={published.liveUrl} target="_blank" rel="noopener noreferrer" glow iconLeft={<ExternalLink className="h-4 w-4" />}>
                Veure l&apos;article
              </Button>
              <Button href={published.editorUrl} target="_blank" rel="noopener noreferrer" variant="secondary" iconLeft={<PenLine className="h-4 w-4" />}>
                Obrir a l&apos;editor
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onPublish} loading={busy} glow iconLeft={<Check className="h-4 w-4" />}>
                Publica ara
              </Button>
              <Button onClick={onOpenEditor} disabled={busy} variant="secondary" iconLeft={<ExternalLink className="h-4 w-4" />}>
                {saved ? 'Torna a l’editor' : 'Obre a l’editor'}
              </Button>
              <button
                type="button"
                onClick={onChanges}
                disabled={busy}
                className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" /> Demana canvis
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

/* ───────────────────────── Site picker pill ───────────────────────── */
function SitePicker({ sites, value, onChange, disabled }: {
  sites: Site[]
  value: string
  onChange: (id: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = sites.find((s) => s.id === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (sites.length <= 1) {
    return (
      <span className="inline-flex max-w-[45%] items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted">
        <Globe className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="truncate">{current?.name ?? '—'}</span>
      </span>
    )
  }

  return (
    <div ref={ref} className="relative max-w-[50%]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex w-full cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent/40 disabled:opacity-60"
      >
        <Globe className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="truncate">{current?.name ?? 'Tria un lloc'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-border bg-bg-elevated py-1 shadow-pop">
          {sites.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s.id); setOpen(false) }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover',
                s.id === value ? 'font-bold text-accent' : 'text-text',
              )}
            >
              <span className="truncate flex-1">{s.name}</span>
              {s.id === value && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
