// W0 — THE GENOME GATE.
//
//   npm run test:genome
//
// This is the acceptance suite for the generative design engine, and §1 is the one
// the whole wave was bet on:
//
//   Every shipped template, re-expressed as a genome, must compile back to EXACTLY
//   its own tokens, its own font URLs, and an EMPTY extra stylesheet.
//
// If that holds, three things are true at once. The schema is expressive enough to
// carry four months of hand-drawn design. The compiler is not a lookup table, since
// most of those values are derived rather than pinned (§2 counts exactly how many).
// And no customer's blog changes by a single byte when the engine lands, because the
// renderer receives what it receives today.
//
// The rest of the suite guards the four founder critiques that shaped the design:
// cohesion (§3), the untrusted boundary (§4), distinctiveness (§5), contrast (§6)
// and the budget (§7).
//
// Runs through tests/register.mjs so it imports the REAL engine modules.

import { BLOG_TEMPLATES } from '@/lib/render/templates.ts'
import { PRESET_GENOMES } from '@/lib/design/presets.ts'
import { compileGenome } from '@/lib/design/compile.ts'
import { applyCohesion, energyOf, REGISTER_RULES } from '@/lib/design/cohesion.ts'
import { validateGenome } from '@/lib/design/validate.ts'
import { completeGenome, distinctiveness, genomeDistance, seedFrom } from '@/lib/design/sample.ts'
import { derivePalette, ratio, FLOOR } from '@/lib/design/color.ts'
import { REGISTERS } from '@/lib/design/genome.ts'
import { FONT_IDS, font } from '@/lib/design/fonts.ts'

let pass = 0, fail = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else { fail++; fails.push(msg); console.error('  ✗ ' + msg) } }
const head = t => console.log(`\n${t}`)
const note = (l, v = '') => console.log(`    ${l}${v ? '  ' + v : ''}`)

function diffKeys(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  return keys.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
}

// ─── 1. PRESET FIDELITY ───────────────────────────────────────────────────────

head('1. PRESET FIDELITY — the eight, recompiled')

const compiled = new Map()
for (const tpl of BLOG_TEMPLATES) {
  const g = PRESET_GENOMES.find(p => p.id === tpl.id)
  if (!g) { ok(false, `no preset genome for template "${tpl.id}"`); continue }
  const c = compileGenome(g)
  compiled.set(tpl.id, { g, c, tpl })

  const bad = diffKeys(tpl.tokens, c.tokens)
  ok(bad.length === 0, `${tpl.id}: tokens differ on [${bad.map(k => `${k}: ${JSON.stringify(tpl.tokens[k])} → ${JSON.stringify(c.tokens[k])}`).join(', ')}]`)

  const hrefs = c.fonts.map(f => f.href)
  ok(
    JSON.stringify(hrefs) === JSON.stringify(tpl.fontLinks),
    `${tpl.id}: font URLs differ\n      want ${JSON.stringify(tpl.fontLinks)}\n      got  ${JSON.stringify(hrefs)}`,
  )

  ok(c.css === '', `${tpl.id}: extra stylesheet must be empty, got ${c.css.length} chars`)

  const structural = c.repairs.filter(r => !r.rule.startsWith('contrast:reported'))
  ok(structural.length === 0, `${tpl.id}: cohesion repaired a SHIPPED design — ${structural.map(r => r.rule).join(', ')}`)

  ok(c.dropped.length === 0, `${tpl.id}: budget dropped ${c.dropped.map(d => d.layer).join(', ')}`)
}
if (fail === 0) console.log(`  ✓ all ${BLOG_TEMPLATES.length} templates reproduce exactly (tokens, fonts, empty extra CSS)`)

// ─── 2. THE DERIVATION LEDGER ─────────────────────────────────────────────────
//
// Not a pass/fail — a measurement. How much of our own back catalogue falls out of
// the system, and how much was a designer overruling it? A compiler that reproduced
// the eight only because everything was pinned would prove nothing at all.

head('2. DERIVATION LEDGER — what the system derives vs. what a designer pinned')

const AXES = [
  ['base font size', g => g.type.basePx !== undefined],
  ['max width', g => g.space.maxWidthPx !== undefined],
  ['corner radius', g => g.ornament.radiusPx !== undefined || g.ornament.radiusLgPx !== undefined],
  ['section title size', g => g.type.sectionTitleSizeRem !== undefined],
  ['heading weight', g => g.type.headingWeight !== undefined],
  ['section title weight', g => g.type.sectionTitleWeight !== undefined],
]
let derivedTotal = 0, axisTotal = 0
for (const [label, pinned] of AXES) {
  const n = PRESET_GENOMES.filter(g => !pinned(g)).length
  derivedTotal += n; axisTotal += PRESET_GENOMES.length
  note(`${label.padEnd(22)} derived ${n}/${PRESET_GENOMES.length}`)
}
const pct = Math.round((derivedTotal / axisTotal) * 100)
note(`${'—'.repeat(22)} ${derivedTotal}/${axisTotal} (${pct}%) of these values fall out of the genome`)
ok(pct >= 40, `only ${pct}% derived — the compiler is behaving like a lookup table`)

// ─── 3. COHESION — the anti-Frankenstein guardrails ───────────────────────────

head('3. COHESION — monsters must be unrepresentable')

// A deliberate monster, exactly as the founder described it: vivid colour, an
// oldstyle serif, a loud feed and vast spacing, all at once.
const monster = completeGenome({
  register: 'quiet', seed: 1,
  palette: { seed: { l: 0.62, c: 0.3, h: 12 }, scheme: 'triad', ground: 'ink', saturation: 'vivid', contrast: 'AA' },
  type: {
    heading: 'fraunces', body: 'libreBaskerville', scale: 1.618, measure: 96, leading: 'airy',
    headingCase: 'upper', headingTracking: 'tight', figures: 'oldstyle', opticalSizing: true,
  },
  space: { ratio: 1.618, density: 'compact', lanes: 'content-wide-full', rule: 'heavy' },
  feed: { rhythm: 'overlay', mode: 'grid', columns: '4', lead: 'first', numbering: true },
  ornament: { dropCap: 'sunken', quoteMark: 'oversize', grain: 2, divider: 'gradient', corner: 'cut', underline: 'offset' },
  motion: { entrance: 'stagger', hover: 'shift', transition: 'shared-image', intensity: 2 },
  imagery: { treatment: 'duotone', fit: 'cover' },
})
const tamed = applyCohesion(monster)
ok(tamed.repairs.length > 0, 'the monster passed cohesion untouched')
note(`the monster drew ${tamed.repairs.length} repairs:`)
for (const r of tamed.repairs.slice(0, 8)) note(`  · ${r.rule}`, r.why)

ok(
  energyOf(tamed.genome) <= REGISTER_RULES[tamed.genome.register].energyCap,
  `after cohesion the monster still carries ${energyOf(tamed.genome)} loud decisions against a cap of ${REGISTER_RULES.quiet.energyCap}`,
)
ok(tamed.genome.type.measure <= 78, 'measure was not clamped into the readable range')
ok(
  !(tamed.genome.ornament.dropCap !== 'none' && tamed.genome.ornament.quoteMark === 'oversize'),
  'a drop cap and an oversize quote survived together',
)

// Every register, fully sampled, many seeds: cohesion must be a FIXED POINT — run
// it twice and nothing more changes. A guardrail that keeps repairing its own
// repairs is a guardrail that never converges.
let nonIdempotent = 0, overCap = 0
for (const register of REGISTERS) {
  for (let s = 0; s < 120; s++) {
    const g = completeGenome({ register, seed: seedFrom(register, s) })
    const once = applyCohesion(g).genome
    const twice = applyCohesion(once)
    if (twice.repairs.length !== 0) nonIdempotent++
    if (energyOf(once) > REGISTER_RULES[register].energyCap) overCap++
  }
}
ok(nonIdempotent === 0, `${nonIdempotent}/720 sampled genomes were not a cohesion fixed point`)
ok(overCap === 0, `${overCap}/720 sampled genomes were over their register's energy cap`)
if (nonIdempotent === 0 && overCap === 0) console.log('  ✓ 720 sampled genomes: cohesion converges in one pass, all within budget')

// ─── 4. THE UNTRUSTED BOUNDARY ────────────────────────────────────────────────

head('4. VALIDATOR — model output is untrusted input')

const HOSTILE = [
  null, undefined, 42, 'genome', [], {},
  { v: 99, register: 'dropTables' },
  { register: 'quiet', type: { heading: '</style><script>alert(1)</script>', body: 'inter' } },
  { register: 'bold', palette: { pins: { bg: 'red;}html{display:none' } } },
  { register: 'warm', palette: { pins: { accent: 'url(https://evil.example/x)' } } },
  { register: 'classic', button: { bg: 'expression(alert(1))' } },
  { register: 'severe', type: { measure: 1e9, scale: 99 }, space: { maxWidthPx: -5 } },
  { register: 'contemporary', ornament: { grain: 9, radiusPx: 1e6 } },
  { register: 'quiet', budget: { faces: 999, cssKb: 9999, js: 500 } },
]
for (const input of HOSTILE) {
  let res
  try { res = validateGenome(input, { fallbackSeed: 7 }) } catch (e) { ok(false, `validateGenome threw on ${JSON.stringify(input)}: ${e.message}`); continue }
  const c = compileGenome(res.genome)
  const serialised = JSON.stringify(res.genome) + c.css + JSON.stringify(c.tokens)
  ok(!/<script|<\/style|javascript:|expression\(|url\(/i.test(serialised), `hostile input leaked into the output: ${JSON.stringify(input)}`)
  ok(!/[{};<>]/.test(Object.values(c.tokens).join('|')), `a token carried a CSS-structural character for ${JSON.stringify(input)}`)
  ok(c.bytes.faces >= 1, 'a compiled genome must always request at least one face')
}
ok(validateGenome({ register: 'quiet' }).ok === true, 'a minimal valid genome should report ok')
ok(validateGenome({ register: 'nope' }).violations.length > 0, 'an unknown register should be reported')
console.log(`  ✓ ${HOSTILE.length} hostile inputs: no throw, no CSS escape, always compilable`)

// An omitted field must be SAMPLED, never defaulted — this is the architectural
// defence against regression to the mean, so it gets a test rather than a comment.
const sameInput = { register: 'contemporary' }
const a = validateGenome(sameInput, { fallbackSeed: 11 }).genome
const b = validateGenome(sameInput, { fallbackSeed: 12 }).genome
ok(genomeDistance(a, b) > 0, 'two seeds produced an identical genome from the same input — something is defaulting')
const a2 = validateGenome(sameInput, { fallbackSeed: 11 }).genome
ok(genomeDistance(a, a2) === 0, 'the same seed produced a different genome — the sampler is not deterministic')

// ─── 5. DISTINCTIVENESS ───────────────────────────────────────────────────────

head('5. DISTINCTIVENESS — are we shipping one infinite template?')

const corpus = []
for (let i = 0; i < 100; i++) {
  const register = REGISTERS[i % REGISTERS.length]
  corpus.push(applyCohesion(completeGenome({ register, seed: seedFrom('site', i) })).genome)
}
const d = distinctiveness(corpus)
note('mean pairwise distance over 100 generated genomes', String(d))
ok(d >= 0.45, `distinctiveness ${d} is below the 0.45 floor — the generator has collapsed toward a mode`)

// MODE SHARE, measured against the STRUCTURAL EXPECTATION rather than a flat cap.
//
// The first version of this check used a flat 45% ceiling and failed on
// `palette.ground` at 47% paper. That was the test being wrong, not the generator:
// `paper` is allowed by all six registers and `ink` by three, so uniform in-register
// sampling puts paper at ~44% before anything has collapsed. A flat cap would have
// been asking the generator to make a third of all blogs dark, which is a worse
// product, not a more distinctive one.
//
// So the question is not "is one value common" — some values SHOULD be common. It is
// "is one value MORE common than the allow-lists alone would make it", which is what
// a collapse toward the mean actually looks like.
function expectedShare(axis, value) {
  let acc = 0
  for (const r of REGISTERS) {
    const allowed = REGISTER_RULES[r][axis]
    if (allowed.includes(value)) acc += 1 / allowed.length
  }
  return acc / REGISTERS.length
}

for (const [label, of, axis] of [
  ['space.density', g => g.space.density, 'density'],
  ['palette.ground', g => g.palette.ground, 'ground'],
  ['feed.rhythm', g => g.feed.rhythm, 'rhythm'],
  ['ornament.corner', g => g.ornament.corner, 'corner'],
]) {
  const counts = new Map()
  for (const g of corpus) counts.set(of(g), (counts.get(of(g)) ?? 0) + 1)
  const [top, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]
  const share = n / corpus.length
  const expect = expectedShare(axis, top)
  const ceiling = Math.max(expect * 1.35, expect + 0.1)
  note(
    `${label.padEnd(16)} "${top}" ${Math.round(share * 100)}% (structural expectation ${Math.round(expect * 100)}%, ceiling ${Math.round(ceiling * 100)}%, ${counts.size} distinct)`,
  )
  ok(share <= ceiling, `${label}: "${top}" at ${Math.round(share * 100)}% against a structural expectation of ${Math.round(expect * 100)}% — the sampler is collapsing`)
}

// The typeface has no per-register allow-list to compare against (it is drawn from
// whole categories), so it keeps a flat cap. It is also the axis a reader notices
// first, which is why the cap is tight.
{
  const counts = new Map()
  for (const g of corpus) counts.set(g.type.heading, (counts.get(g.type.heading) ?? 0) + 1)
  const [top, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]
  const share = Math.round((n / corpus.length) * 100)
  note(`type.heading      "${top}" ${share}% (${counts.size} distinct faces across the corpus)`)
  ok(share <= 25, `type.heading: "${top}" takes ${share}% of the corpus — one typeface is becoming the house face`)
}

// The three variants a customer is shown must be genuinely far apart, not three
// points in one neighbourhood. Different registers is how we guarantee it.
const variants = ['quiet', 'classic', 'bold'].map((register, i) =>
  applyCohesion(completeGenome({ register, seed: seedFrom('variants', i) })).genome)
const minPair = Math.min(
  genomeDistance(variants[0], variants[1]),
  genomeDistance(variants[1], variants[2]),
  genomeDistance(variants[0], variants[2]),
)
note('closest pair among three reveal variants', String(minPair))
ok(minPair >= 0.4, `two reveal variants are only ${minPair} apart — the customer sees the same design twice`)

// ─── 6. CONTRAST ──────────────────────────────────────────────────────────────

head('6. CONTRAST — legibility as a construction constraint')

let derivedChecked = 0
for (const register of REGISTERS) {
  for (let s = 0; s < 60; s++) {
    const g = applyCohesion(completeGenome({ register, seed: seedFrom('c', register, s) })).genome
    const p = derivePalette({
      seed: g.palette.seed, scheme: g.palette.scheme, ground: g.palette.ground,
      saturation: g.palette.saturation, contrast: g.palette.contrast, counterHue: g.palette.counterHue,
    })
    const need = FLOOR[g.palette.contrast]
    const rt = ratio(p.text, p.bg), rl = ratio(p.link, p.bg), rm = ratio(p.muted, p.bg)
    if (rt < need.body || rl < need.body || rm < need.large) {
      ok(false, `${register}/${s}: derived palette misses its floor (text ${rt.toFixed(2)}, link ${rl.toFixed(2)}, muted ${rm.toFixed(2)})`)
    }
    derivedChecked++
  }
}
console.log(`  ✓ ${derivedChecked} derived palettes, every one at or above its declared floor`)

// And the uncomfortable half: our own shipped templates, measured honestly.
const reports = []
for (const [id, { c }] of compiled) {
  for (const r of c.repairs.filter(x => x.rule.startsWith('contrast:reported'))) reports.push(`${id}: ${r.why}`)
}
if (reports.length) {
  note(`${reports.length} pinned colours in the SHIPPED templates sit below AA:`)
  for (const r of reports) note('  · ' + r)
  note('reported, not repaired — these are live on customer blogs and fixing one is a deliberate act')
} else {
  note('every shipped template already clears its declared floor')
}

// ─── 7. BUDGET ────────────────────────────────────────────────────────────────

head('7. BUDGET — a design that misses its budget is a draft')

let maxCss = 0, maxFaces = 0, overBudget = 0
for (const register of REGISTERS) {
  for (let s = 0; s < 60; s++) {
    const g = applyCohesion(completeGenome({ register, seed: seedFrom('b', register, s) })).genome
    const c = compileGenome({ ...g, budget: { faces: 4, cssKb: 14, js: 0 } })
    maxCss = Math.max(maxCss, c.bytes.css)
    maxFaces = Math.max(maxFaces, c.bytes.faces)
    if (c.bytes.css > 14 * 1024 || c.bytes.faces > 4) overBudget++
  }
}
note('worst-case extra stylesheet', `${(maxCss / 1024).toFixed(2)}KB of a 14KB ceiling`)
note('worst-case face count', `${maxFaces} of 4`)
ok(overBudget === 0, `${overBudget}/360 generated genomes broke their own budget`)

// ─── Off-register faces are MOVED, not just noted (W7) ────────────────────────
//
// The art director can pick a face outside its register (Sonnet put DM Sans on a
// `warm` genome); cohesion used to note it and change nothing. Every register ×
// every catalogue face it forbids, as heading and as body: the face must land
// inside the allow-list, never collide with the other role, and a second pass must
// find nothing left to repair.
{
  let tried = 0, stuck = 0, collide = 0, notIdem = 0
  const base = PRESET_GENOMES[0]
  for (const reg of REGISTERS) {
    const A = REGISTER_RULES[reg]
    for (const id of FONT_IDS) {
      for (const role of ['heading', 'body']) {
        const cats = role === 'heading' ? A.headingCats : A.bodyCats
        if (cats.includes(font(id).category)) continue
        tried++
        const g = structuredClone({ ...base, register: reg })
        g.type[role] = id
        const once = applyCohesion(g)
        if (!cats.includes(font(once.genome.type[role]).category)) stuck++
        if (once.genome.type.heading === once.genome.type.body) collide++
        if (applyCohesion(once.genome).repairs.some(r => r.rule.startsWith('register:type.'))) notIdem++
      }
    }
  }
  ok(tried > 0 && stuck === 0, `${stuck}/${tried} off-register faces were noted but not moved`)
  ok(collide === 0, `${collide} repairs gave the heading and the body the same face`)
  ok(notIdem === 0, `${notIdem} repaired faces were repaired again on a second pass`)
}

// ─── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${fail === 0 ? '✓' : '✗'} genome gate: ${pass} passed, ${fail} failed`)
if (fail) { console.error('\nFailures:'); for (const f of fails) console.error('  · ' + f); process.exit(1) }
