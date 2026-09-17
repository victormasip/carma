'use client'

// Grabber Eval — superadmin review surface over the Barcelona-100 benchmark.
//
// Left: the 100 dataset cases grouped by niche, each with its review state.
// Right: the selected case, LIVE-run through the real engine (same measurement
// core as `npm run grabber:eval`): auto-checks + score, the assembled render
// preview (real pipeline + dummy articles), the raw regions, and the REWARD
// form — points 0–10, per-region OK toggles, observations — persisted to
// grabber_eval_reviews (migration 031).
//
// The reward loop: each review stores the region hashes of the run it judged.
// When the engine changes a case's output, the hashes stop matching and the
// review shows as STALE — the case re-enters the founder's queue. Engine
// iterations are therefore always scored against human labels, never able to
// silently self-approve.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Check, X, ExternalLink, RefreshCw, AlertTriangle, FlaskConical, Trophy,
  Layout, FileText, PanelBottom, Palette, Globe, Sparkles,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import KnotSpinner from '@/components/ui/KnotSpinner'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { EVAL_DATASET, evalNiches, type EvalCase } from '@/lib/grabber-lab/evalDataset'
import {
  runEvalCase, saveEvalReview, type EvalCaseRun, type EvalReviewRow,
} from '@/lib/actions/grabberEval'
import type { LabPreviewRequest } from '@/lib/grabber-lab/types'

const NICHE_LABELS: Record<string, string> = {
  dental: 'Clíniques dentals', restaurant: 'Restaurants', gym: 'Gimnasos',
  legal: 'Advocats', beauty: 'Perruqueria i estètica', realestate: 'Immobiliàries',
  education: 'Acadèmies', physio: 'Fisioteràpia', florist: 'Floristeries',
  auto: 'Tallers', vet: 'Veterinaris', bakery: 'Forns', architecture: 'Arquitectura',
  psychology: 'Psicologia', culture: 'Cultura',
}

const CHECK_LABELS: Record<string, string> = {
  'split-content': 'Pàgina tallada (chrome + contingut)',
  'header-found': 'Capçalera trobada',
  'footer-found': 'Peu trobat',
  'chrome-lean': 'El contingut no es filtra al chrome',
  'head-captured': 'Estils del <head> capturats',
  'tokens-palette': 'Paleta de colors',
  'tokens-fonts': 'Tipografies',
  'tokens-width': 'Amplada de contingut',
}

type ReviewDraft = {
  points: number
  headerOk: boolean | null
  contentOk: boolean | null
  footerOk: boolean | null
  stylesOk: boolean | null
  observations: string
}

const host = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export default function GrabberEval({ initialReviews }: { initialReviews: EvalReviewRow[] }) {
  const { toast } = useToast()
  const [reviews, setReviews] = useState<Map<string, EvalReviewRow>>(
    () => new Map(initialReviews.map(r => [r.case_id, r])),
  )
  const [selectedId, setSelectedId] = useState<string>(EVAL_DATASET[0].id)
  const selected = EVAL_DATASET.find(c => c.id === selectedId) ?? EVAL_DATASET[0]

  // Live runs are cached per case for the session; re-run on demand. "Running"
  // is DERIVED (selected case with no settled run) — the auto-run effect only
  // touches a ref + async callbacks, never sync setState (react-hooks v6).
  const [runs, setRuns] = useState<Map<string, EvalCaseRun>>(new Map())
  const run = runs.get(selectedId) ?? null
  const inflight = useRef<Set<string>>(new Set())

  const launch = (caseId: string) => {
    if (inflight.current.has(caseId)) return
    inflight.current.add(caseId)
    void runEvalCase(caseId)
      .then(r => setRuns(prev => new Map(prev).set(caseId, r)))
      .catch(() => setRuns(prev => new Map(prev).set(caseId, {
        caseId, url: '', engineVersion: '?', fetched: false, error: 'Error de xarxa',
      })))
      .finally(() => inflight.current.delete(caseId))
  }

  // Auto-run the selected case so reviewing is one click, not two. Re-running
  // clears the cached run (event handler) and this effect fires it again.
  useEffect(() => {
    if (!runs.has(selectedId)) launch(selectedId)
  }, [selectedId, runs])  

  const rerun = () => {
    setRuns(prev => {
      const next = new Map(prev)
      next.delete(selectedId)
      return next
    })
  }
  const running = !runs.has(selectedId)

  // ── Reward strip ────────────────────────────────────────────────────────────
  const reward = useMemo(() => {
    const rs = [...reviews.values()]
    const okRate = (k: 'header_ok' | 'content_ok' | 'footer_ok' | 'styles_ok') => {
      const answered = rs.filter(r => r[k] !== null)
      return answered.length ? Math.round((answered.filter(r => r[k]).length / answered.length) * 100) : null
    }
    return {
      reviewed: rs.length,
      totalPoints: rs.reduce((s, r) => s + (r.points ?? 0), 0),
      avgPoints: rs.length ? (rs.reduce((s, r) => s + (r.points ?? 0), 0) / rs.length).toFixed(1) : '—',
      header: okRate('header_ok'), content: okRate('content_ok'),
      footer: okRate('footer_ok'), styles: okRate('styles_ok'),
    }
  }, [reviews])

  const onSaved = (row: EvalReviewRow) => {
    setReviews(prev => new Map(prev).set(row.case_id, row))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-text">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-on-accent">
              <FlaskConical className="h-5 w-5" />
            </span>
            Grabber Eval · Barcelona-100
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            100 webs reals, el motor real, mètriques deterministes. Revisa cada cas, posa punts
            i observacions — el dataset de recompensa que guia el motor. Batch:{' '}
            <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs">npm run grabber:eval</code>
          </p>
        </div>
        <Link
          href="/admin/grabber-lab"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted no-underline transition-colors hover:text-text hover:bg-surface-hover"
        >
          Grabber Lab (anotació profunda) <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Reward strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <RewardStat icon={<Trophy className="h-4 w-4" />} label="Revisats" value={`${reward.reviewed}/${EVAL_DATASET.length}`} gold />
        <RewardStat icon={<Sparkles className="h-4 w-4" />} label="Punts (mitjana)" value={`${reward.totalPoints} (${reward.avgPoints})`} gold />
        <RewardStat icon={<Layout className="h-4 w-4" />} label="Capçalera OK" value={pct(reward.header)} />
        <RewardStat icon={<FileText className="h-4 w-4" />} label="Contingut OK" value={pct(reward.content)} />
        <RewardStat icon={<PanelBottom className="h-4 w-4" />} label="Peu OK" value={pct(reward.footer)} />
        <RewardStat icon={<Palette className="h-4 w-4" />} label="Estils OK" value={pct(reward.styles)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Case list ── */}
        <nav aria-label="Casos del dataset" className="max-h-[75vh] space-y-4 overflow-y-auto rounded-2xl border border-border bg-surface p-3 lg:sticky lg:top-4">
          {evalNiches().map(niche => (
            <div key={niche}>
              <p className="px-2 pb-1 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-subtle">
                {NICHE_LABELS[niche] ?? niche}
              </p>
              <div className="space-y-0.5">
                {EVAL_DATASET.filter(c => c.niche === niche).map(c => (
                  <CaseRow
                    key={c.id}
                    c={c}
                    active={c.id === selectedId}
                    review={reviews.get(c.id) ?? null}
                    running={c.id === selectedId && running}
                    onSelect={() => setSelectedId(c.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Case detail ── */}
        <CaseDetail
          key={selectedId}
          c={selected}
          run={run}
          running={running}
          review={reviews.get(selectedId) ?? null}
          onRerun={rerun}
          onSaved={onSaved}
          toast={toast}
        />
      </div>
    </div>
  )
}

const pct = (v: number | null): string => (v === null ? '—' : `${v}%`)

function RewardStat({ icon, label, value, gold = false }: {
  icon: React.ReactNode; label: string; value: string; gold?: boolean
}) {
  return (
    <div className={cn(
      'rounded-2xl border p-3.5',
      gold ? 'border-accent/30 bg-accent-soft/50' : 'border-border bg-surface',
    )}>
      <span className={cn('flex items-center gap-1.5 text-[0.65rem] font-extrabold uppercase tracking-wider', gold ? 'text-accent' : 'text-subtle')}>
        {icon} {label}
      </span>
      <p className="mt-1.5 text-lg font-bold tabular-nums text-text">{value}</p>
    </div>
  )
}

function CaseRow({ c, active, review, running, onSelect }: {
  c: EvalCase; active: boolean; review: EvalReviewRow | null; running: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        active ? 'bg-accent-soft' : 'hover:bg-surface-hover',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm leading-tight', active ? 'font-bold text-accent' : 'font-medium text-text')}>
          {c.name}
        </span>
        <span className="block truncate text-[11px] leading-tight text-subtle">{host(c.url)}</span>
      </span>
      {running && <KnotSpinner className="h-3.5 w-3.5 shrink-0 text-subtle" />}
      {review ? (
        <span className={cn(
          'shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-extrabold tabular-nums',
          review.points >= 7 ? 'bg-success-soft text-success' : review.points >= 4 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger',
        )}>
          {review.points}/10
        </span>
      ) : (
        <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[0.65rem] font-bold text-subtle">pendent</span>
      )}
    </button>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function CaseDetail({ c, run, running, review, onRerun, onSaved, toast }: {
  c: EvalCase
  run: EvalCaseRun | null
  running: boolean
  review: EvalReviewRow | null
  onRerun: () => void
  onSaved: (row: EvalReviewRow) => void
  toast: (msg: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const r = run?.result
  const stale = !!(review?.region_hashes && r && JSON.stringify(review.region_hashes) !== JSON.stringify(r.hashes))

  return (
    <div className="min-w-0 space-y-4">
      {/* Case header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-text">{c.name}</h2>
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-subtle no-underline hover:text-accent">
            <Globe className="h-3 w-3" /> {host(c.url)} <ExternalLink className="h-3 w-3" />
          </a>
          {c.notes && <p className="mt-1 text-xs italic text-subtle">{c.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          {r && (
            <span className={cn(
              'rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums',
              r.score >= 85 ? 'bg-success-soft text-success' : r.score >= 60 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger',
            )}>
              auto {r.score}/100
            </span>
          )}
          <Button onClick={onRerun} loading={running} variant="secondary" size="sm" iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>
            Re-executar
          </Button>
        </div>
      </div>

      {stale && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm font-medium text-warning">
            El motor ha canviat la sortida d&apos;aquest cas des de la teva última revisió — torna a puntuar-lo.
          </p>
        </div>
      )}

      {running && !run && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface py-16">
          <KnotSpinner className="h-8 w-8 text-accent" />
          <p className="text-sm text-muted">Executant la captura en viu…</p>
        </div>
      )}

      {run && !run.fetched && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-4">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm font-medium text-danger">{run.error ?? 'No s\'ha pogut llegir la web.'}</p>
        </div>
      )}

      {r && (
        <>
          {/* Auto-checks */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-subtle">Comprovacions automàtiques</p>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {r.checks.map(k => (
                <div key={k.id} className="flex items-center gap-2.5 rounded-lg bg-surface-subtle/60 px-2.5 py-1.5">
                  <span className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    k.ok ? 'bg-success text-white' : 'bg-danger text-white',
                  )}>
                    {k.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-text">{CHECK_LABELS[k.id] ?? k.id}</span>
                    <span className="block truncate text-[11px] text-subtle">{k.note}</span>
                  </span>
                  <span className="shrink-0 text-[0.65rem] font-bold tabular-nums text-subtle">{k.weight}p</span>
                </div>
              ))}
            </div>
          </div>

          {/* Assembled preview — the REAL render pipeline with dummy articles. */}
          <EvalPreview run={run} />

          {/* Raw regions */}
          <details className="rounded-2xl border border-border bg-surface p-4">
            <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-subtle">
              Regions extretes (raw{r.regionsTruncated ? ' · truncades per a la vista' : ''})
            </summary>
            <div className="mt-3 space-y-3">
              <RegionBlock label={`TOP · ${r.metrics.topChars.toLocaleString()} chars · ${r.meta.headerSig ?? 'sense àncora'}`} html={r.regions.top} />
              <RegionBlock label={`BOTTOM · ${r.metrics.bottomChars.toLocaleString()} chars · ${r.meta.footerSig ?? 'sense àncora'}`} html={r.regions.bottom} />
              <RegionBlock label={`HEAD · ${r.metrics.headChars.toLocaleString()} chars`} html={r.regions.head} />
            </div>
          </details>

          {/* Reward form */}
          <ReviewForm
            key={`${c.id}:${review?.updated_at ?? 'new'}`}
            c={c}
            run={run}
            review={review}
            onSaved={onSaved}
            toast={toast}
          />
        </>
      )}
    </div>
  )
}

function RegionBlock({ label, html }: { label: string; html: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-muted">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-lg bg-[#0b0d10] p-3 text-[11px] leading-relaxed text-[#9ae6b4]">
        {html.trim() || '(buit)'}
      </pre>
    </div>
  )
}

// Assembled render preview via the existing Lab preview API (same-origin blob →
// linked CSS, /api/asset fonts and image proxying resolve like the public render).
function EvalPreview({ run }: { run: EvalCaseRun }) {
  const r = run.result
  // State is keyed by the serialized request and loading/url/error are DERIVED
  // during render (same pattern as LabPreview) — the effect's only setState
  // calls live inside async callbacks, never synchronously in its body.
  const [result, setResult] = useState<{ key: string; url: string } | null>(null)
  const [errored, setErrored] = useState<{ key: string; msg: string } | null>(null)
  const lastUrl = useRef<string | null>(null)

  const key = useMemo(() => {
    if (!r) return ''
    const req: LabPreviewRequest = {
      mode: 'assembled',
      siteName: host(run.url),
      theme: {
        extracted_head: r.regions.head,
        extracted_header: r.regions.top,
        extracted_footer: r.regions.bottom,
        extracted_body_attrs: r.regions.bodyAttrs,
        design_tokens: r.tokens,
        base_url: new URL(run.url).origin,
      },
    }
    return JSON.stringify(req)
  }, [r, run.url])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetch('/api/admin/grabber-lab/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key,
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return res.text()
      })
      .then(html => {
        if (cancelled) return
        const next = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
        lastUrl.current = next
        setResult({ key, url: next })
      })
      .catch(e => { if (!cancelled) setErrored({ key, msg: e instanceof Error ? e.message : 'Error' }) })
    return () => { cancelled = true }
  }, [key])

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const url = result?.key === key ? result.url : null
  const error = errored?.key === key ? errored.msg : null

  if (!r) return null
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <p className="text-xs font-extrabold uppercase tracking-wider text-subtle">Render muntat (pipeline real + articles de mostra)</p>
        <div className="flex items-center gap-2">
          {!url && !error && <KnotSpinner className="h-3.5 w-3.5 text-subtle" />}
          {url && (
            <button
              type="button"
              onClick={() => window.open(url, '_blank')}
              className="cursor-pointer inline-flex items-center gap-1 text-xs text-subtle transition-colors hover:text-text"
            >
              Obrir <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {error ? (
        <p className="px-4 py-8 text-center text-sm text-danger">{error}</p>
      ) : url ? (
        <iframe
          src={url}
          title="Render preview"
          className="h-[480px] w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      ) : (
        <div className="h-[480px] w-full animate-pulse bg-surface-subtle" />
      )}
    </div>
  )
}

// ── Reward form ────────────────────────────────────────────────────────────────

function ReviewForm({ c, run, review, onSaved, toast }: {
  c: EvalCase
  run: EvalCaseRun
  review: EvalReviewRow | null
  onSaved: (row: EvalReviewRow) => void
  toast: (msg: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const r = run.result
  const [pending, startTransition] = useTransition()
  // Prefill: the saved review wins; otherwise seed from the auto-checks so a
  // "looks right" case is one click away from saved.
  const [draft, setDraft] = useState<ReviewDraft>(() => {
    if (review) {
      return {
        points: review.points,
        headerOk: review.header_ok, contentOk: review.content_ok,
        footerOk: review.footer_ok, stylesOk: review.styles_ok,
        observations: review.observations ?? '',
      }
    }
    const ck = Object.fromEntries((r?.checks ?? []).map(k => [k.id, k.ok]))
    return {
      points: r ? Math.round(r.score / 10) : 5,
      headerOk: ck['header-found'] ?? null,
      contentOk: ck['chrome-lean'] ?? null,
      footerOk: ck['footer-found'] ?? null,
      stylesOk: (ck['tokens-palette'] && ck['tokens-fonts']) ?? null,
      observations: '',
    }
  })

  const save = () => {
    startTransition(async () => {
      const res = await saveEvalReview({
        caseId: c.id,
        points: draft.points,
        headerOk: draft.headerOk, contentOk: draft.contentOk,
        footerOk: draft.footerOk, stylesOk: draft.stylesOk,
        observations: draft.observations,
        regionHashes: r?.hashes ?? null,
        autoScore: r?.score ?? null,
      })
      if (res.error) { toast(res.error, 'error'); return }
      toast('Revisió desada al dataset.', 'success')
      onSaved({
        case_id: c.id,
        points: draft.points,
        header_ok: draft.headerOk, content_ok: draft.contentOk,
        footer_ok: draft.footerOk, styles_ok: draft.stylesOk,
        observations: draft.observations || null,
        region_hashes: r?.hashes ?? null,
        engine_hash: run.engineVersion,
        auto_score: r?.score ?? null,
        updated_at: new Date().toISOString(),
      })
    })
  }

  return (
    <div className="gold-trace [--gold-trace-w:1px] rounded-2xl border border-transparent bg-surface p-4">
      <p className="text-xs font-extrabold uppercase tracking-wider text-accent">La teva revisió</p>

      {/* Points 0–10 */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold text-muted">Punts</p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDraft(d => ({ ...d, points: i }))}
              className={cn(
                'h-9 w-9 cursor-pointer rounded-lg text-sm font-extrabold tabular-nums transition-colors',
                draft.points === i
                  ? 'bg-accent text-on-accent shadow-card'
                  : 'bg-surface-subtle text-muted hover:bg-surface-hover hover:text-text',
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      {/* Per-region verdicts */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RegionToggle label="Capçalera" value={draft.headerOk} onChange={v => setDraft(d => ({ ...d, headerOk: v }))} />
        <RegionToggle label="Contingut" value={draft.contentOk} onChange={v => setDraft(d => ({ ...d, contentOk: v }))} />
        <RegionToggle label="Peu" value={draft.footerOk} onChange={v => setDraft(d => ({ ...d, footerOk: v }))} />
        <RegionToggle label="Estils" value={draft.stylesOk} onChange={v => setDraft(d => ({ ...d, stylesOk: v }))} />
      </div>

      {/* Observations */}
      <textarea
        value={draft.observations}
        onChange={e => setDraft(d => ({ ...d, observations: e.target.value }))}
        placeholder="Observacions: què falla, què falta, com hauria de quedar…"
        rows={3}
        className="mt-4 w-full rounded-xl border border-border bg-surface-subtle p-3 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent focus:bg-surface"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-subtle">
          {review ? `Última revisió: ${new Date(review.updated_at).toLocaleString('ca')}` : 'Encara sense revisar'}
        </p>
        <Button glow onClick={save} loading={pending} iconLeft={<Check className="h-4 w-4" />}>
          Desar al dataset
        </Button>
      </div>
    </div>
  )
}

function RegionToggle({ label, value, onChange }: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle p-2">
      <p className="px-1 pb-1.5 text-[11px] font-bold text-muted">{label}</p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(value === true ? null : true)}
          className={cn(
            'flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md transition-colors',
            value === true ? 'bg-success text-white' : 'bg-surface text-subtle hover:text-success',
          )}
          title="Correcte"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => onChange(value === false ? null : false)}
          className={cn(
            'flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md transition-colors',
            value === false ? 'bg-danger text-white' : 'bg-surface text-subtle hover:text-danger',
          )}
          title="Incorrecte"
        >
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
