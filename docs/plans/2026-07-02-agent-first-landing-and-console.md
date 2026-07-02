# Agent-first landing + Agent Console (DRAFT — pending founder approval)

Date: 2026-07-02 · Status: **draft**

Repositions Carma around the WhatsApp agent ("control your blog from WhatsApp"),
gives the agent a first-class sidebar surface (config moves out of Settings),
and adds smart in-dashboard interaction with the same agent brain.

**Load-bearing fact:** `runAgent()` (src/lib/whatsapp/agent.ts) is a pure
function — brief → clarify|draft, with a revision mode (`editInstructions` +
`currentDraft`). It has no WhatsApp coupling; webhook/worker/Kapso are just the
phone transport. `wa_article_outcomes.thread_id` is already nullable, so
console-published articles can log outcomes without a thread. Ergo: the web
console needs **no queue, no Kapso, no migration** for v1.

---

## Workstream B — "Agent" in the sidebar (build first)

New route `/dashboard/agent`:
- `page.tsx` (RSC): `getSession()` + parallel fetch of wa_identities (own),
  memberships/sites, wa_identity_sites scopes, recent `wa_article_outcomes`
  (join posts for title/slug, limit 8), `WA_AGENT_NUMBER` presence.
- `AgentClient.tsx` bento: status hero (Actiu / Pendent de verificació /
  Connecta), left column = chat console (Workstream C), right column =
  **Connexió** card (moved from Settings: add phone → OTP verify via wa.me link
  → per-identity site scopes; reuses `addPhoneNumber` / `regenerateVerifyCode`
  / `removePhoneNumber` / `setIdentitySites` actions unchanged) + **Activitat**
  card (recent agent-published articles, outcome links).
- SidebarNav: "Agent" item (MessageCircle icon, small gold "IA" chip) in its own
  group under the sites list; i18n key `nav.agent` in messages.ts (ca/es/en).
- Settings: WhatsApp sections removed; account (name/password) stays; small
  pointer card "L'agent s'ha mogut" → /dashboard/agent.
- loading.tsx (RouteLoader) + error.tsx for the new segment.
- Access: any signed-in user (same policy as today's Settings T7). Freemium
  gating is a separate product decision (see Open decisions).

## Workstream C — Agent Console (smart interaction)

v1, zero migrations, ephemeral session chat:
- `src/lib/actions/agent-console.ts`:
  - `consoleAgentTurn(siteId, { brief | editInstructions+currentDraft })` —
    auth via getSession + site membership; resolves site name, locale (native
    label via LOCALE_META), existing categories (distinct from posts, capped);
    calls `runAgent`; returns `{ kind:'clarify', message }` or
    `{ kind:'draft', draft }`. Auth-gated (unlike inbound WhatsApp, no
    stranger-cost risk), so v1 ships without the WA_DAILY_GEN_CAP machinery;
    WA_MOCK_AGENT honoured for credit-free dev.
  - `consolePublish(siteId, draft, { publish: boolean })` — creates the post
    via the existing posts pipeline (slug-conflict-safe), records a
    `wa_article_outcomes` row (thread_id null), returns editor URL + live URL.
- `AgentChat.tsx` (client, card design system): user bubbles right
  (accent-soft), agent left (surface); thinking bubble = mini KnotLoader +
  staged status lines on a timer ("Llegeixo el brief… / Estructuro… /
  Escric…" — same creep trick as the capture modal; runAgent is one strict-
  schema JSON call, no token streaming). **DraftCard** bubble: title, strategy
  line (already written in Catalan by the agent), excerpt, category chips +
  actions: **Aprova i publica** (btn-gold glow) · **Edita** (next message
  becomes editInstructions → revision loop) · **Obre a l'editor** (create as
  draft, route to post editor) · **Descarta**.
- Site picker pill at chat top (defaults: single site, else last used via
  localStorage).
- Empty/edge states: no OPENAI_API_KEY → clear inline error; no
  WA_AGENT_NUMBER → console still fully works (web-only agent), Connexió card
  explains the phone channel is not configured.
- v1.5 (stretch): voice input — MediaRecorder upload → existing transcribe.ts.
- v2 (migration 028): persist console threads (channel col on wa_threads),
  cross-channel continuity (start on web, continue on WhatsApp), cover-image
  step parity, per-user caps table.

## Workstream A — Agent-first landing (build after B+C exist)

Same gold design system + card language, stays a statically prerendered client
component, zero images (CSS-only mockups → no CLS):
- **Hero**: agent story. Headline ~"Envia un àudio. Publica un article." with
  hero-word stagger; sub: control the blog from WhatsApp. Dual CTA:
  **Crea el meu blog** (btn-gold → /registre) + **Clona la meva web** (focus
  URL input / anchor). Right side: **CSS phone mockup** (reuse the Studio
  device-frame look: rounded-[2.25rem] dark bezel) playing a chat — voice-note
  bubble (gold waveform bars), agent draft-card bubble with Aprovar/Editar
  buttons, "Publicat ✓ + enllaç" bubble; animated with data-reveal + small
  keyframes (typing dots).
- **How it works** reframed: 1) Crea o clona el teu blog · 2) Connecta el teu
  WhatsApp · 3) Nota de veu → esborrany → Aprovar → publicat.
- **Feature bento** reordered: featured tile = Agent de WhatsApp (mini chat
  mock inside), then Vareta màgica (clone), Studio en directe, **Mòduls
  intel·ligents (new tile — shipped since the landing was written)**,
  Multi-idioma, Estadístiques.
- **Clone section**: UrlInput keeps its own section ("Ja tens web? Clona-la en
  30 segons") — preserves the existing funnel entry.
- **Pricing**: structure unchanged; add agent line (placement = open decision).
- **Dark CTA (WaitlistHero)**: re-copy to the agent promise.
- Metadata/OG updated to agent positioning.

## Workstream D — opportunistic (recommended alongside)

1. Run pending Supabase migrations 019–025 + new grouped posts-count RPC
   (audit deferred item) in one SQL session.
2. Dashboard home quick-action card "Parla amb l'agent".
3. Onboarding follow-through: after first site creation, "Connecta WhatsApp"
   step pointing at /dashboard/agent.
4. Landing OG image + robots/sitemap.
5. Later: Stripe billing, custom domains (SameSite=None cookie caveat noted in
   studio memory).

## Order + effort

B (½ day) → C v1 (1 day) → A (1 day) → D sprinkles (hours). Land the product
surface before the landing sells it.

## Open decisions (founder)

1. Green-light scope/order above?
2. Hero direction: dual-CTA agent hero with phone mockup (recommended) vs
   keeping the URL-input-centric hero with an agent section below.
3. Pricing placement of the agent: Premium perk on landing while beta-free in
   app (recommended) vs Free tier headline feature.

## v2 (2026-07-03 founder feedback) — Blog-clone onboarding + module detection

Founder ask: onboarding should offer (a) "copia els estils de la teva web"
(today's magic wand) AND (b) "clona la pàgina de BLOG d'una altra web" — a
near-identical clone of a blog listing (cards, layout, features), with its
functionality DETECTED and imported as Carma modules, all manageable from the
Studio afterwards.

Proposed pipeline (builds on what already ships):
1. **Module detection at capture** (`analyze/route.ts`, new `detectModules(root)`):
   pure heuristics over the parsed page — search input (`input[type=search]`,
   role=search, class~=search) → `search` module; newsletter form (email input
   inside form outside chrome) → `newsletter`; category pills/filter nav →
   `categoryFilter`; share links (twitter/facebook intents) → `share`; TOC nav →
   `toc`; related-posts strip → `relatedPosts`; dark-mode toggle → `darkMode`.
   Emit `detected_modules: string[]` in `AnalyzeResult` (+ SSE notice listing
   what was found). Context applies via existing modules actions (site_themes.
   modules JSONB — no migration).
2. **Feed-layout matching**: reuse the card-sample finder (`findCardSample`) to
   measure columns/gap/media-aspect of the source grid and pick the closest
   `feedLayouts` preset + card tokens (radius, shadow, meta order) — a faithful
   *native* clone (the deliberate lesson from the retired `extracted_card`
   pixel-template: native cards + matched tokens beat brittle 1:1 HTML).
3. **Onboarding UI**: SiteOnboarding's two ways become three cards — "Clona la
   teva web" (styles) / "Clona un blog que t'agradi" (URL of any blog → steps
   1-2 + demo posts) / "Plantilles". Copy makes clear the blog-clone imports
   look+features, not content.
4. Studio manages everything after: modules toggle in Mòduls tab (ships),
   layout/tokens in Studio (ships).

Estimate: detection 0.5-1d · layout matching 1-1.5d · onboarding card 0.5d.
Risk: heuristic false positives → always show detections as PRE-CHECKED
suggestions the user confirms, never silent enables.

## Risks

- Real console output needs OPENAI_API_KEY + WA_AGENT_MODEL (WA_MOCK_AGENT
  covers dev/demo).
- Console deliberately avoids Kapso — none of the [[whatsapp-kapso-runtime-gotchas]]
  apply to it; they still apply to the phone channel.
- Moving config out of Settings: mitigated with pointer card.
