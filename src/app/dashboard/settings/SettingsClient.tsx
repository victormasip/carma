'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, Plus, Trash2, RefreshCw, Check, Clock, ShieldCheck, Globe,
  ChevronDown, Copy, MessageCircle, AlertCircle,
  User, Mail, KeyRound, Eye, EyeOff,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import {
  addPhoneNumber, regenerateVerifyCode, removePhoneNumber, setIdentitySites,
} from '@/lib/actions/whatsapp-settings'
import { updateDisplayName, updatePassword } from '@/lib/actions/account'

type Identity = {
  id: string
  phone_e164: string
  status: 'pending' | 'active' | 'blocked'
  verify_code: string | null
  verify_expires_at: string | null
  verified_at: string | null
  created_at: string
}
type Site = { id: string; name: string }
type Scope = { identity_id: string; site_id: string }

type Props = {
  email: string
  displayName: string
  isSuperAdmin: boolean
  agentNumber: string
  identities: Identity[]
  sites: Site[]
  scopes: Scope[]
}

// Shared field styling so every input on the page matches.
const FIELD = 'h-11 w-full rounded-xl border border-border-strong bg-bg-elevated px-3 text-sm text-text outline-none transition-colors focus:border-accent'

function waMeLink(agentNumber: string, prefill?: string): string | null {
  const digits = agentNumber.replace(/[^\d]/g, '')
  if (!digits) return null
  return prefill ? `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}` : `https://wa.me/${digits}`
}

export default function SettingsClient({ email, displayName, isSuperAdmin, agentNumber, identities, sites, scopes }: Props) {
  const hasPending = identities.some((i) => i.status === 'pending')
  const router = useRouter()

  // While a number is awaiting its code, poll for activation so the card flips to
  // "Verificat" moments after the owner texts the code (no manual refresh needed).
  // Pause while the tab is hidden — a backgrounded refresh wastes work and is the
  // kind of request most likely to drop and trip the segment error boundary.
  useEffect(() => {
    if (!hasPending) return
    const tick = () => { if (document.visibilityState === 'visible') router.refresh() }
    const t = setInterval(tick, 6000)
    return () => clearInterval(t)
  }, [hasPending, router])

  // Left-aligned, full-width layout matching every other sidebar page (PageHeader
  // + space-y-8 sections), NOT a centered narrow column. Account + Security sit in
  // a responsive two-up grid; the WhatsApp agent spans full width below.
  return (
    <div className="space-y-8">
      <PageHeader title="Configuració" description="Gestiona el teu compte i connecta el teu agent de WhatsApp." />

      <section className="space-y-4">
        <SectionLabel icon={<User className="h-4 w-4" />}>Compte</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <ProfileCard email={email} displayName={displayName} isSuperAdmin={isSuperAdmin} />
          <PasswordCard />
        </div>
      </section>

      <AgentSection
        agentNumber={agentNumber}
        identities={identities}
        sites={sites}
        scopes={scopes}
      />
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

/* ───────────────────────── WhatsApp agent ───────────────────────── */
function AgentSection({ agentNumber, identities, sites, scopes }: {
  agentNumber: string
  identities: Identity[]
  sites: Site[]
  scopes: Scope[]
}) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [newPhone, setNewPhone] = useState('')
  const router = useRouter()
  const agentLink = waMeLink(agentNumber)

  const add = () => {
    const value = newPhone.trim()
    if (!value) return
    startTransition(async () => {
      const res = await addPhoneNumber(value)
      if (res.ok) {
        setNewPhone('')
        toast('Número afegit. Envia el codi per WhatsApp per verificar-lo.', 'success')
        router.refresh()
      } else {
        toast(res.error, 'error')
      }
    })
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-accent" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-subtle">Agent de WhatsApp</h2>
      </div>

      {/* Hero: what it is + the number to text */}
      <div className="gold-trace gold-trace-aura [--gold-trace-w:1.5px] relative mb-5 overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft sm:flex">
            <EndlessKnot size={26} glow spin />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-text">Escriu articles des de WhatsApp</h3>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              Envia una nota de veu o un text amb la idea i l&apos;agent et prepara un esborrany SEO.
              El reps amb un enllaç per revisar-lo i publicar-lo al teu blog.
            </p>

            {agentNumber ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-border bg-bg-elevated px-3.5 py-2">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-subtle">Número de l&apos;agent</p>
                  <p className="font-mono text-base font-bold text-text">{agentNumber}</p>
                </div>
                {agentLink && (
                  <Button href={agentLink} target="_blank" rel="noopener noreferrer" glow iconLeft={<MessageCircle className="h-4 w-4" />}>
                    Obrir WhatsApp
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning">
                <AlertCircle className="h-4 w-4 shrink-0" />
                El número de l&apos;agent encara no està configurat (variable WA_AGENT_NUMBER).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Numbers list */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-text">Els teus números</h3>
          <span className="text-xs text-muted">{identities.length} {identities.length === 1 ? 'número' : 'números'}</span>
        </div>

        <div className="mt-4 space-y-3">
          {identities.length === 0 && (
            <p className="rounded-xl border border-dashed border-border-strong bg-surface-subtle px-4 py-6 text-center text-sm text-muted">
              Encara no has connectat cap número. Afegeix el teu WhatsApp per començar a dictar articles.
            </p>
          )}

          {identities.map((identity) => (
            <IdentityCard
              key={identity.id}
              identity={identity}
              agentNumber={agentNumber}
              sites={sites}
              scopeSiteIds={scopes.filter((s) => s.identity_id === identity.id).map((s) => s.site_id)}
            />
          ))}
        </div>

        {/* Add form */}
        <div className="mt-5 border-t border-border pt-5">
          <label className="text-xs font-semibold text-muted" htmlFor="new-phone">Afegeix un número de WhatsApp</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                id="new-phone"
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add() }}
                placeholder="+34 600 00 00 00"
                className="h-11 w-full rounded-xl border border-border-strong bg-bg-elevated pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-accent"
              />
            </div>
            <Button onClick={add} loading={pending} disabled={!newPhone.trim()} iconLeft={<Plus className="h-4 w-4" />}>
              Afegir número
            </Button>
          </div>
          <p className="mt-2 text-xs text-subtle">Inclou el prefix del país. Després enviaràs un codi per WhatsApp per verificar-lo.</p>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────── One bound number ─────────────────────── */
function IdentityCard({ identity, agentNumber, sites, scopeSiteIds }: {
  identity: Identity
  agentNumber: string
  sites: Site[]
  scopeSiteIds: string[]
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const isActive = identity.status === 'active'
  // Clock snapshot at mount keeps render pure (react-hooks/purity); expiry is
  // minutes-coarse and re-evaluated against fresh props after every refresh.
  const [mountedAt] = useState(() => Date.now())
  const codeExpired = identity.verify_expires_at ? new Date(identity.verify_expires_at).getTime() < mountedAt : true

  const remove = () => {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Eliminar aquest número?',
        message: `${identity.phone_e164} deixarà d'estar connectat a l'agent.`,
        confirmLabel: 'Eliminar',
        tone: 'danger',
      })
      if (!ok) return
      const res = await removePhoneNumber(identity.id)
      if (res.ok) { toast('Número eliminat.', 'success'); router.refresh() }
      else toast(res.error, 'error')
    })
  }

  const regenerate = () => {
    startTransition(async () => {
      const res = await regenerateVerifyCode(identity.id)
      if (res.ok) { toast('Codi nou generat.', 'success'); router.refresh() }
      else toast(res.error, 'error')
    })
  }

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isActive ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
          )}>
            {isActive ? <ShieldCheck className="h-4.5 w-4.5" /> : <Clock className="h-4.5 w-4.5" />}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold text-text">{identity.phone_e164}</p>
            <p className={cn('text-xs font-semibold', isActive ? 'text-success' : 'text-warning')}>
              {isActive ? 'Verificat' : 'Pendent de verificació'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Eliminar"
          className="cursor-pointer flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {!isActive && (
        <PendingPanel
          identity={identity}
          agentNumber={agentNumber}
          codeExpired={codeExpired}
          busy={busy}
          onRegenerate={regenerate}
        />
      )}

      {isActive && sites.length > 0 && (
        <SiteScopeEditor identityId={identity.id} sites={sites} scopeSiteIds={scopeSiteIds} />
      )}
    </div>
  )
}

function PendingPanel({ identity, agentNumber, codeExpired, busy, onRegenerate }: {
  identity: Identity
  agentNumber: string
  codeExpired: boolean
  busy: boolean
  onRegenerate: () => void
}) {
  const { toast } = useToast()
  const code = identity.verify_code ?? '——————'
  const link = waMeLink(agentNumber, code !== '——————' ? `Carma ${code}` : undefined)

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast('Codi copiat.', 'info') } catch { /* ignore */ }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-subtle p-4">
      {codeExpired ? (
        <div className="flex items-center gap-2 text-sm font-medium text-warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          El codi ha caducat. Genera&apos;n un de nou.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            Per verificar-lo, envia aquest codi des d&apos;aquest número al WhatsApp de l&apos;agent:
          </p>
          <button
            type="button"
            onClick={copy}
            title="Copiar el codi"
            className="group mt-3 inline-flex items-center gap-3 rounded-xl border border-border-strong bg-bg-elevated px-4 py-2.5"
          >
            <span className="font-mono text-2xl font-extrabold tracking-[0.3em] text-text">{code}</span>
            <Copy className="h-4 w-4 text-subtle transition-colors group-hover:text-accent" />
          </button>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {link && !codeExpired && (
          <Button href={link} target="_blank" rel="noopener noreferrer" size="sm" glow iconLeft={<MessageCircle className="h-3.5 w-3.5" />}>
            Verificar per WhatsApp
          </Button>
        )}
        <Button onClick={onRegenerate} loading={busy} size="sm" variant="secondary" iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>
          Generar codi nou
        </Button>
      </div>
    </div>
  )
}

function SiteScopeEditor({ identityId, sites, scopeSiteIds }: {
  identityId: string
  sites: Site[]
  scopeSiteIds: string[]
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  // Empty scope rows = ALL sites are publishable (the default).
  const initial = useMemo(
    () => new Set(scopeSiteIds.length ? scopeSiteIds : sites.map((s) => s.id)),
    [scopeSiteIds, sites],
  )
  const [selected, setSelected] = useState<Set<string>>(initial)

  const allSelected = selected.size === sites.length
  const summary = allSelected ? 'Tots els llocs' : `${selected.size} de ${sites.length} llocs`

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const save = () => {
    startTransition(async () => {
      const res = await setIdentitySites(identityId, Array.from(selected))
      if (res.ok) { toast('Abast desat.', 'success'); setOpen(false); router.refresh() }
      else toast(res.error, 'error')
    })
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <Globe className="h-4 w-4 text-subtle" /> On pot publicar
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {summary}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-1.5">
          {sites.map((site) => {
            const checked = selected.has(site.id)
            return (
              <label
                key={site.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-hover"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(site.id)}
                  className="h-4 w-4 shrink-0 accent-accent"
                />
                <span className="flex-1 truncate text-sm text-text">{site.name}</span>
                {checked && <Check className="h-3.5 w-3.5 text-accent" />}
              </label>
            )
          })}
          <p className="px-1 pt-1 text-xs text-subtle">Els llocs nous que afegeixis al teu compte s&apos;inclouen automàticament.</p>
          <div className="flex justify-end pt-1.5">
            <Button onClick={save} loading={busy} size="sm">Desar abast</Button>
          </div>
        </div>
      )}
    </div>
  )
}
