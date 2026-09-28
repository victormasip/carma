// W7 — the editor's UI styles, carried into the canvas without touching the blog.
//
// The canvas iframe holds two things: the blog (the article page's own stylesheet)
// and the editor's UI (menus, the block handle, block controls), which is written
// in the app's Tailwind classes. Those classes do not exist in the iframe, and
// loading the app's whole stylesheet there would let its preflight and globals
// reach the blog. So the UI rules are COPIED from the app's live sheets and
// confined to the UI's own roots with `@scope` — `#carma-ui` (menus, handle) and
// `[data-carma-ui]` (controls inside a block) — in a layer declared after the
// blog's, so a block's controls win over blog rules and nothing else can.
//
// Custom properties are copied as their COMPUTED values from the app's root, so
// the UI follows the app's light/dark mode while the page under it keeps the
// blog's ground. Names in the blog's own namespace (`--ct-*`) are never copied.

/** Tailwind's layers the UI needs: preflight (scoped), components, utilities. */
const UI_LAYERS = new Set(['base', 'components', 'utilities'])

/** Unlayered editor-UI rules in globals.css (block controls, not block looks). */
const EDITOR_UI = /carma-(gallery-(editor|add|empty|remove|zoom)|carousel|cta-(controls|href|align|block)|embed-(editor|fallback|frame)|toc-(editor|empty|head))/

export const UI_SCOPE = '#carma-ui, [data-carma-ui]'

function collect(rules: CSSRuleList, win: Window, out: { scoped: string[]; global: string[] }): void {
  const w = win as unknown as {
    CSSLayerBlockRule: typeof CSSLayerBlockRule
    CSSStyleRule: typeof CSSStyleRule
    CSSKeyframesRule: typeof CSSKeyframesRule
    CSSFontFaceRule: typeof CSSFontFaceRule
    CSSPropertyRule?: { new (): CSSRule; prototype: CSSRule }
  }
  for (const r of Array.from(rules)) {
    if (r instanceof w.CSSLayerBlockRule) {
      if (UI_LAYERS.has(r.name)) for (const inner of Array.from(r.cssRules)) out.scoped.push(inner.cssText)
      continue
    }
    if (r instanceof w.CSSKeyframesRule || r instanceof w.CSSFontFaceRule || (w.CSSPropertyRule && r instanceof w.CSSPropertyRule)) {
      out.global.push(r.cssText)
      continue
    }
    if (r instanceof w.CSSStyleRule && EDITOR_UI.test(r.selectorText) && !/\[data-theme/.test(r.selectorText)) {
      out.scoped.push(r.cssText)
    }
  }
}

/** The app's UI rules as one stylesheet for the canvas (see the header). */
export function uiStylesheet(from: Document): string {
  const win = from.defaultView
  if (!win) return ''
  const out = { scoped: [] as string[], global: [] as string[] }
  for (const sheet of Array.from(from.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue } // a cross-origin sheet: not ours
    collect(rules, win, out)
  }
  return `${out.global.join('\n')}\n@layer carma-ui{@scope (${UI_SCOPE}){\n${out.scoped.join('\n')}\n}}`
}

/** The app root's custom properties, resolved, onto the canvas root. */
export function copyUiVariables(from: Document, to: Document): void {
  const cs = from.defaultView?.getComputedStyle(from.documentElement)
  if (!cs) return
  const root = to.documentElement
  for (let i = 0; i < cs.length; i++) {
    const name = cs[i]!
    if (!name.startsWith('--') || name.startsWith('--ct-')) continue
    root.style.setProperty(name, cs.getPropertyValue(name))
  }
}
