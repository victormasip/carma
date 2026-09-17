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

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').trim()
  if (!raw) return fallback
  return /^(1|true|yes|on)$/i.test(raw)
}

// ─── Living Brain (v2) staged rollout ─────────────────────────────────────────
// Master flag for the "Living Brain" upgrade (docs/plans/2026-07-07-…). When ON,
// the router receives an OWNER CONTEXT block (two-tier Cortex), the writer receives
// the site's brand profile, and out-of-punts turns render the context-aware upsell.
// When OFF, every WhatsApp turn behaves EXACTLY as today (additive, degrades cleanly).
// Default: ON in dev, staged (opt-in) in prod — "on in dev, staged in prod" (§8).
export const WA_BRAIN_V2 = boolEnv('WA_BRAIN_V2', process.env.NODE_ENV !== 'production')

// Owner memory (§2.3): standing preferences kept as DATA, FIFO-capped. Eviction is
// announced, never silent (E-11/C-11).
export const WA_MEMORY_MAX_FACTS = intEnv('WA_MEMORY_MAX_FACTS', 12)

// A held action (pending_action, §2.6) survives across turns for this long, then
// expires so a stale "which blog?" never haunts a new conversation.
export const WA_HELD_ACTION_TTL_HOURS = intEnv('WA_HELD_ACTION_TTL_HOURS', 48)

// Don't repeat the same proactive nudge key within this many days (§2.4.7 / E-21).
export const WA_NUDGE_COOLDOWN_DAYS = intEnv('WA_NUDGE_COOLDOWN_DAYS', 14)

// Never two nudges in quick succession ("not two turns running", §2.4.7): stay quiet
// if the last nudge went out within this many hours, whatever its key.
export const WA_NUDGE_MIN_GAP_HOURS = intEnv('WA_NUDGE_MIN_GAP_HOURS', 20)

// Below this many published posts a brand profile is a `seed` (inferred from
// origin_url + onboarding only, treated as a light hint) rather than authoritative
// brand voice distilled from real content (thin-data guard, CEO C-3d / bet B4).
export const WA_PROFILE_MIN_POSTS = intEnv('WA_PROFILE_MIN_POSTS', 4)

// A photo the owner sent sits on the thread until an article exists to put it on.
// Kapso media references do not live forever, so past this we stop promising it.
export const WA_PENDING_IMAGE_TTL_HOURS = intEnv('WA_PENDING_IMAGE_TTL_HOURS', 24)

// AUTO-COVER, OFF BY DEFAULT (founder, 2026-09-17).
//
// P2.5 generated an image for EVERY draft, silently. Two things were wrong with
// that: it spends on an illustration nobody asked for, and it pre-empts the
// owner's own photo — the thing they actually wanted on the article. The flow is
// now: their photo if they sent one, otherwise a one-tap offer the moment the
// article goes live, where a missing image is most obvious.
// Set WA_COVER_AUTO=1 to restore the old always-generate behaviour.
export const WA_COVER_AUTO = boolEnv('WA_COVER_AUTO', false)

// Theme edits via chat, per site per day (Family H, later cycle — dormant at P1).
export const WA_THEME_EDITS_PER_DAY = intEnv('WA_THEME_EDITS_PER_DAY', 10)

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
