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

// LLM for the agent loop + article generation in the worker (T4). Founder
// directive 2026-06-26: the WhatsApp agent and its generation worker run on
// OpenAI, NOT Anthropic. (The shipped src/lib/writing/generate.ts stays on Opus
// 4.8 for the dashboard's Magic SEO Article; T4 either calls a new OpenAI
// generation path or ports generateArticle behind this model.) Placeholder
// default; set WA_AGENT_MODEL to a gpt-5 id when available.
export const WA_AGENT_MODEL = process.env.WA_AGENT_MODEL || 'gpt-4o'

// WhatsApp PROVIDER (founder directive 2026-06-26): Twilio → Kapso. The agent's
// WhatsApp channel runs through Kapso's Meta WhatsApp proxy. The inbound webhook is
// signed with KAPSO_WEBHOOK_SECRET (HMAC-SHA256); outbound send + inbound media
// download authenticate with KAPSO_API_KEY (X-API-Key). KAPSO_PHONE_NUMBER_ID is the
// default sender (the prepaid-SIM number) when a job has no per-message phone_number_id.
export const KAPSO_API_BASE = (process.env.KAPSO_API_BASE || 'https://api.kapso.ai/meta/whatsapp').replace(/\/+$/, '')
export const KAPSO_GRAPH_VERSION = process.env.KAPSO_GRAPH_VERSION || 'v24.0'
