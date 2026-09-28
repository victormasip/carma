# W7 — The writing canvas is the blog

**Status:** APPROVED 2026-09-28 (iframe canvas · blog ground · Sonnet 5 live). **W7.0 ✅ · W7.1 ✅ · W7.2 ✅**
on branch `w7/editor-canvas` — see §8 for what was measured. W7.3–W7.5 open.
**Scope:** the article editor (`/dashboard/sites/[id]/posts/*`), then the Studio's inline body editor.
**Premise:** since W6, every blog is dressed by its own Genome — typefaces, accent, ground,
spacing, drop caps, lanes, ornaments. The person who writes that blog still types into a
Carma-branded page that looks like none of it.

---

## 0. What the founder is asked to approve

1. **The canvas is an iframe that loads the blog's own article stylesheet** — the same
   `buildBlogCss()` call the published article uses, fed by the same resolved theme and the
   same Genome CSS. The editor stops imitating the blog; it renders it. (§3)
2. **One resolver for "the theme a post renders in"**, shared by `/render` and the editor, so
   they cannot drift. (§3.1)
3. **Fidelity is a gate, not a claim:** `test:editor-fidelity` compares the editor canvas and
   the published article in Chrome, property by property, the way `test:cascade` proved the
   W5 cascade surgery (30,408 comparisons). (§4)
4. **A two-day spike first (W7.0)**, with a named fallback, because ProseMirror inside an
   iframe is the one unproven piece. (§5)

---

## 1. Audit — what the writer sees today

| # | Finding | Evidence |
|---|---|---|
| 1 | **The editor loads no theme at all.** The page selects the site, the post and the locales; `site_themes` and the active genome are never read. | `posts/[postId]/edit/page.tsx` · `posts/new/page.tsx` |
| 2 | **The canvas is a hand-maintained copy of the blog's prose, and only half a copy.** `globals.css` claims "measure, line-height, paragraph rhythm and the heading ladder all MATCH the public render". Measure (70ch) and line-height (1.75) do; the typeface is `system-ui`, links, list markers, the caret and the quote border are **Carma gold** (`--c-accent`), and the heading sizes are fixed rem values rather than the Genome's scale. The render's prose moved to `blogCss.ts` in W5; this copy did not follow. | `globals.css` — 48 `.carma-editor` prose rules |
| 3 | **The title is an app heading.** `TitleInput` is Tailwind `text-4xl/5xl font-bold` in the app face. The published title uses `--ct-font-heading`, the Genome's heading case (upper / sentence / title — title only under `:lang(en)`), weight and tracking. | `TitleInput.tsx:90` · `theme.ts` `.carma-article-title` |
| 4 | **Blocks look different while writing.** The CTA paints `var(--c-accent)` (gold) in the editor and the site's accent on the blog; the gallery's selection ring is hard-coded `#f5bc00`; the editor's block CSS carries 56 hard-coded hex colours, 29 of them dark-mode flips — callouts repaint under the **app's** dark mode, which the blog never does. | `globals.css` block rules · `CtaButton.tsx` · `blogCss.ts` (6 `.carma-button` rules) |
| 5 | **Everything the Genome adds is invisible while writing.** Drop caps (`initial-letter`), oversize quote marks, `⁂` and gradient dividers, wide/full article lanes, link underline offsets, oldstyle figures, heading case — all compiled into `genome_css`, which the editor never loads. Verne's writer composes in system sans; Verne's reader reads Lora with a raised drop cap on tinted paper. | `compile.ts` layers · W6 render join (`loadTheme`) |
| 6 | **The ground follows the app, not the blog.** App dark mode repaints the canvas dark; a paper blog's writer writes on ink, and an ink blog's writer (NOIR, every Reimaginat) writes on white. | `globals.css [data-theme="dark"]` |
| 7 | **Two editors.** The full post editor, and the Studio's inline body editor (TipTap swapped over the `/render` iframe). The Studio one already edits inside the real render — the precedent this plan generalises. | `PostEditorClient.tsx` (2,520 lines) · `studio/StudioStage.tsx` |
| 8 | **Language-dependent type.** The Genome's title case applies under `:lang(en)` only (W5). A canvas without the edited locale's `lang` renders the wrong case. | `blogCss.ts` / `compile.ts` |

**Why this matters now:** until W6 the editor and the blog were both "Carma-ish", so the gap
read as polish. With generated designs the gap is the product contradicting itself: we show
a visitor their blog as a Jules Verne expedition notebook, then hand them a grey Notion page
to fill it.

---

## 2. The principle

**Do not imitate the blog; render it.** W0 stopped maintaining eight templates by hand and
made them genomes the compiler reproduces exactly. W7 does the same for the editor: the
canvas's typography comes from the one function that styles the published article, so it
cannot drift, and a Genome change reaches the writer with no editor code touched.

The editor keeps its own chrome (top bar, drawer, menus, block handles, AI tools). Only the
**page being written on** becomes the blog.

---

## 3. Architecture

### 3.1 One resolver — `resolveRenderTheme(admin, siteId)`

Today the render builds its theme in three steps (`loadTheme` → W6's `withGenomeCss` →
`themeWithTokens`). They become one exported function returning
`{ theme, tokens, fontLinks, genomeCss, defaultLocale }`, called by `/render` and by both
editor pages. Cached under the site tag, like the render, so a Studio save or a Genome change
expires both at once. A site with no theme resolves to `DEFAULT_TOKENS` through the same path:
there is no "unthemed editor" branch to maintain.

### 3.2 One stylesheet — `buildCanvasCss(resolved, modulesCss)`

```
buildBlogCss(tokens, { host: 'page', overrides: articleOverrides(genomeCss, modulesCss) })
  + layer('editor', EDITOR_AFFORDANCES)
```

- The first line is **exactly** what the article page ships — the seven W5 layers, the
  Genome in `overrides`, the modules' CSS so a Key Takeaways or Pull Quote looks as published.
- `carma.editor` is an eighth layer **after** `overrides`, holding only what editing needs and
  no reader sees: caret and selection in `--ct-accent`, placeholders, node-selection outlines,
  the drop indicator. It is forbidden (by the gate, §4) from touching typography, colour or
  spacing of content.

### 3.3 The canvas — a same-origin iframe

The canvas document is the article page's own skeleton, so every blog selector matches as-is:

```html
<html lang="{edited locale}">
  <head>
    <link rel="preconnect" …>  <link rel="stylesheet" href="{genome fonts}">
    <style>{buildCanvasCss(...)}</style>
  </head>
  <body>
    <main class="carma-root carma-main">
      <article class="carma-article">
        <header class="carma-article-header">
          <h1 class="carma-article-title">{editable title}</h1>
          <p class="carma-article-lede">{editable excerpt}</p>
        </header>
        <figure class="carma-article-image-wrap">{featured image}</figure>
        <div class="carma-article-content">{ProseMirror}</div>
      </article>
    </main>
  </body>
</html>
```

- **Tokens need no rewriting.** `blogCss.ts` binds them to `:root,:host`, so the identical
  stylesheet works in the iframe's `:root` (and would in a shadow root).
- **React stays one tree.** The TipTap `Editor` lives in `PostEditorClient` as today;
  `EditorContent`, the bubble/floating menus and the block handle are portaled into the
  iframe body. React (19 here) attaches its event listeners to portal containers as well as
  the root, so node views and menus should receive events inside the iframe — the spike's
  first check; floating-ui computes in one coordinate space
  because the menus live in the same document as the selection. The menus bring a small,
  class-scoped stylesheet — not Tailwind's preflight, which would reset the blog.
- **The ground is the blog's.** The canvas paints `--ct-bg` whatever the app theme is; the
  chrome around it follows the app's light/dark mode.
- **Device preview comes free.** The iframe width is the viewport the blog's media queries
  see, so a Desktop / Phone toggle is a width change, not a second renderer.
- **Keyboard.** Parent-level shortcuts (⌘K palette, ⌘S, focus mode) are also registered on
  the iframe document — key events do not cross the frame boundary.

**Why an iframe, and not the alternatives**

| | Iframe (proposed) | Shadow root | Scoped light DOM |
|---|---|---|---|
| Same CSS as the blog, unmodified | ✅ | ✅ | ❌ selectors re-scoped, `:root` rewritten |
| Media queries see the canvas width | ✅ (phone preview free) | ❌ app viewport | ❌ app viewport |
| App CSS cannot leak in, blog CSS cannot leak out | ✅ | ✅ | ⚠️ layer ordering against `globals.css` |
| ProseMirror support | ✅ documented (`view.root`) | ⚠️ selection APIs differ in Safari/Firefox shadow trees | ✅ |
| Cost | Portal + event plumbing | Selection bugs we do not control | Permanent CSS translation layer |

WordPress moved its block editor into an iframe for the same reason: to apply a theme's
styles to the writing canvas exactly, without the admin's CSS in the way.

### 3.4 Blocks — one markup, editing affordances on top

Each node view (Callout, CTA, Gallery, Figure, Embed, Columns, Toggle, TOC) renders the
**same DOM as its `renderHTML`** — the markup the blog receives — with its controls in
`contenteditable="false"` overlays marked `data-carma-ui`. Their look then comes from
`blogCss.ts`, and the editor-only block CSS in `globals.css` (the gold CTA, the hard-coded
rings, the dark-mode flips) is deleted.

### 3.5 What does not change

The saved HTML (`content.html`), autosave, the i18n remount and caret restore, the AI
rewrite, the slash menu, the paste sanitiser, the SEO drawer. W7 changes what the writer
**sees**, never what is **stored**.

---

## 4. Measured, not claimed — `test:editor-fidelity`

Built on `test:cascade`'s Chrome harness.

- **Fixture:** one article containing every block type, every inline mark, all heading
  levels, a figure, a gallery, a quote and a divider.
- **Designs:** the eight presets, NOIR (ink ground), Verne's Sonnet genomes (Lora, Fraunces,
  raised drop cap), and generated genomes covering every register, both lane systems and all
  heading cases — in `ca` and `en` (title case).
- **Comparison:** render the fixture (a) through the published article page and (b) through
  the editor canvas; compare the computed style of every element under the title and
  `.carma-article-content` — family, size, weight, line-height, tracking, colour, background,
  margins, transform, `initial-letter`, `::before`/`::after` content and colour, list
  markers — at 390px and 1280px.
- **Gate:** 100% identical, except elements marked `data-carma-ui` and the caret/selection.
  It is written first, fails on today's editor, and is the definition of done.

`test:perf` keeps holding the editor class budget; the canvas adds the blog stylesheet
(~22KB raw / ~5KB gzip, measured in W5) and the Genome's faces (≤4, enforced by the compiler).

---

## 5. Waves

| Wave | What | Exit criterion |
|---|---|---|
| **W7.0 spike** | TipTap + bubble/floating menus + block handle + one React node view + IME composition + paste/drop + undo, inside a same-origin iframe, in Chrome, Safari and Firefox. | All work, or the fallback is chosen: the scoped light-DOM canvas (`@scope` + a layer placed after Tailwind's), accepting app-viewport media queries. |
| **W7.1** | `resolveRenderTheme`, `buildCanvasCss`, the canvas document — and `test:editor-fidelity`, red. | The gate runs in CI and fails on today's editor, for the right reasons. |
| **W7.2** | The post editor on the canvas: body, title, lede and featured image in the blog's type; Desktop/Phone toggle; the `globals.css` prose copy deleted. | Gate green for body + title; `test:perf` holds. |
| **W7.3** | Blocks re-marked to their `renderHTML` with UI overlays; editor-only block CSS deleted. | Gate green for every block. |
| **W7.4** | The Studio's inline body editor uses the same canvas component. | One editor surface. |
| **W7.5** | Real browser E2E: write on a Genome site (Verne), publish, compare editor and published article screenshots. | Pixel diff within anti-aliasing tolerance. |

---

## 6. Risks

- **ProseMirror in an iframe on iOS Safari** (focus, selection handles, the keyboard) — the
  spike's first test.
- **Menus near the frame's edge** — portaled into the iframe and flipped by floating-ui
  within it.
- **Shortcuts and focus** — handled by registering on both documents; covered by E2E.
- **Font bytes on the editor route** — the Genome's ≤4 faces; the writer is looking at the
  product, and `test:vitals` records the cost.
- **Modules with scripts** (search, paywall) — the canvas loads their CSS, not their JS; a
  module's interactive state is not what the writer edits.

---

## 7. Decisions for the founder

1. **Approve the iframe canvas**, with the W7.0 spike and its named fallback.
2. **The canvas follows the blog's ground, not the app's dark mode.** A writer in dark mode on
   a paper blog writes on paper — it is the page their readers see.
3. **Callouts keep their fixed semantic palette** (blue/green/amber/red, as published today),
   or become Genome-aware — the latter is a design change to live blogs, proposed for W8.
4. **Order:** the post editor first, the Studio's inline editor in W7.4.

---

## 8. Results (2026-09-28)

### W7.0 — the spike: the iframe survived

`npm run test:canvas` drives the real editor on `/lab/canvas` in Chrome: **46/46**, stable
across repeated runs. Covered: typing, undo/redo, selection sync before the first transaction,
the bubble and floating menus (React portals + floating-ui across the frame), the slash menu,
a React node view's controls, the block handle, focus in/out, ⌘K/⌘S forwarding, a Word paste
through the sanitiser, IME composition, the caret inside a ligature, the frame's height (grow
**and** shrink), a 390px phone viewport, touch focus under iPhone emulation, and (W7.2) the
editable header. **Chrome only** — this machine has no WebKit or Firefox; iPhone emulation is
Chrome with a touch screen, not Safari. Real Safari/Firefox remain a W7.5 item.

What the spike found, all fixed:

- **The view must be born inside the frame.** ProseMirror binds `selectionchange` to the
  document the view is created in; TipTap gets an `element` owned by the iframe document.
- **The hydration race.** The srcdoc can finish loading before React attaches `onLoad`; the
  frame adopts an already-complete document on mount.
- **Two bugs the classic editor already had** (an A/B against `?mode=classic` showed them on
  both): node-view control clicks were lost when the mousedown moved the selection
  (`keepSelection`), and the block handle hid before the pointer could reach it (grace timer).
- **`@scope` roots never match their own classes in Chrome** (an implicit `:scope ` descendant
  is prefixed). UI controls inside a block are scoped from their parent with a limit that keeps
  the blog's siblings out: `@scope (#carma-ui, :has(> [data-carma-ui])) to (:scope:not(#carma-ui) > :not([data-carma-ui]))`.
- **A frame that could only grow.** `documentElement.scrollHeight` never drops below the frame's
  own height; the fit measures the body.
- **Test harness:** a background tab gets no rendering steps (no rAF, no ResizeObserver) and a
  puppeteer click there waits forever — every page is brought to the front before use.

### W7.1 — one resolver, one stylesheet, the gate

- `resolveRenderTheme(admin, siteId)` (`blogRender.ts`) — used by the three cached renders and
  by both editor pages.
- `articleCanvasParts` (`theme.ts`) returns the post's EXACT shadow stylesheet;
  `buildCanvasSpec` (`canvas.ts`) re-homes `:host` onto `body` and appends `@layer carma.editor`.
- `test:editor-fidelity`: 8 presets + 12 live Sonnet 5 genomes (Verne, dental, legal, beauty ×
  faithful/elevated/reimagined) + 3 in English = **23 designs × desktop and 390px**, 54
  properties per element plus `::before/::after/::first-letter/::marker` and the box.

| | classic editor (today) | the canvas |
|---|---|---|
| prose (460 block pairs) | 29,035 differing properties | **0** |
| header — title · lede · meta (46) | not on the page | **0** |
| callout · columns · toggle (converged) | 12,511 | **0** |
| **gate** | **FAIL — 41,546** | **PASS — 0** |
| CTA · figure (node views, W7.3) | reported | reported: 236 · 46 |

The gate caught two editor-layer rules copied from TipTap's base CSS that changed what the
reader sees: `pre{white-space:pre-wrap}` (a long code line wrapped instead of scrolling —
23px taller at 390px) and `white-space:break-spaces` (a line-final space took width, so a
Sonnet genome's paragraph broke at a different word at 390px). Both removed; the root keeps
`pre-wrap`, which lets that space hang as `normal` does.

### W7.2 — the post editor on the canvas

- `/posts/new` and `/posts/[id]/edit` build the canvas from the site's render theme.
- The title is the blog's `<h1 class="carma-article-title">`, plain-text editable (Enter →
  body, paste flattened, native undo); the excerpt is the `.carma-article-lede` (an empty lede
  shows only while the header is in use — at rest the page is the reader's); the meta line is
  the published one; the cover is `figure.carma-article-image-wrap` with its controls on top.
- Desktop / Mòbil toggle: the frame width IS the blog's viewport (`box-content`, so the border
  does not eat the 390px).
- The canvas's `lang` follows the language being edited (title case, hyphenation, spelling).
- The link/image/video URL bar is pinned to the viewport in canvas mode (rendered in place it
  sat below the whole article).
- `TitleInput.tsx` deleted — the `<textarea>` could never be the blog's `<h1>`.
- **Logged-in QA on the built app** (throwaway user + site with Verne-elevated tokens, created
  and deleted in the run): 12/12 — Lora title, Work Sans body, the blog's ground under app dark
  mode, title and body autosave from the canvas, a new article is created from the canvas
  title, the 390px toggle, no console errors.
- **Deviation from §5:** the `globals.css` prose copy is NOT deleted yet — the Studio's inline
  body editor still uses the classic surface until W7.4. It goes with W7.4.
- `test:perf` holds: the post editor routes are 33.8KB gzip of critical-path JS (budget 66KB).
