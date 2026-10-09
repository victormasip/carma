# THE DOOR, MIRRORED — onboarding, the Premium hand-off, and the two domains

**Date:** 2026-10-09 · **Status:** APPROVED by the founder (2026-10-09), with one change: **no ownership gate on the Free tier** (Stage 4) — structure below, build order in §7
**Implements:** `2026-10-06-architecture-reboot.md` decisions 1–6, as the founder settled them
**Owner:** Lead Architect + Lead UX PM

> **In one sentence.** A visitor pastes their URL and, before any account exists, sees
> *their own website with a blog inside it* — their header, their links, their colours,
> three articles about their business — and the account wall appears at the moment the
> only thing left to do is keep it: free on `nom.carma.blog`, or Premium inside their own
> domain.

---

## 0. The decisions this document implements

| # | Founder decision (2026-10-09) | What it means for the funnel |
|---|---|---|
| 1 | **The Wow happens before registration**, from the MIRROR capture. The WordPress plugin (INSIDE) is the ultimate Premium upgrade. | The Door's preview is no longer "three designs with a header on top": it is *their site, mirrored, with the blog in it*. INSIDE is offered at the hand-off, never required. |
| 2 | **A dedicated tenant domain** (`carma.blog`) for the Free tier, on the Public Suffix List. Premium = custom domain or WP plugin. | Every Free blog lives at `<nom>.carma.blog`. `carma.cat` serves only Carma (marketing + app). |
| 3 | **L'INSTANT everywhere** — images, dashboard, superadmin. | The preview must paint in < 2s on a phone; the post-signup dashboard streams. (Shipped in W1, see the reboot plan.) |
| 4 | **No Publish-to-CMS (A3).** We are a host. | No "connect your CMS and we post into it" step anywhere in the flow. |
| 5 | **No native JS escalation.** Menus are replayed (`mirall.js`) or fall back to SAFE PANEL. | The preview and the published blog run **zero** third-party script, on every tier — including Premium custom domains. |

---

## 1. The flow, end to end

```
 STAGE 0  THE DOOR            STAGE 1  THE MIRROR              STAGE 2  THE HAND-OFF           STAGE 3  PROVISION        STAGE 4  LIVE
 ──────────────────           ──────────────────────           ─────────────────────           ─────────────────         ────────────
 "La teva web"  ──paste──▶    t≈1s  we READ you (glimpse)      "Publica'l"                      /benvinguda               nom.carma.blog
 (+ PDF / voice optional)     t≈4s  YOUR SITE, WITH A BLOG     ├─ Free: nom.carma.blog  ─────▶  adopt the preview's       (Premium: the
                              t≈45s certified Mirror swaps in  └─ Premium: dins el teu domini   capture + design; no      plugin page or
                                    (when W2 ships)               (WordPress plugin / CNAME)    re-capture, no wait       blog.domini.com)
                              3 bodies, ONE chrome (theirs)    account in place, preview
                                                               stays on screen behind it
```

### Stage 0 — The Door (logged out, landing)

*Unchanged surface, one changed promise.* The input stays the Door we have
(`components/marketing/Door.tsx`): paste a URL, optionally drop a PDF or talk. The copy
changes from "we'll design your blog" to **"Mira el teu blog dins la teva web"** — the
promise is now *their* site, not a design we invent.

### Stage 1 — The Mirror preview (logged out) — the Wow

Progressive, never a spinner. Each layer replaces the previous one in place:

| t | What the visitor sees | What runs | Exists? |
|---|---|---|---|
| **≈ 1 s** | Their own sentences, palette and typefaces — "we read you" | `glimpse` (deterministic scrape, no model, no DB) | ✅ shipped |
| **≈ 3–5 s** | **Their website's header and footer, at rest, with a blog in between**: three articles about their business (the synthesis pitches), cards in their colours | the static capture (`api/theme/analyze` pipeline) through the **W0 chrome policy**: their markup as captured when the capture is faithful, otherwise **SAFE PANEL** (their logo + their complete link tree + their legal links, in their colours); scripts stripped, CSP hash-only | ✅ W0 (this release) |
| **≈ 30–60 s** | The same page, swapped for the browser-certified Mirror (menus that open, sticky header, exact pixels) | W2 browser capture + certificate; swap only if certified, never a visible jump | ⏳ W2 |

**Three variants, one chrome.** Fidel / Elevat / Reimaginat now differ **only in the
blog body** (reboot plan §3.8). The header is always theirs. The variant switcher stays —
it is the only design decision we ask a stranger to make, and it is about *our* half.

**Where the preview lives.** On `preview.carma.blog` (W5) — a sandbox host on the
tenant domain, `noindex`, short-lived (1 h signed token, as today), watermarked "Vista
prèvia", hash-only CSP. **Never on `carma.cat`**: a faithful copy of someone's header
on our apex is a phishing kit with our name on it (reboot plan §3.9). Until W5 the
preview keeps today's route (`/api/onboarding/design/preview`), which already answers
with a hash-only CSP.

**Failure modes, honestly.** Capture refused or timed out → the glimpse layer stays and
the blog renders under a SAFE PANEL drawn from whatever links the glimpse found; never
an error screen, never an invented header. No website at all (`?nova=1`) → Ø mode:
the generated templates, which is the only place generation survives.

### Stage 2 — The hand-off (the account wall, moved to where it is worth paying)

One primary button under the preview: **"Publica el meu blog"**. It opens the account
step **over the preview** (a sheet, not a navigation): the visitor keeps looking at their
blog while they type an e-mail or press Google. Carried across signup, exactly as today
(sessionStorage carry, `writeDoorCarry`): the URL, the chosen variant, the signed design
token — plus, new, **the capture id** (§3, Stage 3).

**The residency choice** — shown in the same sheet, *after* the account exists, as two
cards, the first pre-selected:

| | **Free** | **Premium — dins la teva web** |
|---|---|---|
| Address | `nom.carma.blog` | `elteudomini.com/blog` (WordPress plugin, INSIDE) · or `blog.elteudomini.com` (CNAME) |
| Their header | Mirrored (certified) or SAFE PANEL | **Their real theme, natively** — menus, search, cart, everything |
| SEO | Their brand, our domain | **Their domain's authority** — the articles rank for *them* |
| Effort | None — it is already live | Install one plugin (WordPress) or add one DNS record |
| Shown when | Always | Always; **WordPress detected → the plugin card leads**, with "1 minut, sense tocar el tema" |

Rules that protect conversion:
- The Free path completes in **one click** from here. Premium never blocks publishing:
  choosing it publishes Free immediately and opens the upgrade checklist in the dashboard.
- The Premium card states the one thing the Free tier cannot do — *the articles rank on
  your own domain* — not a feature list.
- No price wall before the Wow, ever. Price appears on the Premium card only.

### Stage 3 — Provisioning (`/benvinguda`), without a second capture

Today the post-signup flow captures the site **again** (the onboarding's
`ThemeCaptureModal` re-runs `analyze`), so the visitor watches a progress bar for
something they already saw. The revision:

1. The preview's capture is stored once per domain at preview time (migration 039's
   `design_chrome_cache` already does this for the Door's design previews; W2 moves it to
   `chrome_captures`, plan §3.4) and its id rides the carry.
2. `/benvinguda` → `createOwnSite(origin_url)` → **adopt** that capture + the chosen body
   design in one server action. No re-capture, no modal: the dashboard opens on the
   Articles tab with the blog already live and the three proposals as drafts.
3. Only if the carried capture is missing or older than 24 h does the onboarding capture
   again — and then as a background task, never a blocking modal.

### Stage 4 — Live, at once (no ownership gate on Free)

**Founder decision, 2026-10-09: anyone can publish a MIRROR to `nom.carma.blog` the
moment their account exists — no DNS record, no e-mail match, no waiting.** Growth and a
zero-friction funnel come first; asking a small-business owner for a TXT record at the
moment of the Wow would kill the conversion this whole flow exists for. The theoretical
risk — someone mirroring a site that is not theirs, a phishing page with our name on it
(reboot plan §3.9.2) — is **accepted for now** and handled after the fact, at scale.

What still stands, because it costs the visitor nothing:

| Control | Why it stays |
|---|---|
| `carma.blog` on the Public Suffix List; the app on `carma.cat` only | a mirror can never read or set the app's cookies |
| Zero third-party JavaScript on every blog (stripped + hash-only CSP, W0) | a mirrored page cannot run the copied site's scripts — or anyone's |
| Previews on `preview.carma.blog`: signed, 1 h, `noindex` | nothing is indexed or shareable before an account exists |
| Capture through the egress guard (W2) | a capture can never be pointed at our own network |

Abuse, later and reactively (W5+, no friction added to the honest path): a "report this
page" link in every blog footer and a takedown runbook (unpublish = one flag, purges the
edge by tag); automated signals on capture — a password field or a login form in the
captured chrome, a brand far bigger than the account, a domain on a phishing feed — that
route the site to review and to the SAFE PANEL until a human clears it; rate limits per
account and per IP on captures and publications.

Ownership still matters in the **Premium** paths, but as plumbing, not as a gate: a custom
domain only serves once its CNAME points at us (that record is the proof), and the
WordPress plugin can only be installed by the site's admin.

### Stage 5 — The upgrade, later

The Premium card returns in three places, each tied to a moment of value, never a timer:
the dashboard's Publica tab (permanent), the first time an article passes 100 views
("aquest article podria posicionar al teu domini"), and the SEO tab of the editor.
Upgrading never re-captures and never changes a URL without a 301.

---

## 2. What changes against today

| Today (2026-10-08) | After |
|---|---|
| Door preview = 3 *designs*, header kept / harmonised / **rebuilt by us** | Door preview = **their site with a blog**; header theirs (mirrored or SAFE PANEL); 3 variants differ in the body only |
| `harmonise` re-paints their header; `rebuild` keeps 6 links and drops every legal link | **Deleted** for every site with a website (W0). SAFE PANEL keeps 100% of the links, legal links included |
| Captured regions carry their scripts (median 23 per site) on `*.carma.cat` | **Zero** third-party script, enforced twice: stripped at render, refused by a hash-only CSP (W0) |
| Account wall → capture **again** → WhatsApp → import | Account wall → **adopt** the preview's capture (no second capture) → dashboard, live |
| Free blogs on `<sub>.carma.cat`, same-site with the app | Free blogs on `<sub>.carma.blog` (PSL) — W5 |
| Premium = "more modules" | Premium = **residency**: inside their own domain (plugin / CNAME) |

---

## 3. Routing: `carma.blog` (Free · MIRROR) vs Premium

### 3.1 Hostnames

| Host | Serves | Canonical | Cookies |
|---|---|---|---|
| `carma.cat`, `www.carma.cat` | marketing + the app (`/dashboard`, `/admin`, `/edit`, `/api/*`) | itself | app session, `__Host-` prefixed, host-only |
| `<sub>.carma.blog` | a **Free** blog (MIRROR / SAFE PANEL) | itself — unless the site is Premium (then 301 to the Premium address) | **none** |
| `preview.carma.blog` | logged-out Door previews (signed, 1 h) | — (`noindex`) | none |
| `blog.theirdomain.com` (CNAME → Vercel) | a **Premium custom-domain** blog — the same render, their hostname | itself | none |
| `theirdomain.com/blog/*` (WordPress) | a **Premium INSIDE** blog — WordPress renders it server-side with their theme (plugin v1.0, W4) | their URL | theirs |
| `<sub>.carma.cat` (legacy) | **301** → `https://<sub>.carma.blog/<same path>` for 12 months | — | — |

`carma.blog` goes into the **private section of the Public Suffix List**: each tenant
becomes its own *site* for cookies and `SameSite`, so no blog — and nothing a capture
might ever smuggle in — can toss cookies at the app (GitHub moved Pages to `github.io`
for exactly this). PSL inclusion has a lead time we don't control; the domain move does
not wait for it, the cookie hardening ships with it.

### 3.2 The proxy, as a decision tree (`src/proxy.ts`, W5)

```ts
const host = hostOf(request)                       // lower-case, no port
if (APP_HOSTS.has(host)) return app(request)       // carma.cat, www.carma.cat, localhost
if (host.endsWith('.carma.blog')) {
  const label = host.slice(0, -'.carma.blog'.length)
  if (label === 'preview') return preview(request) // signed Door previews only
  return rewrite(request, `/render/${label}`)      // Free blog (resolves by subdomain, as today)
}
if (host.endsWith('.carma.cat')) return redirect301(`https://${label}.carma.blog${path}`) // legacy
const siteId = await customDomain(host)            // `site_domains`, cached (use cache, tag `dom:<host>`)
return siteId ? rewrite(request, `/render/${siteId}`) : notFound()
```

What exists today: `extractSubdomain()` + `serveTenantBlog()` already rewrite
`<sub>.<root>` onto `/render/<sub>`, and the render resolves a UUID **or** a subdomain.
The change is a second root (`TENANT_DOMAIN=carma.blog` beside `NEXT_PUBLIC_ROOT_DOMAIN`),
the legacy 301, and the custom-domain lookup.

### 3.3 Premium, two ways in

- **WordPress (INSIDE, plugin v1.0, W4).** The plugin maps `^{base}/(.+)/?$` to a virtual
  page rendered with *their* theme's template and prints our article from
  `/render/<site>/<path>?format=fragment` as Declarative Shadow DOM (contract already
  shipped: `buildArticleFragment`). Their header, footer, menus and scripts are theirs,
  natively — which is why it is the *ultimate* upgrade: no capture, no replay, no
  certificate needed. Canonical = their URL; `<sub>.carma.blog` 301s to it.
- **Custom domain (any CMS).** `blog.theirdomain.com` CNAME → Vercel; the domain is
  attached through the Vercel for Platforms domains API at the moment ownership is
  proven (the same DNS record doubles as proof). Served by the same render as Free —
  MIRROR or SAFE PANEL chrome, zero third-party JS (decision 5 holds on Premium too).

### 3.4 Data model (migration with W5)

```sql
create table site_domains (
  host        text primary key,                          -- lower-case, no port
  site_id     uuid not null references sites(id) on delete cascade,
  kind        text not null check (kind in ('custom', 'wordpress')),
  verified_at timestamptz,                               -- null = not serving
  is_primary  boolean not null default true
);
alter table sites add column residency text not null default 'mirror'
  check (residency in ('mirror', 'safe_panel', 'inside_wp', 'custom_domain', 'no_site'));
```

`residency` is what the dashboard shows ("El teu blog viu a…") and what the render reads
to choose canonical + chrome; it is *derived* (capture certificate, a serving custom
domain, an installed plugin), never typed by hand. Free MIRRORs need no proof (Stage 4).

### 3.5 What every host shares

The same render core and the same cache: `use cache` entries and `Vercel-Cache-Tag`
headers keyed by **site and post**, never by hostname — so a publish purges the article
on `nom.carma.blog`, on `blog.theirdomain.com` and in the plugin's transient (signed
purge webhook) in one invalidation.

---

## 4. Security gates, by stage

| Stage | Gate |
|---|---|
| Preview | Sandbox host, signed 1 h token, `noindex`, hash-only CSP, chrome sanitised over a spec parse, SSRF-guarded capture (DNS-resolved, every redirect re-checked — W1 hardened `/api/img` the same way) |
| Publish | **No ownership gate on Free** (founder, 2026-10-09). Abuse handled after the fact: report link, one-flag takedown with edge purge, automated capture signals → review (Stage 4) |
| Every blog page | Zero third-party script (stripped + CSP); host-only app cookies; PSL tenant domain |
| Premium custom domain | Domain attached only after DNS proof; same CSP |
| INSIDE (WordPress) | Origin allow-list + HMAC-signed fragments, size cap, 2 s timeout → client-side fallback |

---

## 5. Metrics that decide whether this worked

| Metric | Today | Target |
|---|---|---|
| Door: URL pasted → preview with their header painted (p75, 4G phone) | ~ 4–8 s, header redrawn for ~ 2 in 3 sites | **≤ 5 s**, header theirs on 100% (mirrored or SAFE PANEL) |
| Preview → account created | (to instrument) | +30% vs the 3-designs preview |
| Account → blog live (no second capture) | ~ 60–90 s incl. a second capture | **≤ 10 s** |
| Free → Premium within 30 days | — | 8% (WordPress sites: 15%) |
| Abuse reports → takedown (p95) | — (no reports yet) | **< 24 h**, edge purged with it |

---

## 6. Explicitly not in this flow

Publish-to-CMS (decision 4) · running their JavaScript on any of our hosts, Premium
included (decision 5) · a model drawing their header, labels or links (reboot law 1) ·
a price before the Wow.

---

## 7. Build order

| Wave | Funnel pieces |
|---|---|
| **W0 — this release** | Generated chrome killed (keep when faithful, SAFE PANEL otherwise) in the Door preview, the adoption and every rendered blog; customer scripts stripped from every captured region; hash-only CSP on every blog page; Door copy for the chrome labels |
| **W1 — this release** | L'INSTANT: image policy (preview + blog + dashboard), streamed dashboard, keyset lists, rollups — the "dashboard opens instantly" half of Stage 3 |
| **W2** | Browser MIRROR capture + certificate → Stage 1's third layer; `chrome_captures`; capture id in the carry; Stage 3 adopts without re-capture |
| **W4** | WordPress plugin v1.0 (INSIDE) → the Premium card's primary path |
| **W5** | `carma.blog` + PSL + legacy 301s; `site_domains` + custom domains; the report link + takedown runbook (Stage 4); `preview.carma.blog` |
