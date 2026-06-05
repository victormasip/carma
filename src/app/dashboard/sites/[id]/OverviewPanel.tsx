'use client'

// Site "Resum" (Overview) — the analytics home for a site.
//
// Pulls real view data from the page_views backend via getSiteStats and presents
// it as Tier-1 stat tiles + a daily bar chart + a top-articles leaderboard. The
// range toggle (7 / 30 / 90 days) re-fetches. Degrades to zeros if migration 015
// hasn't run yet (the read layer returns an empty series, never throws).

import { useRef, useState } from 'react'
import { Eye, Users, FileText, TrendingUp, TrendingDown, ArrowUpRight, BarChart3, Loader2 } from 'lucide-react'
import { getSiteStats } from '@/lib/actions/analytics'
import type { SiteStats } from '@/lib/analytics/read'
import { cn } from '@/lib/cn'

type Range = 7 | 30 | 90

export default function OverviewPanel({
  siteId, totalArticles, publishedArticles, initialStats,
}: {
  siteId: string
  totalArticles: number
  publishedArticles: number
  initialStats: SiteStats | null
}) {
  const [days, setDays] = useState<Range>(30)
  const [stats, setStats] = useState<SiteStats | null>(initialStats)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  // Re-fetch on range change. Done in the event handler (not an effect) so the
  // initial 30-day data is server-rendered and there's no setState-in-effect.
  const selectRange = (d: Range) => {
    if (d === days) return
    setDays(d)
    setLoading(true)
    const id = ++reqId.current
    getSiteStats(siteId, d).then(r => {
      if (id !== reqId.current) return // a newer range won the race
      setStats(r.stats ?? null)
      setLoading(false)
    })
  }

  const delta = stats && stats.prevViews > 0
    ? Math.round(((stats.totalViews - stats.prevViews) / stats.prevViews) * 100)
    : null
  const dailyAvg = stats ? Math.round(stats.totalViews / days) : 0

  return (
    <div className="space-y-5">
      {/* Range toggle */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-text flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted" /> Estadístiques
        </h3>
        <div className="flex items-center gap-0.5 bg-surface-subtle border border-border rounded-lg p-0.5">
          {([7, 30, 90] as Range[]).map(d => (
            <button
              key={d}
              type="button"
              onClick={() => selectRange(d)}
              className={cn(
                'cursor-pointer px-3 h-7 rounded-md text-xs font-bold transition-colors',
                days === d ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={<Eye className="w-4 h-4" />} label="Vistes" tone="accent"
          value={stats?.totalViews} loading={loading}
          trailing={delta != null && (
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-bold',
              delta >= 0 ? 'text-success' : 'text-danger')}>
              {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(delta)}%
            </span>
          )}
        />
        <StatTile icon={<Users className="w-4 h-4" />} label="Visitants únics" value={stats?.uniqueVisitors} loading={loading} />
        <StatTile icon={<BarChart3 className="w-4 h-4" />} label="Mitjana diària" value={dailyAvg} loading={loading} />
        <StatTile icon={<FileText className="w-4 h-4" />} label="Articles publicats" value={publishedArticles} sub={`de ${totalArticles}`} loading={false} />
      </div>

      {/* Daily chart */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-subtle">Vistes per dia</h4>
          {stats?.capped && <span className="text-[11px] text-subtle">(mostra parcial)</span>}
        </div>
        {loading ? (
          <div className="h-[140px] flex items-center justify-center text-subtle"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <BarChart series={stats?.series ?? []} />
        )}
      </div>

      {/* Top articles */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <h4 className="text-xs font-bold uppercase tracking-wider text-subtle px-5 pt-5 pb-3">Articles més vistos</h4>
        {loading ? (
          <div className="px-5 pb-5 space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-lg bg-surface-subtle animate-pulse" />)}
          </div>
        ) : !stats?.topPosts.length ? (
          <p className="px-5 pb-5 text-sm text-subtle">Encara no hi ha vistes registrades en aquest període.</p>
        ) : (
          <div className="divide-y divide-border">
            {stats.topPosts.map((p, i) => (
              <div key={p.postId} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors group">
                <span className="w-6 h-6 rounded-md bg-surface-subtle text-subtle text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text truncate">{p.title}</p>
                  {p.slug && <p className="text-xs text-subtle font-mono truncate">/{p.slug}</p>}
                </div>
                <span className="text-sm font-bold text-text tabular-nums shrink-0">{p.views.toLocaleString('ca-ES')}</span>
                {p.slug && (
                  <a
                    href={`/render/${siteId}/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer text-subtle hover:text-accent opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Veure"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({
  icon, label, value, sub, tone, trailing, loading,
}: {
  icon: React.ReactNode
  label: string
  value: number | undefined
  sub?: string
  tone?: 'accent'
  trailing?: React.ReactNode
  loading: boolean
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
          tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-surface-subtle text-muted')}>
          {icon}
        </span>
        {trailing}
      </div>
      <div className="mt-3">
        {loading
          ? <div className="h-7 w-16 rounded-md bg-surface-subtle animate-pulse" />
          : <p className="text-2xl font-bold text-text leading-none tabular-nums">
              {(value ?? 0).toLocaleString('ca-ES')}{sub && <span className="text-sm font-medium text-subtle ml-1">{sub}</span>}
            </p>}
        <p className="text-xs font-medium text-subtle mt-1.5">{label}</p>
      </div>
    </div>
  )
}

// Minimal dependency-free bar chart. Bars scale to the period's peak; hovering a
// bar shows the exact day via the native title tooltip.
function BarChart({ series }: { series: SiteStats['series'] }) {
  const max = Math.max(1, ...series.map(s => s.views))
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z')
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  }
  const ticks = series.length > 1 ? [0, Math.floor(series.length / 2), series.length - 1] : [0]
  return (
    <div>
      <div className="flex items-end gap-[2px] h-[140px]">
        {series.map((s, i) => (
          <div
            key={s.date}
            className="flex-1 min-w-0 flex items-end h-full"
            title={`${fmt(s.date)} · ${s.views} vistes · ${s.visitors} únics`}
          >
            <div
              className="w-full rounded-t-sm bg-accent/80 hover:bg-accent transition-colors"
              style={{ height: `${Math.max(s.views ? 4 : 0, (s.views / max) * 100)}%` }}
              aria-hidden={i !== 0}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-subtle font-medium">
        {ticks.map(t => <span key={t}>{fmt(series[t]?.date ?? '')}</span>)}
      </div>
    </div>
  )
}
