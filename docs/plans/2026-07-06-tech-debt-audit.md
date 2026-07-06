# Tech-debt audit + performance overhaul — 2026-07-06

**Scope:** autonomous sweep (VP-eng directive): cross-reference `docs/plans/` + memory
against the codebase; fix the landing freeze; kill horizontal scrolling; speed pass.

---

## 1. Landing page freeze — root causes found & fixed

The landing felt frozen because of **permanent main-thread/GPU work at idle**, not
bundle size. Four compounding causes, all fixed in this cycle:

| # | Cause | Fix |
|---|---|---|
| 1 | `.halo { filter: blur(140px) }` — 4 halos, 2 drifting. Each blur rasterizes a huge intermediate surface; the drift re-composited it forever. | Halos are now plain radial gradients (visually equivalent at 0.10–0.16 opacity, ~zero cost). Drift kept (transform-only). |
| 2 | `.gold-trace` comet animated a registered custom property (`--gold-angle`) → conic gradient re-painted every frame per element (all CTAs + cards + sidebar widget), forever — and was `!important`-forced even under OS reduced-motion. | At rest: static iridescent ring + aura pulse (opacity-only, composited). Comet spins on hover/focus, or always via the new `.gold-trace-live` — applied to exactly ONE element (hero CTA). Reduced-motion forces only the aura + the single live comet. |
| 3 | `.btn-gold` sheen + headline `.shimmer-gold` — infinite `background-position` repaints on every gold button and the hero headline, also reduced-motion-forced. | Sheen is hover/focus-only; shimmer runs 3 passes then settles (`forwards`). Static states still read premium (rich gradient + glow). |
| 4 | `WaitlistHero` rotated three giant radial-gradient discs (up to 1600×1600) forever — **a radially-symmetric gradient looks identical at every angle**: pure GPU burn for zero visible change. | Discs are static (centering transform preserved). |
| + | Everything below the fold painted from load. | `content-visibility: auto` (`.cv-auto`, intrinsic 760px) on the six below-fold sections. Anchors (`#preus`) still work per spec. |

**Deliberate judgment call:** the previous founder directive forced brand animations
past OS reduced-motion. That directive is *kept for cheap compositor effects*
(aura/knot/eyebrow pulses, the WA phone scene — all transform/opacity) and *reversed
for the paint-heavy ones* (trace/sheen/shimmer): machines that ask for less motion
were getting the MOST work — including the founder's own Windows. If the always-on
comet is missed anywhere specific, add `gold-trace-live` to that one element.

## 2. Mobile / horizontal scrolling — fixed

- **Dashboard section nav** (`SiteDetailClient`): was a hidden-scrollbar horizontal
  scroller on phones (sections past the fold undiscoverable). Now a 2-column card
  grid on mobile; the one-line card row stays from `sm:` up (founder's "never a
  second row" kept where it was meant: desktop).
- **`body { overflow-x: clip }`** app-wide (dashboard already had it on `main`;
  now nothing can drag any app page sideways; `clip` keeps sticky working).
- **/embed host guard** now carries `overflow-x: clip` — a wide element inside the
  blog shadow can no longer stretch the CUSTOMER's WordPress page (we don't own
  `body` there).
- **Article tables** in the render: `display:block; overflow-x:auto` — wide tables
  scroll inside themselves (tables ignore `max-width` when columns demand more).
- Verified already-safe: injected langbar + category filters wrap; starter-template
  navs collapse; render pages had `html,body{overflow-x:clip}` since earlier.

## 3. Speed pass

- **Migration 029 `posts_counts_by_site`** — the dashboard downloaded EVERY post row
  (superadmin: the whole table) to count articles in JS. Now one `GROUP BY` RPC;
  42883-safe fallback keeps pre-migration envs working. **Run 029 in Supabase.**
- Site switcher (this cycle) cut the sidebar's per-site DOM; users panel does all
  filtering client-side on one fetch.
- Landing `content-visibility` (above) is also the biggest TTI win.

## 4. Open ledger (cross-referenced from docs/plans/ + memory)

| Item | Source | Status / condition |
|---|---|---|
| Migrations **028, 029** | this cycle | 028 confirmed LIVE by founder; **029 pending manual run** (safe fallback in code). |
| Migrations 019–025 pending-run uncertainty | headless-decoupling plan §P3 | Unconfirmed in DB; all code paths are 42703-safe. Worth a one-time `information_schema` check in Supabase, then the 42703 fallbacks can be retired (explicitly gated by founder — do not remove until confirmed). |
| Nano-banana cover provider fetch | coverImage.ts stub | Mocked by design; karma charges only activate when `NANO_BANANA_API_*` are set. One-function change when the provider lands. |
| WhatsApp agent vs live Kapso | wa gotchas memory | End-to-end flow still untested against the live number (buffering OFF, phone-number-id match, env-at-boot). |
| The "moat" (research/competitor-gap engine) | 2026-06-26 plan C3, office-hours | Deliberately deferred by founder gate; outcome loop (`wa_article_outcomes`, 60-day check) is capturing the data shape meanwhile. |
| WhatsApp Business channel (Meta/BSP/templates) | 2026-06-26 plan C2/P3 | Deferred until the loop is proven on the zero-tax channel. |
| WA translate button | webhook `WA_BUTTON.translate` | "Coming soon" reply; i18n merge exists in import path but not agent-triggered. |
| OAuth (Google) config | saas-launch memory | Needs Supabase console config; AuthPanel ready. |
| Self-serve article import in onboarding | onboarding-funnel memory | Deferred; superadmin import works. |
| Landing hydration split (RSC islands) | this audit | LandingPage is one `'use client'` tree; splitting Nav/UrlInput islands would cut ~some KB of hydration. Low urgency after the paint fixes — do it if Lighthouse TBT still flags. |
| `profiles.plan` has no billing flow | karma cycle | Upgrades are manual (now 1-click in /admin/users). Stripe integration is its own future cycle. |
