'use client'

// The FREE-user publishing experience (Connexió tab for clients).
//
// Free users publish through their Carma subdomain — the effortless, zero-setup
// default. Their blog is served WHOLE (cloned header + footer), so it looks
// consistent with the rest of their site out of the box. This panel:
//   · shows their live public address (copyable, openable),
//   · explains — in plain, beginner language — the 3 steps to go live,
//   · makes the header/footer behaviour explicit (inherits the cloned chrome),
//   · offers the WordPress plugin / custom domain as a Premium upgrade, adapted
//     to whether we detected WordPress on their site.
//
// Premium users get the full WordPressConnectCard + API surface instead.

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Rocket, Globe, Copy, Check, Crown, PenLine, Link2, ExternalLink, Layers } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { publicBlogUrl } from '@/lib/sites/domain'
import { isWordPress } from '@/lib/render/publishing'
import { cn } from '@/lib/cn'

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'cursor-pointer shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold transition-colors',
        copied ? 'bg-success-soft text-success' : 'bg-surface border border-border text-muted hover:text-text hover:border-border-strong',
      )}
    >
      {copied ? <><Check className="w-3.5 h-3.5" /> Copiat</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
    </button>
  )
}

function Step({ n, icon: Icon, title, children }: { n: number; icon: typeof PenLine; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-accent-soft text-accent">
        <Icon className="w-4.5 h-4.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-bold text-text">
          <span className="text-subtle mr-1.5">{n}.</span>{title}
        </p>
        <div className="text-xs text-muted mt-1 leading-relaxed space-y-2">{children}</div>
      </div>
    </li>
  )
}

export default function PublishGuide({
  siteId, subdomain, detectedFramework,
}: {
  siteId: string
  subdomain?: string
  detectedFramework: string | null
}) {
  const { toast } = useToast()
  // Read the live host/origin without a setState-in-effect (project lint rule):
  // subscribe to nothing, snapshot window on the client, empty string on the server.
  const host = useSyncExternalStore(() => () => {}, () => window.location.host, () => '')
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => '')

  const publicUrl =
    (subdomain && publicBlogUrl(subdomain, { currentHost: host || undefined })) ||
    (origin ? `${origin}/render/${siteId}` : `/render/${siteId}`)
  const displayUrl = publicUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const wp = isWordPress(detectedFramework)

  return (
    <div className="space-y-4">
      {/* Hero — the blog is already live on its subdomain */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-elevated p-6 shadow-card">
        <div className="absolute -top-16 -right-16 w-72 h-72 bg-accent opacity-[0.07] blur-[90px] pointer-events-none rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-11 h-11 rounded-xl bg-accent text-on-accent flex items-center justify-center shadow-card shrink-0">
              <Rocket className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-text">El teu blog ja és en línia</h3>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Es publica automàticament en aquesta adreça. No cal instal·lar res.
              </p>
            </div>
          </div>

          {/* Live address */}
          <div className="flex items-center gap-2 h-11 bg-surface-subtle border border-border rounded-xl pl-3.5 pr-1.5">
            <Globe className="w-4 h-4 text-subtle shrink-0" />
            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-text">{displayUrl}</span>
            <Copyable value={publicUrl} />
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold bg-text text-bg-elevated hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Obrir
            </a>
          </div>

          {/* Header/footer behaviour — made explicit */}
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-success-soft/60 border border-success/20 px-3.5 py-2.5">
            <Layers className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <p className="text-xs text-muted leading-relaxed">
              <span className="font-semibold text-text">Es veu com el teu web.</span> El blog hereta la
              <span className="font-semibold text-text"> capçalera i el peu</span> que hem clonat del teu lloc, així que la navegació i la marca són idèntiques a la resta de la web.
            </p>
          </div>
        </div>
      </div>

      {/* Beginner-friendly 3-step guide */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h4 className="text-sm font-bold text-text mb-4">Com posar-lo en marxa, pas a pas</h4>
        <ol className="space-y-5">
          <Step n={1} icon={PenLine} title="Publica el teu primer article">
            <p>
              Ves a la pestanya <span className="font-semibold text-text">Articles</span>, escriu (o importa) un article i publica&apos;l. Apareixerà al blog a l&apos;instant.
            </p>
          </Step>
          <Step n={2} icon={Globe} title="Aquesta és la teva adreça pública">
            <p>Ja la pots compartir tal com és. Els teus lectors hi accedeixen directament:</p>
            <div className="flex items-center gap-2 h-9 bg-surface-subtle border border-border rounded-lg pl-3 pr-1.5">
              <span className="flex-1 min-w-0 truncate text-xs font-mono text-text">{displayUrl}</span>
              <Copyable value={publicUrl} />
            </div>
          </Step>
          <Step n={3} icon={Link2} title="Enllaça'l des del teu web">
            <p>
              Afegeix un enllaç <span className="font-semibold text-text">«Blog»</span> o <span className="font-semibold text-text">«Notícies»</span> al menú del teu web que apunti a aquesta adreça. Els visitants passaran del teu web al blog sense notar el canvi, perquè comparteixen el mateix disseny.
            </p>
          </Step>
        </ol>
      </div>

      {/* Premium upsell — adapts to WordPress detection */}
      <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-accent-soft/40 p-6">
        <div className="flex items-start gap-3.5">
          <span className="w-10 h-10 rounded-xl bg-accent text-on-accent flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-text">
                {wp ? 'Tens WordPress? Insereix-lo al teu propi domini' : 'Vols el blog dins el teu propi domini?'}
              </h4>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent-soft px-1.5 py-0.5 rounded">Premium</span>
            </div>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              {wp
                ? 'Amb Premium instal·les el nostre plugin de WordPress i el blog apareix dins les teves pàgines, al teu domini de sempre. En aquest cas el teu tema de WordPress ja hi posa la capçalera, el peu i el menú — el blog s’hi integra net.'
                : 'Amb Premium tens embed en directe, API per al teu frontend i domini propi, perquè el blog visqui dins la teva web amb la teva URL.'}
            </p>
            <div className="mt-4">
              <Button
                glow
                size="sm"
                onClick={() => toast('La facturació encara no està disponible. Contacta amb el teu administrador per passar a Premium.', 'info')}
                iconLeft={<Crown className="w-4 h-4" />}
              >
                Passa a Premium
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
