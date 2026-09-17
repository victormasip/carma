// Grabber Eval — deterministic batch benchmark of the extraction engine over the
// 100-site Barcelona dataset (src/lib/grabber-lab/evalDataset.ts).
//
//   npm run grabber:eval                 # run (uses .grabber-cache snapshots)
//   npm run grabber:eval -- --refresh    # refetch every page + stylesheet
//   npm run grabber:eval -- --only=vet   # subset by id/niche substring
//   npm run grabber:eval -- --baseline   # also save the report as the baseline
//   npm run grabber:eval -- --diff tests/grabber/baseline.json   # compare
//
// DESIGN: the first run snapshots every page (+ its stylesheets) into
// .grabber-cache/ (gitignored). Every later run replays those EXACT bytes, so a
// score/hash change can ONLY come from an engine change — that's what makes the
// diff empirical proof of improvement rather than network noise. Report goes to
// tests/grabber/report.json (sorted, stable ordering).
//
// Runs through tests/register.mjs (ts-loader) so it imports the REAL engine
// modules — the same code the production capture executes.

import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { EVAL_DATASET } from '@/lib/grabber-lab/evalDataset'
import { evalCaseFromHtml, collectStylesheets } from '@/lib/grabber-lab/evalRun'
import { safeFetch, safeFetchText } from '@/lib/scrape/http'

const ROOT = process.cwd()
const CACHE = path.join(ROOT, '.grabber-cache')
const HTML_DIR = path.join(CACHE, 'html')
const CSS_DIR = path.join(CACHE, 'css')
const OUT_DIR = path.join(ROOT, 'tests', 'grabber')
const REPORT = path.join(OUT_DIR, 'report.json')
const BASELINE = path.join(OUT_DIR, 'baseline.json')

const MAX_SHEETS = 8
const CSS_BUDGET = 400_000
const PAGE_CONCURRENCY = 8

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (name) => {
  const eq = args.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const REFRESH = has('--refresh')
const ONLY = val('--only')
const LIMIT = Number(val('--limit') ?? 0) || 0
const DIFF_WITH = val('--diff')
const SAVE_BASELINE = has('--baseline')

const sha1 = (s) => createHash('sha1').update(s).digest('hex')

// Engine version = hash of the engine sources; ties every report to the exact
// code that produced it (regressions are attributable, reviews stale-detectable).
function engineHash() {
  const files = ['pageSplit.ts', 'tokens.ts', 'headerFooter.ts', 'clientCss.ts', 'chromeContrast.ts']
  const cat = files.map((f) => readFileSync(path.join(ROOT, 'src', 'lib', 'scrape', f), 'utf8')).join('\n')
  return sha1(cat).slice(0, 12)
}

// ── snapshot cache ────────────────────────────────────────────────────────────
mkdirSync(HTML_DIR, { recursive: true })
mkdirSync(CSS_DIR, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })

async function getPage(c) {
  const file = path.join(HTML_DIR, `${c.id}.html`)
  const miss = path.join(HTML_DIR, `${c.id}.miss`)
  if (!REFRESH) {
    if (existsSync(file)) return readFileSync(file, 'utf8')
    if (existsSync(miss)) return null // known-dead; refetch only with --refresh
  }
  const res = await safeFetch(c.url, { timeout: 15_000 })
  if (!res) { writeFileSync(miss, new Date().toISOString()); return null }
  writeFileSync(file, res.body)
  return res.body
}

async function getCss(url) {
  const key = sha1(url).slice(0, 20)
  const file = path.join(CSS_DIR, `${key}.css`)
  const miss = path.join(CSS_DIR, `${key}.miss`)
  if (!REFRESH) {
    if (existsSync(file)) return readFileSync(file, 'utf8')
    if (existsSync(miss)) return null
  }
  const css = await safeFetchText(url, { accept: 'text/css,*/*', timeout: 8_000 })
  if (css == null) { writeFileSync(miss, new Date().toISOString()); return null }
  writeFileSync(file, css)
  return css
}

// ── per-case evaluation ───────────────────────────────────────────────────────
async function runCase(c) {
  const html = await getPage(c)
  if (html == null) {
    return { id: c.id, url: c.url, niche: c.niche, name: c.name, fetched: false, score: 0 }
  }
  const base = new URL(c.url)
  const { urls, inline, fontLinks } = collectStylesheets(html, base)
  const cssTexts = [...inline]
  let budget = CSS_BUDGET
  for (const u of urls.slice(0, MAX_SHEETS)) {
    if (budget <= 0) break
    const css = await getCss(u)
    if (!css) continue
    const slice = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
    budget -= slice.length
    if (slice) cssTexts.push(slice)
  }

  const r = evalCaseFromHtml({ url: c.url, html, cssTexts, fontLinks })
  return {
    id: c.id, url: c.url, niche: c.niche, name: c.name,
    fetched: true,
    score: r.score,
    strategy: r.strategy,
    usedFallback: r.meta.usedFallback,
    headerSig: r.meta.headerSig,
    footerSig: r.meta.footerSig,
    chromeTextRatio: r.metrics.chromeTextRatio,
    nonDefaultTokens: r.metrics.nonDefaultTokens,
    checks: Object.fromEntries(r.checks.map((k) => [k.id, k.ok])),
    notes: Object.fromEntries(r.checks.map((k) => [k.id, k.note])),
    hashes: r.hashes,
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  async function worker() {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// ── report + printing ─────────────────────────────────────────────────────────
const CHECK_IDS = [
  'split-content', 'header-found', 'footer-found', 'chrome-lean', 'head-captured',
  'tokens-palette', 'tokens-fonts', 'tokens-width',
  // 2026-09-17 — the header/footer refinement pass. Adding these REBALANCED the
  // weights (the token trio went 20 → 17), so scores are not comparable with a
  // baseline captured before this date; re-run with --baseline once.
  'links-sound', 'chrome-legible',
]

function summarize(cases) {
  const fetched = cases.filter((c) => c.fetched)
  const rate = (n, d) => (d ? Math.round((n / d) * 100) : 0)
  const checkRates = {}
  for (const id of CHECK_IDS) checkRates[id] = rate(fetched.filter((c) => c.checks?.[id]).length, fetched.length)
  return {
    total: cases.length,
    fetched: fetched.length,
    avgScore: fetched.length ? Math.round(fetched.reduce((s, c) => s + c.score, 0) / fetched.length) : 0,
    carved: fetched.filter((c) => c.strategy === 'content').length,
    usedFallback: fetched.filter((c) => c.usedFallback).length,
    checkRates,
  }
}

function printReport(report) {
  const s = report.summary
  console.log('\n══════════ GRABBER EVAL · Barcelona-100 ══════════')
  console.log(`engine ${report.engine} · ${s.fetched}/${s.total} fetched · avg score ${s.avgScore}/100`)
  console.log(`carved ${s.carved}/${s.fetched} (${s.usedFallback} via failsafe)\n`)
  console.log('check pass-rates (fetched sites):')
  for (const id of CHECK_IDS) console.log(`  ${id.padEnd(16)} ${String(s.checkRates[id]).padStart(3)}%`)

  // per-niche
  const byNiche = new Map()
  for (const c of report.cases) {
    if (!byNiche.has(c.niche)) byNiche.set(c.niche, [])
    byNiche.get(c.niche).push(c)
  }
  console.log('\nper-niche avg score:')
  for (const [niche, cs] of [...byNiche.entries()].sort()) {
    const f = cs.filter((c) => c.fetched)
    const avg = f.length ? Math.round(f.reduce((x, c) => x + c.score, 0) / f.length) : 0
    console.log(`  ${niche.padEnd(13)} ${String(avg).padStart(3)}  (${f.length}/${cs.length} fetched)`)
  }

  const worst = report.cases.filter((c) => c.fetched).sort((a, b) => a.score - b.score).slice(0, 15)
  console.log('\nworst 15 (fetched):')
  for (const c of worst) {
    const fails = CHECK_IDS.filter((id) => !c.checks[id]).join(', ')
    console.log(`  ${String(c.score).padStart(3)}  ${c.id.padEnd(20)} ${fails}`)
  }
  const dead = report.cases.filter((c) => !c.fetched).map((c) => c.id)
  if (dead.length) console.log(`\nunreachable (${dead.length}): ${dead.join(', ')}`)
}

function printDiff(oldReport, report) {
  const old = new Map(oldReport.cases.map((c) => [c.id, c]))
  const improved = [], regressed = [], changed = []
  for (const c of report.cases) {
    const o = old.get(c.id)
    if (!o) continue
    const d = (c.score ?? 0) - (o.score ?? 0)
    const hashChanged = c.hashes && o.hashes && JSON.stringify(c.hashes) !== JSON.stringify(o.hashes)
    if (d > 0) improved.push({ c, o, d })
    else if (d < 0) regressed.push({ c, o, d })
    else if (hashChanged) changed.push(c)
  }
  console.log('\n══════════ DIFF vs', oldReport.engine, '→', report.engine, '══════════')
  console.log(`avg score ${oldReport.summary.avgScore} → ${report.summary.avgScore}  ·  carved ${oldReport.summary.carved} → ${report.summary.carved}`)
  console.log(`improved ${improved.length} · regressed ${regressed.length} · same-score-but-changed ${changed.length}`)
  for (const { c, o, d } of improved.sort((a, b) => b.d - a.d)) {
    const flips = CHECK_IDS.filter((id) => c.checks?.[id] && !o.checks?.[id])
    console.log(`  +${String(d).padEnd(3)} ${c.id.padEnd(20)} gained: ${flips.join(', ') || '(metrics)'}`)
  }
  for (const { c, o, d } of regressed.sort((a, b) => a.d - b.d)) {
    const flips = CHECK_IDS.filter((id) => !c.checks?.[id] && o.checks?.[id])
    console.log(`  ${String(d).padEnd(4)} ${c.id.padEnd(20)} lost: ${flips.join(', ') || '(metrics)'}`)
  }
  if (changed.length) console.log(`  ~ changed output (same score) — needs re-review: ${changed.map((c) => c.id).join(', ')}`)
}

// ── main ──────────────────────────────────────────────────────────────────────
let cases = [...EVAL_DATASET]
if (ONLY) cases = cases.filter((c) => c.id.includes(ONLY) || c.niche.includes(ONLY))
if (LIMIT > 0) cases = cases.slice(0, LIMIT)

console.log(`Grabber Eval — ${cases.length} cases${REFRESH ? ' (refreshing snapshots)' : ''}…`)
const t0 = Date.now()
const results = await mapPool(cases, PAGE_CONCURRENCY, runCase)
results.sort((a, b) => a.id.localeCompare(b.id))

const report = {
  generatedAt: new Date().toISOString(),
  engine: engineHash(),
  datasetSize: cases.length,
  summary: summarize(results),
  cases: results,
}
writeFileSync(REPORT, JSON.stringify(report, null, 1))
printReport(report)
console.log(`\nreport → ${path.relative(ROOT, REPORT)} · ${((Date.now() - t0) / 1000).toFixed(1)}s`)

if (DIFF_WITH) {
  const old = JSON.parse(readFileSync(path.resolve(DIFF_WITH), 'utf8'))
  printDiff(old, report)
}
if (SAVE_BASELINE) {
  copyFileSync(REPORT, BASELINE)
  console.log(`baseline → ${path.relative(ROOT, BASELINE)}`)
}
