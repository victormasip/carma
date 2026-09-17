'use client'

// The God-Mode WhatsApp connection (Fase 1).
//
// WHAT CHANGED, AND WHY
// ─────────────────────
// The old screen was a decent card with a phone-number field first and the button
// second. That ordering is backwards: it asks the owner to type their own number
// into a form in order to receive a code they then have to find, copy and send —
// four steps and a keyboard, to do something WhatsApp can do in one tap.
//
// The deep link already existed (`waMeLink(agentNumber, 'Carma <code>')`); it just
// wasn't the primary action. Now it is the ONLY action:
//
//   MOBILE   one enormous gold button → WhatsApp opens with the code already
//            typed → they press send → the webhook learns their number.
//            ZERO TYPING.
//   DESKTOP  the same link as a QR, rendered locally (no third-party QR service,
//            so the owner's agent number never leaves our origin).
//
// The phone field survives as a small secondary link for the case where neither
// works — a desktop without a phone to hand, say — rather than as the front door.
//
// MOTION: the monolith uses `.god-orb` + `.god-breathe` from globals.css —
// compositor-only transform/opacity on pre-blurred static shadows, which is the
// difference between this and the halos that froze the landing page. Exactly one
// is ever on screen.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Check, Copy, RefreshCw, X, Sparkles, ArrowRight, AlertCircle, Smartphone, ChevronDown } from 'lucide-react'
import Button from '@/components/ui/Button'
import Wordmark from '@/components/ui/Wordmark'
import PhoneInput from '@/components/ui/PhoneInput'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { useToast } from '@/components/ui/Toast'
import { KARMA_REWARDS } from '@/lib/karma/config'
import { waMeLink } from '@/lib/whatsapp/waMe'
import {
  addPhoneNumber, regenerateVerifyCode, getAgentConnectState, ensureAgentClaim, type AgentConnectState,
} from '@/lib/actions/whatsapp-settings'

const POLL_MS = 4_000
const MAX_POLLS = 75 // ~5 min; after that we SAY so rather than going silent

// One source of truth for the reward (karma/config) — never a loose 75.
const WA_REWARD = KARMA_REWARDS.find(r => r.key === 'whatsapp_connectat')?.amount ?? 0

/**
 * True on a coarse pointer — i.e. the device that actually has WhatsApp installed,
 * where the deep link opens the app. On a fine pointer the QR is the only way to
 * get this onto a phone.
 *
 * useSyncExternalStore rather than an effect: reading a media query and calling
 * setState in an effect body is a cascading render, and this value is genuinely
 * external state that React should subscribe to, not derive.
 */
function useCoarsePointer(): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia('(pointer: coarse)')
    mq.addEventListener('change', notify)
    return () => mq.removeEventListener('change', notify)
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(pointer: coarse)').matches,
    // Server snapshot: assume desktop, so the QR is what gets prerendered. Being
    // wrong here costs one hydration swap, not a broken screen.
    () => false,
  )
}

export default function ConnectAgentStep({ onClose }: {
  /** `connected` = true when the step ends with a verified number. */
  onClose: (connected: boolean) => void
}) {
  const { toast } = useToast()
  const isMobile = useCoarsePointer()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<AgentConnectState | null>(null)
  const [view, setView] = useState<'connect' | 'success'>('connect')
  const [stalled, setStalled] = useState(false)
  // Keyed on the link it was generated FROM, so a regenerated code can never show
  // the previous code's QR for a frame. (Also removes the synchronous setQr(null)
  // that a plain reset would need — a cascading render under react-hooks v6.)
  const [qr, setQr] = useState<{ link: string; svg: string } | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load the agent number + a pending code on mount. The owner never asks for
  // this — the screen is ready before they have finished reading the headline.
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    // ensureAgentClaim, NOT getAgentConnectState.
    //
    // This screen needs a CODE — the deep link and the QR are both built from
    // it. Until now none existed until the owner had typed a phone number, which
    // is the exact step this screen exists to remove. No code meant a null link,
    // so the gold button was a dead anchor and the QR was never drawn. Founder:
    // "boto no funciona i no es genera qr". See ensureAgentClaim in
    // lib/actions/whatsapp-settings.ts and migration 035.
    void ensureAgentClaim().then(s => {
      setState(s)
      if (s.connected) setView('success')
    })
  }, [])


  const code = state?.pending?.code ?? null
  const agentNumber = state?.agentNumber ?? ''
  const link = code && agentNumber ? waMeLink(agentNumber, `Carma ${code}`) : null

  // QR is generated in the browser from the same link the button uses. Rendering
  // it locally (rather than via an image service) keeps the agent number and the
  // one-time code off every third party.
  useEffect(() => {
    if (!link || isMobile) return
    let cancelled = false
    void (async () => {
      try {
        const QR = (await import('qrcode')).default
        // GOLD-WHITE ON INK, not black on white.
        //
        // Founder: "qr se veu molt negre hauria de ser blanc o or.brillant". It
        // was #1c1917 on a transparent background — a slab of near-black in the
        // middle of a gold screen.
        //
        // Two things make this safe rather than merely pretty:
        //   · #fff7d6 is the brightest stop of the knot gradient — unmistakably
        //     the brand, and close enough to white to keep the luminance
        //     contrast against the ink plate near maximum, which is the only
        //     property a scanner actually measures.
        //   · errorCorrectionLevel M → Q: a quarter of the code can be lost and
        //     still decode, which covers a phone reading a screen at an angle
        //     far better than the extra modules cost us.
        // The plate behind it is the dark panel below (#14110c) and the quiet
        // zone is that panel's padding, not margin baked into the SVG.
        const svg = await QR.toString(link, {
          type: 'svg', errorCorrectionLevel: 'Q', margin: 0,
          color: { dark: '#fff7d6', light: '#00000000' },
        })
        if (!cancelled) setQr({ link, svg })
      } catch { /* the button still works; the QR is the convenience */ }
    })()
    return () => { cancelled = true }
  }, [link, isMobile])

  // The webhook flips the number active when the code arrives; this screen then
  // completes itself. Past MAX_POLLS we stop — and say so, never going mute.
  const polls = useRef(0)
  useEffect(() => {
    if (view !== 'connect' || !code) return
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
  }, [view, code])

  const regenerate = () => {
    const id = state?.pending?.id
    if (!id) return
    startTransition(async () => {
      const res = await regenerateVerifyCode(id)
      if (!res.ok) { toast(res.error, 'error'); return }
      setState(await getAgentConnectState())
      setStalled(false)
      polls.current = 0
      toast('Codi nou generat.', 'success')
    })
  }

  const bindManually = () => {
    if (!phone) return
    setError(null)
    startTransition(async () => {
      const res = await addPhoneNumber(phone)
      if (!res.ok) { setError(res.error); return }
      const s = await getAgentConnectState()
      setState(s)
      setStalled(false)
      polls.current = 0
      if (s.connected) setView('success')
    })
  }

  const copyCode = async () => {
    if (!code) return
    try { await navigator.clipboard.writeText(code); toast('Codi copiat.', 'info') } catch { /* cosmetic */ }
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (view === 'success') {
    return (
      <Canvas>
        <div className="flex flex-col items-center text-center">
          <span className="zen-pop flex h-20 w-20 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_12px_40px_-8px_rgba(245,188,0,0.7)]">
            <Check className="h-10 w-10" strokeWidth={2.5} />
          </span>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Connectat<span className="text-accent">.</span>
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted">
            Dicta-li una idea per WhatsApp i et tornarà un article a punt de publicar.
            {WA_REWARD > 0 && <> Els teus <span className="font-semibold text-text">+{WA_REWARD} punts</span> ja hi són.</>}
          </p>
          <Button glow size="lg" className="mt-8 !h-14 !px-8 !text-base" onClick={() => onClose(true)} iconRight={<ArrowRight className="h-5 w-5" />}>
            Continuar
          </Button>
        </div>
      </Canvas>
    )
  }

  // ── The connection screen ─────────────────────────────────────────────────
  //
  // TWO COLUMNS ON DESKTOP, ONE ON A PHONE.
  //
  // Founder, 2026-09-17: "part de connectar whatsapp massa vertical tot esta be
  // per responsive pero aprofitar millor espais perque quedi clar tot esperant
  // connexio. redistribuir millor jerarquia visual."
  //
  // The old screen was one 900px column: headline, button, hint, QR, code,
  // heartbeat, disclosure, reward chip — each waiting its turn below the fold on
  // a laptop. Everything that matters while you WAIT (the QR, the three steps,
  // the heartbeat) was the part that had scrolled away.
  //
  // So the screen splits along the only line that means anything here:
  //   LEFT   what this is and the one thing to press (mobile's whole story)
  //   RIGHT  the waiting panel — scan, send, and what happens next
  // Below 1024px it stacks in that order, which is also the order of importance
  // on a phone, where the button IS the flow and the QR is meaningless.
  const waiting = (
    <p className="flex items-center justify-center gap-2 text-xs font-semibold text-muted">
      <span className="relative flex h-2 w-2">
        <span className="zen-breathe absolute inset-0 rounded-full bg-accent" aria-hidden />
        <span className="relative h-2 w-2 rounded-full bg-accent" />
      </span>
      {stalled ? 'Encara esperant — envia el codi quan puguis' : 'Esperant el teu missatge…'}
    </p>
  )

  return (
    <Canvas onSkip={() => onClose(false)} wide={!!agentNumber}>
      {!agentNumber ? (
        <div className="flex flex-col items-center text-center">
          <Wordmark size="text-lg" />
          <h1 className="mt-6 text-3xl font-bold leading-[1.1] tracking-tight text-text sm:text-4xl">
            El teu blog, des del <span className="text-accent">WhatsApp</span>.
          </h1>
          <p className="mt-8 flex max-w-md items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3.5 text-left text-sm font-medium text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            L&apos;agent encara no està configurat en aquest entorn. Salta aquest pas — el trobaràs a
            <span className="font-bold"> Agent</span> quan estigui llest.
          </p>
        </div>
      ) : (
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-14">
          {/* ══ LEFT — what it is, and the one thing to press ═══════════════ */}
          <div className="text-center lg:text-left">
            <Wordmark size="text-lg" />
            <h1 className="mt-5 text-3xl font-bold leading-[1.08] tracking-tight text-text sm:text-4xl lg:text-5xl">
              El teu blog, des del
              <br />
              <span className="text-accent">WhatsApp</span>.
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted lg:mx-0">
              Una nota de veu i tens l&apos;article escrit. Tu aproves, ell publica.
            </p>

            {/* THE BUTTON. One tap on mobile opens WhatsApp with the code already
                typed; there is nothing else to do and nothing to type. */}
            <div className="mx-auto mt-8 w-full max-w-md lg:mx-0">
              <a
                href={link ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!link}
                className={[
                  'god-orb god-breathe btn-gold relative flex w-full items-center justify-center gap-3',
                  'rounded-3xl px-8 py-6 text-lg font-extrabold no-underline sm:text-xl',
                  !link && 'pointer-events-none opacity-60',
                ].filter(Boolean).join(' ')}
              >
                <MessageCircle className="h-7 w-7 shrink-0" />
                Connectar el meu WhatsApp
              </a>
            </div>

            {/* The code, for anyone who prefers to type it into a chat they
                already have open. Secondary by design. */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 lg:justify-start">
              {code && (
                <button
                  type="button"
                  onClick={copyCode}
                  title="Copiar el codi"
                  className="group inline-flex max-w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-subtle transition-colors hover:bg-surface-hover"
                >
                  <span className="text-xs font-medium">o envia el codi</span>
                  <span className="font-mono text-base font-extrabold tracking-[0.25em] text-text">{code}</span>
                  <Copy className="h-3.5 w-3.5 transition-colors group-hover:text-accent" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setManualOpen(o => !o)}
                aria-expanded={manualOpen}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-subtle transition-colors hover:bg-surface-hover hover:text-muted"
              >
                Prefereixo introduir el meu número
                <ChevronDown className={`h-3 w-3 transition-transform ${manualOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {manualOpen && (
              <div className="zen-fade-up mx-auto mt-3 max-w-sm space-y-2.5 rounded-2xl border border-border bg-surface p-4 lg:mx-0">
                <PhoneInput onChange={setPhone} onEnter={bindManually} disabled={pending} />
                {error && <p className="text-xs font-medium text-danger">{error}</p>}
                <Button onClick={bindManually} loading={pending} disabled={!phone} variant="secondary" fullWidth>
                  Vincular aquest número
                </Button>
              </div>
            )}

            {WA_REWARD > 0 && (
              <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                <Sparkles className="h-3.5 w-3.5" /> +{WA_REWARD} punts en connectar-lo
              </span>
            )}
          </div>

          {/* ══ RIGHT — the waiting panel ═══════════════════════════════════
              Everything that answers "what now?" lives together, above the fold,
              on the ink plate the QR needs anyway. */}
          <div className="mx-auto w-full max-w-sm rounded-3xl border border-border bg-bg-elevated p-6 shadow-card">
            {!isMobile ? (
              <>
                <p className="text-center text-sm font-bold text-text">Escaneja&apos;l amb el mòbil</p>
                {/* THE INK PLATE. The QR is gold-white ON dark (see the generator
                    above) — the founder's "blanc o or brillant" — which only
                    works if it has its own dark ground rather than borrowing the
                    dashboard's. The padding IS the quiet zone. */}
                <div className="mt-4 rounded-2xl bg-[#14110c] p-5">
                  {qr && qr.link === link ? (
                    <div
                      className="mx-auto h-44 w-44 [&>svg]:h-full [&>svg]:w-full"
                      // Generated locally by the qrcode package from `link`; never
                      // user input, never remote.
                      dangerouslySetInnerHTML={{ __html: qr.svg }}
                      aria-label="Codi QR per connectar WhatsApp"
                      role="img"
                    />
                  ) : (
                    <div className="mx-auto grid h-44 w-44 place-items-center">
                      <KnotSpinner className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-subtle">
                  <Smartphone className="h-3.5 w-3.5" /> La càmera del mòbil ja el llegeix
                </p>
              </>
            ) : (
              <p className="text-center text-sm font-semibold text-text">
                S&apos;obrirà WhatsApp amb el missatge escrit. Només l&apos;has d&apos;enviar.
              </p>
            )}

            {/* The three steps, so the wait has a shape. */}
            <ol className="mt-5 space-y-2.5 border-t border-border pt-5">
              {[
                isMobile ? 'Prem el botó: s’obre WhatsApp' : 'Escaneja el codi amb la càmera',
                'Envia el missatge que ja hi surt escrit',
                'Torna aquí — aquesta pantalla sola continua',
              ].map((t, i) => (
                <li key={t} className="flex items-start gap-3 text-left text-sm leading-snug text-muted">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[0.68rem] font-extrabold text-accent">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>

            <div className="mt-5 border-t border-border pt-4">
              {waiting}
              {stalled && (
                <div className="mt-2 flex justify-center">
                  <Button onClick={regenerate} loading={pending} variant="ghost" size="sm" iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>
                    Generar un codi nou
                  </Button>
                </div>
              )}
            </div>

            {/* ONE PHONE, SEVERAL BLOGS — asked by the founder, answered here.
                The plumbing has always handled it: the webhook resolves the
                phone to its owner and hands the worker every site they belong to
                (candidate_site_ids); one candidate routes silently, more than
                one and the agent lists them and waits for a number. It was just
                never SAID anywhere, which is why the question came up at all. */}
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-subtle px-3 py-2.5 text-left text-xs leading-snug text-subtle">
              <MessageCircle className="mt-px h-3.5 w-3.5 shrink-0 text-accent" />
              <span>
                Un mateix WhatsApp et serveix per a tots els teus blogs. Quan en tinguis més d&apos;un,
                et preguntarà per a quin escrius abans de posar-s&apos;hi.
              </span>
            </p>
          </div>
        </div>
      )}
    </Canvas>
  )
}


/** Full-bleed canvas with the brand's drifting halos. One screen, one decision. */
const noopSubscribe = () => () => {}

function Canvas({ children, onSkip, wide = false }: { children: React.ReactNode; onSkip?: () => void; wide?: boolean }) {
  // Portalled onto document.body, for the same two reasons the onboarding
  // overlay is: `position: fixed` is only viewport-relative while no ancestor
  // creates a containing block (any transform up the dashboard tree re-anchors
  // it), and without locking the body the page behind keeps its own scrollbar
  // and the wheel chains straight through.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false)

  useEffect(() => {
    const body = document.body
    const previous = body.style.overflow
    body.style.setProperty('overflow', 'hidden')
    return () => {
      if (previous) body.style.setProperty('overflow', previous)
      else body.style.removeProperty('overflow')
    }
  }, [])

  if (!isClient) return null

  return createPortal(
    // overflow-x-clip: the halos sit outside the frame on negative offsets and
    // would otherwise create sideways scroll inside a fixed container (mobile QA).
    <div className="fixed inset-0 z-[70] h-dvh w-screen overflow-y-auto overflow-x-clip bg-bg">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="halo halo-drift-a" style={{ width: 560, height: 560, background: 'rgba(245,188,0,0.18)', top: -180, left: -120 }} />
        <div className="halo halo-drift-b" style={{ width: 480, height: 480, background: 'rgba(245,188,0,0.12)', bottom: -190, right: -90 }} />
      </div>

      <div className="relative flex min-h-full flex-col items-center justify-center px-5 py-10 sm:py-14">
        {onSkip && (
          <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
            <button
              onClick={onSkip}
              className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-subtle transition-colors hover:bg-surface-hover hover:text-text"
            >
              Ho faré més endavant <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className={wide ? 'w-full max-w-5xl' : 'w-full max-w-xl'}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
