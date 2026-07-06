'use client'

// "Connect to WordPress" panel (the Trojan Horse bridge). Lives in the Connexió
// tab. Hands the user everything the carma-blog plugin needs:
//   · a download for the plugin .zip (served statically from /public),
//   · the secure API Key + Site ID to copy (the plugin's "Account API Token"
//     auto-resolves the blog from the key; the Site ID is the manual fallback),
//   · a 3-step install walkthrough.
//
// No secrets beyond what the dashboard already shows (the per-site api_key); the
// embed itself is public, so this panel is purely about handing over credentials.

import { useState, type ReactNode } from 'react'
import { Plug, Download, KeyRound, Globe, Copy, Check, Sparkles, Layers } from 'lucide-react'
import { cn } from '@/lib/cn'
import { isWordPress } from '@/lib/render/publishing'

function CopyField({ label, value, icon: Icon, mono = true }: { label: string; value: string; icon: typeof KeyRound; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="min-w-0">
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-subtle mb-1">
        <Icon className="w-3 h-3" /> {label}
      </label>
      <div className="flex items-center gap-2 h-10 bg-surface-subtle border border-border rounded-lg pl-3 pr-1.5 focus-within:border-accent transition-colors">
        <span className={cn('flex-1 min-w-0 truncate text-sm text-text', mono && 'font-mono text-xs')}>{value}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            'cursor-pointer shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-bold transition-colors',
            copied ? 'bg-success-soft text-success' : 'bg-surface border border-border text-muted hover:text-text hover:border-border-strong',
          )}
        >
          {copied ? <><Check className="w-3.5 h-3.5" /> Copiat</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
        </button>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold text-text">{title}</p>
        <div className="text-xs text-muted mt-1.5 leading-relaxed space-y-2">{children}</div>
      </div>
    </li>
  )
}

export default function WordPressConnectCard({ siteId, apiKey, subdomain, detectedFramework }: { siteId: string; apiKey: string; subdomain?: string; detectedFramework?: string | null }) {
  const siteIdValue = subdomain || siteId
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const selfHosted = !!origin && origin !== 'https://carma.cat'
  const wp = isWordPress(detectedFramework)

  return (
    <div className={cn('bg-surface border rounded-2xl overflow-hidden', wp ? 'border-accent/40 ring-1 ring-accent/15' : 'border-border')}>
      {/* When we detected WordPress on the client's site, this IS the recommended
          publishing method — surface it prominently over the API/proxy options. */}
      {wp && (
        <div className="flex items-center gap-2 px-6 py-2.5 bg-accent-soft border-b border-accent/20">
          <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
          <p className="text-xs font-bold text-accent">
            Recomanat per al teu lloc · hem detectat <span className="uppercase tracking-wide">WordPress</span>
          </p>
        </div>
      )}
      <div className="p-6 pb-4 border-b border-border flex items-start gap-3.5">
        <span className="w-11 h-11 rounded-xl bg-[#21759b]/10 text-[#21759b] flex items-center justify-center shrink-0">
          <Plug className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-text">Connecta amb WordPress</h3>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            Mostra aquest blog dins de qualsevol pàgina de WordPress amb el nostre plugin. Es renderitza aïllat (Shadow DOM), així que es veu perfecte sigui quin sigui el teu tema.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Header/footer behaviour — made explicit so there's zero uncertainty about
            how the final site looks with the plugin (vs. the cloned-chrome subdomain). */}
        <div className="flex items-start gap-2.5 rounded-xl bg-surface-subtle border border-border px-3.5 py-3">
          <Layers className="w-4 h-4 text-[#21759b] shrink-0 mt-0.5" />
          <p className="text-xs text-muted leading-relaxed">
            <span className="font-semibold text-text">Sobre la capçalera i el peu:</span> amb el plugin, el blog s&apos;insereix dins una pàgina de WordPress i <span className="font-semibold text-text">no porta capçalera ni peu clonats</span>. El teu propi tema de WordPress ja hi posa la navegació, la capçalera i el peu — així el blog s&apos;integra net dins el teu web.
          </p>
        </div>

        {/* Credentials to copy */}
        <div className="grid sm:grid-cols-2 gap-3">
          <CopyField label="Clau API" value={apiKey} icon={KeyRound} />
          <CopyField label="ID del lloc" value={siteIdValue} icon={Globe} mono={false} />
        </div>

        {/* 3-step install */}
        <ol className="space-y-4">
          <Step n={1} title="Baixa i instal·la el plugin">
            <a
              href="/carma-blog.zip"
              download
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-text text-bg-elevated text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" /> Baixar el plugin (.zip)
            </a>
            <p>
              A WordPress: <span className="font-semibold text-text">Plugins → Afegeix-ne un → Penja el plugin</span>, tria el fitxer <code className="font-mono bg-surface-subtle px-1 py-0.5 rounded text-[11px]">.zip</code> i activa&apos;l.
            </p>
          </Step>
          <Step n={2} title="Enganxa la teva Clau API">
            <p>
              Ves a <span className="font-semibold text-text">Ajustos → Carma Blog</span> i enganxa la <span className="font-semibold text-text">Clau API</span> de dalt al camp «Account API Token». El teu blog es detecta i se selecciona automàticament. Desa.
            </p>
            {selfHosted && (
              <p className="text-subtle">
                Carma autoallotjat? Posa també l&apos;origen <code className="font-mono bg-surface-subtle px-1 py-0.5 rounded text-[11px]">{origin}</code> al camp «Carma origin».
              </p>
            )}
          </Step>
          <Step n={3} title="Afegeix el blog a una pàgina">
            <p>Edita qualsevol pàgina i afegeix el bloc <span className="font-semibold text-text">«Carma Blog»</span>, o enganxa aquest shortcode:</p>
            <code className="block font-mono text-[11px] bg-surface-subtle border border-border rounded-md px-2.5 py-1.5 text-text">[carma_blog]</code>
          </Step>
        </ol>
      </div>
    </div>
  )
}
