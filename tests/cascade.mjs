// test:cascade — the stylesheet surgery, proven in a real browser.
//
// WHY THIS GATE EXISTS
// ────────────────────
// `test:render` and `test:fidelity` prove STRUCTURE: the document is balanced,
// the blog is inside a Declarative Shadow DOM, nothing leaks into the light DOM.
// Neither of them can see a cascade. A stylesheet whose every declaration lost
// `!important` and moved into a cascade layer still passes both of them byte for
// byte — including a version where a card title silently changes size because a
// rule that used to win on specificity now loses on layer order.
//
// The only instrument that can see that is a browser computing styles. So this
// gate renders a fixture matrix twice — once with a BASELINE snapshot taken
// before the surgery, once with the current renderer — and compares EVERY
// computed property of EVERY element in the blog's shadow tree (and its
// ::before / ::after / ::marker), at three viewports, in two states:
//
//   · at rest;
//   · with :hover, :focus-visible and :target forced on every element and every
//     <details> opened — so the interaction rules are compared too, not just the
//     resting page.
//
// Two renders that agree on all of that are the same page, for every purpose a
// visitor could notice.
//
// Then the cascade INVARIANTS the surgery is supposed to buy, checked forever:
//   · the shadow stylesheet declares its layer order once, first;
//   · no `!important` survives in the base layers (the DSD is the protection);
//   · the light-DOM host guard KEEPS its `!important` (nothing protects it);
//   · the Studio's live CSS, injected unlayered, still wins;
//   · the genome's extra stylesheet is actually applied — see LIVENESS below;
//   · the old-browser fallback flattens the layers without losing a rule.
//
// Run:
//   npm run test:cascade               compare against the baseline + invariants
//   npm run test:cascade -- --snapshot write the baseline from the CURRENT code
//
// The baseline lives in .next/cache/cascade (never committed: ~2MB of HTML). Take
// it on the commit BEFORE a stylesheet change, then make the change, then run.
// Without Chrome, or without a baseline, the browser half reports SKIPPED and the
// static invariants still run — a machine without Chrome must never block a build.

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import * as theme from '@/lib/render/theme.ts'
import { compileGenome } from '@/lib/design/compile.ts'
import { PRESET_GENOMES } from '@/lib/design/presets.ts'
import { buildSamplePosts, buildSampleArticle } from '@/lib/render/samplePosts.ts'
import { FEED_LAYOUTS } from '@/lib/render/feedLayouts.ts'
import { MODULES } from '@/lib/modules/registry.ts'
import { studioLiveCss } from '@/lib/render/studioLiveCss.ts'

const { buildListingPage, buildArticlePage } = theme

const ROOT = process.cwd()
const OUT = path.join(ROOT, '.next', 'cache', 'cascade')
const BASE_DIR = path.join(OUT, 'baseline')
const ARGS = new Set(process.argv.slice(2))
const SNAPSHOT = ARGS.has('--snapshot')

let pass = 0, fail = 0, skipped = 0
const fails = []
const ok = (cond, msg, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${msg}${detail ? `  (${detail})` : ''}`) }
  else { fail++; fails.push(msg); console.log(`  ✗ ${msg}${detail ? `\n      ${detail}` : ''}`) }
}
const skip = (msg) => { skipped++; console.log(`  – SKIPPED ${msg}`) }
const head = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 72 - t.length))}`)

/* ══ Fixtures ════════════════════════════════════════════════════════════════
   Everything the stylesheet can be asked to style. Dates are PINNED: sample posts
   stamp Date.now(), and a date's text width leaks into a flex item's used width,
   which would surface as a "cascade" difference that is nothing of the kind. */

const FIXED_DATE = '2026-03-14T10:00:00.000Z'
const pin = p => ({ ...p, created_at: FIXED_DATE })

const posts = buildSamplePosts('ca').map(pin)
// One real post with no image, one with a long title — the shapes that break grids.
const extraPosts = [
  { ...posts[0], id: 'x-noimg', slug: 'sense-imatge', title: 'Un article sense imatge destacada', featured_image: null, demo: false },
  { ...posts[1], id: 'x-long', slug: 'titol-llarg', title: 'Un títol deliberadament llarg per veure com es comporta la graella quan una targeta té tres línies de capçalera', demo: false },
]
const feed = [...posts, ...extraPosts]

// EVERY block the editor (or a WordPress import) can produce, in the markup the
// editor extensions actually emit (src/components/editor/extensions/*).
const RICH_HTML = `
<p>Primer paràgraf, amb <strong>negreta</strong>, <em>cursiva</em>, <a href="#l">un enllaç</a> i <code>codi en línia</code>.</p>
<nav class="carma-toc" data-carma-toc></nav>
<h2 id="h-dos">Capçalera de nivell dos</h2>
<p>Paràgraf de text corrent per donar ritme a la lectura i provar l'interlineat.</p>
<h3 id="h-tres">Capçalera de nivell tres</h3>
<ul><li>Primer element</li><li>Segon element amb <a href="#x">enllaç</a></li></ul>
<ol><li>U</li><li>Dos</li></ol>
<h4>Capçalera quatre</h4><h5>Capçalera cinc</h5><h6>Capçalera sis</h6>
<blockquote><p>Una cita llarga que ocupa una línia sencera, com les que fa servir una revista.</p></blockquote>
<pre><code>const a = 1\nconsole.log(a)</code></pre>
<hr>
<table><thead><tr><th>Columna</th><th>Valor</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></tbody></table>
<div class="carma-callout" data-variant="info"><p>Informació</p></div>
<div class="carma-callout" data-variant="success"><p>Èxit</p></div>
<div class="carma-callout" data-variant="warning"><p>Avís</p></div>
<div class="carma-callout" data-variant="danger"><p>Perill</p></div>
<figure class="carma-figure"><img src="/api/img?f=1" alt=""><figcaption>Peu de foto</figcaption></figure>
<div class="carma-gallery" data-count="2"><div class="carma-gallery-track">
  <div class="carma-slide" id="s-0"><a class="carma-gallery-item" href="#lb-0"><img src="/api/img?g=0" alt=""></a><a class="carma-slide-arrow prev" href="#s-1">‹</a><a class="carma-slide-arrow next" href="#s-1">›</a></div>
  <div class="carma-slide" id="s-1"><a class="carma-gallery-item" href="#lb-1"><img src="/api/img?g=1" alt=""></a></div>
</div>
<div class="carma-lightbox" id="lb-0"><a class="carma-lightbox-backdrop" href="#"></a><img class="carma-lightbox-img" src="/api/img?g=0" alt=""><a class="carma-lightbox-nav prev" href="#lb-1">‹</a><a class="carma-lightbox-nav next" href="#lb-1">›</a><a class="carma-lightbox-close" href="#">×</a></div>
</div>
<div class="carma-columns"><div class="carma-column"><p>Columna u</p></div><div class="carma-column"><p>Columna dos</p></div></div>
<details class="carma-toggle"><summary class="carma-toggle-summary">Desplegable</summary><p>Contingut amagat</p></details>
<div class="carma-embed" data-carma-embed data-provider="youtube" data-embed-id="dQw4w9WgXcQ"></div>
<div class="carma-button-wrap" data-align="center"><a class="carma-button" href="#cta">Reserva ara</a></div>
<img src="/api/img?solo=1" alt="">
<p>Últim paràgraf.</p>`

const richArticle = pin({ ...buildSampleArticle('ca'), id: 'rich', slug: 'ric', content: { html: RICH_HTML }, demo: false })

const allModules = (pick = 0) => Object.fromEntries(MODULES.map(m => {
  const vs = m.variants ?? []
  const v = vs.length ? vs[Math.min(pick, vs.length - 1)].id : undefined
  return [m.id, { enabled: true, ...(v ? { variant: v } : {}) }]
}))

const presetTokens = id => compileGenome(PRESET_GENOMES.find(g => g.id === id)).tokens

/** A captured card style with every field set — the native-card replication path. */
const NATIVE_CARD = {
  gap: '22px', columns: 3, radius: '6px', border: '1px solid #d0d0d0',
  shadow: '0 2px 6px rgba(0,0,0,.2)', background: '#fafafa', imageAspect: '4/3',
  titleSize: '21px', titleWeight: '600', titleColor: '#222',
}

/** A captured chrome sandwich, so the light-DOM half of the document exists. */
const CHROME = {
  extracted_header: '<div class="site"><header class="hdr"><a href="/">Marca</a><nav><a href="/a">A</a></nav></header>',
  extracted_footer: '<footer class="ftr">© Marca</footer></div>',
  extracted_body_attrs: 'class="home"',
}

function fixtures() {
  const out = []
  const add = (id, html) => out.push({ id, html })
  const listing = (t, p = feed) => buildListingPage(t, 'Demo', 'fixture-site', p, 'ca')
  const article = (t, a = richArticle) => buildArticlePage(t, 'Demo', 'fixture-site', a, 'ca')

  // 1. The eight shipped looks, listing + article.
  for (const g of PRESET_GENOMES) {
    const t = { design_tokens: compileGenome(g).tokens, section_title: 'Blog' }
    add(`preset-${g.id}-listing`, listing(t))
    add(`preset-${g.id}-article`, article(t))
  }
  // 2. Every structural feed layout, over one palette.
  for (const l of FEED_LAYOUTS) {
    add(`layout-${l.id}`, listing({ design_tokens: { ...presetTokens('carma'), feedLayout: l.id } }))
  }
  // 3. The legacy layout switches the feed layouts sit on top of.
  add('mode-list', listing({ design_tokens: { ...presetTokens('carma'), feedLayout: undefined, layout: 'list' } }))
  add('cols-2', listing({ design_tokens: { ...presetTokens('terra'), feedLayout: undefined, columns: '2' } }))
  add('cols-4', listing({ design_tokens: { ...presetTokens('terra'), feedLayout: undefined, columns: '4' } }))
  // 4. Native card replication, alone and under a feed layout.
  add('native-card', listing({ design_tokens: { ...presetTokens('carma'), feedLayout: undefined }, blog_signature: { card: NATIVE_CARD } }))
  add('native-card-magazine', listing({ design_tokens: { ...presetTokens('carma'), feedLayout: 'magazine' }, blog_signature: { card: NATIVE_CARD } }))
  // 5. Every Smart Module on, two variant sets, listing + article.
  for (const pick of [0, 1]) {
    const t = { design_tokens: presetTokens('carma'), modules: allModules(pick) }
    add(`modules-${pick}-listing`, listing(t))
    add(`modules-${pick}-article`, article(t))
  }
  add('modules-editorial', listing({ design_tokens: { ...presetTokens('editorial'), feedLayout: 'editorial' }, modules: allModules(2) }))
  // 6. Token edge cases the template branches on.
  add('tokens-title-center', listing({ design_tokens: {
    ...presetTokens('carma'), sectionTitleAlign: 'center', sectionTitleHeight: '180px',
    sectionTitleWidth: '60%', showBreadcrumb: true,
  } }))
  add('tokens-heading-image', listing({ design_tokens: { ...presetTokens('carma'), headingImage: '/api/img?hero=1', showBreadcrumb: true } }))
  add('tokens-links-hover', article({ design_tokens: {
    ...presetTokens('atelier'), linkUnderline: 'hover', blockquoteStyle: 'normal',
    blockquoteBorderColor: '#c00', bodyLineHeight: '1.9', paragraphSpacing: '2rem', headingLineHeight: '1.1',
  } }))
  add('tokens-links-none', article({ design_tokens: { ...presetTokens('pulse'), linkUnderline: 'none' } }))
  add('tokens-button', article({ design_tokens: {
    ...presetTokens('beacon'), buttonBg: '#123456', buttonText: '#fefefe', buttonRadius: '0px',
    buttonWeight: '500', buttonPaddingY: '1rem', buttonPaddingX: '2rem', buttonBorder: '2px solid #000',
    buttonShadow: '0 4px 0 #000', buttonTextTransform: 'uppercase',
  } }))
  // 7. A clone: light-DOM chrome around the shadow host.
  add('chrome-sandwich', listing({ design_tokens: presetTokens('noir'), ...CHROME }))
  // 8. The bare defaults — a theme with nothing in it.
  add('bare-listing', listing(null))
  add('bare-article', article(null))
  return out
}

/* ══ Helpers ═════════════════════════════════════════════════════════════════ */

/** The blog's own stylesheet: the first <style> inside the shadow template. */
function shadowCss(html) {
  const m = /<template shadowrootmode="open"><style>([\s\S]*?)<\/style>/.exec(html)
  return m ? m[1] : ''
}

/** Slice a stylesheet into its layer blocks (by the sentinels theme.ts emits). */
function layerBlocks(css) {
  const blocks = {}
  for (const m of css.matchAll(/@layer (carma\.[a-z]+)\{([\s\S]*?)\}\/\*\/\1\*\//g)) blocks[m[1]] = m[2]
  return blocks
}

const importantCount = s => (s.match(/!important/g) ?? []).length

/* ══ Snapshot ════════════════════════════════════════════════════════════════ */

if (SNAPSHOT) {
  head('SNAPSHOT — the baseline, rendered by the CURRENT code')
  rmSync(BASE_DIR, { recursive: true, force: true })
  mkdirSync(BASE_DIR, { recursive: true })
  const fx = fixtures()
  let bytes = 0
  for (const f of fx) { writeFileSync(path.join(BASE_DIR, `${f.id}.html`), f.html); bytes += f.html.length }
  // The stylesheet as it stood, for the byte comparison after the surgery.
  const sizes = {}
  for (const f of fx) {
    if (!f.id.startsWith('preset-')) continue
    const css = shadowCss(f.html)
    sizes[f.id] = { raw: css.length, gz: gzipSync(Buffer.from(css)).length, important: importantCount(css) }
  }
  writeFileSync(path.join(BASE_DIR, 'manifest.json'), JSON.stringify({
    at: new Date().toISOString(), fixtures: fx.map(f => f.id), sizes,
  }, null, 2))
  console.log(`  wrote ${fx.length} fixtures, ${(bytes / 1024).toFixed(0)}KB, to ${path.relative(ROOT, BASE_DIR)}`)
  process.exit(0)
}

/* ══ 1. STATIC INVARIANTS — no browser needed ════════════════════════════════ */

head('1. THE LAYERED STYLESHEET — static invariants')

const LAYER_ORDER = '@layer carma.reset,carma.tokens,carma.structure,carma.type,carma.ornament,carma.motion,carma.overrides;'
const BASE_LAYERS = ['carma.reset', 'carma.tokens', 'carma.structure', 'carma.type', 'carma.ornament', 'carma.motion']
const FX = fixtures()
{
  let orderOk = 0, cleanOk = 0, blocksOk = 0, stray = []
  for (const f of FX) {
    const css = shadowCss(f.html)
    if (css.startsWith(LAYER_ORDER)) orderOk++
    const blocks = layerBlocks(css)
    if (BASE_LAYERS.every(l => l in blocks) && 'carma.overrides' in blocks) blocksOk++
    const baseImportant = BASE_LAYERS.reduce((a, l) => a + importantCount(blocks[l] ?? ''), 0)
    if (baseImportant === 0) cleanOk++
    // Nothing may sit OUTSIDE a layer: an unlayered rule would outrank every layer
    // silently, which is precisely the ambiguity layers exist to remove.
    let rest = css.slice(LAYER_ORDER.length)
    for (const m of css.matchAll(/@layer (carma\.[a-z]+)\{[\s\S]*?\}\/\*\/\1\*\//g)) rest = rest.replace(m[0], '')
    if (rest.trim()) stray.push(`${f.id}: ${rest.trim().slice(0, 80)}`)
  }
  ok(orderOk === FX.length, 'every shadow stylesheet declares the layer order once, first', `${orderOk}/${FX.length}`)
  ok(blocksOk === FX.length, 'every stylesheet carries all seven layers', `${blocksOk}/${FX.length}`)
  ok(cleanOk === FX.length, 'zero `!important` in the six base layers', `${cleanOk}/${FX.length} clean`)
  ok(stray.length === 0, 'no rule sits outside a layer', stray[0] ?? 'none')

  // The light DOM has no shadow boundary protecting it, so the host guard is the
  // one place `!important` is still load-bearing. It must survive the surgery.
  const lightStyles = FX[0].html.split('<template shadowrootmode')[0]
  ok(/\.carma-embed-host\{display:block!important/.test(lightStyles), 'the light-DOM host guard keeps its !important')

  // The captured card is the template's own card, tuned — it closes `ornament`, so
  // our hover affordances in `motion` still beat it. The feed layout is a DECISION
  // and lives in `overrides`, where it beats both.
  const blocks = layerBlocks(shadowCss(FX.find(f => f.id === 'native-card-magazine').html))
  const orn = blocks['carma.ornament'] ?? '', ovr = blocks['carma.overrides'] ?? ''
  ok(/Native card replication[\s\S]*$/.test(orn) && !/Native card/.test(ovr) && /\.carma-grid\{display:grid/.test(ovr),
    'the captured card closes `ornament`; the feed layout sits in `overrides`')
}

// THE OLD-BROWSER PATH. A browser without @layer drops every `@layer {}` block
// whole — for our blog that would be an unstyled page. The DSD polyfill runs in
// exactly those browsers (every engine shipped @layer before native DSD), and it
// flattens the layers back into one sheet first. Prove the flattener loses nothing.
{
  const unlayer = theme.unlayerCss
  ok(typeof unlayer === 'function', 'theme.ts exports the flattener the runtime shim runs')
  if (typeof unlayer === 'function') {
    let clean = 0, same = 0
    for (const f of FX) {
      const css = shadowCss(f.html)
      const flat = unlayer(css)
      if (!/@layer/.test(flat) && (flat.match(/\{/g) ?? []).length === (flat.match(/\}/g) ?? []).length) clean++
      const blocks = layerBlocks(css)
      const want = Object.values(blocks).join('')
      if (flat.replace(/\s+/g, '') === want.replace(/\s+/g, '')) same++
    }
    ok(clean === FX.length, 'flattened: no @layer left, braces balanced', `${clean}/${FX.length}`)
    ok(same === FX.length, 'flattened == every layer body, in layer order, nothing dropped', `${same}/${FX.length}`)
    // The shim that ships must be the SAME algorithm, not a copy that can drift.
    const page = FX[0].html
    ok(page.includes(theme.UNLAYER_SHIM_MARK), 'the DSD runtime carries the flattening shim')
  }
}

/* ══ 2. BYTES ═══════════════════════════════════════════════════════════════ */

head('2. BYTES — the blog stylesheet, before and after')
{
  const manifestPath = path.join(BASE_DIR, 'manifest.json')
  const before = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).sizes : null
  const rows = []
  let tb = { raw: 0, gz: 0, imp: 0 }, ta = { raw: 0, gz: 0, imp: 0 }
  for (const f of FX.filter(f => f.id.startsWith('preset-'))) {
    const css = shadowCss(f.html)
    const a = { raw: css.length, gz: gzipSync(Buffer.from(css)).length, important: importantCount(css) }
    const b = before?.[f.id]
    if (b) { tb.raw += b.raw; tb.gz += b.gz; tb.imp += b.important }
    ta.raw += a.raw; ta.gz += a.gz; ta.imp += a.important
    rows.push(`    ${f.id.padEnd(28)} ${b ? `${String(b.raw).padStart(6)} → ` : ''}${String(a.raw).padStart(6)} B raw   ${b ? `${String(b.gz).padStart(5)} → ` : ''}${String(a.gz).padStart(5)} B gz   !important ${b ? `${b.important} → ` : ''}${a.important}`)
  }
  console.log(rows.join('\n'))
  if (before) {
    const n = rows.length
    console.log(`    ${'MEAN'.padEnd(28)} ${Math.round(tb.raw / n)} → ${Math.round(ta.raw / n)} B raw (${(((ta.raw - tb.raw) / tb.raw) * 100).toFixed(1)}%)   ${Math.round(tb.gz / n)} → ${Math.round(ta.gz / n)} B gz (${(((ta.gz - tb.gz) / tb.gz) * 100).toFixed(1)}%)   !important ${Math.round(tb.imp / n)} → ${Math.round(ta.imp / n)}`)
  }
  ok(true, 'measured (the budget itself is enforced by test:perf §6)')
}

/* ══ 3. THE BROWSER ═════════════════════════════════════════════════════════ */

function findPuppeteer() {
  const cache = path.join(homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official', 'chrome-devtools-mcp')
  const candidates = [path.join(ROOT, 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js')]
  if (existsSync(cache)) {
    for (const v of readdirSync(cache).sort().reverse()) {
      candidates.push(path.join(cache, v, 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js'))
    }
  }
  return candidates.find(existsSync) ?? null
}
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(existsSync) ?? null
}

// Runs IN THE PAGE. One FNV hash per element per pseudo, over every computed
// property — so a page ships ~1KB of hashes to node instead of ~2MB of styles.
// When a hash disagrees, `detail` fetches the full declarations for that element.
const COLLECT = `(() => {
  const host = document.querySelector('.carma-embed-host')
  const sr = host && host.shadowRoot
  if (!sr) return { error: 'no shadow root' }
  const els = [host, ...sr.querySelectorAll('*')]
  const h = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) } return (x >>> 0).toString(36) }
  // SORTED. Chrome enumerates custom properties (--ct-*) in an order that is not
  // stable between two documents, so an unsorted dump hashes identical styles
  // differently. The first dry run of this gate — same code against itself —
  // reported 116 "different" elements with not one differing property.
  //
  // NO margin-*. For \`margin: auto\` Chrome reports a USED length, and in headless
  // that report is not deterministic: the same document, loaded alone, read
  // \`margin-left: 0px\` six times in eight and \`30px\` the other two. Layout itself
  // is deterministic — so margins are judged by their EFFECT instead: every
  // element's border box is fingerprinted, and any margin that moves anything
  // moves a box.
  const dump = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); const ps = []; for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith('margin')) ps.push(cs[i]); ps.sort(); let s = ''; for (const p of ps) s += p + ':' + cs.getPropertyValue(p) + ';'; return s }
  const box = el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 2) / 2).join(' ') }
  return { rows: els.map(el => {
    const pseudos = [null, '::before', '::after']
    if (el.tagName === 'LI') pseudos.push('::marker')
    return el.tagName + '.' + (el.getAttribute('class') || '') + '|' + pseudos.map(p => h(dump(el, p))).join(',') + '|' + box(el)
  }) }
})()`

const DETAIL = (index) => `(() => {
  const host = document.querySelector('.carma-embed-host')
  const els = [host, ...host.shadowRoot.querySelectorAll('*')]
  const el = els[${index}]
  const out = {}
  for (const p of [null, '::before', '::after', '::marker']) {
    const cs = getComputedStyle(el, p)
    for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith('margin')) out[(p || '') + cs[i]] = cs.getPropertyValue(cs[i])
  }
  const r = el.getBoundingClientRect()
  out['[box]'] = [r.x, r.y, r.width, r.height].map(n => Math.round(n * 2) / 2).join(' ')
  return out
})()`

const VIEWPORTS = [1280, 820, 390]

const IMAGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#888"/></svg>'

/** Run every transition/animation in the shadow tree to its end state, so a
 *  forced :hover is read where it lands, not wherever it was mid-flight. */
async function settle(page) {
  await page.evaluate(() => {
    const sr = document.querySelector('.carma-embed-host')?.shadowRoot
    for (const a of sr?.getAnimations?.() ?? []) { try { a.finish() } catch { /* scroll-driven: no end */ } }
  })
}

async function withBrowser(fn) {
  const pp = findPuppeteer(), chrome = findChrome()
  if (!pp || !chrome) return fn(null)
  const mod = await import(pathToFileURL(pp).href)
  const puppeteer = mod.default ?? mod
  // One tiny origin serving whatever HTML the test registers. Real navigation (not
  // setContent) so the document parser — the one that honours
  // <template shadowrootmode> — is the one that builds the page.
  const docs = new Map()
  const server = createServer((req, res) => {
    const html = docs.get(req.url)
    if (html === undefined) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars'],
  })
  let seq = 0
  const open = async (html, width, { js = false } = {}) => {
    const page = await browser.newPage()
    await page.setJavaScriptEnabled(js)
    await page.setRequestInterception(true)
    // OFFLINE AND IDENTICAL. Our document loads; every image — whatever its URL
    // or srcset candidate — is the same 16:9 SVG, answered instantly; fonts and
    // the embed's iframe abort. An image that fails at a random moment changes
    // its ancestors' used heights, which is noise, not a cascade difference.
    page.on('request', r => {
      const p = r.resourceType() === 'document' && r.url().startsWith(origin) ? r.continue()
        : r.resourceType() === 'image' ? r.respond({ status: 200, contentType: 'image/svg+xml', body: IMAGE_SVG })
        : r.abort()
      p.catch(() => {})
    })
    await page.setViewport({ width, height: 900 })
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'no-preference' },
      { name: 'prefers-color-scheme', value: 'light' },
    ])
    const key = `/f/${++seq}`
    // Eager, so every image is inside the `load` event rather than racing it.
    docs.set(key, html.replace(/\sloading="lazy"/g, ''))
    await page.goto(origin + key, { waitUntil: 'load' })
    docs.delete(key)
    await settle(page)
    return page
  }
  try { return await fn({ open }) } finally {
    await browser.close().catch(() => {})
    server.close()
  }
}

/** Force :hover/:focus-visible/:target on every shadow element, open every <details>. */
async function forceStates(page) {
  const cdp = await page.createCDPSession()
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const ids = []
  ;(function walk(n, inShadow) {
    if (n.nodeType === 1 && inShadow) ids.push(n.nodeId)
    for (const c of n.children ?? []) walk(c, inShadow)
    for (const s of n.shadowRoots ?? []) walk(s, true)
  })(root, false)
  for (const nodeId of ids) {
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover', 'focus-visible', 'target'] })
      .catch(() => cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover', 'focus-visible'] }).catch(() => {}))
  }
  await page.evaluate(() => {
    const sr = document.querySelector('.carma-embed-host')?.shadowRoot
    sr?.querySelectorAll('details').forEach(d => d.setAttribute('open', ''))
  })
  return cdp
}

async function computed(open, html, width, forced) {
  const page = await open(html, width)
  if (forced) { await forceStates(page); await settle(page) }
  const res = await page.evaluate(COLLECT)
  return { page, res }
}

/** The declarations that differ for one element, old → new. */
async function explainDiff(pOld, pNew, index) {
  const [a, b] = await Promise.all([pOld.evaluate(DETAIL(index)), pNew.evaluate(DETAIL(index))])
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter(k => a[k] !== b[k]).map(k => `${k}: ${a[k]} → ${b[k]}`)
}

head('3. EQUIVALENCE — every computed property, baseline vs now')

// THE ONLY DIFFERENCES THE SURGERY IS ALLOWED TO MAKE — each named, each argued.
// Anything not on this list fails the gate. Keep it short: every entry is a
// visible change to a published blog that nobody asked the owner about.
const ALLOWED = [
  {
    fixture: /^modules-/, forced: true,
    el: /^A\.carma-mod-(card|hero-feature)\b/, prop: /radius/,
    why: 'keyboard focus on a Smart Module card no longer squares off its corners. `.carma-root a:focus-visible{border-radius:2px}` (0,2,1) used to out-specify the card’s own radius (0,1,0) — an accident of specificity, which is exactly what layers remove. Preserving it would mean writing a rule to keep a bug.',
  },
]
const allowedChange = (fixture, forced, elTag, lines) => ALLOWED.find(a =>
  a.fixture.test(fixture) && a.forced === forced && a.el.test(elTag) &&
  lines.length > 0 && lines.every(l => a.prop.test(l.split(':')[0])))
const allowedSeen = new Map()

const manifestPath = path.join(BASE_DIR, 'manifest.json')
const baselineIds = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).fixtures : null

await withBrowser(async (b) => {
  if (!b) { skip('no Chrome or no puppeteer-core — set CHROME_PATH, or install the chrome-devtools-mcp plugin'); return }
  if (!baselineIds) { skip(`no baseline — run \`npm run test:cascade -- --snapshot\` on the commit before a stylesheet change`) }
  else {
    let compared = 0, elements = 0, same = 0
    const report = []
    for (const f of FX) {
      if (!baselineIds.includes(f.id)) continue
      const oldHtml = readFileSync(path.join(BASE_DIR, `${f.id}.html`), 'utf8')
      for (const width of VIEWPORTS) {
        for (const forced of [false, true]) {
          const where = `${f.id} @${width}${forced ? ' :hover/:focus/:target/[open]' : ''}`
          compared++
          // RE-RENDER ON ANY MISMATCH, and keep only what differs EVERY time.
          // Chrome resolves `margin: auto` to a used length non-deterministically
          // (measured: identical documents read `margin-left: 0px` 1 load in 40,
          // `30px` the rest, with a forced layout in between). A cascade change is
          // deterministic; that is not. Three strikes separates the two.
          let persistent = null, last = null
          for (let attempt = 0; attempt < 3; attempt++) {
            const [o, n] = await Promise.all([computed(b.open, oldHtml, width, forced), computed(b.open, f.html, width, forced)])
            if (last) { await last.o.page.close(); await last.n.page.close() }
            last = { o, n }
            if (o.res.error || n.res.error || o.res.rows.length !== n.res.rows.length) { persistent = null; break }
            const differing = new Set(o.res.rows.map((r, i) => (r === n.res.rows[i] ? -1 : i)).filter(i => i >= 0))
            persistent = persistent ? new Set([...persistent].filter(i => differing.has(i))) : differing
            if (persistent.size === 0) break
          }
          const { o, n } = last
          if (o.res.error || n.res.error) report.push(`${where}: ${o.res.error ?? n.res.error}`)
          else if (o.res.rows.length !== n.res.rows.length) report.push(`${where}: element count ${o.res.rows.length} → ${n.res.rows.length}`)
          else {
            elements += o.res.rows.length
            same += o.res.rows.length - persistent.size
            let shown = 0, unexplained = 0
            for (const i of persistent) {
              const elTag = o.res.rows[i].split('|')[0]
              const lines = await explainDiff(o.page, n.page, i)
              const allowed = allowedChange(f.id, forced, elTag, lines)
              if (allowed) { allowedSeen.set(allowed, (allowedSeen.get(allowed) ?? 0) + 1); same++; continue }
              unexplained++
              if (++shown <= 3) report.push(`${where} · <${elTag}>\n        ${lines.slice(0, 8).join('\n        ')}`)
            }
            if (unexplained > 3) report.push(`${where}: …and ${unexplained - 3} more elements`)
          }
          await o.page.close(); await n.page.close()
        }
      }
    }
    console.log(`    ${compared} page states · ${elements.toLocaleString('en')} element comparisons (each = every computed property × ::before/::after)`)
    // Where, first — one line per page state that differs — then the detail.
    const states = [...new Set(report.map(r => r.split(' · ')[0].split(': ')[0]))]
    if (states.length) console.log(`    differing states (${states.length}):\n      ${states.join('\n      ')}`)
    ok(report.length === 0, 'the surgery changed no computed style except the named ones', report.length ? `${elements - same} elements differ:\n      ${report.slice(0, 40).join('\n      ')}` : `${same.toLocaleString('en')}/${elements.toLocaleString('en')} identical or allowed`)
    for (const [a, n] of allowedSeen) console.log(`    allowed ×${n}: ${a.why}`)
  }
})

/* ══ 4. WHAT THE LAYERS BUY — checked in the browser ═════════════════════════ */

head('4. THE LAYERS AT WORK — overrides, the Studio, the old-browser path')

await withBrowser(async (b) => {
  if (!b) { skip('no Chrome'); return }
  const read = (page, sel, prop, pseudo = null) => page.evaluate((s, p, ps) => {
    const el = document.querySelector('.carma-embed-host').shadowRoot.querySelector(s)
    return el ? getComputedStyle(el, ps).getPropertyValue(p) : null
  }, sel, prop, pseudo)

  // THE STUDIO injects its live CSS UNLAYERED, last, into the shadow root. An
  // unlayered rule outranks every layer, so it must win without needing to shout.
  {
    const html = buildListingPage({ design_tokens: presetTokens('carma') }, 'Demo', 'fx', feed, 'ca')
    const page = await b.open(html, 1280)
    await page.evaluate((css) => {
      const sr = document.querySelector('.carma-embed-host').shadowRoot
      const st = document.createElement('style'); st.textContent = css; sr.appendChild(st)
    }, studioLiveCss({ ...presetTokens('carma'), colorAccent: '#ff0000', sectionTitleSize: '5rem', sectionTitleAlign: 'center' }))
    const size = await read(page, '.carma-section-title', 'font-size')
    const align = await read(page, '.carma-section-title', 'text-align')
    const accent = await page.evaluate(() => getComputedStyle(document.querySelector('.carma-embed-host')).getPropertyValue('--ct-accent').trim())
    ok(size === '80px' && align === 'center', 'the Studio’s live section-title edit wins over the layered base', `${size}, ${align}`)
    ok(accent === '#ff0000', 'the Studio’s live token edit wins over the tokens layer', accent)
    await page.close()
  }

  // THE OLD-BROWSER PATH, in a browser that has @layer: swap the shadow sheet for
  // its flattened twin and compare the shipped looks. Equal means an old browser
  // gets the same blog a new one does.
  if (typeof theme.unlayerCss !== 'function') skip('no flattener exported yet')
  else {
    let diffs = 0, n = 0
    for (const f of FX.filter(f => /^preset-|^layout-/.test(f.id))) {
      const css = shadowCss(f.html)
      const flat = f.html.replace(css, () => theme.unlayerCss(css))
      const [o, nw] = await Promise.all([computed(b.open, f.html, 1280, false), computed(b.open, flat, 1280, false)])
      n++
      if (JSON.stringify(o.res.rows) !== JSON.stringify(nw.res.rows)) diffs++
      await o.page.close(); await nw.page.close()
    }
    ok(diffs === 0, 'the flattened (no-@layer) stylesheet renders the shipped looks identically', `${n - diffs}/${n}`)
  }
})

/* ══ 5. LIVENESS — does the genome's extra stylesheet actually apply? ════════
   Until W5 the genome's `css` had NO slot in the renderer at all, so nothing
   ever checked that it could win. It couldn't: it was written as ordinary
   declarations against a base that was `!important` on every line. These
   checks name each genome layer and assert the browser applies it. */

head('5. LIVENESS — the genome’s own layer, in the browser')

const PROBES = [
  // [label, genome patch, fixture, selector, property, pseudo, expect(value)]
  ['type.headingStyle  upper', g => ({ ...g, type: { ...g.type, headingCase: 'upper' } }), 'listing', '.carma-card-title', 'text-transform', null, v => v === 'uppercase'],
  ['type.headingStyle  loose', g => ({ ...g, type: { ...g.type, headingTracking: 'loose' } }), 'listing', '.carma-card-title', 'letter-spacing', null, v => /^0\.9|^1\.|^\d+(\.\d+)?px$/.test(v) && v !== 'normal' && parseFloat(v) > 0],
  ['feed.lead          row', g => ({ ...g, feed: { ...g.feed, mode: 'grid', rhythm: 'magazine', lead: 'first' } }), 'listing', '.carma-card:first-child .carma-card-link', 'flex-direction', null, v => v === 'row'],
  ['feed.lead          title', g => ({ ...g, feed: { ...g.feed, mode: 'grid', rhythm: 'magazine', lead: 'first' } }), 'listing', '.carma-card:first-child .carma-card-title', 'font-size', null, v => v === '32px'],
  ['feed.numbering', g => ({ ...g, feed: { ...g.feed, numbering: true } }), 'listing', '.carma-card-body', 'content', '::before', v => /counter/.test(v)],
  ['imagery.fit        contain', g => ({ ...g, imagery: { ...g.imagery, fit: 'contain' } }), 'listing', '.carma-card-media img', 'object-fit', null, v => v === 'contain'],
  ['imagery.treatment  grayscale', g => ({ ...g, imagery: { ...g.imagery, treatment: 'grayscale' } }), 'listing', '.carma-card-media img', 'filter', null, v => /grayscale/.test(v)],
  ['space.lanes        grid', g => ({ ...g, space: { ...g.space, lanes: 'content-wide' } }), 'article', '.carma-article-content', 'display', null, v => v === 'grid'],
  ['space.lanes        measure', g => ({ ...g, space: { ...g.space, lanes: 'content-wide' } }), 'article', '.carma-article-content', 'max-inline-size', null, v => v === 'none'],
  ['ornament.dropCap', g => ({ ...g, ornament: { ...g.ornament, dropCap: 'raised' } }), 'article', '.carma-article-content > p', 'initial-letter', '::first-letter', v => /^2/.test(v)],
  ['ornament.quoteMark oversize', g => ({ ...g, ornament: { ...g.ornament, quoteMark: 'oversize' } }), 'article', '.carma-article-content blockquote', 'border-left-width', null, v => v === '0px'],
  ['ornament.divider   gradient', g => ({ ...g, ornament: { ...g.ornament, divider: 'gradient' } }), 'article', '.carma-article-content hr', 'background-image', null, v => /gradient/.test(v)],
  ['ornament.underline offset', g => ({ ...g, ornament: { ...g.ornament, underline: 'offset' } }), 'article', '.carma-article-content > p a', 'text-underline-offset', null, v => v !== '2px' && v !== 'auto'],
  ['ornament.corner    cut', g => ({ ...g, ornament: { ...g.ornament, corner: 'cut' } }), 'listing', '.carma-card', 'clip-path', null, v => /polygon/.test(v)],
  ['motion.entrance    rise', g => ({ ...g, motion: { ...g.motion, entrance: 'rise' } }), 'listing', '.carma-card', 'animation-name', null, v => v === 'carma-rise'],
  ['motion.hover       shift', g => ({ ...g, motion: { ...g.motion, hover: 'shift' } }), 'listing', '.carma-card-title', 'transition-property', null, v => /transform/.test(v)],
]

await withBrowser(async (b) => {
  if (!b) { skip('no Chrome'); return }
  const base = PRESET_GENOMES.find(g => g.id === 'carma')
  const genomeCssSlot = 'genome_css'
  let live = 0, deadBefore = 0
  const lines = []
  for (const [label, patch, kind, sel, prop, pseudo, expect] of PROBES) {
    const g = patch({ ...base, origin: { ...base.origin, source: 'derived' } })
    const c = compileGenome(g, { skipCohesion: true })
    const t = { design_tokens: c.tokens, [genomeCssSlot]: c.css }
    const html = kind === 'listing'
      ? buildListingPage(t, 'Demo', 'fx', feed, 'ca')
      : buildArticlePage(t, 'Demo', 'fx', richArticle, 'ca')
    // THE COUNTERFACTUAL: the same genome CSS appended, unlayered, to the OLD
    // all-!important base — what W0–W4 would have shipped had it had a slot.
    const oldPath = path.join(BASE_DIR, kind === 'listing' ? 'preset-carma-listing.html' : 'preset-carma-article.html')
    const readIn = async (doc) => {
      const page = await b.open(doc, 1280)
      const v = await page.evaluate((s, p, ps) => {
        const el = document.querySelector('.carma-embed-host').shadowRoot.querySelector(s)
        return el ? getComputedStyle(el, ps).getPropertyValue(p).trim() : null
      }, sel, prop, pseudo)
      await page.close()
      return v
    }
    const now = await readIn(html)
    let then = null
    if (existsSync(oldPath)) {
      const oldHtml = readFileSync(oldPath, 'utf8')
        .replace(/(<template shadowrootmode="open"><style>[\s\S]*?)(<\/style>)/, (_m, a, z) => `${a}\n${c.css}${z}`)
      then = await readIn(oldHtml)
    }
    const isLive = now !== null && expect(now)
    const wasDead = then !== null && !expect(then)
    if (isLive) live++
    if (wasDead) deadBefore++
    lines.push(`    ${isLive ? '✓' : '✗'} ${label.padEnd(30)} ${String(now).padEnd(24)}${then !== null ? `  old base: ${wasDead ? `DEAD (${then})` : 'applied'}` : ''}`)
  }
  console.log(lines.join('\n'))
  ok(live === PROBES.length, 'every genome layer probed is applied by the browser', `${live}/${PROBES.length}`)

  // TITLE CASE IS ENGLISH-ONLY. The first live Door preview put "La Cocina De
  // Mercado Al Estilo Del Nautilus" on a Spanish blog; `:lang(en)` scopes it, and
  // :lang() must inherit from <html lang> across the shadow boundary for that to work.
  {
    const g = { ...base, origin: { ...base.origin, source: 'derived' }, type: { ...base.type, headingCase: 'title' } }
    const c = compileGenome(g, { skipCohesion: true })
    const caseIn = async (locale) => {
      const page = await b.open(buildListingPage({ design_tokens: c.tokens, genome_css: c.css }, 'Demo', 'fx', feed, locale), 1280)
      const v = await page.evaluate(() => getComputedStyle(document.querySelector('.carma-embed-host').shadowRoot.querySelector('.carma-card-title')).textTransform)
      await page.close()
      return v
    }
    const [en, ca, es] = [await caseIn('en'), await caseIn('ca'), await caseIn('es')]
    ok(en === 'capitalize' && ca === 'none' && es === 'none', 'title case applies to English blogs only', `en ${en} · ca ${ca} · es ${es}`)
  }
  if (existsSync(path.join(BASE_DIR, 'manifest.json'))) {
    console.log(`    against the old all-!important base, ${deadBefore}/${PROBES.length} of these would have been silently ignored`)
  }
})

/* ══ Result ══════════════════════════════════════════════════════════════════ */

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed · ${fail} failed · ${skipped} skipped`)
if (fail) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1) }
