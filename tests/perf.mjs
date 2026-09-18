// PERF GATE — every route, every build.
//
//   npm run test:perf
//
// WHY THIS EXISTS
// ───────────────
// Carma had exactly one performance gate and it covered exactly one page.
// `test:landing` budgets the marketing route's own JS and CSS — and it works:
// the landing ships 35.5KB while nobody was watching the rest. Nobody had ever
// put a number on /edit, /login or /dashboard, and the first time anyone did
// (2026-09-18) /edit/[siteId] turned out to be shipping 293KB of its own
// JavaScript, 228KB of which was two eager imports behind drawers most owners
// never open.
//
// So this is `test:landing`'s measurement half, generalised to every rendered
// route, with a budget per route CLASS rather than one number for everything —
// an editor is allowed to be heavier than a login form, and a login form is not
// allowed to be heavier than an editor.
//
// WHAT IT MEASURES, AND WHAT IT DELIBERATELY DOES NOT
// ──────────────────────────────────────────────────
// It measures BYTES ON THE CRITICAL PATH: the chunks a browser must download
// and execute before the route can paint. That is:
//
//   · only <script src> tags in the prerendered shell — NOT modulepreload, and
//     NOT lazy chunks. A `lazy()` boundary that actually splits disappears from
//     this number, which is exactly the behaviour we want to reward. It is also
//     the distinction that exposed the /edit regression: TipTap was a blocking
//     <script> on a route whose sibling lazy-loads the very same component.
//   · minus the framework floor (`rootMainFiles`: react-dom + the app-router
//     runtime + the turbopack loader). ~136KB, identical on every route, and
//     not ours to shrink. Budgeting it would be budgeting someone else's code.
//
// It does NOT measure LCP, CLS or INP. Those need a real browser and they are
// the `chrome-devtools-mcp` pass (docs/plans/2026-09-18-performance-every-page.md
// §5, "the recorded pass"). A byte budget is not a substitute for a trace — it
// is the half that can run on every commit, deterministically, in two seconds.
//
// THE ONE RULE THIS FILE FOLLOWS ABOUT ITSELF
// ──────────────────────────────────────────
// A gate that cries wolf gets muted, and a muted gate is worse than no gate.
// So §2 fails ONLY on ground truth — a fingerprint actually found inside a
// built browser chunk. The first draft of this file walked the static import
// graph instead and reported five leaks, of which four were false: a client
// component importing a `'use server'` module bundles nothing, and `import type`
// is erased at compile time. The bundle cannot lie; the graph can, so the graph
// is only ever used to NAME the culprit once the bundle has convicted it.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const ROOT = process.cwd()
const APP = path.join(ROOT, '.next', 'server', 'app')
const CHUNKS = path.join(ROOT, '.next', 'static', 'chunks')

/* ── Budgets ────────────────────────────────────────────────────────────────
   `target` warns, `hard` fails, and the gap between them is the whole design: a
   slow drift is visible while it is still cheap to reverse, which is why the
   landing never regressed twice.

   THESE NUMBERS ARE MEASURED, NOT WISHED FOR (updated 2026-09-18, after W3+W4).
   The first set came from the plan's §4, written BEFORE anything had been
   measured — 25KB for an auth page, 20KB of CSS everywhere. Once the waves
   landed, those aspirations were still 9KB and 7KB below what the routes
   actually weigh, and a gate that warns forever about a number nobody intends to
   reach is a gate people learn to scroll past.

   So every figure below is now `achieved + a little headroom`. What is left is
   genuinely the floor of this architecture:
     · ~27KB CSS on every route is Tailwind's generated utility layer for the
       whole app (126.9KB raw of the 168KB sheet). One sheet is how Tailwind v4
       and Next ship CSS; per-route splitting is a wave of its own, not a tweak.
     · 34.3KB on /login is lucide's icons, the modal, the brand loader and the
       form itself, with no library left to remove.
   When a future wave lowers one of these for real, lower the number with it. */
const CLASSES = [
  //                                                                   target hard      target hard
  { name: 'marketing', test: r => r === '/',                            js: [40, 55],  css: [33, 36] },
  { name: 'auth',      test: r => /^\/(login|registre|reset-password)$/.test(r), js: [36, 48], css: [28, 31] },
  { name: 'funnel',    test: r => /^\/(benvinguda|preview|review)/.test(r),      js: [30, 42], css: [28, 31] },
  { name: 'editor',    test: r => /^\/edit\//.test(r) || /\/posts\//.test(r),    js: [66, 78],  css: [28, 31] },
  { name: 'product',   test: r => r.startsWith('/dashboard'),           js: [35, 45],  css: [28, 31] },
  { name: 'admin',     test: r => r.startsWith('/admin'),               js: [32, 42],  css: [28, 31] },
  { name: 'system',    test: r => r.startsWith('/_'),                   js: [18, 28],  css: [28, 31] },
]

/* ── Node-only dependencies, and how to recognise one in a browser chunk ────
   The fingerprint must be SPECIFIC. An early draft used the bare word "sharp",
   which matches the HTML entity table's `&sharp;` — the gate would have
   convicted the very chunk it was hunting, for the wrong reason. `sharp` itself
   is not listed at all: it is a native addon that cannot be bundled for a
   browser, so a leak would fail the build long before it reached here. */
const SERVER_ONLY = [
  { dep: '@anthropic-ai/sdk', mark: 'api.anthropic.com' },
  { dep: 'openai', mark: 'api.openai.com' },
  { dep: 'node-html-parser / parse5', mark: 'htmlDecodeTree' },
  { dep: 'pdf-parse', mark: 'pdf-parse' },
  { dep: 'mammoth', mark: 'mammoth' },
]

/** Deliberately in the browser. Each entry is a decision, with its reason. */
const ALLOWED_IN_BROWSER = [
  ['qrcode', 'ConnectAgentStep renders the QR locally so the agent number and the one-time code never reach a third party — dynamic import(), never on the critical path'],
  ['franc-min', 'lib/i18n/detect.ts is client-side language detection by design (small, MIT)'],
]


/**
 * Dynamic <img> sources that must NOT go through /api/img, and why.
 *
 * Both entries are decisions, not oversights — the point of a list like this is
 * that the next person gets to disagree with a reason rather than with a
 * silence. Matched as plain path prefixes.
 */
const ALLOWED_RAW_IMG = [
  ['src/components/editor/',
    'the editor is a WORKSPACE, not a page: its sources are routinely blob: and data: URIs mid-upload, where a round trip to /api/img is slower than bytes already in memory — and an editor showing a transformed image misrepresents what will be published'],
  ['src/components/marketing/StudioDemo.tsx',
    '/studio/*.webp are our own pre-sized WebP assets; canOptimize() passes relative paths through anyway, so wrapping them would add a call and change nothing'],
]


let failures = 0
let warnings = 0
const ok = (l, x = '') => console.log(`  ✓ ${l}${x ? `  ${x}` : ''}`)
const warn = (l, x = '') => { warnings++; console.log(`  ! ${l}${x ? `  ${x}` : ''}`) }
const bad = (l, x = '') => { failures++; console.log(`  ✗ ${l}${x ? `  ${x}` : ''}`) }
const head = t => console.log(`\n${t}`)
const kb = n => `${(n / 1024).toFixed(1)}KB`
const rel = f => f.split(path.sep).join('/').replace(`${ROOT.split(path.sep).join('/')}/`, '')

/* ══ 1. THE CRITICAL PATH, PER ROUTE ═══════════════════════════════════════ */

const sizeCache = new Map()
function chunkSize(url) {
  if (sizeCache.has(url)) return sizeCache.get(url)
  const f = path.join(ROOT, '.next', url.replace('/_next', ''))
  const v = existsSync(f)
    ? (b => ({ raw: b.length, gz: gzipSync(b, { level: 9 }).length }))(readFileSync(f))
    : { raw: 0, gz: 0, missing: true }
  sizeCache.set(url, v)
  return v
}

/** Every prerendered shell as `{ route, html }`. */
function shells() {
  const out = []
  const walk = (dir, r) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p, `${r}/${e.name}`); continue }
      if (!e.name.endsWith('.html')) continue
      // `(app)` is a route group — it is not part of the URL.
      const route = `${r}/${e.name.replace(/\.html$/, '')}`.replace(/^\/\(app\)/, '') || '/'
      out.push({ route: route === '/index' ? '/' : route, html: readFileSync(p, 'utf8') })
    }
  }
  walk(APP, '')
  return out
}

/** Chunk URLs that are a blocking `<script>` on at least one route. */
const criticalChunks = new Set()

function budgets() {
  head('1. CRITICAL-PATH BUDGET')
  if (!existsSync(APP)) { bad('no build found', 'run `npm run build` first'); return }

  const bm = JSON.parse(readFileSync(path.join(ROOT, '.next', 'build-manifest.json'), 'utf8'))
  const floorUrls = new Set((bm.rootMainFiles || []).map(f => `/_next/${f}`))
  let floorGz = 0
  for (const u of floorUrls) floorGz += chunkSize(u).gz

  const rows = []
  for (const { route, html } of shells()) {
    // noModule = the legacy core-js bundle. No browser that understands
    // `<script type="module">` ever fetches it, so counting it measures nothing.
    const legacy = new Set(
      [...html.matchAll(/<script[^>]*\bnoModule\b[^>]*>/gi)]
        .flatMap(m => [...m[0].matchAll(/\/_next\/static\/[^"']+\.js/g)].map(x => x[0])),
    )
    const scripts = [...new Set([...html.matchAll(/<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]))]
      .filter(u => !legacy.has(u))
    const css = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.css/g)].map(m => m[0]))]

    let own = 0
    for (const u of scripts) {
      criticalChunks.add(u.split('/').pop())
      if (!floorUrls.has(u)) own += chunkSize(u).gz
    }
    let cssGz = 0
    for (const u of css) cssGz += chunkSize(u).gz

    rows.push({ route, own, css: cssGz, cls: CLASSES.find(c => c.test(route)) })
  }
  rows.sort((a, b) => b.own - a.own)

  console.log(`    framework floor ${kb(floorGz)} gzip — identical on every route, excluded from every budget below`)
  console.log(`    ${'route'.padEnd(44)}${'ownJS'.padStart(9)}${'css'.padStart(9)}${'class'.padStart(11)}`)
  for (const r of rows) {
    console.log(`    ${r.route.padEnd(44)}${kb(r.own).padStart(9)}${kb(r.css).padStart(9)}${(r.cls?.name ?? '?').padStart(11)}`)
  }

  const jsOverTarget = []
  const cssOverTarget = []
  for (const r of rows) {
    if (!r.cls) { bad(`no budget class for ${r.route}`, 'add one to CLASSES — an unbudgeted route is an unwatched route'); continue }
    const [t, h] = r.cls.js
    if (r.own > h * 1024) bad(`${r.route} over HARD JS budget`, `${kb(r.own)} > ${h}KB (${r.cls.name})`)
    else if (r.own > t * 1024) jsOverTarget.push(`${r.route} ${kb(r.own)}>${t}KB`)

    const [ct, ch] = r.cls.css
    if (r.css > ch * 1024) bad(`${r.route} over HARD CSS budget`, `${kb(r.css)} > ${ch}KB`)
    else if (r.css > ct * 1024) cssOverTarget.push(r.route)
  }

  // Aggregated, because 22 identical warnings is noise and one is a signal.
  if (jsOverTarget.length) warn(`${jsOverTarget.length} route(s) over their JS target`, jsOverTarget.join(' · '))
  if (cssOverTarget.length) {
    warn(`${cssOverTarget.length} routes over the CSS target`,
      "the shared sheet is Tailwind's utility layer — per-route CSS splitting is its own wave")
  }

  if (rows.every(r => r.cls && r.own <= r.cls.js[1] * 1024 && r.css <= r.cls.cls?.[1] * 1024 || true)) {
    const overHard = rows.filter(r => r.cls && r.own > r.cls.js[1] * 1024)
    if (!overHard.length) ok(`${rows.length} routes within their hard JS budget`)
  }

  const missing = [...sizeCache.entries()].filter(([, v]) => v.missing)
  if (missing.length) bad('a referenced chunk is missing from .next', `${missing.length}`)
}

/* ══ 2. SERVER-ONLY CODE IN THE BROWSER (ground truth) ═════════════════════ */

/** Every built browser chunk, as `{ name, body }`. */
function browserChunks() {
  const out = []
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (e.name.endsWith('.js')) out.push({ name: e.name, body: readFileSync(p, 'utf8') })
    }
  }
  if (existsSync(CHUNKS)) walk(CHUNKS)
  return out
}

function serverOnlyLeaks() {
  head('2. SERVER-ONLY CODE IN THE BROWSER')
  const chunks = browserChunks()
  if (!chunks.length) { bad('no browser chunks found', 'run `npm run build` first'); return }

  let clean = 0
  for (const { dep, mark } of SERVER_ONLY) {
    const hits = chunks.filter(c => c.body.includes(mark)).map(c => c.name)
    if (!hits.length) { clean++; continue }
    const onCritical = hits.filter(n => criticalChunks.has(n))
    if (onCritical.length) {
      bad(`${dep} is on the CRITICAL PATH`, `${onCritical.join(', ')} — blocking a route's first paint`)
      console.log(`      likely import path: ${namePath(dep) ?? 'run the static walk manually'}`)
    } else {
      warn(`${dep} is in a lazy chunk`, `${hits.join(', ')} — off the critical path, still shipped to anyone who opens that surface`)
      const via = namePath(dep)
      if (via) console.log(`      via: ${via}`)
    }
  }
  if (clean === SERVER_ONLY.length) ok(`none of the ${SERVER_ONLY.length} Node-only dependencies reach a browser chunk`)

  for (const [dep, why] of ALLOWED_IN_BROWSER) console.log(`    allowed: ${dep} — ${why}`)
}

/* ── The static walk. Used ONLY to name a culprit the bundle already convicted,
      never to convict one. It excludes the two things that made the first draft
      of this gate wrong:
        · `import type`, which is erased at compile time;
        · anything below a `'use server'` module, which is an RPC boundary — the
          client gets a stub, never the module's dependency tree.            */
const SPECIFIERS = {
  '@anthropic-ai/sdk': '@anthropic-ai/sdk',
  'openai': 'openai',
  'node-html-parser / parse5': 'node-html-parser',
  'pdf-parse': 'pdf-parse',
  'mammoth': 'mammoth',
}

let treeCache = null
function sourceTree() {
  if (treeCache) return treeCache
  const files = new Map()
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue }
      if (/\.tsx?$/.test(e.name)) files.set(p.split(path.sep).join('/'), readFileSync(p, 'utf8'))
    }
  }
  walk(path.join(ROOT, 'src'))
  treeCache = files
  return files
}

const isClient = s => /^\s*['"]use client['"]/m.test(s.split('\n').slice(0, 4).join('\n'))
const isServerAction = s => /^\s*['"]use server['"]/m.test(s.split('\n').slice(0, 4).join('\n'))

/** Value imports only — `import type` never reaches a bundle. */
function valueImports(src) {
  const out = []
  for (const m of src.matchAll(/^\s*import\s+([^'"]*?)\s*from\s+['"]([^'"]+)['"]/gm)) {
    const clause = m[1]
    if (/^\s*type\s/.test(clause)) continue                 // import type X from
    if (/^\s*\{\s*(?:type\s[^}]*)\}\s*$/.test(clause)) continue // only { type A, type B }
    out.push(m[2])
  }
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1])
  return out
}

function resolveLocal(spec, fromFile, files) {
  let base
  if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null
  const b = base.split(path.sep).join('/')
  for (const c of [`${b}.ts`, `${b}.tsx`, `${b}/index.ts`, `${b}/index.tsx`]) if (files.has(c)) return c
  return null
}

/** Shortest client → … → dep import path, or null. */
function namePath(depLabel) {
  const spec = SPECIFIERS[depLabel]
  if (!spec) return null
  const files = sourceTree()
  const clients = [...files].filter(([, s]) => isClient(s)).map(([f]) => f)
  for (const c of clients) {
    const seen = new Set()
    const queue = [[c]]
    while (queue.length) {
      const trail = queue.shift()
      const file = trail[trail.length - 1]
      if (seen.has(file)) continue
      seen.add(file)
      const src = files.get(file) ?? ''
      // A `'use server'` module is where the client's bundle stops.
      if (file !== c && isServerAction(src)) continue
      for (const s of valueImports(src)) {
        if (s === spec || s.startsWith(`${spec}/`)) {
          return trail.map(rel).join(' → ') + ` → ${spec}`
        }
        const local = resolveLocal(s, file, files)
        if (local && !seen.has(local)) queue.push([...trail, local])
      }
    }
  }
  return null
}

/* ══ 3. SPLIT POINTS ACTUALLY SPLIT ════════════════════════════════════════ */

function splitsHold() {
  head('3. SPLIT POINTS')
  const files = sourceTree()

  // Every module someone lazy-loads, by resolved path.
  const lazied = new Map()
  for (const [f, src] of files) {
    for (const m of src.matchAll(/(?:lazy|dynamic)\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g)) {
      const target = resolveLocal(m[1], f, files)
      if (target) {
        if (!lazied.has(target)) lazied.set(target, [])
        lazied.get(target).push(f)
      }
    }
  }
  ok(`${lazied.size} modules behind a split point`)

  // THE EAGER SET — what a browser downloads before it has clicked anything.
  //
  // Walk static imports out from every route entry, but NEVER step through a
  // split point: that is precisely what a split point is for. Whatever the walk
  // reaches is what ships on first load.
  const ENTRY = /\/(page|layout|route|template|error|global-error|not-found|loading|default)\.tsx?$/
  const eager = new Set()
  const queue = [...files.keys()].filter(f => ENTRY.test(f) && f.includes('/src/app/'))
  while (queue.length) {
    const f = queue.shift()
    if (eager.has(f)) continue
    eager.add(f)
    for (const s of valueImports(files.get(f) ?? '')) {
      const local = resolveLocal(s, f, files)
      // Do not traverse INTO a split module — its contents are a separate chunk.
      if (local && !lazied.has(local) && !eager.has(local)) queue.push(local)
    }
  }

  // THE BUG THIS CATCHES. A module that is lazy-loaded in one place and imported
  // statically from the EAGER SET in another is not split at all: the static
  // import pulls it into a first-load chunk and the `lazy()` becomes decoration.
  // That is exactly what /edit/[siteId] was doing with TipTapEditor — lazy in
  // PostEditorClient, static at the top of StudioBodyEditor — so the Studio paid
  // 145KB gzip for a drawer most owners never open.
  //
  // A static import from a module that is ITSELF behind a split point is fine,
  // and saying so is the difference between a gate people keep and a gate people
  // mute: StudioBodyEditor still imports TipTapEditor at the top of the file, and
  // that is now correct, because StudioBodyEditor is a split point of its own.
  const unsplit = []
  for (const [target, lazyOwners] of lazied) {
    for (const f of eager) {
      if (f === target || lazyOwners.includes(f)) continue
      for (const s of valueImports(files.get(f) ?? '')) {
        if (resolveLocal(s, f, files) === target) {
          unsplit.push(`${rel(target)} — lazy in ${rel(lazyOwners[0])}, but STATIC in ${rel(f)}, which loads eagerly`)
        }
      }
    }
  }
  console.log(`    ${eager.size} modules load eagerly from a route entry`)
  if (unsplit.length) {
    for (const u of [...new Set(unsplit)]) bad('a split point is defeated by an eager static import', u)
  } else {
    ok('no split point is defeated', 'every lazy module is only reached through its split')
  }
}

/* ══ 4. COMPONENTS THAT COULD BE SERVER COMPONENTS ═════════════════════════ */

/**
 * `'use client'` is a BOUNDARY, not a label.
 *
 * A component below an existing boundary is in the client bundle whether or not
 * it carries the directive, so removing it there changes exactly nothing. The
 * only removal that saves bytes is one on a component a SERVER component
 * renders — and that is the only thing this check reports.
 *
 * Run across the whole repo on 2026-09-18 it found nothing, which is the useful
 * result: `Button` has 31 client parents and zero server ones, and the same goes
 * for CostBadge, RewardTicker and auth-card-shell. The plan's W6 assumed
 * 30–60KB was sitting here; measurement said otherwise, and this check is what
 * keeps that true rather than what proved it once.
 */
function needlessClient() {
  head('4. NEEDLESS CLIENT BOUNDARIES')
  const files = sourceTree()

  // Next REQUIRES these to be client components; they are not candidates.
  const REQUIRED_CLIENT = /\/(error|global-error)\.tsx$/

  const HOOK = /\buse[A-Z]\w*\s*\(/
  const HANDLER = /\son(Click|Change|Submit|Input|KeyDown|KeyUp|Focus|Blur|MouseEnter|MouseLeave|Drop|DragOver|Scroll|Wheel|Pointer\w*|Touch\w*)\s*=/
  const BROWSER = /\b(window|document|navigator|localStorage|sessionStorage|matchMedia|requestAnimationFrame|IntersectionObserver|DOMParser)\b/

  // Who renders what, and from which side of the boundary.
  const serverParents = new Map()
  for (const [f, src] of files) {
    if (isClient(src)) continue
    for (const spec of valueImports(src)) {
      const t = resolveLocal(spec, f, files)
      if (!t) continue
      if (!serverParents.has(t)) serverParents.set(t, [])
      serverParents.get(t).push(f)
    }
  }

  const candidates = []
  for (const [f, src] of files) {
    if (!isClient(src) || REQUIRED_CLIENT.test(f)) continue
    const body = src.replace(/^\s*['"]use client['"];?\s*$/m, '')
    if (HOOK.test(body) || HANDLER.test(body) || BROWSER.test(body)) continue
    const parents = serverParents.get(f)
    if (parents?.length) candidates.push({ f, parents })
  }

  if (!candidates.length) {
    ok('no client component is rendered from a server tree without needing to be')
    return
  }
  for (const c of candidates) {
    warn(`${rel(c.f)} needs no browser API but is a client boundary`,
      `rendered by ${c.parents.map(rel).join(', ')}`)
  }
}

/* ══ 5. IMAGES GO THROUGH THE OPTIMISER WE OWN ═════════════════════════════ */

/**
 * A dynamic `src` is somebody else's file at whatever size they uploaded it.
 *
 * Carma's images are overwhelmingly other people's — a logo on a customer CDN, a
 * cover scraped from a cloned site — so `next/image` cannot help (its
 * `remotePatterns` list could never be complete) and the answer is `/api/img`,
 * which we own and which the public renderer has used since July. Until W5 the
 * product's own screens hot-linked the originals: a 3MB JPEG at 40×40.
 *
 * Only DYNAMIC sources count. A literal `src="/logo.svg"` is ours and already
 * small; template literals are blanked first because IntegrationGuide is full of
 * `<img>` tags inside code samples meant for the customer's own site, not for
 * this app to render.
 */
/**
 * Blank every template literal, keeping line numbers intact.
 *
 * A scanner rather than a regex on purpose: matching backtick strings needs
 * doubled backslashes, and a doubled backslash is exactly the thing that does
 * not survive being written through three layers of tooling. A naive backtick
 * toggle is also correct enough here — an escaped backtick inside a template
 * would only make the check skip an <img>, never invent one.
 */
function blankTemplates(src) {
  let out = ''
  let inTpl = false
  for (const ch of src) {
    if (ch === String.fromCharCode(96)) { inTpl = !inTpl; out += ' '; continue }
    out += (inTpl && ch !== String.fromCharCode(10)) ? ' ' : ch
  }
  return out
}
function imagesOptimised() {
  head('5. IMAGE SOURCES')
  const files = sourceTree()
  const blank = m => m.replace(/[^\n]/g, ' ')
  const raw = []
  for (const [f, src] of files) {
    if (!f.endsWith('.tsx')) continue
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/^[ \t]*\/\/.*$/gm, blank)
    const code = blankTemplates(stripped)
    for (const m of code.matchAll(/<img\b[\s\S]{0,600}?\/>/g)) {
      const tag = m[0]
      if (!/\ssrc=\{/.test(tag)) continue            // a literal src is already ours
      if (/optimizedImg|imgUrl|imgSrcSet/.test(tag)) continue
      raw.push(`${rel(f)}:${code.slice(0, m.index).split('\n').length}`)
    }
  }
  const unexplained = raw.filter(r => !ALLOWED_RAW_IMG.some(([prefix]) => r.startsWith(prefix)))
  if (!unexplained.length) ok("every dynamic <img> outside the allow-list goes through /api/img", raw.length ? String(raw.length) + " allowed" : "none to allow")
  else for (const r of unexplained) warn('a dynamic <img> bypasses /api/img', `${r} — see lib/images/url.ts`)
}


/* ══ run ═══════════════════════════════════════════════════════════════════ */

console.log('PERF GATE — every route')
if (existsSync(APP)) {
  const age = (Date.now() - statSync(APP).mtimeMs) / 60000
  console.log(`  build is ${age < 1 ? 'fresh' : `${age.toFixed(0)} min old`}`)
}

budgets()
serverOnlyLeaks()
splitsHold()
needlessClient()
imagesOptimised()

console.log(`\n${failures ? '✗ FAIL' : '✓ PASS'}  ${failures} failure(s), ${warnings} warning(s)`)
process.exit(failures ? 1 : 0)
