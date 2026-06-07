// Shared contracts for the Theme Grabber Lab (internal superadmin tool).
//
// Type-only module — safe to import from BOTH the client UI and the server
// (route handler + server action). The runtime grabber still lives in
// /api/theme/analyze (reused as-is); this just shapes what the Lab stores and
// previews on top of that capture.

import type { DesignTokens } from '@/lib/scrape/tokens'
import type { BlogSignature } from '@/lib/scrape/blogDetect'
import type { AnalyzeResult } from '@/lib/render/captureProgress'

/** Framework-detector output, kept richer than the render path needs (the SSE
 *  result carries version + confidence at runtime even though AnalyzeResult only
 *  types framework/hosting). */
export type LabDetection = {
  framework: string | null
  version: string | null
  hosting: string | null
  confidence: string | null
}

/** Everything the current grabber produced for one target — the "system output"
 *  the operator compares against their hand-built ground truth. */
export type LabCapture = {
  targetUrl: string
  blogUrl: string | null
  baseUrl: string | null
  detection: LabDetection
  detectedLocale: string | null
  siteName: string | null
  sectionTitle: string | null
  rawHead: string
  rawHeader: string
  rawFooter: string
  bodyAttrs: string
  designTokens: Partial<DesignTokens> | null
  blogSignature: BlogSignature | null
  externalStyles: string[]
  externalScripts: string[]
  fontLinks: string[]
  /** The full untouched capture payload, persisted so no signal is ever lost. */
  raw: AnalyzeResult
}

/** Chrome + tokens used to assemble a render preview with the dummy feed. */
export type LabPreviewTheme = {
  extracted_head?: string | null
  extracted_header?: string | null
  extracted_footer?: string | null
  extracted_body_attrs?: string | null
  design_tokens?: Partial<DesignTokens> | null
  font_links?: string[] | null
  section_title?: string | null
  blog_signature?: BlogSignature | null
  base_url?: string | null
  default_locale?: string | null
}

/** POST body for /api/admin/grabber-lab/preview. `assembled` runs the REAL render
 *  pipeline (buildListingPage) with 10 dummy articles injected into the feed;
 *  `document` returns the operator's hand-assembled HTML verbatim. */
export type LabPreviewRequest =
  | { mode: 'document'; html: string }
  | { mode: 'assembled'; siteName?: string; locale?: string | null; theme: LabPreviewTheme }

/** Full payload persisted to grabber_lab_samples via saveLabSample. */
export type LabSampleInput = {
  id?: string | null
  targetUrl: string
  blogUrl?: string | null
  baseUrl?: string | null

  detectedFramework?: string | null
  detectedFrameworkVersion?: string | null
  detectedHosting?: string | null
  detectionConfidence?: string | null
  detectedLocale?: string | null
  detectedSiteName?: string | null
  detectedSectionTitle?: string | null

  systemRawHead?: string | null
  systemRawHeader?: string | null
  systemRawFooter?: string | null
  systemBodyAttrs?: string | null
  systemDesignTokens?: unknown
  systemBlogSignature?: unknown
  systemExternalStyles?: string[]
  systemExternalScripts?: string[]
  systemFontLinks?: string[]
  captureRaw?: unknown

  truthRawHeader?: string | null
  truthRawFooter?: string | null
  truthBodyAttrs?: string | null
  perfectHtml?: string | null

  diagnosticNotes?: string | null
  failureTags?: string[]
  status?: LabSampleStatus
}

export type LabSampleStatus = 'draft' | 'annotated' | 'verified'

/** Lightweight row for the dashboard list rendered by the page server component. */
export type LabSampleListItem = {
  id: string
  target_url: string
  detected_framework: string | null
  status: string
  updated_at: string
  diagnostic_notes?: string | null
}

/** Full persisted row (snake_case, as stored), returned by getLabSample when the
 *  operator reopens a sample to keep annotating it. */
export type LabSampleRow = {
  id: string
  target_url: string
  blog_url: string | null
  base_url: string | null
  detected_framework: string | null
  detected_framework_version: string | null
  detected_hosting: string | null
  detection_confidence: string | null
  detected_locale: string | null
  detected_site_name: string | null
  detected_section_title: string | null
  system_raw_head: string | null
  system_raw_header: string | null
  system_raw_footer: string | null
  system_body_attrs: string | null
  system_design_tokens: unknown
  system_blog_signature: unknown
  system_external_styles: string[] | null
  system_external_scripts: string[] | null
  system_font_links: string[] | null
  capture_raw: unknown
  truth_raw_header: string | null
  truth_raw_footer: string | null
  truth_body_attrs: string | null
  perfect_html: string | null
  diagnostic_notes: string | null
  failure_tags: string[] | null
  status: string
  updated_at: string
}

/** Curated failure categories the operator can tag a sample with — these become
 *  labels in the dataset the future engine learns from. */
export const FAILURE_TAGS = [
  'header-cut-too-early',
  'header-cut-too-late',
  'footer-missing',
  'footer-cut-wrong',
  'body-attrs-wrong',
  'css-leak-into-blog',
  'blog-breaks-chrome-layout',
  'tokens-wrong',
  'fonts-missing',
  'blog-card-mismatch',
  'scripts-blanked-page',
  'menu-broken',
  'perfect-clone',
] as const

export type FailureTag = (typeof FAILURE_TAGS)[number]
