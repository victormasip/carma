# HANDOFF — Carma marketing site → Claude Code

This project contains a finished **public marketing landing page** for Carma (`Carma Landing.html`) plus a **brand foundation kit** extracted from the production repo at <https://github.com/victormasip/carma>.

This document is for an engineer (or Claude Code) who's about to fold this into the real Next.js codebase and add the missing **`/login`** and **`/registre`** (signup) routes.

---

## 0 · TL;DR — what to build next

1. **Port** `Carma Landing.html` into the existing Next.js app as a public marketing page (likely at `/` for unauthenticated visitors, or `/inici`).
2. **Adapt** the existing `/login` page in `src/app/page.tsx` so it matches the polish of the landing's `<GenerateModal>` flow.
3. **Add** a new `/registre` route that mirrors `/login` but with an extra "Confirmar contrasenya" field and uses `supabase.auth.signUp`.
4. **Hook** the "Genera el meu blog" CTA to the real onboarding flow: receive the URL, kick off `theme/analyze`, persist via `supabase`, redirect into `/dashboard`.

---

## 1 · Repository layout you'll be folding into

The production codebase is **`victormasip/carma`** (Next.js 16 · React 19 · Tailwind v4 · Supabase · TipTap · `lucide-react`). Key existing files to read first:

| File | What it is |
|---|---|
| `src/app/layout.tsx` | Root layout — loads Plus Jakarta Sans via `next/font/google`, applies `bg-[#F9F8F6]`, wires `ToastProvider` + `ConfirmProvider`. |
| `src/app/globals.css` | Tailwind v4 theme block with `--color-carma-*` palette, `--shadow-premium`, focus ring rules, TipTap editor styles, callout variants. **Do not duplicate — extend.** |
| `src/app/page.tsx` | Current `/` is the **login** page. Cannibalize this for `/login` and copy/modify for `/registre`. Uses `supabase.auth.signInWithPassword`. |
| `src/app/dashboard/page.tsx` | Authenticated home — card grid of sites. |
| `src/app/dashboard/DashboardSidebar.tsx` + `SidebarNav.tsx` | The sidebar mocked up in this landing's `<EditorPreview>`. |
| `src/components/ui/Modal.tsx` | Use this `<Modal>` and `useConfirm()` rather than rolling your own. |
| `src/components/ui/Toast.tsx` | Use `useToast()` for ephemeral messages. |
| `src/lib/i18n/messages.ts` | Dashboard string dictionary (CA/ES/EN). Add new keys here when you add new strings. |
| `src/app/api/theme/analyze/route.ts` | The real URL-cloning endpoint behind "Genera el meu blog". |

The codebase has a top-level note in `AGENTS.md`:

> This is **not** the Next.js you know — APIs and conventions differ from training data.

Read `node_modules/next/dist/docs/` before writing new routes.

---

## 2 · This project's files

```
.
├── Carma Landing.html         ← THE marketing landing page (React + Tailwind via CDN)
├── HANDOFF.md                 ← this file
├── README.md                  ← brand context (history of Carma, copy voice, visual system)
├── SKILL.md                   ← agent-skill manifest (cross-compatible with Claude Code skills)
├── colors_and_type.css        ← drop-in CSS variables for every token
├── fonts/                     ← Plus Jakarta Sans (variable) — instructions only; falls back to gstatic CDN
├── assets/                    ← wordmark.svg, wordmark-on-dark.svg, glyph-mark.svg
└── preview/                   ← single-purpose design-system cards (Type, Colors, Surface, etc.)
```

**`Carma Landing.html` is intentionally one self-contained file** (Babel-in-browser + Tailwind Play CDN) so it can be opened/iterated/screenshot'd offline. For production, port the React components inside it into the real Next.js codebase as proper `.tsx` files. The Babel/Tailwind CDN scripts disappear.

---

## 3 · Components in `Carma Landing.html` worth porting

Each lives in its own `<script type="text/babel">` block, in order:

| Block | Components | Notes for porting |
|---|---|---|
| Icons | `Wand`, `Sparkles`, `Globe`, `Pencil`, `Palette`, `Languages`, `Plug`, `Boxes`, `Sliders`, `Lock`, `Settings`, `LogOut`, `FileText`, `ChevronRight`, `ArrowRight`, … | **Drop these.** The real app imports the same icons from `lucide-react`. Just `import { Globe, Wand2 as Wand, … } from 'lucide-react'` — note `Wand` ↦ `Wand2` in current Lucide. |
| Nav | `Wordmark`, `Nav` | `Wordmark` is keeper — promote it to `src/components/ui/Wordmark.tsx`. `Nav` is marketing-only; lives at `src/app/(marketing)/_components/Nav.tsx`. |
| Hero / URL input | `UrlInput`, `Hero` | **`UrlInput` is the centerpiece.** Reusable. Promote to `src/components/marketing/UrlInput.tsx`. Animation logic uses `useState`+`useEffect`; works identically in production. |
| Browser mockup | `BrowserMockup`, `FloatingPill` | Marketing-only. |
| How it works | `HowItWorks` | Marketing-only. |
| Bento + sub-components | `Bento`, `SlashCommandMock`, `ThemeStudioMock`, `ThemeKnob`, `ApiSnippet` | Marketing-only. |
| Editor preview | `EditorPreview`, `ToolbarBtn`, `ToolbarDiv`, `Field` | Marketing-only, but the **layout faithfully mirrors `DashboardSidebar` + a TipTap editor**. Keep for parity. |
| Pricing | `Pricing`, `PricingCard` | Marketing-only. The `gold-ring` CSS effect is a `::before` gradient — port as a styled-jsx block or a Tailwind plugin. |
| Final CTA / Footer | `FinalCta`, `Footer` | Marketing-only. |
| Modal | `GenerateModal`, `StartPanel`, `ProgressPanel`, `ReadyPanel` | **This is your onboarding flow.** Wire `ProgressPanel` to the real `/api/theme/analyze` route's SSE / polling. Wire `StartPanel`'s buttons to `signInWithOAuth({ provider: 'github' })` and email signup respectively. `ReadyPanel`'s CTA should `router.replace('/dashboard')`. |
| App | `App` | Just composition + `IntersectionObserver` reveal hook. The reveal hook (`useEffect` querying `[data-reveal]`) ports cleanly. |

---

## 4 · Design tokens

`colors_and_type.css` is canonical. The relevant ones for new pages:

```css
--carma-500: #d4af37;   /* corporate gold */
--bg-page:   #F9F8F6;   /* warm canvas */
--shadow-premium: 0 30px 70px -10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.01);
```

In the real app these already exist as Tailwind tokens (see `src/app/globals.css` — `--color-carma-*`, `--shadow-premium`). Use those, not duplicates.

**Signature shapes:**
- `rounded-xl` (12px) — inputs, small buttons
- `rounded-2xl` (16px) — cards, modal default
- `rounded-3xl` (24px) — site cards, bento
- `rounded-[2rem]` / `rounded-[2.5rem]` — login card, large modals, hero panels

**The primary-button gradient** (lift verbatim):
```html
class="bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600
       hover:from-carma-500 hover:to-carma-400
       text-white shadow-[0_10px_30px_-6px_rgba(212,175,55,0.30)]"
```

---

## 5 · Building `/login` and `/registre`

### `/login`
Already exists at `src/app/page.tsx`. Two improvements to merge in from the landing:
1. **Wordmark component** — use `<Wordmark/>` rather than the inline `Carma<span>.</span>` JSX (one source of truth).
2. **Continue-with-GitHub** button — currently the login is email/password only. Add a top-of-form button that calls:
   ```ts
   await supabase.auth.signInWithOAuth({
     provider: 'github',
     options: { redirectTo: `${origin}/auth/callback` },
   });
   ```
   You'll need to enable the GitHub provider in Supabase dashboard + add the OAuth app on GitHub.

### `/registre` (NEW)
Mirror the login page. Layout:
- Same atmospheric halos and rounded-[2.5rem] card.
- Wordmark + eyebrow `"CREA EL TEU COMPTE PREMIUM"`.
- Fields: **Correu electrònic**, **Contrasenya**, **Confirmar contrasenya**.
- Optional: pre-fill an URL field if user arrived via the marketing CTA (read `?url=` from search params and pass it to the `theme/analyze` flow post-signup).
- Submit calls `supabase.auth.signUp({ email, password })`.
- On success: redirect to `/dashboard` (or to a "check your email" page if email confirmation is on).
- Add a "Continuar amb GitHub" button (same as login).
- Bottom link: *"Ja tens compte? **Entra.**"* → `/login`.

**Catalan microcopy to use:**
- Page title: `"Crear el teu compte Carma"`
- Eyebrow above wordmark: `"COMENÇA LA TEVA HISTÒRIA"`
- Submit button: `"Crear el meu espai"`
- Disclaimer (small, below button): *"En crear el compte acceptes els nostres Termes d'ús i la Política de privacitat."*

---

## 6 · Wiring "Genera el meu blog" end-to-end

The marketing page's `<GenerateModal>` is fake — it shows progress and a fake palette. To make it real:

1. **StartPanel**: when the user clicks "Continuar amb GitHub" / "Continuar amb el correu", redirect to `/registre?url=<encoded URL>`.
2. **`/registre`**: after a successful `signUp`, immediately POST to `/api/theme/analyze` with the URL, store the resulting theme on the new user's first site row.
3. While analysis runs, redirect to `/dashboard/sites/<new-site-id>?onboarding=1` and show the **ProgressPanel** UI inline. Use Supabase Realtime or polling to update steps.
4. When the theme is saved, swap to the **ReadyPanel** and offer the CTA to create a first post.

Reuse the `<ProgressPanel>` and `<ReadyPanel>` components verbatim — they were designed to be driven by a `stage` prop.

---

## 7 · Things I had to fake (real-data items)

- **Trust strip in hero** — `L'Atelier`, `Ferreteria Roca`, `Vinya Petita`, `Òptica Vidal`, `Bòria Galeria` are fictional. Replace with real customer names or remove.
- **Pricing** — `0€` (Free) and `19€/mes` (Premium) are placeholders. Confirm with founders.
- **Animated URL placeholders** — same fictional names. Replace if you want real example brands.
- **Author avatars in the editor preview** — `JM` (gold), `AR` (green), `+2` (gray). Decorative.

---

## 8 · Conventions I followed (and that you should too)

- **All visible UI text in Catalan** by default. Add to `src/lib/i18n/messages.ts` for new strings.
- **Second-person singular informal** (`tu` / `teu` / `els teus`). Never `vostè` or `vosaltres`.
- **Eyebrow labels**: `UPPERCASE` with `tracking-[0.16em]` to `tracking-[0.18em]`, text-xs, font-extrabold, text-neutral-400.
- **Catalan apostrophe** `'` (curly), Catalan middle-dot `·`. Use the actual characters, not workarounds.
- **No emoji in chrome.** Emoji are only allowed inside TipTap editor callouts (💡 ✅ ⚠️ 🚫) and as the locale-switcher flag (🇦🇩 for CA).
- **Lucide icons only.** No bespoke SVG except the Carma wordmark/glyph.
- **`scroll-margin-top: 110px`** on every section with an `id` so the floating nav doesn't cover the destination.

---

## 9 · Open questions for the founders

Things I couldn't decide unilaterally — leave a comment in the PR if you need answers:

1. Real customer logos for the trust strip?
2. Real pricing tiers — confirm Free + Premium at 19€/mes, or add a third Team tier?
3. Is `signInWithOAuth({ provider: 'github' })` the desired primary, or should it be Google?
4. After signup, do we email-confirm before letting the user in? (Affects redirect after `/registre`.)
5. The `theme/analyze` endpoint already exists — what's its average runtime? The fake progress is paced at ~800ms per step (5s total). Tune to real timing.

---

Happy building. The brand voice and visual system are heavily documented in `README.md` — read that before you write a single new sentence of UI copy.
