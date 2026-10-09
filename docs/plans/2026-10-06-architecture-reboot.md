# ARCHITECTURE REBOOT — EL MIRALL (the chrome) · L'INSTANT (the render)

**Date:** 2026-10-06 (research run 2026-10-06 → 07) · **Status:** DECIDED 2026-10-09 — the founder's decisions are recorded in `2026-10-09-onboarding-mirror-and-domains.md` §0 (Wow before signup from the MIRROR; INSIDE = Premium; `carma.blog` for Free; **no** Publish-to-CMS; **no** native-JS escalation). W0 and W1 are implemented (branch `reboot/w0-w1-instant`; migration 041 awaiting its manual apply).
**Scope:** the customer's header/footer on Carma blogs ("chrome"), and load time at any data size (public blogs + dashboard)
**Supersedes:** the chrome ladder of `2026-09-20-generative-awwwards-ui.md` §9.1 (keep / harmonise / rebuild) for every customer who has a website · and specifies W8 "data & cache" of `2026-09-18-performance-every-page.md`, which was left as one line.
**No product code was written for this plan.** Five research instruments were built and run (§1.1); they live in `.grabber-cache/research/` (git-ignored) and are promoted into `tests/` in W3.

> **The chrome, in one sentence.** Stop *generating* their header and stop *guessing* it from
> their server's HTML: open their site in a real browser, keep exactly what a visitor sees
> (the markup their JavaScript built, the CSS it actually uses, every link), record what
> their menu does when it is tapped, and replay that with ~2KB of our own code — then
> *prove* it, per site, against the live site, before a single reader sees it. For
> WordPress (72% of our corpus) offer the better thing: the blog lives *inside* their own
> theme, and the question disappears.
>
> **The render, in one sentence.** Every public page costs O(page), never O(posts): 12 cards
> per crawlable page, a sitemap, CDN entries that live until a publish purges them by tag,
> pre-aggregated numbers, and a dashboard that loads the tab you opened — not all six.

---

## 0. TL;DR — what we found, what we propose, what we need from you

**What we measured** (live Chrome against the Barcelona-100 sites, plus the real engine over
the snapshot corpus — every number reproducible, §Appendix A):

| | Today | Proposed (measured on the same sites) |
|---|---|---|
| Header pixel-identical to the live site at rest, phone **and** desktop (≤ 0.5% of pixels) | **14 / 86** (16%) | **62 / 86** (72%) — 58 of them at exactly 0 differing pixels — for a script-free snapshot of the browser-built DOM |
| Header visibly broken (> 25% of its pixels wrong) | **44 / 86** (51%) | **2 / 86** genuine (14 measured; 12 are artefacts of the lab method, each inspected — §1.3) |
| Mobile menu opens and reveals its links | **10 / 86** (12%) — their scripts are stripped, the burger is dead | **66 / 74** (89%) of the menus found live, replayed with **every** live link revealed, 0 bytes of their JS |
| Header links kept by the generative rung ("rebuild") | median **35%** (6 of 16), 83/99 sites lose links | **100%** by construction — links are copied, never written |
| Footers whose legal links (Avís legal / Privacitat / Cookies) survive a rebuild | **none of 84** (unless one sits among the header's first six links) | **84 of 84** |
| JavaScript we would ship to run their menus "natively" | their homepage's: median **1.2MB in 35 files** (p90 2.65MB) | **0** of theirs — ~2KB of ours |
| Blog index | newest **100** posts, **1,730** DOM nodes, 439KB HTML; post 101+ unreachable, **no sitemap** | 12 per page: **498** nodes, 35KB gzip, constant at any N; every post in a sitemap |
| A publish | deletes **every** cached page of that blog (one tag on all pages, hard delete) | purges the post + the index pages only, by tag, at the CDN too |

**Decision 1 — the chrome (§3).** Replace the chrome ladder with a **residency ladder**:
**A · INSIDE** (the blog renders server-side inside their own WordPress theme, or under
`/blog` on their domain) → **B · MIRROR** (hosted, browser-captured, behaviour replayed,
certified per site) → **C · SAFE PANEL** (their certified header at rest + our accessible
menu holding their exact link tree, when a behaviour cannot be certified). The generative
rungs (`rebuild`, `harmonise`) are deleted for every customer who has a website.
Generation survives only where there is nothing to be faithful to (no website at all).

**Decision 2 — the render (§4).** Approve L'INSTANT: `published_at` + a partial keyset
index, numbered crawlable pages with progressive "load more", sitemaps, granular cache tags
carried to Vercel's CDN with `Vercel-Cache-Tag`, counters and daily rollups instead of
`count(*)` and 50,000-row scans, per-tab streaming in the dashboard — gated by a
scale-invariance test (N = 10,000 posts must cost what N = 100 costs).

**Three smaller decisions (§9):** move tenant blogs to a dedicated registrable domain on
the Public Suffix List; whether to offer "publish into your own CMS" as a product mode;
whether to allow their native JS on customer-owned domains as a last-resort escalation.

**Cost:** ~$0.003 of browser time per full capture (≈ $120/month for 10,000 sites
refreshed weekly) · ~11–14 engineering weeks for a small team, shippable in waves, the
first of which (W0, ≤1 week) stops the bleeding without any new infrastructure (§6).

---

## 1. What is actually broken — measured, not assumed

### 1.1 The instruments

| # | Instrument | What it does | N |
|---|---|---|---|
| I1 | **Corpus audit** | The REAL engine (`pageSplit`, `extractNav`, `captureChrome`, `compileChromeCss`) over the cached Barcelona-100 HTML + CSS (`.grabber-cache`, 65MB) | 99 sites |
| I2 | **Render weight** | The REAL renderer (`buildListingPage` / `buildArticlePage`) over each site's REAL captured chrome, with N ∈ {0, 12, 24, 100, 1000} posts | 99 sites × 5 |
| I3 | **Chrome lab** | **Live sites in real Chrome**, 390×844 and 1440×900. Three models of the header: **A** live (truth) · **B** the browser-built DOM, snapshotted, *every script removed*, served back at the original URL · **C** today's production pipeline (a faithful replica of `api/theme/analyze`: ≤24 sheets, `@import`, per-sheet URL resolution, compiler, contrast repair → `buildListingPage`). Pixel diff of the header box (B vs A, C vs A). Then: tap the burger live while a `MutationObserver` records; **replay the recorded end-state on B**; compare which links became visible and hit-testable. Hover each dropdown live vs on B. | 100 attempted · 91 measured · 86 with every model at both widths |
| I4 | **Chrome CSS coverage** | Live → snapshot → a chrome-only document (their `<head>` + header + footer) → CDP rule-usage tracking across desktop, tablet, phone and forced `:hover`/`:focus-within` on every nav item | every 3rd site: 27 of 34 measured |
| I5 | **Cross-viewport** | Can ONE captured DOM serve every width? Desktop snapshot served at 390 and 820, mobile snapshot at 1440, vs live | 55 attempted · 52 measured |

Pixel diff = share of header-box pixels whose max RGB channel differs by more than 16/255,
CSS animations disabled. "Exact" ≤ 0.5%. "Broken" > 25%.

### 1.2 The chrome: seven root causes

**R1 — We capture what the server sends; visitors see what JavaScript built.** The capture
is one static `fetch` (`api/theme/analyze/route.ts`: "no LLM, no headless browser"). Headers
that are hidden until a script reveals them, menus that a script builds (Divi), logos that a
script lazy-loads — none of that is in the HTML we read. On `dental-cambra` today's render
shows **no header at all**; the snapshot of the browser-built DOM matches the live site to
the pixel (§1.3).

**R2 — The CSS compiler is blind to states.** `chromeCompiler.ts` keeps a rule only if its
selector matches the *static* DOM. The open menu (`.toggled`, `.menu-open`, `.is-active`…)
and the sticky header (`.scrolled`, `.is-sticky`) are states a script adds, so their rules
are deleted. **47 of 99 sites lose such rules — 317 of the 1,132 rules that style their
chrome in an interactive state (28%).** Even with their JS restored, the opened menu would
render unstyled.

**R3 — The capture under-reads stylesheets.** Only `<head>` is scanned — **35 of 99 sites
declare stylesheets in `<body>`**. 46 of 99 declare more than 8 head sheets, so the
`FAITHFUL_MAX_SHEETS = 8` gate fails them: **only 31 of 97 captures pass the faithful gate**
(32%) — everyone else is sent to the generative rung.

**R4 — Their scripts: stripped where they would help, kept where they hurt.** The compiled
path strips `<head>` scripts by default (`chrome_scripts_enabled = false`), so jQuery and
the theme bundle are gone and **the burger does nothing (10 of 86 menus work, §1.3)**. But the
scripts inside the captured Top/Bottom regions are kept verbatim
(`theme.ts`: "RAW chrome KEEPS the client's scripts"): **98 of 99 captures carry customer
`<script>` tags — 1,655 external + 1,192 inline across the corpus, median 23 per site** —
served on `<sub>.carma.cat`, same-site with the app (§3.9).

**R5 — The generative rung throws information away.** `rebuildChrome` keeps the logo, the
first `MAX_LINKS = 6` links and one CTA, in one of five archetypes:

| Measured over the 99 corpus headers | |
|---|---|
| Unique header link labels | median **16**, p90 47 |
| Kept by rebuild | median **6** → retention median **35%**, p10 **9.5%** |
| Sites that lose links | **83 / 99** |
| Sites with dropdowns (all lost — rebuild has no sub-menus) | **65 / 99** (median 13 sub-links each) |
| Sites with `href="#"` parents (dropped by `absHref`) | **56 / 99** |
| Footers with legal links (Avís legal / Privacitat / Cookies) — replaced by the header's first links | **84 / 99** |
| Logo found | **65 / 99** |

The 84 is not cosmetic: Spain's LSSI-CE (art. 10) requires the service provider's
identifying information to be permanently and easily accessible, and the AEPD's cookie guide
expects the cookie policy to be reachable — on a business blog that is exactly what those
footer links do.

**R6 — "Harmonise" rewrites their brand by design.** `harmoniseCss` sets
`body *{font-family:…!important;color:…!important}` and repaints every header box. It can be
pretty; it cannot be faithful, and the founder's criterion is fidelity.

**R7 — Every page pays for the chrome, every time.** Compiled chrome CSS is **median 78KB
(p90 205KB) inlined into every HTML document**; the captured `<head>` adds a median 31KB in
the raw path. An article page is **199KB raw / 35KB gzip with the chrome vs 58KB / 8KB
without** — the chrome is ~70% of the bytes of a typical page, re-downloaded on every page
view because it is inline.

### 1.3 The live lab: three models, one truth (I3)

100 sites attempted on 2026-10-07. Eleven could not be measured (4 page-load timeouts, 2
screenshot timeouts, 2 pages that navigate during load, 2 errors in our harness, 1 TLS
error) — 91 were measured on a phone and on a desktop, 86 with every model at both widths.

**The header at rest** — share of the header box's pixels that differ from the live site
(worst of the two widths, 86 sites):

| | Exact (≤ 0.5%) | Close (≤ 5%) | Off (≤ 25%) | Broken (> 25%) |
|---|---|---|---|---|
| **B · snapshot of the browser-built DOM, no scripts** | **62** (72%) · 58 at exactly 0 | 7 | 3 | 14 |
| **C · today's production pipeline** | 14 (16%) · 13 at exactly 0 | 13 | 15 | **44** (51%) |

Per width — B exact on 69/91 phones and 72/91 desktops; C on 21/86 and 23/88. WordPress
alone (60 sites): B 45 exact, C 8.

**Every one of B's 24 misses was inspected by eye:**

- **9** — a hero video or slideshow playing *behind* a transparent header (Verne, Patrón,
  Claror, Bufet Serra, Salon 223, CCCB, MACBA, The Room, a Wix gym): the header's own pixels
  are identical, the frame behind it is not. An artefact of measuring *homepages*; the Mirror
  captures an interior page and wears a transparent header in its scrolled (solid) state.
- **4** — a cookie banner or third-party popup that a *whole-page* snapshot contains and a
  chrome-only capture removes.
- **9** — small differences (0.5–12%): animated logos, a lazy image, a slider frame.
- **2 — genuine failures:** one site whose stylesheets are attached by script in a way a plain
  DOM clone loses (the capture's harvest step reads the *applied* sheets through the DevTools
  protocol precisely for this, §3.4), and one blank render in a loading state we have not
  explained yet.

**The mobile menu** (91 sites measured on a phone):

| | |
|---|---|
| A trigger that reveals ≥ 2 links was found and opened on the live site | **74 / 91** (81%). The other 17: navigation already visible at 390px, or a trigger the lab's heuristic missed — production adds ARIA and event-listener inspection; until verified those sites get SAFE PANEL |
| …of which the trigger carried `aria-expanded` | 34 / 74 (46%) — ARIA alone cannot find most burgers |
| How their JS opens it | inline-style animation **49** · class/attribute toggles **11** · inserted nodes **14** |
| **Replaying the recorded end state on B (no scripts) reveals every link the live menu revealed** | **66 / 74 (89%)** · ≥ 80% of the links on 68 / 74 |
| Control — links already visible on B before the replay | 0 (median): the replay does the work |
| Size of the recorded behaviour | median **646 bytes**, p90 11.8KB |
| **Today's render — the burger reveals ≥ 2 links** | **10 / 86 (12%)** |

**Desktop dropdowns** (91): 35 sites have sub-menus that open on hover. **10 open from CSS
alone** on the script-free snapshot; **25 need what their JS does** — recorded hover diffs,
the same mechanism as the burger, *not yet measured*: it is the first item of W2's spike.
41 sites have no sub-menu; 15 open sub-menus on click or not at all.

**Headers that react to scrolling** (sticky, shrink, recolour — attributes inside the header
changed by script after a 700px scroll): **48 / 91 (53%)**. Scroll states are half the
corpus, not an edge case — the manifest records them.

**What "their JS" would cost** (their homepage on a phone, bytes transferred): JavaScript
median **1.2MB in 35 files** (p90 2.65MB in 96) · CSS 112KB (p90 254KB) · fonts 180KB
(p90 544KB). Running their scripts to get "native" menus means shipping that to every blog
page — and handing our domain to 35 files we did not write.

**What the chrome really needs** (I4, 27 of 34 sampled sites; 6 timed out, 1 failed to
split): of the CSS their page loads — median **72KB gzip** (p90 253KB) — the header and
footer use a median **11KB gzip** (p90 28KB, max 48KB): **12%** of it. Their chrome's HTML,
scripts removed, is a median **8KB gzip** (p90 16KB). Caveat: this pass forced hover and
focus states and walked three widths, but did not replay menu-open states, so production
numbers will run a few KB higher.

**One DOM for every width?** (I5, 52 sites measured): the control — the desktop snapshot
served back at desktop width — was exact on 41 (9 of the 11 misses are sites inspected
above — hero media, overlays, an animated logo; 2 were not inspected). On those 41, the **desktop** DOM also renders the phone *and* tablet
header within 5% on **31 (76%)**, exactly on 25. The phone DOM is the worse canonical
(exact on desktop for 21 of 41). So: capture once at desktop, verify at the other widths,
and store per-breakpoint variants for the **~1 in 4** sites (10 of 41) where a script
computed width-dependent markup or styles.

**Reading.** The snapshot model is not clever. It wins because it stops guessing: the browser
has already resolved the cascade, run the scripts that build and reveal the header, and
settled the layout — we keep the result and drop the code. Its failures are concentrated in
things a *header-only, interior-page* capture does not contain (hero media, page overlays).
The behaviour half is the new idea, and the lab shows it works: what a menu script *does*
fits in under a kilobyte for half the menus measured.

### 1.4 Performance — where the bytes and the time actually go

**The public blog (I2, real renderer, real captured chrome, median of 99 sites):**

| Posts on the index | HTML raw | HTML gzip | DOM nodes (p90) | Render CPU (p90) |
|---|---|---|---|---|
| 0 (chrome + shell) | 166KB | 34KB | 333 (800) | 16ms (51ms) |
| **12** | 198KB | 35KB | **498** (965) | 37ms (67ms) |
| 24 | 231KB | 37KB | 666 (1,133) | 61ms (103ms) |
| **100 (today's cap)** | **439KB** | 44KB | **1,730 (2,197)** | **199ms (317ms)** |
| 1,000 (if the cap were lifted) | 2.9MB | 116KB | — | 2.2s (3.1s) |

- `loadListingPosts` returns the newest **100** published posts, ordered by `created_at`
  (creation, not publication). There is **no pagination, no category archive and no
  sitemap** for hosted blogs (`grep -r sitemap src` finds only the importer). **Post 101
  onward has no crawl path at all** except 24 "related" slots and a 50-item RSS feed.
- Search and category filters are client-side filters over the ≤100 rendered cards
  (`modules.ts`): they silently cannot find anything older.
- Each card costs ~2.7KB raw and ~14 DOM nodes. At 12 cards the page is **498 nodes**; at
  100 it is 1,730 — over Lighthouse's historical 1,400 limit; Lighthouse 13's "Optimize DOM
  size" insight now flags style recalcs touching >300 elements or layouts touching >100
  objects when they exceed 40ms ([Chrome docs](https://developer.chrome.com/docs/performance/insights/dom-size)).

**Caching (the "load balancing" question is really a cacheability question):**

- `BLOG_CACHE_CONTROL = s-maxage=300` — every edge region re-fetches every page every five
  minutes. The code says why: the route sets its own `Cache-Control`, so `cacheTag` tags the
  inner `use cache` entry but not the CDN response, and a publish cannot purge the edge
  (`render/cache.ts`, "FOLLOW-UP"). Vercel's docs confirm the layers are independent ("use
  the same cache tag for both", [runtime cache](https://vercel.com/docs/caching/runtime-cache)),
  and since 2026-01-28 any response can carry a `Vercel-Cache-Tag` header and be purged by
  tag ([changelog](https://vercel.com/changelog/tag-based-cache-invalidation-now-available-for-all-responses)).
- **Blast radius.** Every article entry is tagged `site:<id>` and every content action calls
  `updateTag(siteTag)` or `revalidateTag(siteTag, {expire: 0})` — a *hard delete* (blocking
  regeneration). **One publish evicts every cached page of that blog**, not the two that
  changed — and so does approving a comment (`actions/comments.ts`), whose text is not even
  in the cached HTML.
- A cache miss costs `loadSite` → (`loadTheme` + genome join + posts) — 3–5 queries and the
  render CPU above; `select('*')` on `site_themes` drags the full chrome blobs every time.

**The dashboard:**

- **The post list is already paginated** (12 per page, server-side search) — but each page
  runs **four `count: 'exact'` queries** (filtered, total, published, samples) plus an
  `ilike '%term%'` that no index serves, and uses OFFSET.
- **The site page loads every tab at once** (`sites/[id]/page.tsx`: "Fetch all tab data in
  parallel"): the whole `site_themes` row goes into the RSC payload — **median 203KB of JSON,
  p90 384KB, max 575KB** (I2), before `chrome_i18n` duplicates it per locale — plus
  `fetchSiteStats`, which **pulls up to 50,000 raw `page_views` rows into JavaScript** to
  count them, plus the client list for superadmins.
- `/api/interactions` (every article view): three uncached queries, and the like count is
  computed by **summing every `post_likes` row** of the post in JavaScript.
- Superadmin home: every site, every client profile, unbounded.

### 1.5 The founder's diagnosis, checked

| Claim | Verdict |
|---|---|
| "The AI-generated header/footer has failed" | **Confirmed and quantified** (R5–R6). Worse: the *non*-generative path also fails, for different reasons (R1–R4) — the rebuild was introduced to cover for those failures ("never a broken header"), and inherited none of the fidelity. |
| "Blogs load all articles at once" | **Half right.** They load the newest 100 (1,730 nodes, 439KB) — and *hide* everything older. The SEO cost of the cap is bigger than the byte cost. |
| "The dashboard loads everything at once" | **Right about the site page, wrong about the list.** The list is paginated; the waste is the six tabs loaded together, a 200KB theme row in the payload, exact counts, and raw analytics scans. |
| "Zero load-balancing strategy" | **Not the real problem.** Vercel scales the functions; what is missing is *not needing them*: a CDN that holds pages until a precise purge. |
| "Perfect Lighthouse scores" | **Achievable for what we own; bounded by what we copy.** A faithful header carries their fonts. We budget our bytes hard and hold theirs to "never heavier than on their own site" (§4.6). |

---

## 2. The landscape — how everyone else solves it

### 2.1 The chrome

| Who | How they get the customer's header | Fidelity | SEO | Friction |
|---|---|---|---|---|
| **DropInBlog** | JS embed *inside* a page of the customer's site; "SEO Supercharger" pre-renders it on Cloudflare Workers (requires their DNS on Cloudflare); a server-rendered "Rendered API" for custom stacks ([site](https://dropinblog.com/), [docs](https://docs.dropinblog.com/en/article/developer-docs-sdks-and-api-1fqwo39/)) | 100% (it *is* their page) | JS-dependent unless the add-on | Paste a snippet |
| **HubSpot** | The whole page is HubSpot's; a documented reverse proxy puts it under `/blog` ([docs](https://developers.hubspot.com/docs/cms/best-practices/testing-staging-performance/reverse-proxies/setup)). Customers rebuild their header in HubSpot. | Whatever they rebuild | Excellent | High |
| **Feather · Superblog** | Subdirectory hosting (`/blog`) via proxy; header configured by the customer ([Superblog](https://superblog.ai/features/subdirectory-hosting), [Feather](https://feather.so/blog/add-a-blog-to-your-website)) | Approximate | Excellent | Medium |
| **Hashnode (headless)** | GraphQL + an open-source Next.js starter the customer deploys and dresses ([starter](https://github.com/Hashnode/starter-kit)) | Whatever they build | Good | High |
| **Outrank · SEObot · Koala · BabyLoveGrowth** | **Don't host.** Publish into the customer's CMS through its API or a plugin ([Outrank WP](https://wordpress.org/plugins/outrank/), [Koala](https://koala.sh/features/built-in-integrations)) | 100% (their theme renders it) | Excellent | Connect once |
| **Carma today** | Clone the header into our page, statically; redraw it when that fails | §1.3 | DSD body (indexed by Google, below) | Zero |

CMS write APIs exist for WordPress (REST + Application Passwords,
[guide](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)),
Webflow, Shopify (GraphQL Admin; REST articles are legacy), Wix (Blog v3), HubSpot, Ghost;
Framer only from inside a Framer plugin; **Squarespace has no blog write API** (forum
evidence only — medium confidence).

**What this tells us.** *No credible product clones a foreign header at fidelity.* The
industry either lives inside the host (embed, plugin, CMS API, reverse proxy) or makes the
customer build the chrome. Our zero-install promise is unusual — which is why the residency
ladder puts "inside" first, and why the hosted mode needs something nobody ships: recorded
behaviour (§3.4). The prior art for that half is real and old: template detection across a
site's pages (Bar-Yossef & Rajagopalan, WWW 2002; Yi, Liu & Li's Site Style Tree, KDD 2003;
Gibson et al., WWW 2005 — 40–50% of web content is template; Vieira et al., CIKM 2006,
[ACM](https://dl.acm.org/doi/10.1145/1183614.1183654)), DOM-mutation recording (rrweb,
[repo](https://github.com/rrweb-io/rrweb)), and fire-the-event-diff-the-DOM state
exploration (Crawljax, [repo](https://github.com/crawljax/crawljax)). No maintained
open-source library does multi-page chrome extraction; it is ours to build.

### 2.2 Isolation and SEO — the facts the design rests on

- **Declarative Shadow DOM** is Baseline since Feb 2024 (Chrome 111/124, Firefox 123,
  Safari 16.4 — [web.dev](https://web.dev/articles/declarative-shadow-dom)). Our blog body
  already lives in one.
- **Google indexes shadow-DOM content:** "WRS flattens the light DOM and shadow DOM"
  ([Google Search Central](https://developers.google.com/search/docs/crawling-indexing/javascript/fix-search-javascript),
  updated 2025-12-18 — verified). **Bing and AI crawlers: unverified** — non-rendering
  parsers may treat `<template>` content as inert. Gate V13 (§5.2) measures it.
- **CSS `@scope`** reached Firefox only in v146 (Dec 2025) — progressive enhancement, not a
  foundation. **Cascade layers** are mature (2022).

### 2.3 Security precedent

GitHub moved Pages from `*.github.com` to `github.io` because script on a sibling subdomain
can "overflow the cookie jar" and plant cookies the parent cannot tell from its own;
GitHub's conclusion: "hosting custom user content under a subdomain is simply a security
suicide" ([GitHub](https://github.blog/engineering/infrastructure/yummy-cookies-across-domains/) —
verified). That is why `github.io`, `vercel.app` and `netlify.app` sit in the private
section of the Public Suffix List: it makes each tenant its own *site* for cookies and
`SameSite`.

### 2.4 Caching, pagination, search — the facts

- Next 16 (bundled docs): `cacheLife('days')` = stale 5m / revalidate 1d / expire 1w;
  `updateTag` is Server-Action-only and **deletes** (blocking regeneration); route handlers
  use `revalidateTag(tag, profile)`, where `'max'` **invalidates** (serves stale, refreshes
  in the background).
- Vercel CDN: `Vercel-Cache-Tag` on any response (2026-01-28); ≤128 tags/response,
  ≤256 bytes/tag; purges propagate in ~300ms; `Vercel-CDN-Cache-Control` takes precedence
  and is stripped before the browser; max CDN TTL 1 year, best-effort
  ([purge](https://vercel.com/docs/caching/cdn-cache/purge),
  [headers](https://vercel.com/docs/caching/cache-control-headers)).
- Google on pagination: give every page its own canonical (never page 1), link pages with
  real `<a href>`; `rel=next/prev` is no longer used; "load more" must be backed by real
  URLs ([Search Central](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)).
- Postgres ships a **Catalan** Snowball stemmer (`catalan_stem`, PG ≥ 15 —
  [docs](https://www.postgresql.org/docs/15/textsearch-psql.html), verified) besides Spanish
  and English; `unaccent` is not IMMUTABLE (needs a wrapper or a trigger); `pg_trgm` is
  standard. HyperLogLog is **not** in Supabase's extension list — use rollups.
- PostgREST counts: `exact` scans, `planned` reads the planner's estimate
  ([PostgREST](https://docs.postgrest.org/en/stable/references/api/pagination_count.html)).
  Keyset beats OFFSET at depth ([use-the-index-luke](https://use-the-index-luke.com/no-offset)).
- CrUX "good" at p75: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1; TTFB ≤ 0.8s is a diagnostic,
  not a Core Web Vital ([web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)).

---

## 3. EL MIRALL — the winning chrome architecture

### 3.0 Every option, scored on the founder's four criteria

| # | Option | Visual | Links | Menus | Weight on our page | Security | Verdict |
|---|---|---|---|---|---|---|---|
| 0 | **Today:** static capture + compiler, rebuild when unfaithful | 14/86 exact | rebuild keeps 35% | 10/86 work | 78KB CSS inline per page | their scripts on our domain | Replace |
| 1 | Fix the static pipeline (state rules, body sheets, restore head JS) | Capped by R1: the server's HTML is not what visitors see | ✓ | only by running their JS (→ 3) | heavy | — | Patches in W0, not a destination |
| 2 | Model-"sanitised" chrome (an LLM repairs or re-emits their markup) | Unverifiable per site | URLs at the mercy of a model | Rebuilt, not theirs | — | — | **Rejected** — law 1 |
| 3 | Run their JS on our page (raw head injection, archive-style replay) | High | ✓ | Native | +1.2MB JS median (p90 2.65MB), 35 files | Third-party code on our domain | Only on *their* domain, opt-in (W6) |
| 4 | Their chrome in an iframe | Exact at rest | ✓ | Broken: dropdowns and off-canvas panels clipped to the frame, sticky impossible across documents | A second document per view | Isolated | **Rejected** |
| 5 | Their chrome inside a shadow root | Breaks: their CSS keys on `body`/`html` classes and document-level selectors | ✓ | Their scripts query `document` and cannot see inside | — | — | **Rejected** — isolate *our* side instead (law 4) |
| 6 | A screenshot of their header | Exact at one width | ✗ | ✗ | An image per width | Isolated | **Rejected** |
| 7 | Live proxy / Edge-Side Include of their page on every request | Exact | ✓ | Native | Their TTFB and outages become ours | Their code | **Rejected** for hosting (it is A2 when under *their* domain) |
| 8 | **Inside** their site (plugin server-side render, `/blog` proxy) | 100% | 100% | Native | Theirs | Their page, their responsibility | **Adopt — mode A** |
| 9 | **Mirror**: browser snapshot + coverage CSS + behaviour replay + certificate | 62/86 exact, 84/86 identical by eye | 100% (copied) | 66/74 replayed exactly | 11KB CSS (cached) + 8KB HTML, gzip medians (I4) | No third-party code | **Adopt — mode B** (+ C as its floor) |
| 10 | Publish native posts into their CMS | 100% | 100% | Native | Theirs | Their page | Optional (A3, §9) |

### 3.1 Five laws

1. **Copy, never generate.** Every byte of their chrome — markup, CSS, link, label — comes
   from their rendered site. No model writes chrome markup, CSS or a URL, ever. AI may
   *classify* (which element is the burger, which page is a good interior page); a test
   verifies every classification.
2. **Capture what the visitor sees.** A real browser, after their JavaScript has run, at
   phone, tablet and desktop widths. Never the server's HTML alone.
3. **Behaviour is data.** What their JS *does* to the header (classes, attributes, inline
   styles, inserted nodes) is recorded once and replayed by our runtime. Their JS itself
   never runs on a Carma domain.
4. **Isolate what you own.** Their chrome lives in the light DOM with *their* cascade,
   untouched; our blog lives in its shadow root. We never restyle their chrome — the body
   harmonises to the chrome, not the other way round.
5. **No certificate, no chrome.** Every capture is tested against the live site (§5.2)
   before it is published. Failing a test changes the *mode*, never the *truth*: we fall to
   SAFE PANEL, we do not redraw.

### 3.2 The residency ladder (replaces keep / harmonise / rebuild)

| Mode | Where the blog lives | Chrome source | Their JS | Fidelity | Who |
|---|---|---|---|---|---|
| **A · INSIDE** | In their own site: WordPress renders our article server-side inside its theme (A1), or their edge proxies `/blog/*` to us (A2) | Their own theme / their own page | Runs natively (it *is* their page) | 100% by construction | WordPress owners who install the plugin; anyone with edge access |
| **B · MIRROR** | `<sub>.<tenant-domain>` or `blog.theirdomain.com` | Browser capture, certified | **Never** — behaviour replayed by `mirall.js` | Certified per site (§5.2) | Everyone else; the zero-install default |
| **C · SAFE PANEL** | Same as B | B's certified header at rest; *our* accessible menu panel listing **their exact link tree** | Never | Pixel-exact at rest; menu functional and link-complete, not pixel-identical when open | Sites whose behaviour cannot be certified |
| **Ø · NO SITE** | Carma subdomain | Genome-generated chrome | — | n/a | Businesses with no website (`?nova=1`) |

Selection is automatic and explainable:

```
if (site.hasWordPressPlugin && plugin.mode === 'inside')        → A1
else if (site.hasEdgeProxy)                                      → A2 (serves B's page under their domain)
else if (!site.originUrl)                                        → Ø
else capture = mirror(site)                                      // §3.4
     if (capture.cert.atRest.pass && capture.cert.behaviour.pass) → B
     else if (capture.cert.atRest.pass)                           → C  (+ owner notified: what failed, where)
     else                                                         → keep the last certified capture; if none → C with the
                                                                    header box drawn from the scrolled (solid) state, else
                                                                    an honest text-only bar: their logo + their link tree
```

There is no rung where a model invents a layout, a label or a URL.

### 3.3 Mode A — INSIDE: the blog lives in their house

**A1 — WordPress, server-side (plugin v1.0).** Today the plugin is a *client-side* embed:
the article text never reaches WordPress's server HTML, so a non-rendering crawler sees an
empty page, and every reader waits for a second origin. v1.0 renders on the server:

- **Routing.** A rewrite rule `^{base}/(.+)/?$` (base = `blog`, configurable) maps to a
  virtual page rendered with the theme's own page template, so `get_header()` /
  `get_footer()`, the theme's wrappers, sidebars, scripts and menus are **theirs, natively**.
- **Content.** `wp_remote_get(origin + /render/<site>/<path>?format=fragment)` — the fragment
  contract already exists (`buildArticleFragment` / `buildListingFragment`) — printed as
  Declarative Shadow DOM (`<div class="carma-embed-host"><template shadowrootmode="open">…`),
  so their theme CSS cannot touch our body and our CSS cannot touch their theme.
- **Head.** Title, description, canonical (their URL), Open Graph, JSON-LD and hreflang
  injected through `pre_get_document_title` / `wp_head`, with Yoast / Rank Math filters so
  there are no duplicates.
- **Sitemap.** A provider for WordPress's core sitemaps (`wp_sitemaps_add_provider`) plus
  the Yoast / Rank Math hooks.
- **Cache.** Transients keyed by path + Carma's ETag, TTL 10 min, stale-if-error 24h; a
  signed purge webhook from Carma on publish that also calls WP Rocket / LiteSpeed /
  W3TC purge functions when present. On a cache miss that times out (2s), fall back to
  today's client-side loader — the reader always gets the article.
- **Security, re-examined.** The 2026-06-09 plan forbade a front-end server fetch ("E3":
  SSRF / remote HTML injection). With the origin pinned to an allowlist (already the case)
  there is no attacker-chosen URL, so no SSRF; and the HTML injected server-side is the same
  HTML the client-side loader injects today — the trust boundary does not move. E3's
  concern is met by the allowlist, a response-size cap, and a signed fragment (an HMAC
  header the plugin verifies before printing a byte).
- **Canonical when both exist.** A site with A1 *and* a Carma subdomain canonicalises to
  their domain; the subdomain becomes a 301.

**A2 — `/blog` on their domain (reverse proxy).** For sites whose owner (or agency)
controls the edge: we ship copy-paste recipes (Cloudflare Worker, `vercel.json` rewrite,
Netlify `_redirects`, Nginx `location`). We serve the MIRROR page under their domain.
Because the page is now first-party to *them*, their own JS may run there (owner's choice,
§3.9). This is HubSpot's and Superblog's model.

**A3 (optional, §9) — publish into their CMS.** What Outrank and SEObot do: push native
posts through the WordPress / Webflow / Shopify / Wix / HubSpot APIs. Chrome is 100% theirs
and SEO is native — but their theme styles our article, so Carma's designed body, modules
and analytics are lost. A different product shape; offered only if you want it.

### 3.4 Mode B — MIRROR: the capture pipeline

```
 1 choose an interior page → 2 render it at 390 / 820 / 1440 → 3 find the boundary (built DOM + 2nd page)
 → 4 snapshot (scripts out, links absolute) → 5 harvest CSS by coverage → 6 record behaviour
 → 7 re-host fonts & images → 8 viewport variants (only if needed) → 9 certify (§5.2) → publish
 10 refresh: daily fingerprint · weekly recapture · on demand · WordPress menu webhook
```

1. **Choose the page.** An *interior* page, not the homepage: their blog/news index when
   it exists (`findBlogIndexUrl` already finds it — and its "Blog" item is then already
   marked active), else the first internal nav link that is not home. Homepages carry the
   hero variants of headers (transparent over video), which are not what a blog should wear
   (§1.3: the largest group of the snapshot model's misses — 9 of 24 — was exactly this).
2. **Render.** Chromium at 390×844, 820×1180 and 1440×900; network idle + `document.fonts.ready`;
   consent banners dismissed or removed (they are page overlays, not chrome). Service
   workers blocked. Every request passes an egress guard (§3.9).
3. **Boundary.** `pageSplit`'s structural model — header/footer anchors, content range,
   wrappers kept — run on the **browser-built** DOM, then *validated* against a second
   interior page: the chrome is what both pages share (the template-detection literature's
   definition, §2.1). Disagreement → flag, try the landmark-only split, else fail the
   certificate.
4. **Snapshot.** Serialise header and footer subtrees with their wrappers and every
   attribute and inline style their JS set; stamp stable ids (`data-mx="n"`); remove
   `<script>`, `on*` handlers, `javascript:` URLs (today's `sanitizeChromeHtml` and LINK
   REPAIR are reused verbatim); absolutise links to their origin; keep `<body>`/`<html>`
   classes and inline styles (themes key on `body.home`, `html.js`, JS-computed paddings).
5. **Harvest CSS by coverage, not by guessing.** Collect the text of *every* stylesheet the
   page actually applied — `<head>`, `<body>`, JS-injected, `@import`ed, adopted — through
   CDP (`CSS.getStyleSheetText` reads cross-origin sheets too), in cascade order. Track rule
   usage while walking every recorded state at every width, with `:hover`/`:focus-within`
   forced on each nav item (`CSS.forcePseudoState`). Keep used rules + their
   `@media`/`@supports`/`@layer` wrappers + `@font-face` and `@keyframes` they reference +
   every custom-property definition. Emit **one content-hashed file**. This is the opposite
   of R2: the states were *exercised*, so their rules are *seen* (I4: a median 11KB gzip of
   the 72KB their page loads).
6. **Record behaviour.** Triggers are found by ARIA first (`[aria-expanded]`,
   `[aria-controls]` — the WAI-ARIA disclosure-navigation pattern), then by event-listener
   inspection (`DOMDebugger.getEventListeners`), then by the lab's scoring heuristics. For
   each trigger: tap → settle → record the end-state diff (attributes, inline styles,
   inserted subtrees); tap again / Escape → record the close diff. For each dropdown:
   hover/focus → if CSS alone reveals it (10 of the 35 measured sites with hover
   sub-menus), record nothing; else record the JS diff. Scroll to 50/100/300/600px → record
   header diffs (sticky, shrink, colour change — 53% of headers react). Output: a
   **behaviour manifest** (JSON; the lab's menu diffs: median 646 bytes, p90 11.8KB).
7. **Assets.** Fonts the harvested `@font-face` rules use are re-hosted under our CDN
   (same-origin: no CORS failures, immutable, one file shared by all their pages); chrome
   images go through `/api/img`. Font licences are flagged (§3.11): Google Fonts pass;
   Adobe Fonts kits need the blog domain added to the kit; self-hosted commercial faces are
   reported to the owner.
8. **Viewport variants.** If the desktop DOM does not reproduce the phone or tablet header
   (I5: 10 of 41 sites — the desktop DOM serves every width on the other 31), the capture
   stores per-breakpoint variants and switches them with media
   queries at the measured breakpoint (the width where their burger appears). No JS, no
   layout shift.
9. **Certify** (§5.2) → store as an immutable **capture version** → publish.
10. **Refresh.** Daily: a cheap static fetch of the source page computes a *fingerprint*
    (link set + visible text of the static header/footer); a change enqueues a browser
    recapture. Weekly: forced recapture. On demand: "Refresh my header" in the Studio, and a
    WordPress `wp_update_nav_menu` webhook when the plugin is installed. A new capture
    replaces the old one only if it certifies.

**Storage (migration 040).**

```sql
create table chrome_captures (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  version       int  not null,
  source_url    text not null,
  captured_at   timestamptz not null default now(),
  variants      jsonb not null,  -- [{ minWidth, maxWidth, header, footer, bodyAttrs, htmlAttrs }]
  css_path      text  not null,  -- /_m/<site>/<sha256>.css (immutable)
  fonts         jsonb not null,  -- [{ family, src, licence }]
  behaviour     jsonb not null,  -- the manifest (§3.5)
  links         jsonb not null,  -- [{ href, name, region, depth }]  ← the link-fidelity ground truth
  fingerprint   text  not null,
  certificate   jsonb not null,  -- every §5.2 metric, with screenshots' storage paths
  mode          text  not null check (mode in ('mirror','safe_panel')),
  status        text  not null check (status in ('candidate','active','retired')),
  unique (site_id, version)
);
create unique index chrome_captures_active on chrome_captures (site_id) where status = 'active';
```

The render reads the active capture (cached, tagged `s:<id>:chrome`). `site_themes` keeps
its design fields; `extracted_head/header/footer/compiled_chrome_css` retire after migration.

### 3.5 The replay runtime — `mirall.js`

- ≤ 2.5KB gzip, no dependencies, inline with a CSP hash, no network access, no `eval`.
- Applies manifest diffs on `click`/`keydown`(Enter, Space, Escape)/`pointerenter`/`focusin`/
  passive `scroll` (rAF-throttled), toggles open/close, closes on Escape and outside click.
- **Improves accessibility without changing pixels:** syncs `aria-expanded`, moves focus into
  the opened panel and back to the trigger on close (the WAI-ARIA disclosure pattern their
  JS often skips).
- Their CSS transitions run as on their site whenever the diff toggles classes; where their JS
  animated inline styles (49 of the 74 opened menus — jQuery `slideToggle` and friends) the
  runtime applies the end state, optionally through a generic height transition. Menus that
  *insert* nodes (14 of 74) replay the recorded, sanitised subtree.
- Failsafe: a trigger whose target is missing is ignored; the runtime never throws into the
  page; a `data-mx-safe` attribute switches the page to SAFE PANEL at runtime if the
  certificate demands it.

### 3.6 How it survives the three wars

**CSS conflicts.**

| Direction | Mechanism | Residual risk |
|---|---|---|
| Their CSS → our body | Our body is in a shadow root (as today). Only *inherited* properties cross the host; `:host` resets them (`guardCss`, already shipped). | Custom properties inherit by design — ours are namespaced `--ct-*`. |
| Our CSS → their chrome | Our CSS lives in the shadow root; the only light-DOM rules we emit are the host box-guard and the variant switch. SAFE PANEL renders in a shadow root of its own. | None measured (V10). |
| Their CSS → our host element | Host guard with `!important` on box properties (shipped). | A theme rule like `body > div {…}` — caught by V9. |
| Font-name collisions | Genome faces registered as `carma-<Family>` | — |

**Their menu JavaScript.** It does not run (law 3). Its *effect* runs (`mirall.js`). Where
replay cannot be certified the page is SAFE PANEL. Only on a domain the customer owns (A2,
or a CNAME such as `blog.theirdomain.com`) — and only if the owner opts in — may the
minimal set of their scripts be loaded, found by delta debugging (Zeller's *ddmin*:
remove scripts in halves while the menu test still passes; Muzeel measured ~70% of JS
functions unused on the median page, [arXiv](https://arxiv.org/abs/2106.08948)). Never on
our domain; never trackers.

**Z-index wars.** Their page's stacking order is preserved because their wrappers, classes and
inline styles are preserved. Our side follows one policy:

1. The blog host stays **non-positioned and creates no stacking context** — exactly like the
   content their header expects beneath it, so their dropdowns (positioned, often
   `z-index:auto`) paint over it as they do over their own content.
2. Inside the shadow root, positioned elements stay at `z-index ≤ 1`, except overlays that
   are *meant* to cover the page (lightbox, search dialog) while open.
3. Our sticky elements (TOC, share bar) offset by `--mx-header-h`, measured at capture, and
   `scroll-margin-top` uses it, so anchors never hide under their sticky header.
4. If the occlusion test (V8) still fails, remediation is a tested ladder: host
   `isolation:isolate` → header root `position:relative; z-index:2147483000` only when it is
   not already positioned → else SAFE PANEL. Each step re-runs V1–V8.

### 3.7 Mode C — SAFE PANEL

Their certified header at rest (pixels, links, logo — theirs) plus, behind *their* burger,
*our* panel: an accessible disclosure (button → `nav > ul`), full height, holding **their
complete link tree in their order with their labels**, sub-menus as nested lists, styled
with tokens read from their computed header (font, colour, background). Guarantees: V3
(links) and V5/V8 (function); not V2 (the open panel is ours, not their pixels). It is the
honest floor — functional, complete, recognisably theirs — and the dashboard says so.

### 3.8 What dies, what changes

| Today | Fate |
|---|---|
| `rebuildChrome`, `harmoniseCss`, the 5 header / 3 footer archetypes | **Deleted** for sites with a website. Archetypes survive for Ø (no website). |
| `FAITHFUL_MAX_SHEETS` gate, `frameChrome` | Replaced by the certificate. The Door preview shows the Mirror (or, while it captures, the capture's own screenshot of their header — an image, honest and instant). |
| `chromeCompiler.ts` (static matching) | Replaced by coverage harvest (§3.4.5). Kept as the static *preview* path during W0–W2. |
| `contrastGuardScript`, `buildChromeRepairCss` | Mostly unnecessary: Mirror keeps their page background and body classes. Transparent-over-hero headers are worn in their **scrolled (solid) state** — the recorded scroll diff *is* their own answer to "my header without a hero". |
| `chrome.policy` in the genome | Removed for sites with a website. Fidel / Elevat / Reimaginat now differ **only in the body**. |
| Harmonisation | Inverted: the body's genome is *seeded* from the chrome's computed tokens (exact faces and colours from the browser, not guessed from CSS text). The seam takes the background of the slot's own container. |

**How the body harmonises with a chrome it may not touch.**

1. **Placement.** The blog sits in *their* content column: the slot is the gap the boundary
   step found inside their wrappers, so widths, gutters and the page background are theirs.
2. **Tokens from pixels, not from CSS text.** The capture reads the header's *computed*
   styles — the faces actually rendered, the brand colour actually painted, radii and the
   spacing step — and seeds the genome with them. Fidel uses them verbatim; Elevat and
   Reimaginat move the body's composition and rhythm, never away from the chrome's palette
   and faces.
3. **The seam.** The first heading's offset below the header copies the offset of their
   interior page's first content block; the body ground is the slot's background unless the
   genome sets one, in which case it must contrast with the header's bottom edge.
4. **Measured, like everything else** — V14 (§5.2): body text and headings meet AA on the
   ground they actually sit on; no gap or double rule at the seam beyond their own page's.

### 3.9 Security & domains

**Today (measured):** customer scripts in the captured regions run on `<sub>.carma.cat`
(R4), same-site with the app. No direct exploit was found — Server Actions reject foreign
origins and the only credentialed CORS endpoint that trusts tenant origins
(`api/admin/can-edit`) returns a boolean — but three structural risks stand: **cookie
tossing** against the app's session (GitHub's case, §2.3); **reputation contamination**
(a hacked WordPress plugin's injected script, copied into a capture, served from
`carma.cat` — one Safe Browsing flag can take the apex with it); and **phishing** (a faithful
Mirror of a bank's header on `bank.carma.cat` is a better phishing kit than a broken one).

**Target:**

1. **No third-party script on any Carma-served page.** Mirror strips all of them; `mirall.js`
   is ours. Blog pages answer with `Content-Security-Policy: script-src 'sha256-…'
   (ours only); object-src 'none'; base-uri 'none'; form-action <their origin> + allowlist`.
   The preview route already does this.
2. **Ownership before publication.** A Mirror is *published* only for a domain the account
   has verified (DNS TXT, meta tag, file upload, the WordPress plugin, or an e-mail at the
   domain). Anonymous Door previews stay previews (no-index, watermarked, short-lived).
3. **A tenant domain on the Public Suffix List.** Move blogs from `<sub>.carma.cat` to a
   dedicated registrable domain (e.g. `<sub>.carma.blog` — name to be chosen), submitted to
   the PSL's private section; 301 every old URL. Until then: app cookies `__Host-`-prefixed,
   host-only, `Secure`, `Path=/`.
4. **The capture browser is an SSRF surface.** Every request goes through an interception
   guard: resolve DNS, refuse private, loopback, link-local and metadata ranges, re-check
   after redirects (DNS rebinding); 30s wall clock; no persistent profile.
5. **Iframes in chrome** (maps, social embeds): allowlisted providers with `sandbox` and
   `loading=lazy`; everything else becomes a link.
6. **Consent.** Because none of their trackers run on our pages, Carma is not a joint
   controller of their analytics (the CJEU *Fashion ID* line — embedding a tracker can make
   you one; AEPD cookie guide). Native-JS escalation on their own domain makes it *their*
   page, their CMP, their responsibility — documented in the opt-in.

### 3.10 Infrastructure and cost

- **Where the browser runs:** Vercel Functions + `@sparticuz/chromium` (~39MB compressed —
  fits the standard 250MB limit) + `playwright-core`, 2–4GB memory, ≤800s max duration
  ([limits](https://vercel.com/docs/functions/limitations)). Jobs go through the queue pattern
  we already trust in the WhatsApp worker (`claim_next_agent_job`, an atomic leased claim —
  migration 030), or Vercel Queues. Pin the Chromium build to the `playwright-core` version (a well-known foot-gun).
  Fallback/overflow: Cloudflare Browser Rendering (official Playwright fork, $0.09/browser-hour).
  Not Vercel Sandbox (no documented browser story yet); not Browserbase/Browserless
  (priced for hostile scraping — we capture sites their owners gave us).
- **Cost** (Active CPU $0.128/vCPU-h, memory $0.0106/GB-h,
  [pricing](https://vercel.com/docs/functions/usage-and-pricing)): ≈ $0.0014 per browser-minute
  at 2GB → a full capture (3 widths, 2 pages, states, certification ≈ 60–120s) ≈ **$0.002–0.003**.
  10,000 sites recaptured weekly ≈ 43,000 captures/month ≈ **$90–130/month**; daily
  fingerprints are plain fetches (≈ $10/month). Storage per capture version (HTML + CSS +
  manifest + 6 screenshots, fonts deduplicated by hash) ≈ 0.3–0.5MB → 10,000 sites × 3
  versions ≈ **10–15GB**.
- **Latency:** a Mirror capture takes ~30–60s. Onboarding becomes progressive: today's
  static capture paints the instant preview (demoted to *preview only*), the capture's first
  screenshot replaces it within seconds, the certified Mirror swaps in when ready.

### 3.11 Trade-offs and risks, brutally

| Risk | Likelihood | Impact | Mitigation | What remains |
|---|---|---|---|---|
| **Frozen dynamics** — cart counters, "my account" state, AJAX mega-menus, rotating announcement bars, live search suggestions | Medium | Low–medium | Detect mutations without interaction (timers) → mask in diffs, replay simple rotations as a timed loop; AJAX content captured as of capture time | A cart badge that always reads "0" |
| **The capture fails on a site** — slow servers, pages that navigate during load, bot protection (Cloudflare, Wordfence, Sucuri), TLS errors | Medium (11 of 100 lab runs failed: 6 timeouts, 2 mid-load navigations, 2 harness errors, 1 TLS) | High for that site | Retries with longer budgets; owner-run capture from *their own browser* (a bookmarklet/extension posts the rendered DOM — no bot wall); the WP plugin captures from inside | Some sites need one click by the owner |
| **Drift** — they add a menu item | Certain over time | Medium | Daily fingerprint → recapture; WP webhook | ≤ 24h of an old header |
| **Their weight** — fidelity means their fonts (median 180KB, p90 544KB transferred on their homepage) | Certain | LCP | Re-hosted + preloaded faces, only the faces the chrome uses; budget "never heavier than their own site" | We cannot make their brand lighter without breaking it |
| **Their accessibility bugs** are copied | Likely | Medium | `mirall.js` fixes `aria-expanded`/focus; contrast reported, not repaired (fidelity > repair) | Their contrast is theirs |
| **Per-breakpoint variants** duplicate header HTML and ids | ~1 site in 4 (10 of 41, I5) | Low | Hidden variants are `display:none` (out of the accessibility tree); our runtime addresses `data-mx`, never ids | Duplicate ids in hidden markup (validator noise) |
| **Font licences** | Low–medium | Legal | Licence flags per face; Adobe kits need the domain added; owner informed | Owner's responsibility, recorded |
| **New production dependency** — headless Chromium | Certain | Ops | Version pinning, a canary capture of 5 corpus sites on every deploy, Cloudflare fallback | One more moving part |
| **Phishing with a perfect clone** | Low | Severe | Ownership verification before publish (§3.9.2), PSL domain, takedown process | — |
| **Inside (A1) couples their TTFB to our API on a miss** | Medium | Low | Transients, stale-if-error, 2s timeout → client-side fallback | First view after purge may be slower |
| **Engineering size** | Certain | Schedule | Waves with exit gates (§6); W0 needs no new infra | ~11–14 weeks total |

**What we are NOT promising:** 100% of sites pixel-identical in every state forever. We
promise, per site and in writing (the certificate): links 100% theirs, a working menu 100%
of the time, pixel-identical at rest wherever the certificate says so — and the honest mode
everywhere else.

---

## 4. L'INSTANT — the instant render strategy

### 4.1 Five laws

1. **O(page), never O(posts).** No public or dashboard request reads, renders or ships data
   proportional to the size of a blog.
2. **The cache is the product.** Every public byte is cacheable at the CDN and leaves it only
   through a precise tag purge.
3. **Nothing aggregates raw events at request time.** Counts and analytics are pre-computed.
4. **Zero JavaScript by default.** Every script on a public page earns its bytes (budgeted).
5. **Prove it at 10,000.** A fixture blog with 10,000 posts must cost what one with 100 costs.

### 4.2 The data model (migration 041)

```sql
-- 1. The feed's sort key: when it was PUBLISHED, immutable once set; id breaks ties.
alter table posts add column if not exists published_at timestamptz;
update posts set published_at = created_at where is_published and published_at is null;
create index concurrently if not exists posts_feed_idx
  on posts (site_id, published_at desc, id desc) where is_published;

-- 2. Counters instead of count(*): one row per site, trigger-maintained, nightly reconciled.
create table site_counters (
  site_id uuid primary key references sites(id) on delete cascade,
  posts_total int not null default 0, posts_published int not null default 0,
  posts_samples int not null default 0, updated_at timestamptz not null default now()
);
-- + AFTER INSERT/UPDATE OF is_published, meta/DELETE trigger on posts

-- 3. Likes: a counter on the post, bumped in the same transaction as the reader's row.
alter table posts add column if not exists likes_count int not null default 0;

-- 4. Analytics rollup: written by pg_cron (Supabase Cron) every 10 min from a watermark.
create table page_views_daily (
  site_id uuid not null, day date not null, post_id uuid,  -- null = listing pages
  views int not null, visitors int not null,
  primary key (site_id, day, post_id)  -- (nulls handled with a coalesce sentinel)
);
-- raw page_views kept 90 days (daily delete job), read only for drill-downs

-- 5. Search: per-locale tsvector maintained by trigger (unaccent is not IMMUTABLE),
--    configs catalan / spanish / english / simple; trigram index for typos.
alter table posts add column if not exists search tsvector;
create index if not exists posts_search_idx on posts using gin (search);
create extension if not exists pg_trgm;
create index if not exists posts_title_trgm on posts using gin (title gin_trgm_ops);
```

### 4.3 The public blog

**URLs** (locale stays a path prefix, as today):

| Page | URL | Cache tags (`Vercel-Cache-Tag` + `cacheTag`) |
|---|---|---|
| Index, page 1 | `/` · `/es/` | `s:<id>:idx`, `s:<id>:idx1`, `s:<id>:theme` |
| Index, page N | `/page/N` · `/es/page/N` | `s:<id>:idx`, `s:<id>:theme` |
| Category / tag archive | `/categoria/<slug>[/page/N]` (`/category/` in English) | `s:<id>:idx`, `s:<id>:theme` |
| Article | `/<slug>` · `/es/<slug>` | `p:<postId>`, `s:<id>:theme` |
| Cards fragment (load more) | `/page/N?fragment=cards` | same as page N |
| Sitemaps | `/sitemap.xml` → `/sitemap-posts-K.xml` (1,000 URLs each, hreflang alternates, `lastmod`) | `s:<id>:idx` |
| RSS | `/rss.xml` (50 items, unchanged) | `s:<id>:idx` |
| Search | `/cerca?q=` — server-side FTS, `noindex,follow` | `s:<id>:idx` (10-min TTL) |

**Pagination rules** (Google, §2.4): 12 posts per page (measured: 498 nodes, 35KB gzip at
the median, constant in N); each page self-canonical; real `<a href>` previous / next /
numbered links; no `rel=next/prev`. Page 1 lists the newest; numbered pages use OFFSET on
`posts_feed_idx` — cheap below ~10,000 posts per site and cached anyway; the load-more
fragment and every API use keyset cursors `(published_at, id)`.

**Load more, progressively.** Without JS: the numbered links. With JS (~1KB, ours): "Load
more" fetches the cards fragment, appends it, `history.pushState`s `/page/N` — so the URL
always names a real, crawlable page. `content-visibility:auto` on cards keeps a long scroll
cheap; no virtualisation (it breaks find-in-page and screen readers, and pagination already
bounds the DOM).

**Search** becomes server-side: per-locale FTS (`catalan` / `spanish` / `english` +
unaccent), trigram fallback, results rendered as the same cards. The instant client filter
stays for the cards on the current page.

**Caching, three layers:**

1. **CDN.** `Cache-Control: public, max-age=0, must-revalidate` for browsers;
   `Vercel-CDN-Cache-Control: max-age=<TTL>, stale-while-revalidate=604800`; `Vercel-Cache-Tag`
   as in the table. TTL starts at **1 day** and moves to **1 year** only after the purge path
   is verified in production (`x-vercel-cache` + log reason "Tag-based invalidation") — a
   missing tag at a 1-year TTL would be a year of staleness.
2. **`use cache`** (unchanged role) — same tag strings, so one `revalidateTag` call clears
   both layers.
3. **The database** — reached only on a double miss.

**The invalidation map** — granular tags, and *invalidate* (serve stale, refresh in the
background) unless correctness demands *delete*:

| Event | Tags | Method |
|---|---|---|
| Publish a post | `p:<id>` · `s:<id>:idx1` · `s:<id>:idx` | delete · delete · invalidate |
| Edit body only | `p:<id>` | delete (the owner reads their write) |
| Edit title / excerpt / cover / categories | `p:<id>` · `s:<id>:idx` | delete · invalidate |
| Unpublish / delete / slug change | `p:<id>` · `s:<id>:idx1` · `s:<id>:idx` | delete ×3 (never serve removed content) + 308 map (exists) |
| Theme, design or chrome capture change | `s:<id>:theme` | invalidate (owner preview is uncached anyway) |
| Comment approved | — | comments are fetched client-side |

Articles whose related-posts or previous/next modules are on also carry `s:<id>:idx`, so a
publish refreshes their sibling lists — by *invalidation*: readers keep getting the cached
page while it regenerates on the next hit, never blocking. After a publish, `after()` warms
the region: the post, page 1, the sitemap.

### 4.4 The chrome tax

- Today: chrome CSS **inline in every page** (median 78KB raw).
- MIRROR: the harvested CSS is an **external, content-hashed, immutable file**
  (`/_m/<site>/<hash>.css`, `Cache-Control: public, max-age=31536000, immutable`): downloaded
  once per reader, shared by every page of the blog. Chrome HTML stays inline (it is the
  first paint). I4 measured the whole chrome tax at a median **20KB gzip** (11KB CSS + 8KB
  HTML; p90 50KB) — and only the 8KB of HTML repeats on each page view, against today's 78KB
  of raw CSS inline in every page.
- Decision rule, not dogma: `test:vitals` runs both (inline vs external + `preload`) on 10
  corpus chromes; external ships unless it loses LCP by > 100ms at p75.
- Fonts: only faces the chrome uses, re-hosted, the 1–2 above-the-fold faces preloaded.

### 4.5 The dashboard

- **One tab, one payload.** The site page becomes per-tab segments that stream behind
  `<Suspense>`: Articles loads the list + counters; Tema/Studio loads `site_themes` (only
  the columns it edits) and the active capture *when opened*; Resum reads rollups. The
  200KB theme row leaves every payload that does not edit it.
- **The post list:** keyset cursor in the URL (`?after=<published_at>_<id>`), 25 rows,
  `site_counters` for the totals, FTS/trigram for search, `count:'planned'` for filtered
  totals ("~1,240 results"). OFFSET goes.
- **Analytics** read `page_views_daily` (O(days)). Thirty-day unique visitors: an
  index-only `count(distinct visitor_hash)` over the range (covering index
  `(site_id, created_at) include (visitor_hash)`), cached 10 min — exact, bounded by SMB
  volumes; upgrade to a rollup of first-seen visitors if a site outgrows it.
- **Superadmin** lists: keyset-paginated, server search.
- **No virtualisation.** 25 rows do not need it; it costs find-in-page and screen readers.
- `/api/interactions`: the public half (`likes_count` + approved comments, paginated) becomes
  cacheable 60s at the CDN; the reader's own tally — per reader by definition — stays a
  separate uncached call (or lives in `localStorage`).

### 4.6 Budgets

**Public blog** (mobile, Lighthouse 13, simulated throttling; real Mirror chromes):

| | Listing (page N, 12 cards) | Article |
|---|---|---|
| HTML, gzip — **our** bytes (excl. their chrome HTML) | ≤ 22KB | ≤ 28KB |
| HTML, gzip — total incl. chrome HTML | ≤ 40KB p90 | ≤ 45KB p90 |
| DOM nodes incl. chrome | ≤ 800 p90 | ≤ 1,500 p90 |
| Our JavaScript (runtime + load-more + enabled modules) | ≤ 6KB gzip | ≤ 8KB gzip |
| Their chrome CSS + fonts | **≤ what their own homepage loads** | same |
| LCP / CLS / TBT | ≤ 2.5s / ≤ 0.02 / ≤ 150ms | same |
| Queries per origin render | ≤ 4 | ≤ 5 |
| TTFB, CDN HIT, p75 (EU synthetic) | ≤ 100ms | ≤ 100ms |
| TTFB, origin (use-cache hit), p75 | ≤ 400ms | ≤ 400ms |

**Dashboard:** RSC payload ≤ 60KB gzip per navigation; ≤ 6 queries per route render; the
shell streams immediately.

**Scale invariance:** listing and article bytes, DOM nodes and query counts at N = 10,000
within ±5% of N = 100; render time within ±20%.

### 4.7 Trade-offs and risks

| Risk | Mitigation |
|---|---|
| Long CDN TTLs make a missed tag a long staleness | Tag-coverage unit test (every cacheable response carries its tags); TTL 1 day until verified; nightly synthetic "publish → probe" |
| Counters drift (trigger bugs, manual SQL) | Nightly reconciliation job + an alert when it corrects anything |
| Rollups lag ≤ 10 min | Labelled "updated every 10 minutes" — the dashboard was never real-time |
| OFFSET at depth | Fine below ~10k posts per site and cached; keyset everywhere a user can scroll forever |
| Keyset cannot jump to page N in the dashboard | Search + filters replace jumping; nobody pages to 74 |
| Catalan stemming quality, mixed-language posts | Per-locale configs (we know each variant's locale); trigram catches the rest |
| More URLs for crawlers (paginated archives) | That is the point: every post gets a path; category pages are topical hubs |

---

## 5. The validation engine

### 5.1 Barcelona-100 v2 — frozen and live

- **Frozen** (deterministic, offline, CI): for each site, a capture bundle: Playwright HAR
  (`.har.zip`, `content:'attach'`) of the interior page and the second page at 3 widths,
  screenshots of every state, the live-revealed link sets per trigger (behavioural ground
  truth), the link inventory. Stored in `.grabber-cache/v2/<id>/`; a committed manifest
  (`tests/grabber/corpus-v2.json`) pins ids, dates and hashes. Replayed with
  `routeFromHAR(…, { notFound: 'abort' })` and service workers blocked; sites using
  websockets or service-worker-served assets are marked (known HAR limits).
- **Live** (weekly, scheduled): the same suite against the live sites, diffed against last
  week — drift, new patterns, regressions in the wild.
- The corpus grows: every production certificate failure is a candidate for the corpus (with
  the owner's consent), so the gate learns from the field.

### 5.2 The certificate (per site, in product) — and the corpus gate (CI)

The same suite runs in two places: on every production capture (the **certificate**, which
decides B / C), and over the whole corpus in CI (the **gate**, which decides whether a code
change ships).

| # | Metric | How | Pass |
|---|---|---|---|
| V1 | **Pixels at rest** | Chrome box vs live, 390 / 820 / 1440, animations disabled, fonts ready, volatile regions masked (timers detected at capture) | ≤ 0.5% of pixels differ by > 16/255 **and** SSIM ≥ 0.98 |
| V2 | **Pixels per state** | Menu open, each dropdown open, scrolled | ≤ 1% |
| V3 | **Link fidelity** | Set of (absolute href, accessible name) in the replica vs live, all states | Equality: 0 missing, 0 extra |
| V4 | **Link health** | No `javascript:`, empty or dead-fragment link introduced by us; weekly HEAD check | 0 introduced (their own 404s are reported, not failed) |
| V5 | **Menu function** | Tap each trigger → links revealed *and* hit-testable (`elementFromPoint`) within 1s | Recall = 1.0 vs live; precision ≥ 0.95 |
| V6 | **Close + keyboard** | Second tap and Escape restore rest (V1 again); focus returns to the trigger | Pass |
| V7 | **Dropdowns** | Hover and focus each parent | Recall = 1.0 vs live |
| V8 | **Occlusion** | Revealed links hit-test to themselves; after scrolling 1,000px the sticky header's centre hit-tests to the header | 100% |
| V9 | **Body isolation** | Computed styles of 40 body elements × 12 properties, with vs without chrome | 0 differences |
| V10 | **Chrome isolation** | Computed styles of every chrome element × 20 properties, replica vs live | ≤ 0.5% of elements differ |
| V11 | **Console & CSP** | Errors from our code; CSP violations | 0 |
| V12 | **Weight** | Chrome HTML + CSS + fonts vs what their own page loads | ≤ theirs |
| V13 | **Crawler view** | Article text extractable by a rendering crawler *and* by two static parsers (parse5, htmlparser2) | Pass — else render the body in light DOM for crawlers |
| V14 | **Seam & harmony** | Body text and headings on the ground they actually sit on; vertical gap at the header/body seam vs their interior page's | AA (4.5:1 text, 3:1 large); gap within ±8px of theirs |

Thresholds are calibrated, not invented: on the lab's snapshot model 58 of 86 headers
measured **exactly 0** differing pixels at 16/255 at both widths (§1.3); 0.5% leaves room for
anti-aliasing and hinting noise between capture and replay. Pixel ratio answers "how much changed"; SSIM answers "would a
human still call it the same header" — both are required.

**Corpus ship criteria** (a code change to the capture or the renderer ships only if):

- ≥ **95%** of reachable sites certified at rest (V1) at all three widths (Mirror or Inside);
- **100%** of sites pass V3 — the "never hallucinate a link" guarantee is absolute;
- **100%** of sites have a working menu (V5/V8 in Mirror, or Safe Panel);
- ≥ **90%** of menus in Mirror replay (not Safe Panel);
- **0** sites failing V9 (our body untouched by their CSS) or V11.

### 5.3 Testing the tests — the mutation suite

Every gate must fail when it should. A fixed set of injected faults runs against five corpus
sites on every change to the harness: drop one used CSS rule; delete one nav link; change one
href; map a trigger to the wrong target; give the blog host `z-index:9999`; leave one
`<script>` in the snapshot; shift the header 2px. **Required kill rate: 100%.** A gate that
cannot see a planted bug is not a gate.

### 5.4 Performance gates

| Gate | When | What it asserts |
|---|---|---|
| **`test:scale`** (new) | Every commit | The real render core + loaders against an in-memory fake with N ∈ {0, 12, 100, 1k, 10k}: bytes, DOM nodes and **query count** (an instrumented client counts calls — the N+1 detector) constant within ±5%; render time ±20% |
| **`test:queries`** (new) | Nightly | A seeded Postgres (Supabase branch) with sites of 100 / 10k / 100k posts and 1M page views: `EXPLAIN (ANALYZE, BUFFERS)` on every hot query — must use its intended index, ≤ 20ms, buffers under a fixed ceiling |
| **`test:tags`** (new) | Every commit | Every cacheable route response carries the expected `Vercel-Cache-Tag` set; every mutation calls the invalidation map's tags |
| **`test:vitals`** (extend) | Before release | Public blog routes (page 1, page 5, an article) with 10 real Mirror chromes, Lighthouse 13 mobile: §4.6 budgets; inline-vs-external CSS decision |
| **`test:perf`** (extend) | Every commit | Blog HTML bytes per class with real chromes; RSC payload per dashboard route |
| **`test:mirror`** (new) | Every commit (frozen 20-site subset) · nightly (frozen 100) · weekly (live 100) | §5.2 V1–V14 + ship criteria |
| **Production probes** | Every 15 min | 5 blogs × {page 1, page 5, article}: `x-vercel-cache`, TTFB; Speed Insights p75 LCP/INP/CLS per route; alert on regression |

---

## 6. Roadmap — waves with exit gates

| Wave | Content | Exit gate | Effort |
|---|---|---|---|
| **W0 — stop the bleeding** | No new infrastructure. Disable `rebuild`/`harmonise` adoption for sites with a website. Sites whose static capture is faithful keep it; the rest get the honest floor — their logo, their **complete** header link tree and their footer's legal links in a plain bar in their own fonts and colours, no archetype. Strip **all** customer scripts from captured regions (security, R4); scan `<body>` stylesheets (R3); a generic SAFE PANEL on the static capture (their burger opens our panel with their full link tree). `Vercel-Cache-Tag` + granular tags; pagination v0 (12 per page, `/page/N`, sitemap) | Every corpus site: links 100% (V3) and a working menu; tags verified in prod (publish → purge observed) | ≤ 1 week |
| **W1 — L'INSTANT data** | Migration 041; keyset + counters in the dashboard; rollups; search; per-tab streaming; interactions counter; `test:scale`, `test:tags`, `test:queries` | Scale invariance holds at 10k; dashboard RSC ≤ 60KB | 2–3 weeks |
| **W2 — EL MIRALL capture** | Browser capture service (queue, egress guard, pinning); interior-page choice; boundary on the built DOM + template validation; snapshot; coverage harvest; behaviour recording; `mirall.js`; assets; variants; migration 040; render integration; progressive onboarding | §5.2 ship criteria on the frozen corpus | 4–5 weeks |
| **W3 — the validation engine** | Barcelona-100 v2 bundles; `test:mirror`; the mutation suite; weekly live run; research scripts promoted into `tests/` | Mutation kill rate 100% | 2 weeks (overlaps W2) |
| **W4 — INSIDE** | WordPress plugin v1.0 (server-side, routing, head, sitemap, purge webhook, fallback); `/blog` proxy recipes | 10 real WordPress installs (Elementor, Divi, WPBakery, Astra, Gutenberg) pass V3/V5 natively and V13 | 2–3 weeks |
| **W5 — domains & ownership** | Tenant domain + PSL submission; 301s; `__Host-` cookies; ownership verification before publish; blog CSP | Old URLs 301; app cookies unreadable from tenant pages | 1–2 weeks (+ PSL lead time, outside our control) |
| **W6 — optional escalation** | Native-JS minimal sets (ddmin) for owner-domain blogs whose replay fails | Opt-in only | 2 weeks |

---

## 7. Costs

| Item | Monthly at 1,000 sites | at 10,000 sites |
|---|---|---|
| Captures (weekly + onboarding + on-demand) | ≈ $10–15 | ≈ $90–130 |
| Daily fingerprints | ≈ $1 | ≈ $10 |
| Capture storage (3 versions/site) | ≈ 1.5GB | ≈ 15GB |
| CDN / functions | **Down**: hit rate replaces 5-minute refetches | **Down** |
| Engineering | W0–W5 ≈ 11–14 weeks; W6 optional | — |

---

## 8. What this plan refuses to do

- **No model writes chrome** — no markup, no CSS, no label, no URL. Generation is for bodies,
  and for chrome only where no website exists.
- **No iframe chrome** (dropdowns clipped, sticky impossible across documents, two cascades),
  **no screenshot chrome** (inaccessible, unresponsive, links dead), **no per-request live
  proxy of their site** (their latency and their outages become ours).
- **No third-party script on a Carma domain.**
- **No virtualisation** of a list that pagination already bounds.
- **No "faithful" without a certificate**, and no certificate without a mutation-tested gate.
- **No publishing a clone of a domain the account does not own.**
- **No number in this document that was not measured or sourced** (Appendix A, B).

---

## 9. Decisions for the founder

1. **Approve EL MIRALL** (§3) — including deleting the generative rungs for customers with a
   website.
2. **Approve L'INSTANT** (§4).
3. **Tenant domain:** which registrable domain, and the PSL submission (W5).
4. **Inside first for WordPress?** Make the plugin's server-side mode the *recommended* path
   for WordPress owners (72% of our corpus) — it is the only mode where their JS, their
   menus and their domain authority are native. The hosted Mirror stays the zero-install
   default.
5. **Publish-to-CMS (A3):** offer it, or stay a host? (It wins on fidelity and SEO, loses our
   designed body and modules.)
6. **Native-JS escalation (W6):** allow it on owner-controlled domains, or keep SAFE PANEL as
   the floor?

---

## Appendix A — Reproduce every number

```bash
# I1 corpus audit and I2 render weight run the REAL engine over .grabber-cache (git-ignored)
node --experimental-strip-types --no-warnings --import ./tests/register.mjs .grabber-cache/research/corpus-audit.mjs
node --experimental-strip-types --no-warnings --import ./tests/register.mjs .grabber-cache/research/render-weight.mjs
# I3 chrome lab — LIVE sites, real Chrome (CHROME at C:/Program Files/Google/Chrome)
node --experimental-strip-types --no-warnings --import ./tests/register.mjs .grabber-cache/research/chrome-lab.mjs .grabber-cache/research/chrome-lab.json --conc=4
# I4 chrome CSS coverage · I5 cross-viewport
node --experimental-strip-types --no-warnings --import ./tests/register.mjs .grabber-cache/research/chrome-css.mjs .grabber-cache/research/chrome-css.json --every=3
node .grabber-cache/research/cross-viewport.mjs .grabber-cache/research/cross-viewport.json
node .grabber-cache/research/summarise.mjs   # merges the runs → summary.json
```

Live measurements drift as the sites change; the frozen bundles of W3 end that.

## Appendix B — Sources

Verified directly for this plan: Google Search Central, *Fix Search-related JavaScript
problems* (shadow DOM flattening, updated 2025-12-18) ·
GitHub Engineering, *Yummy cookies across domains* · Vercel changelog, *Tag-based cache
invalidation now available for all responses* (2026-01-28) · PostgreSQL 15/18 docs,
*psql Support* (`catalan_stem`) · Chrome for Developers, *Optimize DOM size* insight · Next.js
16.2.6 bundled docs (`cacheLife.md`, `updateTag.md`, `revalidateTag.md`).

Reported by the research agents with primary links (spot-checked, not all re-read):
Vercel docs (CDN purge, cache-control headers, runtime cache, functions limits and pricing) ·
PostgREST counting · use-the-index-luke · Google pagination guidance · web.dev Core Web Vitals
thresholds and TTFB · Supabase Cron and extensions · DropInBlog, HubSpot, Superblog, Feather,
Hashnode, Outrank, Koala, WordPress Application Passwords · web.dev Declarative Shadow DOM,
caniuse `@scope` · Bar-Yossef & Rajagopalan (WWW 2002), Yi/Liu/Li (KDD 2003), Gibson/Punera/
Tomkins (WWW 2005), Vieira et al. (CIKM 2006) · rrweb, Crawljax, Webrecorder · Playwright
`routeFromHAR` and its service-worker / websocket issues (#29474, #17848) · `@sparticuz/chromium`,
Cloudflare Browser Rendering pricing · pixelmatch, odiff, ssim.js · Zeller & Hildebrandt, *ddmin*
(TSE 2002), Muzeel (arXiv 2106.08948), Lacuna · AEPD *Guía sobre el uso de las cookies*,
CJEU C-40/17 *Fashion ID* (secondary sources) · W3C WAI-ARIA disclosure navigation pattern.
