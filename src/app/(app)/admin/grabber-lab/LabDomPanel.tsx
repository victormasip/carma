'use client'

// Theme Grabber Lab — the DOM Pattern Analysis panel.
//
// Runs the pure `analyzeDom` fingerprinter over a chosen slice of the capture
// (header / footer / head / the operator's perfect document) and renders it as a
// scannable cockpit: framework fingerprint, risk flags, tag + class-family
// histograms and resource counts — so the operator sees *why* a clone is hard
// without reading a wall of HTML.

import { useMemo, useState } from 'react'
import { Boxes, AlertTriangle, Info, ShieldAlert, Layers, Hash, Code2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { analyzeDom, type DomFlagSeverity } from '@/lib/grabber-lab/domPatterns'

type Source = 'header' | 'footer' | 'head' | 'perfect'

const SEV_ICON: Record<DomFlagSeverity, React.ReactNode> = {
  risk: <ShieldAlert className="h-3.5 w-3.5 text-danger" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  info: <Info className="h-3.5 w-3.5 text-subtle" />,
}
const SEV_ROW: Record<DomFlagSeverity, string> = {
  risk: 'border-danger/25 bg-danger-soft',
  warn: 'border-warning/25 bg-warning-soft',
  info: 'border-border bg-surface-subtle',
}

export default function LabDomPanel({ header, footer, head, perfectHtml }: {
  header: string; footer: string; head: string; perfectHtml: string
}) {
  const sources: { id: Source; label: string; value: string }[] = [
    { id: 'header', label: 'Header', value: header },
    { id: 'footer', label: 'Footer', value: footer },
    { id: 'head', label: 'Head', value: head },
    ...(perfectHtml.trim() ? [{ id: 'perfect' as const, label: 'Perfecte', value: perfectHtml }] : []),
  ]
  const [source, setSource] = useState<Source>('header')
  const active = sources.find(s => s.id === source) ?? sources[0]
  const a = useMemo(() => analyzeDom(active.value), [active.value])

  const maxTag = a.tagCounts[0]?.count ?? 1
  const maxFam = a.families[0]?.count ?? 1

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-text">
            <span className="text-accent"><Boxes className="h-4 w-4" /></span>Anàlisi de patrons DOM
          </h2>
          <p className="mt-0.5 text-xs text-subtle">Empremta estructural del marcatge capturat</p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {sources.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              className={cn(
                'cursor-pointer rounded-md px-2.5 h-7 text-xs font-semibold transition-colors',
                source === s.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-text',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {a.totalTags === 0 ? (
        <p className="mt-4 text-sm text-subtle">Aquesta secció és buida — no hi ha marcatge per analitzar.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Headline stats */}
          <div className="grid grid-cols-4 gap-2">
            <Stat icon={<Layers className="h-3.5 w-3.5" />} label="Elements" value={a.totalTags} />
            <Stat icon={<Hash className="h-3.5 w-3.5" />} label="Classes úniq." value={a.uniqueClasses} />
            <Stat icon={<Code2 className="h-3.5 w-3.5" />} label="Profunditat" value={a.maxDepth} />
            <Stat icon={<Boxes className="h-3.5 w-3.5" />} label="Instàncies" value={a.classInstances} />
          </div>

          {/* Frameworks */}
          {a.frameworks.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-subtle">Frameworks:</span>
              {a.frameworks.map(f => (
                <span key={f} className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">{f}</span>
              ))}
            </div>
          )}

          {/* Risk flags */}
          {a.flags.length > 0 && (
            <ul className="space-y-1.5">
              {a.flags.map(fl => (
                <li key={fl.id} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2', SEV_ROW[fl.severity])}>
                  <span className="mt-0.5 shrink-0">{SEV_ICON[fl.severity]}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text">{fl.label}</p>
                    <p className="text-[0.7rem] leading-snug text-muted">{fl.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Tag histogram */}
          <div>
            <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">Etiquetes més freqüents</p>
            <div className="space-y-1">
              {a.tagCounts.slice(0, 10).map(t => (
                <Bar key={t.tag} label={t.tag} count={t.count} max={maxTag} mono />
              ))}
            </div>
          </div>

          {/* Class families */}
          {a.families.length > 0 && (
            <div>
              <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">Famílies de classes</p>
              <div className="space-y-1">
                {a.families.slice(0, 8).map(f => (
                  <Bar key={f.prefix} label={f.prefix} count={f.count} max={maxFam} badge={f.framework ?? undefined} mono />
                ))}
              </div>
            </div>
          )}

          {/* Resource counts */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {([
              ['Scripts', a.resources.scripts], ['Styles', a.resources.styles], ['Links', a.resources.links],
              ['Imatges', a.resources.images], ['iframes', a.resources.iframes], ['SVG', a.resources.svgs],
              ['Forms', a.resources.forms], ['style=', a.resources.inlineStyles],
            ] as const).map(([label, n]) => (
              <div key={label} className="rounded-lg border border-border bg-bg-elevated px-2.5 py-1.5">
                <div className="text-sm font-extrabold tabular-nums text-text">{n}</div>
                <div className="text-[0.65rem] font-medium text-subtle">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-2.5 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-subtle">{icon}</div>
      <div className="mt-0.5 text-lg font-extrabold tabular-nums text-text">{value.toLocaleString()}</div>
      <div className="text-[0.62rem] font-medium uppercase tracking-wide text-subtle">{label}</div>
    </div>
  )
}

function Bar({ label, count, max, badge, mono }: { label: string; count: number; max: number; badge?: string; mono?: boolean }) {
  const pct = Math.max(6, Math.round((count / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-28 shrink-0 truncate text-xs text-text', mono && 'font-mono')} title={label}>{label}</span>
      <span className="relative h-4 flex-1 overflow-hidden rounded bg-surface-subtle">
        <span className="absolute inset-y-0 left-0 rounded bg-accent/70" style={{ width: `${pct}%` }} />
      </span>
      {badge && <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-bold text-accent">{badge}</span>}
      <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">{count}</span>
    </div>
  )
}
