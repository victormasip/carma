# EL FIL D'OR
## Landing Revolution & Community Architecture — Master Creative Document

**Date:** 2026-09-16 · **Status:** approved; phases A, B and C built. See the BUILD LOG at the end.
**Companion to:** `docs/plans/2026-09-16-super-mvp-master-plan.md` (engine + God-Mode onboarding, both shipped today)

---

## 0. The one idea

> **The landing page stops describing the product and becomes it.**

Carma's product is a **conversation** that ends in a **published page**. So the landing is not a
brochure with a screenshot of a conversation in it. The landing is a thread you pull — one
continuous gold line that ignites at the wordmark, runs the entire page carrying every scene, and at
the bottom coils into the Endless Knot, which *is* the logo, which *is* the final call to action.

One idea. One line. One ask, stated twice.

And the ask is not "sign up". The ask is **the same door the product opens with**: *Explica'ns qui
sou* — paste your URL, drop a PDF, or hold and talk. The visitor does it **on the landing page,
logged out**, watches Carma read them and quote their own sentences back at them, and only *then* is
asked for an email — to keep what already exists.

Everything below serves those two paragraphs.

---

## 1. Diagnosis — why the current landing reads "AI-generated"

It is not the pixels. `globals.css` is a genuinely good design system: the gold halos, `.gold-trace`,
`.btn-gold`, `.eyebrow`, the knot loader, the 17px type ramp, one signature easing. The craft is
there and none of it is up for renegotiation.

It is the **skeleton**. `src/components/marketing/LandingPage.tsx` is, in order:

```
Nav → Hero(badge, h1, sub, 2 CTAs, 4 chips, product mock)
    → 3-step "How it works" cards
    → 6-tile feature bento
    → Showcase (copy left, browser mock right)
    → URL input section
    → 2-card pricing
    → FAQ accordion
    → Another URL input section
    → Footer
```

That is the skeleton of every SaaS landing generated since 2023. A visitor recognises it in 400ms,
before reading a word, and files it under "another AI tool". Seven concrete tells:

| # | Tell | Where |
|---|---|---|
| 1 | **Three separate asks for the same thing.** The hero CTA, `CloneSection` and `WaitlistHero` all ask for a URL. Three asks equals no ask. | `LandingPage.tsx:53-61` |
| 2 | **Tell-don't-show "How it works".** Three numbered cards with an icon each, explaining a product whose entire pitch is that there is nothing to learn. | `HowItWorks` |
| 3 | **The 6-tile bento.** Six equal claims, none of them the moat. The Brand Brain — the one thing a competitor cannot copy in a weekend — is not on the page at all. | `FeatureBento` |
| 4 | **Pricing as 0€ / 19€ cards.** Carma does not sell seats, it sells **Punts**. Two generic cards actively hide the most distinctive economics in the category. | `Pricing` |
| 5 | **The landing contradicts the product.** Onboarding became **One Door** today (URL · documents · voice · text). The landing still sells the old two-door fork. | `SiteOnboarding.tsx:9-17` vs `CloneSection` |
| 6 | **Ubuntu at 60px.** A humanist UI face doing display duty. Superb at 15px, characterless at 60px. | `layout.tsx:12` |
| 7 | **No people, no proof, no movement.** No names, no towns, no numbers, no sense that anyone else is doing this. A tool, not a cause. | — |

### 1.1 The funnel tell (this one costs money)

```
landing → /preview?url= → 30s timer → /registre?url= → /benvinguda?url= → provision → /dashboard/sites/[id] → SiteOnboarding
         │                │                                                                                    │
         └─ page load 2   └─ deliberate dead time                                       the magic finally happens (load 5)
```

**Five navigations and an intentional 30-second stall before the product does anything.** Meanwhile
the actual wow — the Brand Brain reading their site and quoting their own sentences back — is locked
behind registration, which is behind a stall, which is behind a preview.

We are gating the wow behind the ask. It has to be the other way round.

### 1.2 What the build actually ships today (measured, `next build`, 2026-09-16)

| Metric | Today | Note |
|---|---|---|
| JS on `/` | **211 KB gzip** (703 KB raw, 13 chunks) | For a page that is 95% static text |
| CSS on `/` | 27 KB gzip (176 KB raw) | The whole design system on every route |
| Prerendered shell | **2,582 bytes** | Just the Suspense fallback: two gold halos |
| Client boundary | **The entire landing** | `LandingPage.tsx:1` is `'use client'` — nav, hero, bento, pricing, FAQ, footer all hydrate |

The `'use client'` at the top of the landing is the single biggest performance fact on this page.
Everything below the fold — six sections of static marketing text — ships as JavaScript and hydrates
on a visitor's phone. Nothing on this page needs that except four small interactive bits.

**That is the budget we are going to spend on the new design, and we are going to come out ahead.**

---

## 2. The concept: **EL FIL D'OR** (The Golden Thread)

### 2.1 The device

A single gold hairline, fixed in the viewport gutter, **drawn by the visitor's own scroll**. It is
the Endless Knot unravelled. At the top it is the outgoing WhatsApp message. Through the middle it
stitches the scenes together. At the bottom it coils back into the knot, becomes the wordmark, and
hands over the final door.

Why this, and not "a 3D thing":

- **It is already the brand.** `.knot-draw` in `globals.css` traces the knot with `stroke-dashoffset`
  on a `pathLength=100` path. The thread is that exact primitive, scrubbed by scroll instead of by a
  clock. We are not inventing a device; we are extending the one we have.
- **It gives the scroll an author.** Sections stop being a list and become stations on a line.
- **It costs one fixed 3px-wide SVG column and zero JavaScript** (§7).
- **It is unphotographable.** A screenshot cannot steal it. Competitors clone hero layouts in an
  afternoon; they do not clone a page that only exists while you are moving through it.

### 2.2 The three laws of this page

Every decision below is checkable against these three lines.

**Law I — Gold is light, never paint.**
Gold does not slide, fly or wipe. It *ignites*, *travels*, *settles*. Structure moves; light glows.
(This is also why the existing reduced-motion policy works: motion is stilled, light survives.)

**Law II — Show the product doing the thing, or cut the section.**
No icon standing in for a feature. If we cannot demonstrate it in the browser, it is a sentence, not
a section. The six-tile bento dies under this law.

**Law III — One ask, stated twice.**
The Door at the top, the Door at the bottom. Every other interactive thing on the page is a scroll
cue or a toy, never a second conversion path.

### 2.3 What we are actually selling, in order

1. **You will never open a computer again.** (WhatsApp)
2. **It will look like your site, because it is your site.** (The clone)
3. **It will sound like you, because it read you first.** (Brand Brain — the moat)
4. **It is Catalan, and that is the whole point.** (The movement)
5. **It is free to start and the money is honest.** (Punts)

Today's page sells #1 and #2, buries #3, and has never once mentioned #4.

---

## 3. Art direction

### 3.1 Typography — the single biggest visual upgrade

Keep **Ubuntu** for everything the app already uses. It is the right UI face — humanist, warm,
excellent at 15–19px — and it is a founder directive.

Add **one display face, landing-only**: **Fraunces** (variable, with the SOFT + WONK axes).

| | |
|---|---|
| **Why a serif at all** | Carma is a *publishing house* that lives in a phone. A high-contrast editorial serif says "this text will be read", which is precisely the promise. It is also the fastest possible exit from the AI-SaaS visual cluster, which is 100% geometric sans. |
| **Why this one** | Free (Google Fonts), one file, latin + latin-ext (Catalan diacritics and the `·` interpunct), contrast that only improves above 48px, and a genuinely characterful italic — which we need, because the Brand Brain scene *is* a pull-quote. |
| **Where** | `h1`, scene titles, pull-quotes, and the community numbers. **Nowhere else.** All UI, body, chips, buttons and the entire app stay Ubuntu. |
| **Cost** | One file, `display: swap`, `preload` on `/` only, `adjustFontFallback` on so the swap is metric-matched and CLS stays 0. Verify `à è é í ï ò ó ú ü ç ·` render before merge. |

> **DECIDED, 2026-09-16 (founder): Fraunces**, not Instrument Serif. Softer, more human,
> more editorial — and it is a *variable* font, so the whole weight range arrives in one file
> instead of one request per weight. Shipped with the `SOFT`, `WONK` and `opsz` axes, which are
> the three that make it Fraunces rather than a generic old-style serif; without them we would be
> paying the same bytes for something anonymous. Imported in `LandingPage.tsx`, not the root
> layout, so the preload hint is scoped to `/` and the dashboard never downloads it.

Landing-only fluid scale:

```css
--display-xl: clamp(2.75rem, 1.9rem + 4.2vw, 5.5rem);   /* hero h1 */
--display-lg: clamp(2rem,   1.5rem + 2.4vw, 3.5rem);    /* scene titles */
--display-md: clamp(1.5rem, 1.2rem + 1.4vw, 2.25rem);   /* pull-quotes */
```

### 3.2 Colour

No new palette. The system is right. Two refinements:

- **Light travels down the page.** The landing opens on the dark ground regardless of theme, then
  *warms into paper* at the clone scene and stays warm to the footer. One `data-scene="dark"`
  wrapper; the existing tokens do the rest. The page literally gets brighter as the story resolves.
- **Gold gets rationed.** On a page this gold-heavy, gold stops meaning anything. New rule: gold
  marks exactly three things — **the thread, the ask, and Carma's own words.** Everything else is
  ink, paper, and one hairline border.

### 3.3 Motion signature

| Rule | Value |
|---|---|
| Easing | `var(--ease-emphasis)` = `cubic-bezier(0.16, 1, 0.3, 1)`, on everything. No second easing anywhere on the page. |
| Entry axis | Content enters from **below**, always. Light travels **down**. One axis for the whole page. |
| Durations | 180ms (state) · 420ms (reveal) · 900ms (scene). Nothing else exists. |
| Stagger | 60ms, capped at 6 items and 360ms total. |
| Grid-break | Exactly **one** deliberate asymmetry (Scene 3). One is a decision; three is a mess. |
| Reduced motion | Structure freezes, light lives — the existing `!important` brand-exemption block is the contract. Every new animation must declare which half it is. |

---

## 4. The visual journey — scene by scene

Ten scenes. Mobile (390px) is described inline, not as an afterthought: the audience is a restaurant
owner on a phone, and pinning is exactly where mobile scroll-jank lives.

---

### SCENE 0 — THE FIRST FRAME (0–400ms)

**Nothing animates in that the visitor came here to read.**

Today `.hero-word` starts at `opacity: 0` with up to ~500ms of stagger — which means the LCP element
is *deliberately delayed by the animation*. New rule:

- **Line 1 of the h1 is static.** It is the LCP element. It paints and never moves.
- Line 2 (the payoff) word-staggers at 60ms, ≤ 300ms total.
- Simultaneously the thread **ignites** at the wordmark and runs 140px down the gutter.

One light event. Two animated properties. That is the entire first-paint motion budget.

*Mobile:* identical; thread at the 16px left gutter.

---

### SCENE 1 — L'ENTRADA · The Door
*The whole promise and the only real ask, in one screen.*

**Layout.** Asymmetric 60/40 on desktop. The phone is **cropped by the right edge and tilted 6°**,
bleeding off-canvas — a living object in the room, not a centred product shot. On mobile the phone
drops to 10% opacity behind the door as atmosphere, and the door owns the fold.

**Copy (ca).**

```
eyebrow   WHATSAPP → EL TEU BLOG

h1        Tot el teu blog,
          des d'un sol missatge.          ← line 2, Instrument Serif, gold

sub       Li envies una idea — escrita o en veu — i la Carma et torna l'article
          escrit, amb el teu to i el SEO fet. Tu només dius «publica».
```

**The Door** sits directly under the sub, full width. It is the hero component of the entire page:

```
  Comencem. Qui sou?
  ┌────────────────────────────────────────────┐  ┌─────────┐
  │  la-teva-web.cat                           │  │ ◉ parla │
  └────────────────────────────────────────────┘  └─────────┘
  Enganxa la teva web · deixa anar un PDF · o prem i parla
```

This is **`BrandIntake`, logged out** — the same component the product opens with (§5). Which gives
us four things nobody expects on a marketing page:

- **The entire page is a dropzone.** Drop a PDF anywhere — anywhere — and the door catches it: the
  thread flares gold from the drop point to the door and the file appears as a chip. This is the most
  "impossible" moment on the page and it costs one `dragover` listener.
- **Hold to talk is a first-class button**, not a hidden option. On mobile it is the largest target
  on the screen.
- **The page reacts before submit.** Paste a URL and within ~300ms we resolve it and show the domain
  as a chip with its favicon, and the label changes to *"Perfecte. La mirem?"*. Type a sentence
  instead and the chip becomes ✍️ with *"També ens serveix. Explica'ns més."* The page is listening.
  That, not a bigger button, is what makes a CTA magnetic.
- **Magnetic submit.** Within 120px the button translates toward the cursor, max 8px, spring,
  `pointer: fine` only.

**Trust line** (replaces the four chips): one line, three facts, no icons —
`Gratis · sense targeta · el teu blog en 60 segons`.

**Motion.** Thread ignites. Halos drift (existing, two transforms). The phone plays **one silent
beat** — a voice note rising — then holds. It does not loop here; an autoplaying loop in the fold
competes with the door for attention, and the door must win.

---

### SCENE 2 — LA CONVERSA · The pinned thread
*"How it works" — deleted as a section, performed as a scene.*

The phone **pins** for ~2.5 viewports and the conversation plays **scrubbed by scroll**. The visitor
is not watching a demo, they are *operating* it. Scroll down and the article writes itself. Scroll
up and it un-writes.

| Scroll % | Beat | Motion |
|---|---|---|
| 0–15 | Voice note rises from the composer | `translateY` + `opacity`; waveform bars stagger |
| 15–30 | Carma typing → warm ack | typing dots swap in place for the bubble (no layout shift) |
| 30–55 | **The draft card lands** | gold card scales 0.96→1, `.gold-trace` ignites around it once |
| 55–70 | Title, keyword and meta fill in | three lines, 60ms stagger |
| 70–85 | A thumb presses «Publicar» | scale 0.97 + gold press ring |
| 85–100 | Live URL, spark burst | link underline draws L→R; the thread **flares** and runs on |

Beside the phone, one line of Instrument Serif per beat, cross-fading — the narration, in Carma's
voice: *"Li parles."* → *"T'escolta."* → *"Escriu."* → *"Tu decideixes."* → *"Publicat."*

**This scene replaces `HowItWorks` outright.** Three numbered cards explaining a product whose entire
pitch is "there is nothing to learn" was the most self-defeating thing on the page.

*Mobile:* **no pin.** The same beats arrive on natural scroll via `view()` reveals. No sticky, no
jank. The narration lines become the section's running text.

*Fallback:* `@supports not (animation-timeline: view())` → today's existing 16s CSS autoplay loop,
untouched. **The fallback is what already ships in production.** Zero regression risk.

---

### SCENE 3 — EL CLON · The split
*The one deliberate grid-break on the page.*

A single browser frame, **oversized, bleeding past both content edges**, containing the visitor's own
website. A gold divider sits at 50% and **sweeps right as you scroll**: left of it their real site,
right of it their Carma blog — same header, same footer, same colours, same crooked logo.

- If they gave a URL in the hero, **it is their site**; the capture is already warm (§5).
- If not, the frame cycles three real cloned businesses from our own fidelity corpus.

```
eyebrow   EL CLON

h2        El teu blog s'assembla a la teva web
          perquè és la teva web.

body      Agafem la teva capçalera i el teu peu de veritat — el teu logo, el teu
          menú, les teves tipografies. No una plantilla que s'hi assembla.

proof     Provat amb 97 webs reals · 100% de fidelitat de capçalera i peu
```

> **Honesty constraint.** "97 webs · 100%" is a real number from `npm run test:fidelity`, but it is
> an internal regression gate, not a customer count. The page must say *"provat amb"* (tested
> against), never *"97 clients"*. Marketing claims get the same standard as the fidelity suite.

**Motion.** The divider is `clip-path: inset()` scrubbed by `view()` — one property, compositor
friendly. The two halves never move.

*Mobile:* the divider becomes **draggable**, with a gold handle and a hint pulse. Touching it beats
watching it.

---

### SCENE 4 — LA VEU · The Brand Brain
*The moat. Currently absent from the landing entirely.*

Pure typography on the dark ground, almost no chrome. The most expensive-feeling scene on the page
and among the cheapest to render.

Three small objects — a URL card, a PDF, a voice waveform — drift toward the centre, overlap, and
**collapse into the knot**, which pulses once. Out of it a paragraph writes itself in Instrument
Serif: a real brand summary. Then two of its sentences **light up gold**, and the caption lands.

```
h2        Abans d'escriure ni una línia, la Carma et llegeix.

body      Llegim la teva web, els teus documents i el que ens expliques.
          En traiem qui sou, a qui parleu i com ho dieu.

quote     «Fem pa de forn de llenya des del 1954.»
          «Si el trobes millor en un altre lloc, t'hi acompanyem.»

caption   Aquestes frases no les hem escrit nosaltres.
          Són teves. Les hem trobat i les hem guardat.
```

That caption is the entire moat in eleven words, and it is *literally true*: exemplars are selected
**by index**, never regenerated, precisely so the model cannot paraphrase them (`lib/brand/distil.ts`).
The page can make this claim honestly. Almost nobody else can.

**Motion.** Three transforms in, one opacity pulse, one gold highlight sweep (a finite 900ms
`background-size` transition on a clipped gradient — never looping).

---

### SCENE 5 — L'ESTUDI · The toy
*Law II: show it or cut it.*

Keep the existing pure-CSS browser mock — it is good — and make it **real**. Three live controls:

- an accent swatch row (6 colours) → repaints the mock instantly
- a type toggle (serif / sans) → the mock's headings change
- a layout toggle (graella / llista)

The visitor edits a blog inside the marketing page. That is the Studio's whole promise — "you click
the thing you want to change" — delivered in four seconds without an account.

Under it, one line instead of six tiles:

```
I també: cerca, newsletter, articles relacionats, paywall, multi-idioma
i estadístiques. Un clic cadascun.
```

**The six-tile bento, compressed to a sentence.** State is local `useState` in one client island,
zero network, ~2KB.

---

### SCENE 6 — QUÈ NO ÉS LA CARMA
*The anti-generic vaccine. No competitor has the nerve to write this.*

Three denials, big serif, enormous negative space, no icons, no cards:

```
No és un ChatGPT amb un logo.
Escriu amb la teva veu perquè primer ha llegit la teva.

No és una plantilla que s'assembla a la teva web.
És la teva capçalera i el teu peu, de veritat.

No és una eina més que has d'aprendre.
Ja saps fer servir WhatsApp.
```

Thirty seconds to read, and it does more anti-generic work than any amount of WebGL. A page that
says what it *isn't* cannot have come out of a template.

---

### SCENE 7 — LA COMUNITAT · The movement
*Full strategy in §6. On the page, three objects:*

1. **The counter**, Instrument Serif at display size, counting up once on entry:
   *"Aquest mes la comunitat ha convertit **41.300 punts** en **287 articles** en català."*
2. **The wall — "Fet amb Carma".** A marquee of real member blogs where **each card is rendered in
   that site's own identity**: its extracted colours, its font, its logo. We already store design
   tokens for every site, so this is pure CSS from data we own — no screenshots, no images, no
   crawling. Each card: name · town · "12 articles".
3. **The map.** Països Catalans as one flat SVG, a soft gold dot per member town. No names, no
   personal data, opt-in only. The single most emotionally loaded object we can put on this page.

```
eyebrow   LA COMUNITAT
h2        Internet s'ha omplert de textos que no diu ningú.
          Nosaltres el tornem a omplir de gent.
```

*Mobile:* counter + map; the wall becomes a horizontal swipe row (native overflow + `scroll-snap`).

---

### SCENE 8 — ELS PUNTS · Pricing as an economy
*Kill the two cards.*

```
eyebrow   ELS PUNTS DE CARMA
h2        Un article sencer són 100 punts.

          Gratis       ▓▓▓▓▓▓▓▓▓▓ 100 punts/mes   un blog · tot l'editor · l'Estudi
          Premium 19€  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 400   WhatsApp il·limitat · domini propi

body      El pla gratuït en regala 100 cada mes: un article complet, cada mes,
          per sempre. I els reptes en donen més — els punts que guanyes no caduquen.

note      Preus de llançament · es confirmaran abans de cobrar res.
```

A fuel gauge, not a pricing table. It is truer to the product, it teaches the economy *before*
signup so the first paywall is never a surprise, and it sets up the community challenges (§6) as a
real earning path rather than a gimmick.

FAQ: five items, compact, directly underneath. Objection handling belongs next to the price.

---

### SCENE 9 — EL NUS ES TANCA · The close
*The thread has run the whole page. Now it ties.*

The gold line curves inward and **draws the Endless Knot**, scrubbed by the last 80% of the scroll —
the existing `.knot-draw` primitive on a scroll timeline instead of a clock. The knot completes,
brightens once, and becomes the wordmark.

Under it, the **Door again** — same component, same behaviour, no new copy patterns:

```
h2      Ja ho tens tot.
        Només falta que li diguis alguna cosa.

        [ the Door ]

micro   Gratis. Sense targeta. I si no t'agrada no has perdut res —
        la teva web segueix on era.
```

Then the footer.

---

### The page, before and after

| Today | New |
|---|---|
| Nav · Hero · How(3) · Bento(6) · Studio · Clone · Pricing(2) · FAQ · Waitlist · Footer | Nav · **Door** · Conversa · Clon · Veu · Estudi · No-és · Comunitat · Punts+FAQ · **Door** · Footer |

Three asks become one ask stated twice. Icons become demonstrations. Features become proof. A tool
becomes a movement.

**Deleted:** `HowItWorks`, `FeatureBento`, `CloneSection`, `WaitlistHero` (~250 lines).
**New:** `ThreadSpine`, `Door`, `ConversaScene`, `SplitScene`, `VeuScene`, `NoEsScene`,
`ComunitatScene`, `PuntsScene`.

---

## 5. The funnel — the Door, and killing the five-hop path

This is the highest-value change in the document and it deserves to be stated on its own.

### 5.1 The move

**Start the capture on the landing page, logged out. Ask for the email only at the reveal.**

```
NOW   landing → /preview (iframe) → 30s stall → /registre → /benvinguda → provision → dashboard → SiteOnboarding → capture
NEW   landing → capture runs right here, narrating → the reveal → email + password inline → provision → dashboard, already done
```

The waiting stops being dead time and becomes the show, because `BrandCaptureView` already narrates
real findings while it works. The visitor watches Carma read their site, list what it understood, and
quote their own sentences back at them — **and then** is asked to keep it. The ask lands at maximum
emotional value instead of minimum.

### 5.2 What this needs

| Piece | Work |
|---|---|
| Anonymous capture token | `POST /api/onboarding/brand` accepts an unauthenticated call keyed by a signed anonymous id (httpOnly cookie), result parked in a short-TTL row |
| Claim-on-signup | Registration atomically claims the parked capture into the new user's first site — one RPC, same pattern as the karma ledger's dedupe key |
| Abuse control | `lib/ratelimit.ts` (exists) per IP: 3 captures / hour / IP; the SSRF guard already hardened in the 2026-06-06 audit stays in front of every fetch |
| Cost control | The anonymous path runs scrape + distil only. No image generation, no article. A capture is cheap; keep it that way |
| Cache Components | The Door and the capture stream are client islands inside the cached landing — they must sit behind their own `<Suspense>`, never inside `CachedLanding`'s tree |
| Graceful exit | If they abandon, nothing is lost and nothing is charged. The parked row expires in 24h |

### 5.3 What happens to `/preview`

It stays — a pasted URL that arrives from an ad or a shared link still deserves a full-page clone —
but it is no longer on the primary path, and the 30-second auto-advance timer goes away. Nobody
should ever be pushed toward a signup by a countdown.

---

## 6. Community & growth architecture — THE CARMA INTERACTION PLAN

> **Founder pivot, 2026-09-16.** The first draft of this section led with a live
> ticker of Punts spent globally. That was called correctly: *a spend counter is
> vanity, not community.* Community is **interaction**. This section is rewritten
> around earning points by paying real attention to other people's blogs.

### 6.1 The economic insight that makes this work

Carma's currency has two sides, and they are asymmetric:

| | Costs Carma | Earned/spent by |
|---|---|---|
| **Minting** punts through human effort — reading, reviewing, translating, sharing | **nothing** | attention |
| **Burning** punts on an article, a revision, a cover image | real API money | creation |

So every punt earned socially is a punt we did not have to *give* away to keep
someone active. A community economy here is not a marketing expense — **it is
margin.** It is also the only growth mechanic that gets cheaper as it scales.

And it solves the single worst moment in a new blogger's life, which is not
writing the first article. It is publishing it and watching nobody read it.

> **Els punts que guanyes llegint, els gastes escrivint.**
> Ningú no escriu al buit.

### 6.2 The six principles

These are the design constraints. Any mechanic that violates one is out.

1. **Attention must be PROVEN, not claimed.** There is no "I read it" button.
   A read is scroll depth ≥ 70% plus dwell ≥ 45s, submitted with a server-issued
   nonce that is valid once. A button anyone can click mints a currency anyone
   can forge.
2. **Reciprocity is the engine, not altruism.** The weekly queue prioritises
   authors who have been reading. You receive attention in proportion to the
   attention you give. (The product is literally called Carma. Use it.)
3. **Quality is structural, not moderated.** Feedback is a two-field form with
   an 80-character minimum on each — one thing that worked, one thing to improve.
   You cannot leave "molt bo!" because the form will not accept it. No moderator
   required for the common case.
4. **Nothing is anonymous.** Every interaction carries the giver's name and blog.
   Anonymous criticism is a feature nobody asked for.
5. **The author controls exposure, always.** Opt in per site, and opt out per
   post. A blog enters the circle because its owner said so, never by default.
6. **Earned punts never expire; the monthly allocation still doesn't accumulate.**
   Already true in the ledger (migration 028). It means a month spent reading
   banks real capacity for a month spent writing.

### 6.3 The interaction ladder

Ordered by signal, which is also the order of reward. Every row is one row in
`karma_ledger` with a dedupe key, so nothing can ever pay twice.

| # | Interaction | To the giver | To the author | How it cannot be gamed |
|---|---|---|---|---|
| **I1** | **Llegir** — read a peer's article to the end | **+3** (max 5/day) | — | 70% scroll + 45s dwell + one-use nonce; once per post per reader; never your own site |
| **I2** | **Aplaudir** — "this was useful", weighted | **+2** | **+2** | only unlocks after I1 registers on that post; one per post |
| **I3** | **Comentari útil** — one thing that worked, one to improve | **+15** | **+5** | 80-char minimum per field, one per post, author can flag; flagged giver loses the punts |
| **I4** | **Compartir** — send a peer's article to a WhatsApp group | **+10** | — | needs ≥ 1 real click-through on the tagged link; one per post |
| **I5** | **Traducció creuada** — offer a ca/es/en version of a peer's post | **+20** | — | author must accept it before it pays |
| **I6** | **Validació** — review a peer's DRAFT before it publishes | **+25** | costs the author **10** | author requests it; max 2 reviewers; reviewer must have published ≥ 1 article themselves |

**I6 is the crown jewel and the one to be most careful with.** An author
spending 10 punts to have a human read their draft before the world does is a
genuinely premium experience that costs Carma nothing and cannot be bought
anywhere else. It is also the mechanic most likely to hurt if the reviewer is
careless — hence the "must have published" gate and the author-initiated flow.

### 6.4 The guardrail nobody will think of until it hurts

**Community earnings are capped per plan, per month.**

```
free     150 punts/month earned socially   (≈ 1.5 extra articles)
premium  400
gold     800
```

Without a cap, a determined free user reading five articles a day mints 450
punts a month — four and a half articles of real API cost, funded by nothing.
The cap keeps the loop generous (a free user who participates roughly doubles
their output) and keeps it solvent. It lives next to `KARMA_ALLOCATIONS` in
`lib/karma/config.ts` and is enforced in the same locked transaction as every
other mutation, so it cannot be raced.

### 6.5 The rhythm — what makes it a habit rather than a feature

- **El Cercle de dilluns.** Every Monday, three peer articles chosen for you:
  same language, adjacent sector, never the same blog twice in a month. They
  expire Sunday. A weekly, finite, achievable ritual — the opposite of an
  infinite feed.
- **Reciprocitat visible.** *"Tres persones han llegit el teu article aquesta
  setmana. Dues han dit què els ha semblat."* Delivered on WhatsApp, where the
  agent already lives. For a small business publishing into silence, this is the
  single most motivating message Carma can send.
- **La lliga de lectors.** A monthly leaderboard of **givers**, not publishers.
  It rewards generosity rather than volume, which is the only kind of
  leaderboard that does not turn into a spam contest. Top ten get a badge on
  their blog and a punt bonus.
- **Fet amb Carma** — the wall (§4, scene 7), and the map, once there are towns
  on it.

### 6.6 Economy rebalancing (founder directive)

| Reward | Was | Now | Why |
|---|---|---|---|
| `aparador` — opt into the public showcase | +40 | **+40** | unchanged; we are buying real social proof with our own currency |
| `comparteix` — share to WhatsApp | +25 | **+10** | the action is nearly free for the user; 25 overpriced it and would have invited spam |

And three new micro-rewards for healthy platform behaviour, all one-shot, all
verifiable with reads we already do:

| Key | Punts | Earned by | Why this one |
|---|---|---|---|
| `perfil_complet` | **+15** | name, town and language set on the site | feeds the wall and the map; the cheapest possible unlock of community surface |
| `primera_veu` | **+20** | first voice note sent to the agent | the voice note *is* the product. An owner who has never sent one has not met Carma |
| `primera_lectura` | **+10** | first peer article read (I1) | onboards the loop itself. The hardest step in any exchange economy is the first give |

A fourth candidate — `tres_articles` (+60 at the third published article, the
habit threshold) — is better as a **seasonal** challenge than a permanent one, so
it belongs in the monthly rotation below rather than in the fixed catalogue.

### 6.7 Reptes mensuals — still the highest ROI in this document

Unchanged from the first draft and worth repeating, because it is a day of work:
all five existing challenges are onboarding challenges, so `/dashboard/karma`
dies forever once you have done them. Adding an optional `season: '2026-10'` to a
reward — with the dedupe key becoming `reward:<key>:<season>` — turns a one-time
page into a monthly loop. No new tables, no new infrastructure, the existing
atomic RPC.

```
Octubre a Carma
  Publica 4 articles aquest mes              +120
  Llegeix 10 articles de la comunitat         +80   ← the loop, as a challenge
  Dona 3 comentaris útils                     +90
  Escriu sobre el teu barri                   +60
```

### 6.8 Schema

```sql
-- migration 034 (sketch) — community wave 1 + 2
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS showcase    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS town        TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS showcase_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS sites_showcase_idx ON public.sites (showcase_at DESC) WHERE showcase;

-- I1/I2: proven attention. One row per (post, reader); the nonce is spent on write.
CREATE TABLE IF NOT EXISTS public.post_reads (
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reader_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dwell_ms    INTEGER NOT NULL CHECK (dwell_ms >= 45000),
  scroll_pct  SMALLINT NOT NULL CHECK (scroll_pct >= 70),
  applauded   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, reader_id)
);

-- I3: structured feedback. The CHECKs are the moderation policy.
CREATE TABLE IF NOT EXISTS public.article_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  praise      TEXT NOT NULL CHECK (char_length(praise)     BETWEEN 80 AND 600),
  suggestion  TEXT NOT NULL CHECK (char_length(suggestion) BETWEEN 80 AND 600),
  /** Set when the review targets a DRAFT (I6) rather than a published post. */
  pre_publish BOOLEAN NOT NULL DEFAULT false,
  reported    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS article_reviews_once_idx
  ON public.article_reviews (post_id, reviewer_id);

-- The weekly circle: three assignments per member per week, expiring Sunday.
CREATE TABLE IF NOT EXISTS public.circle_assignments (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  week       DATE NOT NULL,
  done_at    TIMESTAMPTZ,
  PRIMARY KEY (user_id, post_id, week)
);
```

Every punt movement rides the existing `earnKarma` RPC with a dedupe key
(`read:<post>:<user>`, `review:<post>:<user>`, `share:<post>:<user>`), so a retry
can never double-pay and the whole thing stays auditable in one ledger.

### 6.8b The wall, rendered from design tokens

Unchanged and still the right call: we already extract every site's colours,
fonts and logo, so each card on the wall renders **in the identity of the site it
represents** — no screenshots, no storage, no staleness, one query. Scene 7 ships
today seeded with the eight looks Carma ships (real `BLOG_TEMPLATES` tokens,
labelled honestly as looks, not customers); real member sites replace them the
moment `sites.showcase` exists.

### 6.9 Sequencing

| Wave | Ships | Why this order |
|---|---|---|
| **1** — with the landing | The wall (seeded) · the loop explained on the landing · the "Fet amb Carma" badge | Zero new tables. The landing needs the story on day one, and the story is true even before the data is. |
| **2** — the week after | Migration 034 · showcase opt-in (+40) · the three micro-rewards · monthly reptes · WhatsApp share (+10) | Retention and acquisition, almost entirely by extending systems that already exist. |
| **3** | **I1 + I2** (proven reads, applause) · reciprocity notifications · el Cercle de dilluns | The loop's floor. Needs enough published articles that a Monday queue is not embarrassing — roughly 40 blogs. |
| **4** | **I3** (comentari útil) · la lliga de lectors | The quality layer, once there are enough readers for the queue to be warm. |
| **5** | **I6** (validació de draft) · I4 · I5 | The premium mechanic, last, when there is a population of authors worth being reviewed by. |

**The rule that matters: do not ship a community to an empty community.** Waves 1
and 2 are honest with ten members. Wave 3 with ten members is a ghost town, and a
ghost town poisons the idea permanently. Hold it until the wall is full.

## 7. The performance contract

The premise of this page is that it is the fastest beautiful thing the visitor has seen this month.
Everything in §4 is subordinate to that. Here is how it stays true.

### 7.1 The stance: no GSAP, no Three.js, no Locomotive, no Spline

Not because they are bad. Because on this page they are a **regression**:

| Library | Cost | Verdict |
|---|---|---|
| GSAP + ScrollTrigger | ~28 KB gzip + a rAF loop for the page's life | **Declined.** Everything in §4 is `transform`/`opacity`/`clip-path`/`stroke-dashoffset` over scroll — which the browser now does natively, off the main thread. |
| Three.js / R3F | ~150 KB gzip + a WebGL context + a render loop | **Declined.** No scene on this page needs geometry. A gold shader would cost more than the entire rest of the page. |
| Locomotive Scroll | ~15 KB + hijacked native scroll | **Declined twice** — the `modern-web-design` skill lists scroll-hijacking as a top pitfall, and it breaks keyboard and momentum scrolling. |
| Spline | An embedded runtime + a hosted scene | **Declined.** |

**Instead: CSS Scroll-driven Animations.** `animation-timeline: view()` / `scroll()` plus
`animation-range`. Zero JavaScript, runs off the main thread in Chromium, and degrades cleanly.
This is the single most important technical decision in the document.

```css
/* The thread — one fixed 3px column, one property, no JS. */
.thread__lit {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: thread-draw linear both;
  animation-timeline: scroll(root block);
}
@keyframes thread-draw { to { stroke-dashoffset: 0; } }

/* Scene reveals — replaces the IntersectionObserver in LandingPage.tsx:33-46. */
@supports (animation-timeline: view()) {
  [data-reveal] {
    animation: reveal-in linear both;
    animation-timeline: view();
    animation-range: entry 15% entry 65%;
  }
}

/* The pinned conversation — a tall scene, a sticky stage, one named timeline. */
.scene-conversa        { height: 300svh; view-timeline-name: --conversa; }
.scene-conversa .stage { position: sticky; top: 0; height: 100svh; }
.scene-conversa .bubble-1 { animation: bubble-in linear both;
                            animation-timeline: --conversa;
                            animation-range: contain 0% contain 15%; }
```

**Every fallback is what already ships in production.** No support for `view()` → the existing
IntersectionObserver reveal and the existing 16s `.wa-step-*` autoplay loop. Reduced motion → the
existing static full conversation. We are adding a ceiling, not replacing a floor.

### 7.2 Where JavaScript is actually allowed

Four islands. Everything else becomes a server component.

| Island | Why | Budget |
|---|---|---|
| `Door` | Input state, drag-drop, voice recording, submit | ~8 KB |
| `EstudiToy` | Three `useState` toggles | ~2 KB |
| `LangSwitch` | Cookie write + `router.refresh()` | ~1 KB |
| `ComunitatCounter` | Count-up on entry (`IntersectionObserver`, no library) | ~1 KB |

`framer-motion` is already a dependency (12.40) and may be used **only** inside `Door` — and only via
`LazyMotion` + `domAnimation`, which is ~6 KB instead of the ~34 KB full bundle. If the magnetic
button and the chip transitions can be done in CSS, we do them in CSS and framer-motion does not
appear on this route at all. My expectation: it does not.

### 7.3 The budget (a contract, not an aspiration)

| Metric | Today | Target | Hard fail |
|---|---|---|---|
| JS on `/` (gzip) | **211 KB** | **≤ 70 KB** | > 90 KB |
| CSS on `/` (gzip) | 27 KB | ≤ 30 KB | > 35 KB |
| LCP (Moto-G-class, 4G) | unmeasured | ≤ 1.2s | > 1.8s |
| CLS | unmeasured | **0** | > 0.02 |
| INP | unmeasured | ≤ 200ms | > 250ms |
| Long tasks after load | unmeasured | **0** | any > 100ms |
| Infinite animations above the fold | 3 | ≤ 3 (2 halos + 1 `.gold-trace`) | 4 |
| Fonts | 4 files | 5 files, 1 preloaded | 6 |

The JS number is the interesting one: **the entire visual revolution in §4 is supposed to make the
landing lighter, not heavier**, because the biggest win available is deleting the `'use client'` at
the top of the tree and shipping static marketing text as static marketing text.

### 7.4 The gate

This repo's culture is invariant tests, not promises — `test:render` 247, `test:fidelity` 97,
`test:brand` 49, `test:brain` 86. The landing gets the same treatment:

```
npm run test:landing
```

A headless-Chrome run (same harness as `test:fidelity`) asserting, on every build:

1. Landing JS ≤ budget, CSS ≤ budget (parsed from the build output, not eyeballed)
2. CLS exactly 0 across a scripted scroll to the footer
3. Zero long tasks > 100ms after `load`
4. With `prefers-reduced-motion: reduce`, **every text node on the page is visible** (the
   regression that turns a reveal animation into an invisible page)
5. With JavaScript disabled, the h1, all scene copy, the pricing and the footer still render
6. No `filter: blur()` on any element larger than 200×200px (the 2026-07-06 landing-freeze rule,
   encoded so it cannot come back)

Point 6 is there because the landing-freeze incident has happened once already. Rules that live only
in a comment come back; rules that live in a test do not.

### 7.5 On "sub-50ms"

To be precise about what is achievable, because the number matters:

- **Edge-cached HTML: yes.** The landing is `'use cache'` + `cacheLife('max')`, three locale entries,
  invalidated only on deploy. With correct `s-maxage` at the edge (the same lesson as the blog
  slowness fix), TTFB from a warm edge node is **20–60ms** and the document is ~15 KB.
- **First paint: ~300–600ms** on a real 4G phone — network and font, not our code.
- **Interaction latency: yes, sub-50ms**, if §7.2 holds. Scroll-driven CSS animations do not run on
  the main thread, so the scroll stays at 60/120fps no matter how elaborate the choreography looks.

The honest framing for the page itself: *"Carma's blogs load in under a tenth of a second"* — which
is a claim about the render engine we shipped today and is measurable, rather than a claim about the
marketing page, which nobody benchmarks.

---

## 8. The nineteen skills — what each one contributes, and what it costs

Confirming your requirement directly: **sixteen of the nineteen contribute zero bytes to the bundle.**
They are knowledge, not dependencies. Two are deliberately declined. One is already installed.

| Skill | Contribution to this work | Bytes shipped |
|---|---|---|
| `frontend-design` | The anti-generic mandate; the typography decision (§3.1); "commit to one bold direction" — which is why there is exactly one device, one easing, one grid-break | 0 |
| `meta-skills:modern-web-design` | Scrollytelling patterns (§4.2), cursor UX (magnetic submit), the scroll-hijacking pitfall that killed Locomotive, the fluid type scale | 0 |
| `core-3d-animation:gsap-scrolltrigger` | The pin/scrub/stagger *vocabulary* for §4 — then translated to native CSS timelines. The skill taught the choreography; we ship it without the library | 0 (declined) |
| `core-3d-animation:motion-framer` + `motion` | `LazyMotion`/`domAnimation` for the Door only, if CSS proves insufficient | ≤ 6 KB, already a dep |
| `animation-components:react-spring-physics` | Spring constants for the magnetic button (stiffness 400 / damping 17), implemented as a CSS spring | 0 |
| `animation-components:animejs` | SVG stroke-draw technique behind the thread and the knot tie | 0 |
| `animation-components:scroll-reveal-libraries` | Confirms AOS is unnecessary — `view()` does it natively | 0 (declined) |
| `animation-components:animated-component-libraries` | Marquee and ticker patterns for the community wall | 0 |
| `authoring-motion:*` (Rive, Spline, Blender, Substance) | Evaluated for the hero; **all declined** — every scene is CSS/SVG. Held in reserve if we ever want an animated mascot | 0 |
| `core-3d-animation:three/babylon`, `extended-3d-scroll:*` | Evaluated and declined for §7.1. Kept for the *product* (a future Studio 3D preview), not the landing | 0 |
| `web-performance-optimization` + `web-performance-audit` | §7.3 budgets and §7.4 gate; the island architecture | 0 |
| `react-best-practices` | Deleting the top-level `'use client'`; server components by default; islands at the leaves | **negative** |
| `nextjs` | Cache Components correctness: `'use cache'` boundaries, what may not touch request data, Suspense placement for the ticker and the Door | 0 |
| `interaction-design` | Feedback states in the Door (drop, listen, resolve, error), loading choreography, the "page reacts before submit" behaviour | 0 |
| `design-system-creation` | Landing tokens as an extension of `globals.css`, never a parallel system | 0 |
| `tailwind-v4-shadcn` | `@theme` additions for the display scale in v4 syntax | 0 |
| `mobile-first-design` | Every scene has its 390px form in §4; no pin on mobile; the draggable split | 0 |
| `image-optimization` | Moot — the new design ships **zero raster images**. Logos are SVG, cards are CSS from tokens | 0 |
| `seo-optimizer` | Scene copy as real semantic headings; the landing must render fully with JS off (gate item 5) | 0 |
| `internationalization-i18n` | All new copy into `marketing/copy.ts` ca/es/en, typed, as today. The Catalan is written first and translated second — never the reverse | 0 |
| `wordpress-plugin-core` | Not used here | 0 |

**One optional exception, offered honestly:** if you want a genuine WebGL moment, the only place it
earns its keep is the knot tie in Scene 9 — a gold-foil shader on a 480×480 canvas, lazy-loaded
after `requestIdleCallback`, desktop only, `deviceMemory ≥ 4` only, behind a flag, ~25 KB. **My
recommendation is to ship without it and measure.** If the CSS knot already gives people chills, a
shader adds nothing but risk.

---

## 9. Build sequence

| Phase | Work | Est. |
|---|---|---|
| **A — Foundations** | Instrument Serif + display scale; `ThreadSpine`; scroll-timeline primitives + `@supports` fallbacks; delete the top-level `'use client'` and split into islands; `npm run test:landing` gate wired before any visual work | 1 day |
| **B — The Door** | `Door` component (landing `BrandIntake`); page-wide dropzone; URL resolve-preview; magnetic submit; anonymous capture API + claim-on-signup + rate limits | 1.5 days |
| **C — The scenes** | Scenes 0–9 in order; delete `HowItWorks`, `FeatureBento`, `CloneSection`, `WaitlistHero`; all copy into `copy.ts` ca → es/en | 2 days |
| **D — Community wave 1** | Migration 034; showcase opt-in (+40 punts); the token-rendered wall; the ticker RPC + index; the map | 1 day |
| **E — Prove it** | Run the gate; real-device pass (iPhone SE, mid Android); reduced-motion pass; JS-off pass; Safari + Firefox scroll-timeline fallback check | 0.5 day |
| **F — Community wave 2** | Monthly reptes; the badge loop; WhatsApp share | 0.5 day |

Phases A and B are the risky ones and they come first, deliberately: if scroll-driven CSS does not
hold up on the target devices, we find out on day one with the fallback already in place, not on day
five with six scenes built on top of it.

---

## 10. Risks, and what I need you to decide

### Risks

| Risk | Mitigation |
|---|---|
| Scroll-driven CSS in Safari/Firefox | Every animation has an `@supports` fallback that is literally today's shipped behaviour. Worst case on an old browser: the page looks like today's page, which is acceptable. |
| Anonymous capture gets abused | Rate limit per IP, existing SSRF guard, scrape+distil only (no generation), 24h TTL, superadmin kill switch. |
| The community section looks empty at launch | Wave 1 only. C4 is explicitly held until there are users. An empty wall is worse than no wall. |
| A second font hurts LCP | One file, one weight + italic, preload on `/` only, metric-matched fallback. The gate fails the build if CLS moves off 0. |
| Scope: this is a lot | Phases A–C are the landing and stand alone. D–F are additive and can slip without breaking anything. |
| I am wrong about the serif | It is one `next/font` import and a CSS variable. Reversible in ten minutes. |

### Decisions — all made, 2026-09-16

| # | Decision | Outcome |
|---|---|---|
| 1 | Display face | **Fraunces** (variable, SOFT + WONK), Ubuntu keeps the UI |
| 2 | The logged-out Door | **Approved**, with strict rate limits — see §5.2 and the build log |
| 3 | Delete `WaitlistHero`, `CloneSection`, `HowItWorks`, `FeatureBento` | **Approved.** Done — plus `UrlInput` and `AgentPhoneMock`, which had no callers left |
| 4 | The movement line | **Approved**: *Omplim internet en català* |
| 5 | Community scope | **Pivoted** to the Interaction Plan (§6). Ticker cut as vanity |
| 6 | Reward economy | Showcase **+40** kept · share **25 → +10** · three new micro-rewards (§6.6) |
| 7 | The Endless Knot | **Living identity** — six states through the page (see the build log) |

---


---

*The design system in `globals.css` is not up for renegotiation. Every scene above composes its
existing tokens, its easing and its motion primitives. What changes is the skeleton, the typography,
the ask — and whether anyone believes a person made this.*

---

# BUILD LOG — Phases A, B, C · 2026-09-16

All seven decisions applied. The landing is rebuilt, the Door is live, the gate is green.

```
next build        ✓ compiled, 48/48 pages
test:landing      ✓ PASS  0 failures, 0 warnings   (new)
test:render       ✓ 247 / 247
test:brand        ✓  49 /  49
tsc --noEmit      ✓ clean
eslint src/       ✓ clean — 0 errors, 0 warnings
```

## The number that matters

| | Before | After |
|---|---|---|
| **Landing's own JavaScript** | ~74 KB gzip | **28.1 KB gzip** (90.6 KB raw, 6 chunks) |
| Framework floor (every route) | 136.3 KB gzip | 136.3 KB gzip |
| Total on `/` | 210 KB gzip | **164.3 KB gzip** |
| CSS | 27 KB gzip | 29.1 KB gzip |
| Client components on the landing | **the whole page** | 3 islands (Nav · Door · EstudiToy) |
| Idle infinite animations | 16 (the WhatsApp loop) + halos | **2** (the halos) |

**A correction to §7.3.** The plan set a 70 KB total JS budget. That number was
wrong, and the gate is what proved it: Next 16 + React 19 ship a **136 KB gzip
floor on every route** (`build-manifest.json → rootMainFiles`), which no design
decision can move. Budgeting the total would have been budgeting someone else's
code. The gate now measures the landing's **own** chunks against 40 KB (hard fail
at 60), reports the floor separately, and excludes the `noModule` core-js
polyfill bundle — 38.6 KB that no browser capable of running this app ever
fetches. The honest figure is **28.1 KB of Carma on the landing**, down from ~74.

## What the gate caught that a browser would not have

`npm run test:landing` found four real defects on its first run, and every one
of them was invisible on screen:

1. **pdf.js on the marketing page.** The Door imported a three-line
   `isAcceptedDocument` predicate from `lib/brand/documents`, a server-only
   module that reaches pdf-parse and mammoth through dynamic imports. The bundler
   followed it and emitted **~47 KB gzip of PDF parser** onto the landing. The
   predicate now lives in a dependency-free `lib/onboarding/documentTypes.ts`.
2. **The Door was not in the HTML.** `LandingCopy['door']` carried two
   *functions* (`sawFile(n)`, `revealPages(n)`). Functions cannot cross the
   server→client boundary, so React threw while server-rendering the Door and
   emitted an empty `<template>` where the page's only call to action belongs.
   In a browser it looked perfect — hydration filled it in. To a crawler, to a
   reader mode, and to anyone with JS off, **the landing had no CTA**. Both are
   now plain strings with a `{n}` placeholder, and a function anywhere in the
   copy is a hard gate failure.
3. **The gate failed on its own changelog.** The blur scan matched
   `blur(140px)` inside the comment in `globals.css` that *documents* the
   2026-07-06 freeze. It strips comments now.
4. **The `@supports` detector matched nothing.** `@supports (animation-timeline:
   view())` contains parentheses inside the condition, so a lazy `[^)]*` stopped
   at the wrong one. It reported "no guard found" on a file that is 18 guards
   deep.

## Phase A — foundations

- **Fraunces**, variable, axes `SOFT`/`WONK`/`opsz`, `display: swap`, imported in
  `LandingPage.tsx` so the preload is scoped to `/`. Display scale in
  `landing.css` (`--display-xl/lg/md`, all `clamp()`).
- **`src/app/landing.css`** — the whole motion layer in one file, imported by
  `globals.css`. 18 scroll timelines, every one inside `@supports`, every one
  inside `prefers-reduced-motion: no-preference`, every base state **visible**.
- **The thread** is `scaleY` on a fixed 2px column driven by `scroll(root)` —
  compositor-only, so scrolling the page costs zero paint. (The plan proposed
  `stroke-dashoffset`; that repaints. Only the closing knot, a 220px box on the
  last screen, keeps it.)
- **Deleted**: the 16s WhatsApp autoplay loop (5 step animations, 3 typing
  indicators, a waveform, a tap ring, 6 sparks — all `infinite`, all running
  whether or not anyone was looking), the IntersectionObserver reveal, the
  `<noscript>` reveal override, `WaitlistHero`, `CloneSection`, `HowItWorks`,
  `FeatureBento`, `UrlInput`, `AgentPhoneMock`. **5.1 KB of CSS and ~250 lines of
  component code removed.**
- **The page is a server component.** Three islands, enforced by the gate.

## Phase B — the Door

`POST /api/onboarding/glimpse` — public, SSE, rate-limited three ways (12 calls,
6 scrapes, 2 transcriptions per IP per hour), SSRF-guarded, **no LLM and no
database write**.

The one design decision worth recording: the reveal's emotional payload — *"these
sentences are yours, we didn't write them"* — comes from `candidateSentences()`,
which is a **deterministic extractor**. No model has ever been involved in
*finding* a brand's real sentences; the model downstream only ever picks among
them by index, precisely so it cannot paraphrase. So the free, honest half of the
capture is exactly the half the visitor needs to see — which means the logged-out
Door needed no parked-brain table, no TTL, no claim RPC and no migration.

The account wall lands where it should: **you see that we read you → you sign up
so we can learn you.**

What crosses into signup is only strings (URL, transcript, extracted text), in
`sessionStorage`, read back in `SiteOnboarding` through `useSyncExternalStore`
(not an effect — react-hooks v6 rejects setState-in-effect, and it would be a
wasted render).

Verified live against a real site:

```
events: read:running | read:done(6 pàgines) | documents:skipped | voice:skipped | listen:done | result
siteName: Mozilla   pages: 6   locale: en
QUOTE: "Together, we can keep the internet easy, safe and free — for everyone."
QUOTE: "We have worked together since 1998 to ensure that the internet is developed in a way that benefits everyone."
```

Empty body → 400. Loopback URL → refused by the SSRF guard. A site with no
readable prose → the honest "this one won't let me read it" state, with the
funnel still moving.

## Phase C — the scenes, and the living knot

Ten scenes, in the order §4 specifies. The founder's seventh directive — *the
Endless Knot must be alive* — is implemented as **six states**, all
compositor-only:

| State | Where | Driven by |
|---|---|---|
| **Anchor** | top of the thread, in the gutter | — |
| **Turn** | the same knot, rotating 90° across the whole page | `scroll(root)` |
| **Flare** | the Door, every time it accepts something — a paste, a drop, a voice note, a submit | one-shot, fired by the island |
| **Thinking** | the Door while the glimpse runs; the only movement on screen | the one animation kept under reduced motion, because a still spinner during a 40s wait reads as a crash |
| **Tick** | beside every scene's eyebrow, lighting as its scene arrives and staying lit | `view()` |
| **Watermark** | 620px at 4.5% opacity behind La Veu and Què No És, parallaxing | `view()` |
| **The tie** | the closing knot draws itself over the last screen, then fills, then becomes the wordmark | `view()` |

## Deviations from the plan, and why

- **No map.** It needs member towns (`sites.town`, wave 2). A decorative map of
  invented dots is exactly the fabricated proof this page exists to avoid. The
  community scene ships with the loop and the wall instead.
- **No live counters.** Same reason, and the founder's pivot removed the one
  counter that was planned. No number appears on this page that is not true.
- **The wall is seeded** with the eight `BLOG_TEMPLATES`, rendered from their
  real tokens and labelled honestly as looks rather than customers.
- **The split scene does not drag on mobile.** The plan wanted a draggable
  divider; that is JavaScript for a decoration. It is scroll-driven on every
  screen size. Revisit if it tests badly.
- **The pinned conversation is desktop-only** (≥1024px), as planned. On a phone
  the same six beats arrive as ordinary reveals — no sticky, no jank.

## Follow-ups

- **`/preview` still exists** with its 30-second auto-advance. It is off the
  primary path now but the countdown should go; nobody should be pushed toward a
  signup by a timer.
- **Migration 034 is not written yet** (community wave 2). §6.8 has the sketch.
- **The reward-catalogue rebalance (§6.6) is documented, not coded.** It is a
  `lib/karma/config.ts` change plus verification in `challenges.ts`, and it
  belongs with wave 2 rather than with the landing.
- **The glimpse has no test.** The scrape and the extractor are covered by
  `test:brand`; the route's rate limits and SSE framing are not. Worth a
  `tests/glimpse.mjs` before it carries real traffic.
- **Real-device pass not done.** The gate proves budget, structure, fallbacks and
  server-rendered content. It cannot prove LCP on a mid-range Android, and
  nothing here should be read as if it does.

---

# BUILD LOG — 2026-09-17 · the founder's fourth pass

Nine notes, in one message, after reading the page cold. All nine are done. The
theme running through six of them is the same one: **the page was still saying
things I made up.**

## 1 · The eyebrows are gone

> "elimina els eyebrow son molt d'ia"

Eight pills — *El clon*, *La veu*, *L'Estudi*, *Els punts*, *Dubtes* — one above
every heading. A category label floating over a title is the most reliable tell
that a page came out of a machine: no human introduces a paragraph by naming its
genre first. Removed from the JSX, removed from `LandingCopy` (the type, and 24
strings across three locales), and `KnotTick` went with them since it existed
only to sit inside one.

`tests/landing.mjs` now fails the build if a pill ever comes back:

```js
const eyebrows = [...html.matchAll(/class="[^"]*\beyebrow\b/g)].length
if (eyebrows) bad('eyebrow pills are back on the landing', String(eyebrows))
```

The `.eyebrow` CSS stays in `globals.css` — `ReviewClient` still uses it, and
that one is a status chip, not a heading label.

## 2 · EL CLON is deleted

> "la part de s'assembla a la teva web tampoc [s'entén] i sobra bastant"

The most expensive scene on the page: a mock browser whose header and footer
stayed pinned while its middle re-flowed into article cards, driven by five
scroll timelines and ~70 lines of `.sc-morph` CSS, with two "this stays" tags
pointing at the chrome. The founder read it twice and got nothing from it.

The claim underneath it was true and worth exactly one sentence. So it is one
sentence now — `<Fidelitat>`, a band on the last panel of ink — and the mock,
the timelines, `Morph`, `Keep` and the whole `clon` copy block are gone. The
page lost a screen of scrolling and 2.2 KB of CSS and says the same thing.

## 3 · LA VEU no longer puts words in anyone's mouth

> "la part de la veu no s'enten" · "part d'aquestes frases son teves fora"

The scene printed two sentences —

> *«Fem pa de forn de llenya des del 1954, i no pensem canviar-ho.»*

— under a caption reading *"aquestes frases no les hem escrit nosaltres"*. I
wrote both of them. The one scene on the page about never inventing a brand's
voice was inventing one, in a typeface chosen to make it feel found.

Both are deleted, along with `veu.quotes`, the `.veu-mark` highlight sweep and
its keyframe. What replaces them makes no illustration at all: four plain rows
naming what she actually keeps — how you address people, your own words, your
sentences verbatim, the tone that is not yours — and then a link back up to the
Door, which shows the visitor *their own* sentences off *their own* site, live,
thirty seconds earlier. The real demonstration was always up there.

Same pass: the florist is finally gone. `Flors Lloveras` is a real business from
the grabber cache, and the second phone mock and the Studio's demo articles
still carried its name, its domain and three articles about Sant Jordi bouquets
that I had written for it. Replaced with a business that has no sector, writing
about the one thing every business can speak to — how it decides.

And the proof line was not true:

| claimed | measured |
|---|---|
| "100% de fidelitat de capçalera i peu" | `report.json` — header found 95%, footer 98% |
| — | `fidelity.json` — 97 cases, ruleCoverage 1, tokenPreservation 1 |

The 100% belongs to the CSS fidelity suite, not to header detection. The line
now says what the suite proves: *"Provat amb 97 webs reals: ni una regla d'estil
ni un color s'hi perden pel camí."*

## 4 · The Studio: fourth on the page, and actually centred

> "lstudio mes amunt i a mes continua sense centrarse a la pantalla i sen va cap
> a lesquerra"

The drift was a real bug, reported twice and dismissed once. The wrapper read:

```
mx-auto mt-12 max-w-6xl lg:-mx-4 lg:max-w-[74rem]
```

`-mx-4` sets `margin-left` **and** `margin-right` to `-1rem`, which overwrites
the `auto` that was doing the centring. Above 74rem of available width the box
pinned itself to the left edge and left the surplus on the right — exactly what
was reported. Now `mx-auto w-full max-w-[74rem]` and nothing else.

Position: the scene order is `Entrada → Conversa → Fidelitat ‖ Estudi → Veu →`,
so the Studio is the fourth thing you meet instead of the sixth, and the ink/
paper seam moved up with it.

## 5 · "Començar sense web" is a path, not a footnote

> "opcio de començar sense web falta o esta molt amagada a tot arreeu"

It existed as one grey text link, on a screen you only reach *after* signing up —
and arriving from the Door skips that screen entirely. A visitor with no website
had no route at all. `?nova=1` is now a first-class funnel intent, carried the
whole way:

```
landing / Door  →  /registre?nova=1
AuthPanel       →  /benvinguda?nova=1        (survives the register↔login toggle)
Benvinguda      →  /dashboard/sites/<id>?onboarding=1&nova=1
SiteOnboarding  →  opens ON the template gallery
```

Four entry points on the landing (both Doors, the fidelity band), and the
gallery's back button becomes *"Sí que en tinc, de web"* when there is no intake
to go back to. On the intake screen itself the ghost link became a real card
with an icon, a title and a sentence, under an "o" divider.

## 6 · The page stops jumping to the top

> "quan enten la web sen va cap a dalt o prems per parlar tambe torna cap a dalt
> de la pgina hauria de quedarse sempre mateix marcador o tenir efecte perque es
> vegi millor"

Two jumps, two causes.

**Pressing "prem i parla"** — `VoiceRecorder` is a `dynamic()` import with no
Suspense boundary of its own, so the nearest boundary up the tree owned the
suspend. When that is the route's, React hides the entire page behind the
fallback for the frames it takes to fetch the chunk, and the scroll position is
discarded. Not a jump at all: the page being torn down and rebuilt at offset
zero. A local `<Suspense>` keeps the suspend inside one box.

**The reveal** — the Door replaces its whole body between phases (a three-line
form becomes a 700px result), which is more than scroll anchoring will absorb.
So the position is taken deliberately rather than fought over: `keepInView()`
puts the card back under the nav after the swap, smoothly, and skips entirely if
the card is already comfortably in frame. That covers "quedar-se al mateix
marcador".

And the other half — "o tenir efecte perque es vegi millor" — is `.door-ring`: a
gold ring out of the card's own edge, 900ms, mounted as a keyed child so the
one-shot replays every time. It is exempt from the reduced-motion kill switch
(it fades instead of travelling), because it fires in response to the visitor's
own action and is the only feedback that the page moved for them.

## 7 · The QR is gold-white on ink

> "qr se veu molt negre hauria de ser blanc o or.brillant"

`#1c1917` on transparent — a slab of near-black in the middle of a gold screen.
Now `#fff7d6` (the brightest stop of the knot gradient) on its own `#14110c`
plate, whose padding is the quiet zone. Error correction goes `M → Q`, so a
quarter of the code can be lost and still decode; that buys back more than the
inversion costs when a phone reads a screen at an angle.

## 8 · One phone, several blogs — it was already handled, just never said

> "un mobil pot connectarse a diversos blogs aixo com ho gestionem?"

Traced end to end before answering:

| layer | behaviour |
|---|---|
| `webhook/route.ts` | phone → one `wa_identities` row → one owner |
| | `wa_identity_sites` is an optional per-phone allow-list |
| | empty → falls back to every site the owner belongs to |
| `worker.ts` | 1 candidate → routes silently |
| | >1 → `phase: 'resolving_site'`, the blogs listed and numbered |
| `brain.ts` | the reply "2" binds the held brief to that site |

So the answer is: **it works, and the agent asks.** The reason the question came
up is that nothing anywhere in the UI said so. It does now, on the connect
screen, next to the QR.

## 9 · The WhatsApp connect screen, redistributed

> "part de connectar whatsapp massa vertical tot esta be per responsive pero
> aprofitar millor espais perque quedi clar tot esperant connexio. redistribuir
> millor jerarquia visual"

One 900px column: headline, button, hint, QR, code, heartbeat, disclosure,
reward chip — each waiting its turn below the fold on a laptop. Everything that
matters *while you wait* was the part that had scrolled away.

Two columns now, split along the only line that means anything here:

| left | right |
|---|---|
| what this is | scan it |
| the one button to press | the three steps |
| the code, the manual fallback | the heartbeat |
| the reward | one phone, several blogs |

Below 1024px it stacks in that order, which is also the order of importance on a
phone — where the button *is* the flow and the QR means nothing.

## Gates

```
next build            ✓          test:landing   ✓ PASS 0 failures
test:render  247/247  ✓          test:brand     49/49   ✓
test:brain    99/99   ✓          tsc            ✓
eslint (src + tests, --max-warnings=0)          ✓
```

Landing own JS **31.5 KB gz** (budget 70), CSS **30.0 KB gz** — down 0.4 KB
despite the additions, because deleting the clone scene took 2.2 KB of timelines
with it. Scroll timelines 22 → 17.

Served HTML asserted directly against a booted `next start`: no eyebrow class,
no `florsllovera`, no "Sant Jordi", no "forn de llenya", the Studio wrapper
centred with no `lg:-mx-4`, and the scene order `la-porta → com-funciona →
fidelitat → estudi → la-veu → comunitat → punts`.

**Still not verified by eye.** There is no headless browser on this machine
(`patchright` is not installed), so every visual claim above is structural —
read out of the served HTML and the CSS, not looked at.
