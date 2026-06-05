---
name: quality-gate
description: Carma's definition-of-done gate (tsc + lint + build) and the commands to run it
metadata:
  type: project
---

Carma's established quality gate (from its own decision log, every session ends with this):

1. `npx tsc --noEmit` — must be CLEAN (no errors).
2. `npm run lint` — must be 0 warnings (eslint .). Silent output = pass.
3. `npm run build` — `next build` (Turbopack) must succeed (exit 0).

On Windows/PowerShell, run via the Bash tool. tsc emits a harmless `DEP0190` child-process deprecation warning — ignore it.

Runtime caveat: the app needs a live Supabase + `ANTHROPIC_API_KEY` (and `BROWSER_RENDER_URL` for full chrome fidelity) to exercise the render/theme/editor in a browser. CI-style static gate is verifiable locally; browser behavior is NOT. Always state tested-vs-untested honestly in the final report.

As of 2026-06-02 the in-flight tree passed all three gates at the START of the session (before my changes) — so any breakage I introduce is mine to fix.
