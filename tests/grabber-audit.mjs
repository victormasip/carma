// GRABBER AUDIT — what is actually wrong with the captured chrome, measured.
//
// Founder, 2026-09-17: "the current header/footer capture system struggles with
// bad color contrast and broken links. Audit it and analyse it."
//
// So: run the real engine over the cached Barcelona-100 and COUNT the two
// failures, per site, before changing anything. Everything here reads the same
// snapshot cache the eval uses, so it runs offline and is deterministic.
//
// Run: node --experimental-strip-types --import ./tests/register.mjs tests/grabber-audit.mjs

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { auditChromeContrast, extractGround } from '@/lib/scrape/chromeContrast'
import { EVAL_DATASET } from '@/lib/grabber-lab/evalDataset'
import { collectStylesheets } from '@/lib/grabber-lab/evalRun'

const ROOT = process.cwd()
const CACHE = path.join(ROOT, '.grabber-cache')
const sha1 = (s) => createHash('sha1').update(s).digest('hex')

const MAX_SHEETS = 8
const CSS_BUDGET = 400_000

const readHtml = (id) => {
  const p = path.join(CACHE, 'html', `${id}.html`)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}
const readCss = (url) => {
  const f = path.join(CACHE, 'css', `${sha1(url).slice(0, 20)}.css`)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

/** Same cascade the eval assembles, from the same snapshots. */
function cssFor(html, base) {
  const { urls, inline } = collectStylesheets(html, base)
  const texts = [...inline]
  let budget = CSS_BUDGET
  for (const u of urls.slice(0, MAX_SHEETS)) {
    if (budget <= 0) break
    const css = readCss(u)
    if (!css) continue
    const slice = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
    budget -= slice.length
    if (slice) texts.push(slice)
  }
  return texts.join('\n')
}

function countLinks(html) {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)]
    .map(m => (m[2] ?? m[3] ?? '').trim())
  const total = hrefs.length
  const js = hrefs.filter(h => /^javascript:/i.test(h)).length
  const empty = hrefs.filter(h => h === '').length
  const bareHash = hrefs.filter(h => h === '#').length
  // A fragment link whose target id is NOT in the chrome any more: the content
  // it pointed at was carved out.
  const ids = new Set([...html.matchAll(/\bid\s*=\s*("([^"]*)"|'([^']*)')/gi)].map(m => (m[2] ?? m[3] ?? '')))
  const deadFrag = hrefs.filter(h => h.startsWith('#') && h.length > 1 && !ids.has(h.slice(1))).length
  const noHref = [...html.matchAll(/<a\b(?![^>]*\bhref\b)[^>]*>/gi)].length
  return { total, js, empty, bareHash, deadFrag, noHref }
}

const cases = []
for (const c of EVAL_DATASET) {
  const html = readHtml(c.id)
  if (!html) continue
  const base = new URL(c.url)
  let split
  try { split = splitPageChrome(html, base) } catch { continue }
  if (split.strategy !== 'content') continue

  const css = cssFor(html, base)
  const ground = extractGround(css, split.bodyAttrs)
  const report = auditChromeContrast({
    css,
    headerHtml: split.top,
    footerHtml: split.bottom,
    ground,
  })
  const links = countLinks(`${split.top}\n${split.bottom}`)
  cases.push({ id: c.id, niche: c.niche, ground, report, links })
}

const n = cases.length
const pct = (k) => `${Math.round((k / n) * 100)}%`

console.log(`\n══════════ GRABBER AUDIT · ${n} carved sites ══════════\n`)

console.log('1. THE GROUND WE DROP (html/body background + color)')
const withBg = cases.filter(c => c.ground.background)
const withColor = cases.filter(c => c.ground.color)
const darkGround = cases.filter(c => c.ground.backgroundLum !== null && c.ground.backgroundLum < 0.4)
console.log(`   declares a body/html background : ${withBg.length}  (${pct(withBg.length)})`)
console.log(`   declares a body/html color      : ${withColor.length}  (${pct(withColor.length)})`)
console.log(`   that background is DARK         : ${darkGround.length}  (${pct(darkGround.length)})  ← the white-on-white candidates`)

console.log('\n2. CONTRAST (WCAG 2.1, chrome text vs its effective ground)')
const authored = cases.filter(c => c.report.failures.some(f => f.origin === 'authored'))
const ours = cases.filter(c => c.report.inheritedFailures.length > 0)
const ownGround = cases.filter(c => c.report.chromeHasOwnGround)
const repairGround = cases.filter(c => c.report.repair?.kind === 'ground')
const repairText = cases.filter(c => c.report.repair?.kind === 'text')
console.log(`   chrome paints its own ground       : ${ownGround.length}  (${pct(ownGround.length)})  ← immune by construction`)
console.log(`   AUTHORED failures (theirs, on the live site, untouched) : ${authored.length}  (${pct(authored.length)})`)
console.log(`   INHERITED failures (ours — the ground we drop)          : ${ours.length}  (${pct(ours.length)})`)
console.log(`   repaired by restoring the ground   : ${repairGround.length}`)
console.log(`   repaired by forcing legible text   : ${repairText.length}`)
for (const c of ours.slice(0, 12)) {
  const f = c.report.inheritedFailures[0]
  console.log(`     ${c.id.padEnd(20)} ${f.color} on ${f.background}  ${f.ratio.toFixed(2)}:1  → ${c.report.repair ? c.report.repair.kind : 'NO REPAIR'}`)
}

console.log('\n3. LINKS in the captured chrome')
const tot = cases.reduce((s, c) => s + c.links.total, 0)
const sum = (k) => cases.reduce((s, c) => s + c.links[k], 0)
console.log(`   total <a> captured        : ${tot}`)
console.log(`   href="javascript:…"       : ${sum('js')}   ← runs the SOURCE's JS on OUR origin`)
console.log(`   href="" (empty)           : ${sum('empty')}`)
console.log(`   href="#" (menu toggles)   : ${sum('bareHash')}   (legitimate — left alone)`)
console.log(`   dead in-page #fragments   : ${sum('deadFrag')}   ← target was carved out with the content`)
console.log(`   <a> with no href at all   : ${sum('noHref')}`)
const affected = cases.filter(c => c.links.js + c.links.empty + c.links.deadFrag > 0)
console.log(`   sites with >=1 broken link: ${affected.length}  (${pct(affected.length)})`)
for (const c of affected.slice(0, 12)) {
  console.log(`     ${c.id.padEnd(20)} js:${c.links.js} empty:${c.links.empty} dead:${c.links.deadFrag}  (of ${c.links.total})`)
}
console.log()
