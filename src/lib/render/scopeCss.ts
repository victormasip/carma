// Namespace scoper for the SCOPED starter-template chrome (header / footer).
//
// Used only for the "start from a starter template" path (src/lib/render/
// templates.ts), whose regions are self-contained `{ html, css }`. (The captured
// 1:1 clone uses raw HTML injection instead — see render/theme.ts.) This scoper
// deterministically FORCES every selector under the region's
// `[data-carma-chrome="…"]` attribute, so a stray `a{}` or `*{}` can never escape
// into our page. Combined with `all:initial` on the wrapper (blocks inbound
// inheritance) this guarantees zero collisions in BOTH directions without iframes
// or Shadow DOM.

export type ChromeRegion = 'header' | 'footer'

function nsSelector(region: ChromeRegion): string {
  return `[data-carma-chrome="${region}"]`
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// ─── Brace-aware rule walker ───────────────────────────────────────────────

type Rule = { prelude: string; body: string }

function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  let depth = 0
  let start = 0
  let preludeEnd = -1
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') {
      if (depth === 0) preludeEnd = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && preludeEnd >= 0) {
        rules.push({
          prelude: css.slice(start, preludeEnd).trim(),
          body: css.slice(preludeEnd + 1, i),
        })
        start = i + 1
        preludeEnd = -1
      }
    }
  }
  return rules
}

// Split a selector list on top-level commas only (ignore commas inside
// :is()/:not()/:where() and [attr="a,b"]).
function splitSelectorList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let inStr: string | null = null
  let buf = ''
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (inStr) {
      buf += c
      if (c === inStr && list[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") { inStr = c; buf += c; continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

// Map a single selector under the namespace. Document-root selectors
// (html/body/:root) collapse onto the wrapper itself; everything else becomes
// a descendant of it.
const ROOT_RE = /^\s*(html|body|:root)(?=$|[\s.#\[:,>+~])/i

function scopeSelector(sel: string, ns: string): string {
  const s = sel.trim()
  if (!s) return ''
  // Already namespaced by the model (chrome or card) — leave it.
  if (s.includes('[data-carma-')) return s
  if (ROOT_RE.test(s)) {
    const rest = s.replace(ROOT_RE, '').trim()
    return rest ? `${ns}${rest.startsWith(':') ? '' : ' '}${rest}` : ns
  }
  return `${ns} ${s}`
}

function scopePrelude(prelude: string, ns: string): string {
  return splitSelectorList(prelude)
    .map(sel => scopeSelector(sel, ns))
    .filter(Boolean)
    .join(',')
}

const NESTED_ATRULES = new Set(['media', 'supports', 'container', 'layer', 'scope'])

function scopeRules(css: string, ns: string): string {
  return parseRules(css)
    .map(({ prelude, body }) => {
      if (prelude.startsWith('@')) {
        const kind = prelude.slice(1).match(/^[a-z-]+/i)?.[0]?.toLowerCase() ?? ''
        if (NESTED_ATRULES.has(kind)) return `${prelude}{${scopeRules(body, ns)}}`
        // @keyframes / @font-face / @page / @property / @font-feature-values:
        // global by nature — keep verbatim.
        return `${prelude}{${body}}`
      }
      const sel = scopePrelude(prelude, ns)
      return sel ? `${sel}{${body}}` : ''
    })
    .join('\n')
}

/**
 * Force every rule in `css` under the region namespace and prepend an
 * isolation reset. The returned stylesheet is safe to inline anywhere on the
 * render page — it cannot affect a single node outside its wrapper.
 */
function scopeUnder(css: string, ns: string): string {
  const reset =
    `${ns}{all:initial;display:block;box-sizing:border-box;max-width:100%}\n` +
    `${ns} *,${ns} *::before,${ns} *::after{box-sizing:border-box}\n` +
    // Low-specificity responsive baseline (no !important): any explicit rule the
    // model emits still wins, but images never blow out a mobile viewport.
    `${ns} img,${ns} svg{max-width:100%;height:auto}`
  if (!css?.trim()) return reset
  const clean = stripComments(css)
    .replace(/@charset\s+[^;]+;/gi, '')
    .replace(/@import\s+[^;]+;/gi, '')
  return `${reset}\n${scopeRules(clean, ns)}`
}

export function scopeChromeCss(css: string, region: ChromeRegion): string {
  return scopeUnder(css, nsSelector(region))
}
