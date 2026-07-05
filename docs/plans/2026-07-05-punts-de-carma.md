# Punts de Carma — unified gamified credit economy

**Date:** 2026-07-05 · **Status:** approved (autonomous council: Architecture, DB Security, Product UX, Monetization) · **Owner:** founder directive

One ledger governs every resource-intensive operation across the SaaS — AI drafting,
image generation, voice transcription, web cloning and agent conversations — so unit
economics stay profitable at every tier while the points themselves become a
gamification + upgrade surface ("Punts de Carma").

---

## 1. The anchor

**1 article "all-in" = 100 punts** — a full AI draft (80) plus one revision (20).
Everything else is priced relative to that anchor, grounded in real API cost:

| Action | Key | Punts | Real cost (approx) | Rationale |
|---|---|---|---|---|
| Article draft (agent/console `runAgent`) | `article_draft` | **80** | ~$0.05–0.08 (gpt-4o ≈4k in / 2.5k out + router turn) | The value anchor. |
| Article revision (edit turn) | `article_revision` | **20** | ~$0.04 | Cheap enough to encourage polish. |
| Clarification turn (net) | `clarify` | **5** | same call, short output | Charged as a draft (80) up front, 75 refunded when the agent asks instead of drafting — atomic, race-safe, never negative. |
| WhatsApp chat turn (router-only) | `agent_chat` | **1** | ~$0.0005 (gpt-4o-mini) + infra | Conversations stay governed but feel free. |
| Voice note (Whisper) | `voice_note` | **2** | $0.006/min, notes 1–3 min | |
| Cover image (nano-banana / DALL·E 3) | `cover_image` | **25** | ~$0.04–0.08/image | Charged only when the real provider is configured — the current mocked flow is free. One charge per post (dedupe `cover:<postId>`). |
| Website clone / grabber capture | `site_clone` | **40** | 30–90 s compute + bandwidth, no LLM | **First capture per user is FREE** (it IS the onboarding funnel). Re-captures charge at most once per day (dedupe `clone:<user>:<date>`), so retrying a failing capture never double-charges. |
| Publish (button or "publica'l") | — | **0** | transaction only | Publishing something you already paid to draft must never be blocked. |

## 2. Tier allocations (monthly refresh)

| Tier (`profiles.plan`) | Punts / month | ≈ articles |
|---|---|---|
| `free` | **100** | 1 |
| `premium` | **400** | 4 |
| `gold` | **800** | 8 |
| `agency` | **2500** | ~25 (high-volume / custom) |
| superadmin (`profiles.role`) | **∞** | bypasses all deduct logic (helper short-circuit + RPC guard) |

**Refresh rule:** on the first wallet touch in a new calendar month (UTC),
`balance = GREATEST(balance, allocation)`. Consequences, in product words:

- The monthly allowance renews on the 1st; unspent monthly punts don't stockpile.
- Earned (reward) punts are consumed first and survive months while unspent —
  no cron needed, refresh happens lazily inside the same locked transaction as
  the spend/read, so it can never race.

## 3. Gamification — one-time rewards ("Reptes")

Claimed on the new **/dashboard/karma** page; each is verified server-side at claim
time and idempotent forever via a ledger dedupe key (`reward:<key>`).

| Repte | Key | Punts | Verified condition |
|---|---|---|---|
| Benvinguda a Carma | `benvinguda` | +25 | visiting the Karma page (activation hook) |
| Primer article publicat | `primer_article` | +50 | any published post on the user's sites |
| Connecta WhatsApp | `whatsapp_connectat` | +75 | an `active` `wa_identities` row |
| Fes teu l'Estudi | `estudi_fet` | +40 | a site theme edited after capture (`updated_at > created_at + 60s`) |
| Primer mòdul intel·ligent | `primer_modul` | +30 | any module `enabled` in `site_themes.modules` |

Total earnable = **+220** — deliberately less than one month of the free→premium
delta (300), so rewards drive activation without cannibalizing upgrades.

## 4. Architecture (rock-solid ledger)

- **Migration 028** adds `profiles.plan`, `karma_wallets` (one row per user,
  `balance ≥ 0` CHECK), `karma_ledger` (every movement, `balance_after` audit
  column, partial-unique `(user_id, dedupe_key)`).
- **Atomicity:** all mutations go through SECURITY DEFINER RPCs
  (`karma_spend`, `karma_earn`, `karma_refund`, `karma_balance`) that `SELECT …
  FOR UPDATE` the wallet row — parallel WhatsApp webhook jobs, console turns and
  claims serialize per user; double-spend is impossible. Idempotency via dedupe
  keys (`job:<id>:draft` etc.) makes at-least-once job retries charge exactly once.
- **Security:** spend/earn/refund EXECUTE is revoked from `anon`/`authenticated`
  and granted only to `service_role`; `karma_balance` is callable by an
  authenticated user but coerces to `auth.uid()`. RLS: users read their own
  wallet/ledger; only the service role writes. Functions pin `search_path`.
- **Fail-open:** if the migration hasn't run (42883/42P01) or the RPC errors, the
  helpers allow the operation and log — a billing-infra hiccup must never take
  the product down (same 42703-safe convention as the rest of the repo).
- **Refunds:** a job that permanently fails refunds its spends (looked up by
  `ref = job.id`, dedupe `refund:<ledgerId>`), so users never pay for an apology.

## 5. Transversal enforcement map

| Surface | Check | Denial UX |
|---|---|---|
| `worker.ts` (WA agent) | pre-flight zero-balance gate (skipped when a draft is pending so *publish by text* always works) → `voice_note` before Whisper → per-intent spend before `runAgent` | warm Catalan WhatsApp message + link to earn/upgrade (zero LLM spend) |
| webhook `handleButton` coverYes | `cover_image` before real provider call | warm WhatsApp message; Publicar/Editar buttons always free |
| `agent-console.ts` | spend before `runAgent` (draft 80 / revision 20, clarify refund) | typed `no_karma` result → golden upsell bubble in AgentChat with CTA to /dashboard/karma |
| `/api/theme/analyze` (clone) | free first capture; then daily-deduped 40 | HTTP 402 JSON → existing capture-modal error state shows the branded message |

## 6. UI

- **Sidebar widget:** golden-glow "Punts de Carma" pill (balance / ∞) above the
  user footer, linking to /dashboard/karma; nav item added too.
- **/dashboard/karma:** balance hero + plan chip, month progress, price menu,
  claimable Reptes (glow CTA + toast "+50 ✨"), recent movements ledger.
- **Feedback:** console drafts toast the spend + remaining balance; claims toast
  the earn. Nothing ever fails silently.
