# EL TALLER — a design engine, not a template gallery

**Status:** **W0 → W5 SHIPPED** (2026-09-20 → 23) · course-corrected on five founder critiques · W6–W8 open
**Predecessors:** `2026-09-16-super-mvp-master-plan.md`, `2026-09-16-landing-and-community-vision.md`, `2026-09-18-performance-every-page.md`
**Gates this plan must never break:** `npm run test:render` · `test:fidelity` · `test:brand` · `test:landing` · `test:perf` · `test:vitals`
**Gates this plan SHIPPED:** `npm run test:genome` (the engine) · `test:evidence` (the Eye) · `test:director` (the deterministic art director) · `test:director-llm` (the model, mock by default, `--live` opt-in) · `test:perf` §6 (the published blog — the first budget this product has ever had on the page it actually sells)
**Gate still to ship:** `npm run design:eval` — a scored, reviewable measure of whether a generated design is any *good*
**Migration it adds:** `039_design_genome.sql` (not yet written — the queue already has **037** and **038** outstanding; confirm those first)

> **Revision 2, 2026-09-20.** The founder approved the architecture and returned five
> product critiques. All five are answered in code, not prose: the register spine and
> the energy budget (§4), the anti-mean sampler (§5), the chrome ladder (§9.1), the
> deleted taste test (§9.2) and the lexicon (§0.2). The sections below are the
> corrected plan; §15 reports what W0, W1 and W2 measured.
>
> **Revision 3, 2026-09-21.** The founder settled §17 and W2 shipped. The three AA
> failures are fixed in their own commit (`fb509c6`). The Eye is built: the grabber
> now produces judgements, not values, and every site in the corpus comes back with a
> score, a verdict and a chrome rung.
>
> **Revision 4, 2026-09-21.** W3 shipped. Rung 3 of the ladder is real: evidence →
> three genomes with no model anywhere, 297 of 297 valid, **0.635 distinctiveness**
> against the founder's 0.60 floor, at a **p99 of 0.91ms**.
>
> **Revision 5, 2026-09-21.** The two structural bottlenecks are closed (§15.9) —
> and closing the second one uncovered a shipped bug that had been rendering our own
> dark template light on every customer blog. W4 shipped: the model is rung 1, it is
> constrained by the same register spine and energy budget as the maths, and every
> failure path lands silently on W3.

---

## 0 — The decision, and the honest reading of it

The founder's call: stop shipping pre-defined blog templates. Carma is an intelligent
platform, so the design it hands a customer must be generated *for that customer* — from
their website if they have one, from whatever they can tell us if they don't.

That decision is right, and the reason is visible in our own source. We ship **eight**
hand-designed identities (`src/lib/render/templates.ts`, 503 lines) and **three**
archetypes that dress those identities in module configurations
(`src/lib/render/archetypes.ts`). Every Carma blog on earth is one of eight looks. The
product's pitch is *"we read your business and we understand it"* — and then it hands
over a look picked from a drawer of eight. The promise and the artefact do not match.
That mismatch is what is being fixed.

But the brief contains a word that has to be pinned down before anything gets built,
because if it stays vague the whole plan becomes a vibe.

### 0.1 What "Awwwards-level" actually means, with numbers

Awwwards scores on four axes with published weights: **Design 40%, Usability 30%,
Creativity 20%, Content 10%**. A site goes to a minimum of 18 jurors, the three most
extreme scores are dropped, and Site of the Day needs an average of 8.0. Their own
guidance is blunt about the trade: *a visually groundbreaking site that takes five
seconds to load or confuses basic navigation scores lower than a clean, fast,
well-structured site with modest creativity.*

Two consequences, and both change what we build.

**First: 70% of the score is Design plus Usability.** Speed, contrast, navigation,
legibility and restraint are not the tax we pay for beauty — they are most of the mark.
Our existing gates (`test:perf`, `test:vitals`, `chromeContrast.ts`) are not obstacles to
this plan. They are 30% of the grade, already instrumented, already green.

**Second: the trophy case is lying to us about the medium.** In Q1 2026, 61% of Site of
the Day winners were immersive 3D experiences, averaging 8.7 on creativity against 6.4
for flat layouts. A blog is not that and should not try to be. A blog that ships WebGL is
a worse blog: slower to read, worse on a phone, hostile to the one job it has.

So this plan does **not** promise Site of the Day. It promises the thing that is actually
worth having and that nobody in our category delivers:

> **PREMIUM EDITORIAL MAGAZINE ELEGANCE** — typography that was chosen, spatial rhythm
> that was composed, colour that was reasoned about, motion that is restrained and costs
> zero JavaScript, and a page that loads faster than the template it replaced. Bespoke
> per customer, and visibly different from every other Carma blog.

That is a claim we can build, budget and measure. "Make it Awwwards" is not.

### 0.2 The lexicon rule — and why it is a prompt-engineering decision, not a branding one

**Founder critique #5.** Internally, "Awwwards-level" is useful shorthand between people
who know what it means. In a **prompt** it is actively harmful, and the reason is
mechanical rather than stylistic.

A language model's association with that token is the gallery's front page: immersive
3D, WebGL, scroll-jacked narrative, cursor trails. Put the word in a system prompt and
the art director will reach for exactly the things the Awwwards rubric *penalises* on a
blog — the same rubric that scores Usability at 30% and warns that a groundbreaking site
which loads in five seconds scores below a clean fast one.

So the word never reaches a model. The north star is one string, defined once in code and
shared by the prompt, the Studio copy and this document:

```ts
// src/lib/design/genome.ts
export const LEXICON = 'Premium Editorial Magazine Elegance' as const
```

"Awwwards" survives as an internal benchmark — what we compare our output against — and
appears in no prompt, no customer-facing surface, and no generated brief.

---

## 1 — What the field already tried, and why none of it is our answer

Generative UI in 2026 has split into two camps.

| | **Constrained composition** | **Free code generation** |
|---|---|---|
| Who | Wix ADI, Relume (1,000+ human-crafted components) | v0, Lovable, Framer AI |
| Method | AI picks and orders blocks from a fixed library | AI writes HTML/CSS/JSX directly |
| Strength | Always renders, always inside the design system, safe | Genuinely open-ended |
| Failure | Users are *limited to the sections the tool provides*; output is recognisable as that tool. **This is our eight templates with extra steps.** | Arbitrary output that doesn't align with the design system; consistency decays; UI debt accumulates. And it is **unsafe**: model output is untrusted input, and CSS sanitizers are known to disagree with browser parsers in exploitable ways (PortSwigger, *CSS: the bomb inside your inbox*). |

We can't take camp one: it is the problem, restated. We can't take camp two: we would be
injecting model-authored CSS into a document that already carries the customer's own
markup, our modules and a Declarative Shadow DOM — and we would forfeit every guarantee
built over four months (247 render invariants, a byte budget, a contrast audit, a
fidelity suite).

**There is a third way, and it is the one available to a company that owns its renderer:**

> The model never emits a single character that reaches a browser.
> It emits a **design specification** — JSON, against a closed, versioned schema — and a
> **deterministic compiler we own** turns that specification into CSS.

The model is an **art director**. The compiler is the **studio**. An art director
chooses; they do not hold the pen. Safety, budget, caching, editability, reproducibility
and undo all follow from that one separation.

### 1.1 The material got good enough to do this

This architecture was impossible in 2021, because declarative CSS was too narrow: you
could parameterise colour and font, and anything interesting needed JavaScript. That is
no longer true. As of 2026 the following are Baseline (shipped in every engine, ~94% of
users) or safe progressive enhancement:

- `oklch()` and `color-mix()` — perceptual colour, so a palette can be **computed** from a
  brand hue instead of guessed.
- `clamp()` fluid type scales, `text-wrap: balance` / `pretty`, `initial-letter`,
  `hanging-punctuation`, `font-optical-sizing`, `font-variation-settings` — the
  typesetting controls that used to require InDesign. All of them **ship off by default**,
  which is exactly why almost no site on the web has them on, and why turning them on
  reads instantly as craft.
- `subgrid`, container queries, `:has()`, `@scope`, cascade layers — composition without a
  layout library.
- Scroll-driven animations (`animation-timeline: view()`) and View Transitions — ~83–85%
  support, degrading to *nothing happens*, which is a perfect fallback.

Our landing already proves the last point in production: **31.5KB of its own JS with
scroll-timeline motion throughout** (`2026-09-16-landing-fil-dor`). The motion budget for
this plan is not a hope. It is a precedent.

### 1.2 And colour got solvable

The OKLCH + APCA line of work (Evil Martians' Harmony and Harmonizer; the 2026 research
on context-adaptive optimisation reporting 93.7% success across all colour pairs and 100%
on reasonable ones) means a palette can be generated with **perceptually consistent
lightness and a guaranteed contrast floor**, from one seed hue, deterministically.

That matters more to us than to most, because we already know what the alternative costs:
`src/lib/scrape/chromeContrast.ts` is 488 lines of *repair* — auditing a captured site's
colours and patching failures afterwards — plus a `contrastGuardScript()` shipped to every
rendered page. A generated palette needs none of that, because contrast becomes a
**construction constraint, not a post-condition**. We don't check whether the design
passes. We make a failing design unrepresentable.

---

## 2 — The good news: we already own the hard half

This is not a rewrite. The substrate has been built over four months, mostly for other
reasons. The inventory changes the size of the job:

| What we have | Where | Why it matters here |
|---|---|---|
| **A stable semantic DOM for the blog** | `theme.ts` → `.carma-root / .carma-grid / .carma-card / .carma-card-media / .carma-card-body / .carma-article-content` | The markup is *ours* and does not change per design. **Generative design becomes a pure CSS problem** — no markup generation, no component assembly, no injection surface. |
| **Proof the vocabulary is enough** | `feedLayouts.ts` — 7 structurally different feeds, pure CSS over that one markup | Editorial rows, 3-col magazine, XL grid and gradient overlay already come from the *same HTML*. The idea is validated; it just needs to stop being an enum of 7. |
| **A server-rendered HTML document, not a React app** | `src/app/render/[siteId]/[...path]/route.ts` returns a full document with inline `<style>` | The published blog sits outside the Tailwind/Next bundle entirely — it is in no `test:perf` route class. **We control every byte on the page**, so expressiveness costs almost nothing. |
| **Style isolation** | Declarative Shadow DOM around the blog body | Client CSS can't pierce in; ours can't leak out. This is why the compiler is allowed to be ambitious. |
| **Design-token extraction** | `scrape/tokens.ts` (509 lines) — palette, typography, radii, buttons, prose rhythm | Half the evidence gathering is done. It needs to graduate from *values* to *judgements* (§8). |
| **Card-design detection** | `blogDetect.ts` → `CardStyle` (columns, gap, radius, shadow, aspect, title size/weight) | The eye for feed anatomy already exists. |
| **Brand intelligence** | `brand/*` → `BrandBrain` (identity, voice with verbatim exemplars, visual, constraints) + `onboarding/synthesis.ts` → sector, audience, edge, gaps, **three real article pitches** | The art director's brief is 80% written already. |
| **The reveal surface** | `onboarding/glimpse.ts`, `/api/onboarding/glimpse`, `BrandCaptureView.tsx` (555 lines) | Door A's UI exists. It reveals understanding. It just doesn't yet reveal *a design*. |
| **A curated type catalogue** | `render/googleFonts.ts` — ~70 families with fallback stacks and categories | The art director's palette of typefaces, already whitelisted. Free strings never needed. |
| **Caching that actually invalidates** | `cacheComponents: true`, `use cache` + `cacheTag('site:<id>')` + `updateTag` | A compiled design caches perfectly and drops the instant the genome changes. |
| **Gates and an eval precedent** | `test:render` (247), `test:fidelity`, `test:perf`, `test:vitals`, `grabber:eval` + `/admin/grabber-eval` | §13's eval harness is the same shape as one we already run. |

The honest read: **the engine exists. What is missing is a design language for it to
speak, and something with taste to speak it.**

---

## 3 — THE DESIGN GENOME

The genome is the artefact this whole plan turns on: a versioned JSON document that
describes *a design* without containing *any code*. It is what the art director writes,
what the Studio edits, what the database stores, what the compiler consumes, and what a
diff shows when a customer says "put it back how it was".

### 3.1 The design rule

**Every field is an enum, a number with a declared range, or an id from a whitelist.**
There is no free string anywhere in the genome that reaches CSS. Brand text (site name,
section title, nav labels) is carried separately and HTML-escaped exactly as it is today.
This single rule is what makes §11 (safety) a paragraph instead of a project.

### 3.2 The schema

**Shipped:** `src/lib/design/genome.ts`. Condensed below; the file is the source of
truth and carries the reasoning for each axis.

```ts
export type Genome = {
  v: 1

  /**
   * THE SPINE — founder critique #1's answer, and the most important field here.
   * Every allow-list in cohesion.ts is keyed on it. See §4.
   */
  register: 'quiet' | 'classic' | 'contemporary' | 'bold' | 'warm' | 'severe'

  /** How this genome came to exist. Not decorative: the Studio shows it, the eval
   *  groups by it, a regeneration diffs against it, and undo walks it. */
  origin: {
    source: 'derived' | 'directed' | 'preset' | 'edited' | 'nudged'
    /** Deterministic variation seed — the anti-mean device. See §5. */
    seed: number
    parent?: string          // genome id this was transformed from
    variant?: 'faithful' | 'elevated' | 'reimagined'
    presetId?: string        // set when this re-expresses a shipped template
  }

  // ── COLOUR — a seed and a policy, never seven hex codes ────────────────────
  palette: {
    seed: { l: number; c: number; h: number }      // OKLCH. l 0..1, c 0..0.4, h 0..360
    scheme: 'monochrome' | 'analogous' | 'complementary' | 'split' | 'duotone' | 'triad'
    ground: 'paper' | 'ink' | 'tinted' | 'duotone' // light / dark / brand-tinted / two-tone
    saturation: 'muted' | 'natural' | 'vivid'      // drives the chroma curve
    counterHue?: number                            // duotone/split partner; derived when absent
    contrast: 'AA' | 'AAA'                         // the floor the compiler guarantees
  }

  // ── TYPE — the highest-leverage axis in editorial design ───────────────────
  type: {
    heading: FontId          // id from googleFonts.ts — never a family string
    body: FontId
    accentFace?: FontId      // meta/labels. Costs a face; the budget may drop it.
    scale: 1.125 | 1.2 | 1.25 | 1.333 | 1.414 | 1.5 | 1.618
    measure: number          // 58..78 ch — the strongest single readability lever
    leading: 'tight' | 'normal' | 'airy'
    headingCase: 'sentence' | 'title' | 'upper'
    headingTracking: 'tight' | 'normal' | 'loose'
    figures: 'lining' | 'oldstyle'
    opticalSizing: boolean
  }

  // ── SPACE — rhythm, and the lanes an article can occupy ────────────────────
  space: {
    ratio: 1.25 | 1.333 | 1.5 | 1.618              // the spacing scale
    density: 'compact' | 'comfortable' | 'generous' | 'vast'
    lanes: 'single' | 'content-wide' | 'content-wide-full'   // the bleed grid
    rule: 'none' | 'hairline' | 'heavy'            // separator weight
  }

  // ── FEED ───────────────────────────────────────────────────────────────────
  // W0 SPEAKS THE SHIPPED VOCABULARY ON PURPOSE. `feedLayouts.ts` already holds
  // seven structurally different, tested, production feeds over the same markup.
  // Inventing a parallel rhythm vocabulary in W0 would mean re-deriving CSS that
  // works and re-earning test:render's invariants for no user-visible gain.
  // Widening it (mosaic, ribbon, index) is a later wave, and it is additive.
  feed: {
    rhythm: FeedLayout        // standard | editorial | magazine | minimal | gridxl | overlay | compact
    mode: 'grid' | 'list'
    columns: '2' | '3' | '4'
    lead: 'none' | 'first'    // which slot is art-directed larger
    numbering: boolean        // counter-reset index numerals
  }

  // ── ORNAMENT — the texture layer that reads as "designed". All CSS, no images.
  ornament: {
    dropCap: 'none' | 'raised' | 'sunken'          // initial-letter
    quoteMark: 'none' | 'oversize' | 'rule'
    grain: 0 | 1 | 2                               // noise overlay strength
    divider: 'none' | 'rule' | 'mark' | 'gradient'
    corner: 'square' | 'soft' | 'pill' | 'cut'
    underline: 'none' | 'hover-grow' | 'always-thin' | 'offset'
  }

  // ── MOTION — a grammar, not free animation. Zero JS, all scroll-driven. ─────
  motion: {
    entrance: 'none' | 'fade' | 'rise' | 'mask' | 'stagger'
    hover: 'none' | 'lift' | 'zoom' | 'tint' | 'shift'
    transition: 'none' | 'crossfade' | 'shared-image'   // View Transitions
    intensity: 0 | 1 | 2
  }

  imagery: {
    treatment: 'none' | 'duotone' | 'grayscale' | 'warm' | 'grain'
    fit: 'cover' | 'contain'
    radius: 'inherit' | 'none' | 'full'
  }

  // ── CHROME — see §9.1. The first draft of this plan got this badly wrong. ────
  chrome: {
    policy: 'keep' | 'harmonise' | 'rebuild' | 'replace'
    header: 'masthead' | 'split' | 'stack' | 'rail' | 'minimal'
    footer: 'columns' | 'bar' | 'statement'
    sticky: boolean
  }

  /** Hard ceilings the compiler enforces by DROPPING LAYERS, not by wishing. */
  budget: { faces: number; cssKb: number; js: 0 }
}
```

### 3.3 Is this more than eight templates? Yes — but not for the reason draft 1 gave

Draft 1 multiplied the discrete axes out, arrived at **~10²⁰ representable genomes**, and
offered that as the answer. The founder's first critique makes it clear why that was the
wrong number to be proud of, and the correction is worth stating plainly:

> **A generator with 30 independent axes and no spine does not produce 10²⁰ designs.
> It produces 10²⁰ ways to be wrong, a handful of which happen to look deliberate.**

§4 deliberately collapses that space. Register allow-lists, pairwise rules and an energy
budget cut it by orders of magnitude, and every one of those cuts is a design that can no
longer be expressed. What is left is on the order of **10⁹ COHERENT genomes** — still six
orders of magnitude past a drawer of eight, and every point in it defensible.

That trade is the product:

> **Templates are a lookup table. A genome is a grammar. A grammar that can say anything
> says nothing worth reading.**

### 3.4 The acceptance test — and its result

> **Re-express all eight existing templates as genomes.** If `compileGenome()` reproduces
> Aperture, Editorial, Noir, Terra, Pulse, Beacon, Atelier and Carma exactly, the schema
> is expressive enough to ship.

**SHIPPED and passing** — `src/lib/design/presets.ts`, gated by `npm run test:genome` §1.
The bar turned out to be sharper than the visual-diff threshold draft 1 proposed, because
the compiler's two outputs make an exact test possible:

- `compiled.tokens` **deep-equals** the template's tokens, key set included;
- `compiled.fonts` **deep-equals** its font URLs, weight lists and all;
- `compiled.css` is **empty** — the extra layer adds nothing to a design already fully
  expressed in tokens;
- cohesion makes **zero structural repairs** to any of the eight, which is the check that
  the guardrails do not strangle good design.

So the renderer receives the same bytes it receives today. Zero visual regression, by
construction rather than by inspection — nothing to eyeball.

Four months of hand-drawn design has gone from *the thing being deleted* to *the
compiler's fixtures*. §15.1 reports what those fixtures taught us about it.

---

## 4 — COHESION: why the axes cannot make monsters

**Founder critique #1, and it was the right catch.** Orthogonal axes multiply cleanly and
compose badly. `vivid + oldstyle serif + mosaic feed + vast spacing` is arithmetically
valid and aesthetically incoherent, and a generator that can reach it will reach it.

**Shipped:** `src/lib/design/cohesion.ts`, gated by `test:genome` §3. Three layers, in the
order they run.

### 4.1 The register — the spine, and the actual fix

Bolting rules on afterwards does not solve this; it plays whack-a-mole with a space that
grows faster than the rules do. What solves it is a **spine**.

Every genome declares a `register` — the family of decisions it belongs to — and each
register publishes an **allow-list per axis**. A choice outside the list is not warned
about; it is repaired to the nearest in-register value before the compiler sees it.

| Register | The brief it is held to | Energy cap |
|---|---|---|
| `quiet` | Restraint as the statement. Nothing raises its voice; the white space does the work. | 2 |
| `classic` | Print heritage. A serif that has read a book, hairline rules, a centred masthead. | 5 |
| `contemporary` | Modern product publishing. Clean grotesks, tight grids, colour as a signal. | 4 |
| `bold` | Loud on purpose. Heavy type, a colour that commits, a feed with a clear lead. | 6 |
| `warm` | Humanist and unhurried. Paper with a temperature, a serif you would trust. | 4 |
| `severe` | Ink, edges, no decoration. Everything earns its place or leaves. | 5 |

This is what makes the founder's example **unrepresentable** rather than discouraged:
oldstyle figures live in `classic` and `warm`; `vivid` lives in `contemporary` and `bold`.
No register lists both, so no genome can hold both.

The six are not a taxonomy invented at a whiteboard. They are the families **our own eight
templates already fall into** — `quiet`=Aperture, `classic`=Editorial+Atelier,
`contemporary`=Carma+Pulse, `bold`=Beacon, `warm`=Terra, `severe`=Noir — which is the
check that they describe real design rather than a vocabulary.

### 4.2 Pairwise rules — each one wrong for a *reason*

Nine rules, and the bar for adding a tenth is that it must be specific rather than a
preference. A sample of what shipped:

| Rule | Why, precisely |
|---|---|
| `ornament-collision` | A drop cap and an oversize quote fight over the same column. Print settles this the same way: you get one. |
| `oldstyle-unsupported` | Oldstyle figures on a face that has none is a declaration the browser ignores — it reads as broken type, not as a choice. |
| `display-serif-needs-air` | A high-contrast display serif in a compact grid loses its hairlines at small sizes and reads as a rendering fault. |
| `mono-measure` | A monospaced body face past 62ch stops being readable. Mono is a texture, not a body face. |
| `upper-needs-tracking` | Uppercase set tight is the single most recognisable untrained-eye signature in typography. If a design commits to caps, it pays for the tracking. |
| `vast-four-up` | Vast spacing and a four-up grid are the same decision made twice, in opposite directions. |

### 4.3 The energy budget — the layer that does the real work

Every axis value carries a **loudness cost**, 0–2, and the register caps the total. This
encodes the oldest rule in art direction — *one hero, everything else supports* — as
arithmetic. Over budget, the compiler **sheds**, in a published and fixed order (grain →
imagery treatment → motion → ornament → saturation → scheme → scale → ground → rhythm →
typeface), and reports every cut. A budget that sheds unpredictably is worse than no
budget, because nobody can reason about what they will get.

Two things the gate taught us while building this, both worth keeping:

**Density is not loudness.** The first version priced `compact` at 1 and `vast` at 2. The
shedder then collapsed every over-budget design onto `comfortable`, and the
distinctiveness check in §5 caught it immediately — 47% of a 100-genome corpus on one
density value. The energy budget measures **decoration and contrast**, not layout: airy
and dense are different, not louder and quieter. Density is governed by the register's
allow-list, which is the right instrument for a structural choice.

**The typeface must be sheddable.** A budget that could never touch the heading face would
be a budget that never binds, because the typeface is usually the loudest single decision
in a design. It is the last resort in the shed order, and it is reported as the real
change it is.

### 4.4 The property that makes it trustworthy

Cohesion is a **fixed point**: run it twice and nothing more changes. `test:genome` proves
it across **720 sampled genomes** — six registers × 120 seeds — along with the harder
claim that every one of them lands inside its register's energy cap. A guardrail that
keeps repairing its own repairs never converges, and would be worse than none.

And the check that it does not strangle good design: **zero structural repairs on any of
the eight shipped templates.** The guardrails let every design we have ever shipped pass
untouched.

---

## 5 — DISTINCTIVENESS: not one infinite template

**Founder critique #2**, and it is the failure mode that kills products like this. A model
asked to design something returns the centre of its training distribution, every time,
with remarkable consistency. Ask a hundred times and you get one design a hundred times:
Inter, near-black on near-white, 1.25 scale, soft corners, fade-in. Tasteful. Also: eight
templates again, wearing a costume.

**Shipped:** `src/lib/design/sample.ts`, gated by `test:genome` §5. Four devices.

**1. No axis has a default — this is architectural, not a prompt trick.** A default is
*precisely* the mechanism by which a generator regresses: give `motion.entrance` a default
of `'fade'` and 80% of blogs get fade, because a model that is unsure omits the field. So
an omitted or invalid field is not defaulted here. It is **sampled** from the register's
allow-list, deterministically, from the genome's own seed. Uncertainty produces variety
instead of uniformity. `test:genome` §4 asserts it directly: the same input under two
seeds must produce two different genomes.

**2. The seed is per-site.** Two businesses with identical evidence still get different
designs, because the seed is a hash of the site id and the variant. Determinism without
uniformity — and "regenerate" stays reproducible.

**3. Anti-repetition sampling.** The sampler is handed the values recently used across the
corpus and down-weights them exponentially by recency. The first blog in a niche gets a
free choice; the tenth is pushed firmly elsewhere. Nothing is ever made impossible. This
is the only device that directly optimises the metric we care about, and it costs nothing.

**4. Mutual distance on the three variants.** `genomeDistance()` is a first-class
exported function used by the sampler, the gate and the reveal. The three designs a
customer is shown must be genuinely far apart — and the strongest guarantee is that they
occupy **three different registers**, not three points in one.

### 5.1 How it is measured, and the trap in measuring it

`distinctiveness()` — mean pairwise genome distance over a corpus — is **the** metric. It
reads **0.676 over 100 generated genomes**, against a floor of 0.45.

A high mean can still hide "every blog uses the same typeface", so mode share is checked
per axis. The first version used a flat 45% ceiling and failed on `palette.ground` at 47%
paper — and that was **the test being wrong, not the generator**. `paper` is allowed by all
six registers and `ink` by three, so uniform in-register sampling puts paper near 44%
before anything has collapsed. A flat cap would have been demanding that a third of all
blogs be dark, which is a worse product, not a more distinctive one.

So the check compares observed share against the **structural expectation** the
allow-lists imply. The question is not "is one value common" — some values should be. It
is "is one value *more* common than the allow-lists alone would make it", which is what a
collapse actually looks like.

| Axis | Most common | Observed | Structural expectation |
|---|---|---|---|
| `space.density` | comfortable | 47% | 39% |
| `palette.ground` | paper | 47% | 44% |
| `feed.rhythm` | standard | 27% | 20% |
| `ornament.corner` | soft | 55% | 43% |
| `type.heading` | fraunces | **9%** (22 distinct faces) | flat 25% cap |

Nine percent on the axis a reader notices first is the number to watch. If it ever climbs,
the art director is developing a house face and we have lost the plot.

---

## 6 — THE COMPILER

```ts
// src/lib/design/compile.ts — pure, no I/O, no model, no network
export function compileGenome(g: Genome, ctx: CompileCtx): Compiled

export type Compiled = {
  css: string                    // the whole blog stylesheet
  tokens: DesignTokens           // the PROJECTION — keeps Studio/embedParams/feedLayouts alive
  fonts: { href: string; family: string; preload: boolean; fallback: string }[]
  chrome: { header: string; footer: string } | null
  dropped: { layer: string; reason: string }[]   // what the budget cut, shown in the Studio
  bytes: { css: number; cssGzip: number; fontsEstimated: number }
  compilerVersion: string
}
```

Same genome in, same bytes out — which makes it golden-file testable, cacheable and
diffable. Seven sub-compilers, each small enough to reason about:

**`palette.ts`** — seed + scheme → an OKLCH ramp per role, then a contrast pass that walks
lightness down the ramp until the pair clears the declared floor (AA 4.5:1 body / 3:1
large and UI; AAA 7:1) and freezes it there. The output is the existing `--ct-*` custom
properties, so nothing downstream knows anything changed. **Note the consequence:
`contrastGuardScript()` and `buildChromeRepairCss()` stop being needed on generated
surfaces.** They stay for captured chrome, which we do not control.

**`type.ts`** — `scale` + `density` → a `clamp()` ramp (`--step--2` … `--step-6`), measure
in `ch`, leading and tracking per role, `font-optical-sizing` and `font-feature-settings`
from the genome. It also emits the piece that pays for itself immediately:

> `@font-face` **fallback metric overrides** (`size-adjust`, `ascent-override`,
> `descent-override`) for each chosen family, plus `<link rel="preload">` for the faces
> that render above the fold.

`2026-09-18-performance-every-page` established that **LCP is font-bound** and that there
are **zero font preloads on any route**. This compiler emits them by construction, for
every generated blog, from a metrics table we precompute once for the ~70 catalogue
families. A generated blog should therefore be *faster* than the template it replaces —
which is the sentence that makes this plan defensible to anyone who thinks generative
design means slower.

**`space.ts`** — the spacing scale, and the lane grid that is the actual secret of
art-directed articles:

```css
.carma-article-content {
  display: grid;
  grid-template-columns:
    [full-start] minmax(var(--gutter), 1fr)
    [wide-start] minmax(0, var(--wide))
    [content-start] min(var(--measure), 100% - var(--gutter) * 2) [content-end]
    minmax(0, var(--wide)) [wide-end]
    minmax(var(--gutter), 1fr) [full-end];
}
.carma-article-content > * { grid-column: content; }
.carma-article-content > figure[data-lane="wide"] { grid-column: wide; }
.carma-article-content > figure[data-lane="full"] { grid-column: full; }
```

One rule, and an article stops being a centred column. Pull-quotes, figures and galleries
can break out — which is the single most recognisable move in editorial web design and it
is eleven lines of CSS.

**`feed.ts`** — `rhythm` + `card` + `media` + `lead` → grid templates and `nth-child`
rules over the *existing* `.carma-card` markup. This subsumes `feedLayouts.ts`: the seven
current layouts become seven points in a much larger space, and they stay as presets.

**`ornament.ts`** — drop caps via `initial-letter` (with the `-webkit-` fallback and a
graceful Firefox degradation), oversize quote marks, hairlines, corner treatments,
`counter-reset` numerals, and grain as a CSS gradient mask rather than an image request.

**`motion.ts`** — every rule wrapped in `@media (prefers-reduced-motion: no-preference)`,
entrances on `animation-timeline: view()`, navigation on View Transitions with
`view-transition-name` on the card image. **Adds zero JavaScript bytes.** The project rule
from `landing-theme-motion-gotchas` applies: brand-critical animation needs class-level
`!important` against our own global reduced-motion kill rule, and a scroll timeline is
destroyed by an `animation: … !important` on the same element (`qa-a11y-pass-2026-09-18`).
Both are compiler invariants, tested.

**`chrome.ts`** — header/footer treatment, driven by `chrome.policy`. Draft 1 said a clone
*never* has its chrome regenerated; the founder was right that this is wrong, and §9.1 is
the corrected rule. Not built in W0: the policy field ships, the four behaviours land with
Door A.

### 6.1 A cleanup this unlocks (stated carefully)

`theme.ts` is 1,648 lines and nearly every declaration carries `!important`. That is a
scar from the pre-Shadow-DOM era, when our CSS had to out-shout the customer's injected
stylesheet. Inside the Declarative Shadow DOM there is no competing author CSS, so
`!important` buys nothing there and cascade layers (`@layer carma.reset, tokens,
structure, type, ornament, motion, overrides`) become both safe and useful.

The caveat, because it would be easy to overclaim: **un-layered author rules beat layered
ones**, so this only holds where the shadow boundary actually protects us. Light-DOM
surfaces that sit next to captured chrome keep their `!important`. The win is real but it
is scoped, and W5 should measure it rather than assume it.

---

## 7 — THE ART DIRECTOR, and the ladder it falls down

```
  EVIDENCE            BRIEF               GENOME              CSS
  deterministic   →   cheap model     →   strict schema   →   deterministic
  (the grabber)       (what we see)       (the decision)      (the compiler)
```

### 7.1 The four rungs

Each rung degrades to the one below it, and **rung 4 is good enough to ship alone**. This
is the same discipline `synthesis.ts` already applies ("total fail-open — no key, a
refusal, a timeout or a malformed payload all degrade to `null`").

1. **Directed** — **SHIPPED**, `src/lib/design/llm.ts`, gated by `npm run test:director-llm`.
   One structured-output call on `claude-opus-5` with adaptive thinking: evidence, the
   `sourceQuality` verdict, the synthesis brief and **what the maths already concluded**
   go in; three variants plus a per-variant rationale come out, against a closed schema
   with `additionalProperties: false` and every axis an enum. The model chooses ten axes;
   it does **not** choose the palette seed (that is the grabber's prominence ranking —
   evidence, not taste) or the chrome policy (floored by the verdict — a consent decision).
   Its output then goes through the same `validateGenome` → `completeGenome` →
   `applyCohesion` pipeline as the deterministic path, so the register spine and the energy
   budget bind the model exactly as they bind the maths.
2. **Validated** — `validateGenome()` rejects anything out of range, unknown enum, unknown
   `FontId`, or a pairing the catalogue forbids. A rejected genome is *logged with its
   violations* (that is training data for the prompt) and we fall to rung 3.
3. **Derived** — the **deterministic art director**. **SHIPPED**, `src/lib/design/director.ts`,
   gated by `npm run test:director`. Rules over evidence, no model at all: brand hue →
   OKLCH seed, the classified face → its nearest catalogue sibling, the measured heading
   ramp → the nearest scale step, structural spacing → density, their own card grid →
   a feed rhythm. It is genuinely good rather than a stub, because it is what runs when
   the API is down, when the key is missing, on the free tier, and in every test. §15.8
   has the numbers.
4. **Preset** — sector-keyed genome from a small table. The floor. Never ugly.

Then: **compile fails → last-known-good genome → `DEFAULT_TOKENS`.** The render path never
depends on a model at request time, because the render path never sees a genome — only
compiled CSS read from a row.

### 7.2 What the art director is actually told

The prompt is not "design a beautiful blog". It is a brief with a judgement in it, and the
judgement is the interesting part (§8.3): *inherit this brand's design, or inherit only
its brand and replace its design.*

Three genomes come back per request, not one, corresponding to the three variants the UX
offers:

- **Faithful** — their palette, their type category, their density. The blog their
  designer would have made. Default for Door A.
- **Elevated** — their brand, our art direction. Same hue, better scale; same type
  category, better pairing; their density, composed.
- **Reimagined** — their brand pushed. A different scheme, a bolder rhythm, ornament on.

Three is the right number: one is a slot machine, five is a paralysis.

---

## 8 — THE GRABBER, rebuilt as an eye

**SHIPPED 2026-09-21** — `src/lib/design/evidence.ts`, gated by `npm run test:evidence`
(54 assertions over the cached Barcelona-100). `grabber:eval` is unchanged at avg 98 with
zero regressions, which is the point: the Eye is an ADDITIVE layer over an extraction
pipeline that already works, not a rewrite of it.

`scrape/tokens.ts` extracts **values**. An art director needs **judgements**. `readEvidence()`
is the one entry point, and it returns a `DesignEvidence` carrying the palette with its
reasons, the typeface classification, the type scale, the density rhythm, the imagery read,
the feed signature, the `sourceQuality` verdict and the register prior.

### 8.1 Sharper evidence

| Today | What it should become |
|---|---|
| `mostFrequentBrandColor()` counts hex occurrences | **Weight by rendered prominence**, not frequency. A frequency count over-weights borders and shadow rgba; the brand colour is the one on the logo, the primary CTA and the header. Same parser, better weighting, and the fix is small. |
| `fontHeading: "'Fraunces', Georgia, serif"` | **A classification**: `{ family, category: 'display-serif', contrast: 'high', width: 'normal', hasOpticalSize: true }`. A category lets the director choose a *better-performing sibling* when the original isn't in the catalogue, instead of falling back to system-ui. |
| Nothing | **Density and rhythm, measured**: whitespace ratio, sections per screen, average measure in `ch`, image-to-text ratio, heading-size jumps. These are what actually decide "quiet" versus "dense", and they are arithmetic over nodes we already walk. |
| Nothing | **Imagery read**: aspect ratios in use, photography present or not, people/product/abstract (cheap heuristics from `alt` text and dimensions get most of it; a vision call is optional and off by default). |
| `CardStyle` from `blogDetect.ts` | Keep — it already captures feed anatomy and it maps almost one-to-one onto `genome.feed`. |

### 8.2 New file: `src/lib/design/evidence.ts`

One type, `DesignEvidence`, assembled from `tokens.ts` + `blogDetect.ts` + `chromeContrast.ts`
+ `brand/scrape.ts` + `synthesis.ts`. It is the only thing the art director sees. Keeping
it in one place means the eval can replay it.

### 8.3 The field that makes this plan honest: `sourceQuality`

A grabber that faithfully reproduces a bad 2011 website has *failed the founder's brief*.
So the evidence must carry a scored read of whether the source's design is worth
inheriting:

```ts
sourceQuality: {
  score: number                    // 0..100
  contrastFailures: number         // chromeContrast.ts ALREADY COMPUTES THIS
  typeScaleSanity: number          // are heading sizes a scale, or seven arbitrary px values?
  paletteCoherence: number         // hue spread in OKLCH; a 14-hue site has no palette
  ageSignals: string[]             // fixed-px widths, table layout, carousel, <font>, 90s gradients
  verdict: 'inherit' | 'inherit-brand-only' | 'start-fresh'
}
```

That `verdict` is the difference between a clone tool and a design tool, and it is what
makes *Elevated* and *Reimagined* honest rather than presumptuous. When the verdict is
`inherit-brand-only`, the director is told in as many words: **keep the colour, the name
and the voice; discard the layout, the type and the spacing.** And the customer is told
too — gently, and with the evidence (§9.1).

---

## 9 — THE UX

Two doors. Both end in the same place: three live designs, and a choice.

### 9.1 Door A — "I have a website"

The Door already exists (`BrandCaptureView.tsx`, `/api/onboarding/glimpse`,
`onboarding/glimpse.ts`). It reads their site, streams progress, and reveals what we
understood — real palette, real typefaces, their own sentences verbatim, and three article
pitches from `synthesis.ts`. It converts. It just stops one step short.

**The change: the reveal now includes their blog, built.**

```
┌─ WHAT WE UNDERSTOOD ─────────┐  ┌─ AND WHAT WE'D BUILD ────────────────┐
│ (existing reveal, unchanged) │  │  [ Fidel ] [ Elevat ] [ Reimaginat ] │
│ · 6 pages read               │  │                                      │
│ · their palette              │  │   a real, scrolling blog             │
│ · their typefaces            │  │   their colours, their type          │
│ · their own sentences        │  │   headlines = the three pitches      │
│ · the understanding          │  │   we just proposed                   │
└──────────────────────────────┘  └──────────────────────────────────────┘
                     [ Aquest. Comencem. ]
```

Four decisions inside that screen:

1. **It's the real renderer, not a mockup.** `/api/onboarding/preview` already exists and
   the render route already emits complete documents. The preview is the product.
2. **The feed's headlines are the three pitches from `synthesis.ts`.** The design demo and
   the content demo become the same screen, at zero extra cost, and it is the most
   persuasive thing we can put in front of a business owner: *those are my articles, on my
   blog, in my colours.*
3. **`no-invented-proof` is enforced here, hard.** No fabricated quotes, no invented
   statistics, no made-up business identity. Their sentences are theirs. Anything we can't
   source is a neutral placeholder. This rule is in memory as a founder directive and this
   screen is exactly where it would be most tempting to break it.
4. **The variant tabs carry the pitch.** Three amplitudes of the same brand says *we
   understood you* three times, and it turns a judgement ("your current design is dated")
   into a choice they make themselves. When `sourceQuality.verdict` is
   `inherit-brand-only`, *Elevated* is pre-selected and one honest line explains why —
   with evidence, e.g. "your current site has 7 text/background pairs below the legibility
   floor". A number, not an opinion.

#### The chrome ladder — correcting draft 1's worst mistake

**Founder critique #3, and it was the sharpest of the five.** Draft 1 stated that a clone's
header is never regenerated. Take that literally and the product ships the exact thing it
exists to prevent: a 2011 header with a pixelated logo and a 3px drop shadow, bolted
directly on top of a pristine editorial blog. The seam is grotesque, and it is worse than
either half alone — it makes the good work look like a mistake.

The resolution is to name what is actually sacred, because draft 1 had it wrong. **It is
not the markup. It is the navigation and the identity.** Where the links go and what they
are called is information about a business. `box-shadow: 3px 3px 0 #999` is not.

So `chrome.policy` is a ladder, keyed on `sourceQuality.verdict`:

| Policy | What happens | When |
|---|---|---|
| `keep` | Captured verbatim. | The source is good. Touching it would be vandalism. |
| `harmonise` | **Their markup and their nav, re-tokenised**: our palette, our type scale, our spacing, applied through the `scopeChromeCss` / `compileChromeCss` path we already own. The seam disappears; nothing moves; every link still works. | The default for a clone. Most sites land here. |
| `rebuild` | **Their content** — logo, nav labels, hrefs, CTA text — re-laid into a generated chrome archetype. Their navigation survives; their markup does not. | `sourceQuality.verdict === 'inherit-brand-only'`. |
| `replace` | Full generation. | From-scratch sites, or an explicit owner decision. |

The three reveal variants map onto the ladder exactly, which is why the UI needs no extra
control: **Fidel → `keep` · Elevat → `harmonise` · Reimaginat → `rebuild`.** An owner who
wants their header untouched picks Fidel, and there is a permanent "keep my header exactly
as it is" escape hatch in the Studio.

`harmonise` is the one that earns its place. It is the cheapest rung — a CSS-level
transform on chrome we already restyle — and it removes the grotesque seam **without
moving a single link**, which is the outcome almost every clone actually wants.

Signup carries only the chosen genome id and the evidence blob, in `sessionStorage` —
**strings across the boundary**, exactly the decision `glimpse.ts` already documents. No
table, no TTL, no claim-on-signup RPC.

### 9.2 Door B — "I'm starting from scratch"

This is the harder problem and the founder asked for the best UX, so here is the thesis:

> **Preference elicitation beats specification.** People cannot describe the design they
> want; they can recognise it instantly. So: ask once, openly, then stop asking and start
> showing.

**Screen 1 — one open surface.** *"Explica'm de què va."* One canvas that accepts anything:

- **hold-to-talk** (`VoiceRecorder.tsx`, 305 lines, Whisper — already shipped)
- **typing** (a sentence is enough to continue)
- **file drop** (`BrandIntake.tsx` + `brand/documents.ts` — PDF/DOCX/TXT/MD already parsed)
- **pasted links to anything they like the look of** — a competitor, an Instagram, a
  magazine, a Behance board. We read them as *reference*, not as brand.

No form fields. No required anything. A live *"what I've understood"* panel fills in as
they add material, so the cost of saying more is visibly rewarded — which is what actually
makes people say more.

**Screen 2 — three designs, live.** Identical to Door A's reveal. Choose one.

> **The taste test is deleted. Founder critique #4, and the argument is correct.**
>
> Draft 1 put five A/B specimen pairs here. That is a form in disguise — five screens of
> friction before anyone has seen anything they want — and worse, it is a form that
> *poisons its own output*. A person without a strong visual opinion, shown five abstract
> pairs with no consequences attached, clicks to get through. We would then feed those
> clicks back as priors and call them taste.
>
> **A choice with consequences is a reliable preference. A choice without consequences is
> noise.** So the taste test becomes the thing we were already showing: three real designs
> the customer will actually receive. One choice, high stakes, honest signal — and it
> carries far more information than five low-contrast abstractions, because whole designs
> differ on every axis at once.
>
> The cost of deleting it is that we learn slightly less per session. The benefit is a
> screen removed, and the signal we do get is real. `test:genome` §5 enforces the
> condition that makes one choice enough: the three must be **exaggeratedly distinct** —
> three different registers, minimum pairwise `genomeDistance` ≥ 0.4, measured at 0.634.

**Screen 3 — the directions.** Not a control panel. Six words:

> **Més càlid · Més tranquil · Més atrevit · Més clàssic · Més aire · Més dens**

Each is a **deterministic transform on the genome** — `nudge(genome, direction)` — not
another model call. Instant, free, reversible, stackable, and every press is logged as a
taste signal. Plus **"Un altre"**: regenerate with a different seed while keeping whatever
they have already pinned.

This is the answer to "ad hoc design" done properly: the expensive, slow, non-deterministic
step happens **once**; everything after it is arithmetic.

Content honesty on this path: a from-scratch site has no brand evidence, so the demo feed
uses the pitches generated from what they *told* us (theirs, not invented) — or, if they
told us almost nothing, the nameless, sectorless placeholder content that
`no-invented-proof` already mandates.

### 9.3 The Studio becomes a genome editor

`dashboard/studio` is a direct-manipulation token editor today. Three changes:

1. **Every gesture writes a genome field**, and the design recompiles. Same feel, better
   substrate.
2. **Partial regeneration** — "regenerate just the palette", "just the feed rhythm". This
   is what makes it feel like working with a designer rather than pulling a slot-machine
   lever, and it is trivial once the axes are orthogonal.
3. **History and undo** — genomes are rows, not overwrites. Every generated design is
   recoverable. Generative design products routinely lack this and users routinely ask for
   it the first time they lose something they liked.

The `dropped[]` array from the compiler surfaces here too: *"the third typeface was cut to
stay inside the speed budget"* — the product explaining its own trade-offs, which is a
better answer than silently ignoring a choice the user made.

---

## 10 — Storage, rendering, caching, migration

### 10.1 Migration `039_design_genome.sql`

```sql
CREATE TABLE IF NOT EXISTS public.site_design_genomes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  genome           JSONB NOT NULL,
  genome_version   INT  NOT NULL DEFAULT 1,
  source           TEXT NOT NULL,              -- derived | directed | preset | edited | nudged
  variant          TEXT,                       -- faithful | elevated | reimagined
  brief            JSONB,                      -- the evidence + brief it was made from
  parent_id        UUID REFERENCES public.site_design_genomes(id) ON DELETE SET NULL,
  is_active        BOOLEAN NOT NULL DEFAULT false,
  -- Derived, cached, never the source of truth:
  compiled_css     TEXT,
  compiled_at      TIMESTAMPTZ,
  compiler_version TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS site_design_genomes_one_active
  ON public.site_design_genomes (site_id) WHERE is_active;
```

**History is rows.** Undo is flipping `is_active`. A regeneration is an insert with
`parent_id` set, so the lineage of a design is readable.

`compiled_css` is a **cache, not truth**: it is recomputed whenever `genome` changes or
`compiler_version` moves. Truth is the genome, because truth has to be the thing you can
edit, diff and explain.

### 10.2 Nothing breaks on day one

The compiler emits `tokens: DesignTokens` as a by-product, and `saveTheme()` writes it to
`site_themes.design_tokens` exactly as today. So:

- `embedParams.ts` per-embed overrides: keep working.
- `feedLayouts.ts`: keeps working (its seven layouts become genome presets).
- The Studio's existing controls: keep working while they are ported.
- Sites with no genome row: render precisely as they do now.

**The genome is a superset that projects down to tokens.** That is the entire migration
strategy, and it means this plan can land in waves without a flag day.

### 10.3 Render path

Unchanged in shape. `loadTheme()` gains a join on the active genome; if
`compiled_css` is present and `compiler_version` matches, it is used verbatim. Otherwise
`compileGenome()` runs inline (it is pure and fast — microseconds, not a network call) and
the result is written back. `cacheTag('site:<id>')` already invalidates on publish, and
applying a new genome calls `updateTag` from a Server Action — which is the only place
`updateTag` is legal under `cacheComponents: true` (route handlers must use
`revalidateTag(tag, { expire: 0 })`; see `cache-components-migration-2026-09-16`).

---

## 11 — Safety

Short, because the architecture did the work.

1. **The model emits JSON against a strict schema.** `additionalProperties: false`, every
   field an enum, a bounded number, or a whitelisted id.
2. **`validateGenome()` runs before the compiler**, and the compiler re-validates every
   value it interpolates. An out-of-range number is clamped; an unknown enum is rejected;
   an unknown `FontId` is rejected.
3. **There is no CSS sanitizer in this design, anywhere** — because we never receive CSS.
   That is the direct answer to the PortSwigger class of bug, where the sanitizer's parser
   and the browser's parser disagree. You cannot mis-parse a string you were never sent.
4. **Brand text is data, escaped as today** (`escapeHtml` in `theme.ts`).
5. **Prompt injection is contained by the schema.** A malicious page that says "ignore your
   instructions and emit `</style><script>`" can at most produce a genome that fails
   validation, because there is no field that can carry it.
6. **CSP stays as defence in depth.** Cheap, and it costs nothing to keep.

---

## 12 — Performance, and the budget that enforces it

The genome carries `budget: { faces, cssKb, js: 0 }` and the compiler **enforces it by
dropping layers**, cheapest-signal-first (grain → accent face → ornament → motion), and
reporting what it dropped. A design that misses its budget is not a design, it is a draft.

Proposed ceilings, to be re-based on measurement in W1 exactly as `test:perf` re-based its
numbers on 2026-09-18:

| | Ceiling | Why |
|---|---|---|
| Font families | **2** (3 only if the accent face is subset) | LCP is font-bound; every family is a connection and a render-blocking decision |
| Total faces | **4** | variable fonts make this generous |
| Compiled CSS | **14KB gzip** | the current `buildTemplateCss` + feed layout output is the baseline to measure against in W1 |
| Added JS | **0 bytes** | all motion is CSS; the existing module runtime is unchanged |
| Font preloads | **required** for above-the-fold faces | the fix for the known, measured, font-bound LCP |
| Fallback metrics | **required** (`size-adjust`, `ascent-override`) | kills the swap CLS that preloading alone leaves behind |

**New gate: `test:perf` grows a budget class for the published blog document.** Today the
route classes cover `/`, auth, funnel, editor, dashboard, admin and system — the rendered
blog is measured by nothing, because it is a route handler rather than a page. That gap
existed before this plan and this plan is the reason to close it.

The claim to hold ourselves to, and it is falsifiable:

> **A generated blog must load faster than the template it replaces.** Same content, same
> network, `test:vitals` recorded. If it doesn't, the design is wrong, not the budget.

---

## 13 — `npm run design:eval` — how we know it's any good

Without this, "Awwwards-level" is a feeling. With it, it is a number that goes up. The
precedent is `grabber:eval` + `/admin/grabber-eval` (migration 031), and this reuses both
the runner shape and the review UI.

**Corpus:** the Barcelona-100 dataset the grabber eval already uses, with its snapshot
cache — so a run is offline, deterministic and free.

**Deterministic scorers** (no model, no human):

| Scorer | Fails when |
|---|---|
| Contrast | any text/background pair below the genome's declared floor |
| Budget | faces, CSS gzip or JS over ceiling |
| Scale sanity | heading sizes are not a monotone ramp of the declared ratio |
| Measure | body measure outside 58–78ch at any breakpoint |
| Palette coherence | hue spread beyond the scheme's definition |
| Ornament collision | mutually exclusive ornaments co-occur (drop cap *and* oversize quote on the same block) |
| Motion budget | any animation outside `prefers-reduced-motion` guard, or a scroll timeline killed by an `!important` animation on the same element |
| Render invariants | `test:render`'s 247 invariants, against every generated design |

**And the metric that actually measures "bespoke":**

> **Distinctiveness** — pairwise genome distance across the corpus. If 100 different
> businesses produce 100 similar genomes, the art director has collapsed to a mode and the
> product is eight templates again, wearing a costume. This is the number the founder
> should ask about first, every time.

**Human review** at `/admin/design-eval`: the generated blog, its genome, its scores, and
three buttons — **ship it / not yet / never**. Rewards feed the priors, exactly as
`grabber-eval` already does. Ten minutes of founder taste per week is worth more than any
prompt engineering.

---

## 14 — The roadmap

Each wave is shippable, each has a gate, and the product is never broken in between.

| Wave | What | Gate | Ships to users? |
|---|---|---|---|
| **W0** ✅ | `Genome` schema, `validateGenome()`, `compileGenome()`, the cohesion engine, the anti-mean sampler, **all 8 templates re-expressed as genomes**. | **`test:genome` 101/101** · `test:render` 291/291 · `test:fidelity` 100% | No — internal |
| **W1** ✅ | The published blog measured for the first time; budgets set from the measurement; `test:perf` §6 added, covering the eight looks **and 60 generated designs**. | **`test:perf` 0 failures** | No |
| **W2** ✅ | `evidence.ts` — the grabber becomes an eye. Prominence-weighted colour, a typeface classifier, type-scale sanity, palette coherence, age signals, density rhythm, `sourceQuality` + verdict + chrome rung, and the register prior with its variant ladder. | **`test:evidence` 54/54** · `grabber:eval` unchanged at avg 98, 0 regressions | No |
| **W3** ✅ | **Rung 3: the deterministic art director.** Evidence → three genomes, no model. The three variants are one derivation at three amplitudes. | **`test:director` 68/68** · 297/297 valid · distinctiveness **0.623** · p99 **0.91ms** | Not yet wired — the engine is done, the surface is W5 |
| **W4** ✅ | **Rung 1: the LLM art director.** One call, three variants, a closed JSON schema, adaptive thinking. Constrained by the same cohesion engine as the maths; every failure degrades to W3. | **`test:director-llm` mock 233/233** · live A/B recorded in §15.10 | Not yet wired — the surface is W5 |
| **W5** ✅ | **Door A**: W3 paints three live designs at once, W4 upgrades them in the background and crossfades in place; pitches are the feed; the choice crosses signup in sessionStorage. **Cascade layers** in the blog stylesheet, proven equivalent in Chrome. | **`test:reveal` 56/56** · **`test:cascade` 17/17** (30,408 computed-style comparisons) · `test:landing`/`test:perf` hold | Yes — conversion not yet measured |
| **W6** | **Door B**: the open intake, three designs, the six directions, `nudge()`. (No taste test — see §9.2.) | `design:eval` on from-scratch briefs | Yes |
| **W7** | **Studio on genomes**: partial regeneration, history, undo, `dropped[]` surfaced. | `test:perf` product class holds | Yes |
| **W8** | The taste loop: log choices and nudges, feed back as priors. Showcase gallery (`038_showcase_optin` already exists) of real generated blogs — which doubles as the Awwwards submission pipeline. | distinctiveness and human-review scores trending up | Yes |

**W0–W1 were the whole bet, and the bet came in.** The compiler reproduces the eight
templates exactly and the blog now has a budget. Everything after this is execution
against a green gate rather than an argument about whether the architecture works.

---

## 15 — What the waves actually measured

Six findings, three of them uncomfortable. All are reproducible: `npm run test:genome` and
`npm run test:perf`.

### 15.1 Our back catalogue is about half systematic

The derivation ledger is the finding nobody asked for and everybody should read. A preset
genome only pins what the system cannot derive, so the pins are a direct measurement of
how much of four months of design work was a *system* and how much was a hand.

| Value | Derived correctly, across the eight |
|---|---|
| Base font size | **8/8** — the density axis is real |
| Section-title weight (from heading weight) | **6/8** |
| Section-title size (from the type scale) | 2/8 |
| Max width | 3/8 |
| Corner radius | 2/8 |
| Heading weight | 3/8 |
| **Overall** | **23/48 (48%)** |

Base font size derived perfectly for all eight looks, which means `density` is a real
design decision our designers were making consistently without naming it. Corner radius
derived twice — it is a signature value, chosen by eye, and the genome is right to let a
human pin it.

Forty-eight percent is the honest headline: **half of our design system was a system.**
The other half is exactly what the pins are for.

### 15.2 Three shipped templates failed AA on their link colour — FIXED

Found by the genome gate's contrast pass; fixed deliberately in commit `fb509c6`:

| Template | Link contrast against its own ground | Needs |
|---|---|---|
| **Carma** | 3.47:1 | 4.5:1 |
| **Terra** | 4.12:1 | 4.5:1 |
| **Atelier** | 4.49:1 | 4.5:1 |

Atelier misses by 0.01. Carma — our own house look — misses by a third. Meanwhile
**360 generated palettes cleared their declared floor, every one**, because the engine
walks lightness down an OKLCH ramp until the pair passes rather than checking afterwards.
That contrast is the argument for this whole architecture in one table: the hand path
produces three defects nobody noticed for months; the generated path cannot produce one.

**Fixed 2026-09-21**, in their own commit, `linkColor` only. The gate now reports
*"every shipped template already clears its declared floor"*.

### 15.3 The blog now has a number, and it is a good one

First measurement of the published blog in this product's history:

| | Measured (worst of eight) | Target | Hard |
|---|---|---|---|
| Listing document | **9.06KB gzip** | 10 | 12 |
| Article document | **8.67KB gzip** | 10 | 12 |
| Blog stylesheet | **29.1KB raw / 5.99KB gzip** | 32 / 7 | 36 / 8 |
| Inline JS, listing | **2.06KB raw** | 2.5 | 3.5 |
| Inline JS, article | **3.63KB raw** | 4.5 | 5.5 |

A whole blog page in **nine kilobytes over the wire**. That is not a number this product
needed to be ashamed of, and nobody knew it — which is exactly the case for measuring.

### 15.4 Our own templates are the font-heavy ones

Two warnings, and they are findings rather than regressions:

- **up to 8 faces** (Aperture and Beacon) and **3 stylesheet requests** per blog.
- `2026-09-18` established that this product's LCP is **font-bound**.

So the hand-drawn looks are the heavy ones, and a generated design is held to **4 faces**.
The compiler enforces it by trimming weights in a published order — accent face, then body
weights past regular/semibold, then the heading down to the weights it actually sets.
**47 of 60 generated designs needed the compiler to shed something**, which is the budget
doing its job rather than decorating a config file.

### 15.5 Generated designs add zero JavaScript — gated, not hoped

`test:perf` §6 compiles the loudest genome the `bold` register allows — stagger entrances,
hover transforms, view transitions, grain, duotone imagery — and diffs its inline JS
against a static preset. **Delta: 0 bytes.** Every motion axis compiles to scroll-driven
CSS behind `prefers-reduced-motion`. If that ever changes, the gate fails.

Worst-case extra stylesheet across 360 generated genomes: **1.62KB of a 14KB ceiling.**
The expressive layer is nearly free.

### 15.6 Two bugs the gates caught before anyone saw them

Worth recording because both were invisible to inspection and obvious to measurement.

**The density collapse.** The energy model originally priced `compact` at 1 and `vast` at
2. The shedder then dumped every over-budget design onto `comfortable` — 47% of a
100-genome corpus on one value. Loudness and density are different things; pricing them
together made the guardrail fight the distinctiveness metric. Fixed by zeroing density
energy and letting the register's allow-list govern it (§4.3).

**The mode-share test was wrong.** It used a flat 45% ceiling and failed on `paper` at
47%, which is barely above the 44% that uniform in-register sampling produces on its own.
The test was demanding that a third of all blogs be dark. Replaced with a comparison
against the structural expectation (§5.1) — a better instrument, and it would have caught
the density bug on its own.

### 15.7 W2 — what the Eye found

**Prominence changed the brand colour on 40 of 99 sites.** The old extractor counted hex
occurrences, which is a precise measurement of the wrong quantity: the colours that appear
most in a stylesheet are borders, hover states and shadow `rgba()`. Weighing by what a
declaration probably paints — property, selector, and how many DOM elements the selector
actually hits — disagreed on 40% of the corpus, and the reasons read correctly:

| Site | Frequency said | Prominence says | Because |
|---|---|---|---|
| dental-bcndental | `#5472d2` | `#a2c600` | declared as `--wp--preset--color--accent` |
| resto-7portes | `#1f2937` | `#005eff` | a surface colour in the hero |
| dental-cero | `#337ab7` | `#bdc73b` | a surface colour on the primary action |

**An icon font was being used as a heading typeface.** One corpus site loaded Material
Icons before its text face, so the first `family=` in the link list won and the blog would
have inherited a heading made of pictograms — silent, because the name looks like a font
and the URL looks like a font. `familiesFromFontLinks` now filters seventeen known icon
families.

**Half the corpus ships links below AA.** 48 of 96 measurable sites, and 18 of 86 put
their body text there too. We had just found the same defect in three of our own templates,
which is the only reason the standard is one we can apply without hypocrisy.

**The verdict distribution, on 99 real Barcelona businesses:**

| Verdict | Sites | Chrome rung |
|---|---|---|
| `inherit` | 62 (63%) | keep |
| `inherit-brand-only` | 34 (34%) | harmonise |
| `start-fresh` | 3 (3%) | rebuild |

Scores spread from 28 to 100 (p25 64, median 76, p75 86). The range is unit-tested rather
than asserted against the corpus: a synthetic well-built page scores **100 → inherit**, a
synthetic 1998 table-layout page scores **8 → start-fresh**, and 92 points separate them.

**Three precision bugs I introduced and the corpus caught.** Worth recording because each
is the same mistake in a different costume — *treating an absence of evidence as evidence
of a defect*:

1. `ratio()` returns 1 when a colour will not parse, which is right for the compiler
   (assume the worst, repair it) and catastrophic for judging someone else's site.
   `rgba( 0, 0, 0, 0.7 )` is legible body text that `parseColor` deliberately refuses,
   because an alpha below 0.8 is not a valid *ground* — the question it was built for.
   18 of 99 sites were being accused of shipping invisible text. Fixed with
   `ratioOrNull()`, plus a mis-pairing floor at 1.25:1 calibrated so the artefacts
   (1.00–1.17) are dropped and the genuinely awful (1.3–1.5) are kept.
2. Density was measured as "what share of ALL padding declarations exceed 40px", which a
   modern utility stylesheet drowns in `.px-2`. It reported `compact` for essentially the
   whole corpus. Now it reads the 75th-percentile vertical spacing on **structural**
   selectors only — including page-builder classes, because the corpus is WordPress and
   WordPress does not style a bare `<section>`.
3. Palette coherence scored "no chromatic colour found" as a perfect 100, handing full
   marks to sites whose stylesheet we could barely read. A neutral palette and an
   unreadable one are now different answers (88 and 55).

**The register prior is concentrated, and that is honest.** 71% of sites read as
`contemporary`, because 84 of 99 set their headings in a sans at ordinary density. A prior
that spread itself evenly would be lying about what it saw. What stops that concentration
reaching the customer is the **variant ladder** (`registerVariants`), which spreads every
prior across three distinct registers for the three reveal tabs: the corpus reaches all six
registers once variants are applied, and the most common register across everything
actually offered drops from 71% to **32%**.

### 15.8 W3 — the deterministic director, and what it cost to make it good

**The bar was never "adequate until the model arrives".** This is the rung everything
above it degrades to, so it runs when the key is missing, when the provider is down,
on the free tier, and in every test. A fallback nobody would ship on its own is not a
fallback, it is a crash with better manners.

| | Result |
|---|---|
| Genomes derived | **297** (99 sites × 3 variants) |
| Valid, in-register, inside the energy cap | **297/297**, with **zero** cohesion repairs |
| Distinctiveness across everything offered | **0.623** (floor 0.60) |
| Distinctiveness across Fidel alone | 0.468 |
| Derivation speed, all three variants | median **0.40ms** · p95 0.53ms · **p99 0.91ms** |
| Hostile inputs (including `null`) | 8/8 produced three valid genomes, nothing thrown |
| Budget | worst 1.79KB of 14KB extra CSS · 4 of 4 faces |
| Derivation steps recorded | 5,021 — every one naming its evidence and its rule |

**The three variants are one derivation at three amplitudes.** That is what makes them
guaranteed distinct rather than hoped to be — they are forced apart on register,
heading face, article lanes, chrome rung and motion, by construction:

| | Colour | Type | Composition | Chrome |
|---|---|---|---|---|
| **Fidel** | their whole palette pinned | their face, or its nearest sibling | their density, their feed, one column | `keep` |
| **Elevat** | their brand hue; every neutral regenerated | same category, a different face | our composition, a wide lane | `harmonise` |
| **Reimaginat** | nothing pinned — the hue is only a seed | a different register's face | sampled, full-bleed lane | `rebuild` |

**The verdict floors the rung.** Fidel would like to keep the customer's header; when
`sourceQuality` says otherwise it cannot. Across the corpus that fired on **37 of 99
sites** — Fidel got `keep` 62 times, was floored to `harmonise` 34 times and to
`rebuild` 3 times. No `start-fresh` site is offered its own header verbatim, which is
the founder's grotesque-seam critique enforced as an invariant rather than a promise.

**Five bugs the corpus caught, and one a trace caught.**

1. **14 genomes failed validation on unreadable pins.** Fidel pinned the extracted
   palette verbatim, including values `parseColor` declines. We cannot claim to
   reproduce a colour we never resolved, so those roles are derived instead.
2. **Inter was the heading face of 29% of all designs.** `nearestFace` took `[0]` from
   the matching set — deterministic, defensible, and the house face this entire plan
   exists to avoid. It draws from the set now, seeded by the site.
3. **41% of feeds came back `minimal`.** `sample.ts` ships anti-repetition and nobody
   was feeding it. A mechanism with no input does nothing. The window is now threaded
   through, and — separately — the director's own face picks were bypassing it
   entirely, on the one axis a reader notices first.
4. **Elevat was inheriting composition.** Density and feed rhythm are art direction,
   not brand, so only Fidel copies them. Before the fix the two tabs were 0.338 apart
   at the closest.
5. **The determinism check was wrong, not the director.** It re-ran each site against
   the recency window as it stood after all 99. The window is an INPUT; determinism
   means same evidence + same seed + same window.
6. **`accent: #ffffff`, found by reading a trace.** `extractTokens` had resolved a
   white CSS variable while `rankBrandColors` correctly identified the olive that
   paints the client's logo and booking button. The seed used the good answer and the
   pin used the bad one, so W2's entire colour improvement stopped at the edge of the
   genome. **A gate can only catch what it was told to look for; this one needed a
   human reading one page of output.**

**Two ceilings worth naming.** `serif/high` is a one-face cell in the catalogue, so a
site classified there gets a forced choice no amount of recency can vary — the
catalogue needs depth per (category, contrast) cell before the director can. And
`palette.ground` sits at 87% `paper`, because two of the three variants derive it from
the customer's own background; that is honest, and it is also the axis with the least
room left in it.

### 15.9 The two bottlenecks — and the shipped bug the second one uncovered

The founder read §15.8 and named two structural limits. Both were real; fixing the
second one turned up something worse underneath it.

**The `serif/high` monoculture.** One face in that cell meant every classic brand
classified there got a forced choice. Two things shipped, because the font list alone
would not have made it durable:

- Four faces added — **Eczar** and **Lusitana** (serif/high, the thin cell),
  **EB Garamond** and **Literata** (serif/medium), plus **Bodoni Moda** to
  display-serif. Playfair Display and Cormorant Garamond were already in the
  catalogue; the singleton was never Fraunces.
- `nearestFace` now **widens from category+contrast to category** whenever the exact
  cell holds fewer than two faces. A cell with one face in it is not a choice, it is
  a lookup, and no amount of anti-repetition can vary a lookup.

Worth naming: `serif/high` is *genuinely* thin on the open web, because high stroke
contrast is a **display** property — at text sizes the thin strokes disappear. That is
the same fact the `display-serif-needs-air` cohesion rule already encodes. The cell
was deepened deliberately, not padded.

**The 87% paper bias.** Fidel and Elevat both derive the ground from the customer's
own background, and customers' backgrounds are light. Two thirds of that is correct.
The third that is not is Reimaginat, whose entire job is to show something they would
not have asked for — so at amplitude 2 the ground now **inverts**: light sources
explore ink, dark sources explore paper, always inside the register's allow-list. The
`warm → quiet` rung of the variant ladder became `warm → severe`, because `quiet`
carries no ink and was the one rung that could not invert.

| | Before | After |
|---|---|---|
| `palette.ground` = paper | 87% | **61%** |
| Offered-design distinctiveness | 0.623 | **0.635** |
| Closest variant pair (min) | 0.338 | **0.400** |
| Distinct heading faces across the corpus | 22 | **24** |

**And then the bug.** A dark genome is worthless if the renderer flattens it, so that
got measured before anything was claimed:

> **36 of 36 dark generated designs were rendered as `#ffffff`.** At a measured
> **16.8:1** text-on-background contrast.

`ensureReadableTokens` in `theme.ts` fired on **darkness** (`luma < 0.6`) as a proxy
for illegibility. The proxy is wrong in one direction, and the cost had been invisible
because nothing had ever tried to ship a dark design on purpose — including, it turns
out, **Noir**, our own dark template, which has been rendering **light** on every
customer blog using it since it shipped.

The guard now asks the question it always meant to ask — *can this be read* — instead
of the one it was actually asking, *is this light*. Strictly a narrowing: every palette
it used to leave alone it still leaves alone, and it now also leaves alone pairs that
provably clear AA. An illegible palette, dark or light, is still replaced. All 291
render invariants hold, and Noir renders dark for the first time.

### 15.10 W4 — what the model is actually for

`src/lib/design/llm.ts`, gated by `npm run test:director-llm` (233 assertions on a mock
and seven broken payloads, free, every commit; `--live` for the paid comparison).

**One call, three variants, `claude-opus-5`, adaptive thinking, a closed JSON schema.**
The model's output goes through *exactly* the pipeline the maths does — `validateGenome`,
then sampling for anything left unstated, then cohesion. It is an art director working
inside the house style, not a second engine. It does **not** choose the palette seed
(that is the grabber's prominence ranking — evidence, not taste) or the chrome policy
(floored by `sourceQuality`; a consent decision, not a design one).

**The measured comparison, on the same 6 sites / 18 genomes:**

| | W3 (maths) | W4 (model) |
|---|---|---|
| Distinctiveness | 0.727 | **0.779** |
| Distinct registers used | 3 | **5** |
| Distinct heading faces | 11 | **13** |
| Distinct grounds | 2 | **3** |
| Latency, three variants | **0.4ms** | 41s median |
| Cost per business | **free** | ~$0.10 |

Both numbers are over the **same sites**. The first draft of the gate measured W3 over
every site attempted and W4 over only the ones whose call succeeded — different sample
sizes on a metric that is sensitive to sample size, which is a way of getting a number
rather than an answer.

**The fail-open got tested for real, by accident.** Four of ten live calls returned
`400 … credit balance is too low` mid-run. Every one of those four sites still received
three valid, distinct, budget-compliant designs, because that is what the fallback is
for. An unplanned production test of the safety net, passed.

**Where the model earned its cost.** 128 disagreements with the arithmetic across 18
variants — heading face (15), type scale (12), heading case (10), motion (11), register
(9). The one worth reading is **Verne Barcelona**, a restaurant:

```
              W3 (measured)                    W4 (read the name)
FAITHFUL      contemporary · Outfit            contemporary · DM Sans
ELEVATED      quiet · DM Sans · paper          warm · Fraunces · TINTED · editorial
REIMAGINED    bold · Jost · ink                severe · Space Grotesk · ink
```

> *"The name invokes Jules Verne — expeditions, illustrated journals, chapters — so the
> blog is dressed as a warm reading object with a literary serif and a drop cap, which
> is what a studio named after a novelist should read like."*
>
> *"Invert the light template into Nautilus dark and let that default cyan finally do
> something — an instrument-panel blog of numbered entries."*

Nothing in `DesignEvidence` contains the string "Jules Verne". The measurements said
*geometric sans, one blue, comfortable density* — and from those, correctly, W3 derived
a competent modern blog. The model read the **name of the business** and dressed its
journal as an illustrated expedition log. That is the asymmetry this wave exists for,
and it is not reachable by arithmetic at any budget.

Two more from the same run, both the same shape:

- **A dental clinic** → *"Dentistry is the one appointment people postpone out of fear,
  so the clinic's voice is worth more than its equipment list"* → warm register, humanist
  serif, tinted paper. The maths had said `quiet` plus Archivo on white.
- **Hipòlita** (a Catalan beauty house) → *"Hipòlita is an Amazon queen, and a room full
  of photographs deserves to be hung on a dark wall"* → Instrument Serif on ink.

**Three things the build taught us.**

1. Inlining the variant schema three times returns `400 … compiled grammar is too large`.
   `$defs` + `$ref` compiles — probed against the live API before committing to it.
2. `DESIGN_LLM_MOCK` read at import time meant the "mock" gate made **twelve real API
   calls**. Config a test needs to toggle cannot be frozen at import.
3. `validateGenome` was silently dropping unrecognised enum values and reporting nothing,
   so a model naming a font we do not host produced a valid genome and an **empty
   violations array** — and the fail-open never fired. Present-and-wrong is now named.

**What this means for W5.** 41 seconds is not a page load. The reveal must show the
deterministic design **immediately** and upgrade to the model's when it lands — which the
architecture already supports, because both produce the same artefact through the same
code path. The model is an enhancement to a complete product, not a dependency of one.


### 15.11 W5 — the progressive reveal, and the stylesheet under it

**The reveal paints before the model thinks.** The glimpse reads the site's design
evidence the moment the home page arrives (in parallel with the prose scrape and the
synthesis), the deterministic director turns it into three variants in **p50 1.3ms /
p99 5.6ms** over the corpus (director + three compiles + three preview URLs), and they
ship inside the glimpse result. In real Chrome, against the production build, the first
live blog painted **~330ms after the reveal**; the art director's request left in the
same instant, from the submit handler — never an effect, so Strict Mode cannot spend it
twice. When W4 lands, each frame loads its replacement *under* the page on screen, hands
over the reader's scroll position, and fades in; the open tab survives the swap. Any
failure — no key, refusal, timeout, a spent budget — says nothing and keeps W3.

**The upgrade accepts only what the glimpse signed.** A ~$0.10 model call on an
unauthenticated endpoint cannot take its prompt from a browser, so the evidence and
brief travel as an HMAC-signed token (1h TTL for the upgrade); a forged or edited token
is a 403. The same token is the "evidence" that crosses signup, verifiable server-side.

**The cascade surgery.** `theme.ts` 1,673 → 1,344 lines; the blog's stylesheet moved to
`blogCss.ts` as seven layers (`reset → tokens → structure → type → ornament → motion →
overrides`) with **zero `!important` inside the shadow root** (608 → 0 per page; only
the light-DOM host guard keeps them). Emitted sheet: **28.3KB → 21.2KB raw (−25%),
6.0KB → 5.1KB gzip (−14%)**. `test:render` and `test:fidelity` cannot see a cascade, so
`test:cascade` compares every computed property of every shadow element (and its
pseudo-elements) at three viewports, at rest and with every interaction state forced:
**30,408/30,408 identical**, bar one named change (keyboard focus no longer squares off
a Smart Module card's corners — a specificity accident).

**What it found.**
- **8 of 16 genome effects were dead on arrival.** Written as ordinary declarations
  against an all-`!important` base, heading case, tracking, the lead card, image fit,
  the lanes measure, the oversize quote and the link offset would all have been
  silently ignored the day the genome reached a render. Layers are what made the
  compiler's output mean anything.
- **19 declarations had never rendered** — the reset (0,1,1) out-specified them (0,1,0).
  Layering would have brought them all to life on every published blog at once, so they
  were deleted and listed: the lede's bottom margin, the back pill's background, eight
  module margins, the module cards' background, the Pull Quote's overrides.
- **Pull Quote and Key Takeaways reference `--accent` / `--text` / `--surface`**, which do
  not exist in the render (ours are `--ct-*`). They paint Carma gold on every customer
  blog, or inherit a WordPress theme's own `--accent` when embedded. Not fixed here — a
  fix is a visible change on live blogs; filed.
- **Title case is English.** The first live preview put *"La Cocina De Mercado Al Estilo
  Del Nautilus"* on a Spanish blog. `headingCase: 'title'` now compiles under `:lang(en)`
  only (Chrome confirms `:lang` inherits into the shadow tree).
- **Old browsers.** A browser without `@layer` drops layered blocks whole. Every such
  browser already runs the DSD polyfill, which now flattens the layers first (~170 bytes;
  the blog's inline JS is 2.35KB of its 2.5KB budget).

**Still open for W5's promise.** The chosen genome reaches `/registre` but nothing after
signup reads it yet (no migration 039; the site is still themed by the clone), and the
chrome ladder (keep / harmonise / rebuild) is carried in each genome but not rendered —
the preview shows the blog body the genome controls, with the brand as its masthead.

---

## 16 — What could go wrong

**"Generated design is mediocre design."** Usually true, and the reason is always the same:
the space was unconstrained, so the model regressed to the mean of its training data. Our
bet is the inverse — *a heavily constrained space in which every point is good*. The
genome's job is to make bad design **unrepresentable**. That is a falsifiable claim and
§13 is the test. If distinctiveness is high and human review is low, the axes are wrong. If
distinctiveness is low, the director has collapsed. Both are diagnosable.

**"Customers won't recognise their own blog."** Real risk, and it's why *Faithful* is the
default on Door A and why a clone never loses its captured chrome. Reimagined is an offer,
never an imposition.

**"This is a lot of compiler."** It is roughly seven small pure functions and a schema. For
comparison: `theme.ts` alone is 1,648 lines and `modules.ts` is 1,420. The compiler is
smaller than either, and unlike either it is pure — which makes it the most testable code
in the repository.

**"We're deleting four months of design work."** We are not. The eight templates become
genome presets *and* the compiler's acceptance suite. They will be doing more work after
this plan than before it.

**"The migration queue."** `037` and `038` are outstanding per the project record. `039`
must not be stacked on unverified predecessors — confirm the queue before W8, and keep the
code 42703-safe (absent table ⇒ behave exactly as today), which is the house convention
and has saved this project at least twice.

---

## 17 — Decisions for the founder

Five of the six from revision 1 are now settled in code. What is left, plus what W0 and W1
turned up:

1. ~~**The three AA failures in §15.2.**~~ **SETTLED and shipped** — commit `fb509c6`,
   standalone, on `fix/template-link-contrast-aa`. Carma 3.47 → 5.25:1, Terra 4.12 →
   5.09:1, Atelier 4.49 → 4.99:1. Only `linkColor` changed; the accent stays, because it
   is the brand and it paints borders and chrome hover states. New values come from the
   same OKLCH walk the engine uses, targeted at 4.8:1 so a future background tweak does not
   put them back under the line.
2. **Faithful as Door A's default** — respect the brand first, offer the leap second. The
   alternative (lead with Reimagined) converts harder and churns harder. Still open.
3. **The chrome ladder in §9.1** replaces revision 1's "never regenerate a clone's chrome".
   The rule is now: the navigation and the identity are sacred, the markup is not, and
   `harmonise` is the default. Confirm this is the line you want.
4. **Three variants, one choice, six directions.** The taste test is gone (§9.2). More
   choice is worse choice, and a choice without consequences is noise.
5. **The eight templates survive as presets** — and are now also the compiler's fixtures.
   Free-tier customers can keep getting a preset instantly while generation is metered as a
   premium act, which makes this a pricing lever as well as a design one.
6. **Distinctiveness is the headline metric**, and it now has a number: **0.676** against a
   floor of 0.45, with the most common typeface at 9%. Ask about this number, not about
   whether the designs look nice. If it falls, we are shipping eight templates again and
   nobody will notice from the screenshots.
7. ~~**W2 next?**~~ **SETTLED and shipped.** The Eye is built and every corpus site now
   returns a score, a verdict and a chrome rung (§15.7). Next is **W3, the deterministic
   art director** — evidence → genome with no model at all, which is the rung everything
   else degrades to and must be good enough to ship alone. The register prior and the
   variant ladder are already its spine.
8. **Two open calibration questions for W3**, both visible in §15.7: 13 of 99 body pairs and
   3 of 99 link pairs are still unreadable (nested surfaces our parser loses), and 26 of 99
   pages give too few structural spacings to judge density. Neither blocks W3 — both degrade
   to "unknown", which the scorer already handles honestly — but each is a real ceiling on
   how confidently the director can reason, and worth a pass when the eval gives us a
   reason to care.
