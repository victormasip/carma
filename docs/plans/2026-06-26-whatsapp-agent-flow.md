# WhatsApp Agent — Voice-to-Published-Article Pipeline

**Branch:** main · **Author:** Víctor Masip · **Date:** 2026-06-26 · **Status:** PLAN — under /autoplan review (CEO → Design → Eng → DX). No code yet.

> Supersedes the deferral in `2026-06-10-whatsapp-concierge-mvp.md`. Per founder (2026-06-26),
> the concierge validation gate is **CLEARED** — paid pilots happened ("a stranger paid twice").
> This cycle designs the real pipeline for an immediate build. The CEO phase no longer has to
> answer "should we build"; it answers "is this the right shape, scope, and wedge."

---

## 1. The flow (as directed)

A client sends a WhatsApp message or voice note to Carma describing a post they want. The agent:
1. Transcribes (voice) / reads (text) the request.
2. Proposes a draft, asks clarifying questions, offers/【generates】 images (Google Gemini 2.5
   Flash Image, "nano banana"; Higgsfield `generate_image` MCP also available).
3. Sends a **preview link** into Carma. The link opens the existing editor in a review state:
   edit, suggest changes, regenerate.
4. The client **approves from the link**.
5. Carma **publishes automatically** to the blog (Carma-hosted render and/or the client's WordPress
   via the headless API).

---

## 2. What already exists (code-grounded, audited 2026-06-26)

> The single most important input to this review: the office-hours doc assumed this was weeks of
> n8n/Whisper/pipeline work. It is not. The Carma half is largely shipped. The net-new surface is
> the **WhatsApp channel + transcription + a conversational agent + a tokenized approval link**.

| Stage | Status | Code |
|---|---|---|
| **Draft generation** | **Shipped** | `src/lib/writing/generate.ts` — `generateArticle(brief, existingCategories)`, Opus 4.8, adaptive thinking, strict `json_schema`, defense-in-depth `sanitizeHtml`. Returns `{title, slug, excerpt, contentHtml, seoTitle, seoDescription, focusKeyword, categories, tags, niche, strategy}` → maps 1:1 to `PostData`. Today it reads a homepage `SiteBrief`; for WhatsApp the **transcript/brief becomes the primary input**. |
| **Persist + publish (first-party)** | **Shipped** | `src/lib/actions/posts.ts` — `createPost(siteId, PostData)` / `updatePost(postId, siteId, PostData)` behind `assertSiteAccess`. `is_published` flips the live `/render` immediately (`revalidateRender`). |
| **Publish (headless / WordPress)** | **Shipped** | `POST /api/v1/posts` — `x-api-key` per-site auth, CORS `*`, bulk insert, `is_published`. |
| **Preview / edit / approve UI** | **Shipped** | Editor at `/dashboard/sites/[id]/posts/[postId]/edit` (zero-click autosave). Approval = reuse this in a review state + flip `is_published`. |
| **Image upload + serving** | **Shipped** | `POST /api/upload?siteId=` → `post-media` bucket (auth: superadmin or `site_users` member), returns clean URL; `/api/img` optimizer; `/api/asset`. |
| **Posts schema** | **Shipped** | `posts`: `content` JSONB, `excerpt`, `featured_image`, `categories[]`, `tags[]`, `seo_title`, `seo_description`, `author_name`, `is_published`, `i18n`, `default_locale`, `created_at`. |
| **Identity / sites** | **Shipped** | `sites` (with `api_key`, subdomain), `site_users`, `profiles.role`; `GET /api/account/sites` (auth) added in the WP "Connect to Carma" cycle. |

### The genuinely net-new surface
1. **WhatsApp channel** — inbound webhook + outbound send. Meta WhatsApp Cloud API vs an aggregator
   (Twilio / 360dialog / MessageBird). Template-message + 24h-window rules; per-conversation cost.
2. **Transcription** — voice note → text (Whisper API or Gemini). Media download from the WA media
   endpoint (short-lived, auth'd URLs).
3. **Conversational agent** — the back-and-forth state machine: intent → clarify → draft → image →
   iterate → hand off a link. The one genuinely new orchestration layer.
4. **Tokenized approval link** — opaque, single-purpose, no-login token → opens the editor in a
   review state → "Approve & publish" calls the existing publish path.
5. **WhatsApp identity binding** — phone number → Carma account/site (one client can own several
   sites; an agency owns many — see north-star in the office-hours doc).
6. **Image generation** — wire nano-banana / Higgsfield into the existing upload→`post-media` path.

---

## 3. Proposed architecture (rough — to be shaped by review)

```
  WhatsApp (Meta Cloud API or aggregator)
        │  inbound webhook (text | voice | image)
        ▼
  POST /api/whatsapp/webhook  (verify signature; 200 fast; enqueue)
        │
        ▼
  Agent runtime (Next route / server action; Anthropic SDK tool-use)
    • resolve sender → wa_identity → site_id  (binding table)
    • if voice → transcribe (Whisper/Gemini) → text
    • thread state in `wa_threads` / `wa_messages`
    • tools: propose_draft (→ generateArticle), request_image
             (→ nano-banana → /api/upload), ask_clarification,
             create_review_link, publish
        │
        ├─ draft → createPost(site_id, {..., is_published:false}) → draft row
        ├─ review link → signed token → /review/<token>
        │                 (opens editor in review state, no login)
        └─ on approve → is_published = true (first-party) and/or
                        POST /api/v1/posts (client WordPress)
        │
        ▼
  Outbound WA message: "Draft ready → <preview link>"
```

### Open architecture questions (for Eng/Design phases)
- **Channel:** official Meta Cloud API (lower per-msg cost, more compliance/approval work, you own
  the number) vs aggregator (faster start, higher per-msg, less Meta-paperwork). One-way-ish door.
- **Agent host:** in-app (Next route + DB-backed thread state + Anthropic tool-use) vs n8n. DRY
  argument: the LLM, generation, publish, and upload are all already in the Next app. n8n adds an
  external dependency for orchestration we can do in-process. **Lean: in-app.**
- **Approval link auth:** signed stateless token (HMAC, exp) vs a `review_tokens` row (revocable,
  single-use, audit). Security-sensitive; affects whether an approved link can be replayed.
- **Publish target:** Carma render, client WordPress, or both? Drives whether approve calls
  `updatePost` (first-party) or `/api/v1/posts` (headless) or both.
- **Transcription provider:** Whisper vs Gemini — cost, latency, Catalan/Spanish quality.
- **Async model:** WA webhooks must 200 within seconds. Need an enqueue/worker step (e.g. a
  durable job, Supabase queue, or a fire-and-forget server action) so generation (≤160s) never
  blocks the webhook ack.

---

## 4. Open premises to challenge (for the reviewers)

- **P1.** "Validation is cleared, so build the full autonomous flow." → True per founder, but the
  office-hours doc's sharper point stands: the **moat is the research/strategy layer + human
  accountability**, not autonomous generation. Does this plan over-index on the commodity
  (generate+publish) and under-build the wedge (competitor-gap intelligence, the human approval
  as a feature not a formality)?
- **P2.** "Auto-publish on approve." → A regulated/branded client auto-publishing AI-expanded voice
  notes is exactly the trust risk the office-hours doc flagged. Is "approve" enough, or does the
  human-in-the-loop need to be a stronger, visible feature?
- **P3.** "Build the WhatsApp channel ourselves." → Channel choice (Meta vs aggregator) is a
  semi-irreversible cost/compliance commitment. Is there a cheaper validation of the *automated*
  loop (e.g. a Telegram/web-form input) before paying the WhatsApp Business tax?
- **P4.** "Reuse the editor for approval." → The editor is a full authenticated dashboard surface.
  Is a no-login tokenized review state a safe, small reuse, or does it leak authed surface area?
- **P5.** "The agent is net-new." → Generation/publish/upload are shipped; only the channel,
  transcription, thread-state, and link are new. Is the scope estimate honest?

---

## 5. Metrics this should capture (from the concierge protocol — keep them)

The office-hours doc's manual metrics become the product's telemetry: clarification round-trips per
article, edit distance (did they publish your draft or rewrite it), pull-vs-nag, and — the crown
jewel — the **60-day outcome** (did it rank / drive traffic). Model every artifact as a first-class
record so automation later is "swap one stage," not "rebuild": `transcript → draft → approved →
published_url → OUTCOME`.

---

## 6. Preserved invariants (non-negotiable)
- `generateArticle` output stays sanitized (no raw `<script>`, constrained tag set) before it
  reaches `content`.
- Publish auth unchanged: first-party behind `assertSiteAccess`; headless behind `x-api-key`.
- `npm run test:render` stays green; standalone `/render` output unchanged.
- No secrets (WA tokens, provider keys) in client code or the review link.

---

## Phase 1 — CEO Review (Strategy & Scope)

**Mode:** SELECTIVE EXPANSION. **Dual voices:** Codex unavailable → `[subagent-only]`. Claude CEO subagent ran (independent, foreground). Every critical/high FLAGGED single-voice.

**The frame:** the founder cleared a gate for a *manual content service*, and this plan spends the win building the *commodity automation* of that service while deferring the exact thing the office-hours doc called the moat. Same altitude-inversion shape as the headless-decoupling cycle, higher stakes (the deferred item is the defensibility).

### 0A — Premise challenge

| Premise | Verdict | Evidence |
|---|---|---|
| **P1** "Validation cleared → build full autonomous flow." | **Half-true** | The cleared gate validated demand for the *manual* loop (human transcribes/writes/publishes), not the *automated agent*, *auto-publish*, or the *research layer*. Plan treats service-demand as architecture-validation. Different claims. |
| **P2** "Auto-publish on approve." | **Half-true (right risk)** | Per-article human approval is not "mass auto-generated," so Google penalty risk is lower than the office-hours doc feared. But a no-login one-tap approve reduces the human-in-loop to a formality — the opposite of the "human accountability is the moat" thesis. |
| **P3** "Build the WhatsApp channel ourselves." | **False as stated** | Pilots ran on a human-watched number. That validates WA as an input surface; it does not require Meta Cloud API + BSP + template approval + per-msg cost to *test the automated loop*. Testable on Twilio sandbox / web form first. |
| **P4** "Reuse the editor for approval." | **Half-true (new surface)** | Exposing the authed editor through an opaque no-login token is a net-new public, unauthenticated, write-capable surface that flips `is_published`. New security model, not a config flag. |
| **P5** "Agent net-new; ~70% exists." | **Half-true / misleading by surface-count** | True the generate+publish spine is ~90% shipped, but that 70% is the de-risked commodity. The net-new 30% (orchestration, async worker, WA compliance, transcription, identity, tokenized auth) is the entire risk surface. Percentage is technically defensible, strategically misleading. |

**Smuggled premises:** **S1** research/competitor-gap moat deferred to a telemetry column = the moat being shelved (FALSE to defer). **S2** agency and direct-SMB treated as one customer (the doc said "do not pretend it's both"). **S3** unconfirmed whether paid pilots logged the clarification-round-trip / edit-distance metrics that were meant to BE the agent's spec.

### 0B — Existing-code leverage map

| Sub-problem | Shipped | Net-new | Honest read |
|---|---|---|---|
| Draft generation | `generateArticle` Opus 4.8 strict schema | input adapter: eats homepage `SiteBrief`, not a transcript | ~90%, small real gap |
| Persist + publish (first-party) | `createPost`/`updatePost`, `is_published` | none | 100% |
| Publish (headless WP) | `POST /api/v1/posts` x-api-key | none | 100% |
| Preview/approve UI | editor | no-login tokenized review = new auth surface | surface reused, security model net-new |
| Image | `POST /api/upload` | image *generation* wiring = a 4th product | ~50%, maybe not cycle one |
| **Conversational agent** | **nothing** | **the whole state machine** | **0% — this IS the product, least-specified** |
| **Research / competitor-gap** | **nothing** | **the whole moat** | **0% — not in the build** |
| WA channel / transcription / identity / async | nothing | all of it + Meta compliance | 0%, highest external risk |

**Verdict on "70%":** the generate-and-publish spine is genuinely ~90% shipped and a real earned advantage. But the framing lets the reader feel the rest is thin integration. The rest is the agent (0%, hardest), the moat (0%, deferred), and the WA tax (0%, semi-irreversible).

### 0C — Dream-state delta
- **CURRENT:** a paid manual concierge; Carma's spine shipped and clean.
- **THIS PLAN:** automate the input→draft→approve→publish *pipe* over WhatsApp Business. The commodity.
- **12-MONTH IDEAL (office-hours §9):** the *strategy/intelligence* layer is the product — continuous competitor + gap analysis, a human accountable, an outcome loop. WhatsApp is the control panel, not the product.
- **DELTA:** the plan ships the destination's transport and skips its engine. Recoverable if cycle one is scoped to kill the one real unknown, not to build the whole pipe.

### 0C-bis — Implementation alternatives (never weighed)

| Approach | Effort (human / CC) | Risk | Customer value | Kills which unknown |
|---|---|---|---|---|
| **A. Full agent as written** (Meta channel + transcription + agent + no-login auto-publish + image-gen) | weeks / days | **High** (BSP, async infra, new public write-auth, auto-publish SEO risk) | slicker manual pilot | everything at once → nothing cleanly |
| **B. "Concierge++": agent-assisted human loop** — Twilio sandbox / personal number; agent drafts via shipped spine + editor; human shares the existing authed review link; no BSP, no auto-publish | days / hours | **Low** (reuses spine, no new auth, no Meta tax) | tests the real unknown: does an automated clarify+draft loop match the human's quality/round-trips | "can the agent replace the human's drafting?" |
| **C. Research-layer first** — competitor-gap brief generator (the moat), sold as the upsell; input manual | medium / hours-day | Medium | tests willingness to pay MORE for intelligence than writing | "is the moat real?" |
| **D. Web-form / Telegram input v1** (plan's own P3) | days / hours | Low | full automated loop minus WA tax | "does the automated loop work end to end?" |

Plan weighed none of B/C/D; it jumped to A.

### 0.5 — CLAUDE SUBAGENT (CEO) `[subagent-only]`
- **C1 (critical):** three products + a half (WA integration / conversational agent / no-login publish-auth) + image-gen. Cycle one shipping all ships none well.
- **C2 (critical):** validated = manual service; unvalidated = automated agent. Cheapest agent test needs neither Meta API nor tokenized auto-publish. Building channel + auto-publish before draft quality is proven spends the irreversible budget first.
- **C3 (critical):** the moat is not in the build. Foregrounding generation+publish, deferring research to a telemetry column = the altitude inversion.
- **H1 (high):** auto-publish on a no-login one-tap link makes "human accountability" a formality. Make approval a feature (what-changed-from-your-note, 60-day outcome), not a speed bump.
- **H2 (high):** customer identity undecided (S2); binding straddles agency + direct-SMB → different products.
- **H3 (high):** "voice→article" is Jasper/Copy.ai/AudioPen territory where WhatsApp is a feature not a moat. Carma's real wedges: the shipped clone-and-publish-into-their-site integration, and the competitor-gap research + outcome loop. Plan centers neither.
- **M1 (medium):** confirm pilots logged the round-trip/edit-distance metrics (S3) or the §2.3 state machine is guesswork.
- **M2 (medium):** image-gen is a whole new dependency/cost/QC surface added as an aside; later cycle.

### CEO DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Claude-subagent     Codex      Consensus
  ──────────────────────────────────── ──────────────────  ─────────  ─────────────────────────
  1. Premises valid?                   NO (P1/P3/S1/S2/S3)  [unavail]  FLAGGED (1-voice critical)
  2. Right problem to solve?           NO — moat deferred   [unavail]  FLAGGED (1-voice critical)
  3. Scope calibration correct?        NO — 3+ products     [unavail]  FLAGGED (1-voice critical)
  4. Alternatives explored?            NO (B/C/D missing)   [unavail]  FLAGGED (1-voice high)
  5. Competitive risks covered?        NO (H3)              [unavail]  FLAGGED (1-voice high)
  6. 6-month trajectory sound?         NO (S2 straddle)     [unavail]  FLAGGED (1-voice high)
```

### NOT in scope (CEO-recommended defer, pending gate)
- **WhatsApp Business channel (Meta Cloud API / BSP / templates / per-msg)** → defer until the automated loop is proven on a zero-tax channel. (C2, P3)
- **Tokenized no-login approval + auto-publish surface** → defer; cycle one approves through the existing authed editor link. (P4, H1)
- **Image generation (nano-banana / Higgsfield)** → defer; no validation, new dependency. (M2)
- **Headless auto-push to client WordPress on approve** → defer; first-party publish only cycle one.

### USER CHALLENGE callouts (never auto-decided → final gate)
- **UC-1 (scope/channel order):** cut the WhatsApp Business channel + tokenized auto-publish from cycle one; validate the automated agent loop first via Approach B/D. Reverses the plan's "immediate build" framing.
- **UC-2 (moat ordering):** front-load or co-prioritize the competitor-gap research brief instead of shipping the commodity pipe first.
- **UC-3 (customer identity):** pick agency-as-customer (human-in-loop forever) OR stepping-stone-to-SMB (autonomous). Stop straddling.
- **UC-4 (taste):** make the human approval a visible accountability feature, not a one-tap auto-publish.
- **Confirm:** did the paid pilots log the round-trip / edit-distance metrics meant to spec the agent?

## Phase 2 — Design Review

**Mode:** single-voice (Codex `[unavail]`). Reviewed the existing editor the plan wants to reuse, because that is the load-bearing design claim.

### UI-scope assessment
NOT a low-UI cycle. Three user-facing surfaces, two of which do not exist yet: (1) **the chat itself is the product UI** — every greeting/clarify/draft/confirm is copy on a phone in 3 languages, 0% designed; (2) **the mobile review/approve screen** — "reuse the editor" is close to net-new (see criticals); (3) **the agent's voice in CA/ES/EN** — net-new, most market-visible surface. The plan's "Preview/edit/approve UI — Shipped" hides the real work: "shipped" is the desktop authoring editor, not a mobile read-and-approve flow.

### Conversational-flow critique (the conversation is the product)
- **Turn budget undefined (high).** Use the concierge metric (clarification round-trips) as a design target. Recommend draft-first: max one clarifying question, only on genuinely ambiguous/multi-topic input. A 3-question quiz feels like a form; the pilots were won by speed-to-draft.
- **700-1100 words can't live in a chat bubble; a bare link is robotic (high).** The bubble should carry a decision-grade summary: title + one-line `strategy` (already returned by `generateArticle`) + word count + "tap to review and approve." Link is the full-read fallback.
- **Voice-note-on-the-go unmodeled (high).** Rough notes are multi-topic / self-correcting / fired in bursts. A linear transcribe→draft pipe will confidently produce a clean, WRONG article — the worst trust failure. Needs a reflect-back beat before burning a 160s generation.
- **24h-window / template rules fight the warm voice (med).** Template-only re-engagement degrades the concierge feel to notifications. Reinforces CEO UC-1 (validate on a zero-tax channel first).
- **Post-approve hand-off undefined (med).** Send "Publicat ✓ <url>"; that close-the-loop message also starts the 60-day-outcome thread.

### Mobile approval-link critique (sharpest finding)
- **CRITICAL — publish control is desktop-only.** Approve = the "Publicat" button in `SettingsPanel`→"Publicació", inside `<aside className="hidden lg:flex">` (PostEditorClient.tsx ~1100). Below `lg` (every phone) that drawer isn't rendered and there's no bottom-sheet fallback. A client tapping the link on a phone **cannot find the approve button.** Reframes "reuse the editor" as "build a mobile review screen."
- **CRITICAL — editor hard-rejects no-login users.** `edit/page.tsx:16` `if (!user) redirect('/')`. The as-written no-login token cannot open this editor; it needs a new public `/review/<token>` page that re-renders + an approve button. The "small reuse" is, as written, a new public write-capable page.
- **Review-state design (either auth path):** read-first, not edit-first. Point at the public `/render/<site>/<slug>` (the editor's "Veure" already opens this) + a sticky bottom bar: `Aprovar i publicar` (primary), `Demanar canvis` (back to WhatsApp), `Editar` (full editor for power users). Approve needs one confirm (it flips the live render via `revalidateRender`) + an after-state with the live URL; re-open shows "Ja publicat ✓" + un-publish.
- **CEO reframe impact:** authed link removes the no-login surface but adds phone-login friction and still hits the desktop-only-publish wall; no-login link skips login but is a new write surface and still needs a new mobile UI. **Both paths require a net-new mobile review screen.** The auth call is friction-vs-surface-area, not whether design work exists.

### Trust / accountability as a feature (CEO UC-4)
- **`niche`+`strategy` are returned by `generateArticle` and discarded** in `handleGenerateArticle` (PostEditorClient ~460-481). Surface `strategy` as **"Why this article"** (angle, intent, focus keyword) on the review screen — converts "the AI wrote something" into "the AI made a defensible choice." (high)
- **"What changed from your voice note" (high):** show the transcript/brief next to the draft's angle. Accountability artifact + free QA on transcription errors.
- **60-day outcome (med):** surface the front of the `transcript→draft→approved→published_url→OUTCOME` loop on the confirm screen. A thin version of the deferred moat = a copy line + a stored record.
- Cheapest highest-trust upgrade in the cycle: mostly surfacing fields that already exist.

### Localization finding
**Critical.** `messages.ts` localizes only nav/role/theme/render-status; the **entire editor is hardcoded Catalan** ("Esborrany", "Generant l'article…", every panel label/confirm). A Spanish/English client tapping the link gets a Catalan approve screen — the exact defect headless-decoupling E5/DX3 named as most market-visible. The agent has **no localization plan**; its greeting/clarify/error/confirm copy must exist in CA/ES/EN from day one (detect inbound language; review screen reads site/post `default_locale`). Route every agent + review string through the existing `tr(locale,key)` dictionary before the first message ships.

### States / edge-cases (severity inline)
| State | Planned UX | Fix |
|---|---|---|
| Transcription failed (critical) | silence / raw error / agent guesses | reply in inbound language asking to retype/resend; keep original audio |
| Generation runs 2+ min, ≤160s (critical) | dead air in WA; static spinner in editor | immediate ack bubble then deliver; staged progress, never silent in 24h window |
| Image gen failed (med, deferred) | unspecified | proceed text-only + retry |
| Expired/used link (high) | auth redirect to `/` | branded localized "enllaç caducat" + new-link CTA |
| Already published (high) | editor published state / nothing on mobile | "Ja publicat ✓" + URL + un-publish |
| Multi-topic note (high) | drafts one or blends | reflect topics, draft one at a time |
| Mind-change mid-thread (med) | edits wrong draft | treat clear new brief as new draft; "torna a començar" |
| 5 notes at once (med) | 5 races, 5 links, cost spike | debounce burst, confirm scope once |
| Approve then un-publish (high) | no path over WA | "despublica" command + un-publish on review page |
| Transcript lang ≠ site locale (med) | wrong-language draft | detect + confirm target language before 160s gen |
| No site bound to number (high) | opaque failure | "connecta el teu número" one-time bind link |

### DESIGN DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Subagent                         Codex      Consensus
  ──────────────────────────────────── ───────────────────────────────  ─────────  ────────────────────────
  1. Conversational flow designed?     NO — tools, no copy/turn/voice    [unavail]  FLAGGED (1-voice high)
  2. Mobile approve usable?            NO — publish hidden lg:flex; auth  [unavail]  FLAGGED (1-voice critical)
                                        gate blocks no-login
  3. Trust/accountability a feature?   NO — niche/strategy discarded      [unavail]  FLAGGED (1-voice high)
  4. Localization handled?             NO — editor hardcoded CA           [unavail]  FLAGGED (1-voice critical)
  5. Error/empty/loading states?       NO — 160s wait + fails unspec      [unavail]  FLAGGED (1-voice high)
  6. Forgotten states/edge cases?      NO — multi-topic/burst/un-publish  [unavail]  FLAGGED (1-voice med)
```

### Design TASTE decisions (→ final gate)
1. **Read-first vs edit-first review screen** — rec: read-first (render + sticky approve bar; edit secondary).
2. **Bubble summary vs bare link** — rec: title + one-line strategy + word count + "tap to approve."
3. **Surface `strategy`/`niche` + transcript on approve** — rec: yes (near-free trust feature, CEO UC-4).
4. **Turn budget** — rec: draft-first, max one clarifying question on ambiguous input.
5. **Auth path UX cost** — rec: align with CEO UC-1 (authed link cycle one); mobile review screen needed either way.
6. **Localize agent+review copy from day one** — rec: yes, via existing `tr()`.

## Phase 3 — Eng Review (Architecture, Security, Tests)

**Mode:** single-voice (Codex `[unavail]`). Independent senior backend/infra engineer. Reviewed against CEO UC-1 (cut Meta channel + tokenized auto-publish from cycle one) and Design's two CRITICALs (publish control desktop-only; editor hard-redirects no-login → new `/review/<token>` page mandatory). Full pipeline designed; cycle-one-minimal = **Approach B/D** marked inline.

### Architecture (ASCII)
```
  WhatsApp provider (Twilio sandbox = B/D · Meta Cloud API = full)
        │  inbound webhook (text|audio|image), at-least-once
        ▼
  POST /api/whatsapp/webhook  ── Next Route Handler (Netlify fn, ~10s cap)
   1 read RAW body  2 verify signature (Meta X-Hub-Signature-256 / Twilio X-Twilio-Signature)
   3 echo Meta GET hub.challenge  4 dedupe INSERT wa_messages (UNIQUE wa_message_id)
   5 resolve phone → wa_identities (verified? else bind-link, STOP)
   6 INSERT generation_jobs(status=queued)  7 return 200  (well under 10s, ZERO LLM)
        │  fire-and-forget → /.netlify/functions/agent-worker-background
        ▼
  agent-worker-background.ts  ── Netlify Background Function (15-min budget)
   • claim job (UPDATE status=running, lease_until=now()+5m WHERE id=$ AND queued)
   • cost-gate (thread.cost_cents < ceiling AND day-gen-count < cap)  ← before any LLM
   • audio → safeFetchBinary(media_url,{auth,maxBytes}) → transcribe
   • Anthropic tool-use loop (one invocation):
        ask_clarification → send WA msg, STOP    propose_draft → generateArticle ≤160s → INSERT draft
        create_review_link → mint review_tokens   publish → DEFERRED to /review page (no auto-publish)
   • persist agent_state + cost_cents + turn_count; send outbound WA message
        ▼  "Esborrany llest: <title> · <strategy> · <words> mots → <link>"
  /review/[token]  ── Next Route Handler (revalidatePath works HERE)
   • read-first: /render/<site>/<slug> preview + strategy + transcript
   • sticky bar: Aprovar i publicar · Demanar canvis · Editar
   • POST approve → verify token (hash/exp/unused) → is_published=true → revalidateRender → "Publicat ✓"

  1-min Scheduled Function: re-drive jobs WHERE status IN(queued,running) AND lease_until<now()  (durability backstop)
```

### THE ASYNC PROBLEM (load-bearing)
`netlify.toml` uses `@netlify/plugin-nextjs` → every Next Route Handler / Server Action is a **synchronous Netlify Function** (~10s, ~26s Pro). `generateArticle` (`generate.ts:232`) is `timeout: 160_000`. **You cannot generate in-request.** No `netlify/functions/` dir exists today → the worker tier is net-new. Decision (Eng tiebreak explicit+pragmatic):
- **Worker = Netlify Background Function** (`netlify/functions/agent-worker-background.ts`, 202 + 15-min), same deploy → imports `generateArticle`/`safeFetchBinary`/admin client directly (DRY).
- **Queue = durable `generation_jobs` table with a lease** (claim by id, no race).
- **Durability = 1-min Scheduled Function** re-drives stale-lease jobs (background fns have no built-in retry → this IS the at-least-once guarantee).
- Rejected: pgmq/Edge (forks `generateArticle` into Deno, breaks DRY); external worker (overkill); `after()` in a Next route (still capped by sync timeout).
- **Constraint (E7):** `revalidatePath` only fires in the Next runtime → the worker writes DRAFTS only (admin client, no revalidate) and never calls the `posts.ts` `'use server'` actions; the one publish that needs `revalidateRender` happens on the `/review` route.

### Data model (migration 027, additive)
Reuse `posts` for drafts (`is_published=false`). New: `wa_identities` (phone_e164 UNIQUE · site_id · status · verify_code/expires · opt_in_at), `wa_threads` (identity_id · site_id · agent_state jsonb · current_post_id · window_expires_at · cost_cents · turn_count), `wa_messages` (thread_id · direction · wa_message_id UNIQUE · msg_type · text · media_path · transcript · raw), `review_tokens` (token_hash sha256 NEVER raw · post_id · site_id · thread_id · action · status · expires_at · consumed_at/ip), `generation_jobs` (thread_id · kind · status · attempts · lease_until · payload · result · error). `UNIQUE(wa_message_id)` and `token_hash` are load-bearing.

### Agent runtime
Anthropic tool-use loop = **durable DB state re-entered per inbound message**, not a long-lived process. Each inbound enqueues one `agent_turn`; worker loads `agent_state` + reconstructs history from `wa_messages`, one Anthropic call, iterates fast tools in one invocation, then sends a clarification and stops (waits for next human msg) or finishes. `propose_draft` is the only 160s tool. Cost/turn ceilings in DB (survive per-instance memory), gated BEFORE any Anthropic call — mirrors the `assertPremiumAccess` bail-before-spend backstop in `posts.ts`.

### /review/<token> page
New public route `src/app/review/[token]/page.tsx` (editor un-reusable: `edit/page.tsx:16` redirect + `hidden lg:flex` publish control). Read-first: render `/render/<site>/<slug>` + surface `strategy`/`niche` (currently discarded) + transcript + sticky bar. **Token model: `review_tokens` DB row (single-use, revocable, audited) over stateless HMAC** — approve is a public WRITE flipping `is_published`; single-use/revoke/audit need a DB row anyway, so HMAC buys nothing. 32-byte entropy, store `sha256` only, scope to ONE post + ONE action. **Approach B/D (cycle one): same page + row for audit, but login-gate the page and route approve through `assertSiteAccess`** → no new unauthenticated write surface, no auto-publish (satisfies CEO UC-1/H1). No-login token + auto-publish = full Meta build, deferred.

### Security threat model
| Surface | Threat | Control |
|---|---|---|
| Webhook | Forged inbound (free Opus spend) | Verify HMAC on RAW body before parse (Meta SHA256 / Twilio SHA1), constant-time; echo Meta challenge |
| Webhook | At-least-once redelivery → double gen | `UNIQUE(wa_message_id)`, enqueue only on fresh insert |
| No-login write | Token guess/replay; flips live render | `review_tokens` single-use, 32-byte, sha256-only, exp, per-IP rate-limit, no enumeration oracle; B/D adds login gate |
| WA media | SSRF + oversized | Reuse `isSafeUrl`; new `safeFetchBinary(url,{headers,maxBytes})`; host allowlist (`graph.facebook.com`,`lookaside.fbsbx.com`,`*.twilio.com`) |
| LLM cost | Stranger texts the number, burns Opus | DB identity-gate before any LLM (no binding → bind-link, zero LLM); per-thread `cost_cents` + per-day cap (`ratelimit.ts` Map is per-instance, only the cheap first layer) |
| Secrets | Leakage | `WA_APP_SECRET`/`WA_VERIFY_TOKEN`/`WA_ACCESS_TOKEN`/`TWILIO_*`/transcription key/`ANTHROPIC_API_KEY` server-only env; never in the link or client |
| PII | Voice/transcript retention (GDPR ES/CA) | Audio → PRIVATE bucket (not public `post-media`), TTL purge post-transcription; transcript retention window; never log transcripts; "esborra'm" unbind+purge |

### Findings (auto-decided per 6 principles)
| ID | Sev | Finding | Decision |
|----|-----|---------|----------|
| E1 | **critical** | Sync ~10s Netlify fns vs 160s gen → can't generate in-request | Webhook enqueues `generation_jobs`+200; Background Function worker; Scheduled re-driver. Reject pgmq/external/`after()` (P1+explicit) |
| E2 | **critical** | Must verify sig on RAW body before parse + echo Meta challenge | `req.text()` first; constant-time HMAC; reject unsigned (P1) |
| E3 | **critical** | At-least-once → double generation | `UNIQUE(wa_message_id)`; enqueue on fresh insert only (P1) |
| E4 | **critical** | Stranger reaches Opus before any gate | DB identity-gate before LLM; per-thread/day cost caps; reuse bail-before-spend (P1) |
| E5 | **high** | Public WRITE flipping `is_published`; HMAC can't be single-use/revoked | `review_tokens` row sha256, single-use, exp, 1 post+1 action; B/D login-gate (P5) |
| E6 | **high** | `safeFetch` is text-only, no auth, no byte cap | Add `safeFetchBinary` reusing `isSafeUrl` + host allowlist; don't fork guard (P2 DRY) |
| E7 | **high** | `revalidatePath` only in Next runtime; worker can't call `posts.ts` actions | Worker writes drafts via admin client; publish+revalidate only on `/review` route (P5) |
| E8 | med | Voice/transcript PII, no retention | Private bucket+TTL; retention window; no logging; erase command (P1) |
| E9 | med | New WA/transcription secrets | Server-only env, documented (P1) |
| E10 | med | Transcription fail + gen timeout are normal states not 500s | Worker catches → job `error` → localized retry; reflect-back before 160s gen (P1) |

### Test plan (keep `npm run test:render` green)
Webhook verify (valid/tampered/Twilio/challenge/unsigned·401); async job lifecycle + lease + Scheduled re-driver; idempotency (dup `wa_message_id` → one draft); agent loop re-entry + `turn_count` cap; token mint/consume/expire/replay/revoke/no-enumeration; identity binding (unknown→bind-link zero LLM); transcription failure; generation timeout (no half-draft); publish + un-publish; SSRF rejection (`169.254.169.254` + encodings, off-allowlist, oversized); cost rate-limit blocks before Anthropic; regression invariant (`test:render`, `posts.ts` unchanged, `safeFetch` text path unchanged).

### ENG DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Subagent                              Codex      Consensus
  ──────────────────────────────────── ─────────────────────────────────── ─────────  ─────────────────────────
  1. Architecture sound?               YES (durable jobs + bg worker)        [unavail]  CONFIRMED (1-voice)
  2. Async model viable on Netlify?    YES — bg fn (15m) + lease + cron       [unavail]  CONFIRMED (E1 load-bearing)
  3. Test coverage sufficient?         YES (12 codepaths + render invariant)  [unavail]  CONFIRMED
  4. Security threats covered?         PARTIAL — E2/E3/E4/E5/E6 must land     [unavail]  FLAGGED → in scope
  5. Error paths handled?              PARTIAL — E10                          [unavail]  FLAGGED → in scope
  6. Deployment risk manageable?       YES for B/D; HIGH for full Meta (BSP)  [unavail]  FLAGGED → defer Meta (CEO UC-1)
```

### NOT in scope (Eng) · EXISTS
- **NOT:** Meta Cloud API/BSP/templates (full only; B/D = Twilio sandbox/personal number); no-login token + auto-publish (deferred; B/D login-gates `/review`); `request_image` (stubbed, CEO M2); pgmq/external worker; any `/render` change.
- **EXISTS (reuse):** `generateArticle`+`sanitizeHtml`; `createPost`/`updatePost`+`revalidateRender`; `POST /api/v1/posts`; `POST /api/upload`; `isSafeUrl`/`safeFetch`; `rateLimit`/`clientIp`; `assertPremiumAccess` bail-before-spend; `tr(locale,key)`/`['ca','es','en']`. Next migration = **027**.

## Phase 4 — DX Review (Developer & Operator Experience)

**Mode:** single-voice (Codex `[unavail]`). Two populations: the agency owner texting WhatsApp (their DX is the product) and the operator (Víctor) running it.

### Grounding checks (code)
- `netlify.toml` = `[build]` + `@netlify/plugin-nextjs` only; no `[functions]`, no scheduled config. No `netlify/functions/` dir → worker tier is greenfield (E1).
- `.env.example` documents only Supabase + `ANTHROPIC_API_KEY`; none of the WA/transcription vars.
- `package.json` `dev` = `next dev` → does NOT run Netlify Background/Scheduled Functions → the async tier is invisible in the current local loop.
- `GET /api/account/sites` returns EXACTLY ONE site per `api_key` by privacy design — cannot enumerate an owner's blogs (load-bearing for multi-site).
- `/admin` is superadmin-gated; `/admin/grabber-lab` is the dashboard-first internal-tool precedent for the observability fix.

### Journey A — agency owner (TTFPA)
1 log in · 2 **discover the WA number (no surface exists — DX1 blocker)** · 3 text → unbound → bind-link STOP, **the actual voice note is dropped, never replayed (DX2)** · 4 bind-link → login wall #1 → verify → (pick site if >1, unspecified) · 5 re-record + resend → enqueue → transcribe → ≤1 clarify → `generateArticle` ≤160s → "Esborrany llest → link" · 6 tap → **login wall #2** (B/D) → read draft+strategy+transcript → Aprovar → Publicat ✓. **~6 steps but 2 login walls + 1 cold bounce + 1 dropped note; stalls at step 2/3 before generation is ever reached.**

### The agency multi-site cliff (the real failure for the paying customer)
`wa_identities` = `phone_e164 UNIQUE · site_id` → one phone binds one site, enforced in Postgres. The validated customer (agency, CEO S2/UC-3 north-star) runs many client blogs from one WhatsApp number → can bind exactly one; other clients' notes have nowhere to go. No per-note site selector. The plan never resolves UC-3 so the schema silently picks SMB. Recoverable IF declared: `wa_threads.site_id` already exists, so v2 = drop the UNIQUE + a phone-to-sites join + a resolver turn setting `wa_threads.site_id`/draft per message + a NEW user-id-scoped site list (can't reuse `/api/account/sites`). A resolver + join table, not a teardown. **One-phone-one-site is a fine v1 only if cycle one is explicitly declared SMB-shaped and the bind UI says so.**

### Wrong-site failure
In B/D the blast radius is contained (one site, no auto-publish, human approves login-gated). Catastrophe (agent auto-publishes to the wrong client blog) only materializes when per-note multi-site routing + no-login auto-publish ship together. **Rule: never ship those two in one cycle.** And `/review` must show "Es publicarà a: <site>" above Aprovar (DX4) — the accountability guard (CEO UC-4) applied to the most expensive mistake.

### Journey B — operator (setup → first incident)
Pick provider (Twilio sandbox for B/D; no runbook, DX6) → set WA/transcription env (absent from `.env.example`+`netlify.toml` → first deploy 403s with no hint, DX6) → create `agent-worker-background.ts` (**`-background` suffix is load-bearing — mis-name → silent sync 10s fn → every gen times out, DX7**; raw functions don't resolve the `@/lib` alias → relative imports/`included_files`) + scheduled re-driver → deploy → customer says "sent a note an hour ago, nothing" → **operator opens raw Supabase SQL; no admin surface for `generation_jobs`/`wa_threads`/`wa_messages` (DX5)**. Local dev: `next dev` blind to the worker, webhooks need a public URL, no replay harness → ship `scripts/wa-replay.mjs` (signed text/voice/dup fixtures) (DX8). Cost: `cost_cents` likely Opus-only, under-counts transcription + WA conversation; ceilings unconfigured (DX9).

### Findings
| ID | Sev | Finding | Decision |
|----|-----|---------|----------|
| DX1 | **critical** | No surface shows the owner the WA number; TTFPA can't start | FIX: dashboard "El teu agent de WhatsApp" card (number + `wa.me` link + how-to, `tr()`). In scope |
| DX2 | **high** | First-ever note discarded by unbound→bind STOP; no replay | FIX: persist pending `wa_messages`, enqueue once `wa_identities` active. In scope |
| DX3 | **critical** | One-phone-one-site strands the agency (UC-3); migration 027 bakes SMB | **GATE**: declare SMB-v1 + say so in bind UI, OR build per-thread routing now |
| DX4 | **high** | `/review` doesn't show destination blog; no wrong-site guard | FIX: "Es publicarà a: <site>" above Aprovar; never ship multi-site+no-login-autopublish together. In scope |
| DX5 | **high** | Tables designed, zero admin surface | FIX: `/admin/agent` (jobs board, thread timeline+transcript, cost meter) via grabber-lab pattern. In scope |
| DX6 | **high** | WA/transcription env absent from `.env.example`/`netlify.toml`; no runbook | FIX: add vars + Twilio-sandbox-first runbook. In scope |
| DX7 | **high** | `netlify/functions/` net-new; `-background` suffix + `@/lib` alias pitfalls | FIX: pin filename, document scheduled config, relative imports/`included_files`. In scope |
| DX8 | **high** | `next dev` can't run worker; no public URL; no replay | FIX: `netlify dev`+tunnel + `scripts/wa-replay.mjs`. In scope |
| DX9 | med | `cost_cents` under-counts (transcription+WA); ceilings unconfigured | FIX: accumulate all three, ceilings in env, surface in `/admin/agent`. In scope |
| DX10 | med | Two login walls per article | ACCEPT cycle one; DOC; prefer one-tap magic-link session. Taste → gate |

### DX SCORECARD (0-10)
TTFPA 4→7 (DX1+DX2+DX10) · Onboarding 4→7 · **Agency multi-site fit 2→6 (DX3, only if SMB-v1 declared)** · Operator setup 3→8 (DX6+DX7) · **Observability 2→8 (DX5+DX9)** · Local test 3→8 (DX8) · Cost visibility 4→8 (DX9). **Overall ~3/10 now → ~7/10 with DX1-DX9.** Spine shipped+clean; the onboarding/multi-site/operability surfaces around it are absent, and that gap IS the owner-and-operator experience.

### DX DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Subagent                              Codex      Consensus
  ──────────────────────────────────── ───────────────────────────────────  ─────────  ─────────────────────────
  1. TTFPA acceptable?                 NO — no number; first note dropped     [unavail]  FLAGGED (1-voice critical)
  2. Onboarding/binding warm?          NO — cold bounce turn one (DX2)        [unavail]  FLAGGED (1-voice high)
  3. Agency multi-site addressed?      NO — one-phone-one-site; UC-3 open     [unavail]  FLAGGED (1-voice critical → gate)
  4. Operator setup documented?        NO — env/functions/provider unspecced  [unavail]  FLAGGED (1-voice high → scope)
  5. Observability sufficient?         NO — tables, zero surface (DX5)        [unavail]  FLAGGED (1-voice high → scope)
  6. Local test loop exists?           NO — next dev blind; no replay (DX8)   [unavail]  FLAGGED (1-voice high → scope)
```

### DX TASTE decisions (→ gate)
- **DX3 (big):** SMB-only v1 declared + designed v2 path, vs build agency multi-site routing now.
- **DX4:** destination-blog guard on `/review`; never ship multi-site routing + no-login auto-publish in one cycle.
- **DX10:** two login walls acceptable cycle one; prefer one-tap magic-link.

## Phase 5 — Final Approval Gate (resolved 2026-06-26)

| # | Gate item | Source | User decision |
|---|-----------|--------|---------------|
| G1 | Cycle-one scope / channel | CEO UC-1 (all 4 phases) | **Approach B/D** — zero-tax channel (Twilio sandbox / existing number), human-confirmed login-gated `/review`, no Meta BSP, no no-login auto-publish. Meta + auto-publish deferred. |
| G2 | Customer identity + multi-site | CEO UC-3 / DX3 | **Support BOTH, detect.** Bind phone→owner with a site allow-list; if owner has 1 site auto-route, if >1 the agent asks "per a quin client?" and sets `wa_threads.site_id` per note. No one-phone-one-site baking; no later reshape. |
| G3 | Moat ordering | CEO UC-2 | **Pipe first + capture outcome data** — ship voice→draft→approve→publish; record `transcript→draft→approved→published→OUTCOME` (incl. 60-day check) from day one so the research engine is a later swap-one-stage. |
| G4 | Review-token security model | Eng E5 | **Resolved by G1.** `review_tokens` DB row (single-use, sha256-only, revocable, audited) + B/D login-gate + publish via `assertSiteAccess`. No HMAC, no no-login write. |
| G5 | Human-in-loop as feature | CEO UC-4 / Design | **Adopted (near-free):** `/review` surfaces `strategy`/`niche` (currently discarded), the transcript, and the destination blog above Aprovar. |

### Revised data model (migration 027, multi-site-capable, additive)
- `wa_identities` — `id · phone_e164 (UNIQUE) · user_id→profiles · status(pending|active|blocked) · verify_code · verify_expires_at · verified_at · opt_in_at`. Phone binds to an OWNER, not a site.
- Candidate sites = the owner's existing `site_users` rows (reused). Optional `wa_identity_sites` allow-list (`identity_id · site_id`) to scope a phone to a subset; default = all the owner's sites.
- Resolver (in the agent worker): count candidate sites → 1 ⇒ auto-set `wa_threads.site_id`; >1 ⇒ `ask_clarification` "per a quin client?" then set it; `/review` shows "Es publicarà a: <site>".
- `wa_threads` (`site_id · agent_state · current_post_id · window_expires_at · cost_cents · turn_count`), `wa_messages` (`wa_message_id UNIQUE · transcript · media_path`), `review_tokens` (`token_hash sha256 · post_id · action · status · expires_at`), `generation_jobs` (`kind · status · attempts · lease_until`). Outcome fields on the draft/thread for G3.

### Auto-adopted into scope (mechanical, no gate)
Async tier E1 (durable `generation_jobs` + Netlify Background Function worker + 1-min Scheduled re-driver) · signature-verify on raw body E2 · `UNIQUE(wa_message_id)` idempotency E3 · DB cost-gate before LLM E4 · `safeFetchBinary` reusing `isSafeUrl` E6 · worker writes drafts only, publish+revalidate on `/review` E7 · PII private bucket+TTL E8 · server-only secrets E9 · localized failure states E10 · all Design states/edge-cases · localize agent+review copy via `tr()` · read-first `/review` · number-discovery card DX1 · first-note replay DX2 · `/admin/agent` observability DX5/DX9 · env runbook DX6/DX7 · `scripts/wa-replay.mjs` DX8.

### Still deferred (post-cycle-one)
Meta Cloud API / BSP / templates · no-login single-use token + auto-publish · image generation (`request_image` stubbed, CEO M2) · headless auto-push to client WordPress on approve · the full competitor-gap research engine (data captured now, automation later).

### Confirm before T2 (CEO M1/S3)
Did the paid pilots log the clarification-round-trip and edit-distance numbers? They were meant to spec the agent's turn budget. If not captured, the agent loop ships on a draft-first default (Design rec) and we measure from the first real threads.

---

## Updates (post-approval)

**2026-06-26 — LLM provider shift (founder directive).** The agent loop AND the
generation worker (T4) run on **OpenAI** (`WA_AGENT_MODEL`, default `gpt-4o`, a
`gpt-5` placeholder when available), **not Anthropic**. The Eng-phase prose above
says "Anthropic SDK tool-use" — that is now superseded for the WhatsApp worker.
Open fork for T4: the shipped `src/lib/writing/generate.ts` (`generateArticle`,
Anthropic Opus 4.8) still powers the dashboard's Magic SEO Article. T4 either adds
a parallel OpenAI generation path or ports `generateArticle` behind `WA_AGENT_MODEL`;
keep the dashboard path on Anthropic unless a separate decision moves it. The
`openai` SDK is a new dependency added at T4. The webhook (T2) is provider-agnostic.

**2026-06-26 — Turn Budget = 1 (founder directive).** Drop a voice note → get a
review link. The agent drafts immediately on any usable topic and asks AT MOST one
clarification per thread, only when the note is empty or incomprehensible. No chatty
bot. Encoded in `WA_TURN_BUDGET`. This hardens the Design-phase "draft-first" rec
into a strict rule.

**2026-06-26 — WhatsApp provider: Twilio → Kapso (founder directive).** The CEO
discarded Twilio and bought a prepaid SIM. Provider candidates were **Bird** (ex-
MessageBird) and **Kapso** (kapso.ai). **Decision: Kapso.**

*Rationale (lead-eng eval against our stack: Next.js serverless, fast webhook,
secure media download, single-number AI agent):*
- **Purpose-built for WhatsApp AI agents + bring-your-own-number.** Kapso provisions/
  connects a number (the prepaid SIM) over the official Meta Cloud API — the exact
  zero-tax, low-friction channel G1 wants. Bird is an enterprise omnichannel CPaaS
  oriented to marketing campaigns; heavier BSP/WABA onboarding, higher cost, overkill
  for one number.
- **Clean serverless webhook.** Kapso's Platform webhook is plain JSON `{ event, data }`
  signed with **HMAC-SHA256** in `X-Webhook-Signature` (verified over the RAW body) +
  a per-endpoint `KAPSO_WEBHOOK_SECRET`. Inbound message schema is flat:
  `data.message.{id,from,type,text.body,audio.id,kapso.media_url}`, `data.phone_number_id`.
  Faster to parse and verify than Twilio's URL+sorted-params HMAC-SHA1 over form-encoding.
- **Secure media download.** Kapso mirrors inbound media to a Kapso-hosted URL
  (`message.kapso.media_url`) and exposes a Meta-compatible media endpoint
  (`GET {base}/{graph}/{media_id}`, `X-API-Key`) — fetched through our existing
  hardened `safeFetchBinary` (SSRF guard + 25 MB cap + auth-dropped redirects). No
  Twilio Basic-auth → S3 redirect dance.
- **Outbound** is a single REST call: `POST {base}/{graph}/{phone_number_id}/messages`
  (`X-API-Key`, Meta text body).
- **Integration choice:** direct REST + `fetch` (not the `@kapso/whatsapp-cloud-api`
  SDK, which is only **v0.2.2**) — keeps an immature dep off the hot path, reuses our
  audited fetch primitive, and the endpoints are stable Meta-compatible REST. No new
  npm dep needed (`openai` already added at T3).

Env: **add** `KAPSO_API_KEY`, `KAPSO_WEBHOOK_SECRET`, `KAPSO_PHONE_NUMBER_ID`
(optional `KAPSO_API_BASE`, `KAPSO_GRAPH_VERSION`); **remove** all `TWILIO_*`.
Webhook now returns `200 {"success":true}` JSON (no TwiML). DB idempotency (23505)
and job queueing are unchanged. Agent fallback/clarification voice is now direct,
casual and practical in Catalan (light emoji), incl. an LLM-free empty-audio re-ask.

## Implementation Tasks (build order)

- [x] **T1 — migration 027** (`supabase/migrations/027_whatsapp_agent.sql`): 7 tables (added `wa_identity_sites` for G2 scoping + `wa_article_outcomes` for G3) + RLS + triggers. Run manually in Supabase 2026-06-26. Foundation: `src/lib/whatsapp/{types,config,tokens}.ts`. *(Eng data model)*
- [x] **T2 — `POST /api/whatsapp/webhook`** (`src/app/api/whatsapp/webhook/route.ts`): **Kapso** raw-body HMAC-SHA256 verify (`X-Webhook-Signature` + `KAPSO_WEBHOOK_SECRET`), event-gate (only `whatsapp.message.received`; ack the rest), extract `message.{id,from,type,…}` + `phone_number_id`, `UNIQUE(wa_message_id)` dedupe (+ partial-failure job recovery), identity-gate (unbound → ack, zero LLM) + candidate-site mapping, enqueue `generation_jobs`, fast `200 {"success":true}` JSON. *(E2,E3,E4)* — **refactored Twilio→Kapso 2026-06-26.**
- [x] **T3 — `safeFetchBinary` in `src/lib/scrape/http.ts`** (SSRF-guarded every hop, byte-capped, manual-redirect, drops auth across redirects) + **`src/lib/whatsapp/transcribe.ts`**: `downloadKapsoMedia` (prefers `message.kapso.media_url`, else resolves the Meta media id via Kapso's `X-API-Key` media endpoint; fetched through `safeFetchBinary`, 25 MB cap) + `transcribeAudio` (OpenAI Whisper `whisper-1`, unchanged). `openai` SDK v6 (no Kapso SDK — direct REST). tsc + eslint clean. *(E6)* — **refactored Twilio→Kapso 2026-06-26.**
- [x] **T4 — worker** (`src/lib/whatsapp/worker.ts` + `agent.ts` + **`kapso.ts`**; route `src/app/api/whatsapp/worker/route.ts` secured by `WA_WORKER_SECRET`; Netlify Scheduled Function `netlify/functions/agent-worker-cron.mts`, `* * * * *`): lease-claim, cost+turn ceilings before LLM, audio→`downloadKapsoMedia`+Whisper, **LLM-free empty-audio casual re-ask (req 4)**, **site resolver (1 auto / >1 ask "per a quin client?")**, **OpenAI agent `WA_AGENT_MODEL` with strict Turn-Budget-1** (draft on any topic; clarify only on empty/gibberish; forced-draft after one clarification), admin `saveDraft` → `posts.content={html}`, mint `review_tokens`, capture `wa_article_outcomes` (G3), **Kapso reply** (`sendWhatsApp` w/ per-message `phone_number_id`, default `KAPSO_PHONE_NUMBER_ID`). Fail-safe: transient retries ≤`WA_JOB_MAX_ATTEMPTS` then `error`+apology. Persona Catalan, **direct/casual/practical**. Reuses `sanitizeHtml`/`slugify` from generate.ts. tsc+eslint clean. *(E1,E7,E10,G2 · OpenAI · Kapso)*
- [x] **T5 — `src/app/review/[token]/`** (`page.tsx` server + `ReviewClient.tsx` client + `actions.ts` 'use server' + `shared.ts`): mobile-first bento approve screen. **Token-capability access (NO login wall)** — founder friction directive; the 256-bit single-use sha256 token IS the authorization, human-confirmed by the tap, reversible via dashboard un-publish (deviation from plan's "login-gated"; flagged). Four states: invalid / expired / already-published ("Publicat ✓" + live link) / active review (destination blog, reading-time + focus-keyword + category chips, title + excerpt, `.review-prose` body, collapsible original transcript). Sticky gold "Aprovar i Publicar" CTA → `approveAndPublish`: rate-limit, re-verify token, **atomic single-use consume** (guarded `active→consumed` UPDATE; rolls back on publish error), `is_published=true`, `revalidatePath('/render/'+siteId)` (= the headless WP "Trojan Horse" trigger — plugin pulls the now-live `/embed`), stamp `wa_article_outcomes.published_at/url` (G3), best-effort Kapso "Publicat! 🎉" nudge. `noindex` metadata. tsc+eslint+`next build` clean. *(E5, Design, DX4, G5)*
- [ ] **T6 — Localization**: route all agent + `/review` copy through `tr(locale,key)`; detect inbound language; review reads site `default_locale`. *(Design localization CRITICAL)*
- [ ] **T7 — Onboarding**: dashboard "El teu agent de WhatsApp" card (number + `wa.me` + how-to) + bind/verify flow + **first-note replay**. *(DX1,DX2)*
- [ ] **T8 — `/admin/agent` observability** (superadmin, grabber-lab pattern): jobs board (status/attempts/lease/error), per-thread timeline + transcript, cost meter (Opus + transcription + WA). *(DX5,DX9)*
- [ ] **T9 — Outcome-loop capture**: `transcript→draft→approved→published→OUTCOME` records + 60-day rank/traffic check field. *(G3 moat-as-data)*
- [ ] **T10 — Operator DX**: WA/transcription/Kapso vars in `.env.example` + `netlify.toml`, Kapso number-provisioning + webhook-secret runbook, `scripts/wa-replay.mjs` signed replay harness (Kapso `X-Webhook-Signature`), `netlify dev` note. *(DX6,DX7,DX8)*
- [ ] **T11 — Tests**: the 12 Eng codepaths (webhook verify, job lifecycle+re-driver, idempotency, loop re-entry, token mint/consume/expire/replay/revoke, identity binding, transcription fail, gen timeout, publish/un-publish, SSRF rejection, cost rate-limit). Keep `npm run test:render` green.

**Build order:** T1 → T2 → T3 → T4 → T5 → (T6, T7, T8, T9 parallel) → T10, T11 alongside.

---

## GSTACK REVIEW REPORT
- **Pipeline:** /autoplan · CEO → Design → Eng → DX · all phases single-voice `[subagent-only]` (Codex binary not installed). Each phase ran as an independent foreground subagent.
- **Gates:** 5 resolved by user (G1 B/D scope · G2 multi-site-detect · G3 pipe-first · G4 token=DB-row · G5 trust-as-feature). 4 CEO User Challenges + DX3 surfaced; none auto-decided.
- **Load-bearing findings:** Design — editor un-reusable on mobile (publish `hidden lg:flex`, no-login redirect) → new `/review` page mandatory. Eng — E1 sync-10s-fn vs 160s-gen → durable async worker tier is the real build. DX — one-phone-one-site stranded the agency (resolved to detect-both) + zero observability surface.
- **Verdict:** Plan is buildable as Approach B/D. The shipped generate-and-publish spine (~90%) is real leverage; the net-new is the async worker, the mobile review screen, the agent loop, and the onboarding/observability surfaces. Critical security items E1-E6 must land.
- **STATUS: APPROVED (2026-06-26).** 11 tasks, build order T1→T2→T3→T4→T5→(T6-T9)→T10/T11.
- **Artifact:** this plan (`docs/plans/2026-06-26-whatsapp-agent-flow.md`).
