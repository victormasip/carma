'use client'

// Agent Console — talk to the same agent that answers on WhatsApp, from the
// dashboard. One turn = one `consoleAgentTurn` call (the agent decides
// clarify-or-draft); a returned draft renders as a card with Publish / Edit /
// Open-in-editor actions. "Edit" keeps the draft as the revision target: the
// next message becomes edit instructions (same loop as the phone channel).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Send, Sparkles, Check, PenLine, ExternalLink, X, ChevronDown, Globe, MessageCircle,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { consoleAgentTurn, consolePublish } from '@/lib/actions/agent-console'
import type { AgentDraft } from '@/lib/whatsapp/agent'

type Site = { id: string; name: string }

type PublishedInfo = { liveUrl: string; editorUrl: string; publishedNow: boolean }

// Body first, id stamped on push — `Omit` over a discriminated union would
// collapse it to the common keys.
type MsgBody =
  | { role: 'user'; text: string }
  | { role: 'agent'; kind: 'text'; text: string }
  | { role: 'agent'; kind: 'error'; text: string }
  | { role: 'agent'; kind: 'draft'; draft: AgentDraft; brief: string; published?: PublishedInfo; discarded?: boolean }
type Msg = MsgBody & { id: number }

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
  const router = useRouter()
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

  const nextId = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const site = sites.find((s) => s.id === siteId) ?? sites[0]

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

  const publish = async (msgId: number, draft: AgentDraft, brief: string, publishNow: boolean) => {
    if (!site || publishing !== null) return
    setPublishing(msgId)
    const res = await consolePublish(site.id, draft, { publish: publishNow, brief })
    setPublishing(null)
    if (!res.ok) { toast(res.error, 'error'); return }

    if (!publishNow) { router.push(res.editorUrl); return }

    setMsgs((prev) => prev.map((m) =>
      m.id === msgId && m.role === 'agent' && m.kind === 'draft'
        ? { ...m, published: { liveUrl: res.liveUrl, editorUrl: res.editorUrl, publishedNow: true } }
        : m,
    ))
    setEditTarget((t) => (t?.msgId === msgId ? null : t))
    toast('Article publicat!', 'success')
  }

  const discard = (msgId: number) => {
    setMsgs((prev) => prev.map((m) =>
      m.id === msgId && m.role === 'agent' && m.kind === 'draft' ? { ...m, discarded: true } : m,
    ))
    setEditTarget((t) => (t?.msgId === msgId ? null : t))
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
    <div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Header: who you're talking to + which blog it writes on */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3">
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

      {/* Messages */}
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
                draft={m.draft}
                published={m.published}
                discarded={m.discarded}
                isEditTarget={editTarget?.msgId === m.id}
                publishing={publishing === m.id}
                onPublish={() => publish(m.id, m.draft, m.brief, true)}
                onOpenEditor={() => publish(m.id, m.draft, m.brief, false)}
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

      {/* Composer */}
      <div className="border-t border-border bg-bg-elevated p-3">
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
    </div>
  )
}

/* ───────────────────────── Draft card bubble ───────────────────────── */
function DraftBubble({ draft, published, discarded, isEditTarget, publishing, onPublish, onOpenEditor, onDiscard }: {
  draft: AgentDraft
  published?: PublishedInfo
  discarded?: boolean
  isEditTarget: boolean
  publishing: boolean
  onPublish: () => void
  onOpenEditor: () => void
  onDiscard: () => void
}) {
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
            {published ? <><Check className="h-3 w-3" /> Publicat</> : <><Sparkles className="h-3 w-3" /> Esborrany</>}
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

        <div className="space-y-2 px-4 py-3.5">
          <h4 className="text-base font-extrabold leading-snug tracking-tight text-text">{draft.title}</h4>
          {draft.strategy && <p className="text-xs font-medium italic text-muted">{draft.strategy}</p>}
          {draft.excerpt && <p className="text-sm leading-relaxed text-muted">{draft.excerpt}</p>}
          {draft.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {draft.categories.map((c) => (
                <span key={c} className="rounded-full bg-surface-subtle px-2 py-0.5 text-[0.7rem] font-semibold text-muted">{c}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3.5 py-2.5">
          {published ? (
            <>
              <Button href={published.liveUrl} target="_blank" rel="noopener noreferrer" size="sm" glow iconLeft={<ExternalLink className="h-3.5 w-3.5" />}>
                Veure l&apos;article
              </Button>
              <Button href={published.editorUrl} size="sm" variant="secondary" iconLeft={<PenLine className="h-3.5 w-3.5" />}>
                Obrir a l&apos;editor
              </Button>
            </>
          ) : discarded ? (
            <span className="text-xs font-medium text-subtle">Esborrany descartat</span>
          ) : (
            <>
              <Button onClick={onPublish} loading={publishing} size="sm" glow iconLeft={<Check className="h-3.5 w-3.5" />}>
                Aprova i publica
              </Button>
              <Button onClick={onOpenEditor} disabled={publishing} size="sm" variant="secondary" iconLeft={<PenLine className="h-3.5 w-3.5" />}>
                Obre a l&apos;editor
              </Button>
              {isEditTarget && (
                <span className="ml-auto hidden items-center gap-1 text-[0.7rem] font-semibold text-accent sm:inline-flex">
                  <MessageCircle className="h-3 w-3" /> Respon per demanar canvis
                </span>
              )}
            </>
          )}
        </div>
      </div>
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
