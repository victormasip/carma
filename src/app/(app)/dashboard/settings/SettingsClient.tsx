'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, Mail, KeyRound, Eye, EyeOff, MessageCircle, ArrowRight, MapPin,
  Store, Check, AlertCircle, Sparkles,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import EndlessKnot from '@/components/ui/EndlessKnot'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { updateDisplayName, updatePassword, updateTown } from '@/lib/actions/account'
import { setSiteShowcase } from '@/lib/actions/showcase'
import { KARMA_REWARDS } from '@/lib/karma/config'

/** One of the owner's blogs, as the Aparador card needs to talk about it. */
export type ShowcaseSite = {
  id: string
  name: string
  showcase: boolean
  /** Has a subdomain — without one the wall has nowhere to send a visitor. */
  hasAddress: boolean
  publishedPosts: number
}

type Props = {
  email: string
  displayName: string
  /** profiles.town — what puts this member on the community map. */
  town: string
  isSuperAdmin: boolean
  showcaseSites: ShowcaseSite[]
  /** False before migration 038 — the card says so instead of pretending. */
  showcaseAvailable: boolean
}

// Shared field styling so every input on the page matches.
const FIELD = 'h-11 w-full rounded-xl border border-border-strong bg-bg-elevated px-3 text-sm text-text outline-none transition-colors focus:border-accent'

export default function SettingsClient({
  email, displayName, town, isSuperAdmin, showcaseSites, showcaseAvailable,
}: Props) {
  // Left-aligned, full-width layout matching every other sidebar page (PageHeader
  // + space-y-8 sections). The WhatsApp agent now lives in its own sidebar space
  // (/dashboard/agent) — a pointer card below keeps old muscle memory working.
  return (
    <div className="space-y-8">
      <PageHeader title="Configuració" description="Gestiona el teu compte." />

      <section className="space-y-4">
        <SectionLabel icon={<User className="h-4 w-4" />}>Compte</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <ProfileCard email={email} displayName={displayName} town={town} isSuperAdmin={isSuperAdmin} />
          <PasswordCard />
        </div>
      </section>

      {showcaseSites.length > 0 && (
        <section className="space-y-4">
          <SectionLabel icon={<Store className="h-4 w-4" />}>Comunitat</SectionLabel>
          <ShowcaseCard sites={showcaseSites} available={showcaseAvailable} />
        </section>
      )}

      <AgentMovedCard />
    </div>
  )
}

/* ─────────────────────────── L'APARADOR PÚBLIC ───────────────────────────
 * The opt-in to the "Fet amb Carma" wall on the landing page.
 *
 * Until now the wall took every public blog that had published something. That
 * was defensible — everything on it was already open to the internet — and it
 * was still the wrong default: being on Carma's own front page is a decision,
 * not a side effect of publishing. This card is where the decision is made.
 *
 * THREE THINGS THIS CARD REFUSES TO DO
 *
 *   · Default to on. Every switch starts off, for every blog, forever.
 *   · Pretend a blog will appear when it cannot. The wall also needs a public
 *     address and at least one published article, so a blog missing either says
 *     so RIGHT THERE, next to its own switch, rather than leaving someone to
 *     wonder for a week why they never showed up.
 *   · Make the reward the reason. The +40 is mentioned once, under the
 *     explanation, and it is never the headline — if the only argument for
 *     appearing is the points, the opt-in is not informed consent.
 * ────────────────────────────────────────────────────────────────────────── */
const APARADOR = KARMA_REWARDS.find(r => r.key === 'aparador')!

function ShowcaseCard({ sites, available }: { sites: ShowcaseSite[]; available: boolean }) {
  const { toast } = useToast()
  const [, startTransition] = useTransition()
  const [state, setState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sites.map(s => [s.id, s.showcase])),
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Already paid this session, so the flourish does not repeat on a re-toggle. */
  const [rewarded, setRewarded] = useState(sites.some(s => s.showcase))

  const toggle = (site: ShowcaseSite) => {
    if (busyId || !available) return
    const next = !state[site.id]
    setBusyId(site.id)
    // Optimistic: the switch is the answer to a question the person just asked.
    setState(v => ({ ...v, [site.id]: next }))

    startTransition(async () => {
      const res = await setSiteShowcase(site.id, next)
      if (!res.ok) {
        setState(v => ({ ...v, [site.id]: !next }))
        setBusyId(null)
        toast(res.error, 'error')
        return
      }
      setBusyId(null)
      if (res.earned > 0) {
        setRewarded(true)
        toast(`Ja ets a l’aparador ✨ +${res.earned} Punts de Carma`, 'success')
      } else if (next) {
        toast('Fet: el teu blog pot sortir al mur de la portada 👋', 'success')
      } else {
        toast('Retirat de l’aparador. Cap problema.', 'success')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Store className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text">Aparador públic</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            El mur «Fet amb Carma» de la portada ensenya blogs de membres de veritat, pintats amb els seus
            colors i la seva lletra, enllaçats al lloc real. Hi surts només si ho dius aquí, i te’n pots
            fer enrere quan vulguis.
          </p>
          {!rewarded && available && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
              <Sparkles className="h-3.5 w-3.5" /> La primera vegada et sumem +{APARADOR.amount} punts
            </p>
          )}
        </div>
      </div>

      {!available && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          L’aparador encara no està actiu en aquest entorn (migració 038 pendent).
        </p>
      )}

      <ul className="mt-5 divide-y divide-border border-t border-border">
        {sites.map(site => {
          const on = state[site.id] === true
          // The honest caveat, per blog. A blog can be opted in and still not
          // appear, and the switch must not imply otherwise.
          const missing = !site.hasAddress
            ? 'Encara no té adreça pública'
            : site.publishedPosts === 0
              ? 'Encara no hi ha cap article publicat'
              : null
          return (
            <li key={site.id} className="flex items-center gap-3 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text">{site.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  {on
                    ? <span className="inline-flex items-center gap-1 font-bold text-success"><Check className="h-3 w-3" strokeWidth={3} /> A l’aparador</span>
                    : <span className="text-subtle">Fora de l’aparador</span>}
                  {on && missing && <span className="text-warning">· {missing}, així que encara no hi apareixerà</span>}
                  {!on && (
                    <span className="text-subtle">
                      · {site.publishedPosts} article{site.publishedPosts === 1 ? '' : 's'} publicat{site.publishedPosts === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
              </span>
              <ShowcaseSwitch
                checked={on}
                busy={busyId === site.id}
                disabled={!available || (!!busyId && busyId !== site.id)}
                onClick={() => toggle(site)}
                label={site.name}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ShowcaseSwitch({ checked, busy, disabled, onClick, label }: {
  checked: boolean
  busy: boolean
  disabled: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={`Aparador públic per a ${label}`}
      title={checked ? 'Treure’l de l’aparador' : 'Posar-lo a l’aparador'}
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-border-strong',
        (disabled || busy) && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className={cn(
        'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
        checked && 'translate-x-5',
      )} />
    </button>
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
function ProfileCard({ email, displayName, town, isSuperAdmin }: { email: string; displayName: string; town: string; isSuperAdmin: boolean }) {
  const { toast } = useToast()
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [place, setPlace] = useState(town)
  const [busy, startTransition] = useTransition()
  const nameDirty = name.trim() !== displayName.trim()
  const townDirty = place.trim() !== town.trim()
  const dirty = nameDirty || townDirty

  const save = () => {
    if (!dirty) return
    startTransition(async () => {
      // Two independent writes (auth metadata + profiles); only the dirty ones
      // run, and the first failure is what the person is told about.
      let failed: string | null = null
      if (nameDirty) {
        const res = await updateDisplayName(name)
        if (!res.ok) failed = res.error
      }
      if (!failed && townDirty) {
        const res = await updateTown(place)
        if (!res.ok) failed = res.error
      }
      if (failed) { toast(failed, 'error'); return }
      toast('Perfil actualitzat.', 'success')
      router.refresh()
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

        {/* THE TOWN. The community map on the landing plots one dot per member
            town — it cannot exist until we ask, and this is the asking. Optional
            on purpose: nobody is made to say where they live to use the product. */}
        <div>
          <label htmlFor="town" className="text-xs font-semibold text-muted">
            El teu poble o ciutat
          </label>
          <div className={cn(FIELD, 'mt-1.5 flex items-center gap-2 px-3')}>
            <MapPin className="h-4 w-4 shrink-0 text-subtle" />
            <input
              id="town"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              placeholder="D'on escrius?"
              maxLength={80}
              className="h-full w-full bg-transparent text-sm text-text outline-none placeholder:text-subtle"
            />
          </div>
          <p className="mt-1.5 text-xs text-subtle">
            Surts al mapa de la comunitat com un punt, sense nom ni adreça. Pots deixar-ho en blanc.
          </p>
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
