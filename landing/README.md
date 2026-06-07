# Carma Design System

> *"La gestora de continguts que estima el teu lloc web."*

**Carma** is a Catalan-first, premium **content-management platform**. A multi-tenant CMS where a *superadmin* configures sites for clients, and clients write articles inside a refined TipTap editor — published back to their public site via an embed script. Think: a small studio's bespoke alternative to WordPress, with a clear "premium" point of view: warm gold over off-white, generous shadows, soft-rounded everything, and microcopy in Catalan that treats the user like a friend.

This folder contains the foundations, assets, and UI kit needed to design new Carma surfaces — extra screens, marketing pages, slides, mockups, or production code — and have them feel native to the product.

**Source repository:** <https://github.com/victormasip/carma>
Built with Next.js 16 · React 19 · Tailwind v4 · Supabase · TipTap · `lucide-react`. The system was extracted directly from `src/app/globals.css`, `src/app/page.tsx`, `src/app/dashboard/*`, and `src/components/ui/*`. Open the repo for full implementation context.

---

## Index

```
.
├── README.md                 ← you are here
├── SKILL.md                  ← invocable skill manifest
├── colors_and_type.css       ← all design tokens (CSS variables)
├── fonts/                    ← Plus Jakarta Sans (variable)
├── assets/                   ← wordmarks, glyph mark
├── preview/                  ← design-system cards (rendered in the DS tab)
└── ui_kits/
    └── dashboard/            ← Carma admin dashboard kit
        ├── README.md
        ├── index.html        ← click-through prototype: login → dashboard → site → editor
        └── *.jsx             ← reusable components (Sidebar, SiteCard, PostCard, …)
```

---

## Products represented

There is **one** product surface: the **Carma Dashboard** — a single Next.js app that hosts both client and superadmin experiences. It contains:

| Surface | What it does |
|---|---|
| **Login** (`/`) | Email + password; the "premium" gateway. Gold halos, atmospheric. |
| **Dashboard home** (`/dashboard`) | Card grid of the user's sites. Superadmins also get a "Usuaris" tab. |
| **Site detail** (`/dashboard/sites/[id]`) | Per-site control center: API key, posts manager, theme studio, integration guide, import. |
| **Post editor** (`/dashboard/sites/[id]/posts/[postId]/edit`) | A TipTap distraction-free editor with bespoke nodes (Callout, Columns, Gallery, Figure, TOC, Toggle, CTA, SlashCommand). |
| **Public render / embed** (`/render/...`, `/embed/...`) | The output side — articles served back to client sites. No bespoke chrome of its own; styled by per-site theme. |

There is **no marketing site** in the repo. There are **no native apps**. The product is the dashboard.

---

## Content fundamentals

**Language.** Catalan is the **default and primary** voice (`DEFAULT_LOCALE: 'ca'`). Spanish (`es`) and English (`en`) exist but are second-class. When you write copy: write in Catalan first, translate after. If you only speak English, write English copy that *reads like it was originally Catalan* — calm, slightly formal, never folksy.

**Person & address.** Always **second-person singular informal** (`tu` / `teu` / `els teus`). The product talks to one person at a time and is friendly about it. Never "vostè", never "vosaltres".

> "Gestiona el contingut dels **teus** llocs web."
> "Has oblidat la clau?"
> "Entrar a l'espai de treball"

**Tone.** Warm, refined, slightly affectionate. Carma is "the CMS that loves your website" — that romanticism is baked in. But it's not saccharine; it's confident. Like a good maître d'.

**Casing.**
- **Headings** — Sentence case in body (`"Els meus Llocs"`, `"Crear un nou Lloc"`). Note that domain nouns (Lloc, Article, Usuari) are often Title-cased even mid-sentence — they're product entities.
- **Eyebrow labels** — `UPPERCASE WITH WIDE TRACKING` (`tracking-widest`, `0.1em`). Used above inputs, in toolbars, as section markers: `NOM DEL LLOC`, `ASSIGNAR CLIENTS`, `CORREU ELECTRÒNIC`.
- **Buttons** — Sentence case, occasionally with sentence punctuation (`"Entrar a l'espai de treball"`). Action verbs first.
- **Status pills** — `UPPERCASE` (`PUBLICAT`, `ESBORRANY`).

**Punctuation & special characters.**
- Catalan apostrophe `'` (curly), Catalan middle-dot `·` in `cancel·lar`.
- The `·` middle-dot is also Carma's favorite **separator** in stats lines (`"Pàgina 1 de 12 · 142 articles"`).
- Em-dash `—` used in code comments and occasionally inline.
- Ellipsis is real `…`, not three dots.

**Emoji.**
- Never in chrome / UI.
- Used **only** in the four built-in editor callout variants: 💡 info, ✅ success, ⚠️ warning, 🚫 danger.
- Flag glyphs (🇬🇧 🇪🇸 🇦🇩) appear in the language switcher only.

**Vocabulary (Catalan ⇄ English).**
| Catalan | Translation | Meaning |
|---|---|---|
| Lloc | Site | A tenant's website |
| Article | Article / Post | A blog post |
| Esborrany | Draft | Unpublished |
| Publicat | Published | Live |
| Panell de control | Control panel | The dashboard |
| Espai de treball | Workspace | The dashboard, again — used in CTAs |
| Daurat | Golden | The brand color name |
| Premium | Premium | Loanword — used unironically |
| Cap … encara | "No … yet" | Empty-state phrasing |
| Has oblidat la clau? | "Forgot the key?" | Carma's flavor of "Forgot password?" |

**Sample microcopy.**
- Loading: just a spinner — no "Loading…" text.
- Empty (no sites): *"Cap lloc web creat — Afegeix el teu primer lloc per començar a generar contingut."*
- Empty (no posts): *"Cap article encara — Crea el primer article per a {site}."*
- Confirm destructive: *"Segur que vols eliminar «{title}»? Aquesta acció no es pot desfer."*
- Success toast: *"Article eliminat"* (terse — the past participle does the work).
- Error toast: terse + neutral. Never blames the user.

---

## Visual foundations

The look is **"warm premium"** — a private-bank-website feeling rather than a SaaS feeling. Editorial calm, not hustle.

### Color

The entire palette is one gold ramp + neutrals.

- **`--carma-500: #d4af37`** is *the* corporate gold. Everything ladders to it.
- **Buttons** never use flat gold — always the signature horizontal gradient `from-carma-600 via-carma-500 to-carma-600` (and inverse on hover). This gives the surface a subtle metallic shimmer.
- **Tints** (`carma-50`/`carma-100`) are workhorses: active sidebar items, selected list rows, badge backgrounds, gradient halos at 10–20% alpha.
- **Page surface** is `#F9F8F6` — not white. Cards are white-on-warm.
- **Neutrals are stone-tinted** (Tailwind `neutral`). Cool grays would clash.
- **Semantic colors** appear sparingly: green for "published"/success toasts, red for destructive confirms, never blue.

### Type

- **Plus Jakarta Sans** for everything (`next/font/google` in production).
- **Extrabold (800)** is the signature display weight. Page titles, modal titles, sidebar wordmark — all extrabold, tracking-tight.
- **Medium (500)** for body and inputs.
- **Bold (700) / extrabold (800)** for buttons and the all-caps eyebrows.
- Body in chrome is small — **12–14px** is the norm. Page titles **24–30px**. The editor body is **17px / line-height 1.8** for reading.
- Tracking is **tight** at display sizes (`-0.02em`), **widest** for eyebrows (`0.1em`).

### Spacing & layout

- Tailwind's 4-px grid throughout. Common increments: `gap-2/3/4/6`, `px-4 py-3.5` (inputs), `p-7` / `p-10` / `p-12` (cards/modals).
- Sidebar fixed at **w-64 (256px)** on `lg+`; below that, a slide-in drawer.
- Card grids use `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`.
- Modals max-width `max-w-md` (default) / `max-w-2xl` (lg) / `max-w-5xl` (xl).
- Empty states are **big** — `py-20` to `py-24`, oversized centerpiece icon.

### Radii

Carma's signature is **very large corner radii** on hero surfaces:
- `rounded-xl` (12px) — inputs, small buttons.
- `rounded-2xl` (16px) — most cards, toasts, modals (default).
- `rounded-3xl` (24px) — site cards on the dashboard grid.
- `rounded-[2rem]` / `rounded-[2.5rem]` — the login card, large modals, empty states. This oversized radius is the brand's most distinctive shape.
- `rounded-full` — status pills, the close-X button, avatar slots.

### Borders

- Hairline `1px` everywhere — `border-neutral-100` (almost invisible) for default cards, `border-neutral-200` for inputs.
- Active/selected items pick up `border-carma-200` or `border-carma-400` + a `ring-2 ring-carma-200`.
- Dashed borders (`border-dashed border-neutral-300`) appear in empty-state shells inside content areas.
- The TipTap blockquote gets a **3px solid gold left border** — the only "thick" border anywhere.

### Shadows

The **`shadow-premium`** is the brand's signature shadow:

```css
box-shadow: 0 30px 70px -10px rgba(0, 0, 0, 0.06),
            0 1px 3px      rgba(0, 0, 0, 0.01);
```

It's huge, faint, and offset way down — gives the floating-on-marble feel. Other tiers:
- `shadow-sm` — table rows, secondary buttons.
- `shadow-card` / `shadow-hover` — card hover (`0 18px 40px -18px rgba(0,0,0,0.22)`).
- **`shadow-gold`** — for the primary button only: `0 10px 30px -6px rgba(212, 175, 55, 0.30)`. The gradient + this halo is the highest-energy element on any screen.
- Toast shadow is heavier (`0 24px 60px -12px rgba(0,0,0,0.28)`) so it floats above content.

### Backgrounds

- Default page: flat `#F9F8F6`.
- **No full-bleed photography. No illustrations. No textures.** Carma is unornamented.
- The one "atmospheric" device: **gold halos** — giant blurred circles (`w-[500-600px]`, `blur-[140-160px]`, `bg-carma-300/10`–`carma-400/20`) tucked off-screen behind hero cards (login, empty states). They glow through the layout without ever being seen as shapes.
- Sidebar is plain white with a hint of a right-edge shadow.

### Gradients

Only two:
1. **The primary-button gradient** (`carma-600 → carma-500 → carma-600`) plus its inverse on hover. Horizontal.
2. **The active sidebar indicator** — a 1px wide vertical bar `from-carma-400 to-carma-600`, rounded-r-full.

Nothing else uses gradients. **Never** introduce bluish-purple gradients, vivid hero gradients, or "abstract" gradient blobs.

### Hover / press / focus

| State | Treatment |
|---|---|
| Hover (primary button) | Gradient flips lighter (`carma-500 → carma-400`) |
| Hover (secondary / list item) | Background shifts to `bg-neutral-50` or `bg-carma-50/50`; text darkens |
| Hover (card) | Lift: `-translate-y-1`, swap to `shadow-hover`, sometimes top accent bar fades in |
| Press | Universal `transform: scale(0.985)` |
| Focus-visible | 2px gold outline @ 55% alpha + 2px offset (set globally) |
| Disabled | `opacity-50 cursor-not-allowed`, no other state |

### Animation

- **Smooth, soft, restrained.** Carma's signature ease is `cubic-bezier(0.16, 1, 0.3, 1)` (decelerate-out) — used for modal entrances and toast slide-ins.
- **Durations** stay short: 150–400ms. Long, theatrical animations are off-brand.
- **Loading spinner** (`carma-spin`) always rotates, even under `prefers-reduced-motion` (it conveys state).
- Otherwise, all animation respects `prefers-reduced-motion` by reducing to 0.01ms.
- Common entry: `animate-in fade-in slide-in-from-top-1 duration-200` for inline-appearing toolbars.
- No bounces, no spring, no parallax, no scroll-triggered.

### Transparency & blur

- **Modal backdrop:** `bg-neutral-900/40 backdrop-blur-sm`. Always.
- **Mobile nav top bar:** `bg-white/90 backdrop-blur`.
- **Atmospheric halos:** see "Backgrounds" — blur values 80–160px on giant gold circles.
- That's it. No frosted cards, no underlayer blur on lists.

### Imagery

Carma has **almost no first-party imagery**. The product is text, gold, and white. The one exception is **user-uploaded article images** inside the editor, which get `rounded-xl` + a soft drop shadow `0 12px 32px -12px rgba(0,0,0,0.18)`. If you do introduce photography elsewhere, keep it **warm-toned** (matches the gold), high-contrast, editorial.

### Fixed elements

- Desktop sidebar is `fixed` left, full-height, with its own scroll for the site list (`max-h-[42vh] overflow-y-auto`).
- Mobile top bar is `sticky top-0 z-30`.
- Toasts stack `fixed top-6 right-6 z-[200]`.
- Modals `fixed inset-0 z-[100] flex items-center justify-center`.

### Density

Medium-low. Carma is a writer's tool, not a dashboard tool. Generous whitespace, fewer items per row (3-up max on grids), no dense tables. The Users tab is the *only* place a real table appears.

---

## Iconography

**System:** [`lucide-react`](https://lucide.dev), imported per-component (no icon font, no sprite, no central registry). Used at sizes `w-3 / w-3.5 / w-4 / w-5 / w-6` (12–24px) — typically 16px. Default stroke. Color matches surrounding text (`text-neutral-400`, `text-carma-500`, etc.).

**Active vocabulary** (every icon actually used in the source):

| Icon | Meaning |
|---|---|
| `Globe` | A site / tenant |
| `FileText` | An article / draft |
| `Users` | Clients management |
| `LayoutDashboard` | Superadmin home |
| `Settings` | Settings |
| `Plus`, `X` | Add / dismiss |
| `Search` | Inline search inputs |
| `ArrowRight` | Forward CTA, "Entrar" button |
| `Loader2` | Loading (always `animate-spin`) |
| `Check`, `CheckCircle2` | Selection, success states, "Publicat" pill |
| `Pencil`, `Trash2` | Edit / delete row actions |
| `Send` | Bulk publish |
| `Eye`, `EyeOff` | Toggle published visibility |
| `ExternalLink` | "View on public site" |
| `LogOut` | Sign out (turns red on hover) |
| `Menu` | Mobile menu open |
| `AlertTriangle` | Confirm dialog header |
| `Upload` | Importer button |
| `ShieldAlert` | Permission-denied empty state |
| `ChevronLeft/Right` | Pagination, carousel arrows |
| `XCircle`, `Info` | Toast pill icons (error / info) |

**Emoji** — only in TipTap editor callouts (💡✅⚠️🚫). Never in chrome.
**Flags** — only in the locale switcher (🇬🇧 🇪🇸 🇦🇩 — Catalan uses the Andorra flag, the only nation-flag for Catalan).
**Custom SVGs** — none. The repo's `public/` folder ships only the default Next.js placeholders.

**To add an icon:** prefer a Lucide one. If Lucide doesn't have it, use the closest match and note in your PR. Don't draw bespoke SVGs unless they're a unique product mark.

---

## Working with this skill

Read [SKILL.md](./SKILL.md) for invocation guidelines if you're an agent. For humans: drop the colors/type CSS into your project, pull the components from `ui_kits/dashboard/`, and use the patterns above. The source repo is the ground truth — when in doubt, read the real component.

### Substitutions to flag
- **Plus Jakarta Sans** is loaded from Google Fonts' CDN here. If you need offline support, drop the variable woff2 into `fonts/`. (See `fonts/README.md`.)
- **Lucide icons** are linked via the `lucide-react`-equivalent CDN in HTML demos (`https://unpkg.com/lucide-static/...`) — the production app uses the React package. Visually identical.
