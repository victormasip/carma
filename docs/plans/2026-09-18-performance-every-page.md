# EL PES — performance on every single page

**Status:** W1 + W2 SHIPPED 2026-09-18 · W3–W8 open · **Opened:** 2026-09-18
**Predecessors:** `2026-07-06-tech-debt-audit.md`, `2026-09-16-super-mvp-master-plan.md`
**Gate this plan must never break:** `npm run test:landing`, `test:render`, `test:brand`, `test:fidelity`
**Gate this plan SHIPPED:** `npm run test:perf` — every route, every build

---

## 0 — Why this plan exists, and what makes it different

Carma has exactly one performance gate, and it covers exactly one page. `test:landing`
budgets the marketing page's own JavaScript and CSS, counts its idle animations and
proves it server-renders — and it works: the landing ships **35.5KB** of its own JS.

Every other route in the product is unmeasured. Nobody has ever put a number on
`/edit`, `/login`, `/dashboard` or the blog engine. This plan is the opposite of a
list of generic advice: **it is a measuring instrument, a measured baseline, seven
findings that already have evidence attached, and a method that walks every file.**

The founder's brief was "every single page, file by file". That is the right
ambition and it needs an honest method, because "read 27,602 lines of client code
letter by letter" is not a plan — it is a wish. What follows is the version that
actually finds things: **automated sweeps that read every file mechanically**,
**a real browser recording real traces**, and **a human pass on only the files the
instruments flag.** The first three findings below were found exactly this way, in
under an hour, and two of them are one-line fixes worth 240KB.

---

## 1 — The instrument

### 1.1 Installed for this plan (2026-09-18)

| Plugin | What it unlocks | Always-on cost |
|---|---|---|
| **`chrome-devtools-mcp@claude-plugins-official`** v1.9.0 | A live Chrome that **records performance traces**, network waterfalls and source-mapped console errors. Ships the `debug-optimize-lcp`, `a11y-debugging` and `memory-leak-debugging` skills. | ~804 tok |
| **`playwright@claude-plugins-official`** | Scripted multi-route runs — load all 22 rendered routes in one pass, capture metrics per route. | 0 tok (MCP) |
| **`vercel@claude-plugins-official`** v0.49.2 | 35 skills including **`cdn-caching`**, **`next-cache-components`**, **`runtime-cache`**, `turbopack`, `vercel-functions`, `routing-middleware`. This app is on Vercel with `cacheComponents: true`, and the last blog-slowness root cause was a missing `s-maxage`. | ~3,987 tok |

**Why this matters more than it sounds.** `tests/landing.mjs` and
`tests/chrome-fidelity.mjs` both open with the same confession: *"This repo has no
headless browser."* Every gate we have measures **bytes**, because bytes were all we
could measure. `chrome-devtools-mcp` ends that. LCP, CLS, INP, long tasks and the
network waterfall become things we *record*, not things we *reason about*.

### 1.2 Already installed and relevant

`web-performance-optimization`, `web-performance-audit`, `image-optimization`,
`react-best-practices` (Vercel Engineering), `nextjs` (Next 16 / Cache Components),
`seo-optimizer`, `motion`, `interaction-design`.

### 1.3 Explicitly NOT installed

The official marketplace carries **308** plugins. Installing all of them would add
tens of thousands of always-on tokens per session for Airtable, Salesforce, Oracle,
NetSuite and three hundred other things this repo will never touch — which makes
every future session slower and dumber. That is a performance regression in the tool
we use to fix performance regressions. We install what measures **this** app.

---

## 2 — The baseline, measured 2026-09-18

Own JS = this route's chunks, gzipped, **excluding** the framework floor. Floor =
`rootMainFiles` (react-dom + app-router runtime + turbopack loader): **136.3KB gzip,
identical on every route, and not ours to shrink.**

| Route | own JS | CSS | chunks | verdict |
|---|---:|---:|---:|---|
| **`/edit/[siteId]`** | ~~293.1KB~~ → **64.9KB** | 29.9KB | 16 | ✓ **W1 shipped** |
| **`/login`** | **135.5KB** | 29.9KB | 14 | ✗ a login form |
| **`/registre`** | **135.5KB** | 29.9KB | 14 | ✗ a signup form |
| `/reset-password` | 84.4KB | 29.9KB | 12 | ✗ |
| `/preview` | 83.8KB | 29.9KB | 12 | ✗ |
| `/` (landing) | 35.5KB | 30.5KB | 12 | ✓ gated |
| `/dashboard/sites/[id]` | 33.5KB | 29.9KB | 13 | ~ |
| `/dashboard/agent` | 33.5KB | 29.9KB | 13 | ~ |
| `/dashboard/*` (4 routes) | 31.7KB | 29.9KB | 12 | ~ |
| `/admin/*` (4 routes) | 29.9KB | 29.9KB | 11 | ~ |
| `/review/[token]` | 28.9KB | 29.9KB | 12 | ~ |
| `/benvinguda` | 21.8KB | 29.9KB | 11 | ✓ |

**Totals:** 90 client components, 27,602 lines of client code, 237 other modules,
10 lazy boundaries, **4** `use cache` call sites, **0** uses of `next/image`.

Reproduce with the script in §6.1. It is the first thing this plan ships, because a
number nobody can re-derive is a number nobody will defend.

---

## 3 — Seven findings that already have evidence

These were found by the sweeps in §5 before this document was written. They are not
hypotheses; each one names the file and the line.

### F1 — 262KB of an HTML parser is shipped to the browser · `/edit` · **~95KB gzip** — ✅ OFF THE CRITICAL PATH (W1)

`src/app/(app)/dashboard/sites/[id]/studio/ChromeDrawer.tsx:14` imports `NavEditor`
eagerly. `NavEditor.tsx:19` imports `@/lib/render/navEdit`, whose header cheerfully
says *"(node-html-parser, already a project dep). No DOM, runs on client or server."*
It does run on the client — and it drags `node-html-parser` and its **HTML entity
decode tables** into the bundle. The chunk is 262KB raw / **94.9KB gzip**, and
`grep` confirms the contents: `decodeHTML ×28`, `htmlDecodeTree`, `DecodingMode ×7`,
and the full named-character reference table (`&sharp;`, `&spades;`, `&hearts;`…).

It is a blocking `<script>`, for a drawer most owners never open, to pull links out
of a nav fragment — something `DOMParser` does natively for **zero bytes**.

**Fix:** `lazy()` the drawer, and give `navEdit.ts` a browser path that uses
`DOMParser`. **Two lines and a small function.**

### F2 — TipTap is lazy-loaded on one route and eager on the other · `/edit` · **~145KB gzip** — ✅ FIXED (W1)

`src/components/editor/PostEditorClient.tsx:47` does it right:
`const TipTapEditor = lazy(() => import('./TipTapEditor'))`.
`src/app/(app)/dashboard/sites/[id]/studio/StudioBodyEditor.tsx:15` does it wrong:
`import TipTapEditor from '@/components/editor/TipTapEditor'`.

So the Studio pays **144.7KB gzip / 472KB raw** of TipTap + ProseMirror as a blocking
`<script>`, before the canvas paints, for a body editor behind a drawer.

**Fix:** one line — make it match `PostEditorClient`.

> **SHIPPED 2026-09-18.** Both split points moved to the render site in
> `StudioStage.tsx` (a component cannot split itself), each behind a `<Suspense>`
> wearing the shape of what is arriving. `/edit/[siteId]` went from **293.1KB to
> 64.9KB** of own JS — **−228KB, −78%** — and from 429KB to 201KB including the
> framework floor. Both chunks still exist (144.4KB TipTap, 82.3KB entities);
> they simply load when a drawer opens.
>
> F1's second half is still open: `navEdit.ts` should use `DOMParser` in the
> browser so the entity tables are never shipped at all, not merely deferred.
> `test:perf` §2 warns about it on every run until it is.

### F3 — 40KB of framer-motion to fade in a login form · `/login`, `/registre`

`src/components/ui/AuthPanel.tsx:5` and `src/components/ui/auth-card-shell.tsx:4`
import `framer-motion`. The chunk is **39.8KB gzip / 121KB raw**. The entire app
elsewhere animates with CSS — `landing.css` runs 17 scroll timelines and a whole
motion system on **zero** JavaScript.

**Fix:** replace the auth entrance animations with the CSS the rest of the product
already uses; drop the dependency from the auth path. Audit `ModulesManager.tsx:22`
(the third importer) separately — a slide-over may keep it, lazily.

### F4 — The full Supabase client on the auth pages · `/login`, `/registre`, `/preview` · **61.6KB gzip**

`@supabase/supabase-js` is **61.6KB gzip / 236KB raw** in the browser. On `/login`
and `/registre` some of it is genuinely needed (client-side sign-in). On `/preview`
it is not needed at all.

**Fix:** (a) get it off `/preview` entirely; (b) on the auth pages, move sign-in
behind a Server Action or `import()` the client on first submit, so the form paints
before the SDK arrives.

### F5 — Every route downloads the landing's motion layer · **all 22 routes**

`globals.css` line 6: `@import "./landing.css"`. That is 873 lines of scroll
timelines, the gold thread, the living knot and the WhatsApp demo — **on the
dashboard, the editor, the admin panel and the auth pages**, which render none of
it. CSS is a flat **29.9KB gzip on every single route**.

**Fix:** move `landing.css` to a route-scoped import on the marketing tree. Expected:
~30KB → ~18KB everywhere except `/`.

### F6 — Zero `next/image`, and the dashboard's images are raw originals

`next/image` usage: **0**. The *public renderer* is fine — it has a real, hardened
optimizer at `/api/img` (WebP/AVIF, resize, `s-maxage=31536000, immutable`, SSRF
guard) and emits `<picture>`/`srcset`. But the **product's own** `<img>` tags bypass
it: `SiteGrid.tsx:150` (site logos), `ArticleCard.tsx:205` (featured images),
`ImportModal.tsx:505` (import previews), `CommunityWall.tsx:114` (wall covers, on the
landing) all hot-link full-size originals. A 3MB customer JPEG is loaded at 44×44 in
the sidebar.

**Fix:** route them through the `/api/img` we already own. No new infrastructure,
no `next/image` config, no remote-pattern allowlist — the optimizer exists.

### F7 — `IntegrationGuide.tsx` is 66KB of client code that never changes

1,554 lines, second-largest client component in the repo, and the overwhelming
majority of it is **static code samples** (PHP, Vue, WordPress, nginx snippets)
shipped as JSX to every owner who opens the Connexió tab.

**Fix:** it is a server component with one small client island for the method
picker. Same treatment the landing got in the Super MVP sprint.

---

## 4 — The budgets

Every route gets a number, enforced in CI. Targets are deliberately reachable, hard
limits are where we refuse to ship.

| Class | Routes | own JS target | own JS hard | CSS hard |
|---|---|---:|---:|---:|
| Marketing | `/` | 40KB | 60KB | 33KB |
| Auth | `/login`, `/registre`, `/reset-password` | 25KB | 45KB | 20KB |
| Funnel | `/benvinguda`, `/preview`, `/review/[token]` | 25KB | 45KB | 20KB |
| Product | `/dashboard/**` | 35KB | 55KB | 20KB |
| Admin | `/admin/**` | 35KB | 60KB | 20KB |
| Editor | `/edit/[siteId]`, post editor | 60KB | 110KB | 20KB |

Field targets (measured with `chrome-devtools-mcp`, throttled to Slow 4G / 4× CPU):

| Metric | Landing | Product routes |
|---|---:|---:|
| LCP | ≤ 1.8s | ≤ 2.5s |
| CLS | ≤ 0.02 | ≤ 0.05 |
| INP | ≤ 150ms | ≤ 200ms |
| Long tasks > 200ms | 0 | ≤ 1 |
| TBT | ≤ 150ms | ≤ 300ms |

---

## 5 — The method: how every file actually gets reviewed

Six mechanical sweeps read **100% of the source**. Each emits a ranked list. A human
pass then reads only what the sweeps flag — which is how you get file-by-file
coverage without pretending to read 27,602 lines by eye.

**Sweep 1 · The bundle truth.** For every route: parse the prerendered shell, resolve
every `<script>` and preload, gzip each chunk, subtract the framework floor, attribute
each chunk to its heaviest module. Distinguishes **blocking `<script>` from
`modulepreload`** — the distinction that exposed F2.

**Sweep 2 · Server-only code in the browser.** Grep every client component's
transitive import graph for the Node-shaped dependencies: `node-html-parser`,
`parse5`, `sharp`, `pdf-parse`, `mammoth`, `openai`, `franc-min`, `@supabase/*`
server helpers, anything under `lib/scrape`, `lib/render`, `lib/brand`, `lib/whatsapp`.
**This is the sweep that found F1**, and it is the one the landing gate already runs
for one page — generalised to all of them.

**Sweep 3 · Eager vs. lazy.** Every import of a component that renders behind a
modal, drawer, tab or route transition must be `lazy()`. **Found F2.** Cross-check
every `lazy()` actually splits by confirming its chunk is *not* a blocking `<script>`.

**Sweep 4 · The render path.** Per client component: does it need to be one? A
component with no hooks, no handlers and no browser API is a server component
wearing `'use client'`. Ranked by LOC × routes-affected. **Found F7.**

**Sweep 5 · Data and cache.** Every `page.tsx` and server module: sequential `await`s
that should be `Promise.all` (`settings/page.tsx` has 5 awaits and zero `Promise.all`),
N+1 Supabase queries, `use cache` coverage (4 call sites today), `cacheLife`
correctness, `Cache-Control` on every route handler — `s-maxage` present or the CDN
never caches and every visitor hits a lambda. Run with the `vercel` plugin's
`cdn-caching` + `next-cache-components` skills.

**Sweep 6 · Paint and layout.** Every animated property in every stylesheet and
inline style: transform/opacity are free, everything else repaints. Every
`aspect-ratio`-less image (CLS). Every `blur()` over 60px. Every idle infinite
animation. `landing.css` is already policed this way; extend it to `globals.css` and
every inline `style=`.

**Then, and only then: the recorded pass.** With `chrome-devtools-mcp`, record a
trace for all 22 rendered routes, cold and warm, throttled. Read the waterfall, the
main-thread flame chart and the layout-shift regions. This is the pass that finds
what no amount of grepping can: the request that blocks the first paint, the font
that swaps late, the handler that costs 300ms.

**Order of work per file:** measure → attribute → fix the largest attributed cost →
re-measure → record. Never the other way round.

---

## 6 — What ships

### 6.1 `npm run test:perf` — the gate, generalised — ✅ SHIPPED

`tests/perf.mjs`, modelled on `tests/landing.mjs`. Three sections:

1. **Critical-path budget**, per route, against the classes in §4. It counts only
   `<script src>` in the prerendered shell — never modulepreload, never lazy
   chunks — so a split that actually splits disappears from the number. `hard` is
   a RATCHET: today's figure rounded up, so nothing can get worse while the waves
   that lower `target` are still in flight.
2. **Server-only code in the browser**, convicting ONLY on ground truth: a
   fingerprint found inside a built chunk. On the critical path fails; in a lazy
   chunk warns. The static import graph is used only to NAME the culprit once the
   bundle has convicted it.
3. **Split points actually split.** Walks static imports from every route entry
   WITHOUT stepping through a split point; whatever it reaches is the eager set.
   A module that is `lazy()` somewhere and statically imported from the eager set
   is not split at all.

**A lesson worth keeping.** The first draft of §2 walked the import graph instead
and reported five leaks, four of them false — a client component importing a
`'use server'` module bundles nothing, and `import type` is erased at compile
time. A gate that cries wolf gets muted, and a muted gate is worse than no gate.
The bundle cannot lie; the graph can.

**It earned its place on the first run**, catching three more defeated split
points nobody had gone looking for: `ConnectAgentStep` (lazy in SiteDetailClient,
static in AgentClient) and `VoiceRecorder` (lazy in Door, static in both
BrandIntake and BrandCaptureView). All three fixed.

Without this, everything below is undone within two sprints — the same way the
landing regressed to 211KB before `test:landing` existed.

### 6.2 The waves

| Wave | Content | Est. saving |
|---|---|---|
| ~~W1 — the three lines~~ ✅ | F1 + F2 | **−228KB gzip** on `/edit` (293.1 → 64.9KB) |
| ~~W2 — the gate~~ ✅ | `tests/perf.mjs` + per-class budgets | caught 3 more defeated split points on its first run |
| **W3 — the shared weight** | F5 (route-scoped landing.css) | ~12KB × 21 routes |
| **W4 — the auth path** | F3 + F4 | ~100KB on 3 routes |
| **W5 — images** | F6 through the `/api/img` we own | LCP on 4 surfaces |
| **W6 — the server pass** | F7 + Sweep 4's ranked list | 30–60KB across product |
| **W7 — the recorded pass** | `chrome-devtools-mcp` traces, all 22 routes | the unknown unknowns |
| **W8 — data & cache** | Sweep 5's list | TTFB |

W1 and W2 are the whole plan in miniature: fix what is measured, then make it
impossible to un-fix. If only two waves ever ship, ship those.

---

## 7 — What this plan refuses to do

- **No new dependency to make things faster.** Every fix above uses something the
  repo already owns: `lazy()`, `DOMParser`, `/api/img`, CSS, server components.
- **No micro-optimisation before measurement.** No `useMemo` sprinkling, no
  `React.memo` by reflex. Sweep 1 names the cost; we fix the named cost.
- **No touching the framework floor.** 136.3KB is react-dom and the app router. It
  is the same on every route and it is not ours. Budgeting it would be budgeting
  someone else's code — the same reasoning `tests/landing.mjs` already documents.
- **No performance win that costs a brand.** The knot turns, the thread draws, the
  demo plays. The 2026-07-06 landing freeze was caused by *how* those were animated,
  never by the fact that they exist. Compositor-only, always — never "delete it".
- **No claiming a number we did not record.** Every figure in this document is
  reproducible from `.next/` on a clean build. Every field metric will come from a
  trace, or it will not be written down.
