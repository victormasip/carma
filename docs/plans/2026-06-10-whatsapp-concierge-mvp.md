# WhatsApp Content Hub — Concierge MVP Validation Protocol

**Date:** 2026-06-10 · **Author:** Víctor Masip · **Session:** YC Office Hours (startup mode) · **Stage:** pre-product, demand unvalidated
**Status:** VALIDATION TEST — no code to be written until this test passes.

> Output of an office-hours interrogation. This is a demand-validation protocol, not an
> implementation plan. The architecture (WhatsApp → webhook → n8n → Whisper/Claude →
> Supabase/Carma API) is deliberately deferred until a stranger pays twice (see Assignment).

---

## 1. The idea (as pitched)

Give clients a WhatsApp number. They send a rough voice note or text. A backend pipeline
(n8n + Whisper + Claude) transcribes, expands, structures into an SEO article, and publishes
to their headless blog. Core bet: the reason local businesses don't produce SEO content is
**input friction** (keyboard + blank page), and switching the input to "voice note on the go"
bridges the gap.

### Prior decision this reverses/reframes
The 2026-06-09 CEO review (`docs/plans/2026-06-09-headless-decoupling.md`) **cut WhatsApp**:
*"token isolation (the moat) is worthless on WhatsApp; it needs none of the render engine.
No customer asked."* That cut was about WhatsApp as a **distribution** channel (push Carma
content out). This initiative is materially different: WhatsApp as an **input** channel for
content **creation**. Different product, different pain. It still has to clear the bar that
killed the original ("no customer asked"), which is the entire point of this protocol.

---

## 2. Demand findings (honest state)

- **No explicit demand.** Nobody has asked for this exact feature. Confirmed by the founder.
- **The only "validation" is a Mom Test false positive:** people say *"that sounds like a very
  useful tool."* Interest, not demand. Correctly identified and discarded by the founder.
- **Status quo of the original target (local businesses) = nothing.** They do nothing about
  SEO today. This is the Q2 red flag: if no one is doing anything, even badly, the problem is
  usually not painful enough to act on. A frictionless input does not manufacture absent urgency.
- **Diagnosis:** SEO content is a *vitamin* for a local business, not a *painkiller*. Two more
  likely blockers than input friction: (1) **trust/control** — a regulated professional will not
  auto-publish AI-expanded voice rambles under their name without heavy review, which reintroduces
  the friction downstream; (2) **ROI disbelief** — they don't act because they don't believe a
  blog drives business, and easier input changes nothing about that.

### The pivot this produced
From **the local business** (no pain, vitamin) to **the people who produce content for local
businesses**: freelance content marketers and small agencies. They have what the clinic lacks:
- Acute pain with a monthly clock and a churn consequence (clients expect N posts/month).
- Capacity = revenue. "10x your output" is a painkiller, not a vitamin.
- Trust already solved: they ship AI-assisted, voice-dictated drafts as a matter of course.
- They bring their local-business clients with them (one agency = many blogs).

**Open strategic tension (parked, do not resolve now):** this pivot moves Carma from "empower
the local business directly" toward "a B2B2C content tool for the people who serve them," which
sits closer to the Jasper / Copy.ai content-tool market, where "voice note via WhatsApp" is a
feature, not a moat. Decide that later, with data. Not now.

---

## 3. The test: Concierge MVP

**Be the bot. Manually. For real money. No automation built.**

You personally do the transcribe → expand → write → publish loop by hand, using Claude/ChatGPT
as *your* private tool (not a productized pipeline). If you cannot sell the manual version, the
automated version is worth zero, and you learn that in days instead of months. Doing it by hand
is also how you discover the real conversational edge cases you'd otherwise guess at.

### Named target (first rep)
**Aurora Masip — Masip Comunicació**, a small agency managing content for several local clients.

### The pitch (today)
> "Aurora, I know you have to write several posts this month for your clients. Let's do a pilot:
> send me rough voice notes of the concepts on WhatsApp, and I'll personally turn them into
> SEO-optimized articles and publish them straight to your clients' sites. 4 articles this month
> for €150. You save hours of writing and keep your full retainer. Want to try it?"

Tweaks: anchor to her most-behind client ("let's start with that one"); ask what she charges
clients / would pay a freelancer (reveals real market price); real price + real invoice (no
"free" or "pay if happy" — that kills the signal). Optional risk-reversal: "if an article isn't
usable, you don't pay for that one."

---

## 4. ⚠️ FLAG 1 — Surname bias (read this before trusting any result)

**Aurora Masip shares the founder's surname.** If she is family or a close friend, her "yes" is
contaminated: a warm lead says yes to help you, not because the demand is real. The founder *just*
escaped one false positive ("sounds useful"); a warm yes is the second trap.

**Rule:** Use Aurora to learn the **workflow**, not to validate **demand**. She is the safe first
rep for finding out what voice-note-to-article actually takes. **Demand is not validated until a
stranger pays.** This is why the protocol requires two cold targets in parallel (see §6).

## 4b. Flag 2 — WordPress, not Carma (intentional, for now)
The pitch publishes to clients' existing sites (WordPress), not Carma. That's correct for this
test: it removes all platform-migration friction and isolates the one variable being tested
(will someone pay for voice → published article). It does mean this pilot validates a *content
service*, not Carma adoption. Don't let "but it should publish to Carma" creep in and slow the test.

---

## 5. 📊 Metrics to track manually (per article, all four)

These are mandatory. They are both the demand signal and the spec for any future automation.

| Metric | Why it matters |
|---|---|
| **Money moved** | €150 actually transferred for month one. Real money, not a promise. The only hard demand signal. |
| **Time spent (minutes/article)** | €150 ÷ 4 = €37.50/article. If each takes ~2h by hand, the margin only exists once automated. This sets the automation target. |
| **Clarification round-trips** | Count how often you had to go back and ask "what's the price / the address / the date?" **This single number is the most important input to designing the conversational bot later.** 3 follow-ups per rambling note = your "frictionless" product has a follow-up problem to design for. |
| **Edit distance / rewrite depth** | Did she publish your draft with light edits, or heavily rewrite it? Heavy rewrites = the output isn't trusted/usable = kill signal. |
| **Pull vs nag** | Did she send voice notes on her own, or did you have to chase her? Unprompted sending = demand; chasing = politeness. |

Also save **the raw transcript and your final article** for each one. That is your future
prompt/fine-tune dataset and your evidence of how much transformation is actually required.

---

## 6. Pass / fail criteria (define before starting, do not move the goalposts)

- **Minimum bar:** Aurora actually transfers €150 for month one.
- **Real demand:** she sends voice notes without chasing, publishes drafts with light edits, and
  asks for month two or more volume on her own initiative.
- **Kill signal:** enthusiastic but slow to send notes; heavy rewrites of every draft; or
  "let's pause" after month one.
- **The real validation gate:** a **cold (non-warm) target pays, and then pays a second time.**
  One warm pilot is N=1 and contaminated (Flag 1). Repeat payment from a stranger is the bar.

---

## 7. The Assignment

**By Friday:** sell the €150 manual pilot to Aurora **and** pitch the identical manual pilot to
**two agencies/freelancers you have no personal relationship with.** Come back with three data
points: did money move, did they send notes without nagging, and how many clarification
round-trips per article.

**Do not write a single line of automation until a stranger has paid twice.**

---

## 8. What happens after (deferred, not now)

Only once the test passes (a stranger pays twice): run `/plan-eng-review` on the pipeline. The
architecture — WhatsApp Business API → webhook → n8n → Whisper transcription → Claude
structuring → Supabase/Carma publish — and the conversational edge cases (clarification prompts,
multi-topic notes, missing facts) get designed **then**, grounded in the clarification-round-trip
and timing data measured by hand here, not guessed.

---

## 9. North Star (deferred) — the "Auto-SEO Competitor" engine

**Stated end-goal:** a fully autonomous engine that continuously scrapes the client's site,
analyzes local competitors, identifies SEO gaps, and auto-generates + auto-publishes optimized
articles. WhatsApp becomes the control panel / manual override for the agency.

**This does NOT change what gets built this week.** Still nothing. Still the manual concierge
test. The vision is the destination, not the next build. Naming a grand vision right after
accepting a painful validation test is the classic way founders talk themselves back into the
cathedral. Discipline holds.

**What the vision DOES change — invert the emphasis.** "Fully autonomous auto-publish" is the
weakest part of the plan: mass auto-generated SEO content is exactly what Google's helpful-content
/ spam updates target, AI overviews are cutting the clicks it chases, and generation itself is
now a commodity (everyone has an LLM). The *defensible* core is the other half: **continuous
competitor analysis + SEO-gap identification** (what to write and why) plus a **human accountability
layer** (the agency). Reframed north star: the moat is the *strategy/intelligence* layer;
generation is a cheap commodity step; a human stays in the loop for trust. That is a sharper,
more future-proof vision than "autonomous content farm."

**The tension you must own:** "fully autonomous auto-publish" aims to make the agency — your first
customer — obsolete. Agencies are smart; if they sense that, they won't feed you their clients'
data. Decide honestly: is the agency your *customer* (you empower them, human-in-loop forever) or
your *bootstrapping stepping-stone* before going direct-to-SMB? Both are real strategies; they
imply very different investments. Do not pretend it's both.

**Architect-for-the-future = data shape, not infrastructure.** Build no scraping/n8n/pipeline now.
Instead, make the manual concierge test hand-populate the schema the future engine would need, so
automation later is "swap one stage," not "rebuild." Model every artifact as a first-class record
per client:

```
client → source_site_url
       → competitor_set (the local competitors you eyeballed)
       → keyword/gap (the topic and WHY: which competitor ranks for it, client doesn't)
       → brief / transcript (the raw voice note)
       → draft (Claude output)
       → approved_article (post-human-review)
       → published_url
       → OUTCOME  ← the crown jewel: did it rank / drive traffic at 60 days?
```

The **outcome loop** is what everyone skips and what separates "auto-optimize" from "auto-generate."
Start capturing it by hand now, even as a single "ranked? traffic?" check at 60 days. Without it,
the autonomous engine is just a content firehose.

Pipeline stages to keep cleanly separable (manual now, automatable later, in this order of value):
1. **Research** (competitor + gap analysis) — the moat, automate last, highest value.
2. **Input** (voice/text/auto-trigger) — the WhatsApp wedge.
3. **Generation** (Claude) — commodity, easy.
4. **Human review/approval** — the trust layer; probably never fully removed.
5. **Publish** (WP now → Carma API later).

**How the vision changes the pitch TODAY (important):**
- **Do NOT pitch the autonomous end-goal to Aurora or any agency.** "It'll eventually do all of
  this automatically" describes their replacement. It spooks a savvy agency and does nothing to
  close the pilot. Pitch **capacity and margin**: more output, faster, keep the retainer.
- **DO test the highest-value part of the vision cheaply, now.** Add a competitor-gap angle to the
  pilot: "I'll also flag the topics the client's local competitors are ranking for that they're
  missing." If agencies pay *more* for that intelligence than for the writing itself, you've
  validated the defensible core of the north star for the price of a manual SERP scan. If they
  shrug at the gap analysis and only want cheap articles, the autonomous-intelligence vision is in
  doubt and you've learned that before building any of it.

**Q6 future-fit verdict:** in 3 years the commodity "generate N articles" play becomes *less*
essential (penalties, AI overviews, ubiquitous LLMs); the "competitor-driven content strategy with
a human accountable for it" play becomes *more* essential. Architect toward the second.

---

## Founder signals observed this session
Honesty (named the false positive unprompted); pushback against own idea (pumped the brakes);
named a specific user; agency/bias-to-action (ready to pitch today); rigor/taste (applied the
Mom Test to himself). High-signal session. The risk is not effort or honesty; it is falling for
a warm yes. Flag 1 exists to prevent exactly that.
