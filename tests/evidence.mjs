// W2 — THE EYE GATE.
//
//   npm run test:evidence
//   npm run test:evidence -- --show=vet-delclinic   # one site in full
//
// `grabber:eval` asks "did the extraction WORK". This asks the question that comes
// after it: "and what do we now KNOW about this business's design?" — the judgements
// the art director is actually handed.
//
// It replays the same cached Barcelona-100 snapshots `grabber:eval` uses, so a
// change in any number here can only come from an engine change. Nothing is
// fetched, nothing is random, and the whole run is a pure function of the cache.
//
// WHAT IT ASSERTS, AND WHY EACH ONE EARNS ITS PLACE
//   §1 prominence beats frequency — the founder asked for the colour extractor to
//      weigh by presence, so the gate MEASURES the disagreement rather than taking
//      it on faith.
//   §2 the classifier reaches a real category, and says how confident it is.
//   §3 sourceQuality's RANGE is unit-tested against two synthetic documents whose
//      verdict is not in doubt; the corpus distribution is reported, not asserted.
//      Demanding a shape from the world in order to test the code is the mistake W1
//      already made once with mode share.
//   §4 the register prior is allowed to be concentrated — most small-business sites
//      really are sans at ordinary density — but the VARIANT LADDER that spreads it
//      across the three reveal tabs is asserted, because that is what stands between
//      an honest prior and the distinctiveness funnel.
//   §5 nothing throws, on any of 100 real sites, including the unreachable one.
//   §6 determinism: two runs, byte-identical judgements.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { EVAL_DATASET } from '@/lib/grabber-lab/evalDataset'
import { collectStylesheets } from '@/lib/grabber-lab/evalRun'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { readEvidence, classifyFont, registerVariants } from '@/lib/design/evidence'
import { rankBrandColors } from '@/lib/scrape/tokens'

const ROOT = process.cwd()
const CACHE = path.join(ROOT, '.grabber-cache')
const HTML_DIR = path.join(CACHE, 'html')
const CSS_DIR = path.join(CACHE, 'css')
const MAX_SHEETS = 8
const CSS_BUDGET = 400_000

const args = process.argv.slice(2)
const SHOW = (args.find(a => a.startsWith('--show=')) ?? '').slice(7)

const sha1 = s => createHash('sha1').update(s).digest('hex')

let pass = 0, fail = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else { fail++; fails.push(msg); console.error('  ✗ ' + msg) } }
const head = t => console.log(`\n${t}`)
const note = (l, v = '') => console.log(`    ${l}${v ? '  ' + v : ''}`)

// ── THE OLD COLOUR EXTRACTOR, kept alive on purpose ──────────────────────────
// Frequency counting, exactly as `tokens.ts` did it before W2. It lives here so
// §1 can measure what changed instead of asserting that something did.
function mostFrequentBrandColor(css) {
  const counts = new Map()
  const hexToHsl = hex => {
    const m = /^#([0-9a-f]{6})/.exec(hex)
    if (!m) return null
    const i = parseInt(m[1], 16)
    const r = ((i >> 16) & 255) / 255, g = ((i >> 8) & 255) / 255, b = (i & 255) / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
    const s = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn)
    return [0, s, l]
  }
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    let hex = m[0].toLowerCase()
    if (/^#[0-9a-f]{3}$/.test(hex)) hex = '#' + hex.slice(1).split('').map(c => c + c).join('')
    if (!/^#[0-9a-f]{6}$/.test(hex)) continue
    const hsl = hexToHsl(hex)
    if (!hsl || !(hsl[1] > 0.25 && hsl[2] > 0.12 && hsl[2] < 0.88)) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  let best = null, bestN = 0
  for (const [hex, n] of counts) if (n > bestN) { best = hex; bestN = n }
  return best
}

// ── load the cached corpus ───────────────────────────────────────────────────
function loadCase(c) {
  const file = path.join(HTML_DIR, `${c.id}.html`)
  if (!existsSync(file)) return null
  const html = readFileSync(file, 'utf8')
  const base = new URL(c.url)
  const { urls, inline, fontLinks } = collectStylesheets(html, base)
  const cssTexts = [...inline]
  let budget = CSS_BUDGET
  for (const u of urls.slice(0, MAX_SHEETS)) {
    const key = sha1(u).slice(0, 20)
    const f = path.join(CSS_DIR, `${key}.css`)
    if (!existsSync(f) || budget <= 0) continue
    const css = readFileSync(f, 'utf8')
    const slice = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
    budget -= slice.length
    if (slice) cssTexts.push(slice)
  }
  return { ...c, html, cssTexts, fontLinks }
}

console.log('THE EYE — evidence over the cached Barcelona-100')
if (!existsSync(HTML_DIR)) {
  console.error('\n✗ no .grabber-cache — run `npm run grabber:eval` once to snapshot the corpus')
  process.exit(1)
}

const loaded = EVAL_DATASET.map(loadCase).filter(Boolean)
console.log(`  ${loaded.length}/${EVAL_DATASET.length} cached pages`)

const read = []
for (const c of loaded) {
  let split = { top: '', bottom: '', bodyAttrs: '' }
  try { split = splitPageChrome(c.html, new URL(c.url)) } catch { /* evidence still runs */ }
  let ev = null
  try {
    ev = readEvidence({
      url: c.url, html: c.html, cssTexts: c.cssTexts, fontLinks: c.fontLinks,
      chrome: { top: split.top, bottom: split.bottom, bodyAttrs: split.bodyAttrs },
    })
  } catch (e) {
    ok(false, `${c.id}: readEvidence threw — ${e.message}`)
  }
  if (ev) read.push({ c, ev })
}
ok(read.length === loaded.length, `${loaded.length - read.length} cases failed to produce evidence`)

// ─── 1. PROMINENCE vs FREQUENCY ──────────────────────────────────────────────

head('1. COLOUR — prominence vs frequency')

let disagreed = 0
const examples = []
for (const { c, ev } of read) {
  const old = mostFrequentBrandColor(c.cssTexts.join('\n'))
  const now = ev.palette.brand
  if (!old || !now) continue
  if (old !== now) {
    disagreed++
    if (examples.length < 6) {
      const hit = ev.palette.ranked.find(h => h.hex === now)
      examples.push(`${c.id.padEnd(20)} frequency said ${old}  ·  prominence says ${now}  (${hit?.why ?? ''})`)
    }
  }
}
const rate = Math.round((disagreed / read.length) * 100)
note('sites where the two extractors disagree', `${disagreed}/${read.length} (${rate}%)`)
for (const e of examples) note('  ' + e)
ok(disagreed > 0, 'prominence weighting changed nothing — it is not doing any work')
ok(rate < 80, `the extractors disagree on ${rate}% of sites, which is a rewrite rather than a refinement`)

// Every ranked hit must carry a REASON. A weight with no explanation is a number
// nobody can argue with, which is how heuristics rot.
ok(read.every(r => r.ev.palette.ranked.every(h => h.why && h.weight > 0)), 'a ranked colour arrived with no reason attached')

// ─── 2. THE TYPE CLASSIFIER ──────────────────────────────────────────────────

head('2. TYPE — a classification, not a string')

const bySource = { catalogue: 0, known: 0, heuristic: 0 }
const byCategory = new Map()
for (const { ev } of read) {
  bySource[ev.type.heading.source]++
  byCategory.set(ev.type.heading.category, (byCategory.get(ev.type.heading.category) ?? 0) + 1)
}
note('heading faces resolved via', Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(' · '))
note('heading categories', [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))

const confident = bySource.catalogue + bySource.known
ok(confident / read.length >= 0.5, `only ${Math.round((confident / read.length) * 100)}% of heading faces were recognised by name — the classifier table is too thin`)

// Spot-checks: the classifier must get the ones that MATTER right, because
// `display-serif` is what triggers the needs-air cohesion rule.
const spot = [
  ["'Playfair Display', serif", 'display-serif', 'high'],
  ["'Cormorant Garamond', Georgia, serif", 'display-serif', 'high'],
  ["'Space Grotesk', system-ui, sans-serif", 'grotesk', 'low'],
  ["'Poppins', sans-serif", 'geometric', 'low'],
  ["Georgia, 'Times New Roman', serif", 'serif', 'medium'],
  ["'JetBrains Mono', monospace", 'mono', 'low'],
  ["'Some Unknown Display Face', serif", 'display-serif', 'high'],
  ["'Totally Made Up', Georgia, serif", 'serif', 'medium'],
]
for (const [stack, cat, contrast] of spot) {
  const t = classifyFont(stack)
  ok(t.category === cat, `classifyFont(${stack}) → ${t.category}, expected ${cat}`)
  ok(t.contrast === contrast, `classifyFont(${stack}) contrast → ${t.contrast}, expected ${contrast}`)
}

const scaled = read.filter(r => r.ev.type.scale.score !== null)
note('sites declaring enough bare heading sizes to judge a scale', `${scaled.length}/${read.length}`)
if (scaled.length) {
  const avg = Math.round(scaled.reduce((a, r) => a + r.ev.type.scale.score, 0) / scaled.length)
  note('average type-scale sanity among those', `${avg}/100`)
}

// ─── 3. SOURCE QUALITY ───────────────────────────────────────────────────────

head('3. SOURCE QUALITY — the judgement that makes this a design tool')

const buckets = { inherit: [], 'inherit-brand-only': [], 'start-fresh': [] }
for (const { c, ev } of read) buckets[ev.sourceQuality.verdict].push({ c, ev })
for (const [k, v] of Object.entries(buckets)) {
  note(k.padEnd(20), `${v.length} sites (${Math.round((v.length / read.length) * 100)}%)`)
}

// THE SCORER'S RANGE IS UNIT-TESTED; THE CORPUS'S SHAPE IS ONLY REPORTED.
//
// The first draft asserted that all three buckets must be populated by the
// Barcelona-100. That is the same mistake W1 made with mode share: it demands a
// property of the WORLD in order to test a property of the CODE. If every site in
// a corpus of 2026 small-business pages is genuinely worth inheriting from, an
// empty `start-fresh` bucket is a finding about Barcelona, not a bug in the scorer.
//
// So the range is proven against two synthetic documents whose verdict is not in
// doubt, and the corpus distribution is printed as evidence rather than asserted.
const PRISTINE = {
  url: 'https://good.test/',
  html: `<!doctype html><html><head><meta name="viewport" content="width=device-width">
    <meta name="theme-color" content="#1f4d7a"></head><body>
    <header class="site-header"><a class="logo">Studio</a></header>
    <main><section><h1>A headline</h1><p>Body copy that is long enough to matter.</p></section></main>
    <footer class="footer">© 2026</footer></body></html>`,
  cssTexts: [`:root{--brand:#1f4d7a}
    body{background:#ffffff;color:#16202b;font-size:17px;font-family:'Inter',sans-serif}
    a{color:#1f4d7a}
    h1{font-size:3rem}h2{font-size:2.25rem}h3{font-size:1.7rem}h4{font-size:1.3rem}
    .site-header{background:#ffffff;padding:4rem 2rem}
    section{padding:6rem 0;display:grid}
    @media (min-width:900px){section{padding:8rem 0}}`],
}
const NINETEEN_NINETY_EIGHT = {
  url: 'https://old.test/',
  html: `<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"><html><body bgcolor="#cccccc">
    <table width="760" cellpadding="4" cellspacing="0" border="1"><tr><td valign="top">
    <font size="2"><center>Benvinguts</center></font>
    <table width="100%"><tr><td>nested</td></tr></table>
    </td></tr></table></body></html>`,
  cssTexts: [`body{background:#cccccc;color:#b0b0b0;font-size:11px}
    a{color:#c8c8b4}
    h1{font-size:14px}h2{font-size:22px}h3{font-size:13px}h4{font-size:13px}
    .col{float:left;width:240px}.col2{float:right;width:500px}.clearfix{zoom:1}
    .a{background:#ff0000}.b{background:#00ff00}.c{background:#0000ff}
    .d{background:#ff00ff}.e{background:#ffff00}.f{background:#00ffff}
    .g{filter:progid:DXImageTransform.Microsoft.gradient(startColorstr='#ff0000')}`],
}
const pristine = readEvidence(PRISTINE)
const old1998 = readEvidence(NINETEEN_NINETY_EIGHT)
note('synthetic pristine page', `${pristine.sourceQuality.score}/100 → ${pristine.sourceQuality.verdict}`)
note('synthetic 1998 page', `${old1998.sourceQuality.score}/100 → ${old1998.sourceQuality.verdict}`)
for (const d of old1998.sourceQuality.deductions) note(`  −${d.points} ${d.axis}`, d.why)
ok(pristine.sourceQuality.verdict === 'inherit', `a well-built page scored ${pristine.sourceQuality.score} → ${pristine.sourceQuality.verdict}`)
ok(old1998.sourceQuality.verdict === 'start-fresh', `a table-layout 1998 page scored ${old1998.sourceQuality.score} → ${old1998.sourceQuality.verdict}`)
ok(
  pristine.sourceQuality.score - old1998.sourceQuality.score >= 40,
  `only ${pristine.sourceQuality.score - old1998.sourceQuality.score} points separate a pristine page from a 1998 one — the scorer barely discriminates`,
)

// The corpus must at least SPREAD. A scorer that returns the same number for every
// real site is a constant wearing a lab coat, whatever its range in the lab.
const scores = read.map(r => r.ev.sourceQuality.score).sort((a, b) => a - b)
const pct = p => scores[Math.floor((scores.length - 1) * p)]
note('corpus score spread', `min ${scores[0]} · p25 ${pct(0.25)} · median ${pct(0.5)} · p75 ${pct(0.75)} · max ${scores[scores.length - 1]}`)
ok(pct(0.75) - pct(0.25) >= 12, `the interquartile spread is only ${pct(0.75) - pct(0.25)} points — the scorer is not discriminating between real sites`)

// `null < 4.5` is true in JavaScript, so counting unknowns as failures is one
// keystroke away at all times. Measured and unmeasured are reported separately.
const measuredBody = read.filter(r => r.ev.sourceQuality.reading.bodyRatio !== null)
const measuredLink = read.filter(r => r.ev.sourceQuality.reading.linkRatio !== null)
const failingBody = measuredBody.filter(r => r.ev.sourceQuality.reading.bodyRatio < 4.5).length
const failingLinks = measuredLink.filter(r => r.ev.sourceQuality.reading.linkRatio < 4.5).length
note('body text below AA', `${failingBody}/${measuredBody.length} measured (${read.length - measuredBody.length} pairs unreadable — not counted against them)`)
note('links below AA', `${failingLinks}/${measuredLink.length} measured (${read.length - measuredLink.length} unreadable)`)
ok(
  measuredBody.length >= read.length * 0.7,
  `only ${measuredBody.length}/${read.length} body pairs were readable — the reading axis is mostly guessing`,
)

ok(read.every(r => r.ev.sourceQuality.score >= 0 && r.ev.sourceQuality.score <= 100), 'a sourceQuality score fell outside 0..100')
ok(
  read.every(r => {
    const { score, verdict } = r.ev.sourceQuality
    return verdict === (score >= 70 ? 'inherit' : score >= 45 ? 'inherit-brand-only' : 'start-fresh')
  }),
  'a verdict disagrees with its own score',
)
// Every deduction must be explainable — this is what the reveal quotes to an owner.
ok(
  read.every(r => r.ev.sourceQuality.deductions.every(d => d.why && d.points > 0)),
  'a deduction arrived with no reason or no points',
)

const sorted = [...read].sort((a, b) => b.ev.sourceQuality.score - a.ev.sourceQuality.score)
const show = [sorted[0], sorted[1], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 2], sorted[sorted.length - 1]]
console.log('\n    — worked examples ' + '─'.repeat(52))
for (const { c, ev } of show) {
  const q = ev.sourceQuality
  console.log(`\n    ${c.name} (${c.id})`)
  console.log(`      ${q.score}/100 → ${q.verdict.toUpperCase()}`)
  console.log(`      ${q.summary}`)
  console.log(`      brand ${ev.palette.brand ?? '—'} · ${ev.palette.coherence.note}`)
  console.log(`      heading ${ev.type.heading.family} (${ev.type.heading.category}, ${ev.type.heading.contrast} contrast, via ${ev.type.heading.source})`)
  console.log(`      density ${ev.density.verdict} — ${ev.density.note}`)
  console.log(`      register prior: ${ev.registerPrior.register} — ${ev.registerPrior.why}`)
  if (q.deductions.length) {
    for (const d of q.deductions) console.log(`      −${String(d.points).padStart(2)}  ${d.axis.padEnd(11)} ${d.why}`)
  } else {
    console.log('      no deductions')
  }
}
console.log('')

// ─── 4. THE REGISTER PRIOR ───────────────────────────────────────────────────

head('4. REGISTER PRIOR — the seed of W3')

const priors = new Map()
for (const { ev } of read) priors.set(ev.registerPrior.register, (priors.get(ev.registerPrior.register) ?? 0) + 1)
for (const [k, v] of [...priors.entries()].sort((a, b) => b[1] - a[1])) {
  note(k.padEnd(14), `${v} (${Math.round((v / read.length) * 100)}%)`)
}
const topShare = Math.max(...priors.values()) / read.length
ok(priors.size >= 4, `only ${priors.size} distinct registers across ${read.length} real businesses — the prior is not discriminating`)
note('most common prior', `${Math.round(topShare * 100)}% — concentrated, and honestly so: most small-business sites ARE sans at ordinary density`)

// The prior is allowed to be concentrated. What is NOT allowed is for that
// concentration to reach the customer, because three identical designs is the
// distinctiveness funnel arriving through the front door. The variant ladder is
// what stops it, so the ladder is what gets asserted.
const spread = new Set()
for (const [prior] of priors) {
  const v = registerVariants(prior)
  const three = [v.faithful, v.elevated, v.reimagined]
  ok(new Set(three).size === 3, `registerVariants(${prior}) repeats a register: ${three.join(', ')}`)
  ok(v.faithful === prior, `registerVariants(${prior}).faithful must keep the source's own register`)
  for (const r of three) spread.add(r)
}
note('registers reachable across the corpus once variants are applied', `${spread.size}/6`)
ok(spread.size >= 5, `the variant ladder only reaches ${spread.size} of 6 registers — customers will see a narrow slice of the system`)

// And the share after spreading: every site now contributes three registers, so the
// number that matters for the funnel is the share across ALL offered designs.
const offered = new Map()
for (const { ev } of read) {
  const v = registerVariants(ev.registerPrior.register)
  for (const r of [v.faithful, v.elevated, v.reimagined]) offered.set(r, (offered.get(r) ?? 0) + 1)
}
const offeredTop = Math.max(...offered.values()) / (read.length * 3)
note('most common register across everything actually OFFERED', `${Math.round(offeredTop * 100)}%`)
ok(offeredTop <= 0.45, `${Math.round(offeredTop * 100)}% of offered designs share one register — the funnel survived the ladder`)

// ─── 5. ROBUSTNESS ───────────────────────────────────────────────────────────

head('5. ROBUSTNESS — real markup is hostile')

const HOSTILE = [
  { url: 'https://x.test/', html: '', cssTexts: [] },
  { url: 'https://x.test/', html: '<html><body><p>hi', cssTexts: ['body{color:'] },
  { url: 'https://x.test/', html: '<table width=600><tr><td><font size=3>1998</font>', cssTexts: ['.a{float:left}'] },
  { url: 'https://x.test/', html: '<div style="color:#fff">'.repeat(500), cssTexts: ['a{color:#000}'.repeat(2000)] },
  { url: 'https://x.test/', html: '<meta name="theme-color" content="}</style><script>">', cssTexts: [] },
]
for (const h of HOSTILE) {
  let ev = null
  try { ev = readEvidence(h) } catch (e) { ok(false, `readEvidence threw on hostile input: ${e.message}`) }
  if (!ev) continue
  ok(['inherit', 'inherit-brand-only', 'start-fresh'].includes(ev.sourceQuality.verdict), 'hostile input produced an invalid verdict')
  ok(!/[{}<>;]/.test(String(ev.palette.brand ?? '')), 'a brand colour carried a CSS-structural character')
}
console.log(`  ✓ ${HOSTILE.length} hostile documents: no throw, valid verdict, no CSS escape`)

// ─── 6. DETERMINISM ──────────────────────────────────────────────────────────

head('6. DETERMINISM')

const sample = read.slice(0, 12)
let drift = 0
for (const { c, ev } of sample) {
  let split = { top: '', bottom: '', bodyAttrs: '' }
  try { split = splitPageChrome(c.html, new URL(c.url)) } catch { /* same as above */ }
  const again = readEvidence({
    url: c.url, html: c.html, cssTexts: c.cssTexts, fontLinks: c.fontLinks,
    chrome: { top: split.top, bottom: split.bottom, bodyAttrs: split.bodyAttrs },
  })
  if (JSON.stringify(again) !== JSON.stringify(ev)) { drift++; console.error(`  ✗ ${c.id} read differently on a second pass`) }
}
ok(drift === 0, `${drift}/${sample.length} cases were not deterministic`)
if (!drift) console.log(`  ✓ ${sample.length} cases re-read byte-identically`)

// Also: `rankBrandColors` must be stable without a DOM (the Studio calls it that way).
const noDom = rankBrandColors({ cssTexts: ['.brand{background:#b5451f}.x{color:#111}'], root: null })
ok(noDom.length > 0 && noDom[0].hex === '#b5451f', 'rankBrandColors without a DOM did not find the obvious brand colour')

// ─── --show ──────────────────────────────────────────────────────────────────

if (SHOW) {
  const one = read.find(r => r.c.id === SHOW)
  if (!one) console.error(`\n(no cached case "${SHOW}")`)
  else console.log(`\n${JSON.stringify(one.ev, null, 2)}`)
}

console.log(`\n${fail === 0 ? '✓' : '✗'} the eye: ${pass} passed, ${fail} failed`)
if (fail) { console.error('\nFailures:'); for (const f of fails) console.error('  · ' + f); process.exit(1) }
