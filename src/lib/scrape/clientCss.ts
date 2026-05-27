// Client CSS pipeline for the Shadow-DOM chrome.
//
// We inject the client's REAL stylesheets inside a shadow root (perfect, native
// CSS encapsulation — not an iframe). The only transform needed is to make the
// document-root selectors work inside a shadow tree, where `:root`/`html`/`body`
// never match: we replicate the original ancestry as `<div class="x-html"><div
// class="x-body">` and remap those selectors to the wrapper classes. Everything
// else (classes, ids, *, descendant rules, custom properties) then applies
// exactly as on the original page. All url()/@import are absolutised so assets
// and font files resolve.

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function absolutiseUrl(url: string | undefined | null, base: URL): string {
  const u = (url ?? '').trim().replace(/^["']|["']$/g, '')
  if (!u || /^(data:|mailto:|tel:|#|https?:)/i.test(u)) return u
  if (u.startsWith('//')) return `${base.protocol}${u}`
  try { return new URL(u, base).toString() } catch { return u }
}

export function absolutiseCssUrls(css: string, base: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, q: string, url: string) => {
    const abs = absolutiseUrl(url, base)
    return `url(${q}${abs}${q})`
  })
}

/** Pull @import statements out of a sheet, returning their absolute URLs and the
 *  CSS with the @imports removed (they're fetched + inlined separately). */
export function splitImports(css: string, base: URL): { imports: string[]; rest: string } {
  const imports: string[] = []
  const rest = css.replace(
    /@import\s+(?:url\(\s*)?(['"]?)([^'")]+)\1\s*\)?\s*[^;]*;/gi,
    (_m, _q: string, url: string) => {
      const abs = absolutiseUrl(url, base)
      if (abs && /^https?:/i.test(abs)) imports.push(abs)
      return ''
    },
  )
  return { imports, rest }
}

// ─── Comment / whitespace ───────────────────────────────────────────────────

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// ─── Selector remap (the core trick) ──────────────────────────────────────────

// Match `html`, `body` or `:root` ONLY where they are a type selector (not part
// of a class/id/attr/string): preceded by start or a combinator/comma/open-paren
// and followed by end or a combinator/class/id/attr/pseudo/comma.
const ROOT_SELECTOR_RE = /(^|[\s,>+~(])(html|body|:root)(?=$|[\s.#\[:,>+~)])/gi

function remapSelectorList(selectorList: string): string {
  return selectorList.replace(ROOT_SELECTOR_RE, (_m, pre: string, kw: string) => {
    const k = kw.toLowerCase()
    // html and :root both map to the outer wrapper; body to the inner one.
    return pre + (k === 'body' ? '.x-body' : '.x-html')
  })
}

// ─── Rule walking (brace-depth aware) ─────────────────────────────────────────

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
        rules.push({ prelude: css.slice(start, preludeEnd).trim(), body: css.slice(preludeEnd + 1, i) })
        start = i + 1
        preludeEnd = -1
      }
    }
  }
  return rules
}

function scopeRules(css: string): string {
  return parseRules(css)
    .map(({ prelude, body }) => {
      if (prelude.startsWith('@')) {
        const kind = prelude.slice(1).match(/^[a-z-]+/i)?.[0]?.toLowerCase() ?? ''
        if (['media', 'supports', 'container', 'layer', 'scope'].includes(kind)) {
          return `${prelude}{${scopeRules(body)}}`
        }
        // @keyframes / @font-face / @page / @font-feature-values: keep verbatim.
        return `${prelude}{${body}}`
      }
      const sel = remapSelectorList(prelude)
      return sel ? `${sel}{${body}}` : ''
    })
    .join('')
}

/** Remap document-root selectors so the client CSS works inside the shadow root.
 *  url()/@import must already be absolutised. */
export function scopeClientCss(css: string): string {
  if (!css?.trim()) return ''
  const clean = stripComments(css)
    .replace(/@charset\s+[^;]+;/gi, '')
    .replace(/@import\s+[^;]+;/gi, '') // imports were inlined upstream
  return scopeRules(clean)
}
