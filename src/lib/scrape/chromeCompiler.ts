// Chrome Compiler — capture-time critical-CSS extraction for the cloned header/footer.
//
// THE PROBLEM IT SOLVES (audit 2026-09-16)
// ────────────────────────────────────────
// Until now the render injected `extracted_head` verbatim into every blog page:
// the target's real stylesheets (cross-origin, render-blocking) AND its scripts.
// A cloned WordPress site therefore dragged jQuery, the page-builder CSS and
// 10–20 plugin stylesheets onto every Carma article. That — not query count — is
// why an empty blog felt slow. render/theme.ts:773 even said so out loud:
// "Scripts are KEPT — the client's own site JS powers its native menus."
//
// THE MODEL
// ─────────
// A site's chrome uses a few dozen rules out of tens of thousands. So we do the
// work ONCE, at capture time, not on every render:
//
//   1. Parse every stylesheet the chrome references (the caller fetches them —
//      this module is pure and synchronous so it stays unit-testable).
//   2. Match each rule's selectors against the captured header/footer DOM only.
//   3. Emit ONE minified critical-CSS blob → site_themes.compiled_chrome_css.
//   4. Drop <script> from the injected head unless the site opts back in.
//
// Result: one inline <style> in the static shell instead of N render-blocking
// cross-origin stylesheets plus a jQuery bundle.
//
// FAIL-SAFE POLICY (non-negotiable)
// ─────────────────────────────────
// Any selector we cannot confidently evaluate is KEPT, never dropped. Shipping a
// handful of unused rules costs bytes; dropping a used one breaks a customer's
// header. Every ambiguity in this file resolves toward keeping.

import { parse } from 'node-html-parser'
import { proxyFontsInCss } from './clientCss'

export type ChromeCompileInput = {
  /** Concatenated stylesheet text (external sheets + inline <style>), already absolutised. */
  css: string
  /** Captured "Top" region — wrappers + header. */
  headerHtml: string
  /** Captured "Bottom" region — footer + wrapper closers. */
  footerHtml: string
  /** The source <body>'s attributes, so `body.home .nav` style selectors resolve. */
  bodyAttrs?: string | null
}

export type ChromeCompileStats = {
  rulesIn: number
  rulesOut: number
  bytesIn: number
  bytesOut: number
  fontFaces: number
  keyframes: number
  /** Selectors we could not evaluate and therefore KEPT (fail-safe). */
  unparseable: number
}

export type ChromeCompileResult = { css: string; stats: ChromeCompileStats }

// ─── Brace-aware rule walker ──────────────────────────────────────────────────
// Same shape as render/scopeCss.ts's walker (deliberately duplicated rather than
// shared: that one is a *scoper* for template chrome and its output contract is
// different — coupling them would make both harder to change).

type Rule = { prelude: string; body: string }

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  let depth = 0
  let start = 0
  let preludeEnd = -1
  let inStr: string | null = null
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (inStr) {
      if (c === inStr && css[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") { inStr = c; continue }
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

// ─── Selector evaluation ──────────────────────────────────────────────────────

// Document-root selectors. These carry the design-token layer (custom properties
// on :root / html / body) and global resets — ALWAYS kept, never match-tested.
const ROOT_SEL = /^\s*(:root|html|body|\*|:where\(:root\))\s*$/i

// Pseudo-classes that describe a STATE the captured static DOM can never be in.
// Stripping them leaves the structural part, which is what we match against.
const STATE_PSEUDO =
  /::?(hover|focus|focus-within|focus-visible|active|visited|link|target|checked|disabled|enabled|required|optional|valid|invalid|in-range|out-of-range|read-only|read-write|placeholder-shown|default|indeterminate|autofill|user-invalid|user-valid|open|popover-open|modal|fullscreen|picture-in-picture|current|past|future|playing|paused|muted|seeking|buffering|stalled)\b(\([^)]*\))?/gi

// Pseudo-elements never affect whether the RULE applies to a node.
const PSEUDO_ELEMENT =
  /::(before|after|first-line|first-letter|selection|placeholder|marker|backdrop|file-selector-button|part|slotted|cue|highlight|target-text|spelling-error|grammar-error|view-transition[a-z-]*)\b(\([^)]*\))?/gi

// Structural pseudo-classes node-html-parser cannot evaluate. Strip and let the
// rest of the compound decide — conservative (widens the match, never narrows).
const UNSUPPORTED_PSEUDO =
  /:(nth-last-child|nth-of-type|nth-last-of-type|first-of-type|last-of-type|only-of-type|only-child|empty|root|scope|host|host-context|dir|lang|any-link|defined|has|is|where|not)\b(\([^)]*\))?/gi

/**
 * Reduce a selector to the structural core node-html-parser can test.
 * Returns null when nothing testable survives (caller then KEEPS the rule).
 */
export function normalizeSelector(sel: string): string | null {
  let s = sel.trim()
  if (!s) return null
  // A bare `>`/`+`/`~` combinator left dangling after stripping is unparseable.
  s = s.replace(PSEUDO_ELEMENT, '').replace(STATE_PSEUDO, '').replace(UNSUPPORTED_PSEUDO, '')
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return null
  // Sibling/child combinators: node-html-parser's support is partial and its
  // failures are silent (returns null rather than throwing), which would DROP a
  // used rule. Reduce to the rightmost compound instead — a superset match.
  if (/[>+~]/.test(s)) {
    const tail = s.split(/[>+~]/).pop()?.trim()
    if (!tail) return null
    s = tail
  }
  // Escaped Tailwind-style utilities (.md\:flex) and namespace pipes are beyond
  // the matcher — signal "keep".
  if (/\\|\|/.test(s)) return null
  if (!/[a-z0-9_.#\[\]="'\- :]/i.test(s)) return null
  return s
}

type Matcher = { matches: (sel: string) => boolean; unparseable: number }

function buildMatcher(input: ChromeCompileInput): Matcher {
  // Rebuild a minimal document so `body.home .nav` and `html[dir=rtl] .x` resolve.
  const attrs = (input.bodyAttrs ?? '').trim()
  const doc = parse(
    `<html><body${attrs ? ` ${attrs}` : ''}>${input.headerHtml ?? ''}${input.footerHtml ?? ''}</body></html>`,
    { comment: false, blockTextElements: { script: false, style: false } },
  )
  let unparseable = 0
  const memo = new Map<string, boolean>()

  return {
    unparseable: 0,
    matches(sel: string): boolean {
      const cached = memo.get(sel)
      if (cached !== undefined) return cached
      let result: boolean
      if (ROOT_SEL.test(sel)) {
        result = true
      } else {
        const norm = normalizeSelector(sel)
        if (norm === null) {
          unparseable++
          this.unparseable = unparseable
          result = true // fail-safe: keep
        } else {
          try {
            result = doc.querySelector(norm) !== null
          } catch {
            unparseable++
            this.unparseable = unparseable
            result = true // fail-safe: keep
          }
        }
      }
      memo.set(sel, result)
      return result
    },
  }
}

// ─── Declaration helpers ──────────────────────────────────────────────────────

/** Custom-property declarations are the token layer — a rule that defines any is kept whole. */
function definesCustomProperty(body: string): boolean {
  return /(^|[;{])\s*--[a-z0-9_-]+\s*:/i.test(body)
}

function collectIdentifiers(body: string, prop: RegExp): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(prop.source, 'gi')
  while ((m = re.exec(body)) !== null) if (m[1]) out.push(m[1].trim())
  return out
}

// Minification has to treat selectors and declaration bodies DIFFERENTLY.
//
// Collapsing whitespace around `:` is safe inside a declaration (`color: red`)
// and CATASTROPHIC inside a selector: `html :where(.x)` (a descendant of <html>)
// would become `html:where(.x)` (<html> itself), silently changing what the rule
// applies to. The chrome-fidelity gate caught exactly this.
//
// Safe to collapse in a selector: whitespace around `,` `>` `~` `+`, since those
// are combinators/separators in their own right. Never around `:` or `[`.
function minifySelector(sel: string): string {
  return sel
    .replace(/\s+/g, ' ')
    .replace(/\s*([,>~+])\s*/g, '$1')
    .trim()
}

// STRING-AWARE. A naive `.replace(/\s*([:;,])\s*/g, '$1')` rewrites the INSIDE of
// quoted values, and CSS has values whose exact bytes are load-bearing:
//
//     font-family: 'object-fit: cover;'
//
// is the object-fit-images polyfill's marker — the library reads that string back
// and parses it. Collapsing its inner spacing silently disables the polyfill. The
// chrome-fidelity gate caught this on legal-batlle. Quoted runs are copied through
// untouched; only the CSS syntax between them is minified.
function minifyBody(body: string): string {
  let out = ''
  let inStr: string | null = null
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inStr) {
      out += c
      if (c === inStr && body[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") { inStr = c; out += c; continue }
    out += c
  }
  // Now minify only outside strings, by walking again and skipping quoted runs.
  let res = ''
  inStr = null
  let pendingSpace = false
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (inStr) {
      res += c
      if (c === inStr && out[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") {
      if (pendingSpace && res && !/[:;,(\s]$/.test(res)) res += ' '
      pendingSpace = false
      inStr = c
      res += c
      continue
    }
    if (/\s/.test(c)) { pendingSpace = true; continue }
    if (c === ':' || c === ';' || c === ',') { pendingSpace = false; res += c; continue }
    if (pendingSpace) {
      pendingSpace = false
      if (res && !/[:;,(]$/.test(res)) res += ' '
    }
    res += c
  }
  return res.replace(/;+$/, '').trim()
}

function minifyAtPrelude(prelude: string): string {
  return prelude.replace(/\s+/g, ' ').trim()
}

// At-rules whose body contains nested style rules (recurse into them).
const NESTED_ATRULES = new Set(['media', 'supports', 'container', 'layer', 'scope'])
// At-rules that are global by nature and cheap — always kept.
const GLOBAL_ATRULES = new Set(['font-face', 'page', 'property', 'counter-style', 'font-feature-values', 'charset'])

// ─── The compiler ─────────────────────────────────────────────────────────────

/**
 * Compile the chrome's stylesheets down to only the rules its DOM actually uses.
 * Pure and synchronous: the caller does the fetching, this does the thinking.
 */
function collapseBlankLines(css: string): string {
  return css.split('\n').filter(l => l.trim().length > 0).join('\n').trim()
}

/** Every custom property NAME declared anywhere in a stylesheet. */
function declaredCustomProperties(css: string): Set<string> {
  const out = new Set<string>()
  const re = /(^|[;{])\s*(--[a-z0-9_-]+)\s*:/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) out.add(m[2])
  return out
}

/**
 * Re-emit any token-defining rule that the brace walk lost. Scans the SOURCE for
 * `selector { … --x: … }` blocks with a simple, independent matcher, and appends
 * the ones whose properties are missing from the compiled output.
 */
function rescueCustomProperties(source: string, compiled: string): string {
  const want = declaredCustomProperties(source)
  if (want.size === 0) return compiled
  const have = declaredCustomProperties(compiled)
  const missing = new Set([...want].filter(t => !have.has(t)))
  if (missing.size === 0) return compiled

  const rescued: string[] = []
  const seen = new Set<string>()
  // Non-greedy, brace-free body: matches a flat declaration block only, which is
  // exactly the shape a token block has.
  const re = /([^{}]+)\{([^{}]*--[a-z0-9_-]+\s*:[^{}]*)\}/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const prelude = m[1].trim()
    const body = m[2]
    if (!prelude || prelude.startsWith('@')) continue
    const defines = declaredCustomProperties(`{${body}`)
    let needed = false
    for (const t of defines) if (missing.has(t)) { needed = true; break }
    if (!needed) continue
    const key = `${prelude}|${body}`
    if (seen.has(key)) continue
    seen.add(key)
    rescued.push(`${splitSelectorList(prelude).map(minifySelector).join(',')}{${minifyBody(body)}}`)
  }
  return rescued.length ? [compiled, ...rescued].join('\n') : compiled
}

export function compileChromeCss(input: ChromeCompileInput): ChromeCompileResult {
  const source = stripComments(input.css ?? '')
  const bytesIn = source.length
  if (!source.trim()) {
    return { css: '', stats: { rulesIn: 0, rulesOut: 0, bytesIn: 0, bytesOut: 0, fontFaces: 0, keyframes: 0, unparseable: 0 } }
  }

  const matcher = buildMatcher(input)
  let rulesIn = 0
  let rulesOut = 0
  let fontFaces = 0

  // Animation names and font families referenced by KEPT declarations — decides
  // which @keyframes survive (a @keyframes nobody animates is dead weight).
  const usedAnimations = new Set<string>()
  const keyframeBlocks = new Map<string, string>()

  function walk(css: string): string {
    const out: string[] = []
    for (const { prelude, body } of parseRules(css)) {
      if (prelude.startsWith('@')) {
        const kind = prelude.slice(1).match(/^[a-z-]+/i)?.[0]?.toLowerCase() ?? ''
        if (NESTED_ATRULES.has(kind)) {
          // NOTE: @media print is KEPT. It was skipped here originally on the
          // reasoning that print styles are not on the critical render path —
          // true, but irrelevant: by then they are already inline, so skipping
          // them saved a few hundred bytes and silently broke PRINTING a
          // customer page (nav that should hide stayed visible, link colours
          // went wrong). The chrome-fidelity gate flagged it. Keeping them costs
          // well under 1% of the compiled blob.
          const inner = walk(body)
          if (inner.trim()) out.push(`${minifyAtPrelude(prelude)}{${inner}}`)
          continue
        }
        if (kind === 'keyframes' || /^@[-a-z]*keyframes/i.test(prelude)) {
          const name = prelude.replace(/^@[-a-z]*keyframes\s*/i, '').trim().replace(/^["']|["']$/g, '')
          if (name) keyframeBlocks.set(name, `${minifyAtPrelude(prelude)}{${body}}`)
          continue // decided in a second pass, once we know what's animated
        }
        if (GLOBAL_ATRULES.has(kind)) {
          if (kind === 'font-face') fontFaces++
          out.push(`${minifyAtPrelude(prelude)}{${minifyBody(body)}}`)
          continue
        }
        // Unknown at-rule → keep (fail-safe).
        out.push(`${minifyAtPrelude(prelude)}{${body}}`)
        continue
      }

      rulesIn++
      if (!body.trim()) continue

      // Token-layer rules are kept whole and unfiltered.
      if (definesCustomProperty(body)) {
        rulesOut++
        for (const a of collectIdentifiers(body, /animation(?:-name)?\s*:\s*([^;}]+)/)) usedAnimations.add(a)
        out.push(`${splitSelectorList(prelude).map(minifySelector).join(',')}{${minifyBody(body)}}`)
        continue
      }

      const kept = splitSelectorList(prelude).filter(sel => matcher.matches(sel))
      if (kept.length === 0) continue

      // NATIVE CSS NESTING. A body containing `{` holds nested rules
      // (`#banner { a { … } }`, `&:hover { … }`), not a flat declaration list.
      // Our declaration-level minifier would mangle it, so the body is emitted
      // VERBATIM and the selector list is kept whole — a nested rule can target a
      // descendant that the outer compound alone doesn't describe. Fail-safe, as
      // everywhere else in this file.
      if (body.includes('{')) {
        rulesOut++
        out.push(`${splitSelectorList(prelude).map(minifySelector).join(',')}{${body}}`)
        continue
      }

      rulesOut++
      for (const decl of collectIdentifiers(body, /animation(?:-name)?\s*:\s*([^;}]+)/)) {
        // `animation: 2s ease slide-in` → grab every bare identifier; over-keeping
        // a keyframe block is harmless, dropping a used one is not.
        for (const tok of decl.split(/[\s,]+/)) {
          const t = tok.trim()
          if (t && !/^[\d.]/.test(t) && !/^(normal|none|forwards|backwards|both|infinite|alternate|reverse|running|paused|ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/i.test(t)) {
            usedAnimations.add(t.replace(/^["']|["']$/g, ''))
          }
        }
      }
      out.push(`${kept.map(minifySelector).join(',')}{${minifyBody(body)}}`)
    }
    return out.join('\n')
  }

  let compiled = walk(source)

  // Second pass: re-attach only the @keyframes something actually animates.
  const keptKeyframes: string[] = []
  for (const [name, block] of keyframeBlocks) {
    if (usedAnimations.has(name)) keptKeyframes.push(block)
  }
  if (keptKeyframes.length) compiled = `${compiled}\n${keptKeyframes.join('\n')}`

  // Cross-origin webfonts are CORS-blocked once served from our origin — route
  // them through the same-origin asset proxy (same treatment the raw-injection
  // path already applied).
  // ── Custom-property rescue net ────────────────────────────────────────────
  // The brace walker above can desync on a 400KB concatenation of third-party
  // stylesheets (one unbalanced brace inside a minified vendor bundle is enough),
  // and everything after the desync is mis-parsed. That is survivable for an
  // ordinary rule — but NOT for the token layer: a lost `--brand-color` silently
  // restyles the customer's whole header.
  //
  // So we verify independently, with a regex over the raw source rather than the
  // parse tree, and re-emit any token-defining rule the walk failed to carry
  // through. Caught by the chrome-fidelity gate on the Barcelona-100.
  compiled = rescueCustomProperties(source, compiled)

  const css = collapseBlankLines(proxyFontsInCss(compiled))

  return {
    css,
    stats: {
      rulesIn,
      rulesOut,
      bytesIn,
      bytesOut: css.length,
      fontFaces,
      keyframes: keptKeyframes.length,
      unparseable: matcher.unparseable,
    },
  }
}

// ─── Head sanitisation ────────────────────────────────────────────────────────

/**
 * Strip everything the compiled CSS replaces from the captured head: the
 * stylesheets (now inlined), the preloads that fed them, and — unless the site
 * opts back in — the scripts.
 *
 * `keepScripts` exists because a minority of cloned sites drive their navigation
 * from JS (hamburger menus, mega-menu toggles). Those sites set
 * `site_themes.chrome_scripts_enabled` and get their scripts back, DEFERRED and
 * after the critical path, rather than render-blocking in <head>.
 */
export function stripCompiledHead(headHtml: string, opts: { keepScripts: boolean }): string {
  if (!headHtml?.trim()) return ''
  let out = headHtml
    // Stylesheets are now compiled into one inline blob.
    .replace(/<link\b[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi, '')
    // Preload/prefetch hints for assets we no longer request.
    .replace(/<link\b[^>]*rel\s*=\s*["']?(?:preload|prefetch|modulepreload|dns-prefetch)["']?[^>]*>/gi, '')
    // Inline <style> — folded into the compiled blob by the caller.
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    // Defense in depth for old stored data (same set sanitizeInjectedHead strips).
    .replace(/<base\b[^>]*\/?>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '')
    .replace(/<meta\b[^>]*\/?>/gi, '')
    .replace(/<\/?(head|body|html)\b[^>]*>/gi, '')

  if (!opts.keepScripts) {
    out = out
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '')
  } else {
    // Opted back in: never render-blocking. Force defer on every external script
    // and drop inline blocking ones to the end of the document instead.
    out = out.replace(/<script\b([^>]*)>/gi, (m, attrs: string) => {
      if (/\bsrc\s*=/i.test(attrs) && !/\b(defer|async)\b/i.test(attrs)) return `<script${attrs} defer>`
      return m
    })
  }
  return out.trim()
}

/** How many bytes/requests the compile saved — surfaced in the capture UI + eval. */
export function compileSavings(stats: ChromeCompileStats): { bytesSaved: number; pctSaved: number } {
  const bytesSaved = Math.max(0, stats.bytesIn - stats.bytesOut)
  const pctSaved = stats.bytesIn > 0 ? Math.round((bytesSaved / stats.bytesIn) * 100) : 0
  return { bytesSaved, pctSaved }
}
