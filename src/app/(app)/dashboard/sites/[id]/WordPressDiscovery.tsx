'use client'

// The WordPress moment (Fase 2).
//
// WHY A NEW SURFACE
// ─────────────────
// When the capture detects WordPress we know something genuinely useful about this
// owner — and until now we did nothing with it at the moment it mattered. The
// information lived inside IntegrationGuide.tsx, 1375 lines of tabbed reference
// covering seven platforms and two integration paths, opened from a tab nobody
// clicks on their first day.
//
// So: three cards, one decision, stated trade-offs. Progressive disclosure means
// the detail is one tap away, not absent — the full guide is still there for the
// owner who wants it, and this panel links into it.
//
// The third option is real. "Not now" is how most people answer a question on
// their first day, and a panel that only offers two paths forward makes a dismissal
// feel like a mistake. It is dismissible, remembered, and rediscoverable from the
// Connexió tab exactly where it always was.

import { useState } from 'react'
import {
  Plug, Download, ArrowDownToLine, Clock, X, Check, ChevronDown, ExternalLink, Sparkles,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/cn'


const DISMISS_KEY = (siteId: string) => `carma_wp_discovery_${siteId}`

/** Per-viewer, per-site. A dismissal is a UI preference, not shared state — and it
 *  must survive a reload, which is all localStorage is being asked to do here. */
export function wpDiscoveryDismissed(siteId: string): boolean {
  try { return localStorage.getItem(DISMISS_KEY(siteId)) === '1' } catch { return false }
}
function rememberDismissal(siteId: string) {
  try { localStorage.setItem(DISMISS_KEY(siteId), '1') } catch { /* private window — it just reappears */ }
}

export default function WordPressDiscovery({
  siteId, originUrl, onImport, onOpenGuide, onDismiss,
}: {
  siteId: string
  /** The site we cloned — shown so the owner recognises what we're talking about. */
  originUrl?: string | null
  /** Opens the existing article-import modal. */
  onImport: () => void
  /** Switches to the Connexió tab (the full IntegrationGuide). */
  onOpenGuide: () => void
  onDismiss: () => void
}) {
  // A SET, not a single value.
  //
  // Founder, 2026-09-16: "si detecta WordPress pots donar totes les opcions que
  // no sigui excloent l'una de l'altra". They are not alternatives and never
  // were — installing the plugin and importing the old articles do different
  // jobs, and most owners want both. An accordion that closes one card when you
  // open another SAYS "pick one", whatever the copy underneath claims.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['plugin']))
  const toggle = (k: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    return next
  })

  const dismiss = () => { rememberDismissal(siteId); onDismiss() }
  const host = (() => {
    try { return originUrl ? new URL(originUrl).hostname.replace(/^www\./, '') : null } catch { return null }
  })()

  return (
    <section className="gold-trace gold-trace-hover [--gold-trace-w:1px] relative rounded-2xl border border-transparent bg-surface p-5 shadow-card sm:p-6">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Amagar"
        className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-text"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Plug className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text sm:text-lg">
            Hem trobat WordPress{host && <> a <span className="text-accent">{host}</span></>}.
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Pots fer-ne una, l&apos;altra o <span className="font-semibold text-text">totes dues</span>. No
            s&apos;exclouen, cap et costa punts, i pots canviar d&apos;idea quan vulguis.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <OptionCard
          icon={<Download className="h-4.5 w-4.5" />}
          title="El plugin de Carma"
          lead="Els articles surten al teu WordPress, al teu domini."
          badge="Recomanat"
          tradeoff="Has d’instal·lar un plugin (2 minuts)."
          open={expanded.has('plugin')}
          onToggle={() => toggle('plugin')}
        >
          <ul className="space-y-1.5">
            <Bullet>El teu domini no canvia — els articles apareixen dins el teu WordPress.</Bullet>
            <Bullet>El SEO que ja tens es queda on és.</Bullet>
            <Bullet>Escrius des de Carma (o des del WhatsApp) i es publiquen allà.</Bullet>
          </ul>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button href="/carma-blog.zip" size="sm" glow iconLeft={<Download className="h-3.5 w-3.5" />}>
              Baixar el plugin
            </Button>
            <Button onClick={onOpenGuide} size="sm" variant="ghost" iconRight={<ExternalLink className="h-3.5 w-3.5" />}>
              Com s&apos;instal·la
            </Button>
          </div>
        </OptionCard>

        <OptionCard
          icon={<ArrowDownToLine className="h-4.5 w-4.5" />}
          title="Portar-te els articles"
          lead="Els articles que ja tens, importats a Carma."
          tradeoff="El teu blog viurà al subdomini de Carma."
          open={expanded.has('import')}
          onToggle={() => toggle('import')}
        >
          <ul className="space-y-1.5">
            <Bullet>Importem els articles amb imatges, categories i etiquetes.</Bullet>
            <Bullet>El disseny ja és el teu — l&apos;acabem de clonar.</Bullet>
            <Bullet>No toquem el teu WordPress: només llegim.</Bullet>
          </ul>
          <div className="mt-3.5">
            <Button onClick={onImport} size="sm" glow iconLeft={<ArrowDownToLine className="h-3.5 w-3.5" />}>
              Importar els articles
            </Button>
          </div>
        </OptionCard>

      </div>

      {/* THE COMBINATION, spelled out. It is what most owners actually want, and
          the one thing nothing on this panel used to mention. */}
      <div className="mt-4 rounded-xl border border-accent/25 bg-accent-soft/40 p-4">
        <p className="text-sm font-bold text-text">Les dues juntes (el més habitual)</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Instal·la el plugin perquè <span className="font-semibold text-text">el que escriguis a partir
          d&apos;ara</span> surti al teu WordPress i al teu domini, i importa
          <span className="font-semibold text-text"> els articles que ja tens</span> perquè la Carma
          aprengui com escrius i els puguis reutilitzar, traduir o millorar des d&apos;aquí. Els articles
          antics es queden on són: importar només llegeix.
        </p>
      </div>

      {/* Not an option: a way out. Giving "later" a card the same size as the
          other two made doing nothing look like a third strategy. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
        <Clock className="h-3.5 w-3.5" />
        <span>
          Ho deixes per a després? El teu blog ja funciona. Ho tindràs sempre a la pestanya{' '}
          <span className="font-semibold text-muted">Connexió</span>.
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer font-semibold text-muted underline underline-offset-2 transition-colors hover:text-text"
        >
          Amaga-ho
        </button>
      </div>
    </section>
  )
}

/**
 * One option. Collapsed it is a claim plus its cost — which is the pair an owner
 * needs to choose. Expanded it is the detail. Nothing is hidden that changes the
 * decision; the trade-off line is visible before you open anything.
 */
function OptionCard({
  icon, title, lead, tradeoff, badge, open, onToggle, children,
}: {
  icon: React.ReactNode
  title: string
  lead: string
  tradeoff: string
  badge?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface-subtle p-4 transition-colors',
        open ? 'border-accent/50 bg-surface' : 'border-border hover:border-border-strong',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start gap-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-text">{title}</span>
            {badge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wide text-on-accent">
                <Sparkles className="h-2.5 w-2.5" />{badge}
              </span>
            )}
          </span>
          <span className="mt-1 block text-sm leading-snug text-muted">{lead}</span>
          {/* The cost, always visible. An option whose downside only appears after
              you commit is not an option, it's a funnel. */}
          <span className="mt-1.5 block text-xs leading-snug text-subtle">{tradeoff}</span>
        </span>
        <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
      </button>

      {open && <div className="zen-fade-up mt-4 border-t border-border pt-3.5">{children}</div>}
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-snug text-muted">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={3} />
      {children}
    </li>
  )
}
