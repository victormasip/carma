---
name: directive-status
description: The CTO 7-point directive (header/footer clone, images, real-time saves, lang detection, nav editing, UI/tabs, AI SEO article) — all landed 2026-06-02
metadata:
  type: project
---

The 7-point CTO directive for Carma. As of 2026-06-02 all 7 are landed; tsc/lint/build green. (See decision-log entry 35 in project_carma_context.md for the full write-up.)

1. **Header/Footer 1:1 replication** — SUPERSEDED by the 2026-06-02 PIVOT to RAW HTML INJECTION (see [[render-pipeline]]). The headless-browser + shadow-transplant approach described in older entries is DEAD; `BROWSER_RENDER_URL` is gone. Header/footer + the client `<head>` are now injected verbatim (light DOM) around the blog (which sits in a Shadow DOM).

2. **Image pipeline** — Editor uploads were done; the GAP was import re-hosting. Built `src/lib/scrape/rehost.ts` (`rehostImportedImages`) + wired into `src/app/api/import/articles/route.ts`. Fetches each external/scraped image (SSRF-guarded, ≤10MB, concurrency 4), uploads to the `post-media` bucket, rewrites `<img src>` + featured image, strips `srcset`. Best-effort: keeps the original URL on any failure. Uses the existing migration-013 bucket (no new migration).

3. **Real-time saves / no reload** — FIXED the `handleSave` bug in `PostEditorClient.tsx`: existing post → `updatePost` in place + "Desant…/Desat" flash on the Save button (`savedFlash` state), NO navigation; new post → `createPost` + `router.replace` to its edit URL ONCE (to obtain the id / avoid duplicate creates).

4. **Language detection** — Already strong (`src/lib/i18n/detect.ts`, franc-min). No change.

5. **Dynamic nav injection** — Built `src/lib/render/navEdit.ts` (pure; `extractNavLinks`/`applyNavLinks` + `navLinksFromRegion`/`regionWithNavLinks`) and `src/app/dashboard/sites/[id]/NavEditor.tsx` (add/edit/reorder/remove), mounted in `ThemeManager` as a `<details>` after the VisualChromeEditor. Edits the captured header/footer's primary nav link set while preserving the real markup + classes (clones the first link as the styling template). Consumes `extractedHeader/footer` + setters from ThemeStudioContext → autosaves.

6. **Typography + tabs** — (a) `globals.css`: added `html{font-size:16px}` + `body{font-size:1rem;line-height:1.6}` (the body had NO size/line-height before). (b) New `src/components/ui/SegmentedTabs.tsx` (Vercel/Linear sliding-pill, measured via useLayoutEffect+ResizeObserver, transform+width, motion-safe, role=tablist + arrow keys) applied to the editor drawer tabs; upgraded `src/components/ui/Tabs.tsx` (site-detail) to a sliding animated underline (same technique, same API). Theme-editor accordions left untouched (user veto, entry 31).

7. **Magic SEO Article** — Built `src/lib/writing/generate.ts` (`harvestSiteBrief` + `generateArticle`, Claude Opus 4.8, adaptive thinking, effort high, json_schema, cached system prompt, streamed finalMessage) + server action `generateSeoArticle(siteId,{url?,locale?})` in `posts.ts` + a prominent button in the editor's IA drawer tab that fills all fields in place (no reload). **Premium-gated to superadmin** (same tier as AI translate/coach — expensive Opus call). Env overrides: `WRITING_GEN_MODEL`, `WRITING_GEN_EFFORT`.

**Not runtime-tested** (needs Supabase + ANTHROPIC_API_KEY + the 013 bucket): the re-host pipeline, the generator, and browser behavior of the new tabs/nav UI. Static gate (tsc/lint/build) passed.
