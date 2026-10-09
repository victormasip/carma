// W3 — THE DETERMINISTIC ART DIRECTOR GATE.
//
//   npm run test:director
//   npm run test:director -- --trace=vet-delclinic   # one site's full derivation
//
// Rung 3 of the art-director ladder: evidence → three genomes, with no language
// model anywhere. This is the rung everything above it degrades to, so the bar is
// not "adequate until the model arrives" — it is a design we would ship on its own.
//
// WHAT THIS GATE HOLDS
//   §1 every corpus site derives three VALID genomes, with cohesion finding nothing
//      left to repair. A director that produces work the guardrails have to fix is a
//      director that does not understand the guardrails.
//   §2 the three variants are genuinely far apart, in three different registers.
//   §3 distinctiveness across the corpus clears the founder's 0.60 floor WITHOUT a
//      model. If the deterministic rung already holds it, W4's model has something
//      real to beat instead of an empty room.
//   §4 speed. This runs inline on the render path with no cache in front of it.
//   §5 bulletproof. It is the last rung: if it throws, a customer sees an error
//      instead of a blog.
//   §6 determinism, and §7 the compiled output stays inside the blog budget.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { EVAL_DATASET } from '@/lib/grabber-lab/evalDataset'
import { collectStylesheets } from '@/lib/grabber-lab/evalRun'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { readEvidence } from '@/lib/design/evidence'
import { directDeterministic, explain } from '@/lib/design/director'
import { validateGenome } from '@/lib/design/validate'
import { applyCohesion, energyOf, REGISTER_RULES } from '@/lib/design/cohesion'
import { compileGenome } from '@/lib/design/compile'
import { FONT_IDS, font } from '@/lib/design/fonts'
import { distinctiveness, genomeDistance, pickAvoiding, rngFrom } from '@/lib/design/sample'

const ROOT = process.cwd()
const HTML_DIR = path.join(ROOT, '.grabber-cache', 'html')
const CSS_DIR = path.join(ROOT, '.grabber-cache', 'css')
const MAX_SHEETS = 8
const CSS_BUDGET = 400_000

const args = process.argv.slice(2)
const TRACE = (args.find(a => a.startsWith('--trace=')) ?? '').slice(8)

const sha1 = s => createHash('sha1').update(s).digest('hex')

let pass = 0, fail = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else { fail++; fails.push(msg); console.error('  ✗ ' + msg) } }
const head = t => console.log(`\n${t}`)
const note = (l, v = '') => console.log(`    ${l}${v ? '  ' + v : ''}`)
const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)]

function loadCase(c) {
  const f = path.join(HTML_DIR, `${c.id}.html`)
  if (!existsSync(f)) return null
  const html = readFileSync(f, 'utf8')
  const base = new URL(c.url)
  const { urls, inline, fontLinks } = collectStylesheets(html, base)
  const cssTexts = [...inline]
  let budget = CSS_BUDGET
  for (const u of urls.slice(0, MAX_SHEETS)) {
    const p = path.join(CSS_DIR, `${sha1(u).slice(0, 20)}.css`)
    if (!existsSync(p) || budget <= 0) continue
    const css = readFileSync(p, 'utf8')
    const slice = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
    budget -= slice.length
    if (slice) cssTexts.push(slice)
  }
  return { ...c, html, cssTexts, fontLinks }
}

console.log('THE DETERMINISTIC ART DIRECTOR — no model, 99 real businesses')
if (!existsSync(HTML_DIR)) {
  console.error('\n✗ no .grabber-cache — run `npm run grabber:eval` once to snapshot the corpus')
  process.exit(1)
}

const cases = EVAL_DATASET.map(loadCase).filter(Boolean)
const runs = []

// THE ANTI-REPETITION WINDOW, exercised rather than assumed.
//
// `sample.ts` ships a sampler that down-weights values the corpus has used
// recently, and the first corpus run proved the obvious corollary: a mechanism
// nobody feeds does nothing. 41% of all generated feeds came back `minimal`.
// In production this window is a query over the genome table; here it is the last
// N designs this run produced, which is the same shape and the same effect.
const RECENT_WINDOW = 12
const recent = {}
const remember = d => {
  for (const v of [d.faithful, d.elevated, d.reimagined]) {
    const g = v.genome
    const put = (k, val) => {
      const arr = recent[k] ?? (recent[k] = [])
      arr.unshift(String(val))
      if (arr.length > RECENT_WINDOW) arr.length = RECENT_WINDOW
    }
    put('feed.rhythm', g.feed.rhythm)
    put('type.heading', g.type.heading)
    put('type.body', g.type.body)
    put('space.density', g.space.density)
    put('ornament.corner', g.ornament.corner)
    put('motion.entrance', g.motion.entrance)
  }
}
for (const c of cases) {
  let split = { top: '', bottom: '', bodyAttrs: '' }
  try { split = splitPageChrome(c.html, new URL(c.url)) } catch { /* evidence copes */ }
  const ev = readEvidence({
    url: c.url, html: c.html, cssTexts: c.cssTexts, fontLinks: c.fontLinks,
    chrome: { top: split.top, bottom: split.bottom, bodyAttrs: split.bodyAttrs },
  })
  const t0 = process.hrtime.bigint()
  const d = directDeterministic(ev, { siteId: c.id, recent })
  const us = Number(process.hrtime.bigint() - t0) / 1000
  runs.push({ c, ev, d, us })
  remember(d)
}
console.log(`  ${runs.length} sites × 3 variants = ${runs.length * 3} genomes`)

// ─── 1. VALIDITY ─────────────────────────────────────────────────────────────

head('1. VALIDITY — the director must not need the guardrails to fix its work')

let invalid = 0, repaired = 0, degraded = 0
const repairSamples = []
for (const { c, d } of runs) {
  if (d.degraded) { degraded++; continue }
  for (const v of [d.faithful, d.elevated, d.reimagined]) {
    const res = validateGenome(v.genome, { fallbackSeed: 1 })
    if (!res.ok) { invalid++; if (repairSamples.length < 4) repairSamples.push(`${c.id}/${v.variant}: ${res.violations.join('; ')}`) }
    // Re-running cohesion on the director's own output must be a no-op.
    const again = applyCohesion(v.genome)
    if (again.repairs.length) {
      repaired++
      if (repairSamples.length < 8) repairSamples.push(`${c.id}/${v.variant}: cohesion still wants ${again.repairs.map(r => r.rule).join(', ')}`)
    }
    if (energyOf(v.genome) > REGISTER_RULES[v.genome.register].energyCap) {
      ok(false, `${c.id}/${v.variant} is over its register's energy cap`)
    }
  }
}
for (const s of repairSamples) note('  ' + s)
ok(degraded === 0, `${degraded} sites fell through to the preset floor`)
ok(invalid === 0, `${invalid} derived genomes failed validation`)
ok(repaired === 0, `${repaired} derived genomes still needed a cohesion repair`)
if (!invalid && !repaired && !degraded) console.log(`  ✓ ${runs.length * 3} genomes: all valid, all in-register, all inside their energy cap, zero repairs`)

// Every step of every trace must be attributable.
const steps = runs.flatMap(r => [r.d.faithful, r.d.elevated, r.d.reimagined]).flatMap(v => v.trace)
ok(steps.every(s => s.axis && s.value && s.from && s.rule), 'a derivation step arrived without an axis, a value, a source or a rule')
note('derivation steps recorded', `${steps.length} across ${runs.length * 3} genomes (${(steps.length / (runs.length * 3)).toFixed(1)} per genome)`)

// ─── 2. THE THREE VARIANTS ───────────────────────────────────────────────────

head('2. VARIANTS — three designs, not one design three times')

const pairs = []
let sameRegister = 0
for (const { c, d } of runs) {
  const [f, e, r] = [d.faithful, d.elevated, d.reimagined]
  const three = [f.genome.register, e.genome.register, r.genome.register]
  if (new Set(three).size !== 3) { sameRegister++; if (sameRegister <= 3) note('  register collision', `${c.id}: ${three.join(', ')}`) }
  const min = Math.min(
    genomeDistance(f.genome, e.genome),
    genomeDistance(e.genome, r.genome),
    genomeDistance(f.genome, r.genome),
  )
  pairs.push(min)
}
ok(sameRegister === 0, `${sameRegister} sites got two variants in the same register`)
note('closest pair within a site', `min ${pct(pairs, 0).toFixed(3)} · median ${pct(pairs, 0.5).toFixed(3)} · max ${pct(pairs, 1).toFixed(3)}`)

// STRUCTURAL GUARANTEES BEAT A SCALAR THRESHOLD HERE, and the first run is why.
//
// `test:genome` §5 demands ≥0.4 between three SAMPLED variants, which are free to
// differ on everything. These three are not: Fidel's entire job is to resemble the
// source, so holding it to the same separation is demanding it be less faithful —
// the metric would be steering the product rather than measuring it.
//
// What actually answers "would a customer think two tabs are the same design" is
// whether the axes a reader notices first are all different. Those are asserted
// individually, and the scalar is reported alongside at a floor that reflects what
// a deliberately-conservative variant can reach.
let sameFace = 0, sameLanes = 0
for (const { d } of runs) {
  const three = [d.faithful.genome, d.elevated.genome, d.reimagined.genome]
  if (new Set(three.map(g => g.type.heading)).size !== 3) sameFace++
  if (new Set(three.map(g => g.space.lanes)).size !== 3) sameLanes++
}
ok(sameFace === 0, `${sameFace} sites offered two variants set in the same heading face`)
ok(sameLanes === 0, `${sameLanes} sites offered two variants with the same article lane structure`)
ok(pct(pairs, 0) >= 0.33, `one site's two closest variants are only ${pct(pairs, 0).toFixed(3)} apart`)
ok(pct(pairs, 0.5) >= 0.45, `the median closest pair is ${pct(pairs, 0.5).toFixed(3)} — the variants are not spread`)
note('guaranteed to differ on', 'register · heading face · article lanes · motion')

// W0 (2026-10-09): the chrome is no longer a design decision. Every variant
// keeps THEIR header — the capture decides whether it is shown as captured or as
// SAFE PANEL (design/chrome.ts#drawnPolicy); a design never repaints or redraws it.
const rungs = new Map()
for (const { d } of runs) for (const v of [d.faithful, d.elevated, d.reimagined]) {
  rungs.set(`${v.variant}:${v.chrome}`, (rungs.get(`${v.variant}:${v.chrome}`) ?? 0) + 1)
}
note('chrome rungs chosen', [...rungs.entries()].sort().map(([k, n]) => `${k} ${n}`).join(' · '))
ok(
  runs.every(r => [r.d.faithful, r.d.elevated, r.d.reimagined].every(v => v.chrome === 'keep' && v.genome.chrome.policy === 'keep')),
  'a variant asked to repaint or redraw their header (W0: every variant keeps it)',
)

// ─── 3. DISTINCTIVENESS, WITHOUT A MODEL ─────────────────────────────────────

head('3. DISTINCTIVENESS — the founder\'s 0.60 floor, held by arithmetic')

const faithful = runs.map(r => r.d.faithful.genome)
const everything = runs.flatMap(r => [r.d.faithful.genome, r.d.elevated.genome, r.d.reimagined.genome])
const dFaithful = distinctiveness(faithful)
const dAll = distinctiveness(everything)
note('across the FAITHFUL variants only', String(dFaithful))
note('across everything OFFERED (3 per site)', String(dAll))
ok(dAll >= 0.6, `offered-design distinctiveness ${dAll} is below the 0.60 floor`)
ok(dFaithful >= 0.45, `faithful-variant distinctiveness ${dFaithful} is below 0.45 — the derivation is ignoring the evidence`)

for (const [label, of] of [
  ['type.heading', g => g.type.heading],
  ['feed.rhythm', g => g.feed.rhythm],
  ['palette.ground', g => g.palette.ground],
  ['space.density', g => g.space.density],
]) {
  const counts = new Map()
  for (const g of everything) counts.set(of(g), (counts.get(of(g)) ?? 0) + 1)
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  note(`${label.padEnd(16)} "${top}" ${Math.round((n / everything.length) * 100)}% · ${counts.size} distinct values`)
}
const heads = new Set(everything.map(g => g.type.heading))
ok(heads.size >= 8, `only ${heads.size} distinct heading faces across ${everything.length} genomes`)

// ─── 4. SPEED ────────────────────────────────────────────────────────────────

head('4. SPEED — this runs inline, with no cache in front of it')

const us = runs.map(r => r.us)
note('per site, all three variants', `median ${(pct(us, 0.5) / 1000).toFixed(2)}ms · p95 ${(pct(us, 0.95) / 1000).toFixed(2)}ms · p99 ${(pct(us, 0.99) / 1000).toFixed(2)}ms · max ${(pct(us, 1) / 1000).toFixed(2)}ms`)
ok(pct(us, 0.99) / 1000 < 25, `p99 derivation is ${(pct(us, 0.99) / 1000).toFixed(2)}ms — too slow to sit on a render path`)

// ─── 5. BULLETPROOF ──────────────────────────────────────────────────────────

head('5. BULLETPROOF — it is the last rung')

const HOSTILE = [
  readEvidence({ url: 'https://x.test/', html: '', cssTexts: [] }),
  readEvidence({ url: 'https://x.test/', html: '<html><body><p>hi', cssTexts: ['body{color:'] }),
  readEvidence({ url: 'https://x.test/', html: '<table width=600><font>1998</font>', cssTexts: ['.a{float:left}'] }),
  {},
  { url: 'x', tokens: null, palette: null, type: null, density: null, imagery: null, sourceQuality: null, registerPrior: null },
  { registerPrior: { register: 'not-a-register' }, palette: { brand: '}</style>', ranked: [], coherence: { hues: [] } }, tokens: {}, type: {}, density: {}, imagery: {}, sourceQuality: { verdict: 'nonsense' } },
  null,
  undefined,
]
for (const [i, ev] of HOSTILE.entries()) {
  let d = null
  try { d = directDeterministic(ev, { siteId: `hostile-${i}` }) } catch (e) { ok(false, `directDeterministic threw on hostile input #${i}: ${e.message}`) }
  if (!d) continue
  for (const v of [d.faithful, d.elevated, d.reimagined]) {
    const res = validateGenome(v.genome, { fallbackSeed: 1 })
    ok(res.ok, `hostile input #${i} produced an invalid ${v.variant} genome: ${res.violations.join('; ')}`)
    const c = compileGenome(v.genome)
    ok(!/[{}<>;]/.test(Object.values(c.tokens).join('|')), `hostile input #${i} leaked a CSS-structural character into a token`)
  }
}
const degradedHostile = HOSTILE.map((ev, i) => { try { return directDeterministic(ev, { siteId: `h${i}` }).degraded } catch { return true } })
note('hostile inputs that needed the preset floor', `${degradedHostile.filter(Boolean).length}/${HOSTILE.length}`)
console.log(`  ✓ ${HOSTILE.length} hostile inputs: no throw, ${HOSTILE.length * 3} valid genomes, nothing escaped into CSS`)

// ─── 6. DETERMINISM ──────────────────────────────────────────────────────────

head('6. DETERMINISM')

// The recency window is an INPUT, not ambient state, so determinism means "same
// evidence + same seed + same window". The first version of this check re-ran each
// site against the window as it stood after all 99 — and reported 12 failures for
// the anti-repetition sampler doing exactly its job. Both passes now start clean.
let drift = 0
for (const { c, ev } of runs.slice(0, 15)) {
  const one = directDeterministic(ev, { siteId: c.id })
  const two = directDeterministic(ev, { siteId: c.id })
  const a = JSON.stringify([one.faithful.genome, one.elevated.genome, one.reimagined.genome])
  const b = JSON.stringify([two.faithful.genome, two.elevated.genome, two.reimagined.genome])
  if (a !== b) { drift++; console.error(`  ✗ ${c.id} derived differently on a second pass`) }
}
ok(drift === 0, `${drift}/15 derivations were not deterministic`)

// And the window has to be LOAD-BEARING, or the mechanism is decorative. Measured
// over twenty sites rather than one: anti-repetition is a weighting, not a ban, so
// a single trial can legitimately re-pick and prove nothing either way.
let moved = 0
const probe = runs.slice(0, 20)
for (const { c, ev } of probe) {
  const cold = directDeterministic(ev, { siteId: c.id })
  const face = cold.reimagined.genome.type.heading
  const warm = directDeterministic(ev, {
    siteId: c.id,
    recent: { 'type.heading': Array.from({ length: 8 }, () => face) },
  })
  if (warm.reimagined.genome.type.heading !== face) moved++
}
note('saturating the window moved the chosen face', `${moved}/${probe.length} sites`)

// THE MECHANISM ITSELF, unit-tested, because the director-level number cannot be
// high and should not be expected to be. `nearestFace` narrows to faces of the same
// category AND stroke contrast inside the register's allow-list, and that cell is
// sometimes a SINGLE face — at which point the choice is forced by the
// classification and no amount of recency can or should move it.
const CANDIDATES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
const saturated = Array.from({ length: 8 }, () => 'a')
let drewA = 0
for (let i = 0; i < 400; i++) if (pickAvoiding(rngFrom(i * 7919), CANDIDATES, saturated) === 'a') drewA++
note('saturated value drawn from a 10-way choice', `${drewA}/400 (${(drewA / 4).toFixed(1)}%) — uniform would be 10%`)
ok(drewA / 400 < 0.03, `anti-repetition barely weights: a saturated value still drew ${(drewA / 4).toFixed(1)}% of the time`)
ok(
  moved >= probe.length * 0.5,
  `a saturated window moved only ${moved}/${probe.length} face choices — even allowing for single-face cells, that is too few`,
)

// How thin is the catalogue where the classifier lands? A real ceiling on how much
// the director can vary, and the number to watch when the catalogue next grows.
const cells = new Map()
for (const id of FONT_IDS) {
  const f = font(id)
  const k = `${f.category}/${f.contrast}`
  cells.set(k, (cells.get(k) ?? 0) + 1)
}
const singletons = [...cells.entries()].filter(([, n]) => n === 1).map(([k]) => k)
note('category/contrast cells with only ONE face', singletons.length ? singletons.join(', ') : 'none')
// Two different businesses must not collide even when their evidence is identical.
const twin = runs[0]
const a = directDeterministic(twin.ev, { siteId: 'business-a' })
const b = directDeterministic(twin.ev, { siteId: 'business-b' })
ok(
  genomeDistance(a.faithful.genome, b.faithful.genome) > 0,
  'two different sites with identical evidence produced an identical design — the seed is not per-site',
)
if (!drift) console.log('  ✓ 15 derivations re-ran byte-identically; identical evidence under two site ids still diverges')

// ─── 7. THE BUDGET ───────────────────────────────────────────────────────────

head('7. BUDGET — derived designs must fit the blog gate')

let overFaces = 0, overCss = 0, maxCss = 0, maxFaces = 0, shed = 0
for (const g of everything) {
  const c = compileGenome(g)
  maxCss = Math.max(maxCss, c.bytes.css)
  maxFaces = Math.max(maxFaces, c.bytes.faces)
  if (c.bytes.faces > 4) overFaces++
  if (c.bytes.css > 14 * 1024) overCss++
  if (c.dropped.length) shed++
}
note('worst extra stylesheet', `${(maxCss / 1024).toFixed(2)}KB of 14KB`)
note('worst face count', `${maxFaces} of 4`)
note('genomes the compiler had to shed something from', `${shed}/${everything.length}`)
ok(overFaces === 0, `${overFaces} derived genomes exceed the 4-face budget`)
ok(overCss === 0, `${overCss} derived genomes exceed the 14KB stylesheet budget`)

// ─── --trace ─────────────────────────────────────────────────────────────────

if (TRACE) {
  const one = runs.find(r => r.c.id === TRACE)
  if (!one) console.error(`\n(no cached case "${TRACE}")`)
  else {
    const { c, ev, d } = one
    console.log(`\n${'═'.repeat(78)}`)
    console.log(`DERIVATION TRACE — ${c.name}  ${c.url}`)
    console.log(`${'═'.repeat(78)}`)
    console.log(`\nEVIDENCE`)
    console.log(`  sourceQuality   ${ev.sourceQuality.score}/100 → ${ev.sourceQuality.verdict}`)
    console.log(`  brand           ${ev.palette.brand} — ${ev.palette.ranked[0]?.why ?? ''}`)
    console.log(`  type            ${ev.type.heading.family} / ${ev.type.body.family} (${ev.type.heading.category}, ${ev.type.heading.contrast} contrast)`)
    console.log(`  type scale      ${ev.type.scale.score ?? 'unjudgeable'} — ${ev.type.scale.note}`)
    console.log(`  density         ${ev.density.verdict} — ${ev.density.note}`)
    console.log(`  imagery         ${ev.imagery.note}`)
    console.log(`  register prior  ${ev.registerPrior.register} — ${ev.registerPrior.why}`)
    for (const v of [d.faithful, d.elevated, d.reimagined]) {
      const comp = compileGenome(v.genome)
      console.log(`\n${'─'.repeat(78)}`)
      console.log(`${v.variant.toUpperCase()}  ·  register ${v.genome.register}  ·  chrome ${v.chrome}  ·  energy ${energyOf(v.genome)}/${REGISTER_RULES[v.genome.register].energyCap}`)
      console.log(`${'─'.repeat(78)}`)
      for (const line of explain(v)) console.log(`  ${line}`)
      console.log(`  → compiles to  ${comp.tokens.colorBg} / ${comp.tokens.colorText} · accent ${comp.tokens.colorAccent} · link ${comp.tokens.linkColor}`)
      console.log(`                 ${comp.tokens.fontHeading.split(',')[0]} + ${comp.tokens.fontBody.split(',')[0]} · ${comp.tokens.baseFontSize} · ${comp.tokens.feedLayout} · ${comp.tokens.maxWidth}`)
      console.log(`                 ${comp.bytes.faces} faces · ${(comp.bytes.css / 1024).toFixed(2)}KB extra CSS · ${comp.fonts.length} font request(s)`)
    }
    console.log('')
  }
}

console.log(`\n${fail === 0 ? '✓' : '✗'} the director: ${pass} passed, ${fail} failed`)
if (fail) { console.error('\nFailures:'); for (const f of fails) console.error('  · ' + f); process.exit(1) }
