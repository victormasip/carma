# EL PES — performance on every single page

**Status:** W1–W7 + F1 SHIPPED 2026-09-18 · W8 open · **Opened:** 2026-09-18
**Predecessors:** `2026-07-06-tech-debt-audit.md`, `2026-09-16-super-mvp-master-plan.md`
**Gate this plan must never break:** `npm run test:landing`, `test:render`, `test:brand`, `test:fidelity`
**Gates this plan SHIPPED:** `npm run test:perf` (bytes, every commit) · `npm run test:vitals` (recorded LCP/CLS/TBT, before a release)

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
| **`/login`** | ~~135.5KB~~ → **33.7KB** | 26.7KB | 6 | ✅ **W4** |
| **`/registre`** | ~~135.5KB~~ → **33.7KB** | 26.7KB | 6 | ✅ **W4** |
| `/reset-password` | ~~84.4KB~~ → **23.2KB** | 26.7KB | 5 | ✅ **W4** |
| `/preview` | ~~83.8KB~~ → **22.3KB** | 26.7KB | 5 | ✅ **W4** |
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

### F1 — 262KB of an HTML parser is shipped to the browser · `/edit` · **~95KB gzip** — ✅ GONE

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
> **F1 finished 2026-09-18.** `navEdit.ts` turned out to have exactly one
> consumer — `NavEditor.tsx`, a client component — so the header comment claiming
> it "runs on client or server" was half wrong and wholly expensive. It is a
> browser module now, parsing with `DOMParser`: the same parser the page was
> built with, so it agrees with the browser about malformed third-party markup by
> construction. `node-html-parser` is **orphaned from every client chunk, lazy
> ones included** — the 82.3KB entity-table chunk no longer exists.

### F3 — 40KB of framer-motion to fade in a login form · `/login`, `/registre` — ✅ SHIPPED (W4)

`src/components/ui/AuthPanel.tsx:5` and `src/components/ui/auth-card-shell.tsx:4`
import `framer-motion`. The chunk is **39.8KB gzip / 121KB raw**. The entire app
elsewhere animates with CSS — `landing.css` runs 17 scroll timelines and a whole
motion system on **zero** JavaScript.

**Shipped.** Three keyframes in globals.css — `.auth-card-in` (the same 12px
rise, 320ms and cubic-bezier framer was given), `.auth-swap` (the mode
cross-fade, replayed by `key={mode}` remounting the panel) and `.auth-pill` (the
segmented toggle, a transform transition with a little overshoot where the spring
was). framer-motion is off the auth path entirely. `ModulesManager.tsx:22` still
imports it, on `/dashboard/sites/[id]`, which is inside budget — left alone
deliberately rather than churned.

### F4 — The full Supabase client on the auth pages · `/login`, `/registre`, `/preview` · **61.6KB gzip** — ✅ SHIPPED (W4)

`@supabase/supabase-js` is **61.6KB gzip / 236KB raw** in the browser. On `/login`
and `/registre` some of it is genuinely needed (client-side sign-in). On `/preview`
it is not needed at all.

**Shipped, and it went further than the finding.** Every auth call is a Server
Action now (`lib/actions/auth.ts`) — sign-in, sign-up, the Google flow, the
recovery email, the password change, sign-out. A Server Action is an RPC
boundary, so its imports never cross into the client bundle; that is the same
property `test:perf` §2 relies on. The SDK is off `/login`, `/registre`,
`/preview` **and** `/reset-password`, where the only remaining browser need — the
legacy `#access_token=…` hash flow's `onAuthStateChange` listener — is now a
dynamic `import()` behind a check for an actual hash, so the normal PKCE path
never fetches it.

**It is also more correct.** The verifier cookie for the Google PKCE flow is now
written on the server, which is exactly where `/auth/callback` needs it; the
browser flow worked because that cookie *happened* to be readable server-side.

**A regression caught on the way.** The first cut replaced the SDK's local
session read with a `hasSession()` Server Action on mount — fewer bytes, but a
POST round trip behind a full-screen loader before the form appeared, for the
logged-out visitor who is almost everyone on that page. Fewer bytes and a slower
form is not a win. The check moved into the server render instead (see
`components/ui/AuthRoute.tsx`): a signed-in visitor is redirected before a form
exists, everyone else gets the form in the first response, and the loader is
gone entirely.

### F5 — Every route downloads the landing's motion layer · **all 22 routes** — ✅ SHIPPED (W3)

`globals.css` line 6: `@import "./landing.css"`. That is 873 lines of scroll
timelines, the gold thread, the living knot and the WhatsApp demo — **on the
dashboard, the editor, the admin panel and the auth pages**, which render none of
it. CSS is a flat **29.9KB gzip on every single route**.

**Shipped, and the estimate above was wrong — worth recording.** `landing.css` is
imported by `components/marketing/LandingPage.tsx` now, so Next emits it as that
route's own stylesheet (19KB raw / 4.4KB gzip) and nobody else asks for it.
Verified mechanically before the move: of the 55 class names landing.css defines
and globals.css does not, **exactly zero** are used outside `components/marketing/`.

The saving is **29.9KB → 26.7KB gzip**, not the ~12KB predicted. The prediction
was made by eye from a raw-size ratio; landing.css is repetitive and gzips to
almost nothing next to Tailwind's utility layer, which is what the remaining
26.7KB actually is (126.9KB raw of the 168KB sheet). Real, and 3.2KB × 21 routes,
but a tenth of the guess. **Per-route CSS splitting is a wave of its own** — one
sheet is how Tailwind v4 and Next ship CSS by default.

### F6 — Zero `next/image`, and the dashboard's images are raw originals — ✅ SHIPPED (W5)

`next/image` usage: **0**. The *public renderer* is fine — it has a real, hardened
optimizer at `/api/img` (WebP/AVIF, resize, `s-maxage=31536000, immutable`, SSRF
guard) and emits `<picture>`/`srcset`. But the **product's own** `<img>` tags bypass
it: `SiteGrid.tsx:150` (site logos), `ArticleCard.tsx:205` (featured images),
`ImportModal.tsx:505` (import previews), `CommunityWall.tsx:114` (wall covers, on the
landing) all hot-link full-size originals. A 3MB customer JPEG is loaded at 44×44 in
the sidebar.

**Shipped.** `lib/images/url.ts` is the React-side counterpart to
`lib/render/image.ts` — a separate, dependency-free file on purpose, because the
renderer's version imports `node-html-parser` and one convenient import would put
82KB of entity tables straight back in the browser. `optimizedImg()` returns
`{src, srcSet, sizes}` for anything absolute-http(s) or `data:`, and `{src}`
untouched for everything else, so a call site never branches.

Applied to the site logos (SiteGrid + SiteSwitcher), the article thumbnails, the
import preview and the landing's community wall.

**The finding under-counted by more than half.** A manual grep found four raw
`<img>` tags; the mechanical check added to `test:perf` §5 found **thirteen**.
Nine of those are deliberate and are now allow-listed WITH REASONS rather than
silently skipped — the editor's are a workspace showing blob:/data: URIs
mid-upload (a round trip to /api/img would be slower than bytes already in
memory, and a transformed preview misrepresents what gets published), and
StudioDemo's are our own pre-sized `/studio/*.webp`.

### F7 — `IntegrationGuide.tsx` is 66KB of client code that never changes — ⚠️ PREMISE WAS WRONG

1,554 lines, second-largest client component in the repo, and the overwhelming
majority of it is **static code samples** (PHP, Vue, WordPress, nginx snippets)
shipped as JSX to every owner who opens the Connexió tab.

**Measured before refactoring, and the refactor was not worth doing.**
`IntegrationGuide` is imported by `ApiDocsCard`, which `SiteDetailClient` already
lazy-loads — so it sits in a **19.2KB gzip chunk that is not on any route's
critical path**, and no owner downloads it unless they open the Connexió tab.
The finding was written from a source-size sweep (1,554 lines, 66KB of .tsx) and
never checked against the bundle.

Turning 1,554 lines with ten `useState` hooks into a server shell plus islands,
to save bytes nobody on a critical path is paying, is the kind of work that looks
like progress. Left alone, deliberately.

---

## 4 — The budgets

Every route gets a number, enforced in CI. Targets are deliberately reachable, hard
limits are where we refuse to ship.

The first version of this table was written **before anything was measured** —
25KB for an auth page, 20KB of CSS everywhere. After W1–W4 landed, those figures
were still 9KB and 7KB below what the routes actually weigh, and a gate that
warns forever about a number nobody intends to reach is a gate people learn to
scroll past. So the budgets in `tests/perf.mjs` are now **achieved + headroom**,
and this table records both.

| Class | Routes | achieved | target | hard | CSS |
|---|---|---:|---:|---:|---:|
| Marketing | `/` | 35.4KB | 40KB | 55KB | 33/36 |
| Auth | `/login`, `/registre`, `/reset-password` | 33.7KB | 36KB | 48KB | 28/31 |
| Funnel | `/benvinguda`, `/preview`, `/review/[token]` | 28.9KB | 30KB | 42KB | 28/31 |
| Product | `/dashboard/**` | 33.5KB | 35KB | 45KB | 28/31 |
| Admin | `/admin/**` | 29.9KB | 32KB | 42KB | 28/31 |
| Editor | `/edit/[siteId]`, post editor | 64.8KB | 66KB | 78KB | 28/31 |

What is left is the floor of this architecture, not slack: ~27KB of CSS on every
route is Tailwind's generated utility layer for the whole app, and 33.7KB on
`/login` is lucide's icons, the modal, the brand loader and the form, with no
library left to remove. When a future wave lowers one of these for real, lower
the number with it.

Field targets, and what W7 actually recorded (Lighthouse 13.4.1, real Chrome,
Slow 4G / 4× CPU — see §6.1.2):

| Metric | Landing target | measured | Product target | measured | |
|---|---:|---:|---:|---:|---|
| LCP | ≤ 1.8s | **3.77s** | ≤ 2.5s | **2.89–3.26s** | ✗ font-bound |
| CLS | ≤ 0.02 | 0.000 | ≤ 0.05 | 0.000–0.020 | ✓ |
| TBT | ≤ 150ms | 128ms | ≤ 300ms | 134–154ms | ✓ |
| Long tasks > 200ms | 0 | 0 | ≤ 1 | 0 | ✓ |
| INP | ≤ 150ms | — | ≤ 200ms | — | needs interaction, not a navigation audit |

The LCP targets were written before anything was recorded, like the byte targets
in the table above them. They are kept here as the ambition; `tests/vitals.mjs`
holds the ratchet at what is currently achieved, and §6.1.2 sets out exactly what
it would take to close the gap and why that call is not an engineer's to make.

Desktop, for scale: the landing scores **99** with an LCP of **863ms** and a TBT
of **0ms**. Everything above is the worst case, on purpose.

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

### 6.1.1 What W6 actually found — a wave that came back empty, on purpose

W6 was scoped as "the server pass": F7 plus Sweep 4's ranked list, estimated at
30–60KB across the product. **It delivered close to nothing, and that is the
result worth keeping**, because the alternative was two days of refactoring to
move bytes that were not there.

**Sweep 4, run across all 90 client components, found one candidate.** The list
of components with no hook, no handler and no browser API looked promising —
`Button` (102 loc), `CostBadge` (117), `RewardTicker`, `auth-card-shell` — until
the parent question was asked:

| component | server parents | client parents | removing `'use client'` |
|---|---:|---:|---|
| `Button.tsx` | **0** | 31 | changes nothing |
| `CostBadge.tsx` | **0** | 1 | changes nothing |
| `RewardTicker.tsx` | **0** | 1 | changes nothing |
| `auth-card-shell.tsx` | **0** | 1 | changes nothing |
| `FullscreenStudio.tsx` | 1 | 0 | **real** — done |

`'use client'` is a BOUNDARY, not a label: a component below an existing boundary
is in the client bundle whether or not it carries the directive. Only a component
a SERVER component renders can be moved, and the repo had exactly one.

**The floor is the shell, and the shell is earning it.** Every product route sits
within ~4KB of a 29.9KB shared floor, and that floor is: 14.2KB of dashboard
shell (sidebar, site switcher with search, user menu, karma widget, i18n), 7.9KB
of framework glue, 3.7KB of lucide + Toast, and change. The three locale
dictionaries together are 3.9KB of source. There is no fat there to trim without
redesigning the shell.

**So W6 shipped checks instead of changes.** `test:perf` §4 encodes Sweep 4 as a
standing invariant (it reports only candidates with a server parent, and excludes
the `error.tsx` files Next requires to be client), and §5 encodes W5. A sweep run
once tells you about today; a sweep in the gate tells you about every commit.

### 6.1.2 W7 — the recorded pass, and what a real browser said

Every test file in this repo used to open with the same confession: *"this repo
has no headless browser."* On 2026-09-18 that stopped being true. The
`chrome-devtools-mcp` plugin bundles **Lighthouse 13.4.1**, and this machine has
Chrome, so `npm run test:vitals` boots the production build and records what
actually happens.

**Throttled mobile** — Lighthouse's default Slow 4G + 4× CPU, deliberately the
worst case rather than the median visitor:

| route | score | FCP | LCP | TBT | CLS | fonts | page |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 87 | 1.52s | **3.77s** | 128ms | 0.000 | 175KB | 466KB |
| `/preview` | 92 | 1.06s | **3.26s** | 134ms | 0.020 | 175KB* | 391KB* |
| `/login` | 93 | 1.06s | **2.90s** | 154ms | 0.000 | 57KB | 275KB |
| `/registre` | 94 | 1.06s | **2.89s** | 137ms | 0.000 | 57KB | 275KB |
| `/` **desktop** | **99** | 383ms | **863ms** | **0ms** | 0.000 | | |

\* `/preview` embeds the cloned site in an iframe, so its byte totals include the
previewed blog's assets, not only Carma's chrome.

**Against §4's field targets: CLS passes everywhere. TBT passes everywhere. Long
tasks pass (three, longest 160ms). LCP misses everywhere.**

#### What LCP is actually bound by — and it is nothing a byte budget can see

It is not the network: every request on the landing finishes inside ~110ms. It is
not JavaScript bytes; six waves took care of those. The landing's gap between
first paint (1.52s) and largest paint (3.77s) is **2.25 seconds of font**.

  · **Zero `<link rel="preload" as="font">` on any route.** Next 16.2.6 emits
    none in this configuration, so every font is discoverable only after the
    browser has fetched and parsed the CSS that declares it — and on the landing
    that is the *third* stylesheet.
  · **175KB of fonts on the landing** (118KB Fraunces variable + 4×~14KB Ubuntu);
    57KB everywhere else.
  · Main-thread work totals 3.18s, of which **Style & Layout is 853ms** — the
    scroll timelines and the large rotating marks — and script evaluation is
    446ms.

CLS is 0.000 because `next/font`'s metric-matched fallback is doing its job, so
the swap costs no layout shift. It still costs LCP, because LCP is recorded when
the headline repaints in its real face.

#### Two hypotheses, tested, one wrong

**Move the font declaration into the page.** `next/font` documents preloading for
faces declared in a page or layout, and Fraunces lived in
`components/marketing/LandingPage.tsx`. Moved it to `app/page.tsx` and measured:
**no preload link appeared and LCP did not move — 3.77s, twice.** No route in the
app emits a font preload, with the font declared in a page, a layout or a
component. This is framework behaviour, not placement. **Reverted**, because
keeping a change whose stated reason the measurement refuted is how a codebase
fills up with folklore.

**Drop the `opsz` axis from Fraunces.** Measured, twice: **fonts 175KB → 118KB
(−33%), LCP 3.77s → 3.49s (−0.28s)**. Real, reproducible — and **not shipped**,
because it is a typographic decision and not an engineer's to take alone. Optical
size is what makes a display face look considered at `display-xl`.

#### The decision this leaves on the table

The landing's LCP is the price of its display face. Three options, with numbers:

| option | LCP | cost |
|---|---:|---|
| keep as it is | 3.77s | none — and desktop is 99/100 at 863ms |
| drop the `opsz` axis | 3.49s | letterforms stop adapting to size |
| `display: 'optional'` | ≈ FCP (1.5s) | first-time visitors see the fallback serif for that whole visit; the real face arrives for their next one |

Not an engineering call. The measurements are here so it can be made on evidence.

#### What shipped

`npm run test:vitals` — boots the build, audits the public routes, prints the
table, and holds a ratchet on LCP/TBT/CLS per route. Two things it does on
purpose:

  · **It is not in the commit loop.** A Lighthouse navigation is 30–60s per route
    and needs a real browser. This is a before-a-release gate; `test:perf` is the
    per-commit one.
  · **It refuses to look like a pass when it cannot run.** No Lighthouse or no
    Chrome and it says SKIPPED, loudly, and exits 0 — it must not block a build
    on a machine that lacks a browser, and it must never be mistaken for green.

It also retries once per route with a pause: `chrome-launcher`'s teardown throws
on Windows often enough that roughly one audit in three failed on a leftover
process rather than on anything about the page. A flaky gate gets muted, so the
flake is handled inside it.

**Still unmeasured: everything behind a login.** `/dashboard`, `/edit` and the
admin routes need an authenticated run, which is its own piece of work. The byte
numbers for those routes are in `test:perf`; the field numbers are not in
anything yet.

### 6.2 The waves

| Wave | Content | Est. saving |
|---|---|---|
| ~~W1 — the three lines~~ ✅ | F1 + F2 | **−228KB gzip** on `/edit` (293.1 → 64.9KB) |
| ~~W2 — the gate~~ ✅ | `tests/perf.mjs` + per-class budgets | caught 3 more defeated split points on its first run |
| ~~W3 — the shared weight~~ ✅ | F5 (route-scoped landing.css) | 3.2KB × 21 routes (not the 12KB predicted) |
| ~~W4 — the auth path~~ ✅ | F3 + F4 | **−101.8KB** on /login + /registre, **−61.5KB** on /preview, **−61.4KB** on /reset-password |
| ~~W5 — images~~ ✅ | F6 through the `/api/img` we own | 5 surfaces + a gate check that found 9 more |
| ~~W6 — the server pass~~ ✅ | F7 + Sweep 4 | **≈0KB, and that is the finding** — see below |
| ~~W7 — the recorded pass~~ ✅ | Lighthouse 13.4.1 + real Chrome, public routes | **LCP is font-bound, and no byte budget could see it** |
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
