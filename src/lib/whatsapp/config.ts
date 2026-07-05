// WhatsApp Agent — tunable ceilings and lifetimes (server-only).
//
// All env-overridable, following the project convention (cf. WRITING_GEN_MODEL).
// These are read by the webhook (T2), the worker (T4) and the /review page (T5).

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// Turn-Budget-1 (founder directive, 2026-06-26): drop a voice note → get a review
// link. The agent drafts immediately on any usable topic and asks AT MOST this many
// clarifications per thread — only when the note is empty or incomprehensible.
// We do NOT want a chatty bot.
export const WA_TURN_BUDGET = intEnv('WA_TURN_BUDGET', 1)

// Hard anti-loop cap on total agent turns in one thread (separate from the
// clarification budget above): a runaway tool-loop halts here.
export const WA_THREAD_MAX_TURNS = intEnv('WA_THREAD_MAX_TURNS', 40)

// Cost guardrails, checked in the DB BEFORE any OpenAI/transcription call so a
// stranger (or a loop) can never burn the budget. cost_cents accumulates the agent +
// transcription + WhatsApp per-conversation.
export const WA_THREAD_COST_CENTS_CEILING = intEnv('WA_THREAD_COST_CENTS_CEILING', 100)
export const WA_DAILY_GEN_CAP = intEnv('WA_DAILY_GEN_CAP', 20) // generations / identity / day

// Review link lifetime. Long enough that a busy owner can approve later, short
// enough that a leaked link expires. Default 7 days.
export const WA_REVIEW_TOKEN_TTL_HOURS = intEnv('WA_REVIEW_TOKEN_TTL_HOURS', 168)

// Phone-binding OTP lifetime.
export const WA_VERIFY_CODE_TTL_MIN = intEnv('WA_VERIFY_CODE_TTL_MIN', 15)

// WhatsApp's customer-service window. Outside it, only template messages send.
export const WA_WINDOW_HOURS = intEnv('WA_WINDOW_HOURS', 24)

// How long a worker holds a generation_jobs row before the 1-min Scheduled
// re-driver may reclaim it. Must exceed the worst-case generate (≤160s) plus
// transcription, well under the 15-min Background Function budget.
export const WA_JOB_LEASE_MIN = intEnv('WA_JOB_LEASE_MIN', 5)

// How many times a job may be attempted before it is marked 'error' (no more
// retries). Transcription/OpenAI timeouts retry until this; then we fail safely.
export const WA_JOB_MAX_ATTEMPTS = intEnv('WA_JOB_MAX_ATTEMPTS', 3)

// PII / data retention (GDPR + table bloat). The scheduled purge (cron) deletes
// inbound messages (which carry the transcript + raw provider payload) older than
// this, and finished jobs older than the job window. 0 disables a purge.
export const WA_MESSAGE_RETENTION_DAYS = intEnv('WA_MESSAGE_RETENTION_DAYS', 30)
export const WA_JOB_RETENTION_DAYS = intEnv('WA_JOB_RETENTION_DAYS', 7)

// LLM for the agent loop + article generation in the worker (T4). Founder
// directive 2026-06-26: the WhatsApp agent and its generation worker run on
// OpenAI, NOT Anthropic. (The shipped src/lib/writing/generate.ts stays on Opus
// 4.8 for the dashboard's Magic SEO Article; T4 either calls a new OpenAI
// generation path or ports generateArticle behind this model.) Placeholder
// default; set WA_AGENT_MODEL to a gpt-5 id when available.
export const WA_AGENT_MODEL = process.env.WA_AGENT_MODEL || 'gpt-4o'

// The intent router (brain.ts) — the fast, cheap conversational half that decides
// write/edit/publish/chat and speaks Carma's immediate replies. Runs on every
// inbound turn, so it defaults to the mini tier; the article writer above stays on
// the full model.
export const WA_ROUTER_MODEL = process.env.WA_ROUTER_MODEL || 'gpt-4o-mini'

// Dev/testing escape hatch (founder directive 2026-06-30): when set, the agent
// returns a deterministic, hardcoded draft INSTEAD of calling OpenAI, so the whole
// WhatsApp flow — ack → buttons → approve/edit → publish — can be exercised end to
// end without spending API credits. Never enable in production. Accepts 1/true/yes.
export const WA_MOCK_AGENT = /^(1|true|yes)$/i.test((process.env.WA_MOCK_AGENT || '').trim())

// WhatsApp PROVIDER (founder directive 2026-06-26): Twilio → Kapso. The agent's
// WhatsApp channel runs through Kapso's Meta WhatsApp proxy. The inbound webhook is
// signed with KAPSO_WEBHOOK_SECRET (HMAC-SHA256); outbound send + inbound media
// download authenticate with KAPSO_API_KEY (X-API-Key). KAPSO_PHONE_NUMBER_ID is the
// default sender (the prepaid-SIM number) when a job has no per-message phone_number_id.
export const KAPSO_API_BASE = (process.env.KAPSO_API_BASE || 'https://api.kapso.ai/meta/whatsapp').replace(/\/+$/, '')
export const KAPSO_GRAPH_VERSION = process.env.KAPSO_GRAPH_VERSION || 'v24.0'

// The public-facing agent number (the prepaid-SIM E.164) shown to owners in
// Settings so they know which WhatsApp to text. Display-only; the actual routing
// id is KAPSO_PHONE_NUMBER_ID. Falls back to empty → the Settings card shows a
// "not configured yet" state instead of a broken link.
export const WA_AGENT_NUMBER = (process.env.WA_AGENT_NUMBER || '').trim()

/** Build a wa.me deep link to the agent, optionally pre-filling a message. */
export function agentWaMeLink(prefill?: string): string | null {
  const digits = WA_AGENT_NUMBER.replace(/[^\d]/g, '')
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base
}
