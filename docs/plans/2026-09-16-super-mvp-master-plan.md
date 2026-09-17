# Carma Super MVP — Master Architecture & UX Plan

**Date:** 2026-09-16
**Status:** DRAFT — awaiting founder review
**Scope:** 5-phase overhaul — Brand Brain onboarding, WP discovery, performance, render engine, editor UX
**Stack as built:** Next.js 16.2.6 · React 19.2.4 · Tailwind 4.3 · TipTap 3 · Supabase · Vercel

---

## 0. How to read this

Section 1 is **diagnosis** — what I actually found in the code, with file:line. Section 2 is the
**keystone decision** everything else hangs off. Sections 3–7 are the five phases. Section 8 is
sequencing, section 9 is risk, section 10 is the decisions I need from you.

Every claim below is from reading the repo, not from assumption. Where I'm proposing a behaviour
change that could break something for an existing customer, it's marked **⚠ BREAKING**.

---

## 1. Diagnosis

### 1.1 The render engine is not a Next.js app — it's a string builder behind a Route Handler

This is the root cause of "the blog is extremely slow even with no content", and of the ugly links.

| Fact | Evidence |
|---|---|
| The public blog is a **Route Handler**, not a page | `src/app/render/[siteId]/route.ts`, `src/app/render/[siteId]/[slug]/route.ts` |
| Both are `export const dynamic = 'force-dynamic'` | `route.ts:16` (both files) |
| HTML is assembled as a string | `src/lib/render/theme.ts` (1390 lines) + `src/lib/render/modules.ts` (891 lines) |
| The blog body is wrapped in a Declarative Shadow DOM | `theme.ts:1–25` header comment |
| Browser caching is **disabled** | `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=86400` — `route.ts:120` |

**What this costs, per request:**

1. `max-age=0` means the browser revalidates on **every** navigation — back/forward and repeat visits
   always hit the network. There is no such thing as an instant second page view today.
2. `s-maxage=60` means the edge re-fetches from origin every minute. On a low-traffic blog that is
   effectively *every* visitor paying origin latency.
3. Origin work = Supabase lookup for the site, then a parallel theme + posts query, then a full
   string build of the whole document. Two to three round trips to Supabase before a byte ships.
4. `force-dynamic` disables static generation, PPR, streaming, RSC, `<Link>` prefetching and
   `next/image` — *all of it*, permanently.

**And the invalidation layer is dead code.** There are ~8 `revalidatePath('/render/…')` call sites
(`lib/actions/posts.ts:250`, `lib/actions/theme.ts:111`, `lib/whatsapp/publish.ts:108`,
`app/review/[token]/actions.ts:166`, …). A `force-dynamic` route has nothing to revalidate. The code
even admits it at `lib/actions/posts.ts:358`. So we pay a 60-second staleness window *and* maintain
invalidation code that does nothing.

### 1.2 The real reason it's slow with no content: we ship the customer's entire `<head>`

`theme.ts:764–782`, `sanitizeInjectedHead()`. We inject `extracted_head` — the cloned site's real
stylesheets, font links and **scripts** — into every Carma blog page. The comment is explicit:

> *"Scripts are KEPT — the client's own site JS powers its native menus."*

For a cloned WordPress site that means jQuery, Elementor/Divi CSS, 10–20 plugin stylesheets, and
whatever tag manager they run, all render-blocking, all cross-origin, on every article. An empty
Carma blog inherits the full weight of a fat WordPress theme. **This is the slowness.** Nothing in
Phase 3 or Phase 4 matters until this is fixed.

### 1.3 Ugly links are hardcoded

```ts
// src/lib/render/theme.ts:212-216
function articleUrl(siteId: string, post: Post, locale: Locale): string {
  const path = `/render/${siteId}/${encodeURIComponent(slug)}`   // ← line 214
  return needsLang ? `${path}?lang=${locale}` : path
}

// src/lib/render/theme.ts:224-226
function listingUrl(siteId: string, locale: Locale): string {
  return `/render/${siteId}?lang=${locale}`                      // ← always a query param
}
```

Subdomain routing already works (`src/lib/supabase/middleware.ts:11–26` rewrites
`sub.carma.cat/hola-mon` → `/render/sub/hola-mon`). But every link the renderer *emits* is the
canonical UUID path. So a visitor on `blog.carma.cat` clicks an article and lands on
`blog.carma.cat/render/8f3a…-…/hola-mon`. The pretty URL exists; we just never link to it.

Language is a query param on every listing link — no locale path segments, no clean `hreflang`
structure, and `?lang=` URLs are weak SEO.

`/blog` (`src/app/blog/route.ts`) is a `force-dynamic` handler that does a DB query and then a 302.
Two round trips to reach a blog that should be a static redirect.

### 1.4 The app is 100% dynamic — no caching primitive is in use anywhere

Verified across all 278 `.ts`/`.tsx` files in `src/`:

- `use cache` — **0 occurrences**
- `cacheLife` / `cacheTag` / `updateTag` — **0**
- `generateStaticParams` — **0**
- `next/image` — **0**
- `cacheComponents` in `next.config.ts` — **not enabled**

`next.config.ts` (34 lines) configures only tunnel origins, `poweredByHeader` and `reactStrictMode`.

### 1.5 Every navigation blanks the screen

```tsx
// src/components/ui/RouteLoader.tsx:16
<div className={`fixed inset-0 z-20 flex items-center justify-center bg-bg ${fullscreen ? '' : 'lg:left-60'}`}>
```

An **opaque, full-viewport overlay**. It is used by **14 `loading.tsx` files** — `app/loading.tsx`,
`app/(app)/loading.tsx`, dashboard, settings, karma, agent, studio, sites/[id], sites/[id]/posts,
admin, admin/users, admin/agent, admin/grabber-lab, benvinguda, edit/[siteId], review/[token].

So the *entire* content area goes blank-gold-knot on every single route change, regardless of whether
the data behind it is 40ms or 4s away. This is the "loading screens last too long" complaint, and it
is a structural choice, not a slow query.

### 1.6 Auth costs a network round trip before every page

`src/proxy.ts` matches nearly everything and calls `updateSession()`, which calls
`supabase.auth.getUser()` (`src/lib/supabase/middleware.ts:53–55`). That is a live HTTP call to the
Supabase Auth server **before Next.js starts rendering**. Then `AppShell` awaits `getSession()` plus
three more queries (`sites`, `locale`, `karma` — `components/shell/AppShell.tsx:34–38`), and each
page awaits 2–5 more.

Rough budget for one dashboard navigation today: middleware auth (~100–300ms) + layout session and
3 queries (~150–250ms) + page queries (~150–250ms) = **0.4–0.8s of blocking server work, behind an
opaque overlay.** That is exactly what "sluggish" feels like.

### 1.7 Editor

- **Title is a single-line `<input>`** — `components/editor/PostEditorClient.tsx:1314–1321`,
  `text-4xl sm:text-5xl`, `lineHeight: 1.1`. A long title scrolls horizontally and you can never see
  it whole. Confirmed exactly as reported.
- **Language switcher is a cramped segmented control** — `PostEditorClient.tsx:1085–1173`. Two-letter
  uppercase codes, a 6px coloured dot whose meaning is only in a `title` attribute, a cryptic `·def`
  suffix, a **hover-only** `✕` to remove a language (unreachable on touch), and an unlabeled `+` icon
  that opens a searchable dropdown. It sits in the top bar centre competing with the breadcrumb and
  the publish button. "Hidden and highly unintuitive" is an accurate description.
- The file is **2111 lines** in one client component.

### 1.8 Onboarding and the Brand Brain

- `SiteOnboarding.tsx` (461 lines) is a `fixed inset-0 z-40` overlay rendered inside
  `SiteDetailClient` with `useState` step tracking. **No URL, no back button, no resume on refresh.**
- Path 1 accepts a URL only. `/api/onboarding/detect` answers one question: does this site have a
  blog (`Detected` type, `SiteOnboarding.tsx:36–45`). There is no brand analysis at onboarding time.
- The brand profile infrastructure **exists but starts empty**: `site_brain_profiles`
  (migration 030), read by `lib/whatsapp/persona.ts:271–288`, generated **offline from published
  posts** and classified `seed` below `WA_PROFILE_MIN_POSTS` (`lib/whatsapp/profile.ts:63–65`).
  **A brand-new user's agent therefore knows almost nothing about their brand on turn one.** That is
  the single biggest gap between what's built and the "specialized Agent Brain" you're describing.
- No brand-document upload. No voice-note brand intake (though Whisper is already wired for article
  dictation in `lib/whatsapp/transcribe.ts`).
- Templates: 8 exist (`aperture`, `editorial`, `beacon`, `noir`, `terra`, `carma`, `pulse`,
  `atelier`). Cards are already fully clickable with a single "Continua" bar (good — that's the
  2026-07-13 overhaul). But **none is preselected**, so the CTA starts dead: *"Toca una plantilla per
  triar-la"*.
- WhatsApp step (`ConnectAgentStep.tsx`, 260 lines) has the right bones — a `wa.me` deep link with
  the code pre-typed (`waMeLink(agentNumber, 'Carma ' + code)`, line 98) and auto-completion by
  polling. But the **phone input comes first** (line 153) and the button second. It's a good card. It
  is not a portal to the future.
- It correctly says nothing about WordPress. ✅

### 1.9 What's already good (do not rebuild)

- The Punts de Carma economy is real: atomic ledger, per-plan allocations, costs anchored to
  "1 article = 100 punts" (`lib/karma/config.ts`).
- The grabber has a measured eval harness — Barcelona-100, `npm run grabber:eval`, snapshot cache,
  `tests/grabber/baseline.json`, and `/admin/grabber-eval`. Engine v2 moved average 86→91 and footer
  84%→98%.
- The Living Brain (P0–P3) is code-complete behind `WA_BRAIN_V2`: two-tier Cortex, router v2,
  executors, transition table, nudges, upsell.
- The design system is coherent and genuinely premium: gold ramp + semantic tokens + shadcn mapping,
  accessibility-raised type scale, one signature easing (`globals.css:1–108`).
- `Button glow`, card-first surfaces, `gold-trace`, `zen-breathe`, `halo-drift` primitives already
  exist. **Phase 1's God-mode screen should compose these, not invent new ones.**

---

## 2. The keystone decision: turn on Cache Components

Next.js 16.2.6 ships **Cache Components** — `cacheComponents: true` in `next.config.ts`. It changes
the rendering model from "static or dynamic, per route" to "static and dynamic as a spectrum, per
component", with Partial Prerendering as the default behaviour.

What it gives us, mapped to your complaints:

| You said | Cache Components answer |
|---|---|
| "Blogs must load in <50ms" | Static shell served at CDN latency; `use cache` + `cacheTag` for the body |
| "Rip out blocking full-page loaders" | The PPR static shell *is* the instant response. `loading.tsx` becomes unnecessary |
| "Perceived load must be near-instantaneous" | `export const unstable_instant = { prefetch: 'static' }` **validates instant navigation at build time** and fails the build if a Suspense boundary is misplaced |
| "Move away from heavy blocking rendering" | `updateTag()` invalidates precisely on publish, instead of a 60-second staleness window |

The API surface we'll use (all verified present in `node_modules/next/dist/docs/`):
`use cache`, `cacheLife()`, `cacheTag()`, `updateTag()`, `revalidateTag()`, `connection()`,
`unstable_instant`, `generateStaticParams`.

**This is a migration, not a flag flip.** With Cache Components on, any uncached data access outside
a `<Suspense>` boundary becomes a build error (`Uncached data was accessed outside of <Suspense>`).
Across ~20 dynamic pages and 77 client components that is real work. Next ships a guide for exactly
this: `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`.

**Recommendation: do it, and do it first.** Phases 3 and 4 are both mostly *consequences* of this
switch. Doing them without it means building the same thing twice.

---

## 3. PHASE 4 — Render engine rewrite (do this first)

Listed fourth by you, sequenced first by me, because it is the keystone and because it's where the
"obliterates WordPress" claim is won or lost.

### 4.1 Route Handlers → React Server Components

**⚠ BREAKING (URLs).**

```
src/app/(blog)/
  layout.tsx                          ← minimal shell, no app chrome, no Ubuntu font
  [tenant]/
    page.tsx                          ← listing   (was render/[siteId]/route.ts)
    [slug]/page.tsx                   ← article   (was render/[siteId]/[slug]/route.ts)
    [locale]/page.tsx                 ← localised listing
    [locale]/[slug]/page.tsx          ← localised article
```

The middleware rewrite already targets `/render/<sub>/<path>`; we retarget it at the new segment and
add it to `RESERVED` in `lib/sites/domain.ts:14–18`.

`theme.ts` does not get deleted — its *builders* (token CSS, module parts, card markup) are reused.
What changes is that the **document** becomes JSX, so React owns streaming, Suspense, `next/image`
and `<Link>` prefetching. Concretely: `buildListingPage`/`buildArticlePage` keep producing the inner
blog markup; the `<html>/<head>/<body>` scaffold and the chrome become components.

### 4.2 Clean, automatic URLs

| Surface | Today | Target |
|---|---|---|
| Listing | `sub.carma.cat/render/<uuid>?lang=ca` | `sub.carma.cat/` |
| Article | `sub.carma.cat/render/<uuid>/hola-mon` | `sub.carma.cat/hola-mon` |
| Other locale | `…?lang=es` | `sub.carma.cat/es/hola-mundo` |
| Legacy | — | **308 → canonical, kept forever** |

The fix in code is small and surgical: `articleUrl()` and `listingUrl()` take a `linkBase` parameter
instead of hardcoding `/render/${siteId}`. Three call contexts:

- **Public blog** → `''` (site-relative: `/hola-mon`) — pretty URLs, same-origin, prefetchable
- **`/embed` fragment** (customer's own WordPress page) → absolute blog origin
- **Dashboard preview** → `/render/<uuid>` (unchanged, internal)

Locale becomes a path segment, default locale unprefixed. That kills the `?lang=` class of bugs
described at `theme.ts:218–223` at the source, and gives us real `hreflang` alternates.

Slugs stay automatic — `generateSlug()` already exists in the editor
(`PostEditorClient.tsx:102`). What's missing is **redirect-on-change**: renaming a published post's
slug silently 404s every existing inbound link. Add a `post_redirects` table (migration 032) and emit
308s. This is basic SEO hygiene and WordPress does it; we currently don't.

### 4.3 The Chrome Compiler — the actual speed fix

**⚠ BREAKING (behaviour), and this is the one I most need your decision on.**

Today we inject the customer's whole head at *render* time. Instead, compile it once at *capture*
time:

1. Fetch and parse every stylesheet the captured chrome references.
2. Run a used-selector pass **against the captured header/footer DOM only** — a site's chrome uses a
   few dozen rules out of tens of thousands.
3. Emit one minified critical-CSS blob → new column `site_themes.compiled_chrome_css`.
4. **Drop `<script>` by default.** Behind a per-site `chrome_scripts_enabled` flag for sites whose
   navigation genuinely needs JS; those get it `defer`red and after LCP.
5. Self-host the fonts — we already filter `font_links` to real font providers
   (`theme.ts:721–738`); go one step further and `preload` the `woff2` directly instead of paying
   the Google CSS hop, or move to `next/font/local`.

Result: one inline `<style>` in the static shell instead of N render-blocking cross-origin
stylesheets and a jQuery bundle. On a typical cloned WordPress site this is the difference between
~2.5s and <0.3s LCP.

**The cost:** some cloned hamburger menus will stop opening. That's why it needs the flag, and why it
needs to be *measured* — see 4.6.

### 4.4 Caching and invalidation that actually works

```tsx
// (blog)/[tenant]/[slug]/page.tsx  — shape, not final code
export const unstable_instant = { prefetch: 'static' }

export async function generateStaticParams() { /* top N published posts → prerendered at build */ }

async function Article({ tenant, slug }: { tenant: string; slug: string }) {
  'use cache'
  cacheLife('max')                      // no time-based expiry — we invalidate on publish
  cacheTag(`site:${tenant}`, `post:${tenant}:${slug}`)
  // …
}
```

Then `updateTag('site:' + siteId)` on publish / edit / theme-save. The ~8 currently-dead
`revalidatePath` call sites become **real, precise, instant invalidation**. No 60-second window.

**Paywall becomes cheap.** Today a paywalled article forces `private, no-store` for the *whole*
page (`render/[siteId]/[slug]/route.ts:204–206`), so every paywalled site loses all edge caching.
Under PPR, only the gated section sits behind `<Suspense>`; the article shell stays static and
cached. Same for the owner-only admin edit bar.

### 4.5 Images

Zero `next/image` today. Wire a custom loader at the existing `/api/img` proxy so the blog gets
`srcset`, AVIF/WebP and lazy-loading for free. `fetchpriority="high"` on the LCP hero, lazy below the
fold. `responsiveCardImage` / `responsiveFeaturedImage` (`lib/render/image.ts`) already exist — this
is a rewire, not a rewrite.

### 4.6 Prove it, don't assert it

- Extend the grabber eval scorecard with a **`chromeFidelity`** metric: screenshot the source chrome
  and the Carma render, compare with SSIM, gate on a threshold. This turns "we think the clone is
  close" into a number, and it's how we safely ship the Chrome Compiler.
- Add a perf gate to `npm run test:render`: assert the blog routes appear as **prerendered** in
  `next build` output, and that no page ships a cross-origin render-blocking stylesheet.
- `useReportWebVitals` → the existing `/api/track` endpoint, so LCP/INP/CLS are measured in
  production rather than assumed.

**Targets:** blog TTFB <50ms from edge · LCP <1.0s on 4G · zero render-blocking third-party CSS.

---

## 4. PHASE 3 — Extreme performance & loader purge

### 3.1 Delete the 14 full-screen loaders

Replace with a three-tier model:

| Tier | When | What the user sees |
|---|---|---|
| **Instant** | Navigation between cached app routes | The PPR static shell — sidebar, page header, card frames — immediately |
| **Skeleton** | A section's data is genuinely in flight | Card-shaped skeletons *inside* the bento grid: same radius, same gap, same shimmer. Never an overlay |
| **Ceremony** | Magic Wand capture, Studio boot | Keep `RouteLoader` — here the wait *is* the product, and the endless knot earns its place |

Optimistic UI everywhere a mutation is predictable: publish toggle, title edit, card reorder, module
toggle. The article-card work already established this pattern — extend it.

### 3.2 Stop paying for auth on every request

`supabase.auth.getUser()` in middleware is a network call before render. The middleware only decides
*redirect vs continue* — it doesn't need a server round trip for that. Use
`supabase.auth.getClaims()` (local JWKS signature verification, no network) for the routing decision,
and keep `getUser()` inside the server components that actually establish a trust boundary.

> **Verify first:** confirm `getClaims()` exists in the installed `@supabase/supabase-js ^2.106.1` /
> `@supabase/ssr ^0.10.3` before building on it. If not, the fallback is narrowing the matcher so
> fewer requests pay the call.

Also narrow `src/proxy.ts`'s matcher — it currently catches nearly everything. Exclude `api/`,
`embed/`, and all static assets.

### 3.3 Cache the app shell

`AppShell` fetches sites + locale + karma on every entry. Sites and locale are stable per user →
`use cache` + `cacheTag('user:' + userId)`, invalidated by site mutations. **Karma changes often →
stream it in its own `<Suspense>`** so the sidebar paints instantly and the punts counter fills in.

### 3.4 Bundle

- `optimizePackageImports` for `lucide-react` (~1000 icons) and `@tiptap/*`.
- Audit `framer-motion` (12.40) against Next 16's native `viewTransition` config — some of it is
  probably replaceable, and View Transitions are compositor-driven.
- Split `PostEditorClient.tsx` (2111 lines). TipTap is already lazy (`line 41`); push the
  settings/SEO/AI drawer behind its own lazy boundary and only mount the active tab.
- Honour the existing animation policy from the July perf work: compositor-only properties, no idle
  repaints, `.gold-trace-live` stays a singleton.

---

## 5. PHASE 1 — The Brand Brain & magical onboarding

### 1.1 Onboarding becomes a real route

`fixed inset-0` overlay + `useState` → `/comenca/[step]`. URL-driven, back button works, refresh
resumes, each step gets its own PPR shell. Today a refresh mid-onboarding loses everything.

### 1.2 One door, not two

Replace the two-card chooser with a single surface that accepts anything:

> **Explica'ns qui sou.**
> Enganxa la teva web · deixa anar els teus documents · o prem i parla.

- **URL** → clone + deep brand scrape
- **Files** (PDF / DOCX / brand guide / deck) → parse → Brand Brain
- **Voice** (hold to talk) → Whisper → Brand Brain. `lib/whatsapp/transcribe.ts` is already wired
- **Nothing** → "Encara no tinc web" → templates

The system picks the path. The user answers one human question.

### 1.3 The Brand Brain — the centrepiece

New module `src/lib/brand/`. A **capture-time** deep analysis, run once, producing a versioned brand
record that exists **before registration completes** and is claimed at signup.

**Inputs:** home + about + 3–5 deep pages, `og:` and schema.org metadata, the extracted design
tokens, uploaded documents, the voice note.

**Output** (one structured LLM pass over a distilled corpus):

```
identity     name · tagline · what they actually sell · proof points
audience     who · register · the problem they're paying to solve
voice        tone descriptors · register · banned words · sentence-length profile
             · emoji policy · 3–5 VERBATIM sentences from their own site
pillars      content themes · existing coverage · gaps
visual       design tokens · logo · imagery style
constraints  claims they must never make
```

The **verbatim sentences** are the highest-leverage field in the whole plan. Few-shot exemplars in
the brand's own words beat any quantity of adjectives for making generated articles sound like them.

**It plugs into what already exists.** Extend migration 030's `site_brain_profiles` with a `brand`
JSONB and `source='onboarding'`. `persona.formatBrainProfile()` (`lib/whatsapp/profile.ts:114–133`)
then picks it up **on turn one**. This eliminates the `seed` / `WA_PROFILE_MIN_POSTS` cold start
entirely — the agent knows the brand before the first article exists.

Pre-registration storage: an `onboarding_captures` row keyed by a signed cookie token, claimed on
signup. (Check whether `provisionOnboardingSite` can be reused before adding a table.)

### 1.4 "TOTAL precision" on header/footer

The extraction is already measured and good (avg 91, footer 98%). The remaining fidelity gap is not
extraction — it's **render fidelity**: the injected head and the shadow-DOM boundary. The Chrome
Compiler (§4.3) *is* the precision upgrade, and the SSIM pixel-diff gate (§4.6) is how we prove it
site by site instead of eyeballing it.

### 1.5 Templates

Preselect the first template so "Continua" is live on arrival. Arrow-key navigation. The 8 live
iframe previews already `loading="lazy"` — add `content-visibility: auto` so off-screen ones cost
nothing.

### 1.6 The God-Mode WhatsApp connection

Reorder the screen so the **button is the hero and the phone number is derived**.

- Full-bleed canvas, one gold monolith, composed from primitives that already exist:
  `gold-trace-aura`, `zen-breathe`, `halo-drift-a/b`, `Button glow`. Don't invent new motion — the
  brand language is already there and the July perf rules constrain it (compositor-only).
- **The button opens `wa.me/<agent>?text=Carma <code>` directly.** On mobile that's one tap: WhatsApp
  opens with the code already typed. They send it. The webhook learns their number. **Zero typing.**
  `waMeLink()` already does this (`ConnectAgentStep.tsx:98`) — it's just not the primary action.
- Desktop: the same button reveals a **QR of the same link**. Still zero typing.
- `PhoneInput` demotes to a small "o introdueix el teu número" secondary link.
- Still says nothing about WordPress. ✅

---

## 6. PHASE 2 — Dashboard & WP discovery

### 2.1 The WordPress moment

On first dashboard entry after a clone where the detector found WordPress, a **card-first discovery
panel** (not a modal, not a wall of text):

> **Hem trobat WordPress a la teva web.**

Three honest cards with the real trade-off on each:

1. **Plugin** — keeps their domain, free, articles appear on their existing site
2. **Import here** — bring the articles into Carma, free
3. **Not now** — dismissible, rediscoverable from the site page

`IntegrationGuide.tsx` is 1375 lines today. This is where it lives, and it needs to become three
cards plus a progressive-disclosure detail view — not a manual.

### 2.2 Free-tier restrictions, done elegantly

The economy is built. What's missing is the *surface*:

- **Pre-flight cost disclosure.** Every AI action shows its price before you press it — "Escriure
  article · 80 punts". No surprise 402s. Costs are already centralised in `lib/karma/config.ts`.
- **A calm meter, not a nag.** The sidebar counter exists. It should feel like fuel, never like a
  paywall.
- **Warm upsell on empty.** When punts run out, the WhatsApp reply is an invitation, not an error.
  `lib/whatsapp/upsell.ts` exists — wire it to the real empty state.
- **Front-load the rewards so the magic lands first.** Free = 100 punts/month = one article and
  change. Surface `benvinguda` (+25) and `primer_article` (+50) *during* onboarding so a free user
  publishes two articles in month one and feels the product before meeting the wall. The wall should
  arrive after the delight, never before it.

---

## 7. PHASE 5 — Editor UX revolution

### 5.1 Title — auto-expanding

`<input type="text">` → `<textarea rows={1}>` with `field-sizing: content` (Chrome/Edge 123+) and a
`scrollHeight` sync fallback for Safari and Firefox. Enter moves to the body instead of submitting.
Wraps to as many lines as it needs. Never scrolls horizontally.

### 5.2 Language switcher — out of the top bar, into the canvas

Move it to where language actually lives: a labeled control at the head of the writing canvas, above
the title.

```
┌──────────────────────────────────────┐
│  🌐  Català · per defecte        ▾   │   ← a real button with a real label
└──────────────────────────────────────┘
        ↓ opens
  ✓ Català      per defecte    100%  ⋯
    Español                     40%  ⋯
    English                      0%  ⋯
  ─────────────────────────────────────
  ＋ Afegeix un idioma
  ✨ Tradueix a tots
```

- A real dropdown button with a visible language name — not a 2-char code.
- Completion % shown as a number, not an undocumented coloured dot.
- "per defecte" spelled out, not `·def`.
- Remove / set-as-default live in a per-row `⋯` menu — **no hover-only affordances**, so it works on
  touch.
- Keep a compact pill row on wide screens for one-click switching; the dropdown is the discoverable
  path.
- New: **"Tradueix a tots"** bulk action.

### 5.3 Other editor wins (you asked me to think — these are the ones worth doing)

| Problem | Fix |
|---|---|
| Slug only appears after a title, and is a bare mono input | Always visible as `host/slug` with a lock icon showing auto vs manual |
| Renaming a published slug silently 404s every inbound link | Warn, and offer to keep a 308 — needs the `post_redirects` table from §4.2 |
| A dropped connection can lose writing | Autosave failures must be loud and recoverable: retry + IndexedDB local draft |
| The whole settings/SEO/AI drawer mounts at once | Lazy tabs, mount only the active one |
| The top bar hides half its controls at `sm` | The editor is where WhatsApp users land to fix a draft — it must work one-handed |
| Cover generation exists only in the WhatsApp path | Wire `lib/whatsapp/coverImage.ts` into the editor as "Genera una portada" |
| Pasting from Word/Docs imports junk spans | TipTap paste sanitizer — a classic CMS killer |

---

## 8. Sequencing

Two tracks after one shared prerequisite.

```
        ┌─────────────────────────────────────────┐
  PRE   │  Cache Components migration             │  ← blocks both tracks
        │  cacheComponents: true + Suspense pass  │
        └────────────────┬────────────────────────┘
                         │
        ┌────────────────┴───────────────┐
        │                                │
   ENGINE TRACK                    EXPERIENCE TRACK
   ───────────────                 ────────────────────
   Phase 4  render rewrite         Phase 1  Brand Brain + onboarding
   Phase 3  loader purge           Phase 5  editor UX
            perf + measurement     Phase 2  WP discovery + punts
```

**Why Phase 4 first, despite being listed fourth:** it's the keystone. Phase 3's wins are largely the
same wins. Every other phase renders through it. Doing Phases 1/2/5 first means building against an
engine we're about to replace.

**Phase 5 is fully parallel** — the editor touches none of the render or cache work, so it can run
alongside from day one.

Your call on order; this is my recommendation, not a constraint.

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **`cacheComponents: true` is a breaking migration.** Every uncached access outside `<Suspense>` becomes a build error across ~20 pages and 77 client components | Follow `next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`. Budget days, not hours. Use `unstable_instant = false` to exempt routes and migrate incrementally |
| R2 | **Dropping cloned `<script>`s breaks some cloned menus** | Per-site `chrome_scripts_enabled` flag, default off for new sites, on for existing. Gate the rollout on the SSIM fidelity metric |
| R3 | **Changing article URLs breaks every existing inbound link** | 308 from `/render/<uuid>/<slug>` → canonical, kept permanently. Never remove it |
| R4 | **Migration 031 (`grabber_eval`) is still pending in production** | Pre-flight: confirm 028–030 are applied and apply 031 before any Phase 1 or 2 work builds on them |
| R5 | `getClaims()` may not exist in the installed Supabase SDK | Verify before building; fallback is narrowing the middleware matcher |
| R6 | The render rewrite touches the most load-bearing code in the repo | `npm run test:render` (247 invariants) is the safety net. Extend it *before* the rewrite, not after |
| R7 | Scope. Five phases is a quarter, not a sprint | The two-track split lets Experience ship visible wins while Engine does the deep work |

---

## 10. Decisions I need from you

1. **Cache Components migration — go or no-go?** Everything in Phases 3 and 4 assumes yes. If no, the
   fallback is much weaker: `s-maxage` tuning and manual `unstable_cache`, and we keep the 60-second
   staleness window.

2. **Chrome Compiler — drop cloned `<script>`s by default?** This is the single biggest speed win
   available and the one real behaviour change. My recommendation: yes, behind a per-site flag, gated
   on the SSIM metric. Some cloned hamburger menus will need the flag turned back on.

3. **Sequencing — accept Engine-first, or run your 1→5 order?** I recommend Engine-first for the
   reason in §8; you know the customer pressure better than I do.

4. **Brand Brain scope for v1.** Full version = URL + documents + voice. A leaner v1 = URL-only deep
   scrape (still eliminates the cold start, ships much faster), with documents and voice in v1.1.
   Which?

5. **URL migration.** Confirm you're happy to change every public article URL, with permanent 308s
   from the old ones. This is required for pretty links and it is irreversible in practice.

---

## Appendix A — Tooling installed for this work

19 plugins installed this session (6 you specified, 13 researched for these five phases):

**Yours:** `core-3d-animation` · `extended-3d-scroll` · `animation-components` · `authoring-motion` ·
`meta-skills` · `web-performance-optimization`

**Added:** `nextjs` (Next 16 caching/edge — critical given the stack is post-cutoff) ·
`web-performance-audit` · `image-optimization` · `seo-optimizer` · `react-best-practices` · `motion` ·
`interaction-design` · `design-system-creation` · `internationalization-i18n` · `tailwind-v4-shadcn` ·
`wordpress-plugin-core` · `frontend-design` · `mobile-first-design`

> Plugin skills load at session start, so these become invokable **next session**. Not a blocker for
> plan review.

## Appendix B — Files this plan touches most

| Area | Files |
|---|---|
| Render | `app/render/[siteId]/route.ts` · `app/render/[siteId]/[slug]/route.ts` · `app/blog/route.ts` · `lib/render/theme.ts` (1390) · `lib/render/modules.ts` (891) |
| Routing | `next.config.ts` · `src/proxy.ts` · `lib/supabase/middleware.ts` · `lib/sites/domain.ts` |
| Perf | 14× `loading.tsx` · `components/ui/RouteLoader.tsx` · `components/shell/AppShell.tsx` |
| Onboarding | `dashboard/sites/[id]/SiteOnboarding.tsx` · `ConnectAgentStep.tsx` · `SiteDetailClient.tsx` · `api/onboarding/detect` |
| Brand Brain | **new** `lib/brand/*` · `lib/whatsapp/profile.ts` · `lib/whatsapp/persona.ts` · migration 030 |
| Editor | `components/editor/PostEditorClient.tsx` (2111) |
| WP | `dashboard/sites/[id]/IntegrationGuide.tsx` (1375) · `ImportModal.tsx` (820) |
| Punts | `lib/karma/config.ts` · `lib/karma/karma.ts` · `lib/whatsapp/upsell.ts` |

---

*Card-first, gold-first, premium throughout. The design system in `globals.css` is not up for
renegotiation in any phase — every new surface composes its existing tokens and motion primitives.*

---

# BUILD LOG — Engine + UX track, 2026-09-16

All five decisions approved. Phases 4 and 5 built. Status of every item in the plan.

## Shipped

### Phase 4 — Render engine

| Item | Status | Where |
|---|---|---|
| Cache Components enabled | ✅ | `next.config.ts` — `cacheComponents: true` |
| `force-dynamic` removed from the blog | ✅ | 40 route-segment exports stripped across 30 files |
| Cached, tagged render core | ✅ | **new** `lib/render/blogRender.ts` — `use cache` + `cacheLife('days')` + `cacheTag` |
| Cache policy in one place | ✅ | **new** `lib/render/cache.ts` — cacheability, tags, link context |
| Dead invalidation made real | ✅ | 11 call sites → `updateTag` (Server Actions) / `revalidateTag` (route handlers) |
| Clean URLs | ✅ | `theme.ts` `LinkCtx`; tenant path emits `/hola-mon`, canonical keeps `/render/<uuid>/…` |
| Locale as a path segment | ✅ | **new** `render/[siteId]/[...path]/route.ts`; `?lang=` only where no localised slug exists |
| Slug-rename 308s | ✅ | migration 032 `post_redirects` + `recordSlugRedirects` in `actions/posts.ts` |
| Chrome Compiler | ✅ | **new** `lib/scrape/chromeCompiler.ts`, wired into the capture SSE pipeline |
| Scripts dropped by default | ✅ | `stripCompiledHead`, behind `site_themes.chrome_scripts_enabled` |
| Fidelity gate | ✅ | **new** `tests/chrome-fidelity.mjs` — `npm run test:fidelity` |

### Phase 3 — landed early (it rides the same migration)

| Item | Status | Where |
|---|---|---|
| Opaque full-screen loaders purged | ✅ | 14 → 5. Two deleted, nine became shaped skeletons |
| Shaped skeletons | ✅ | **new** `SectionSkeleton.tsx` (bento/list/form/split), `AppShellSkeleton.tsx` |
| App group streams behind its shell | ✅ | `(app)/layout.tsx` Suspense boundary |
| Landing cached per locale | ✅ | `app/page.tsx` — `use cache` keyed on locale, request read in its own boundary |
| Barrel tree-shaking | ✅ | `optimizePackageImports` for lucide + TipTap |

### Phase 5 — Editor

| Item | Status | Where |
|---|---|---|
| Auto-expanding title | ✅ | **new** `TitleInput.tsx` — `field-sizing` + scrollHeight fallback + ResizeObserver |
| Language switcher redesign | ✅ | **new** `LanguageMenu.tsx` — moved out of the top bar into the canvas |
| Slug always visible + rename warning | ✅ | `PostEditorClient.tsx` — lock/auto indicator, truthful redirect notice |
| Translate-all bulk action | ✅ | `handleTranslateAll` — sequential, one confirm, not one per language |
| Word/Docs paste sanitiser | ✅ | **new** `pasteSanitizer.ts`, wired into `TipTapEditor` `handlePaste` |

## Verification

```
next build            ✓ 47/47 pages · landing + all dashboard routes now ◐ PPR
test:render           ✓ 247 / 247 invariants
test:fidelity         ✓ 97 sites · rules 100% · tokens 100% · critical 100% · 65% bytes saved
test:brain            ✓ 86 / 86
tests/embed.mjs       ✓ 22 / 22
tsc --noEmit          ✓ clean
eslint src/           ✓ clean
```

Live smoke test (dev server, real data):

| Route | Cold | Cached |
|---|---|---|
| `/render/carma` (listing) | 6.83s | **0.065s** |
| `/render/carma/<slug>` (article) | 3.10s | **0.043s** |

Cold numbers include dev-mode compilation. The ratio is the point: the origin work is
now paid once per publish instead of once per visitor.

Link output verified: the tenant path emits `href="/vida-nocturna-barcelona"` with
**zero** `/render/` links remaining, while `/render/<uuid>` still emits the prefixed
form — the dashboard preview and the embed fragment both keep working.

## Five compiler bugs the fidelity gate caught

Worth recording, because each would have shipped silently:

1. **Selector-unsafe minification.** Collapsing whitespace around `:` turned
   `html :where(.x)` (a descendant) into `html:where(.x)` (the element itself).
2. **`@media print` dropped.** Justified as "not on the critical path", which was
   true and irrelevant — it silently broke printing a customer's page.
3. **Brace-walker desync** on 400KB vendor bundles losing whole token blocks. Fixed
   with an independent regex-level rescue pass for custom properties.
4. **String-unaware minification** rewriting `font-family:'object-fit: cover;'` — the
   object-fit-images polyfill marker, which the library parses back out.
5. **Native CSS nesting** (`#banner { a { … } }`) mangled by the declaration
   minifier. Now kept verbatim.

## Deviation from the plan, and why

**The SSIM check is a CSS-level gate, not a pixel diff.** The plan specified
screenshot SSIM. That needs a headless browser and this repo has none — only
`sharp`. Rather than put a ~300MB Playwright install on the critical test path, the
gate measures three things at the CSS level: rule coverage, token preservation, and
resolved critical-property agreement per element. For the Chrome Compiler that is the
sharper instrument (its only risk is dropping a declaration), and it found five real
bugs on its first runs. A pixel pass is still worth adding for layout regressions CSS
analysis cannot see — tracked below.

**The render stayed a Route Handler rather than becoming JSX pages.** `theme.ts`
emits a complete document including the cloned site's `<head>`; as RSC that would
fight Next's head management for no gain. `use cache` works on any async function and
Next 16 prerenders GET handlers under the same model, so the caching, tagging and
clean-URL wins all landed without touching the 247 invariants.

## Follow-ups

- **Migrations 031 and 032 are PENDING in production.** Until 032 runs,
  `compiled_chrome_css` and `post_redirects` degrade to the old behaviour (raw head
  injection, 404 on a renamed slug). Nothing breaks; nothing improves either.
- **Existing sites keep the old renderer until they re-capture.** `compiled_chrome_css`
  is NULL for every site captured before today, which is deliberate — no live blog
  changes appearance without its owner asking.
- `s-maxage` is 300s, not a year. We set an explicit `Cache-Control`, which opts the
  route out of Next-managed CDN invalidation, so a tag update does not purge the edge.
  Measure whether Vercel purges on tag update for manually-headered handlers; if it
  does, raise it and let tags own correctness entirely.
- Pixel-SSIM pass with Playwright, for layout regressions.
- Phase 3 remains partially done: the loader purge and app-shell streaming shipped,
  but the middleware `getUser()` round trip per request is untouched.

---

# BUILD LOG — Experience track, 2026-09-16

Phases 1 and 2 built. Migrations 031/032 applied by the founder; **033 is new and pending**.

## Phase 1 — Brand Brain & God-Mode onboarding

### One door

`SiteOnboarding.tsx` no longer forks into "clone my web" vs "pick a template" before the
owner has said anything about themselves. One question — **"Explica'ns qui sou"** — and
four valid answers, in any combination:

| Input | Component | Feeds |
|---|---|---|
| A URL | `BrandIntake` | Deep scrape → voice + facts |
| Files dropped **anywhere** on the surface | `BrandIntake` + `brand/documents.ts` | PDF / DOCX / TXT / MD → facts |
| Hold to talk | `VoiceRecorder` → Whisper | Facts, first-hand |
| Typed text | `BrandIntake` | Facts, first-hand |

Templates survive as the honest escape hatch: *"Encara no tinc web."* The gallery now
preselects the first template, so the primary CTA is live on arrival instead of disabled.

### The Brand Brain

New module `src/lib/brand/` — `types` · `scrape` · `documents` · `distil` · `persist` ·
`capture`, behind `POST /api/onboarding/brand` (multipart in, SSE progress out).

The scrape reads the home page plus up to five pages ranked by how likely they are to
explain the brand (`qui som`, `història`, `serveis`…), strips furniture, and keeps prose.

**The one design decision that matters:** verbatim exemplars are chosen **by index**, not
written. Candidate sentences are numbered and the model returns integers; we look the
sentences back up ourselves. Ask a model to "quote sentences from the text" and it
paraphrases — tidies punctuation, fixes grammar, smooths rhythm. Rhythm is the entire
thing we were trying to capture. It cannot rewrite what it never emits.

Output lands in `site_brain_profiles` with `source: 'onboarding'`, filling both the
migration-030 columns and a new `brand` JSONB (migration 033): identity, voice with
exemplars, visual, constraints, provenance. `persona.formatWritingContext` now appends it
**last**, because a few-shot block lands hardest immediately before the instruction to
write. **Nothing downstream changed** — the row the agent always read is simply populated
at onboarding instead of staying empty until enough articles exist to distil.

The owner sees the reveal before anything is written: what we understood, and their own
sentences quoted back.

### God-Mode WhatsApp

`ConnectAgentStep.tsx` rewritten. The deep link already existed; it just wasn't the
primary action, sitting behind a phone-number field.

- **Mobile** — one gold monolith → WhatsApp opens with the code already typed → send.
  **Zero typing.**
- **Desktop** — the same link as a QR, generated **locally** via `qrcode`, so the agent
  number and one-time code never reach a third party.
- The phone field survives as a disclosure, not the front door.
- Motion is `.god-orb` + `.god-breathe` — compositor-only transform/opacity on
  pre-blurred static shadows. Exactly one on screen, and it survives the blanket
  reduced-motion kill the way `.gold-trace` does, except the scale breathing, which is
  dropped (a control that moves under the cursor is an accessibility problem).

## Phase 2 — Dashboard & Punts

- **`WordPressDiscovery.tsx`** — three cards on first dashboard entry after a WordPress
  clone: Plugin / Import here / Not now. Each shows its **trade-off before you expand it**;
  an option whose downside only appears after you commit is a funnel, not an option. The
  1375-line `IntegrationGuide` stays as the deep reference and is linked from here.
- **`CostBadge` / `CostLine`** — every AI control states its price before it is pressed,
  from the single source of truth in `karma/config.ts`. Wired into the editor's generate
  and translate actions. When the owner can't afford it, it says what to do about it
  instead of just "no".
- **`KarmaWidget`** — a fuel gauge, not a number. A bar against the plan allocation,
  warm only when genuinely low, silent otherwise.
- **`RewardTicker`** — the welcome (+25) and first-article (+50) rewards surfaced during
  onboarding. Free is 100 punts/month and an article costs 100, so without this the wall
  arrives before the magic. With it, two articles in month one.

## Verification

```
next build            ✓ 48/48 pages
test:render           ✓ 247 / 247
test:brand (new)      ✓  49 /  49   incl. REAL pdf-parse + mammoth parsing
test:brain            ✓  86 /  86
tests/embed.mjs       ✓  22 /  22
test:fidelity         ✓ 97 sites · 100% / 100% / 100% · 65% bytes saved
tsc --noEmit          ✓ clean
eslint src/           ✓ clean
```

Live smoke test: `POST /api/onboarding/brand` returns a correct 401 (route compiles, all
new deps resolve in the Next runtime); landing and blog both 200; blog cached hit 0.075s.

The document tests use byte-accurate DOCX and PDF fixtures built in `tests/fixtures.mjs`
(reusing the ZIP writer from `scripts/build-wp-zip.mjs`). Mocking the parsers would prove
nothing — `pdf-parse` and `mammoth` have both changed API shape across majors, and a
breaking upgrade would otherwise turn every uploaded brand guide into "contributed
nothing", silently.

## New dependencies

`pdf-parse` 2.x · `mammoth` · `qrcode` (+ `@types/qrcode`). None introduced a high or
critical advisory; the 36 `npm audit` findings are pre-existing (next, tiptap, sharp,
postcss).

## Follow-ups

- **Migration 033 is PENDING.** Until it runs, the `brand` column doesn't exist and
  `saveBrandBrain` retries without it — the migration-030 half still lands, so the agent
  gets industry/audience/tone/pillars but **not the verbatim exemplars**, which is the
  most valuable part. Apply it before relying on the Brand Brain.
- Onboarding is still a `fixed inset-0` overlay with `useState` steps, so a mid-flow
  refresh loses progress. Making it a real route (`/comenca/[step]`) was in the plan and
  is not done.
- The WP discovery dismissal is `localStorage` (per-viewer, per-site). Fine for a UI
  preference; if it should follow the owner across devices it needs a column.
- `CostBadge` is wired into the editor's AI actions. The agent console (`AgentChat`) and
  the cover-image action still spend punts without a pre-flight price.
