// WhatsApp Agent — canonical data-layer types.
//
// Single source of truth for the migration-027 tables. The webhook (T2), the
// worker (T4), the /review page (T5) and /admin/agent (T8) all import from here
// so nobody re-invents the row/status shapes. Column names are snake_case to
// match what supabase-js returns.

// ─── Status unions (mirror the CHECK-free TEXT columns in 027) ────────────────

export const WA_IDENTITY_STATUS = ['pending', 'active', 'blocked'] as const
export type WaIdentityStatus = (typeof WA_IDENTITY_STATUS)[number]

export const WA_THREAD_STATUS = ['active', 'closed'] as const
export type WaThreadStatus = (typeof WA_THREAD_STATUS)[number]

export const WA_MSG_DIRECTION = ['in', 'out'] as const
export type WaMsgDirection = (typeof WA_MSG_DIRECTION)[number]

export const WA_MSG_TYPE = ['text', 'audio', 'image'] as const
export type WaMsgType = (typeof WA_MSG_TYPE)[number]

export const REVIEW_TOKEN_STATUS = ['active', 'consumed', 'revoked', 'expired'] as const
export type ReviewTokenStatus = (typeof REVIEW_TOKEN_STATUS)[number]

export const REVIEW_TOKEN_ACTION = ['publish'] as const
export type ReviewTokenAction = (typeof REVIEW_TOKEN_ACTION)[number]

export const JOB_KIND = ['agent_turn', 'transcribe', 'generate', 'send'] as const
export type JobKind = (typeof JOB_KIND)[number]

export const JOB_STATUS = ['queued', 'running', 'done', 'error'] as const
export type JobStatus = (typeof JOB_STATUS)[number]

// ─── Agent loop state (wa_threads.agent_state JSONB) ──────────────────────────
// The worker (T4) owns the real transitions. With Turn-Budget-1 the agent drafts
// on any usable brief and only asks ONE clarification when the input is empty or
// incomprehensible — so this stays small.
export type WaAgentPhase =
  | 'await_brief'       // waiting for the first usable note
  | 'resolving_site'    // owner has >1 candidate site → asked "which client?"
  | 'drafting'          // generateArticle in flight
  | 'awaiting_review'   // draft sent (with Approve/Edit buttons), review link live
  | 'awaiting_edit'     // owner tapped "Editar" → waiting for the change instructions
  | 'done'              // published or closed

// ─── Interactive button ids (postback payloads) ───────────────────────────────
// The owner taps these in WhatsApp; the inbound webhook routes on the id. Kept here
// so the send side (worker) and the receive side (webhook) never drift.
export const WA_BUTTON = {
  approve: 'wa_approve',
  edit: 'wa_edit',
  cover: 'wa_cover',     // foundations: offer a cover image (nano-banana)
  coverYes: 'wa_cover_yes', // free-flow: "Sí, genera la portada"
  coverNo: 'wa_cover_no',   // free-flow: "No cal portada"
  translate: 'wa_translate', // foundations: offer translations
} as const
export type WaButtonId = (typeof WA_BUTTON)[keyof typeof WA_BUTTON]

export interface WaAgentState {
  phase: WaAgentPhase
  // Set true once the single allowed clarification has been spent on this thread.
  clarification_used?: boolean
  // Candidate site ids when the owner has more than one (G2 resolver).
  candidate_site_ids?: string[]
  // Short running summary of the brief, so re-entry doesn't re-read every message.
  brief_summary?: string
  // The detected language of the inbound note (drives reply + draft locale).
  detected_locale?: string
  // Held while we ask "which client?" (>1 candidate site), so we can draft from
  // the original brief once the owner picks a site.
  pending_brief?: string
  // Transparency: the inbound message id we've already sent the "rebut" receipt
  // ack / the "preparant…" progress notice for, so a transient retry of the same
  // job never double-sends those status updates.
  ack_for?: string
  writing_for?: string
  // Free-flow cover step: the post id we've already offered a cover image for, so
  // the "Vols una portada?" Yes/No prompt is sent at most once per draft.
  cover_offered_for?: string
}

// ─── Row types ────────────────────────────────────────────────────────────────

export interface WaIdentityRow {
  id: string
  phone_e164: string
  user_id: string
  status: WaIdentityStatus
  verify_code: string | null
  verify_expires_at: string | null
  verified_at: string | null
  opt_in_at: string | null
  created_at: string
  updated_at: string
}

export interface WaIdentitySiteRow {
  id: string
  identity_id: string
  site_id: string
  created_at: string
}

export interface WaThreadRow {
  id: string
  identity_id: string
  site_id: string | null
  status: WaThreadStatus
  agent_state: WaAgentState
  current_post_id: string | null
  window_expires_at: string | null
  cost_cents: number
  turn_count: number
  last_inbound_at: string | null
  created_at: string
  updated_at: string
}

export interface WaMessageRow {
  id: string
  thread_id: string
  direction: WaMsgDirection
  wa_message_id: string | null
  msg_type: WaMsgType
  text: string | null
  media_path: string | null
  transcript: string | null
  raw: unknown
  created_at: string
}

export interface ReviewTokenRow {
  id: string
  token_hash: string
  post_id: string
  site_id: string
  thread_id: string | null
  action: ReviewTokenAction
  status: ReviewTokenStatus
  expires_at: string
  consumed_at: string | null
  consumed_ip: string | null
  created_at: string
}

export interface GenerationJobRow {
  id: string
  thread_id: string
  message_id: string | null
  kind: JobKind
  status: JobStatus
  attempts: number
  lease_until: string | null
  payload: Record<string, unknown>
  result: unknown
  error: string | null
  created_at: string
  updated_at: string
}

export interface WaArticleOutcomeRow {
  id: string
  post_id: string
  site_id: string
  thread_id: string | null
  transcript: string | null
  published_url: string | null
  published_at: string | null
  check_due_at: string | null
  outcome: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ─── Table names (avoid typo'd string literals at call sites) ──────────────────
export const WA_TABLES = {
  identities: 'wa_identities',
  identitySites: 'wa_identity_sites',
  threads: 'wa_threads',
  messages: 'wa_messages',
  reviewTokens: 'review_tokens',
  jobs: 'generation_jobs',
  outcomes: 'wa_article_outcomes',
} as const
