<!-- /autoplan restore point: ~/.gstack/projects/victormasip-carma/main-autoplan-restore-20260609.md -->
# Headless / Trojan Horse Pivot — Chrome Engine ⊥ Content Engine Decoupling

**Branch:** main · **Commit at intake:** f9a22bd · **Author:** Víctor Masip · **Date:** 2026-06-09
**Status:** PLAN — under /autoplan review. No code yet.

## Strategic context (from the directive)

Carma is pivoting the MVP to a **"Headless / Trojan Horse" distribution model**. Instead of
(only) hosting the standalone cloned blog at `/render`, Carma's content engine should be
consumable through three distribution vehicles:

1. **HTML cloner** — the existing `/render` + `/embed` script-tag path (plain-HTML sites).
2. **Lightweight WordPress plugin** — drops Carma content natively into a WP theme.
3. **WhatsApp Content Hub** — pushes/serves content through WhatsApp.

## The engineering directive (as stated)

1. **Decouple** the render engine into a **"Chrome Engine"** (the client's cloned
   header/footer/head) and a separate **"Content Engine"** (blog feed, articles, smart modules).
2. Let **headless clients request just the Content payload securely**, without the Chrome baggage.
3. **Clean up obsolete `42703` (undefined-column) fallbacks** now that migrations 022–025 are live.
4. Maintain **strict CSS inheritance (`--ct-*` tokens)** with **zero breaking changes** to existing
   standalone sites.

---

## What already exists (code-grounded, audited 2026-06-09)

> This section is the single most important input to the review. The directive's framing
> ("massive monolith that tightly couples Chrome and Content") is **only half true**, and the
> half that's false changes the scope dramatically.

### The Content Engine already exists as a reuse boundary

`src/lib/render/theme.ts` (1276 lines) already separates the two concerns at the **function**
level, even though they live in **one file**:

| Concern | Functions | Output |
|---|---|---|
| **Content** (blog) | `listingBlogInner`, `articleBlogInner`, `buildCard`, `buildTemplateCss`, `renderBlogHost`, `fragmentCss` | `.carma-root` markup + `--ct-*` token CSS |
| **Chrome** (clone) | `regionHtml`, `parseRegion`, `stitchChrome`, `buildHead`, `sanitizeInjectedHead`, `buildPageResetCss`, `buildHostGuardCss`, `CONTRAST_GUARD` | injected client head/header/footer (light DOM) |
| **Smart Modules** | `src/lib/render/modules.ts` (957 lines) — `buildListingModuleParts`, `buildArticleModuleParts` | token-inheriting `.carma-mod-*` parts, woven into Content |

Two **already-distinct** public output paths prove the seam:

- `buildListingPage` / `buildArticlePage` → **Chrome + Content** stitched into one standalone doc.
- `buildListingFragment` / `buildArticleFragment` → **Content ONLY** (`{ css, html, fonts }`),
  no chrome. Source comment (theme.ts:1216): *"The embed ships ONLY the Carma blog... we
  deliberately do NOT inject the captured site's chrome."*

### Headless content-payload delivery already exists

- `GET /render/[siteId]?format=fragment` and `GET /render/[siteId]/[slug]?format=fragment`
  return the **content-only** fragment JSON over CORS (`FRAGMENT_CORS`, `OPTIONS` preflight).
- `GET /embed/[siteId]` serves a dependency-free loader `<script>` that fetches the fragment
  and renders it into a Shadow DOM on the customer's page (token-driven CSS isolated both ways).
- `embedParams.ts` already provides a stable, validated token-override contract
  (`PARAM_MAP`, `applyParamsToTokens`, `isSafeValue`).

**Implication:** directive items (1) and (2) are largely **already shipped** for the
HTML-cloner vehicle. The real gaps are (a) physical file split for maintainability, and
(b) **distribution-vehicle-specific payload contracts** the current fragment does NOT yet serve.

### The `--ct-*` inheritance + isolation invariant (must be preserved)

- `buildTemplateCss` emits `--ct-*` on `:root`; `renderBlogHost`/`fragmentCss` rebind to
  `:root,:host` so tokens resolve inside the Shadow DOM. Modules read only `--ct-*`.
- Isolation model: **Content → Shadow DOM**, **Chrome → light DOM**. Load-bearing invariant
  (see `render-pipeline` agent memory + `npm run test:render` stress suite).
- Any split MUST keep: shadow wrapping, `:root→:host` rebind, the `!important` reset wall,
  and `stitchChrome` server-side balancing.

### The `42703` fallback surface (directive item 3)

~20 fallback sites keyed on Postgres `42703` (undefined column) across migrations
008, 009, 011, 012, 014, 021, 022, 023, 024, 025. Concrete locations:

- `src/app/render/[siteId]/route.ts:56`, `src/app/render/[siteId]/[slug]/route.ts:53,151`
- `src/app/dashboard/page.tsx:31,86`, `src/app/dashboard/sites/[id]/page.tsx:32`
- `src/lib/actions/{posts,theme,sites,locales,modules,onboarding}.ts`
- `src/lib/sites/subdomain.ts:4`, `src/app/api/import/articles/route.ts:501`
  (note: this one also matches on `message.includes('column')`, broader than a pure 42703)

⚠️ **Risk flag:** prior session memory (`onboarding-funnel-overhaul`, `smart-modules-paywall`,
`backend-security-perf-audit`) recorded migrations 019–025 as **PENDING manual run**. The
directive now asserts 022–025 are live and the schema is fully synced. Removing a fallback is
effectively irreversible against any environment where the migration is NOT actually applied
(the graceful degradation becomes a hard 500). This needs explicit confirmation per environment.

---

## Proposed work (rough — to be shaped by review)

### A. Physical engine split (maintainability, low architectural risk)
- Extract `src/lib/render/chromeEngine.ts` (head injection, region resolution, stitch, guards)
  and `src/lib/render/contentEngine.ts` (blog markup + token CSS) from `theme.ts`.
- `theme.ts` becomes a thin assembler re-exporting `buildListingPage`/`buildArticlePage`/
  `*Fragment` so all call sites and the test suite keep working unchanged.

### B. Headless Content payload contract (the genuinely new work)
- Define what each vehicle needs from the Content Engine:
  - **WordPress plugin** — likely server-rendered Content HTML + scoped CSS to inject into a
    WP shortcode/block, OR a structured posts JSON the plugin templates itself. (Open question.)
  - **WhatsApp Content Hub** — almost certainly NOT HTML; needs text/markdown + image URLs +
    deep links. A different payload shape entirely. (Open question.)
- Decide whether these are new `format=` variants on `/render`, or dedicated endpoints
  (`/api/content/...`), and the auth model (API key vs public CORS).

### C. `42703` fallback cleanup (mechanical, risk-gated on migrations truly live)
- Remove the dual-select retries once each migration is confirmed applied in every environment.

### D. Preserve `--ct-*` + isolation with zero standalone regressions
- Keep the stress suite green; add coverage for any new payload format.

---

## Open premises to challenge (for the review)

- **P1.** "The render engine is a monolith that tightly couples Chrome and Content." → The
  coupling is physical (one file), not logical (the fragment path already excludes chrome).
- **P2.** "We must decouple to support headless clients." → Headless content delivery already
  works via `format=fragment` + `/embed`. The new vehicles (WP, WhatsApp) need **payload
  contracts**, not necessarily an engine rewrite.
- **P3.** "Migrations 022–025 are live, schema fully synced." → Contradicts prior session memory;
  must be confirmed before removing any `42703` fallback.
- **P4.** "Zero breaking changes to standalone sites." → Achievable iff the split is a pure
  refactor behind the existing public function signatures + the stress suite stays green.

---

## Phase 1 — CEO Review (Strategy & Scope)

**Mode:** SELECTIVE EXPANSION. **Dual voices:** Codex unavailable (binary not installed) →
`[subagent-only]` degradation. Claude CEO subagent ran (independent, foreground).

### 0A — Premise challenge (the load-bearing output)

| Premise | Verdict | Evidence |
|---|---|---|
| P1 "monolith tightly couples Chrome+Content" | **Half-false** | Coupling is physical (one 1276-line file), not logical. `*Fragment` path already excludes chrome by design (theme.ts:1216, 1235-1253). |
| P2 "must decouple to support headless clients" | **False as stated** | Headless content delivery already ships: `format=fragment` JSON over `FRAGMENT_CORS` + `/embed` loader → Shadow DOM. The gap is per-vehicle **payload contracts**, not an engine rewrite. |
| P3 "migrations 022–025 live, schema fully synced" | **Unconfirmed / contradicts memory** | Prior sessions recorded 019–025 as PENDING. Removing `42703` fallbacks turns graceful degradation into hard 500s on any unmigrated env. Verified load-bearing at `render/[siteId]/route.ts:56`. |
| P4 "zero breaking changes to standalone" | **True & achievable** | Pure refactor behind existing signatures + `npm run test:render` green. The only low-risk, verifiable item. |

### 0B — Existing-code leverage map

| Sub-problem | Already exists | New work |
|---|---|---|
| Chrome/Content separation | Functional seam in theme.ts; two output paths | Physical file split (cosmetic, no customer value) |
| Headless content payload | `format=fragment` `{css,html,fonts}` + CORS + `/embed` | Vehicle-specific contracts (WP, WhatsApp) |
| Token isolation | `--ct-*` on `:root,:host`, Shadow DOM, stress suite | Preserve; cover new formats |
| Migration fallbacks | ~20 `42703` retries | Removal gated on per-env confirmation |

### 0C — Dream-state delta
- CURRENT: one working vehicle (JS embed) + standalone `/render`. Content engine already reusable.
- THIS PLAN (as written): file split + WP plugin + WhatsApp + fallback removal — three products under one noun.
- 12-MONTH IDEAL: one distribution channel customers actually adopt, with the clone-the-look
  wedge intact. Embed today throws the wedge away (chrome excluded) — so "headless" alone is generic.

### 0C-bis — Implementation alternatives (never weighed in the original plan)

| Approach | Effort (human / CC) | Risk | Customer value |
|---|---|---|---|
| **A. All three vehicles + engine split + fallback cleanup** (as written) | ~weeks / days | High (WhatsApp Meta approval, WP support load, P3 500s) | Diffuse, mostly internal |
| **B. WordPress only = thin shortcode/block wrapping the existing `/embed` script** | ~days / hours | Low (reuses shipped isolation) | One real channel, fast |
| **C. Distribution/onboarding only, no engine touch** | ~days / hours | Lowest | Tests demand before building |

### 0.5 — CLAUDE SUBAGENT (CEO — strategic independence) `[subagent-only]`
- **C1 (critical):** Three vehicles = three unrelated products (PHP/WP.org queue; Meta BSP +
  template approval + per-msg cost; shipped JS embed). MVP shipping three half-vehicles ships zero.
- **C2 (critical):** Cut WhatsApp — token isolation (the moat) is worthless on WhatsApp; it needs
  none of the render engine. No customer asked. Cheaper syndication test = RSS/email.
- **H2 (high):** Altitude inverted — engine split + fallback cleanup are hygiene; the only revenue
  lever (WP plugin) is the least-specified item. Re-title "WordPress distribution vehicle."
- **H3 (high):** Cut Section C (42703) — only destructive change, gated on unconfirmed P3, zero
  customer value, pure outage risk.
- **H4 (high):** WP plugin is a permanent liability (PHP churn, WP.org treadmill, support, XSS/SSRF
  surface pulling remote HTML into authed WP admin). Default to the THIN form (shortcode → existing
  `/embed`), not server-rendered HTML injection.
- **M1 (medium):** Embed competes as a generic widget (Elfsight/headless CMS) minus the clone-the-look
  wedge it deliberately discards. Name the wedge before building.

### CEO DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Claude-subagent  Codex      Consensus
  ──────────────────────────────────── ───────────────  ─────────  ─────────
  1. Premises valid?                   NO (P1/P2/P3)     [unavail]  FLAGGED (1-voice critical)
  2. Right problem to solve?           NO — reframe      [unavail]  FLAGGED
  3. Scope calibration correct?        NO — cut to 1     [unavail]  FLAGGED
  4. Alternatives explored?            NO (B/C missing)  [unavail]  FLAGGED
  5. Competitive risks covered?        NO (M1)           [unavail]  FLAGGED
  6. 6-month trajectory sound?         NO                [unavail]  FLAGGED
```
Codex missing → single-voice. Every critical/high flagged regardless per degradation rule.

### NOT in scope (deferred pending gate)
- WhatsApp Content Hub → one-pager, not a workstream (subagent C2).
- `42703` fallback removal → separate hygiene task, gated on per-env `information_schema` check (H3/P3).

### USER CHALLENGE (never auto-decided — goes to gate)
Both the primary audit and the independent subagent agree the stated 3-vehicle / decouple-first
direction should narrow to **WordPress-only, thin wrapper around the already-working `/embed`**.
This reverses the plan's framing, so it is the user's call.

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Run dual voices | Mechanical | P6 | Always run both | — |
| 2 | CEO | Codex → subagent-only | Mechanical | — | Binary not installed | — |
| 3 | CEO | Vehicle scope (3→1) | **User Challenge** | — | Both voices: 3 half-vehicles ship zero; reframe to WP-only | held for gate |
| 4 | CEO | WhatsApp cut | **User Challenge** | — | No render-engine benefit; Meta cost; no demand | held for gate |
| 5 | CEO | Section C (42703) defer | **User Challenge** | P3 | Destructive, gated on unconfirmed migrations | held for gate |
| 6 | CEO | Engine split = pure refactor | Mechanical | P4 | Behind existing signatures + stress suite | — |
| 7 | CEO | **GATE: vehicle scope** | User Challenge → **resolved** | — | User chose **WordPress-only, thin /embed wrapper** | 3-vehicle / split-first |
| 8 | CEO | **GATE: 42703 cleanup** | User Challenge → **resolved** | — | User chose **cut from this cycle, gate later** | remove-now |

---

## ✅ GATE OUTCOME — LOCKED SCOPE (2026-06-09)

Premise gate passed. The cycle is **re-framed** from "decouple the render engine for three
headless vehicles" to:

> **Ship ONE WordPress distribution vehicle: a thin plugin that drops the EXISTING `/embed`
> script onto a WP site via a shortcode + Gutenberg block. Reuse all shipped isolation. Touch
> the render engine only insofar as the plugin actually requires it (expected: ~none).**

**IN scope this cycle**
- A WordPress plugin (`carma-blog`) exposing: a settings screen (site ID/subdomain + base
  origin), a `[carma_blog]` shortcode, and a Gutenberg block — all emitting the `/embed/<siteId>`
  `<script>` with optional `--ct-*` token overrides via the existing `PARAM_MAP`.
- Any MINIMAL `/embed` loader change needed for the WP context (mount target, multiple
  instances per page, CSP/nonce friendliness). To be confirmed in Eng phase — may be zero.
- Plugin DX: install → blog visible in < 5 min; copy-paste-free config; actionable errors.

**OUT of scope (deferred, with rationale)**
- WhatsApp Content Hub → **one-page spec only** (no render-engine benefit; Meta BSP cost; no
  demand signal). Cheaper syndication test if needed: RSS/email.
- `chromeEngine.ts`/`contentEngine.ts` physical split → only if the plugin forces it; otherwise
  a separate maintainability task. No customer-visible value on its own.
- `42703` fallback removal → separate hygiene task, each removal gated behind a per-environment
  `information_schema` check. Not in this cycle.

**Preserved invariants (non-negotiable)**
- `--ct-*` token inheritance via `:root,:host`; Content in Shadow DOM, Chrome in light DOM.
- `npm run test:render` stays green. Standalone `/render` output byte-unchanged.

---

## Phase 2 — Design Review

**UI scope: LOW.** The plugin's only first-party UI is a WordPress **admin settings screen**,
which uses WP's own `settings_fields`/`form-table` admin design language (not Carma's design
system) — so Carma's `--ct-*`/design-system review surface does not apply. The rendered blog
on the front end is the **already-designed** `/embed` output (covered by the existing render +
its stress suite). Examined: (1) the embed mount/insert UX in `embed/[siteId]/route.ts`
(`resolveMount` — explicit `data-carma-target`, else after script, else `<body>`); (2) the
loading/empty/error states in the loader (`showMessage` "Carregant…" / per-fragment `error`).
Nothing flagged for a net-new Carma design pass. **One handoff note for Eng/DX:** the loader's
status strings are hard-coded Catalan ("Carregant…", "No s'ha pogut carregar el blog.") — on a
non-Catalan WP install that reads as broken localization. Surface in DX.
**Design dual voices: SKIPPED** (low UI scope; WP-admin conventions + existing render govern).

---

## Phase 3 — Eng Review (Architecture, Security, Tests)

**Dual voices:** Codex unavailable → `[subagent-only]`. Independent senior WP-plugin engineer ran.

### Architecture (ASCII)
```
  WP page (front end)                         Carma origin
  ┌────────────────────────────┐             ┌─────────────────────────────┐
  │ [carma_blog] shortcode      │             │ GET /embed/<siteId>         │
  │  └─ render() ──────────────────emits──►   │  → loader <script> (ES5)    │
  │ Gutenberg block             │             │     max-age=300, ACAO:*     │
  │  └─ render_callback ─(same fn)            └─────────────┬───────────────┘
  │                             │  browser fetch (CORS)     │
  │ <div data-carma-target> ◄── loader mounts Shadow DOM    ▼
  │   └─ #shadow-root           │             GET /render/<siteId>?format=fragment
  │       └─ {css,html,fonts}  ◄───────────────  { css, html, fonts }  (max-age=60)
  └────────────────────────────┘             (Content Engine — UNCHANGED)
  Settings screen (wp-admin): site_id + origin → register_setting (Settings API)
```
The plugin is a **pure client of the existing contract**. No Carma server-side render-engine
change required. The chrome/content engine split is therefore NOT triggered by this vehicle.

### Minimal structure
`carma-blog/` → `carma-blog.php` (header, `register_setting`, settings page, `add_shortcode`,
enqueue) · `block/{block.json,render.php}` (dynamic block, `render_callback` calls the **same**
renderer as the shortcode — one renderer, two entry points) · `readme.txt` (WP.org-mandatory).

### Findings (auto-decided per 6 principles)
| ID | Sev | Finding | Decision (principle) |
|----|-----|---------|----------------------|
| E1 | **high** | Loader mounts via `document.currentScript`; optimizer/`defer`/combine plugins (WP Rocket, LiteSpeed, Autoptimize) null it → blog renders at page **bottom**, not in place. | **FIX in plugin**: emit explicit `<div data-carma-target="#carma-{n}">` per instance; loader already honors it first. No loader change needed. (P5 explicit) |
| E2 | **critical** | `site_id`/`origin` flowing into `src` are the real XSS surface. | **FIX**: `esc_url()`/`esc_attr()` **on output every time** + `sanitize_callback` (site_id `^[a-z0-9-]+$`, origin `esc_url_raw`+https) + pin origin to a known-Carma allowlist. (P1 completeness) |
| E3 | n/a | **Cross-phase correction**: CEO voice flagged SSRF / "remote HTML into authed admin". | **REJECTED as inapplicable**: front-end script tag only, **no server-side fetch** → no SSRF, never runs in admin. Constraint: plugin must never add a server-side fragment fetch. (factual) |
| E4 | med-high | CSP/nonce-enforcing WP hosts block the external `<script>` + inline `<style>` + font `<link>` + the fragment `fetch`. Cannot be auto-satisfied (WP nonces are per-render). | **FIX**: ship a "CSP requirements" readme snippet + admin notice listing exact `script-src`/`style-src`/`font-src`/`connect-src` directives. (P1) |
| E5 | **high** | 3 hard-coded **Catalan** status strings: `embed/[siteId]/route.ts:187,193` ("Carregant…", "No s'ha pogut…") + `render/[siteId]/route.ts:34` ("Site no trobat"). Reads as broken on ES/EN WP. | **FIX**: pass WP `get_locale()` as `&ui=<locale>`; `buildScript` + fragment 404 select strings from a small dict, default Catalan. (P1) |
| E6 | med | Two embeds of the SAME site on one page → identical `src` may be deduped by combiners → lost instance. | **FIX**: plugin appends a per-instance no-op param so URLs differ; document as edge case. (P3) |
| E7 | med | Loader `max-age=300` / fragment `max-age=60` + WP page cache → settings/content changes lag. | **DOC**: "flush WP cache after changing settings"; don't promise instant. (P6) |
| E8 | med | Empty `site_id` → `src=".../embed/"` → broken Catalan error to visitors. | **FIX**: refuse to emit script when site_id empty/invalid; show admin notice instead. (P5) |

### Test plan → written to disk
`~/.gstack/projects/victormasip-carma/main-test-plan-20260609.md` — 11 codepaths (9 PHP, 2 JS)
+ the no-regression invariant set (`npm run test:render` green, standalone `/render` byte-unchanged).

### ENG DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Subagent   Codex      Consensus
  ──────────────────────────────────── ─────────  ─────────  ─────────
  1. Architecture sound?               YES (pure client) [unavail]  CONFIRMED (1-voice)
  2. Test coverage sufficient?         YES (11 paths)    [unavail]  CONFIRMED
  3. Performance risks addressed?      YES (cache noted) [unavail]  CONFIRMED
  4. Security threats covered?         YES (E2 real; SSRF rejected) [unavail] CONFIRMED
  5. Error paths handled?              PARTIAL (E5/E8 to fix)       [unavail] FLAGGED → in scope
  6. Deployment risk manageable?       YES (zip + WP.org later)     [unavail] CONFIRMED
```

### NOT in scope (Eng) · What already exists
- NOT: any change to `theme.ts`/`modules.ts` Content Engine, or `/render` route logic.
- EXISTS: full `/embed` loader, `format=fragment` payload, `PARAM_MAP` overrides, CORS.

---

## Phase 3.5 — DX Review (the heart of this vehicle)

**Dual voices:** `[subagent-only]`. Product type = **WordPress plugin** (site-owner + developer user).

### Developer journey (install → blog live)
1. Install + activate plugin → 2. Settings → Carma → 3. **paste site ID** (friction) →
4. Save → 5. add `[carma_blog]`/block to a page → 6. publish + view. **~6 steps; TTHW gated by step 3.**

### Findings (auto-decided)
| ID | Sev | Finding | Decision |
|----|-----|---------|----------|
| DX1 | **high** | TTHW friction = shortcode syntax + site-ID lookup. | **FIX**: make the **Gutenberg block the hero path** (no syntax) with an editor live preview; ship `[carma_blog]` as secondary. (P1) |
| DX2 | **high** | Site ID is a UUID/subdomain copy-pasted from another tab — the worst step. | **FIX (best)**: "Connect to Carma" → small new `GET /api/account/sites` behind existing auth → **site dropdown**, zero UUID copy. **FIX (cheap)**: dashboard "WordPress" tab reusing the existing embed-snippet UI, pre-filled. Also accept the **subdomain label** (route resolves both). (P1/P5) |
| DX3 | **high** | Error messages not actionable (wrong ID → bare Catalan "Site no trobat"; bad origin → silent blank). | **FIX**: admin-side `wp_remote_head({origin}/embed/{id})` on save → "Connected ✓"/red actionable notice; localize (E5); render front-end error **only** for `manage_options`, fail-to-empty for visitors. (P1) |
| DX4 | med | WP.org realities: `readme.txt` mandatory + strict; SVN publish + days-to-weeks review queue; no free auto-update off-WP.org. | **PLAN**: ship a downloadable **zip from the Carma dashboard** at launch (unblocks queue); move to WP.org for the auto-updater once review clears. (P6) |

### DX Scorecard (0-10)
TTHW 6/10 (→ 9/10 with DX2 dropdown) · API/naming 8/10 (`[carma_blog]` guessable) · Errors
4/10 (→ 8/10 with DX3) · Docs 5/10 (readme + CSP snippet needed) · Upgrade 6/10 (zip→WP.org).
**Overall 6/10 now → 8/10 with DX1-DX3.** Target TTHW: **< 5 min** via block + site dropdown.

### DX DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Subagent   Codex      Consensus
  ──────────────────────────────────── ─────────  ─────────  ─────────
  1. Getting started < 5 min?          NO→YES w/ DX2     [unavail]  FLAGGED → in scope
  2. API/CLI naming guessable?         YES               [unavail]  CONFIRMED
  3. Error messages actionable?        NO (DX3)          [unavail]  FLAGGED → in scope
  4. Docs findable & complete?         PARTIAL (readme)  [unavail]  FLAGGED → in scope
  5. Upgrade path safe?                YES (zip→WP.org)  [unavail]  CONFIRMED
  6. Dev environment friction-free?    PARTIAL (site ID) [unavail]  FLAGGED → DX2
```

---

## Cross-phase themes
- **Localization of status strings** surfaced in BOTH Design (handoff note) and Eng (E5) and DX
  (DX3). High-confidence signal — the 3 Catalan strings are the most visible defect for the
  ES/EN target market. Fix once, benefits all three.
- **Site-ID lookup friction** is the single biggest adoption lever (DX2) and shapes whether a
  small new Carma API (`/api/account/sites`) is worth adding this cycle.

## Decision Audit Trail (continued)
| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|----------------|-----------|-----------|
| 9 | Eng | Plugin = pure /embed client, no engine change | Mechanical | P4 | Reuses shipped contract |
| 10 | Eng | Explicit mount div + data-carma-target (E1) | Taste→auto | P5 | Removes currentScript hazard |
| 11 | Eng | esc-on-output + Settings-API nonce/cap + origin allowlist (E2) | Mechanical | P1 | Real XSS surface |
| 12 | Eng | Reject SSRF flag (E3) | Mechanical | — | No server-side fetch in design |
| 13 | Eng | Localize 3 status strings (E5) | Mechanical | P1 | Market-visible defect |
| 14 | DX | Block = hero path (DX1) | Taste→auto | P1 | Lowest-friction install |
| 15 | DX | Kill site-ID copy-paste (DX2) | **Taste** | P5 | Dropdown (new API) vs dashboard tab — surfaced at gate |
| 16 | DX | Admin connectivity check + localized errors (DX3) | Mechanical | P1 | Actionable failure |
| 17 | DX | Launch via dashboard zip, WP.org later (DX4) | Taste→auto | P6 | Unblocks review queue |

---

## Implementation Tasks (aggregated across phases)

- [ ] **T1 (P1, human ~2d / CC ~2h) — wp-plugin** — `carma-blog.php`: Settings API (`register_setting`
  site_id+origin, sanitize_callback, nonce/cap), `[carma_blog]` shortcode emitting explicit mount
  div + `data-carma-target` + esc_url'd `/embed` script. *(E1, E2, E8)*
- [ ] **T2 (P1, human ~1d / CC ~1h) — wp-plugin** — Dynamic Gutenberg block sharing T1's renderer;
  block is the hero path with editor live preview. *(DX1)*
- [ ] **T3 (P1, human ~0.5d / CC ~30m) — render** — Localize the 3 status strings via `&ui=<locale>`
  param: `embed/[siteId]/route.ts:187,193`, `render/[siteId]/route.ts:34`. *(E5, DX3)*
- [ ] **T4 (P1, human ~1d / CC ~1h) — wp-plugin** — Admin connectivity check (`wp_remote_head`) +
  actionable, localized errors; front-end error gated to `manage_options`. *(DX3)*
- [ ] **T5 (P2, human ~0.5d / CC ~30m) — wp-plugin/docs** — `readme.txt` + CSP-requirements snippet
  + admin notice. *(E4, DX4)*
- [ ] **T6 (P2 — DECIDED: dropdown) — carma-api + wp-plugin** — Add `GET /api/account/sites` behind
  the existing auth; plugin "Connect to Carma" button → site-name dropdown (zero UUID copy-paste).
  Plugin also accepts the subdomain label as a manual fallback. *(DX2 — user chose best-UX dropdown
  at final gate, +1-2d over the dashboard-tab option.)*
- [ ] **T7 (P3, human ~0.5d / CC ~30m) — wp-plugin** — Per-instance cache-buster param + multi-instance
  test; "flush WP cache" doc. *(E6, E7)*
- [ ] **T8 (P1) — tests** — Implement the 11-codepath test plan at
  `~/.gstack/projects/victormasip-carma/main-test-plan-20260609.md`; keep `npm run test:render` green.

## Deferred to TODOS
- WhatsApp Content Hub → one-page spec (no engine benefit; Meta cost; no demand).
- `chromeEngine.ts`/`contentEngine.ts` physical split → only if a future vehicle forces it.
- `42703` fallback removal → gated behind per-env `information_schema` checks.

---

## GSTACK REVIEW REPORT
- **Pipeline:** /autoplan · CEO → Design → Eng → DX · all phases single-voice `[subagent-only]`
  (Codex binary not installed).
- **Gates:** premise gate PASSED with reframe (3 vehicles → WordPress-only thin wrapper; 42703
  cleanup cut). 2 User Challenges resolved by user.
- **Outcome:** scope locked; 17 decisions logged; 1 taste decision (DX2/T6) open at final gate.
- **Artifacts:** this plan; test plan (`main-test-plan-20260609.md`); restore point
  (`main-autoplan-restore-20260609.md`).
- **Verdict:** plan is buildable. Critical security item E2 + interop item E1 must land in T1.
- **STATUS: APPROVED (2026-06-09).** Scope locked WordPress-only; T6 resolved → "Connect to Carma"
  dropdown (`GET /api/account/sites`). Build order: T1 → T3 → T4 → T2 → T6 → T5 → T7, T8 alongside.
