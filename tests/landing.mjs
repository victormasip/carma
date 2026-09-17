// LANDING GATE — the safety net for EL FIL D'OR.
//
//   npm run test:landing              # full run (boots the built server)
//   npm run test:landing -- --static  # skip the server, budgets + invariants only
//
// WHAT THIS IS, AND WHAT IT IS NOT
// ────────────────────────────────
// The plan asked for a headless-Chrome run measuring CLS, LCP and long tasks.
// This repo has no headless browser — `test:fidelity` made the same call and
// explained why: a ~300MB Playwright dependency on the critical test path buys
// less than a sharper instrument aimed at the actual failure modes.
//
// So this gate measures what can be measured exactly, and is honest about the
// rest. It CANNOT tell you the LCP on a Moto G. It CAN tell you, deterministically
// and on every build, that:
//
//   1. BUDGET          the landing's JavaScript and CSS are under contract.
//   2. ISLANDS         the page is still server-rendered — only the allowlisted
//                      components are client components. This is the invariant
//                      that keeps (1) true; the old landing regressed to 211KB
//                      precisely because one `'use client'` sat at the top of the
//                      tree and nobody noticed.
//   3. MOTION POLICY   no blur() big enough to repeat the 2026-07-06 landing
//                      freeze, and no idle infinite animation sneaking back in.
//   4. FALLBACK SAFETY every scroll-timeline animation is inside an @supports,
//                      and no rule hides content outside one. This is the failure
//                      that turns a landing page into a blank page on Safari, and
//                      it is invisible in development on Chrome.
//   5. COPY            all three locales are complete and non-empty.
//   6. SSR             the server actually emits the headline, every scene's
//                      copy and the footer as TEXT — which is the same thing as
//                      "this page works with JavaScript disabled".
//
// (6) needs the built app running, which is why this gate wants `next build`
// first. Pass --static to skip it.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { LANDING } from '@/components/marketing/copy'
import { readWall } from '@/lib/marketing/wall'

const ROOT = process.cwd()
const SHELL = path.join(ROOT, '.next', 'server', 'app', 'index.html')
const STATIC = args().includes('--static')

function args() { return process.argv.slice(2) }

/* ── Budgets ───────────────────────────────────────────────────────────────
   Targets from docs/plans/2026-09-16-landing-and-community-vision.md §7.3. The
   build fails at the HARD number; between target and hard it warns, so a slow
   drift is visible before it is a breach. */
// Next 16 + React 19 ship a fixed floor on EVERY route (build-manifest's
// rootMainFiles: react-dom, the app router runtime, the turbopack loader). That
// floor is ~137KB gzip and no amount of design work moves it, so budgeting the
// total would be budgeting someone else's code. We budget what we control —
// the landing's OWN chunks — and report the floor for information.
const BUDGET = {
  ownJsGzip:   { target: 40 * 1024, hard: 60 * 1024 },
  cssGzip:     { target: 33 * 1024, hard: 38 * 1024 },
  /**
   * Time-based infinite animations allowed in the landing's own layer.
   *
   * Raised from 8 to 24 on 2026-09-16, deliberately. The first version had
   * almost none because everything was scroll-driven — and that turned out to be
   * the bug, not the achievement: on a machine with OS animations off, a page
   * made entirely of scroll timelines inside `no-preference` is a static page.
   * The mark now turns and the WhatsApp demo plays itself.
   *
   * The count alone was never the safety property anyway. What matters is that
   * every one of them is compositor-only, which is what `idlePropertiesSafe`
   * below actually checks — the 2026-07-06 freeze was two animations, not eight.
   */
  idleAnimations: 24,
}

/** Only these components on the landing may be client components. */
const ALLOWED_ISLANDS = new Set([
  'src/components/marketing/Nav.tsx',
  'src/components/marketing/Door.tsx',
  'src/components/marketing/StudioDemo.tsx',
])

let failures = 0
let warnings = 0

function ok(label, extra = '') { console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`) }
function warn(label, extra = '') { warnings++; console.log(`  ! ${label}${extra ? `  ${extra}` : ''}`) }
function bad(label, extra = '') { failures++; console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`) }
function head(t) { console.log(`\n${t}`) }
const kb = (n) => `${(n / 1024).toFixed(1)}KB`

/* ══ 1. BUDGET ══════════════════════════════════════════════════════════════ */

function measure() {
  head('1. BUDGET')
  if (!existsSync(SHELL)) {
    bad('no build found', 'run `npm run build` first')
    return null
  }
  const html = readFileSync(SHELL, 'utf8')
  const pick = (ext) => [...new Set([...html.matchAll(new RegExp(`/_next/static/[^"']+\\.${ext}`, 'g'))].map(m => m[0]))]

  // `noModule` scripts are the legacy core-js polyfill bundle. No browser that
  // understands `<script type="module">` — i.e. every browser that can run this
  // app at all — ever fetches them, so counting their 38KB against a modern
  // page's budget measures nothing. Excluded, and reported separately so the
  // exclusion is visible rather than convenient.
  const noModule = new Set(
    [...html.matchAll(/<script[^>]*\bnoModule\b[^>]*>/gi)]
      .flatMap(m => [...m[0].matchAll(/\/_next\/static\/[^"']+\.js/g)].map(x => x[0])),
  )

  const sum = (urls) => {
    let raw = 0, gz = 0, missing = 0
    for (const u of urls) {
      const f = path.join(ROOT, '.next', u.replace('/_next', ''))
      if (!existsSync(f)) { missing++; continue }
      const b = readFileSync(f)
      raw += b.length
      gz += gzipSync(b, { level: 9 }).length
    }
    return { raw, gz, missing, count: urls.length }
  }

  const allJs = pick('js')
  const css = sum(pick('css'))

  // The framework floor, straight from the build manifest.
  let baseline = []
  try {
    const mf = JSON.parse(readFileSync(path.join(ROOT, '.next', 'build-manifest.json'), 'utf8'))
    baseline = (mf.rootMainFiles || []).map(f => `/_next/${f}`)
  } catch { /* no manifest: everything counts as ours, which fails loudly */ }

  const modern = allJs.filter(u => !noModule.has(u))
  const own = sum(modern.filter(u => !baseline.includes(u)))
  const floor = sum(modern.filter(u => baseline.includes(u)))
  const legacy = sum([...noModule])

  const detail = `${kb(own.gz)} gzip (${kb(own.raw)} raw, ${own.count} chunks)`
  if (own.gz > BUDGET.ownJsGzip.hard) bad('landing JS over hard budget', `${detail} > ${kb(BUDGET.ownJsGzip.hard)}`)
  else if (own.gz > BUDGET.ownJsGzip.target) warn('landing JS over target', `${detail} > ${kb(BUDGET.ownJsGzip.target)}`)
  else ok('landing JS within budget', detail)

  console.log(`    framework floor ${kb(floor.gz)} gzip (${floor.count} chunks, identical on every route)`)
  console.log(`    total on / :    ${kb(own.gz + floor.gz)} gzip`)
  if (legacy.count) console.log(`    legacy polyfill ${kb(legacy.gz)} gzip (noModule — no modern browser fetches it)`)

  // A single fat chunk that is not framework is how a server-only module sneaks
  // into the browser (this caught pdf.js riding into the Door on a three-line
  // predicate imported from a module that reaches the parsers).
  const fat = modern
    .filter(u => !baseline.includes(u))
    .map(u => ({ u, gz: sum([u]).gz }))
    .filter(x => x.gz > 20 * 1024)
  if (fat.length) bad('an unexpectedly heavy chunk on the landing', fat.map(f => `${f.u.split('/').pop()} ${kb(f.gz)}`).join(', '))
  else ok('no single chunk over 20KB gzip')

  if (css.gz > BUDGET.cssGzip.hard) bad('CSS over hard budget', `${kb(css.gz)} > ${kb(BUDGET.cssGzip.hard)}`)
  else if (css.gz > BUDGET.cssGzip.target) warn('CSS over target', `${kb(css.gz)}`)
  else ok('CSS within budget', `${kb(css.gz)} gzip (${kb(css.raw)} raw)`)

  return { own, floor, css, html }
}

/* ══ 2. ISLANDS ════════════════════════════════════════════════════════════ */

function islands() {
  head('2. ISLANDS')
  const dir = 'src/components/marketing'
  const files = ['LandingPage.tsx', 'copy.ts', 'Nav.tsx', 'Door.tsx', 'PhoneScene.tsx', 'StudioDemo.tsx']
    .map(f => `${dir}/${f}`)
    .filter(f => existsSync(path.join(ROOT, f)))

  const clients = files.filter(f => {
    const src = readFileSync(path.join(ROOT, f), 'utf8')
    return /^\s*['"]use client['"]/m.test(src.split('\n').slice(0, 6).join('\n'))
  })

  const unexpected = clients.filter(f => !ALLOWED_ISLANDS.has(f))
  if (unexpected.length) bad('unexpected client component on the landing', unexpected.join(', '))
  else ok(`${clients.length} client islands`, clients.map(f => path.basename(f)).join(', '))

  const page = readFileSync(path.join(ROOT, dir, 'LandingPage.tsx'), 'utf8')
  if (/^\s*['"]use client['"]/m.test(page.split('\n').slice(0, 6).join('\n'))) {
    bad('LandingPage is a client component', 'the whole page would hydrate')
  } else ok('LandingPage is a server component')
}

/* ══ 3 + 4. THE MOTION LAYER ═══════════════════════════════════════════════ */

function motion() {
  head('3. MOTION POLICY')
  // Strip comments first. Both of these files DOCUMENT the rules they follow —
  // globals.css literally explains that the halos used to be blur(140px) — and a
  // gate that greps prose instead of declarations fails on its own changelog.
  const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const landing = decomment(readFileSync(path.join(ROOT, 'src/app/landing.css'), 'utf8'))
  const globals = decomment(readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'))
  const all = `${landing}\n${globals}`

  // The 2026-07-06 landing freeze was `filter: blur(140px)` on two animated
  // halos: a huge intermediate surface, re-rasterised forever. Encoded here so
  // it cannot come back as a comment nobody reads.
  const blurs = [...all.matchAll(/blur\(\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]))
  const heavy = blurs.filter(v => v >= 60)
  if (heavy.length) bad('blur() large enough to re-freeze the landing', `${heavy.join('px, ')}px`)
  else ok('no oversized blur()', blurs.length ? `largest ${Math.max(...blurs)}px` : 'none at all')

  // Idle animations in the landing's own layer. Scroll-driven ones are not idle
  // (no timeline running means no frames), so only time-based `infinite` counts.
  const idle = (landing.match(/animation:[^;]*\binfinite\b/g) || []).length
  if (idle > BUDGET.idleAnimations) bad('too many idle infinite animations', `${idle} > ${BUDGET.idleAnimations}`)
  else ok('idle animations within budget', `${idle}`)

  // THE ACTUAL SAFETY PROPERTY. An infinite animation is cheap or ruinous
  // depending entirely on what it animates: transform and opacity are composited
  // and free; filter, box-shadow, background-position and width repaint a
  // surface every frame forever. That is what froze the landing in July, and a
  // count of animations would never have caught it.
  const BANNED_IN_KEYFRAMES = /(filter|backdrop-filter|box-shadow|background-position|background-size|width|height|top|left|margin)\s*:/
  const offenders = []
  for (const m of landing.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const [a, b] = blockRanges(landing.slice(m.index), /@keyframes\s+[\w-]+\s*\{/g)[0] ?? []
    if (a === undefined) continue
    const body = landing.slice(m.index + a, m.index + b)
    // The Veu highlight sweep is a single finite transition on one line of text,
    // and the closing knot's stroke is a 240px box on the last screen. Both are
    // documented exceptions in landing.css.
    if (/veu-highlight|knot-draw-in/.test(m[1])) continue
    if (BANNED_IN_KEYFRAMES.test(body)) offenders.push(`${m[1]}`)
  }
  if (offenders.length) bad('keyframes animating a paint-bound property', offenders.join(', '))
  else ok('every animation is compositor-only', 'transform/opacity, with the two documented exceptions')

  // The old 16s WhatsApp loop must stay dead.
  if (/\.wa-step-\d|@keyframes wa-spark|@keyframes wa-typing/.test(all)) {
    bad('the 16s WhatsApp autoplay loop is back')
  } else ok('the WhatsApp loop is scroll-driven, not clock-driven')

  head('4. FALLBACK SAFETY')

  // Every scroll timeline must be inside an @supports. A bare one is invisible
  // in Chrome and blank in Safari, which is the worst possible failure shape.
  const supportsBlocks = [...landing.matchAll(SUPPORTS_RE)]
  if (!supportsBlocks.length) { bad('no @supports guard found'); return }

  const guarded = guardedRanges(landing)
  const timelines = [...landing.matchAll(/animation-timeline\s*:/g)]
    .map(m => m.index)
    // The @supports condition itself contains the property name; skip those.
    .filter(i => !/@supports[^\n]*$/.test(landing.slice(Math.max(0, i - 60), i)))
  const naked = timelines.filter(i => !guarded.some(([a, b]) => i > a && i < b))
  if (naked.length) bad('animation-timeline outside @supports', `${naked.length} occurrence(s)`)
  else ok(`${timelines.length} scroll timelines, all inside @supports`)

  // REDUCED MOTION, the 2026-09-16 policy.
  //
  // The first version wrapped every scroll animation in `no-preference`, which
  // read as careful and was in fact the bug: the founder's machine reports
  // `reduce`, so the entire visual system was switched off on the one machine
  // that mattered. Scroll-LINKED motion cannot move unless the visitor moves it,
  // so it now stays alive; what dies is autonomous drift and entrance travel.
  //
  // So the invariant is no longer "count the guards". It is: there IS a reduce
  // block, and it stills the autonomous things by name.
  // Union of EVERY reduce block — there is more than one (the magnet has its own,
  // and it comes first), so reading only the first one measures the wrong file.
  const reduceRanges = blockRanges(landing, /@media \(prefers-reduced-motion: reduce\)\s*\{/g)
  if (!reduceRanges.length) { bad('no reduced-motion block at all') }
  else {
    const body = reduceRanges.map(([a, b]) => landing.slice(a, b)).join('\n')
    const mustStill = ['knot-mark--parallax', 'sc-conversa__phone--drift', 'fil__spark', 'reveal-fade']
    const missing = mustStill.filter(x => !body.includes(x))
    if (missing.length) bad('reduced motion does not still the autonomous set', missing.join(', '))
    else ok('reduced motion stills drift and travel, keeps scroll-linked motion')
  }

  // THE BIG ONE: nothing may hide content outside a guard. A base rule that sets
  // opacity: 0 on page content, with the un-hiding living inside @supports, is
  // exactly how a landing page renders blank for a third of the internet.
  // @keyframes bodies are where hiding is SUPPOSED to live — `from { opacity: 0 }`
  // is the reveal, not the bug. Only real selectors count.
  const frames = keyframeRanges(landing)
  const bareHides = []
  for (const m of landing.matchAll(/\{([^{}]*)\}/g)) {
    const body = m[1]
    if (!/opacity:\s*0\s*[;}]/.test(body)) continue
    const i = m.index
    if (guarded.some(([a, b]) => i > a && i < b)) continue
    if (frames.some(([a, b]) => i > a && i < b)) continue
    // Decorative overlays are allowed to start invisible; they carry no text.
    const selector = landing.slice(0, i).split('}').pop()?.split('{')[0]?.trim() ?? ''
    if (/(veil|spark|::before|::after|__lit|glimpse|door-chip|door-ring|knot-flare)/.test(selector)) continue
    bareHides.push(selector.replace(/\s+/g, ' ').slice(0, 70))
  }
  if (bareHides.length) bad('content hidden outside an @supports guard', bareHides.join(' | '))
  else ok('no content is hidden without a way back')
}

// `@supports (animation-timeline: view())` contains parentheses inside the
// condition, so a lazy [^)]* stops at the wrong one and matches nothing. Match up
// to the opening brace instead. (The gate shipped with the lazy version and
// reported "no @supports guard found" on a file full of them.)
const SUPPORTS_RE = /@supports\s*\(\s*animation-timeline[^{]*\{/g

/** Byte ranges covered by every `@keyframes` block. */
function keyframeRanges(css) {
  return blockRanges(css, /@keyframes\s+[\w-]+\s*\{/g)
}

/** Byte ranges covered by an `@supports (animation-timeline…)` block. */
function guardedRanges(css) {
  return blockRanges(css, SUPPORTS_RE)
}

/** Brace-matched extent of every block whose opening the pattern matches. */
function blockRanges(css, re) {
  const out = []
  for (const m of css.matchAll(re)) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < css.length && depth > 0) {
      const ch = css[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      i++
    }
    out.push([m.index, i])
  }
  return out
}

/* ══ 5. COPY ═══════════════════════════════════════════════════════════════ */

function copy() {
  head('5. COPY')
  const locales = Object.keys(LANDING)
  if (locales.length !== 3) bad('expected three locales', locales.join(', '))

  let empties = 0
  let strings = 0
  const walk = (node, trail) => {
    if (typeof node === 'string') {
      strings++
      if (!node.trim()) { empties++; bad('empty string', trail) }
      return
    }
    // A function here is the bug that emptied the Door: this object is a prop
    // on a client island, and functions cannot cross that boundary. React throws
    // during SSR and the server ships an empty placeholder where the call to
    // action should be — invisible in the browser, because hydration papers over
    // it. Only the HTML shows the hole.
    if (typeof node === 'function') { bad('function in landing copy (not serializable to a client island)', trail); return }
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${trail}[${i}]`))
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`)
    }
  }
  for (const l of locales) walk(LANDING[l], l)
  if (!empties) ok(`${strings} strings across ${locales.length} locales, none empty`)

  // The three locales must be structurally identical — a key that exists only in
  // Catalan is a hole that renders as `undefined` for an English visitor.
  const shape = (o) => {
    const keys = []
    const rec = (n, t) => {
      if (n && typeof n === 'object' && !Array.isArray(n)) {
        for (const k of Object.keys(n).sort()) { keys.push(`${t}.${k}`); rec(n[k], `${t}.${k}`) }
      }
    }
    rec(o, '')
    return keys.join('|')
  }
  const base = shape(LANDING.ca)
  for (const l of ['es', 'en']) {
    if (shape(LANDING[l]) !== base) bad(`locale ${l} has a different shape to ca`)
  }
  if (shape(LANDING.es) === base && shape(LANDING.en) === base) ok('es and en match ca key for key')
}

/* ══ 6. SSR ════════════════════════════════════════════════════════════════ */

async function ssr() {
  head('6. SERVER-RENDERED CONTENT')
  if (STATIC) { console.log('  - skipped (--static)'); return }
  if (!existsSync(SHELL)) { bad('no build to serve'); return }

  const port = 3400 + Math.floor(Math.random() * 180)
  const bin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  const proc = spawn(process.execPath, [bin, 'start', '-p', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production' },
  })
  let serverLog = ''
  proc.stdout.on('data', d => { serverLog += d.toString() })
  proc.stderr.on('data', d => { serverLog += d.toString() })

  const kill = () => {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
      else proc.kill('SIGTERM')
    } catch { /* already gone */ }
  }

  try {
    const base = `http://127.0.0.1:${port}`
    const up = await waitFor(base, 45_000)
    if (!up) {
      bad('server did not start in 45s', serverLog.split('\n').slice(-4).join(' ').slice(0, 200))
      return
    }

    const res = await fetch(`${base}/`, { headers: { 'accept-language': 'ca' } })
    if (!res.ok) { bad(`GET / returned ${res.status}`); return }
    const html = await res.text()
    const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const has = (s) => text.includes(s.replace(/\s+/g, ' '))

    ok('GET / 200', `${(html.length / 1024).toFixed(0)}KB of HTML`)

    const c = LANDING.ca
    const required = [
      ['headline', c.hero.h1a],
      ['payoff line', c.hero.h1b],
      ['hero sub', c.hero.sub.slice(0, 40)],
      ['the Door', c.door.title],
      ['scene 2', c.conversa.title],
      // Scene 3 is the fidelity band now — the clone mock was cut 2026-09-17.
      ['scene 3', c.fidelitat.title.slice(0, 40)],
      ['the no-website path', c.fidelitat.noWebCta],
      ['scene 4', c.estudi.title],
      ['scene 5', c.veu.title],
      ['what she keeps', c.veu.keeps[0].label],
      ['scene 6', c.noEs.items[0].claim],
      ['scene 7', c.comunitat.title],
      ['the loop', c.comunitat.loop[0].title],
      ['scene 8', c.punts.title],
      ['faq', c.faq.items[0].q],
      ['the close', c.close.title],
      ['footer', c.footer.madeIn],
    ]
    const missing = required.filter(([, s]) => !has(s)).map(([label]) => label)
    if (missing.length) bad('missing from the server HTML', missing.join(', '))
    else ok(`all ${required.length} scenes render server-side`, 'the page works with JS off')

    // NO EYEBROWS. A category label floating above every heading ("El clon",
    // "La veu", "Els punts") is the most reliable tell that a page was written
    // by a machine, and the founder called it: "elimina els eyebrow son molt
    // d'ia". They are not coming back by accident.
    const eyebrows = [...html.matchAll(/class="[^"]*\beyebrow\b/g)].length
    if (eyebrows) bad('eyebrow pills are back on the landing', String(eyebrows))
    else ok('no eyebrow pills')

    // One <h1>, and it is the headline — SEO, screen readers, and LCP all care.
    const h1s = [...html.matchAll(/<h1[\s>]/g)].length
    if (h1s !== 1) bad('expected exactly one <h1>', `found ${h1s}`)
    else ok('exactly one <h1>')

    // Zero raster images is a design decision on this page; assert it, because
    // the first <img> someone adds without dimensions is the first CLS.
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)]
    const unsized = imgs.filter(m => !/width=/.test(m[0]) || !/height=/.test(m[0]))
    if (unsized.length) bad('img without explicit dimensions (CLS risk)', `${unsized.length}`)
    else ok('no unsized images', imgs.length ? `${imgs.length} sized` : 'none at all')

    // The language switch must actually switch.
    const enRes = await fetch(`${base}/`, { headers: { 'accept-language': 'en-GB,en' } })
    const enText = (await enRes.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    if (!enText.includes(LANDING.en.hero.h1a)) bad('Accept-Language: en did not render English')
    else ok('Accept-Language negotiation works')
  } finally {
    kill()
  }
}

async function waitFor(base, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const r = await fetch(base, { signal: AbortSignal.timeout(2500) })
      if (r.status < 500) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}

/* ══ 7. SHOWCASE PRIVACY ═══════════════════════════════════════════════════
 * The "Fet amb Carma" wall shows other people's blogs on our front page. That
 * makes the opt-in filter a privacy contract, not a feature flag — and the kind
 * of single line a refactor removes by accident while "simplifying the query".
 *
 * These assertions exist so that removing it fails the build instead of quietly
 * publishing customers. `readWall` takes an optional client for exactly this.
 * ══════════════════════════════════════════════════════════════════════════ */

/** The narrowest possible fake of the supabase-js chain readWall actually uses. */
function fakeAdmin({ sites = [], posts = [], themes = [], sitesError = null } = {}) {
  const table = (rows, error = null) => {
    const q = {
      _rows: rows,
      select() { return q },
      eq(col, val) { q._rows = q._rows.filter((r) => r[col] === val); return q },
      in(col, vals) { q._rows = q._rows.filter((r) => vals.includes(r[col])); return q },
      not(col) { q._rows = q._rows.filter((r) => r[col] != null); return q },
      order() { return q },
      limit() { return Promise.resolve({ data: error ? null : q._rows, error }) },
      then(res) { return Promise.resolve({ data: error ? null : q._rows, error }).then(res) },
    }
    return q
  }
  return {
    from(name) {
      if (name === 'sites') return table([...sites], sitesError)
      if (name === 'posts') return table([...posts])
      if (name === 'site_themes') return table([...themes])
      return table([])
    },
  }
}

const OPTED_IN = {
  id: 's-yes', name: 'El Forn de la Plaça', subdomain: 'forn', showcase: true, created_at: '2026-01-01',
}
const NOT_OPTED_IN = {
  id: 's-no', name: 'Taller Mecànic Puig', subdomain: 'puig', showcase: false, created_at: '2026-01-02',
}
const postsFor = (id) => [
  { site_id: id, title: 'Un article', featured_image: null, is_published: true, created_at: '2026-02-01' },
]

async function showcase() {
  head('7. SHOWCASE PRIVACY (the opt-in wall)')

  {
    const wall = await readWall(12, fakeAdmin({
      sites: [OPTED_IN, NOT_OPTED_IN],
      posts: [...postsFor('s-yes'), ...postsFor('s-no')],
    }))
    const ids = wall.map((b) => b.id)
    if (ids.includes('s-no')) bad('a site with showcase=false reached the wall', ids.join(', '))
    else ok('showcase=false is never shown', `${ids.length} card(s), all opted in`)
    if (!ids.includes('s-yes')) bad('an opted-in site with a post did NOT reach the wall')
    else ok('an opted-in site with a published article IS shown')
  }

  {
    // The whole point of the fail-closed rule: no column, no wall.
    const wall = await readWall(12, fakeAdmin({
      sites: [OPTED_IN],
      posts: postsFor('s-yes'),
      sitesError: { code: '42703', message: 'column "showcase" does not exist' },
    }))
    if (wall.length) bad('a missing showcase column still returned sites', `${wall.length}`)
    else ok('42703 on sites fails CLOSED', 'a pending migration shows nobody, never everybody')
  }

  {
    // An opted-in blog with nothing published is an empty room, not a showcase.
    const wall = await readWall(12, fakeAdmin({ sites: [OPTED_IN], posts: [] }))
    if (wall.length) bad('an opted-in blog with no published posts was shown')
    else ok('opted in but empty is still not shown')
  }

  {
    // Belt-and-braces: even if the query were widened, the post-filter holds.
    const sneaky = { ...NOT_OPTED_IN, showcase: undefined }
    const wall = await readWall(12, fakeAdmin({ sites: [sneaky], posts: postsFor('s-no') }))
    if (wall.length) bad('a row without showcase=true survived the in-memory guard')
    else ok('the in-memory guard also requires showcase === true')
  }
}

/* ══ run ═══════════════════════════════════════════════════════════════════ */

console.log('LANDING GATE — el fil d’or')
if (existsSync(SHELL)) {
  const age = (Date.now() - statSync(SHELL).mtimeMs) / 60000
  console.log(`  build is ${age < 1 ? 'fresh' : `${age.toFixed(0)} min old`}`)
}

measure()
islands()
motion()
copy()
await showcase()
await ssr()

console.log(`\n${failures ? '✗ FAIL' : '✓ PASS'}  ${failures} failure(s), ${warnings} warning(s)`)
process.exit(failures ? 1 : 0)
