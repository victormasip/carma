---
name: feedback-react19-strict
description: This repo's ESLint hard-fails on reading/writing refs during render; use the useState prev-value pattern for prop→state sync
metadata:
  type: feedback
---

In this repo, the `react-hooks/refs` ESLint rule is a HARD ERROR (fails `npm run lint`, which is part of the definition-of-done gate). You cannot read OR write `someRef.current` during render.

**Why:** the project follows React-19-strict patterns throughout (decision-log entries 12/17/21: no setState-in-effect, no refs-in-render, imperative previews). The lint rule enforces it; a violation blocks the gate.

**How to apply:**
- The common "store previous prop value in a ref, compare in render to detect a change" pattern (`if (value !== lastRef.current) { lastRef.current = value; setX(...) }`) is BANNED here. Use the React-blessed *adjust-state-while-rendering* pattern with STATE instead: `const [last, setLast] = useState(value); if (value !== last) { setLast(value); setX(derive(value)) }`. State can be read/written during render; refs cannot. (See `NavEditor.tsx`, and `ThemeProvider.tsx` which uses `useSyncExternalStore` for the same goal.)
- Reading `ref.current` inside `useLayoutEffect` / `useEffect` / event handlers is fine (that's what `SegmentedTabs.tsx` and `Tabs.tsx` do to measure DOM geometry for the sliding indicator). Only RENDER-time ref access is forbidden.
- Measuring DOM layout into state via `useLayoutEffect` is the sanctioned exception to "no setState-in-effect" — you genuinely cannot compute pixel offsets during render.

Run `npm run lint` before declaring done — tsc passing is not sufficient to catch this.
