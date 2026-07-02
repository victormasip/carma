'use client'

// Theme Grabber Lab — the data-collection cockpit (superadmin only).
//
// Flow: paste a target URL → run the REAL grabber (/api/theme/analyze, the same
// SSE pipeline production uses) → the system's output lands read-only on the left
// and a live render (with 10 dummy articles) on the right. The operator then
// pastes the perfectly-corrected header/footer, the full hand-assembled "perfect"
// HTML document, and diagnostic notes, and saves the annotated sample. That
// dataset is the Source of Truth the future extraction engine will learn from.

import { useCallback, useRef, useState } from 'react'
import {
  Play, Wand2, Save, Trash2, RotateCcw, ChevronDown, Copy, Check,
  Cpu, Server, Globe2, Languages, Type, Link2, FileCode2, ClipboardPaste, History,
  Plus, ArrowLeft, Clock, FlaskConical,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import KnotSpinner from '@/components/ui/KnotSpinner'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { normalizeUrl } from '@/lib/onboarding/url'
import { formatDate } from '@/lib/format'
import {
  CAPTURE_STEPS, parseSseFrame,
  type AnalyzeResult, type CaptureStepId, type CaptureStepStatus,
} from '@/lib/render/captureProgress'
import type { DesignTokens } from '@/lib/scrape/tokens'
import type { BlogSignature } from '@/lib/scrape/blogDetect'
import { saveLabSample, deleteLabSample, getLabSample } from '@/lib/actions/grabberLab'
import {
  FAILURE_TAGS,
  type LabCapture, type LabPreviewTheme, type LabSampleInput,
  type LabSampleListItem, type LabSampleRow, type LabSampleStatus,
} from '@/lib/grabber-lab/types'
import { diagnoseCapture, type DiagSeverity } from '@/lib/grabber-lab/diagnose'
import LabPreview from './LabPreview'
import LabDomPanel from './LabDomPanel'

// Auto-diagnostics severity → dot colour + score-ring tint.
const SEV_DOT: Record<DiagSeverity, string> = { pass: 'bg-success', warn: 'bg-warning', fail: 'bg-danger' }

const STEP_IDS = CAPTURE_STEPS.map(s => s.id)
const initialSteps = () =>
  Object.fromEntries(STEP_IDS.map(id => [id, 'pending'])) as Record<CaptureStepId, CaptureStepStatus>

const STALL_MS = 60_000

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-border bg-bg-elevated text-sm text-text placeholder:text-subtle ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow'

// ── capture builders ─────────────────────────────────────────────────────────
function captureFromAnalyze(targetUrl: string, blogUrl: string, data: AnalyzeResult): LabCapture {
  const d = (data.detection ?? {}) as { framework?: string; version?: string; hosting?: string | null; confidence?: string }
  return {
    targetUrl, blogUrl: blogUrl || null, baseUrl: data.base_url ?? null,
    detection: { framework: d.framework ?? null, version: d.version ?? null, hosting: d.hosting ?? null, confidence: d.confidence ?? null },
    detectedLocale: data.detected_locale ?? null, siteName: data.site_name ?? null, sectionTitle: data.section_title ?? null,
    rawHead: data.extracted_head ?? '', rawHeader: data.extracted_header ?? '', rawFooter: data.extracted_footer ?? '',
    bodyAttrs: data.extracted_body_attrs ?? '',
    designTokens: data.tokens ?? null, blogSignature: data.blog_signature ?? null,
    externalStyles: data.external_styles ?? [], externalScripts: data.external_scripts ?? [], fontLinks: data.font_links ?? [],
    raw: data,
  }
}

function captureFromRow(r: LabSampleRow): LabCapture {
  return {
    targetUrl: r.target_url, blogUrl: r.blog_url, baseUrl: r.base_url,
    detection: { framework: r.detected_framework, version: r.detected_framework_version, hosting: r.detected_hosting, confidence: r.detection_confidence },
    detectedLocale: r.detected_locale, siteName: r.detected_site_name, sectionTitle: r.detected_section_title,
    rawHead: r.system_raw_head ?? '', rawHeader: r.system_raw_header ?? '', rawFooter: r.system_raw_footer ?? '', bodyAttrs: r.system_body_attrs ?? '',
    designTokens: (r.system_design_tokens ?? null) as Partial<DesignTokens> | null,
    blogSignature: (r.system_blog_signature ?? null) as BlogSignature | null,
    externalStyles: r.system_external_styles ?? [], externalScripts: r.system_external_scripts ?? [], fontLinks: r.system_font_links ?? [],
    raw: (r.capture_raw ?? {}) as AnalyzeResult,
  }
}

export default function GrabberLab({ recent }: { recent: LabSampleListItem[] }) {
  const { toast } = useToast()

  // The Lab opens on the DASHBOARD (the saved-samples dataset) when there's
  // history; otherwise it drops straight into the extraction form.
  const [view, setView] = useState<'dashboard' | 'lab'>(recent.length ? 'dashboard' : 'lab')

  // capture input + progress
  const [url, setUrl] = useState('')
  const [blogUrl, setBlogUrl] = useState('')
  const [showBlogUrl, setShowBlogUrl] = useState(false)
  const [running, setRunning] = useState(false)
  const [pct, setPct] = useState(0)
  const [activeStep, setActiveStep] = useState<CaptureStepId | null>(null)
  const [stepStatus, setStepStatus] = useState<Record<CaptureStepId, CaptureStepStatus>>(initialSteps())
  const [stepDetail, setStepDetail] = useState<Partial<Record<CaptureStepId, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // captured system output
  const [capture, setCapture] = useState<LabCapture | null>(null)

  // ground-truth / annotation (editable)
  const [siteName, setSiteName] = useState('')
  const [truthHeader, setTruthHeader] = useState('')
  const [truthFooter, setTruthFooter] = useState('')
  const [truthBodyAttrs, setTruthBodyAttrs] = useState('')
  const [perfectHtml, setPerfectHtml] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [status, setStatus] = useState<LabSampleStatus>('draft')

  // persistence
  const [sampleId, setSampleId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [samples, setSamples] = useState<LabSampleListItem[]>(recent)

  // ── run the real grabber over SSE ──────────────────────────────────────────
  const run = useCallback(async () => {
    const target = normalizeUrl(url)
    if (!target) { setError('Cal una URL de prova.'); return }
    try { new URL(target) } catch { setError('URL no vàlida.'); return }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setRunning(true); setError(null); setPct(0)
    setStepStatus(initialSteps()); setStepDetail({}); setActiveStep(null)

    let stall: ReturnType<typeof setTimeout> | null = null
    const bump = () => { if (stall) clearTimeout(stall); stall = setTimeout(() => controller.abort(), STALL_MS) }

    try {
      const res = await fetch('/api/theme/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ url: target, blogUrl: normalizeUrl(blogUrl) || undefined }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const j = res.body ? await res.json().catch(() => null) as { error?: string } | null : null
        throw new Error(j?.error ?? `Error del servidor (${res.status}).`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      bump()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bump()
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const evt = parseSseFrame(frame)
          if (!evt) continue
          if (evt.type === 'progress') {
            setPct(p => Math.max(p, evt.pct))
            if (evt.status === 'running') setActiveStep(evt.step)
            setStepStatus(s => ({ ...s, [evt.step]: evt.status }))
            if (evt.detail) setStepDetail(d => ({ ...d, [evt.step]: evt.detail }))
          } else if (evt.type === 'result') {
            const cap = captureFromAnalyze(target, blogUrl, evt.data)
            setCapture(cap)
            setSiteName(cap.siteName ?? '')
            // A fresh capture is a NEW sample to annotate — detach from any
            // previously-opened row and clear stale ground-truth.
            setSampleId(null)
            setTruthHeader(''); setTruthFooter(''); setTruthBodyAttrs('')
            setPerfectHtml(''); setNotes(''); setTags([]); setStatus('draft')
            setPct(100); setActiveStep(null)
            toast(`Captura completada · ${cap.detection.framework ?? 'desconegut'}`, 'success')
          } else if (evt.type === 'error') {
            setError(evt.error)
            if (evt.step) setStepStatus(s => ({ ...s, [evt.step!]: 'error' }))
          }
          // notices are non-fatal — ignored in the Lab
        }
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      setError(aborted ? 'La captura s’ha aturat (el servidor ha deixat de respondre).' : (e instanceof Error ? e.message : 'Error de xarxa.'))
    } finally {
      if (stall) clearTimeout(stall)
      setRunning(false)
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [url, blogUrl, toast])

  // ── preview themes (derived) ───────────────────────────────────────────────
  const systemTheme: LabPreviewTheme | null = capture && {
    extracted_head: capture.rawHead,
    extracted_header: capture.rawHeader,
    extracted_footer: capture.rawFooter,
    extracted_body_attrs: capture.bodyAttrs,
    design_tokens: capture.designTokens,
    font_links: capture.fontLinks,
    section_title: capture.sectionTitle,
    blog_signature: capture.blogSignature,
    base_url: capture.baseUrl,
    default_locale: capture.detectedLocale,
  }
  const truthTheme: LabPreviewTheme | null = capture && systemTheme && {
    ...systemTheme,
    extracted_header: truthHeader.trim() || capture.rawHeader,
    extracted_footer: truthFooter.trim() || capture.rawFooter,
    extracted_body_attrs: truthBodyAttrs.trim() || capture.bodyAttrs,
  }

  // Automatic capture diagnostics — objective quality signals + suggested failure
  // tags, recomputed from the current capture. Pure, so it's cheap to derive here.
  const diagnosis = capture ? diagnoseCapture(capture) : null
  const applySuggestedTags = useCallback(() => {
    if (!diagnosis) return
    setTags(prev => Array.from(new Set([...prev, ...diagnosis.suggestedTags])))
  }, [diagnosis])

  // ── save / reset / reopen / delete ─────────────────────────────────────────
  const save = useCallback(async () => {
    const targetUrl = capture?.targetUrl ?? url.trim()
    if (!targetUrl) { toast('Cal una URL de prova abans de desar.', 'error'); return }
    setSaving(true)
    const input: LabSampleInput = {
      id: sampleId,
      targetUrl,
      blogUrl: (capture?.blogUrl ?? blogUrl) || null,
      baseUrl: capture?.baseUrl ?? null,
      detectedFramework: capture?.detection.framework ?? null,
      detectedFrameworkVersion: capture?.detection.version ?? null,
      detectedHosting: capture?.detection.hosting ?? null,
      detectionConfidence: capture?.detection.confidence ?? null,
      detectedLocale: capture?.detectedLocale ?? null,
      detectedSiteName: capture?.siteName ?? null,
      detectedSectionTitle: capture?.sectionTitle ?? null,
      systemRawHead: capture?.rawHead ?? null,
      systemRawHeader: capture?.rawHeader ?? null,
      systemRawFooter: capture?.rawFooter ?? null,
      systemBodyAttrs: capture?.bodyAttrs ?? null,
      systemDesignTokens: capture?.designTokens ?? null,
      systemBlogSignature: capture?.blogSignature ?? null,
      systemExternalStyles: capture?.externalStyles ?? [],
      systemExternalScripts: capture?.externalScripts ?? [],
      systemFontLinks: capture?.fontLinks ?? [],
      captureRaw: capture?.raw ?? null,
      truthRawHeader: truthHeader || null,
      truthRawFooter: truthFooter || null,
      truthBodyAttrs: truthBodyAttrs || null,
      perfectHtml: perfectHtml || null,
      diagnosticNotes: notes || null,
      failureTags: tags,
      status,
    }
    const res = await saveLabSample(input)
    setSaving(false)
    if (res.error) { toast(res.error, 'error'); return }
    const id = res.id ?? sampleId
    setSampleId(id ?? null)
    toast(sampleId ? 'Mostra actualitzada.' : 'Mostra desada al dataset.', 'success')
    // Reflect in the local history rail immediately.
    if (id) {
      setSamples(prev => {
        const item: LabSampleListItem = {
          id, target_url: targetUrl, detected_framework: capture?.detection.framework ?? null,
          status, updated_at: new Date().toISOString(),
        }
        return [item, ...prev.filter(s => s.id !== id)]
      })
    }
  }, [capture, url, blogUrl, sampleId, truthHeader, truthFooter, truthBodyAttrs, perfectHtml, notes, tags, status, toast])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setCapture(null); setSampleId(null)
    setUrl(''); setBlogUrl(''); setShowBlogUrl(false)
    setSiteName(''); setTruthHeader(''); setTruthFooter(''); setTruthBodyAttrs('')
    setPerfectHtml(''); setNotes(''); setTags([]); setStatus('draft')
    setError(null); setPct(0); setStepStatus(initialSteps()); setStepDetail({}); setActiveStep(null)
  }, [])

  const reopen = useCallback(async (id: string) => {
    const res = await getLabSample(id)
    if (res.error || !res.sample) { toast(res.error ?? 'No s’ha pogut obrir la mostra.', 'error'); return }
    const r = res.sample
    const cap = captureFromRow(r)
    setCapture(cap)
    setSampleId(r.id)
    setUrl(r.target_url); setBlogUrl(r.blog_url ?? ''); setShowBlogUrl(!!r.blog_url)
    setSiteName(cap.siteName ?? '')
    setTruthHeader(r.truth_raw_header ?? ''); setTruthFooter(r.truth_raw_footer ?? ''); setTruthBodyAttrs(r.truth_body_attrs ?? '')
    setPerfectHtml(r.perfect_html ?? ''); setNotes(r.diagnostic_notes ?? '')
    setTags(r.failure_tags ?? []); setStatus((r.status as LabSampleStatus) ?? 'draft')
    setError(null)
    setView('lab')
    toast('Mostra carregada.', 'info')
  }, [toast])

  // Start a fresh extraction (clears the workspace and enters the form).
  const openNew = useCallback(() => { reset(); setView('lab') }, [reset])

  const remove = useCallback(async (id: string) => {
    const res = await deleteLabSample(id)
    if (res.error) { toast(res.error, 'error'); return }
    setSamples(prev => prev.filter(s => s.id !== id))
    if (sampleId === id) setSampleId(null)
    toast('Mostra eliminada.', 'success')
  }, [sampleId, toast])

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const seedTruthFromSystem = () => {
    if (!capture) return
    setTruthHeader(capture.rawHeader); setTruthFooter(capture.rawFooter); setTruthBodyAttrs(capture.bodyAttrs)
    toast('Overrides inicialitzats amb la sortida del sistema.', 'info')
  }

  const det = capture?.detection
  const tokensJson = capture?.designTokens ? JSON.stringify(capture.designTokens, null, 2) : ''
  const blogSigJson = capture?.blogSignature ? JSON.stringify(capture.blogSignature, null, 2) : ''

  if (view === 'dashboard') {
    return <LabDashboard samples={samples} onNew={openNew} onOpen={reopen} onDelete={remove} />
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto">
      {/* Title */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setView('dashboard')}
            className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-subtle hover:text-text transition-colors mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Tauler del Lab
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-text flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-accent" /> Theme Grabber Lab
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
            Executa el grabber real sobre una URL, compara la seva sortida amb la teva correcció manual i desa la mostra
            al dataset de «Source of Truth». 10 articles de prova s’injecten al feed perquè vegis si el CSS del client trenca el layout.
          </p>
        </div>
        {capture && (
          <Button variant="ghost" size="sm" iconLeft={<RotateCcw className="w-4 h-4" />} onClick={reset}>Nova prova</Button>
        )}
      </div>

      {/* Run bar */}
      <Card className="mb-5" padded>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              className={inputCls}
              placeholder="https://exemple.com — URL de referència a analitzar"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !running) run() }}
              spellCheck={false}
            />
            <Button onClick={run} loading={running} iconLeft={!running ? <Play className="w-4 h-4" /> : undefined} className="sm:w-auto w-full shrink-0">
              {running ? 'Capturant…' : 'Executa el grabber'}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowBlogUrl(v => !v)}
              className="cursor-pointer text-xs font-medium text-subtle hover:text-text inline-flex items-center gap-1 transition-colors"
            >
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showBlogUrl && 'rotate-180')} />
              URL del blog (opcional)
            </button>
          </div>
          {showBlogUrl && (
            <input
              className={inputCls}
              placeholder="https://exemple.com/noticies — guia la detecció de targetes d’article"
              value={blogUrl}
              onChange={e => setBlogUrl(e.target.value)}
              spellCheck={false}
            />
          )}

          {(running || pct > 0 || error) && (
            <StepProgress pct={pct} steps={stepStatus} detail={stepDetail} active={activeStep} error={error} />
          )}
        </div>
      </Card>

      {/* Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-5">
        {/* Left — annotation */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Auto-detected meta */}
          <Card padded>
            <SectionTitle icon={<Cpu className="w-4 h-4" />} title="Meta auto-detectada" hint="El que el detector de framework + l’scraper han trobat" />
            {!capture ? (
              <p className="text-sm text-subtle mt-3">Executa el grabber per veure la tecnologia detectada.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <Meta icon={<Cpu className="w-3.5 h-3.5" />} label="Framework" value={det?.framework} extra={det?.version ? `v${det.version}` : null} accent />
                <Meta icon={<Badge tone={confTone(det?.confidence)} size="sm">{det?.confidence ?? '—'}</Badge>} label="Confiança" value={det?.confidence} raw />
                <Meta icon={<Server className="w-3.5 h-3.5" />} label="Hosting" value={det?.hosting} />
                <Meta icon={<Languages className="w-3.5 h-3.5" />} label="Idioma" value={capture.detectedLocale} />
                <Meta icon={<Type className="w-3.5 h-3.5" />} label="Nom del lloc" value={capture.siteName} />
                <Meta icon={<Type className="w-3.5 h-3.5" />} label="Títol de secció" value={capture.sectionTitle} />
                <Meta icon={<Link2 className="w-3.5 h-3.5" />} label="Base URL" value={capture.baseUrl} mono span2 />
                <Meta icon={<Globe2 className="w-3.5 h-3.5" />} label="Recursos" value={`${capture.externalStyles.length} CSS · ${capture.fontLinks.length} fonts · ${capture.externalScripts.length} scripts`} span2 />
              </div>
            )}
          </Card>

          {/* System output (read-only) */}
          <Card padded>
            <SectionTitle icon={<FileCode2 className="w-4 h-4" />} title="Sortida del sistema" hint="Snapshot read-only del grabber actual" />
            {!capture ? (
              <p className="text-sm text-subtle mt-3">Encara no hi ha cap captura.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <ReadField label="raw_header" value={capture.rawHeader} />
                <ReadField label="raw_footer" value={capture.rawFooter} />
                <ReadField label="body_attrs" value={capture.bodyAttrs} small />
                <ReadField label="raw_head" value={capture.rawHead} collapsed />
                {tokensJson && <ReadField label="design_tokens" value={tokensJson} collapsed />}
                {blogSigJson && <ReadField label="blog_signature" value={blogSigJson} collapsed />}
              </div>
            )}
          </Card>

          {/* Auto-diagnostics — objective signals + one-click suggested tags */}
          {capture && diagnosis && (
            <Card padded>
              <div className="flex items-center justify-between gap-3">
                <SectionTitle icon={<FlaskConical className="w-4 h-4" />} title="Diagnòstic automàtic" hint="Senyals objectius de la captura" />
                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center min-w-12 h-9 px-2.5 rounded-lg text-sm font-extrabold tabular-nums',
                      diagnosis.score >= 80 ? 'bg-success-soft text-success'
                        : diagnosis.score >= 50 ? 'bg-warning-soft text-warning'
                        : 'bg-danger-soft text-danger',
                    )}
                    title="Puntuació de salut de la captura (100 = clonatge net)"
                  >
                    {diagnosis.score}
                  </span>
                </div>
              </div>
              <ul className="mt-3 flex flex-col divide-y divide-border">
                {diagnosis.signals.map(s => (
                  <li key={s.id} className="flex items-start gap-2.5 py-2">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEV_DOT[s.severity])} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{s.label}</p>
                      <p className="text-xs text-muted leading-snug">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {diagnosis.suggestedTags.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="text-xs font-semibold text-subtle">Etiquetes suggerides:</span>
                  {diagnosis.suggestedTags.map(t => (
                    <span key={t} className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-medium text-muted border border-border">{t}</span>
                  ))}
                  <Button variant="ghost" size="sm" onClick={applySuggestedTags} iconLeft={<Plus className="w-3.5 h-3.5" />}>
                    Aplica-les
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* DOM pattern analysis — structural fingerprint of the captured chrome */}
          {capture && (
            <LabDomPanel
              header={capture.rawHeader}
              footer={capture.rawFooter}
              head={capture.rawHead}
              perfectHtml={perfectHtml}
            />
          )}

          {/* Ground-truth overrides (editable) */}
          <Card padded>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={<ClipboardPaste className="w-4 h-4" />} title="Ground truth" hint="La teva correcció manual perfecta" />
              {capture && (
                <Button variant="ghost" size="sm" onClick={seedTruthFromSystem} iconLeft={<Copy className="w-3.5 h-3.5" />}>
                  Inicialitza des del sistema
                </Button>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <EditField label="raw_header corregit" value={truthHeader} onChange={setTruthHeader} placeholder="Enganxa aquí el header perfecte…" rows={6} />
              <EditField label="raw_footer corregit" value={truthFooter} onChange={setTruthFooter} placeholder="Enganxa aquí el footer perfecte…" rows={6} />
              <EditField label="body_attrs corregit" value={truthBodyAttrs} onChange={setTruthBodyAttrs} placeholder='ex: class="theme-light" data-…' rows={2} />
            </div>
          </Card>

          {/* Perfect HTML document */}
          <Card padded>
            <SectionTitle icon={<FileCode2 className="w-4 h-4" />} title="Document HTML «perfecte»" hint="El document complet i 100% funcional muntat a mà — la veritat absoluta" />
            <div className="mt-3">
              <EditField
                label="perfect_html"
                value={perfectHtml}
                onChange={setPerfectHtml}
                placeholder="<!doctype html> … document sencer i funcional …"
                rows={14}
                mono
              />
            </div>
          </Card>

          {/* Diagnostics */}
          <Card padded>
            <SectionTitle icon={<History className="w-4 h-4" />} title="Diagnòstic" hint="Per què ha fallat i com l’has corregit" />
            <div className="mt-3 flex flex-col gap-4">
              <EditField
                label="Notes de diagnòstic"
                value={notes}
                onChange={setNotes}
                placeholder="ex: «El sistema ha tallat el wrapper d’Elementor massa aviat; he hagut de pujar el tall 2 divs»"
                rows={3}
              />
              <div>
                <FieldLabel>Etiquetes de fallada</FieldLabel>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {FAILURE_TAGS.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                        tags.includes(t)
                          ? 'bg-accent text-on-accent border-accent'
                          : 'bg-bg-elevated text-muted border-border hover:text-text hover:border-border-strong',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FieldLabel>Estat</FieldLabel>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(['draft', 'annotated', 'verified'] as LabSampleStatus[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        'cursor-pointer px-3 h-7 text-xs font-semibold rounded-md transition-colors capitalize',
                        status === s ? 'bg-accent text-on-accent' : 'text-muted hover:text-text',
                      )}
                    >
                      {s === 'draft' ? 'esborrany' : s === 'annotated' ? 'anotada' : 'verificada'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Save bar */}
          <div className="sticky bottom-4 z-10">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated/95 backdrop-blur px-4 py-3 shadow-card">
              <Button onClick={save} loading={saving} iconLeft={!saving ? <Save className="w-4 h-4" /> : undefined}>
                {sampleId ? 'Actualitza la mostra' : 'Desa al dataset'}
              </Button>
              {sampleId && (
                <Button variant="danger" size="md" onClick={() => remove(sampleId)} iconLeft={<Trash2 className="w-4 h-4" />}>
                  Elimina
                </Button>
              )}
              <span className="ml-auto text-xs text-subtle">
                {sampleId ? `Editant mostra · ${sampleId.slice(0, 8)}` : 'Mostra nova'}
              </span>
            </div>
          </div>
        </div>

        {/* Right — live preview (sticky) */}
        <div className="min-w-0">
          <div className="xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)] h-[78vh] flex flex-col">
            <LabPreview
              system={systemTheme}
              truth={truthTheme}
              perfectHtml={perfectHtml}
              siteName={siteName || capture?.siteName || 'Lab Preview'}
              locale={capture?.detectedLocale ?? null}
              hasCapture={!!capture}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── small components ───────────────────────────────────────────────────────────

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-text flex items-center gap-2">
        <span className="text-accent">{icon}</span>{title}
      </h2>
      {hint && <p className="text-xs text-subtle mt-0.5">{hint}</p>}
    </div>
  )
}

function confTone(c?: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (c === 'high') return 'success'
  if (c === 'medium') return 'warning'
  if (c === 'low') return 'danger'
  return 'neutral'
}

function Meta({
  icon, label, value, extra, mono, span2, accent, raw,
}: {
  icon: React.ReactNode
  label: string
  value?: string | null
  extra?: string | null
  mono?: boolean
  span2?: boolean
  accent?: boolean
  raw?: boolean
}) {
  return (
    <div className={cn('min-w-0', span2 && 'col-span-2')}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle flex items-center gap-1.5">
        <span className="text-subtle">{!raw && icon}</span>{label}
      </div>
      <div className={cn('mt-0.5 text-sm flex items-center gap-2 min-w-0', accent ? 'text-text font-semibold' : 'text-muted')}>
        {raw ? icon : (
          <>
            <span className={cn('truncate', mono && 'font-mono text-xs')} title={value ?? ''}>{value || '—'}</span>
            {extra && <Badge tone="neutral" size="sm">{extra}</Badge>}
          </>
        )}
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{children}</span>
}

function ReadField({ label, value, small, collapsed }: { label: string; value: string; small?: boolean; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed)
  const [copied, setCopied] = useState(false)
  const empty = !value?.trim()
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* noop */ }
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 h-8 bg-bg-elevated/60">
        <button type="button" onClick={() => setOpen(o => !o)} className="cursor-pointer flex items-center gap-1.5 min-w-0">
          <ChevronDown className={cn('w-3.5 h-3.5 text-subtle transition-transform shrink-0', !open && '-rotate-90')} />
          <span className="text-xs font-mono font-semibold text-muted truncate">{label}</span>
          <span className="text-[10px] text-subtle shrink-0">{empty ? 'buit' : `${value.length.toLocaleString()} car.`}</span>
        </button>
        {!empty && (
          <button type="button" onClick={copy} className="cursor-pointer text-subtle hover:text-text transition-colors shrink-0" title="Copia">
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {open && (
        <textarea
          readOnly
          value={empty ? '(buit)' : value}
          className={cn(
            'w-full bg-[#0b0d10] text-[#cbd5e1] font-mono p-3 resize-y focus:outline-none block',
            small ? 'text-[11px] h-16' : 'text-[11px] h-40',
          )}
          spellCheck={false}
          onFocus={e => e.currentTarget.select()}
        />
      )}
    </div>
  )
}

function EditField({
  label, value, onChange, placeholder, rows = 4, mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  mono?: boolean
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        className={cn(
          'mt-1.5 w-full rounded-lg border border-border bg-bg-elevated text-text p-3 resize-y',
          'placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow',
          mono ? 'font-mono text-[11px] leading-relaxed' : 'text-sm',
        )}
      />
    </label>
  )
}

function StepProgress({
  pct, steps, detail, active, error,
}: {
  pct: number
  steps: Record<CaptureStepId, CaptureStepStatus>
  detail: Partial<Record<CaptureStepId, string>>
  active: CaptureStepId | null
  error: string | null
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated/50 p-3">
      <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', error ? 'bg-danger' : 'bg-accent')}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {CAPTURE_STEPS.map(s => {
          const st = steps[s.id]
          return (
            <span
              key={s.id}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs',
                st === 'done' ? 'text-success' : st === 'error' ? 'text-danger' : st === 'skipped' ? 'text-warning'
                  : st === 'running' ? 'text-text font-semibold' : 'text-subtle',
              )}
            >
              {st === 'running'
                ? <KnotSpinner className="w-3 h-3" />
                : <span className={cn('w-1.5 h-1.5 rounded-full',
                    st === 'done' ? 'bg-success' : st === 'error' ? 'bg-danger' : st === 'skipped' ? 'bg-warning' : 'bg-subtle')} />}
              {s.label}
              {detail[s.id] && <span className="text-subtle font-normal">· {detail[s.id]}</span>}
            </span>
          )
        })}
      </div>
      {error && <p className="mt-2 text-xs text-danger font-medium">{error}</p>}
      {active && !error && <p className="mt-2 text-xs text-subtle">{CAPTURE_STEPS.find(s => s.id === active)?.hint}</p>}
    </div>
  )
}

// ── Lab Dashboard (list-first landing) ─────────────────────────────────────────

function statusMeta(status: string): { tone: 'success' | 'info' | 'neutral'; label: string } {
  if (status === 'verified') return { tone: 'success', label: 'verificada' }
  if (status === 'annotated') return { tone: 'info', label: 'anotada' }
  return { tone: 'neutral', label: 'esborrany' }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function LabDashboard({
  samples, onNew, onOpen, onDelete,
}: {
  samples: LabSampleListItem[]
  onNew: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const verified = samples.filter(s => s.status === 'verified').length
  const annotated = samples.filter(s => s.status === 'annotated').length

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-text flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-accent" /> Theme Grabber Lab
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
            El teu dataset de «Source of Truth». Cada mostra captura la sortida del grabber i la teva correcció
            manual perfecta — el material amb què dissenyarem el motor d’extracció definitiu.
          </p>
          {samples.length > 0 && (
            <div className="flex items-center gap-4 mt-3 text-xs text-subtle">
              <span><strong className="text-text">{samples.length}</strong> mostres</span>
              <span className="text-success"><strong>{verified}</strong> verificades</span>
              <span className="text-info"><strong>{annotated}</strong> anotades</span>
            </div>
          )}
        </div>
        <Button onClick={onNew} iconLeft={<Plus className="w-4 h-4" />} className="shrink-0">Nova extracció</Button>
      </div>

      {samples.length === 0 ? (
        <Card padded className="flex flex-col items-center text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mb-4">
            <FlaskConical className="w-7 h-7 text-accent" />
          </div>
          <h2 className="text-lg font-bold text-text">Encara no hi ha mostres</h2>
          <p className="text-sm text-muted mt-1 max-w-md">
            Executa el grabber sobre una web, anota la correcció perfecta i desa-la. Així comences a construir el dataset.
          </p>
          <Button onClick={onNew} iconLeft={<Plus className="w-4 h-4" />} className="mt-5">Primera extracció</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {samples.map(s => {
            const st = statusMeta(s.status)
            return (
              <Card
                key={s.id}
                interactive
                padded
                onClick={() => onOpen(s.id)}
                className="group cursor-pointer flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-text truncate" title={s.target_url}>{hostOf(s.target_url)}</p>
                    <p className="text-xs text-subtle truncate">{s.target_url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}
                    className="cursor-pointer text-subtle hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-0.5 -mr-0.5 p-1"
                    title="Elimina"
                    aria-label="Elimina la mostra"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {s.detected_framework && <Badge tone="accent" size="sm">{s.detected_framework}</Badge>}
                  <Badge tone={st.tone} size="sm" dot>{st.label}</Badge>
                </div>

                {s.diagnostic_notes?.trim() && (
                  <p className="text-xs text-muted leading-relaxed line-clamp-3">{s.diagnostic_notes}</p>
                )}

                <div className="mt-auto flex items-center gap-1.5 text-xs text-subtle pt-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(s.updated_at, 'medium')}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
