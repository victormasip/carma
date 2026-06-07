# Fonts

Carma uses **Plus Jakarta Sans** — a humanist sans designed by Tokotype, served via `next/font/google` in production (`src/app/layout.tsx`).

This design system loads it from Google Fonts' CDN with a `@font-face` fallback in `../colors_and_type.css`. If you want the file locally:

1. Download from <https://fonts.google.com/specimen/Plus+Jakarta+Sans> (the variable font, weight 200–800).
2. Drop the `.woff2` here as `PlusJakartaSans-VariableFont_wght.woff2`.

Weights actively used in Carma:
- **500** — body, labels, microcopy
- **600 / 700** — buttons, sidebar items, table headers
- **800 / extrabold** — page titles, the `Carma.` wordmark, modal titles, eyebrow labels

No italic in chrome; italics only appear inside the TipTap article body (`<em>` and `<blockquote>`).
