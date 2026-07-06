'use client'

// Agent — the WhatsApp CONNECTION panel (moved here from Configuració, verbatim
// behaviour): agent number + wa.me deep link, the owner's bound numbers with the
// OTP verify flow, and the per-number "where can it publish" site scope editor.
// All mutations go through the existing whatsapp-settings server actions.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, Plus, Trash2, RefreshCw, Check, Clock, ShieldCheck, Globe,
  ChevronDown, Copy, MessageCircle, AlertCircle,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import {
  addPhoneNumber, regenerateVerifyCode, removePhoneNumber, setIdentitySites,
} from '@/lib/actions/whatsapp-settings'
import { waMeLink } from '@/lib/whatsapp/waMe'

export type Identity = {
  id: string
  phone_e164: string
  status: 'pending' | 'active' | 'blocked'
  verify_code: string | null
  verify_expires_at: string | null
  verified_at: string | null
  created_at: string
}
export type Site = { id: string; name: string }
export type Scope = { identity_id: string; site_id: string }

export default function AgentConnection({ agentNumber, identities, sites, scopes }: {
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

  // While a number is awaiting its code, poll for activation so the card flips to
  // "Verificat" moments after the owner texts the code (no manual refresh needed).
  // Paused while the tab is hidden, and it GIVES UP after ~4 minutes: each tick
  // re-renders the whole route server-side (several Supabase queries), so an
  // abandoned pending number must not keep the page churning forever.
  const hasPending = identities.some((i) => i.status === 'pending')
  useEffect(() => {
    if (!hasPending) return
    let ticks = 0
    const t = setInterval(() => {
      if (++ticks > 24) { clearInterval(t); return }
      if (document.visibilityState === 'visible') router.refresh()
    }, 10_000)
    return () => clearInterval(t)
  }, [hasPending, router])

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
    <div className="space-y-4">
      {/* Hero: what it is + the number to text */}
      <div className="gold-trace gold-trace-aura [--gold-trace-w:1.5px] relative overflow-hidden rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start gap-3.5">
          <div className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft sm:flex">
            <EndlessKnot size={24} glow spin />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-text">El teu agent, per WhatsApp</h3>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              Envia una nota de veu o un text amb la idea i l&apos;agent et prepara un esborrany SEO
              amb un enllaç per revisar-lo i publicar-lo.
            </p>

            {agentNumber ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-border bg-bg-elevated px-3.5 py-2">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-subtle">Número de l&apos;agent</p>
                  <p className="font-mono text-sm font-bold text-text">{agentNumber}</p>
                </div>
                {agentLink && (
                  <Button href={agentLink} target="_blank" rel="noopener noreferrer" size="sm" glow iconLeft={<MessageCircle className="h-4 w-4" />}>
                    Obrir WhatsApp
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning">
                <AlertCircle className="h-4 w-4 shrink-0" />
                El número de l&apos;agent encara no està configurat (variable WA_AGENT_NUMBER). El xat d&apos;aquí al costat funciona igualment.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Numbers list */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-text">Els teus números</h3>
          <span className="text-xs text-muted">{identities.length} {identities.length === 1 ? 'número' : 'números'}</span>
        </div>

        <div className="mt-4 space-y-3">
          {identities.length === 0 && (
            <p className="rounded-xl border border-dashed border-border-strong bg-surface-subtle px-4 py-6 text-center text-sm text-muted">
              Encara no has connectat cap número. Afegeix el teu WhatsApp per dictar articles des del mòbil.
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
          <div className="mt-2 flex flex-col gap-2">
            <div className="relative">
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
    </div>
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
