'use client'

// Onboarding, últim pas: connecta l'agent de WhatsApp (founder 2026-07-06:
// ha de ser un PAS evident del flux — mai un toggle amagat — però sempre
// saltable amb "Ho faré més endavant").
//
// Autònom de dalt a baix: afegeix el número (addPhoneNumber), mostra el codi
// amb l'enllaç wa.me, i sonda getAgentConnectState fins que el webhook activa
// la identitat. Qui salta el pas conserva el recordatori discret de sempre
// (ConnectAgentBanner) — res no es perd.

import { useEffect, useRef, useState, useTransition } from 'react'
import { MessageCircle, Phone, Check, Copy, RefreshCw, X, Sparkles, ArrowRight, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Wordmark from '@/components/ui/Wordmark'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { useToast } from '@/components/ui/Toast'
import { KARMA_REWARDS } from '@/lib/karma/config'
import { waMeLink } from '@/lib/whatsapp/waMe'
import {
  addPhoneNumber, regenerateVerifyCode, getAgentConnectState, type AgentConnectState,
} from '@/lib/actions/whatsapp-settings'

const POLL_MS = 8_000
const MAX_POLLS = 40 // ~5 min; després mostrem una pista en lloc de quedar-nos muts

// Un sol origen de veritat per a la recompensa (karma/config) — mai un 75 solt.
const WA_REWARD = KARMA_REWARDS.find(r => r.key === 'whatsapp_connectat')?.amount ?? 0

export default function ConnectAgentStep({ onClose }: {
  /** `connected` = true quan el pas acaba amb el número verificat. */
  onClose: (connected: boolean) => void
}) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [view, setView] = useState<'intro' | 'verify' | 'success'>('intro')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<AgentConnectState | null>(null)

  // El sondeig es reinicia amb cada època (entrar a verify, regenerar codi).
  // `stalled` només es posa a true DINS l'interval (async) i es neteja als
  // handlers — mai un setState síncron al cos de l'efecte (react-hooks v6).
  const [stalled, setStalled] = useState(false)
  const [pollEpoch, setPollEpoch] = useState(0)

  const connect = () => {
    const value = phone.trim()
    if (!value) return
    setError(null)
    startTransition(async () => {
      const res = await addPhoneNumber(value)
      if (!res.ok) { setError(res.error); return }
      const s = await getAgentConnectState()
      setState(s)
      setStalled(false)
      setPollEpoch(e => e + 1)
      setView(s.connected ? 'success' : 'verify')
    })
  }

  const regenerate = () => {
    const id = state?.pending?.id
    if (!id) return
    startTransition(async () => {
      const res = await regenerateVerifyCode(id)
      if (!res.ok) { toast(res.error, 'error'); return }
      setState(await getAgentConnectState())
      setStalled(false)
      setPollEpoch(e => e + 1) // torna a armar el sondeig si s'havia aturat
      toast('Codi nou generat.', 'success')
    })
  }

  // Mentre esperem el codi, sondegem l'estat: el webhook posa el número en
  // actiu quan l'usuari envia el codi, i el pas es completa sol. Passats
  // MAX_POLLS deixem de sondejar però HO DIEM (mai una pantalla muda).
  const polls = useRef(0)
  useEffect(() => {
    if (view !== 'verify') return
    polls.current = 0
    const t = setInterval(() => {
      if (++polls.current > MAX_POLLS) { setStalled(true); clearInterval(t); return }
      if (document.visibilityState !== 'visible') return
      void getAgentConnectState().then(s => {
        setState(s)
        if (s.connected) setView('success')
      })
    }, POLL_MS)
    return () => clearInterval(t)
  }, [view, pollEpoch])

  const code = state?.pending?.code ?? null
  const agentNumber = state?.agentNumber ?? ''
  const verifyLink = code ? waMeLink(agentNumber, `Carma ${code}`) : null

  const copyCode = async () => {
    if (!code) return
    try { await navigator.clipboard.writeText(code); toast('Codi copiat.', 'info') } catch { /* cosmètic */ }
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="halo halo-drift-a" style={{ width: 460, height: 460, background: 'rgba(245,188,0,0.16)', top: -130, left: -90 }} aria-hidden />
      <div className="halo halo-drift-b" style={{ width: 420, height: 420, background: 'rgba(245,188,0,0.11)', bottom: -150, right: -70 }} aria-hidden />

      <div className="relative flex min-h-full flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-xl">
          {/* Saltar — sempre visible, mai un carreró sense sortida */}
          {view !== 'success' && (
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => onClose(false)}
                className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-subtle transition-colors hover:bg-surface-hover hover:text-text"
              >
                Ho faré més endavant <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="text-center">
            <Wordmark size="text-lg" />
          </div>

          {view === 'intro' && (
            <div className="gold-trace gold-trace-aura [--gold-trace-w:1px] relative mt-6 rounded-2xl border border-transparent bg-surface p-7 shadow-card sm:p-9">
              <div className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent">
                  <MessageCircle className="h-6 w-6" />
                </span>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-text">
                  Últim pas: el teu agent per WhatsApp
                </h1>
                <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted">
                  Envia-li una nota de veu amb una idea i et torna un article SEO a punt de publicar
                  en aquest blog. Tu aproves, ell publica.
                </p>
                {WA_REWARD > 0 && (
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                    <Sparkles className="h-3.5 w-3.5" /> +{WA_REWARD} Punts de Carma en connectar-lo
                  </span>
                )}
              </div>

              <div className="mt-7 space-y-2.5">
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setError(null) }}
                    onKeyDown={e => e.key === 'Enter' && connect()}
                    placeholder="+34 600 00 00 00"
                    className="h-11 w-full rounded-xl border border-border bg-surface-subtle pl-9 pr-3 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent focus:bg-surface"
                  />
                </div>
                {error && <p className="text-xs font-medium text-danger">{error}</p>}
                <Button
                  glow
                  fullWidth
                  onClick={connect}
                  loading={pending}
                  disabled={!phone.trim()}
                  iconLeft={<MessageCircle className="h-4 w-4" />}
                >
                  Connectar el meu WhatsApp
                </Button>
                <p className="text-center text-xs text-subtle">
                  Inclou el prefix del país. Rebràs un codi per verificar que el número és teu.
                </p>
              </div>
            </div>
          )}

          {view === 'verify' && (
            <div className="relative mt-6 rounded-2xl border border-border bg-surface p-7 shadow-card sm:p-9">
              <div className="flex flex-col items-center text-center">
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <span className="absolute -inset-2 rounded-full bg-accent/20 blur-xl zen-breathe" aria-hidden />
                  <KnotSpinner className="relative h-6 w-6" />
                </span>
                <h1 className="mt-4 text-xl font-bold tracking-tight text-text">Envia el codi per WhatsApp</h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                  Des del teu número, envia aquest codi al WhatsApp de l&apos;agent
                  {agentNumber ? <> (<span className="font-mono font-semibold text-text">{agentNumber}</span>)</> : null}.
                  En rebre&apos;l, aquesta pantalla es completarà sola.
                </p>

                {!agentNumber && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-left text-sm font-medium text-warning">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    El número de l&apos;agent encara no està configurat. Salta aquest pas i torna-hi més tard des d&apos;Agent.
                  </p>
                )}

                {code ? (
                  <button
                    type="button"
                    onClick={copyCode}
                    title="Copiar el codi"
                    className="group mt-5 inline-flex cursor-pointer items-center gap-3 rounded-xl border border-border-strong bg-bg-elevated px-5 py-3"
                  >
                    <span className="font-mono text-3xl font-extrabold tracking-[0.3em] text-text">{code}</span>
                    <Copy className="h-4 w-4 text-subtle transition-colors group-hover:text-accent" />
                  </button>
                ) : (
                  <p className="mt-5 text-sm font-medium text-warning">El codi ha caducat — genera&apos;n un de nou.</p>
                )}

                {stalled && (
                  <p className="mt-4 text-sm text-muted">
                    Encara no l&apos;hem rebut. Envia el codi quan puguis — o genera&apos;n un de nou si ha caducat.
                    Sempre pots acabar-ho més tard des d&apos;<span className="font-semibold text-text">Agent</span>.
                  </p>
                )}

                <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
                  {verifyLink && (
                    <Button href={verifyLink} target="_blank" rel="noopener noreferrer" glow fullWidth iconLeft={<MessageCircle className="h-4 w-4" />}>
                      Obrir WhatsApp amb el codi
                    </Button>
                  )}
                  <Button
                    onClick={regenerate}
                    loading={pending}
                    disabled={!state?.pending?.id}
                    variant="secondary"
                    fullWidth
                    iconLeft={<RefreshCw className="h-4 w-4" />}
                  >
                    Generar codi nou
                  </Button>
                </div>
              </div>
            </div>
          )}

          {view === 'success' && (
            <div className="gold-trace gold-trace-aura [--gold-trace-w:1px] relative mt-6 rounded-2xl border border-transparent bg-surface p-7 shadow-card sm:p-9">
              <div className="flex flex-col items-center text-center">
                <span className="zen-pop flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_8px_24px_-6px_rgba(245,188,0,0.6)]">
                  <Check className="h-7 w-7" strokeWidth={2.5} />
                </span>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-text">Agent connectat!</h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                  Ja pots dictar-li articles per WhatsApp.
                  {WA_REWARD > 0 && <> Els teus <span className="font-semibold text-text">+{WA_REWARD} punts</span> t&apos;esperen a Punts de Carma.</>}
                </p>
                <div className="mt-6 w-full max-w-xs">
                  <Button glow fullWidth onClick={() => onClose(true)} iconRight={<ArrowRight className="h-4 w-4" />}>
                    Comencem
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
