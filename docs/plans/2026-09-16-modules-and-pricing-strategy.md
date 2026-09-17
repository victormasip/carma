# MODULES & MONETISATION
## The WordPress-killer module inventory and the four-tier plan

**Date:** 2026-09-16 · **Status:** for founder review. Tier model and four modules are built; the pricing numbers are proposals.
**Companion to:** `docs/plans/2026-09-16-landing-and-community-vision.md` (the landing + the Interaction Plan)

---

## 0. The argument in one page

WordPress is not beaten on editing. It is beaten on **the day after install**.

A WordPress blog reaches "looks like a real publication" through roughly a dozen plugins — table of contents, related posts, share buttons, reading progress, newsletter capture, SEO schema, a cookie banner for the analytics you added to see whether any of it worked. Each one is an install, an update cycle, a settings page, a conflict and a security surface. The median small business never gets there. They install four plugins, one of them breaks the theme, and the blog stays ugly and empty.

Carma's answer is not "we have those features too". It is:

> **There is nothing to install, because there is nothing to assemble.**
> You pick a look, and the look arrives already knowing what a blog should have.

Three things had to be true for that to hold, and two of them were not:

| | Before today | Now |
|---|---|---|
| The catalogue is deep enough to make plugins pointless | 14 modules | **18 shipped, 14 more specified** (§2, §3) |
| A new blog arrives with them ON | 2 modules per template | **6–9 per template, chosen per look** (§4) |
| The plan model can express what each tier buys | `premium: boolean` — two products | **`tier: free \| premium \| gold \| agency`** (§5) |

That last one was quietly capping the business. The module catalogue is the main thing a plan actually buys, and it could only ever be described in two states.

---

## 1. What shipped today

**`ModuleTier` replaces `premium: boolean`** (`src/lib/modules/registry.ts`). Four ranks, cumulative, with `moduleAllowedForPlan()` and `modulesForPlan()` helpers. `premium` is kept on every definition as a mirror of `tier !== 'free'`, so the dashboard lock badges and the server-side enable guard kept working with no migration and no coordinated deploy.

**Four new native modules**, each fully rendered by the existing engine — no plugin, no database, no third-party script:

| Module | Tier | What it does | Why it matters |
|---|---|---|---|
| **Què hi trobaràs** (`keyTakeaways`) | Premium | A key-points box built from the article's **own H2s** | Not AI, deliberately: the headings *are* the author's outline, so it is always accurate, costs nothing, and cannot invent a claim. Turns a plain post into a magazine spread for the price of a list. |
| **Cites destacades** (`pullQuote`) | **Free** | Promotes the strongest sentence mid-article into display type | The single highest design-per-byte module we have. Free on purpose: it makes free blogs look designed, and free blogs carry our badge. |
| **Continua llegint** (`readNext`) | Premium | A `position: sticky` bar that rides the bottom near the end | Retention with no pop-up, no scroll listener, no JavaScript, no layout shift. |
| **Envia-ho al teu grup** (`whatsappShare`) | **Free** | A WhatsApp share on every article | For a Catalan SMB, WhatsApp groups **are** distribution — the village association, the parents' chat, the trade group. Reuses the existing share runtime (which already reads `location.href`), so the canonical URL is right on every host. |

**Every template got its point of view back** (`src/lib/render/templates.ts`): 16 module activations across 8 looks became **52**, chosen per look rather than from one shared default. Noir is dark and cinematic, so it gets the dark toggle and pull quotes; Pulse is docs-shaped, so it gets the table of contents; Terra is local and neighbourly, so it gets the WhatsApp share. `applyTemplate` already runs the merge-only enable action, which skips anything the owner's plan does not include — so a free site quietly receives the free subset of its look, with no error and no locked-module confusion.

Verified: `tsc` clean · `eslint` clean · `test:render` 247/247 · `test:landing` PASS · `next build` green.

---

## 2. The existing fourteen — audit and upgrades

The founder's note was "supercharge them to look like high-end digital magazines out of the box". Ranked by how much the upgrade is worth relative to its cost.

| Module | Tier | Verdict | The upgrade worth doing |
|---|---|---|---|
| `featuredHero` | Free | **Strongest module we have.** Three variants already read as editorial. | Add a `cover` variant: one full-bleed image with the headline over it. It is the single change that most makes a blog look like a magazine on arrival. |
| `search` | Free | Works, accent-folded, multi-term. | Index **headings and excerpts**, not just titles, and show the matched line under each hit. Search that finds nothing is worse than no search. |
| `categoryFilters` | Free | Fine. | **Counts already computed but only shown on `pills`.** Show them on every variant, and hide categories with zero posts instead of rendering a dead filter. |
| `relatedPosts` | Premium (AI) | Good. `smart` matching is the paid feeling. | Explain itself: a one-line "because you read about X". A recommendation that shows its reason gets clicked roughly twice as often as one that does not. |
| `prevNext` | Free | Correct, plain. | Order by **series/section** when one exists, not raw publication date. Chronological prev/next on a mixed blog is a random-article button. |
| `socialShare` | Free | Complete (6 networks + copy). | Drop X and LinkedIn from the **default** set for this audience and lead with WhatsApp; keep them available. Defaults that match the audience beat defaults that match a template. |
| `backToTop` | Free | Fine. | Merge visually with `readingProgress`'s circle variant — two floating controls in one corner is clutter twice. |
| `readingProgress` | Free | Good. | Add **"X min left"** rather than total time. Time remaining is the number a reader actually wants. |
| `tableOfContents` | Premium | Good; sticky sidebar is premium-feeling. | **Scroll-spy the active heading.** Without it the sidebar is a list, not a map — and the runtime script that would do it already exists. |
| `authorCard` | Free | Thin. | Pull the author's **real photo and one line** from the Brand Brain, which already has both. Right now every author card is a grey circle. |
| `newsletter` | Premium | Captures, stores, works. | **Double opt-in and an export.** Today it is a list you cannot legally mail or take with you, which makes it a demo rather than a feature. |
| `paywall` | **Gold** | Structurally sound (server-side truncation — the content genuinely is not in the HTML). | Needs a payment rail to be real. Until then it is a **lead gate**, and the copy should say so honestly. |
| `announcementBar` | Premium | Fine. | Add a **schedule** (from/to dates). Every announcement bar in the world is eventually out of date because nobody remembers to turn it off. |
| `darkModeToggle` | Premium | Works. | Respect `prefers-color-scheme` on first visit instead of defaulting to light. A dark-mode user who lands in white light has already judged the site. |

**The pattern in the list:** almost none of these need new architecture. They need the module to *finish its own thought* — counts that are computed but not shown, an author card with data available but unused, a TOC that knows the headings but not where you are. That is where the next fortnight of module work should go, before any new module ships.

---

## 3. The roadmap — fourteen more, in three waves

Each is renderable by the existing engine unless marked. Ordered by (impact ÷ effort).

### Wave A — the parity batch (no new infrastructure)

| Module | Tier | What | Why |
|---|---|---|---|
| `archiveTimeline` | Premium | Posts grouped by year/month on the listing | The single most-requested WordPress page that Carma cannot render today. |
| `tagIndex` | Free | A tag cloud/index page | Discovery, and it costs one query we already make. |
| `seriesNav` | Premium | "Part 2 of 5" navigation across a series | Turns a blog into a body of work. Editorial clients ask for this first. |
| `faqSchema` | Gold | JSON-LD FAQ derived from H2/H3 question pairs | Pure SEO. On WordPress this is a plugin with a settings page; here it is a derivation. |
| `copyLink` | Free | Copy permalink, with a "copied" state | Trivial, and its absence is noticed. |
| `printArticle` | Free | A print stylesheet plus a print button | Restaurants print menus, clinics print advice. Genuinely used by this audience. |

### Wave B — engagement (needs storage: migration 035)

| Module | Tier | What | Why |
|---|---|---|---|
| `reactions` | Free | Three emoji reactions, counted server-side | The lightest possible proof to an author that a human was there. Feeds the Interaction Plan. |
| `comments` | Premium | Native comments, moderated, no third party | **The one WordPress feature with no Carma answer.** Disqus is a tracker; native is a moat. |
| `poll` | Premium | An inline one-question poll | Local businesses love asking their street a question. |
| `bookmark` | Free | Save-for-later, per reader | Retention, cheap, `localStorage` for anonymous readers. |

### Wave C — the differentiators

| Module | Tier | What | Why |
|---|---|---|---|
| `audioVersion` | **Gold** | "Listen to this article" — TTS, generated once, cached | Nobody in this segment has this. Priced in punts (see §6), it is a genuine Gold anchor. |
| `translateReader` | **Gold** | Reader-facing ca/es/en switch on published articles | The i18n spine already exists; this exposes it to the reader. Catalan-first businesses serve three languages daily. |
| `bookingCta` | Premium | An appointment/booking call-to-action block | Clinics, workshops, restaurants. The conversion that actually matters to them. |
| `whiteLabel` | **Agency** | Removes every Carma mark; custom "powered by" | The thing agencies will not buy the plan without. |

---

## 4. The module availability matrix

Cumulative: each plan includes everything below it.

| Module | Gratis | Premium | Or | Agència |
|---|:--:|:--:|:--:|:--:|
| `search` | ● | ● | ● | ● |
| `categoryFilters` | ● | ● | ● | ● |
| `featuredHero` | ● | ● | ● | ● |
| `prevNext` | ● | ● | ● | ● |
| `socialShare` | ● | ● | ● | ● |
| `backToTop` | ● | ● | ● | ● |
| `readingProgress` | ● | ● | ● | ● |
| `authorCard` | ● | ● | ● | ● |
| **`pullQuote`** | ● | ● | ● | ● |
| **`whatsappShare`** | ● | ● | ● | ● |
| `relatedPosts` (AI) | — | ● | ● | ● |
| `tableOfContents` | — | ● | ● | ● |
| `newsletter` | — | ● | ● | ● |
| `announcementBar` | — | ● | ● | ● |
| `darkModeToggle` | — | ● | ● | ● |
| **`keyTakeaways`** | — | ● | ● | ● |
| **`readNext`** | — | ● | ● | ● |
| `paywall` | — | — | ● | ● |
| *`audioVersion`* (Wave C) | — | — | ● | ● |
| *`translateReader`* (Wave C) | — | — | ● | ● |
| *`whiteLabel`* (Wave C) | — | — | — | ● |

**10 free modules.** That is deliberate and it is the most important number in the table. A free Carma blog carries the "Fet amb Carma" badge, so a free blog that looks *good* is our cheapest acquisition channel. We are not withholding beauty — we are withholding **leverage**: recommendation, capture, monetisation, scale.

The line between free and paid, stated once:

> **Free makes the blog beautiful. Paid makes the blog work for you.**

---

## 5. The four-tier plan

### 5.1 The table

| | **Gratis** | **Premium** | **Or** | **Agència** |
|---|---|---|---|---|
| **Price** | 0 € | **19 €/mes** | **49 €/mes** | **149 €/mes** |
| **Punts de Carma / month** | **100** | **500** | **1.800** | **6.500** |
| Articles/month (all-in) | ~1 | ~5 | ~18 | ~65 |
| Effective €/100 punts | — | 3,80 € | 2,72 € | 2,29 € |
| **Blogs** | 1 | 3 | 10 | 100 |
| **Editors / seats** | 1 | 3 | 10 | unlimited |
| Domain | Carma subdomain | **custom domain** | custom, unlimited | custom, unlimited |
| WhatsApp agent | **unlimited** | unlimited | unlimited | unlimited |
| Modules | 10 | 17 | 20 | 21 + white-label |
| Voice notes | 5/mo | unlimited | unlimited | unlimited |
| Cover images | — | 5/mo included | unlimited (punts) | unlimited (punts) |
| Community earning cap | 150/mo | 500/mo | 900/mo | 2.000/mo |
| WordPress plugin + import | ● | ● | ● | ● |
| API + live embed | — | ● | ● | ● |
| Priority support | — | email | email, 24h | dedicated |
| White-label | — | — | — | ● |

Top-ups: **500 punts for 15 €** (3,00 €/100) — deliberately *worse* value than every subscription tier, so the rational move for a heavy month is always to upgrade rather than to top up.

### 5.2 Why these numbers

**The anchor is unchanged and should stay unchanged:** one complete article = 100 punts (draft 80 + one revision 20). Everything else in `lib/karma/config.ts` derives from real API cost. Do not move the anchor; move the allocations.

**The current allocations are wrong in one specific place.** Today: free 100 · premium 400 · gold 800 · agency 2.500. Gold is 2× the punts of Premium for 2,5× the price — the value curve *inverts* exactly where we most want people to move. A plan ladder has to get cheaper per unit as you climb, or the top of it does not sell. The proposal restores a monotonic curve: 3,80 → 2,72 → 2,29 €/100.

**Margin is not the constraint, and it is not close.** Measured against current
API prices, with the models this codebase actually calls — `gpt-4o-mini` for
text (`WA_ROUTER_MODEL`) and `gpt-image-1` at quality `low` for covers
(`lib/whatsapp/coverImage.ts`):

| Operation | Cost |
|---|---|
| Article draft (2.000 in + 1.600 out) | $0.00126 |
| One revision | $0.00134 |
| Agent chat turn (800 in + 200 out) | **$0.00024** |
| Voice note, 30s (Whisper) | $0.00300 |
| **Cover image** (gpt-image-1 low, 1536×1024) | **$0.01600** |
| Glimpse synthesis (Brand Brain 2.0) | $0.00096 |
| Brand distillation | $0.00228 |
| **A complete illustrated article** | **$0.0216 ≈ €0.020** |
| A text-only article | $0.0056 ≈ €0.005 |

Three findings that changed decisions, not just the spreadsheet:

1. **The image IS the cost.** The cover is **74% of an article's bill**; the
   writing is essentially free. The punt weighting did not reflect that at all —
   25 of 125 punts, 20% of the price for 74% of the cost. **Applied:
   `cover_image` 25 → 40.** The anchor is untouched: a text article is still
   100 punts, an illustrated one is 140.
2. **Stripe costs more than the intelligence.** On a 19 € subscription the
   processing fee is ~0,80 € and the API is ~0,08 €: **the payment rail costs ten
   times the inference.** No product decision on this platform should ever be
   made to save tokens.
3. **The conversation has to be free.** A chat turn costs $0.00024. Charging a
   punt for it put a meter on the only part of the product that does magic.
   **Applied: `agent_chat` 1 → 0** — free WhatsApp conversation on every plan,
   including free (founder, 2026-09-16: *"free whatsapps al principi guest si"*).
   Only generation costs punts.

Margins at full use, after API **and** Stripe:

| Plan | Punts | Articles | API | Stripe | Price | Gross margin |
|---|---|---|---|---|---|---|
| Gratis | 100 | ~1 | €0.02 | — | 0 € | (acquisition cost €0.02/mo) |
| Premium | 500 | ~4 | €0.08 | €0.80 | 19 € | **95.4%** |
| Or | 1.800 | ~14 | €0.28 | €1.67 | 49 € | **96.0%** |
| Agència | 6.500 | ~52 | €1.04 | €4.57 | 149 € | **96.2%** |

**So: yes, there is real profit, and it is not marginal.** The punt ceiling
exists to cap abuse and to make the ladder legible — not to protect a margin
that was never at risk. Set allocations by what makes the tiers make sense.

**Applied to code** (`src/lib/karma/config.ts` + migration `034_pricing_v2.sql`):
allocations 100 / 500 / 1.800 / 6.500, `agent_chat` 0, `cover_image` 40, and a
new `KARMA_COMMUNITY_CAP`. The migration also lifts every existing wallet that is
below its new allocation immediately, rather than making paying customers wait
for the 1st of the month, and writes one audit line per wallet.

**The free tier is an advertising budget, and a cheap one.** €0.06/month per free site, and every one carries the badge. Free should stay genuinely useful — one real article a month, forever, plus ten modules — because a free blog that looks good sells more Premium than any landing page will.

### 5.3 Where each tier's centre of gravity is

- **Gratis** — *"Prove it works."* One blog, one article a month, a beautiful look. The wall it hits is **volume**, never quality. Nothing here should ever feel crippled; it should feel small.
- **Premium (19 €)** — *"This is my blog now."* The upgrade trigger is the second article of the month and the custom domain. Five articles, unlimited WhatsApp, capture and recommendation.
- **Or (49 €)** — *"I publish on a schedule."* The trigger is **volume plus audience**: 18 articles, the paywall, audio versions, reader translation. This is the tier for someone whose blog is a channel, not a page.
- **Agència (149 €)** — *"I do this for other people."* 100 blogs, unlimited seats, white-label. The trigger is the second client, and the feature that closes it is white-label, not punts.

### 5.4 The upgrade moments, and what must be said at each

Every one of these is a place the product already knows it should speak, and mostly does not:

| Moment | Today | Should say |
|---|---|---|
| Free user's punts hit zero | Generic "out of punts" | *"You've published your article this month. Two more this month = Premium, 19 €."* Plus: **the reptes and the community loop** — earning is a real path, and saying so builds the economy. |
| Free user opens a locked module | Lock badge | Show it **working, on their own blog, for thirty seconds**, then ask. A locked feature you have seen working converts; a padlock does not. |
| Premium user hits 500 punts twice in a row | Nothing | *"Two months in a row. Or gives you 1.800 for 49 € — that's 2,72 € per hundred instead of 3,80."* Show the arithmetic; this audience respects it. |
| Second site on Premium | Works (limit 3) | Nothing needed. |
| Fourth site attempt on Premium | Hard block | *"Or holds ten."* |
| Any user asks the agent for something Gold | Refusal | The agent should **quote the price in punts and offer the upgrade in the same message**. It is a conversation; use it. |

---

## 6. Punts pricing for the new operations

The catalogue in `lib/karma/config.ts` needs three additions as Waves B and C land. Proposed, on the same cost-derived basis:

| Operation | Punts | Basis |
|---|---|---|
| `audio_version` | **40** | ~4 min of TTS, generated once and cached forever. |
| `translate_article` | **35** | A full re-write pass into a second language, not a machine-translate call. |
| `comment_moderation_ai` | **2** | Per flagged comment, only when the owner turns on auto-moderation. |
| `series_outline` | **30** | Plan a 5-part series: one call, high perceived value. |

And from the Interaction Plan, the earning side stays: read +3 · applaud +2 · useful comment +15 · share +10 · translation +20 · draft review +25, all capped per §5's community column.

---

## 7. What to build, in order

| # | Work | Effort | Why it is in this position |
|---|---|---|---|
| 1 | **Adopt `tier` in the UI** — `ModulesManager` and `lib/actions/modules.ts` currently read the legacy `premium` mirror, so Gold-only modules show as merely "premium" | 0.5 d | The tier model is shipped but only half-visible. Paywall already says Gold in the data and Premium on screen. |
| 2 | **The §2 upgrades** — the fourteen "finish your own thought" fixes | 3 d | Highest value in the document. No new architecture, and it is what makes the catalogue *feel* premium rather than merely count high. |
| 3 | **Wave A** — six parity modules | 3 d | Closes the "can Carma do what my WordPress did" objection. |
| 4 | **Pricing migration** — new allocations, `SITE_LIMITS`, seat limits, top-ups | 1 d | Needs §5 signed off first; it changes what existing customers get. |
| 5 | **Wave B** — comments, reactions, polls (migration 035) | 5 d | The real moat, and the only item here that needs new storage. |
| 6 | **Wave C** — audio, reader translation, white-label | 4 d | Gold and Agència anchors. Build once there is someone on Gold to want them. |

---

## 8. Decisions needed

1. **The four prices** — 0 / 19 / 49 / 149 €. The gap from Premium to Or is the one to argue about: 2,5× the price for 3,6× the punts is a deliberate pull upward.
2. **The allocation change** — 100 / 500 / 1.800 / 6.500. This **raises** what existing Premium users get (400 → 500) and materially raises Gold (800 → 1.800). Existing customers should be told, and it should be framed as a gift, not a correction.
3. ~~**Free-tier WhatsApp turns.**~~ **SETTLED, 2026-09-16: uncapped, on every plan.** `agent_chat` is now 0 punts. A turn costs $0.00024, and metering the one part of the product that feels like magic was never going to pay for itself. The table's "20 turns/mo" row is withdrawn.
4. **`paywall` at Gold** — confirm. It is the one existing module that moved up a tier, and it needs a payment rail before it is honest.
5. **Two free modules were promoted on purpose** (`pullQuote`, `whatsappShare`). Both make free blogs prettier and more viral. Confirm that trade.
6. **Comments (Wave B)** is the single biggest build in this document and the single biggest moat. It also brings moderation, spam and GDPR. Confirm before Wave B starts, not during.

---

*Free makes the blog beautiful. Paid makes the blog work for you. Every row in the matrix should be checkable against that sentence — and any row that is not is either priced wrong or built wrong.*
