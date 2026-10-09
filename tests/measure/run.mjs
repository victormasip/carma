// THE MEASUREMENT — dashboard load times and Lighthouse, on this machine, with no
// production anywhere in the loop.
//
//   1. tests/localstack (real Postgres + PostgREST + an Auth slice), seeded with
//      the `demo` profile — must already be up:
//        node --experimental-strip-types --no-warnings --import ./tests/register.mjs \
//             tests/localstack/stack.mjs up --seed=demo,scale
//      add --latency=40 for production-like numbers: every API call then pays one
//      network round trip, which is what a page with 19 of them really costs —
//      at 0ms React's 300ms reveal throttle dominates and hides it. --data=<dir>
//      --no-migrate serves a snapshot as-is (e.g. data-pre041: production today).
//   2. node tests/measure/run.mjs --label=<name> [--build] [--runs=5] [--lh-runs=3]
//                                 [--only=dashboard,lighthouse] [--app-dir=<dir>]
//      --pages=<substr,…> keeps only matching page ids (e.g. --pages=blog·template).
//      --app-dir serves another checkout (a worktree of the baseline commit,
//      node_modules junctioned in) through the same stand-in and instruments.
//   3. node tests/measure/compare.mjs <labelA> <labelB> [--md]
//
// `--build` runs `next build` with the stand-in's env first (NEXT_PUBLIC_* are
// inlined at build time, so a build made for production would talk to
// production). The app is served by `next start` behind tests/measure/cdn.mjs, a
// Vercel-rules edge cache, because that is how every reader meets a blog.
//
// What is measured, per page:
//   · dashboard (Playwright, real Chrome, cold context per run): TTFB, FCP, LCP,
//     the moment the page's real content is on screen (its selector present and
//     no `.skeleton` left in <main>), document bytes, and how many API round
//     trips the server made for it (the stand-in counts them);
//   · Lighthouse 13 (mobile for the public blog, desktop for the dashboard):
//     score, FCP, LCP, TBT, CLS, SI, bytes, and the image audits.
// Results: tests/measure/results/<label>.json (medians), plus a printed table.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { stackEnv, sessionCookie, PORTS, ROOT } from '../localstack/stack.mjs'
import { IDS } from '../localstack/seed.mjs'
import { startCdn } from './cdn.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RESULTS = path.join(HERE, 'results')
const APP_PORT = 3100
const EDGE_PORT = 3200
const ORIGIN = `http://localhost:${EDGE_PORT}`
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : (process.argv.includes(`--${n}`) ? true : d) }
const LABEL = arg('label', 'run')
const RUNS = Number(arg('runs', 5))
const LH_RUNS = Number(arg('lh-runs', 3))
const ONLY = String(arg('only', 'dashboard,lighthouse')).split(',')
// --app-dir=<dir> serves (and builds) another checkout — e.g. a git worktree of
// the baseline commit — through the same stand-in, edge and instruments.
const APP_DIR = path.resolve(String(arg('app-dir', ROOT)))
// --pages=<substr,…> measures only the pages whose id contains one of them.
const PAGES = arg('pages', '') ? String(arg('pages', '')).split(',') : null
const wanted = (id) => !PAGES || PAGES.some(p => id.includes(p))

const median = (xs) => { const s = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function findLighthouse() {
  const base = path.join(homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official', 'chrome-devtools-mcp')
  if (!existsSync(base)) return null
  for (const v of spawnSync(process.platform === 'win32' ? 'cmd' : 'ls', process.platform === 'win32' ? ['/c', 'dir', '/b', base] : [base], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean).reverse()) {
    const cli = path.join(base, v, 'node_modules', 'lighthouse', 'cli', 'index.js')
    if (existsSync(cli)) return cli
  }
  return null
}

const USERS = {
  owner: { id: IDS.owner, email: 'owner@carma.local' },
  admin: { id: IDS.admin, email: 'admin@carma.local' },
}

const SITE_CARD = 'main a[href^="/dashboard/sites/"][aria-label]'
const DASHBOARD_PAGES = [
  { id: 'owner·home', user: 'owner', path: '/dashboard', ready: SITE_CARD },
  { id: 'owner·site·articles', user: 'owner', path: `/dashboard/sites/${IDS.ownerSite}`, ready: 'main article' },
  { id: 'owner·site·resum', user: 'owner', path: `/dashboard/sites/${IDS.ownerSite}?tab=resum`, ready: 'main h4:has-text("Articles més vistos")' },
  { id: 'admin·home', user: 'admin', path: '/dashboard', ready: SITE_CARD },
  { id: 'admin·users', user: 'admin', path: '/admin/users', ready: 'main [aria-label^="Selecciona "]' },
  { id: 'admin·site·articles', user: 'admin', path: `/dashboard/sites/${IDS.ownerSite}`, ready: 'main article' },
]

const BLOG_PAGES = [
  { id: 'blog·template·listing', path: `/render/${IDS.templateSite}` },
  { id: 'blog·template·article', path: `/render/${IDS.templateSite}/article-1` },
  { id: 'blog·captured·listing', path: `/render/${IDS.ownerSite}` },
  { id: 'blog·captured·article', path: `/render/${IDS.ownerSite}/article-1` },
  { id: 'blog·unfaithful·listing', path: `/render/${IDS.unfaithfulSite}` },
]

// ─── The app ─────────────────────────────────────────────────────────────────

function appEnv() {
  // The stand-in's keys OVERRIDE .env.local (Next never overwrites a variable the
  // process already has) — this is what keeps production out of every request.
  return { ...process.env, ...stackEnv(), NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' }
}

function nextBin() { return path.join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next') }

function build() {
  console.log('[measure] next build (against the local stand-in)…')
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [nextBin(), 'build'], { cwd: APP_DIR, env: appEnv(), stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  writeFileSync(path.join(RESULTS, `${LABEL}.build.log`), `${r.stdout}\n${r.stderr}`)
  if (r.status !== 0) throw new Error(`next build failed (see results/${LABEL}.build.log)`)
  // Belt and braces: the client bundle must carry the stand-in's URL, never production's.
  const env = stackEnv()
  const chunks = spawnSync(process.platform === 'win32' ? 'findstr' : 'grep', process.platform === 'win32' ? ['/s', '/m', '/c:127.0.0.1:54321', path.join(APP_DIR, '.next', 'static', 'chunks', '*.js')] : ['-rl', '127.0.0.1:54321', path.join(APP_DIR, '.next', 'static', 'chunks')], { encoding: 'utf8' })
  if (!chunks.stdout.trim()) throw new Error(`build does not reference ${env.NEXT_PUBLIC_SUPABASE_URL} — refusing to measure`)
  console.log(`[measure] built in ${Math.round((Date.now() - t0) / 1000)}s`)
}

async function startApp() {
  const proc = spawn(process.execPath, [nextBin(), 'start', '-p', String(APP_PORT)], { cwd: APP_DIR, env: appEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  proc.stdout.on('data', d => { log += d })
  proc.stderr.on('data', d => { log += d })
  const until = Date.now() + 60_000
  while (Date.now() < until) {
    try { const r = await fetch(`http://localhost:${APP_PORT}/login`); if (r.status < 500) return { proc, log: () => log } } catch { /* booting */ }
    await sleep(300)
  }
  proc.kill()
  throw new Error(`next start did not come up:\n${log.slice(-2000)}`)
}

async function gatewayStats() {
  return (await fetch(`http://127.0.0.1:${PORTS.gateway}/__localstack/stats`)).json()
}

// ─── Dashboard: real Chrome, cold context per run ────────────────────────────

async function measureDashboard(browser) {
  const out = []
  for (const spec of DASHBOARD_PAGES.filter(p => wanted(p.id))) {
    const cookie = sessionCookie(USERS[spec.user])
    const runs = []
    for (let i = 0; i < RUNS + 1; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      await ctx.addCookies([{ name: cookie.name, value: cookie.value, url: ORIGIN }])
      const page = await ctx.newPage()
      await page.addInitScript(() => {
        window.__lcp = 0
        try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch { /* old engine */ }
      })
      const before = await gatewayStats()
      const t0 = Date.now()
      let ok = true
      try {
        await page.goto(ORIGIN + spec.path, { waitUntil: 'commit', timeout: 60_000 })
        await page.waitForSelector(spec.ready, { timeout: 60_000 })
        await page.waitForFunction(() => !document.querySelector('main .skeleton'), null, { timeout: 60_000 })
      } catch (e) { ok = false; console.warn(`[measure] ${spec.id}: ${e.message.split('\n')[0]}`) }
      const contentMs = Date.now() - t0
      await page.waitForLoadState('load').catch(() => {})
      await sleep(400)
      const after = await gatewayStats()
      const m = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0]
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]
        return { ttfb: n.responseStart - n.startTime, responseEnd: n.responseEnd - n.startTime, docBytes: n.transferSize, docDecoded: n.decodedBodySize, fcp: fcp?.startTime ?? null, lcp: window.__lcp || null }
      })
      // Which callers made this page's Auth round trips (browser SDK vs server:
      // proxy, page, actions) — present when the stand-in reports it.
      const authBy = {}
      for (const [k, v] of Object.entries(after.authBy ?? {})) { const d = v - (before.authBy?.[k] ?? 0); if (d) authBy[k] = d }
      if (i > 0 && ok) runs.push({ ...m, contentMs, apiCalls: after.rest - before.rest, authCalls: after.auth - before.auth, authBy })
      await ctx.close()
    }
    const pick = (k) => median(runs.map(r => r[k]))
    const row = {
      id: spec.id, runs: runs.length,
      ttfb: pick('ttfb'), fcp: pick('fcp'), lcp: pick('lcp'), content: pick('contentMs'), streamEnd: pick('responseEnd'),
      docKB: pick('docDecoded') !== null ? Math.round(pick('docDecoded') / 102.4) / 10 : null,
      apiCalls: pick('apiCalls'), authCalls: pick('authCalls'),
      authBy: runs.at(-1)?.authBy ?? null,
    }
    console.log(`[dashboard] ${row.id.padEnd(22)} ttfb ${fmt(row.ttfb)}  fcp ${fmt(row.fcp)}  content ${fmt(row.content)}  lcp ${fmt(row.lcp)}  stream-end ${fmt(row.streamEnd)}  doc ${row.docKB}KB  db ${row.apiCalls} (+${row.authCalls} auth)`)
    out.push(row)
  }
  return out
}

const fmt = (ms) => (ms === null || ms === undefined ? '   —  ' : `${Math.round(ms)}ms`.padStart(6))

// ─── Lighthouse ──────────────────────────────────────────────────────────────

const IMAGE_AUDITS = ['modern-image-formats', 'uses-optimized-images', 'uses-responsive-images', 'offscreen-images', 'unsized-images', 'prioritize-lcp-image', 'lcp-discovery-insight', 'image-delivery-insight']

// ASYNC on purpose: the edge proxy (cdn.mjs) lives in THIS process. A spawnSync
// here blocks its event loop, and every page Lighthouse loads hangs on it.
function runNode(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'ignore' })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on('exit', () => { clearTimeout(timer); resolve() })
    child.on('error', () => { clearTimeout(timer); resolve() })
  })
}

async function lighthouseOnce(cli, url, { desktop, cookie }) {
  const tmp = path.join(RESULTS, '.lh')
  mkdirSync(tmp, { recursive: true })
  const out = path.join(tmp, `${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  const args = [cli, url, '--output=json', `--output-path=${out}`, '--only-categories=performance', '--quiet',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu']
  if (desktop) args.push('--preset=desktop')
  if (cookie) {
    const hdr = path.join(tmp, 'headers.json')
    writeFileSync(hdr, JSON.stringify({ Cookie: `${cookie.name}=${cookie.value}` }))
    args.push(`--extra-headers=${hdr}`)
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    // chrome-launcher's teardown throws on Windows ~1 run in 3 (a leftover
    // process) after the report is written — the report is what counts.
    await runNode(args, 180_000)
    if (existsSync(out)) {
      const lhr = JSON.parse(readFileSync(out, 'utf8'))
      rmSync(out, { force: true })
      if (lhr.categories?.performance?.score != null) return lhr
    }
    await sleep(3000)
  }
  return null
}

function summarise(lhr) {
  const a = lhr.audits
  const v = (id) => a[id]?.numericValue ?? null
  const images = {}
  for (const id of IMAGE_AUDITS) if (a[id]) images[id] = { score: a[id].score, savingsKB: a[id].details?.overallSavingsBytes ? Math.round(a[id].details.overallSavingsBytes / 1024) : 0 }
  const lcpEl = a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet
    ?? a['lcp-breakdown-insight']?.details?.items?.find?.(i => i.type === 'node')?.snippet ?? null
  // The why behind two numbers: which elements moved (CLS), and which requests
  // held the first paint back (FCP/LCP). Kept short — a diagnosis, not a report.
  const shifts = (a['layout-shifts']?.details?.items ?? []).slice(0, 3)
    .map(i => ({ score: Math.round((i.score ?? 0) * 1000) / 1000, node: String(i.node?.snippet ?? '').slice(0, 120) }))
  const blocking = (a['render-blocking-insight']?.details?.items ?? a['render-blocking-resources']?.details?.items ?? [])
    .filter(i => i.url).slice(0, 5).map(i => ({ url: String(i.url).slice(0, 120), ms: Math.round(i.wastedMs ?? i.totalBytes ?? 0) }))
  return {
    score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    fcp: v('first-contentful-paint'), lcp: v('largest-contentful-paint'), tbt: v('total-blocking-time'),
    cls: v('cumulative-layout-shift'), si: v('speed-index'), bytesKB: Math.round((v('total-byte-weight') ?? 0) / 1024),
    imageKB: Math.round(((a['network-requests']?.details?.items ?? []).filter(r => r.resourceType === 'Image').reduce((n, r) => n + (r.transferSize ?? 0), 0)) / 1024),
    lcpElement: lcpEl ? String(lcpEl).slice(0, 160) : null,
    images, shifts, blocking,
  }
}

async function measureLighthouse(cli) {
  const out = []
  const jobs = [
    ...BLOG_PAGES.filter(p => wanted(p.id)).map(p => ({ ...p, desktop: false })),
    ...DASHBOARD_PAGES.filter(p => ['owner·site·articles', 'owner·site·resum', 'admin·home'].includes(p.id) && wanted(p.id)).map(p => ({ ...p, desktop: true, cookie: sessionCookie(USERS[p.user]) })),
  ]
  for (const job of jobs) {
    const url = ORIGIN + job.path
    await lighthouseOnce(cli, url, job) // warm-up: fills the edge cache like a first visitor would
    const runs = []
    for (let i = 0; i < LH_RUNS; i++) { const lhr = await lighthouseOnce(cli, url, job); if (lhr) runs.push(summarise(lhr)) }
    if (!runs.length) { console.warn(`[lighthouse] ${job.id}: no report`); continue }
    runs.sort((x, y) => x.score - y.score)
    const mid = runs[Math.floor((runs.length - 1) / 2)]
    const row = { id: job.id, form: job.desktop ? 'desktop' : 'mobile', runs: runs.length, ...mid, scores: runs.map(r => r.score) }
    console.log(`[lighthouse] ${row.id.padEnd(24)} ${row.form.padEnd(7)} score ${String(row.score).padStart(3)}  fcp ${fmt(row.fcp)}  lcp ${fmt(row.lcp)}  tbt ${fmt(row.tbt)}  cls ${row.cls?.toFixed(3)}  ${row.bytesKB}KB (img ${row.imageKB}KB)`)
    out.push(row)
  }
  return out
}

// ─── Main ────────────────────────────────────────────────────────────────────

mkdirSync(RESULTS, { recursive: true })
try { await gatewayStats() } catch {
  console.error('[measure] the local stand-in is not running — start it first (see the header of this file).')
  process.exit(2)
}
if (arg('build', false)) build()
const app = await startApp()
const edge = await startCdn({ port: EDGE_PORT, upstreamPort: APP_PORT })
const result = { label: LABEL, at: new Date().toISOString(), commit: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: APP_DIR, encoding: 'utf8' }).stdout.trim(), latencyMs: (await gatewayStats().catch(() => ({}))).latencyMs ?? null, dashboard: null, lighthouse: null }
try {
  if (ONLY.includes('dashboard')) {
    const browser = await chromium.launch({ executablePath: CHROME, headless: true })
    try { result.dashboard = await measureDashboard(browser) } finally { await browser.close() }
  }
  if (ONLY.includes('lighthouse')) {
    const cli = findLighthouse()
    if (!cli) console.warn('[measure] Lighthouse not found — SKIPPED (this is not a pass)')
    else result.lighthouse = await measureLighthouse(cli)
  }
  result.edge = edge.stats
} finally {
  await edge.stop()
  app.proc.kill()
}
writeFileSync(path.join(RESULTS, `${LABEL}.json`), JSON.stringify(result, null, 2))
console.log(`[measure] wrote tests/measure/results/${LABEL}.json`)
process.exit(0)
