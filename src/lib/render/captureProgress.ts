// Shared contract for the streaming Theme-capture pipeline.
//
// The capture used to be ONE synchronous POST that fetched the page, fetched
// every stylesheet sequentially and ran the LLM reconstruction (15-40s) before
// returning a single JSON blob — so it timed out on heavy sites and left the
// user staring at a spinner. It is now a resilient, step-by-step pipeline that
// streams its progress over Server-Sent Events.
//
// This module is the single source of truth for the steps and the wire format,
// imported by BOTH the streaming route (server) and the Theme Studio context +
// capture modal (client). It is import-safe everywhere: the only non-local
// dependency is a TYPE-only import that erases at build time.

import type { DesignTokens } from '@/lib/scrape/tokens'
import type { BlogSignature } from '@/lib/scrape/blogDetect'

// ─── Pipeline steps ───────────────────────────────────────────────────────────
// Ordered. The `weight` is the share of the overall progress bar each step
// owns; the server fills the bar deterministically as it advances. There is no
// LLM and no headless browser: the capture is a static fetch + a parallel CSS
// scan (for token extraction) + verbatim absolutisation of the head/header/footer.

export type CaptureStepId =
  | 'fetch'
  | 'analyze'
  | 'regions'
  | 'styles'
  | 'reconstruct'
  | 'finalize'

export type CaptureStep = {
  id: CaptureStepId
  /** Short imperative label shown next to the step. */
  label: string
  /** One-line description of what the step is doing. */
  hint: string
  /** Share of the 0-100 progress bar this step owns. Weights sum to 100. */
  weight: number
}

export const CAPTURE_STEPS: readonly CaptureStep[] = [
  {
    id: 'fetch',
    label: 'Connectant amb el lloc web',
    hint: 'Descarreguem l’HTML de la pàgina de referència.',
    weight: 12,
  },
  {
    id: 'analyze',
    label: 'Analitzant la tecnologia',
    hint: 'Detectem el framework i l’allotjament del lloc.',
    weight: 6,
  },
  {
    id: 'regions',
    label: 'Localitzant capçalera i peu',
    hint: 'Identifiquem el header, el footer i el títol de la secció.',
    weight: 8,
  },
  {
    id: 'styles',
    label: 'Recollint estils i tipografies',
    hint: 'Baixem els fulls CSS en paral·lel i n’extraiem els colors.',
    weight: 24,
  },
  {
    id: 'reconstruct',
    label: 'Injectant la capçalera i el peu reals',
    hint: 'Injectem el header i el footer originals tal qual, amb els seus estils, al voltant del blog de Carma.',
    weight: 44,
  },
  {
    id: 'finalize',
    label: 'Aïllant i empaquetant',
    hint: 'Apliquem l’aïllament de CSS i preparem el tema.',
    weight: 6,
  },
] as const

export const CAPTURE_STEP_IDS: readonly CaptureStepId[] = CAPTURE_STEPS.map(s => s.id)

/** Cumulative weight of every step BEFORE the given one (its progress-bar floor). */
export function stepFloor(id: CaptureStepId): number {
  let floor = 0
  for (const s of CAPTURE_STEPS) {
    if (s.id === id) break
    floor += s.weight
  }
  return floor
}

export function stepWeight(id: CaptureStepId): number {
  return CAPTURE_STEPS.find(s => s.id === id)?.weight ?? 0
}

// ─── SSE wire format ────────────────────────────────────────────────────────
// Each event is one JSON object on a single `data:` line, terminated by a blank
// line. The `type` field discriminates the union.

export type CaptureStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'

/** The shape the client applies after a successful capture. */
export type AnalyzeResult = {
  extracted_head: string
  /** Light-DOM HTML before the blog (the "Top": wrappers + header). */
  extracted_header: string
  /** Light-DOM HTML after the blog (the "Bottom": footer + wrapper closers + late scripts). */
  extracted_footer: string
  /** The source <body>'s attributes (class/style/data-*), reapplied so its global
   *  background + typography rules match. Empty when the body had none. */
  extracted_body_attrs: string
  extracted_card: string
  extracted_scripts: string
  external_styles: string[]
  external_scripts: string[]
  font_links: string[]
  detection: { framework: string; hosting: string | null }
  base_url: string
  tokens: DesignTokens
  section_title?: string | null
  detected_locale?: string | null
  /** The real brand / site name (og:site_name → application-name → domain). */
  site_name?: string | null
  /** The brand logo URL (header logo img → favicon/apple-touch-icon → og:image),
   *  shown on the dashboard site card. Null when none could be detected. */
  logo_url?: string | null
  /** Detected blog/news index + native article-card style to replicate. */
  blog_signature?: BlogSignature | null
}

export type CaptureProgressEvent = {
  type: 'progress'
  step: CaptureStepId
  status: CaptureStepStatus
  /** Overall progress 0-100. */
  pct: number
  /** Optional human detail (e.g. "WordPress detectat", "18 fulls CSS"). */
  detail?: string
}

export type CaptureResultEvent = {
  type: 'result'
  data: AnalyzeResult
}

export type CaptureErrorEvent = {
  type: 'error'
  /** The step that failed, when known. */
  step?: CaptureStepId
  error: string
}

/**
 * Out-of-band notice the user should see during the capture (not a fatal error,
 * not progress). Mainly used to surface the complexity warning: "this header is
 * intricate — we're rebuilding it, not pixel-cloning it". The capture keeps
 * running; the user can still Cancel from the modal if they want to stop.
 */
export type CaptureNoticeEvent = {
  type: 'notice'
  severity: 'info' | 'warning'
  /** Stable short code so the UI can localize / style differently. */
  code: 'complex_chrome' | 'mojibake_recovered' | 'partial_styles' | string
  message: string
  /** Optional structured payload (e.g. complexity score). */
  meta?: Record<string, unknown>
}

export type CaptureEvent =
  | CaptureProgressEvent
  | CaptureResultEvent
  | CaptureErrorEvent
  | CaptureNoticeEvent

/** Serialize an event as an SSE frame (server side). */
export function sseFrame(event: CaptureEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/** Parse a single SSE frame's `data:` payload back into an event (client side). */
export function parseSseFrame(frame: string): CaptureEvent | null {
  const line = frame.split('\n').find(l => l.startsWith('data:'))
  if (!line) return null
  try {
    return JSON.parse(line.slice(5).trim()) as CaptureEvent
  } catch {
    return null
  }
}
