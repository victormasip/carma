// test:editor-fidelity — W7: the page being written on IS the page being read.
//
//   npm run build && npm run test:editor-fidelity
//   npm run test:editor-fidelity -- --only=verne                  # a subset
//
// (Before W7 the classic editor scored 41,546 differences on this gate; it and
// its imitation CSS were deleted in W7.4.)
//
// For each design — the eight shipped presets and live Sonnet 5 genomes (Verne's
// literary serifs and drop cap among them) — and at a desktop and a phone width:
//
//   1. the REAL editor is loaded with the fixture article (every block, every mark,
//      a cover)
//      on /lab/canvas, and `editor.getHTML()` is taken — exactly what gets saved;
//   2. that HTML is rendered through the REAL `buildArticlePage` at the same
//      viewport width — exactly what a reader gets;
//   3. every element of the article header (title, lede, meta line), of the cover
//      and of the content column is compared, pair by pair: its computed style (face, size, weight, leading, tracking,
//      case, colours, decoration, margins, padding, borders, radius, list style,
//      numerals, ligatures, grid lane), its ::before / ::after / ::first-letter /
//      ::marker, and its box (width, height, and its offset from the content column).
//
// THE GATE: everything must be IDENTICAL — prose (paragraphs, headings, lists,
// quotes, code, rules, inline marks), the header, the cover, and every block
// (callout, columns, toggle, CTA, figure, gallery, embed, table of contents). Not
// compared, because editing itself requires them: `white-space`
// (ProseMirror needs pre-wrap — its CONSEQUENCE, where lines break, is compared
// through every box), `caret-color`, outlines, and elements marked `data-carma-ui`.

import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { PRESET_GENOMES } from '@/lib/design/presets'
import { buildArticlePage } from '@/lib/render/theme'
import { labPost, labTheme } from '@/lib/render/canvasLab'
import { labServer, stubVideo } from './lab-server.mjs'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PPTR = [
  path.join(process.cwd(), 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js'),
  path.join(process.env.USERPROFILE ?? '', '.claude/plugins/cache/claude-plugins-official/chrome-devtools-mcp/1.9.0/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'),
].find(existsSync)
if (!PPTR || !existsSync(CHROME)) { console.log('SKIP  no Chrome / puppeteer-core (this is not a pass)'); process.exit(0) }
const mod = await import(pathToFileURL(PPTR).href)
const puppeteer = mod.default ?? mod


// ── The designs ─────────────────────────────────────────────────────────────
const designs = PRESET_GENOMES.map(g => ({ id: `preset:${g.id}`, genome: g, locale: 'ca' }))
const report = path.join('tests', 'grabber', 'llm-director.claude-sonnet-5.json')
if (existsSync(report)) {
  const sites = JSON.parse(readFileSync(report, 'utf8')).sites.filter(s => s.genomes)
  for (const s of sites.filter(x => ['resto-verne', 'dental-cdb', 'legal-granvia', 'beauty-hipolita'].includes(x.id))) {
    for (const v of ['faithful', 'elevated', 'reimagined']) designs.push({ id: `${s.id}:${v}`, genome: s.genomes[v], locale: 'ca' })
  }
}
// English, for the Genome's title case (it applies under :lang(en) only).
for (const d of designs.filter(x => /verne:elevated|preset:carma|preset:noir/.test(x.id))) designs.push({ ...d, id: `${d.id}@en`, locale: 'en' })
const WIDTHS = ['desktop', 'phone']
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice(7)
const RUN = designs.filter(x => !ONLY || x.id.includes(ONLY))
const step = process.env.FIDELITY_TRACE ? m => console.log('    ·', m) : () => {}

// ── What is compared ────────────────────────────────────────────────────────
const PROPS = [
  'display', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing',
  'text-transform', 'text-align', 'text-indent', 'color', 'background-color', 'background-image', 'opacity',
  'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness', 'text-underline-offset',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-top-style', 'border-top-color', 'border-right-width', 'border-bottom-width', 'border-bottom-style',
  'border-bottom-color', 'border-left-width', 'border-left-style', 'border-left-color', 'border-top-left-radius', 'border-bottom-right-radius',
  'list-style-type', 'list-style-position', 'font-variant-numeric', 'font-variant-ligatures', 'font-feature-settings',
  'font-optical-sizing', 'box-shadow', 'vertical-align', 'max-width', 'grid-column-start', 'grid-column-end', 'justify-self',
  '-webkit-initial-letter', 'float',
  // What decides WHERE a line breaks (W7.5: a box can match while its lines differ).
  'overflow-wrap', 'word-break', 'line-break', 'hyphens', 'text-wrap-style', 'text-wrap-mode',
]
const PSEUDO_PROPS = ['content', 'color', 'font-family', 'font-size', 'font-weight', 'display', 'opacity', 'margin-right', 'float', '-webkit-initial-letter', 'background-image']

// SUB-PIXEL IS NOT A DIFFERENCE — for layout extents only (2026-10-09). A `ch`-based
// measure resolves to 894.65px in the canvas iframe and 894.138px in the published
// page on the same font and width (Chrome 154; the gate was at 0 on Chrome of
// 2026-09-28), and boxes were already compared at ±1px. Typography stays EXACT: a
// font-size or tracking that drifts a fraction of a pixel moves line breaks, and
// every box below would say so anyway.
const SUBPIXEL_PROPS = new Set(['max-width', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left'])
const PX = /^-?\d+(?:\.\d+)?px$/
const sameValue = (prop, a, b) => a === b
  || (SUBPIXEL_PROPS.has(prop) && PX.test(a) && PX.test(b) && Math.abs(parseFloat(a) - parseFloat(b)) < 1)

// Runs INSIDE the page: the element tree under a root, with styles and boxes.
function collect(where, props, pseudoProps) {
  const doc = where.frame ? document.querySelector('iframe').contentDocument : document
  const scope = where.shadow ? doc.querySelector(where.shadow).shadowRoot : doc
  const root = scope.querySelector(where.root)
  const header = scope.querySelector('.carma-article-header')
  const cover = scope.querySelector('.carma-article-image-wrap')
  if (!root) return null
  const view = doc.defaultView
  const r0 = root.getBoundingClientRect()
  const skip = e => e.hasAttribute('data-carma-ui') || e.classList.contains('ProseMirror-trailingBreak') || e.classList.contains('ProseMirror-separator') || e.classList.contains('ProseMirror-gapcursor')
  const read = (e, withKids) => {
    const cs = view.getComputedStyle(e)
    const out = { tag: e.tagName.toLowerCase(), cls: e.getAttribute('class') ?? '', s: {}, p: {}, box: null, kids: [] }
    for (const k of props) out.s[k] = cs.getPropertyValue(k)
    for (const pe of ['::before', '::after', '::first-letter', '::marker']) {
      const ps = view.getComputedStyle(e, pe)
      const content = ps.getPropertyValue('content')
      if (pe !== '::first-letter' && pe !== '::marker' && (content === 'none' || content === 'normal')) continue
      out.p[pe] = Object.fromEntries(pseudoProps.map(k => [k, ps.getPropertyValue(k)]))
    }
    const b = e.getBoundingClientRect()
    // x AND y from the content column's corner: a spacing difference BETWEEN elements
    // (a margin that collapses differently) moves everything after it (W7.5).
    // An element that is not rendered (a gallery's closed lightbox) has an all-zero
    // rect: its "offset" would only measure where the column sits on each page.
    const shown = e.getClientRects().length > 0
    out.box = { w: Math.round(b.width), h: Math.round(b.height), x: shown ? Math.round(b.left - r0.left) : 0, y: shown ? Math.round(b.top - r0.top) : 0 }
    if (withKids) for (const c of e.children) if (!skip(c)) out.kids.push(read(c, true))
    return out
  }
  return { width: doc.documentElement.clientWidth, root: read(root, true), header: header && header.children.length ? read(header, true) : null, cover: cover ? read(cover, true) : null }
}

const blockType = n => {
  if (/^(p|h[1-6]|ul|ol|blockquote|pre|hr)$/.test(n.tag)) return 'prose'
  if (/carma-callout/.test(n.cls)) return 'callout'
  if (/carma-columns/.test(n.cls)) return 'columns'
  if (/carma-toggle/.test(n.cls)) return 'toggle'
  if (/carma-figure|carma-article-image/.test(n.cls) || n.tag === 'figure') return 'figure'
  if (/carma-button|carma-cta/.test(n.cls)) return 'cta'
  if (/carma-gallery/.test(n.cls)) return 'gallery'
  if (/carma-toc/.test(n.cls)) return 'toc'
  if (/carma-embed/.test(n.cls)) return 'embed'
  return `other:${n.tag}`
}

function diff(a, b, where, out) {
  if (a.tag !== b.tag) { out.push({ where, prop: '<tag>', ed: a.tag, pub: b.tag }); return }
  for (const k of Object.keys(a.s)) if (!sameValue(k, a.s[k], b.s[k])) out.push({ where, prop: k, ed: a.s[k], pub: b.s[k] })
  for (const pe of new Set([...Object.keys(a.p), ...Object.keys(b.p)])) {
    const x = a.p[pe], y = b.p[pe]
    if (!x || !y) { out.push({ where: `${where}${pe}`, prop: '<exists>', ed: !!x, pub: !!y }); continue }
    for (const k of Object.keys(x)) if (x[k] !== y[k]) out.push({ where: `${where}${pe}`, prop: k, ed: x[k], pub: y[k] })
  }
  for (const k of ['w', 'h', 'x', 'y']) if (Math.abs(a.box[k] - b.box[k]) > 1) out.push({ where, prop: `box.${k}`, ed: a.box[k], pub: b.box[k] })
  if (a.kids.length !== b.kids.length) out.push({ where, prop: '<children>', ed: a.kids.length, pub: b.kids.length })
  const n = Math.min(a.kids.length, b.kids.length)
  for (let i = 0; i < n; i++) diff(a.kids[i], b.kids[i], `${where}>${a.kids[i].tag}[${i}]`, out)
}

// ── Run ─────────────────────────────────────────────────────────────────────
console.log('EDITOR FIDELITY — the canvas vs the published article')
const server = await labServer()
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'], protocolTimeout: 90000 })
const edPage = await browser.newPage(); await edPage.setViewport({ width: 1280, height: 900 })
const pubPage = await browser.newPage()
await stubVideo(edPage)
await stubVideo(pubPage)
// MOTION IS NOT THE CANVAS'S CONTRACT. The editor never animates; the published
// page reveals its h2s on scroll (`rise`: from opacity 0, +18px), so a heading
// below the fold is — correctly — still at its first keyframe when measured. The
// gate compares the STATIC design: both pages get reduced motion, which the
// genome's motion layer honours (@media (prefers-reduced-motion:no-preference)).
for (const p of [edPage, pubPage]) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
const tally = { prose: { pairs: 0, diffs: 0 }, header: { pairs: 0, diffs: 0 }, cover: { pairs: 0, diffs: 0 } }
const byBlock = new Map()
const samples = []
try {
  for (const d of RUN) {
    for (const width of WIDTHS) {
      step(`${d.id} ${width} goto`)
      // A background tab gets no rendering steps: no rAF, no ResizeObserver (the
      // canvas's height) and a puppeteer click that waits forever. Front first.
      await edPage.bringToFront()
      const g = Buffer.from(JSON.stringify(d.genome)).toString('base64url')
      await edPage.goto(`${server.base}/lab/canvas?g=${g}&l=${d.locale}`, { waitUntil: 'networkidle0', timeout: 60000 })
      await edPage.waitForFunction(() => window.__lab?.ready === true, { timeout: 45000 })
      step('ready')
      if (width === 'phone') { await edPage.click('[data-lab-width="phone"]'); await new Promise(r => setTimeout(r, 500)) }
      await edPage.evaluate(() => document.querySelector('iframe').contentDocument.fonts.ready.then(() => true))
      await edPage.evaluate(() => document.fonts.ready.then(() => true))
      step('fonts')
      const saved = await edPage.evaluate(() => window.__lab.editor.getHTML())
      const ed = await edPage.evaluate(collect, { frame: true, root: '.carma-article-content' }, PROPS, PSEUDO_PROPS)

      step('collected editor')
      const vw = ed.width
      await pubPage.bringToFront()
      await pubPage.setViewport({ width: vw, height: 900 })
      await pubPage.setContent(buildArticlePage(labTheme(d.genome, d.locale), 'Lab', 'lab', labPost(saved, d.locale), d.locale), { waitUntil: 'load', timeout: 60000 })
      await pubPage.evaluate(() => document.fonts.ready.then(() => true))
      const pub = await pubPage.evaluate(collect, { shadow: '.carma-embed-host', root: '.carma-article-content' }, PROPS, PSEUDO_PROPS)

      const n = Math.min(ed.root.kids.length, pub.root.kids.length)
      for (let i = 0; i < n; i++) {
        const a = ed.root.kids[i], b = pub.root.kids[i]
        const type = blockType(b)
        const out = []
        diff(a, b, `${b.tag}[${i}]`, out)
        if (type === 'prose') { tally.prose.pairs++; tally.prose.diffs += out.length }
        else {
          const t = byBlock.get(type) ?? { pairs: 0, diffs: 0, props: new Map() }
          t.pairs++; t.diffs += out.length
          for (const o of out) t.props.set(o.prop, (t.props.get(o.prop) ?? 0) + 1)
          byBlock.set(type, t)
        }
        for (const o of out) samples.push({ design: d.id, width, type, ...o })
      }
      if (ed.root.kids.length !== pub.root.kids.length) samples.push({ design: d.id, width, type: 'structure', where: 'content', prop: '<blocks>', ed: ed.root.kids.length, pub: pub.root.kids.length })
      for (const part of ['header', 'cover']) {
        if (!ed[part] || !pub[part]) { if (ed[part] !== pub[part]) samples.push({ design: d.id, width, type: 'structure', where: part, prop: '<exists>', ed: !!ed[part], pub: !!pub[part] }); continue }
        const out = []; diff(ed[part], pub[part], part, out)
        tally[part].pairs++; tally[part].diffs += out.length
        for (const o of out) samples.push({ design: d.id, width, type: part, ...o })
      }
      process.stdout.write(`  ${d.id.padEnd(30)} ${width.padEnd(8)} ${vw}px\n`)
    }
  }
} finally {
  await browser.close()
  server.stop()
}

console.log(`\n  prose  ${tally.prose.pairs} block pairs · ${tally.prose.diffs} differing properties`)
console.log(`  header ${tally.header.pairs ? `${tally.header.pairs} pairs · ${tally.header.diffs} differing properties  (title · lede · meta line)` : 'not on the canvas'}`)
console.log(`  cover  ${tally.cover.pairs ? `${tally.cover.pairs} pairs · ${tally.cover.diffs} differing properties` : 'not on the canvas'}`)
for (const [type, t] of [...byBlock.entries()].sort()) {
  const top = [...t.props.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`).join(' ')
  console.log(`  ${type.padEnd(8)} ${String(t.pairs).padStart(3)} pairs · ${String(t.diffs).padStart(4)} differing${top ? `  ${top}` : ''}`)
}
const structural = samples.filter(s => s.type === 'structure')
const hard = samples.filter(s => s.type !== 'structure')
// One line per KIND of difference (block type · element path · property), with its
// count and the designs it hit — 79 lines of the same pre[7] hid everything else.
const kinds = new Map()
for (const s of [...structural, ...hard]) {
  const k = `${s.type} ${s.where.replace(/\[\d+\]/g, '')} ${s.prop}`
  const g = kinds.get(k) ?? { n: 0, first: s, designs: new Set() }
  g.n++; g.designs.add(`${s.design}/${s.width}`); kinds.set(k, g)
}
for (const [k, g] of [...kinds.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 20)) {
  const s = g.first
  console.log(`    ✗ ${String(g.n).padStart(4)}× ${k} — e.g. ${s.design} ${s.width}: editor ${JSON.stringify(s.ed)} · published ${JSON.stringify(s.pub)} (${g.designs.size} design×width)`)
}
const blockDiffs = [...byBlock.values()].reduce((a, t) => a + t.diffs, 0)
const failed = tally.prose.diffs + tally.header.diffs + tally.cover.diffs + blockDiffs + structural.length
  + (tally.header.pairs === 0 ? 1 : 0) + (tally.cover.pairs === 0 ? 1 : 0) // the canvas must HAVE both
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${RUN.length} designs × ${WIDTHS.length} widths · ${failed} differences where there must be none`)
process.exit(failed === 0 ? 0 : 1)
