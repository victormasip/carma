'use client'

// /review/[token] — the mobile-first approve screen (T5).
//
// Read-first: the owner sees the destination blog, the title, and the full draft
// body rendered in our reading typography, then a single prominent gold CTA in a
// sticky bar publishes it. Premium "bento" aesthetic on the design-system tokens
// (dark-mode-aware for free). The token is the capability — no login wall.

import { useState, useTransition } from 'react'
import {
  Sparkles, MessageCircle, Clock, CheckCircle2, Link2Off,
  Pencil, ArrowUpRight, Send, ChevronDown,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { approveAndPublish } from './actions'

// ─── Atmospheric gold halos (the one decorative device) ───────────────────────
function Halos() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="halo halo-drift-a" style={{ width: 420, height: 420, top: -160, right: -120, background: 'rgba(245,188,0,0.16)' }} />
      <div className="halo halo-drift-b" style={{ width: 360, height: 360, bottom: -140, left: -120, background: 'rgba(245,188,0,0.10)' }} />
    </div>
  )
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'accent' ? 'bg-accent-soft text-accent-hover' : 'bg-surface-subtle text-muted border border-border',
      )}
    >
      {children}
    </span>
  )
}

// ─── Shared full-screen status view (invalid / expired / published) ───────────
export type StatusVariant = 'invalid' | 'expired' | 'published'

const STATUS_META: Record<StatusVariant, { icon: typeof CheckCircle2; ring: string; tint: string }> = {
  published: { icon: CheckCircle2, ring: 'text-success', tint: 'bg-success-soft' },
  expired: { icon: Clock, ring: 'text-warning', tint: 'bg-warning-soft' },
  invalid: { icon: Link2Off, ring: 'text-subtle', tint: 'bg-surface-subtle' },
}

export function StatusView({
  variant, title, message, actionHref, actionLabel,
}: {
  variant: StatusVariant
  title: string
  message: string
  actionHref?: string
  actionLabel?: string
}) {
  const { icon: Icon, ring, tint } = STATUS_META[variant]
  return (
    <main className="relative min-h-dvh bg-bg text-text flex items-center justify-center px-4 py-12">
      <Halos />
      <div className="relative w-full max-w-md text-center zen-fade-up">
        <div className={cn('mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl', tint)}>
          <Icon className={cn('h-10 w-10', ring)} strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-muted leading-relaxed">{message}</p>
        {actionHref && (
          <a
            href={actionHref}
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-text px-5 h-12 text-bg-elevated font-semibold hover:opacity-90 transition-opacity"
          >
            {actionLabel ?? "Veure l'article"} <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
        <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-subtle">Carma</p>
      </div>
    </main>
  )
}

// ─── The active review screen ─────────────────────────────────────────────────
export type ReviewScreenProps = {
  token: string
  siteName: string
  title: string
  html: string // already sanitized server-side
  excerpt: string
  focusKeyword: string
  categories: string[]
  transcript: string | null
  readingMin: number
  editUrl: string
}

export default function ReviewScreen(props: ReviewScreenProps) {
  const { token, siteName, title, html, excerpt, focusKeyword, categories, transcript, readingMin, editUrl } = props
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState<{ url: string } | null>(null)
  const [expired, setExpired] = useState(false)
  const [error, setError] = useState('')

  function onApprove() {
    setError('')
    startTransition(async () => {
      const res = await approveAndPublish(token)
      if (res.ok) setDone({ url: res.url })
      else if (res.state === 'expired') setExpired(true)
      else setError(res.error)
    })
  }

  if (done) {
    return (
      <StatusView
        variant="published"
        title="Publicat ✓"
        message="El teu article ja és online al teu blog. Bona feina!"
        actionHref={done.url}
        actionLabel="Veure l'article"
      />
    )
  }
  if (expired) {
    return (
      <StatusView
        variant="expired"
        title="Enllaç caducat"
        message="Aquest enllaç ja no és vàlid. Torna a enviar-me la teva nota i te'n preparo un de nou."
      />
    )
  }

  return (
    <main className="relative min-h-dvh bg-bg text-text pb-32">
      <Halos />

      <div className="relative mx-auto max-w-2xl px-4 pt-8 sm:pt-12">
        {/* Origin / destination */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow"><span className="dot" /> Esborrany de Carma</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
            <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" /> via WhatsApp
          </span>
        </div>
        <p className="mt-3 text-sm text-muted">
          Article per a <span className="font-bold text-text">{siteName || 'el teu blog'}</span>
        </p>

        {/* Draft card */}
        <article className="mt-5 rounded-2xl border border-border bg-surface shadow-premium p-6 sm:p-8 zen-fade-up">
          <div className="flex flex-wrap items-center gap-2">
            <Chip><Clock className="h-3.5 w-3.5" /> {readingMin} min de lectura</Chip>
            {focusKeyword && <Chip tone="accent">{focusKeyword}</Chip>}
            {categories.slice(0, 2).map((c) => <Chip key={c}>{c}</Chip>)}
          </div>

          <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-text">
            {title}
          </h1>
          {excerpt && <p className="mt-3 text-lg text-muted leading-relaxed">{excerpt}</p>}

          <hr className="my-6 border-border" />

          <div className="review-prose" dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        {/* Original voice note */}
        {transcript && (
          <details className="group mt-4 rounded-2xl border border-border bg-surface-subtle px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-muted">
              <span className="inline-flex items-center gap-2"><Send className="h-4 w-4" /> La teva nota original</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted whitespace-pre-wrap">{transcript}</p>
          </details>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>
        )}
      </div>

      {/* Sticky approve bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg-elevated/90 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            glow
            loading={pending}
            onClick={onApprove}
            iconLeft={<Sparkles className="h-4 w-4" />}
          >
            {pending ? 'Publicant…' : 'Aprovar i Publicar'}
          </Button>
          <a
            href={editUrl}
            className="mt-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-muted hover:text-text transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" /> Edita-ho primer al Carma
          </a>
        </div>
      </div>
    </main>
  )
}
