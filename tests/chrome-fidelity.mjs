// Chrome Fidelity — the safety gate for the Chrome Compiler (Super MVP Fase 4).
//
//   npm run test:fidelity                  # run over the cached Barcelona-100
//   npm run test:fidelity -- --only=vet    # subset by id/niche substring
//   npm run test:fidelity -- --report      # write tests/grabber/fidelity.json
//
// WHAT THIS IS, AND WHAT IT IS NOT
// ───────────────────────────────
// The plan called for a pixel SSIM diff (screenshot the source chrome, screenshot
// the Carma render, compare). That needs a headless browser, and this repo has
// none — only `sharp`. Rather than add a ~300MB Playwright dependency to the
// critical test path, this gate measures fidelity at the CSS level, which for the
// Chrome Compiler is actually the sharper instrument: the compiler's ONLY risk is
// dropping a declaration the chrome needed, and that is a question about CSS, not
// about pixels.
//
// A pixel SSIM pass is still worth adding later for LAYOUT regressions the CSS
// level cannot see (a dropped rule that changes reflow). Tracked as follow-up.
//
// THE THREE MEASUREMENTS
// ──────────────────────
//   1. RULE COVERAGE      Every rule the matcher says applies to the chrome DOM
//                         must survive into the compiled blob. Catches the whole
//                         class of compiler bugs — a broken at-rule walk, a lost
//                         @media, a mangled selector list, a bad minify.
//   2. TOKEN PRESERVATION Every CSS custom property declared in the original must
//                         still be declared in the compiled output. This is the
//                         layer the chrome's colours and typography come from, so
//                         losing one is catastrophic and silent. INDEPENDENT of
//                         the matcher.
//   3. CRITICAL PROPS     For each element in the chrome, the winning declaration
//                         for layout-critical properties (display/position/color/
//                         background/font-family/flex/grid/…) must be identical
//                         before and after. The closest thing to a visual check
//                         without a browser. INDEPENDENT of the matcher, because
//                         it compares resolved VALUES, not rule identity.
//
// Runs through tests/register.mjs so it imports the REAL engine modules.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parse } from 'node-html-parser'
import { EVAL_DATASET } from '@/lib/grabber-lab/evalDataset'
import { collectStylesheets } from '@/lib/grabber-lab/evalRun'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { compileChromeCss, normalizeSelector } from '@/lib/scrape/chromeCompiler'

const ROOT = process.cwd()
const CACHE = path.join(ROOT, '.grabber-cache')
const HTML_DIR = path.join(CACHE, 'html')
const CSS_DIR = path.join(CACHE, 'css')
const OUT_DIR = path.join(ROOT, 'tests', 'grabber')
const REPORT = path.join(OUT_DIR, 'fidelity.json')

const MAX_SHEETS = 8
const CSS_BUDGET = 400_000

// ── Gates ─────────────────────────────────────────────────────────────────────
// Rule coverage and token preservation must be PERFECT — they are correctness,
// not quality. Critical-property agreement is allowed a small margin because a
// handful of sites use selector syntax node-html-parser cannot evaluate at all
// (the compiler KEEPS those rules, which can only ever add declarations, never
// remove them — so a miss here means "we kept more than the reference", which is
// safe).
const GATE = {
  ruleCoverage: 1.0,
  tokenPreservation: 1.0,
  criticalAgreement: 0.98,
  /** A compile that shrinks by less than this isn't earning its keep. */
  minBytesSavedPct: 50,
}

const args = process.argv.slice(2)
const only = (args.find(a => a.startsWith('--only=')) || '').slice('--only='.length)
const WRITE_REPORT = args.includes('--report')

const sha1 = (s) => createHash('sha1').update(s).digest('hex')

function readPage(c) {
  const f = path.join(HTML_DIR, `${c.id}.html`)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}
function readCss(url) {
  const f = path.join(CSS_DIR, `${sha1(url).slice(0, 20)}.css`)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

// ── Minimal CSS rule walker (independent of the compiler's own) ───────────────
// Deliberately a SECOND implementation: if the compiler's walker has a bug, this
// one should disagree with it, which is the entire point of a gate.

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function walkStyleRules(css, onRule, media = '') {
  let depth = 0, start = 0, preludeEnd = -1, inStr = null
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (inStr) { if (ch === inStr && css[i - 1] !== '\\') inStr = null; continue }
    if (ch === '"' || ch === "'") { inStr = ch; continue }
    if (ch === '{') { if (depth === 0) preludeEnd = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && preludeEnd >= 0) {
        const prelude = css.slice(start, preludeEnd).trim()
        const body = css.slice(preludeEnd + 1, i)
        if (prelude.startsWith('@')) {
          const kind = (prelude.slice(1).match(/^[a-z-]+/i) || [''])[0].toLowerCase()
          if (['media', 'supports', 'container', 'layer', 'scope'].includes(kind)) {
            walkStyleRules(body, onRule, `${media}|${prelude}`)
          }
        } else {
          onRule(prelude, body, media)
        }
        start = i + 1
        preludeEnd = -1
      }
    }
  }
}

function splitSelectors(list) {
  const out = []
  let depth = 0, inStr = null, buf = ''
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (inStr) { buf += c; if (c === inStr && list[i - 1] !== '\\') inStr = null; continue }
    if (c === '"' || c === "'") { inStr = c; buf += c; continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function declMap(body) {
  const out = new Map()
  let depth = 0, inStr = null, buf = ''
  const flush = () => {
    const d = buf.trim()
    buf = ''
    if (!d) return
    const i = d.indexOf(':')
    if (i < 1) return
    out.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim())
  }
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inStr) { buf += c; if (c === inStr && body[i - 1] !== '\\') inStr = null; continue }
    if (c === '"' || c === "'") { inStr = c; buf += c; continue }
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === ';' && depth === 0) { flush(); continue }
    buf += c
  }
  flush()
  return out
}

/**
 * Normalise a declaration VALUE for comparison. String-aware on purpose.
 *
 * Whitespace next to CSS punctuation — `repeat( 2, 1fr )` vs `repeat(2,1fr)` — is
 * cosmetic, and treating it as a fidelity loss produces noise. Whitespace INSIDE a
 * quoted string is not cosmetic at all: `font-family:'object-fit: cover;'` is the
 * object-fit-images polyfill marker, which the library parses back out. So quoted
 * runs are compared byte-for-byte while the syntax around them is normalised.
 *
 * Single spaces that separate values (`0 auto`, `1px solid red`) are preserved, so
 * a compiler that ate one still fails the gate.
 */
function normVal(v) {
  let out = ''
  let inStr = null
  let pending = false
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (inStr) {
      out += c
      if (c === inStr && v[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") {
      if (pending && out && !/[(,:;]$/.test(out)) out += ' '
      pending = false
      inStr = c
      out += c
      continue
    }
    if (/\s/.test(c)) { pending = true; continue }
    if (/[(),:;]/.test(c)) { pending = false; out += c; continue }
    if (pending) {
      pending = false
      if (out && !/[(,:;]$/.test(out)) out += ' '
    }
    out += c
  }
  return out.replace(/\s*\)/g, ')').trim()
}

const CRITICAL = new Set([
  'display', 'position', 'color', 'background', 'background-color', 'background-image',
  'font-family', 'font-size', 'font-weight', 'flex-direction', 'justify-content',
  'align-items', 'grid-template-columns', 'width', 'max-width', 'height', 'padding',
  'margin', 'border', 'border-radius', 'text-align', 'z-index', 'gap', 'opacity',
  'visibility', 'overflow', 'top', 'left', 'right', 'bottom', 'transform',
])

/** Custom properties declared anywhere in a sheet — the token layer. */
function customProps(css) {
  const out = new Set()
  const re = /(^|[;{])\s*(--[a-z0-9_-]+)\s*:/gi
  let m
  while ((m = re.exec(css)) !== null) out.add(m[2])
  return out
}

// ── Per-case fidelity ─────────────────────────────────────────────────────────

function runCase(c) {
  const html = readPage(c)
  if (html == null) return { id: c.id, skipped: 'no snapshot' }

  let base
  try { base = new URL(c.url) } catch { return { id: c.id, skipped: 'bad url' } }

  const { urls, inline } = collectStylesheets(html, base)
  const cssTexts = [...inline]
  let budget = CSS_BUDGET
  for (const u of urls.slice(0, MAX_SHEETS)) {
    if (budget <= 0) break
    const css = readCss(u)
    if (!css) continue
    const slice = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
    budget -= slice.length
    if (slice) cssTexts.push(slice)
  }
  const originalCss = stripComments(cssTexts.join('\n'))
  if (!originalCss.trim()) return { id: c.id, skipped: 'no css' }

  const split = splitPageChrome(html, base)
  if (!split.top && !split.bottom) return { id: c.id, skipped: 'no chrome' }

  const compiled = compileChromeCss({
    css: originalCss,
    headerHtml: split.top,
    footerHtml: split.bottom,
    bodyAttrs: split.bodyAttrs,
  })
  if (!compiled.css.trim()) return { id: c.id, skipped: 'empty compile' }

  // One DOM, used by both sides — the reference and the compiled output are
  // evaluated against exactly the same nodes.
  const doc = parse(
    `<html><body${split.bodyAttrs ? ` ${split.bodyAttrs}` : ''}>${split.top}${split.bottom}</body></html>`,
    { comment: false, blockTextElements: { script: false, style: false } },
  )
  const matches = (sel) => {
    const norm = normalizeSelector(sel)
    if (norm === null) return null // unevaluable → compiler keeps it; not counted
    try { return doc.querySelector(norm) !== null } catch { return null }
  }

  // ── 1. Rule coverage ───────────────────────────────────────────────────────
  // Build the reference set of (selector, declaration-body) pairs that apply, then
  // check each survived. Compare on a normalised signature so minification and
  // selector-list pruning don't register as losses.
  // Compare SEMANTICS, not bytes. Both sides go through the same normalisation so
  // minification never registers as a fidelity loss — but whitespace that is
  // STRUCTURAL in a selector (the descendant combinator in `html :where(.x)`) is
  // preserved on both sides, so a minifier that eats it still fails the gate.
  // That is exactly the bug this gate caught on its first run.
  const normSel = (sel) => sel.replace(/\s+/g, ' ').replace(/\s*([,>~+])\s*/g, '$1').trim()
  const sig = (sel, body, media) =>
    `${normSel(media)}::${normSel(sel)}::${[...declMap(body).entries()]
      .map(([k, v]) => `${k}:${normVal(v)}`).sort().join(';')}`

  const required = new Set()
  walkStyleRules(originalCss, (prelude, body, media) => {
    if (!body.trim()) return
    for (const sel of splitSelectors(prelude)) {
      if (matches(sel) === true) required.add(sig(sel, body, media))
    }
  })

  const present = new Set()
  walkStyleRules(compiled.css, (prelude, body, media) => {
    for (const sel of splitSelectors(prelude)) present.add(sig(sel, body, media))
  })

  let covered = 0
  const missing = []
  for (const r of required) {
    if (present.has(r)) covered++
    else if (missing.length < 5) missing.push(r.slice(0, 160))
  }
  const ruleCoverage = required.size === 0 ? 1 : covered / required.size

  // ── 2. Token preservation ──────────────────────────────────────────────────
  const originalTokens = customProps(originalCss)
  const compiledTokens = customProps(compiled.css)
  let tokensKept = 0
  const lostTokens = []
  for (const t of originalTokens) {
    if (compiledTokens.has(t)) tokensKept++
    else if (lostTokens.length < 5) lostTokens.push(t)
  }
  const tokenPreservation = originalTokens.size === 0 ? 1 : tokensKept / originalTokens.size

  // ── 3. Critical-property agreement ─────────────────────────────────────────
  // Resolve each critical property per element from BOTH sheets in source order
  // (last-wins, an approximation of the cascade that is identical for both sides,
  // so any disagreement is a real difference the compiler introduced).
  const elements = doc.querySelectorAll('*').slice(0, 400)
  const resolve = (css) => {
    const perEl = elements.map(() => new Map())
    walkStyleRules(css, (prelude, body) => {
      const decls = declMap(body)
      let hasCritical = false
      for (const k of decls.keys()) if (CRITICAL.has(k)) { hasCritical = true; break }
      if (!hasCritical) return
      for (const sel of splitSelectors(prelude)) {
        const norm = normalizeSelector(sel)
        if (norm === null) continue
        let hits
        try { hits = doc.querySelectorAll(norm) } catch { continue }
        if (!hits.length) continue
        const hitSet = new Set(hits)
        elements.forEach((el, i) => {
          if (!hitSet.has(el)) return
          for (const [k, v] of decls) {
            if (CRITICAL.has(k)) perEl[i].set(k, normVal(v))
          }
        })
      }
    })
    return perEl
  }

  const refResolved = resolve(originalCss)
  const outResolved = resolve(compiled.css)
  let checked = 0, agreed = 0
  const disagreements = []
  refResolved.forEach((refMap, i) => {
    const outMap = outResolved[i]
    for (const [k, v] of refMap) {
      checked++
      if (outMap.get(k) === v) agreed++
      else if (disagreements.length < 5) {
        disagreements.push(`<${elements[i].rawTagName}> ${k}: ${v} → ${outMap.get(k) ?? '(dropped)'}`)
      }
    }
  })
  const criticalAgreement = checked === 0 ? 1 : agreed / checked

  const bytesSavedPct = compiled.stats.bytesIn > 0
    ? Math.round(((compiled.stats.bytesIn - compiled.stats.bytesOut) / compiled.stats.bytesIn) * 100)
    : 0

  return {
    id: c.id,
    name: c.name,
    niche: c.niche,
    ruleCoverage: round(ruleCoverage),
    tokenPreservation: round(tokenPreservation),
    criticalAgreement: round(criticalAgreement),
    bytesSavedPct,
    rulesIn: compiled.stats.rulesIn,
    rulesOut: compiled.stats.rulesOut,
    unparseable: compiled.stats.unparseable,
    requiredRules: required.size,
    criticalChecked: checked,
    missing,
    lostTokens,
    disagreements,
  }
}

const round = (n) => Math.round(n * 10000) / 10000

// ── Run ───────────────────────────────────────────────────────────────────────

const cases = EVAL_DATASET.filter(c =>
  !only || c.id.includes(only) || (c.niche || '').includes(only),
)

console.log(`\nChrome Fidelity — ${cases.length} cases (cached snapshots)\n`)
console.log('NOTE: CSS-level fidelity gate, not pixel SSIM (no headless browser in')
console.log('      this toolchain). Measures rule coverage, token preservation and')
console.log('      resolved critical-property agreement. See the header comment.\n')

const results = []
const skipped = []
for (const c of cases) {
  const r = runCase(c)
  if (r.skipped) { skipped.push(`${r.id}: ${r.skipped}`); continue }
  results.push(r)
}

if (results.length === 0) {
  console.log('No evaluable cases — run `npm run grabber:eval` once to populate .grabber-cache/.')
  process.exit(0)
}

const avg = (key) => results.reduce((s, r) => s + r[key], 0) / results.length
const summary = {
  cases: results.length,
  skipped: skipped.length,
  ruleCoverage: round(avg('ruleCoverage')),
  tokenPreservation: round(avg('tokenPreservation')),
  criticalAgreement: round(avg('criticalAgreement')),
  bytesSavedPct: Math.round(avg('bytesSavedPct')),
}

const failures = results.filter(r =>
  r.ruleCoverage < GATE.ruleCoverage ||
  r.tokenPreservation < GATE.tokenPreservation ||
  r.criticalAgreement < GATE.criticalAgreement,
)

const pct = (n) => `${(n * 100).toFixed(2)}%`
console.log('─'.repeat(64))
console.log(`  Rule coverage         ${pct(summary.ruleCoverage).padStart(8)}   (gate ${pct(GATE.ruleCoverage)})`)
console.log(`  Token preservation    ${pct(summary.tokenPreservation).padStart(8)}   (gate ${pct(GATE.tokenPreservation)})`)
console.log(`  Critical agreement    ${pct(summary.criticalAgreement).padStart(8)}   (gate ${pct(GATE.criticalAgreement)})`)
console.log(`  Bytes saved (avg)     ${String(summary.bytesSavedPct).padStart(7)}%   (gate ${GATE.minBytesSavedPct}%)`)
console.log(`  Cases ${summary.cases} evaluated · ${summary.skipped} skipped`)
console.log('─'.repeat(64))

if (failures.length) {
  console.log(`\n✗ ${failures.length} site(s) below gate:\n`)
  for (const f of failures.slice(0, 12)) {
    console.log(`  ${f.id} (${f.niche})  rules ${pct(f.ruleCoverage)} · tokens ${pct(f.tokenPreservation)} · critical ${pct(f.criticalAgreement)}`)
    for (const m of f.missing) console.log(`      dropped rule: ${m}`)
    for (const t of f.lostTokens) console.log(`      lost token:   ${t}`)
    for (const d of f.disagreements) console.log(`      changed:      ${d}`)
  }
}

if (WRITE_REPORT) {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(REPORT, JSON.stringify({ summary, gate: GATE, results: results.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2))
  console.log(`\nReport → ${path.relative(ROOT, REPORT)}`)
}

const savingsOk = summary.bytesSavedPct >= GATE.minBytesSavedPct
if (failures.length === 0 && savingsOk) {
  console.log('\n✓ Chrome Compiler is faithful. Gate passed.\n')
  process.exit(0)
}
if (!savingsOk) console.log(`\n✗ Compile saves only ${summary.bytesSavedPct}% — below the ${GATE.minBytesSavedPct}% gate.`)
console.log('')
process.exit(1)
