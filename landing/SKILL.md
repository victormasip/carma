---
name: carma-design
description: Use this skill to generate well-branded interfaces and assets for Carma — a Catalan-first premium content-management platform — for production code or throwaway prototypes/mocks/decks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files. The full source repository is at <https://github.com/victormasip/carma> — open it if you need implementation detail beyond what this skill captures.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out of this skill and create static HTML files for the user to view. The most useful starting points:

- `colors_and_type.css` — drop-in CSS variables for every token in the system.
- `ui_kits/dashboard/` — JSX components (Sidebar, SiteCard, PostCard, Toast, Modal, Buttons, Inputs) and an `index.html` clickable prototype. Lift these directly.
- `assets/` — wordmarks and glyph mark in SVG.
- `preview/` — small specimen cards that show each foundation in isolation; helpful as a visual reference.

If working on production code, copy assets and read the rules in `README.md` to become an expert in designing with this brand. The repo uses Next.js 16 · React 19 · Tailwind v4 · Supabase · TipTap · `lucide-react`.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions (audience, surface, fidelity, whether to write in Catalan or English), and act as an expert designer who outputs HTML artifacts *or* production code, depending on the need.

**Non-negotiables when designing for Carma:**
- Warm off-white canvas (`#F9F8F6`) — never pure white pages.
- Gold (`#d4af37`) is the only accent. No blues, no purples, no rainbow gradients.
- Plus Jakarta Sans throughout. Extrabold for display, medium for body.
- Catalan microcopy first (informal "tu" form). English copy should *read like translated Catalan*.
- Generous corner radii (`rounded-2xl` to `rounded-[2.5rem]`) on hero surfaces.
- The signature `shadow-premium` (huge, faint) on floating cards.
- Lucide icons only. No emoji in chrome (only inside TipTap callouts).
- No illustrations, no photography, no textures. Atmospheric blurred gold halos are the one decorative device.
