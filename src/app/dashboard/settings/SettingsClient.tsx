'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { User, Mail, KeyRound, Eye, EyeOff, MessageCircle, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { updateDisplayName, updatePassword } from '@/lib/actions/account'

type Props = {
  email: string
  displayName: string
  isSuperAdmin: boolean
}

// Shared field styling so every input on the page matches.
const FIELD = 'h-11 w-full rounded-xl border border-border-strong bg-bg-elevated px-3 text-sm text-text outline-none transition-colors focus:border-accent'

export default function SettingsClient({ email, displayName, isSuperAdmin }: Props) {
  // Left-aligned, full-width layout matching every other sidebar page (PageHeader
  // + space-y-8 sections). The WhatsApp agent now lives in its own sidebar space
  // (/dashboard/agent) — a pointer card below keeps old muscle memory working.
  return (
    <div className="space-y-8">
      <PageHeader title="Configuració" description="Gestiona el teu compte." />

      <section className="space-y-4">
        <SectionLabel icon={<User className="h-4 w-4" />}>Compte</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <ProfileCard email={email} displayName={displayName} isSuperAdmin={isSuperAdmin} />
          <PasswordCard />
        </div>
      </section>

      <AgentMovedCard />
    </div>
  )
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-accent">
      {icon}
      <h2 className="text-xs font-bold uppercase tracking-wider text-subtle">{children}</h2>
    </div>
  )
}

/* ─────────────── Pointer: the agent has its own space now ─────────────── */
function AgentMovedCard() {
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="flex items-center gap-3.5 min-w-0">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
          <EndlessKnot size={24} glow />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">L&apos;Agent té el seu propi espai</p>
          <p className="mt-0.5 text-sm text-muted">
            Connecta el WhatsApp, xateja amb l&apos;agent i revisa què ha publicat des de la pestanya <span className="font-semibold text-text">Agent</span>.
          </p>
        </div>
      </div>
      <Button href="/dashboard/agent" glow iconLeft={<MessageCircle className="h-4 w-4" />} className="shrink-0">
        <span className="inline-flex items-center gap-1.5">Obrir l&apos;Agent <ArrowRight className="h-4 w-4" /></span>
      </Button>
    </div>
  )
}

/* ───────────────────────────── Profile (name + email) ───────────────────────────── */
function ProfileCard({ email, displayName, isSuperAdmin }: { email: string; displayName: string; isSuperAdmin: boolean }) {
  const { toast } = useToast()
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [busy, startTransition] = useTransition()
  const dirty = name.trim() !== displayName.trim()

  const save = () => {
    if (!dirty) return
    startTransition(async () => {
      const res = await updateDisplayName(name)
      if (res.ok) { toast('Nom actualitzat.', 'success'); router.refresh() }
      else toast(res.error, 'error')
    })
  }

  const initials = (name || email).trim().split(/\s+/).map((w) => w[0]?.toUpperCase()).join('').slice(0, 2) || '·'

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-base font-bold text-accent">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text">{name || 'El teu nom'}</p>
          <span className={cn(
            'mt-0.5 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide',
            isSuperAdmin ? 'bg-accent-soft text-accent' : 'bg-surface-hover text-muted',
          )}>
            {isSuperAdmin ? 'Superadmin' : 'Client'}
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="display-name" className="text-xs font-semibold text-muted">Nom visible</label>
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder="Com t'has de mostrar"
            className={cn(FIELD, 'mt-1.5')}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Correu electrònic</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 h-11">
            <Mail className="h-4 w-4 shrink-0 text-subtle" />
            <span className="truncate text-sm text-muted">{email}</span>
          </div>
          <p className="mt-1.5 text-xs text-subtle">El correu és el teu identificador d&apos;accés i no es pot canviar des d&apos;aquí.</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} loading={busy} disabled={!dirty} size="sm">Desar canvis</Button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── Password ───────────────────────────── */
function PasswordCard() {
  const { toast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, startTransition] = useTransition()

  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm

  const submit = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await updatePassword(current, next)
      if (res.ok) {
        toast('Contrasenya actualitzada.', 'success')
        setCurrent(''); setNext(''); setConfirm('')
      } else {
        toast(res.error, 'error')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-muted">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">Contrasenya</p>
          <p className="mt-0.5 text-xs text-muted">Mínim 8 caràcters. Et demanem l&apos;actual per seguretat.</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <PasswordInput value={current} onChange={setCurrent} placeholder="Contrasenya actual" show={show} autoComplete="current-password" />
        <PasswordInput value={next} onChange={setNext} placeholder="Nova contrasenya" show={show} autoComplete="new-password" />
        <div>
          <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repeteix la nova contrasenya" show={show} autoComplete="new-password" onEnter={submit} />
          {mismatch && <p className="mt-1.5 text-xs font-medium text-danger">Les contrasenyes no coincideixen.</p>}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {show ? 'Amagar' : 'Mostrar'}
          </button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit} size="sm">Canviar contrasenya</Button>
        </div>
      </div>
    </div>
  )
}

function PasswordInput({ value, onChange, placeholder, show, autoComplete, onEnter }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  show: boolean
  autoComplete: string
  onEnter?: () => void
}) {
  return (
    <input
      type={show ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter() }}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className={FIELD}
    />
  )
}
