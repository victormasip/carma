// VITALS GATE — the recorded pass.
//
//   npm run test:vitals            # boot the build, audit the public routes
//   npm run test:vitals -- --json  # also dump the raw Lighthouse reports
//
// WHY THIS IS A SEPARATE GATE FROM `test:perf`
// ───────────────────────────────────────────
// `test:perf` measures BYTES, deterministically, in two seconds, on every
// commit. It is the right instrument for the thing it measures and it cannot
// see the thing this one does.
//
// After six waves of byte work — /edit 293→65KB, the auth routes 135→34KB, the
// SDK and the HTML parser gone — the first real trace said the landing's LCP was
// 3.77s on throttled mobile. Not one byte of that was JavaScript the budget
// could have flagged: every request on the page finishes inside ~110ms, and the
// gap between first paint (1.52s) and largest paint (3.77s) is a 118KB variable
// font that the browser cannot even discover until it has parsed the third
// stylesheet. A byte budget would have called that page perfect.
//
// So this gate records what actually happens in a real Chrome: LCP, CLS, TBT and
// the network waterfall behind them.
//
// WHAT IT COSTS, AND WHY IT IS NOT IN THE COMMIT LOOP
// ──────────────────────────────────────────────────
// A Lighthouse navigation is ~30–60s per route and it needs a real browser. This
// is a BEFORE-A-RELEASE gate, not a per-commit one. Run it when a wave lands,
// when a route changes shape, or when someone says the product feels slow.
//
// WHERE THE BROWSER COMES FROM
// ────────────────────────────
// Lighthouse ships inside the `chrome-devtools-mcp` plugin, which is how this
// repo got a headless browser at all — every other test file here opens with the
// line "this repo has no headless browser", and that stopped being true on
// 2026-09-18. If the plugin is not installed, this gate SAYS SO LOUDLY and exits
// 0: a gate that cannot run must never be mistaken for a gate that passed, and it
// must never block a build on a machine that simply lacks Chrome.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

const ROOT = process.cwd()
const ARGS = process.argv.slice(2)
const KEEP_JSON = ARGS.includes('--json')
const OUT = path.join(ROOT, '.next', 'cache', 'vitals')

/* ── The routes worth recording ─────────────────────────────────────────────
   Public only. Everything under /dashboard needs a session, and a Lighthouse
   run against a login redirect measures the login page twice. Auditing the
   product properly needs an authenticated run, which is its own piece of work
   (see the plan's W7 note). */
const ROUTES = [
  { name: 'landing', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'registre', path: '/registre' },
  // /preview embeds the cloned site in an iframe, so its `page` and `fonts`
  // columns include the PREVIEWED blog's assets, not just Carma's chrome. Read
  // its LCP and CLS; do not read its byte totals as ours.
  { name: 'preview', path: '/preview?url=https%3A%2F%2Fexample.com' },
  // NOT /benvinguda: it redirects to /login when signed out, so an
  // unauthenticated audit of it measures the login page a third time.
]

/* ── Budgets ────────────────────────────────────────────────────────────────
   Measured 2026-09-18 on Lighthouse's throttled mobile (Slow 4G, 4× CPU) —
   deliberately the worst case, not the median visitor. As everywhere else in
   this plan: `target` warns, `hard` fails, and both are `achieved + headroom`
   rather than aspirations, so the gate is a ratchet and not a wish.

   LCP is the one every route currently misses, and it is misses BY DESIGN
   pending a decision that is not an engineer's to make: the landing's display
   face costs 118KB and ~0.28s of LCP for its `opsz` axis (measured — see the
   plan's W7). Until someone chooses, the ratchet holds the line where it is. */
const BUDGET = {
  landing:    { lcp: [3900, 4500], tbt: [200, 350], cls: [0.02, 0.05] },
  login:      { lcp: [3100, 3800], tbt: [220, 350], cls: [0.02, 0.05] },
  registre:   { lcp: [3100, 3800], tbt: [220, 350], cls: [0.02, 0.05] },
  preview:    { lcp: [3500, 4200], tbt: [220, 350], cls: [0.03, 0.06] },
}

let failures = 0
let warnings = 0
const ok = (l, x = '') => console.log(`  ✓ ${l}${x ? `  ${x}` : ''}`)
const warn = (l, x = '') => { warnings++; console.log(`  ! ${l}${x ? `  ${x}` : ''}`) }
const bad = (l, x = '') => { failures++; console.log(`  ✗ ${l}${x ? `  ${x}` : ''}`) }
const ms = n => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`)

/* ── Finding the instrument ─────────────────────────────────────────────── */

/** Lighthouse's CLI entry, wherever this machine keeps it. */
function findLighthouse() {
  if (process.env.LIGHTHOUSE_CLI && existsSync(process.env.LIGHTHOUSE_CLI)) return process.env.LIGHTHOUSE_CLI
  const candidates = [
    path.join(ROOT, 'node_modules', 'lighthouse', 'cli', 'index.js'),
  ]
  // The chrome-devtools-mcp plugin bundles it; the version is in the path, so
  // look for whatever is installed rather than pinning one.
  const cache = path.join(homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official', 'chrome-devtools-mcp')
  if (existsSync(cache)) {
    for (const v of readdirSync(cache)) {
      candidates.push(path.join(cache, v, 'node_modules', 'lighthouse', 'cli', 'index.js'))
    }
  }
  return candidates.find(existsSync) ?? null
}

/** A Chrome for Lighthouse to drive. */
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  return candidates.find(existsSync) ?? null
}

/* ── Running it ─────────────────────────────────────────────────────────── */

function run(cmd, args, env) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    let out = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { out += d })
    p.on('close', code => resolve({ code, out }))
  })
}

async function waitForServer(port) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`)
      if (r.ok || r.status < 500) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 700))
  }
  return false
}

/** Pull the handful of numbers that matter out of a 600KB report. */
function readReport(file) {
  const r = JSON.parse(readFileSync(file, 'utf8'))
  const a = r.audits
  const net = a['network-requests']?.details?.items ?? []
  let fontBytes = 0, fontCount = 0, total = 0
  for (const i of net) {
    total += i.transferSize || 0
    if (i.resourceType === 'Font') { fontBytes += i.transferSize || 0; fontCount++ }
  }
  const mt = a['mainthread-work-breakdown']?.details?.items ?? []
  return {
    score: Math.round((r.categories?.performance?.score ?? 0) * 100),
    fcp: a['first-contentful-paint']?.numericValue,
    lcp: a['largest-contentful-paint']?.numericValue,
    tbt: a['total-blocking-time']?.numericValue,
    cls: a['cumulative-layout-shift']?.numericValue ?? 0,
    fontBytes, fontCount, total,
    styleLayout: mt.find(x => /Style/.test(x.groupLabel))?.duration ?? 0,
    longTasks: a['long-tasks']?.details?.items?.length ?? 0,
  }
}

/* ── run ────────────────────────────────────────────────────────────────── */

console.log('VITALS GATE — the recorded pass')

const lh = findLighthouse()
const chrome = findChrome()
if (!lh || !chrome) {
  console.log(`\n  - SKIPPED (this is not a pass)`)
  if (!lh) console.log('    no Lighthouse: install the chrome-devtools-mcp plugin, or set LIGHTHOUSE_CLI')
  if (!chrome) console.log('    no Chrome: set CHROME_PATH')
  process.exit(0)
}
console.log(`  lighthouse ${path.relative(homedir(), lh).split(path.sep).slice(0, 6).join('/')}`)

const shell = path.join(ROOT, '.next', 'server', 'app')
if (!existsSync(shell)) {
  bad('no build found', 'run `npm run build` first')
  process.exit(1)
}

const port = 3900 + Math.floor(Math.random() * 60)
const bin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
const server = spawn(process.execPath, [bin, 'start', '-p', String(port)], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production' },
})
const stop = () => { try { server.kill() } catch { /* already gone */ } }
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

if (!await waitForServer(port)) {
  bad('the built server never came up')
  stop()
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const results = []
for (const route of ROUTES) {
  const file = path.join(OUT, `${route.name}.json`)
  // TWO ATTEMPTS, AND A PAUSE BETWEEN RUNS.
  //
  // chrome-launcher's teardown is not reliable on Windows: it throws out of
  // kill() often enough that, run back to back, roughly one audit in three dies
  // on a leftover process rather than on anything about the page. A failure here
  // is almost always the harness, not the route — so give the browser a moment
  // to actually exit, and try once more before calling it a result.
  let attempt = 0
  let lastWhy = ''
  while (attempt < 2) {
    attempt++
    const { code, out } = await run(process.execPath, [
      lh, `http://127.0.0.1:${port}${route.path}`,
      '--only-categories=performance',
      '--output=json', `--output-path=${file}`,
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
      '--quiet',
    ], { CHROME_PATH: chrome })
    if (code === 0 && existsSync(file)) break
    lastWhy = out.trim().split(String.fromCharCode(10)).filter(Boolean).slice(-2).join(String.fromCharCode(32, 124, 32)).slice(0, 200)
    await new Promise(r => setTimeout(r, 2500))
  }
  if (!existsSync(file)) {
    // Say WHY. A gate that reports "did not complete" and swallows the reason is
    // a gate whose failures get ignored.
    bad(`${route.name}: the audit did not complete after ${attempt} attempts`, lastWhy)
    continue
  }
  results.push({ ...route, ...readReport(file) })
  await new Promise(r => setTimeout(r, 1500))
}
stop()


console.log(`\nTHROTTLED MOBILE (Lighthouse default: Slow 4G, 4× CPU — the worst case, not the median visitor)`)
console.log(`  ${'route'.padEnd(12)}${'score'.padStart(6)}${'FCP'.padStart(9)}${'LCP'.padStart(9)}${'TBT'.padStart(8)}${'CLS'.padStart(7)}${'fonts'.padStart(10)}${'page'.padStart(9)}`)
for (const r of results) {
  console.log(`  ${r.name.padEnd(12)}${String(r.score).padStart(6)}${ms(r.fcp).padStart(9)}${ms(r.lcp).padStart(9)}${ms(r.tbt).padStart(8)}${r.cls.toFixed(3).padStart(7)}${`${Math.round(r.fontBytes / 1024)}KB/${r.fontCount}`.padStart(10)}${`${Math.round(r.total / 1024)}KB`.padStart(9)}`)
}

console.log('')
for (const r of results) {
  const b = BUDGET[r.name]
  if (!b) { warn(`no budget for ${r.name}`, 'add one to BUDGET'); continue }
  for (const [metric, value, fmt] of [['LCP', r.lcp, ms], ['TBT', r.tbt, ms], ['CLS', r.cls, v => v.toFixed(3)]]) {
    const [target, hard] = b[metric.toLowerCase()]
    if (value > hard) bad(`${r.name} ${metric} over hard budget`, `${fmt(value)} > ${fmt(hard)}`)
    else if (value > target) warn(`${r.name} ${metric} over target`, `${fmt(value)} > ${fmt(target)}`)
  }
}
if (!failures && !warnings) ok(`${results.length} routes within budget on every recorded metric`)

if (!KEEP_JSON) rmSync(OUT, { recursive: true, force: true })
else console.log(`\n  raw reports kept in ${path.relative(ROOT, OUT)}`)

console.log(`\n${failures ? '✗ FAIL' : '✓ PASS'}  ${failures} failure(s), ${warnings} warning(s)`)
process.exit(failures ? 1 : 0)
