// test:chrome-safety — W0, over the real render path and the whole corpus.
//
// The Studio's capture stores their chrome as the Top/Bottom "sandwich" (raw
// markup that opens and closes their wrappers) — 98 of 99 corpus captures with
// customer scripts inside, a median of 23. This gate renders every corpus site the
// way a published blog renders it (buildListingPage, keep mode, SAFE PANEL bar
// mode) and proves:
//
//   1  NOTHING EXECUTABLE of theirs reaches the page: no <script>, no on*
//      handler, no javascript:/vbscript: URL, no <iframe> outside the map
//      allow-list, no <object>/<embed>/<base>/<meta http-equiv> — anywhere before
//      SCRIPTS_MARK (our scripts come after it);
//   2  the CHECKER can see what it hunts: the same check over the unscrubbed
//      regions finds their scripts (a gate that cannot fail proves nothing);
//   3  the CSP lists exactly our scripts — a script planted before the marker has
//      no hash on it;
//   4  BURGERS: on the sites where the live lab (2026-10-07, real Chrome) found the
//      element that opens the phone menu, how often our static recognition marks
//      it (or its parent/child) — reported, floor-gated;
//   5  SAFE PANEL (bar): every link their header and footer publish is in the page.
//
//   npm run test:chrome-safety

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { parseFragment } from 'parse5'
import { EVAL_DATASET } from '@/lib/grabber-lab/evalDataset'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { buildListingPage, pageCsp, SCRIPTS_MARK } from '@/lib/render/theme'
import { extractLinkTree, treeLinks } from '@/lib/render/safePanel'
import { scrubChromeHtml } from '@/lib/render/chromeSafety'

const ROOT = process.cwd()
const CORPUS = path.join(ROOT, '.grabber-cache')
if (!existsSync(path.join(CORPUS, 'html'))) {
  console.log('SKIPPED — the Barcelona corpus (.grabber-cache) is not on this machine. This is not a pass.')
  process.exit(0)
}

let failed = 0
const ok = (cond, name, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failed++ }

const EXEC = new Set(['script', 'object', 'embed', 'applet', 'base', 'frame', 'frameset', 'portal', 'noscript'])
const MAP_IFRAME = /^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.[a-z.]+\/maps|www\.openstreetmap\.org\/export\/embed\.html)/i
/** Everything executable in a fragment — the gate's own eyes, independent of the scrubber. */
function executables(html) {
  const out = []
  ;(function walk(n) {
    const tag = n.tagName?.toLowerCase()
    const type = (n.attrs?.find(a => a.name === 'type')?.value ?? '').toLowerCase()
    // A JSON-LD block is data, not code: browsers never execute it.
    if (tag === 'script' && type === 'application/ld+json') return
    if (tag && EXEC.has(tag)) out.push(`<${tag}>`)
    if (tag === 'iframe' && !MAP_IFRAME.test(n.attrs?.find(a => a.name === 'src')?.value ?? '')) out.push('<iframe>')
    if (tag === 'meta' && n.attrs?.some(a => a.name === 'http-equiv')) out.push('<meta http-equiv>')
    // (`alternate` / `canonical` are the RSS and SEO links OUR head emits.)
    if (tag === 'link' && !/^(stylesheet|preconnect|dns-prefetch|icon|apple-touch-icon|alternate|canonical)$/i.test(n.attrs?.find(a => a.name === 'rel')?.value ?? '')) out.push('<link>')
    for (const a of n.attrs ?? []) {
      if (/^on/i.test(a.name)) out.push(`${a.name}=`)
      const v = a.value.replace(/[\u0000- ]+/g, '').toLowerCase()
      if (/^(href|src|action|formaction|data|poster|srcset)$/i.test(a.name) && /^(javascript|vbscript):/.test(v)) out.push(`${a.name}=${v.slice(0, 16)}`)
    }
    for (const c of n.childNodes ?? []) walk(c)
    if (n.content) walk(n.content)
  })(parseFragment(html))
  return out
}

const sites = []
for (const c of EVAL_DATASET) {
  const f = path.join(CORPUS, 'html', `${c.id}.html`)
  if (!existsSync(f)) continue
  const html = readFileSync(f, 'utf8')
  const split = splitPageChrome(html, new URL(c.url))
  if (!split.top.trim() && !split.bottom.trim()) continue
  sites.push({ c, split })
}
console.log(`\n${sites.length} corpus sites with captured chrome\n`)

// ─── 1 + 2 · nothing executable of theirs reaches the page ──────────────────
console.log('1 · their code never reaches the page')
let before = 0, sitesWithScripts = 0, leaked = 0, leakedSites = []
const scriptsPerSite = []
for (const { c, split } of sites) {
  const raw = executables(`${split.top}${split.bottom}`)
  if (raw.some(x => x === '<script>')) sitesWithScripts++
  scriptsPerSite.push(raw.filter(x => x === '<script>').length)
  before += raw.length
  const theme = {
    extracted_header: split.top, extracted_footer: split.bottom, extracted_body_attrs: split.bodyAttrs,
    extracted_head: '<script src="https://cdn.example/jquery.js"></script><link rel="stylesheet" href="https://x.example/a.css">',
    base_url: c.url, default_locale: 'ca',
  }
  const page = buildListingPage(theme, 'Demo', 'site', [], 'ca', { base: '', siteDefault: 'ca' })
  const theirs = page.slice(0, page.lastIndexOf(SCRIPTS_MARK))
  const found = executables(theirs)
  if (found.length) { leaked++; leakedSites.push(`${c.id}: ${[...new Set(found)].slice(0, 4).join(' ')}`) }
}
const med = [...scriptsPerSite].sort((a, b) => a - b)[Math.floor(scriptsPerSite.length / 2)]
console.log(`    their regions carried ${before} executable things; ${sitesWithScripts}/${sites.length} sites had <script> (median ${med} per site)`)
ok(sitesWithScripts > 0 && before > 0, 'the checker sees their scripts in the raw regions (it can fail)', `${before} found`)
ok(leaked === 0, 'after the render: zero executable things of theirs on any page', leakedSites.slice(0, 5).join(' · ') || `${sites.length} pages clean`)

// ─── 3 · the CSP lists our scripts only ──────────────────────────────────────
console.log('\n2 · the CSP lists our scripts, and only ours')
{
  const { split, c } = sites[0]
  const page = buildListingPage({ extracted_header: split.top, extracted_footer: split.bottom, base_url: c.url, default_locale: 'ca' }, 'Demo', 'site', [], 'ca')
  const csp = pageCsp(page)
  const ours = [...page.slice(page.lastIndexOf(SCRIPTS_MARK)).matchAll(/<script>/g)].length
  ok(/^script-src 'sha256-/.test(csp) && (csp.match(/'sha256-/g) ?? []).length === ours && /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp),
    'script-src = one hash per script of ours, plus object-src/base-uri none', `${ours} scripts`)
  // A script that survived the scrub would sit BEFORE the marker: no hash.
  const forged = page.replace('<body', '<script>window.__pwned=1</script><body')
  const { createHash } = await import('node:crypto')
  const h = `'sha256-${createHash('sha256').update('window.__pwned=1').digest('base64')}'`
  ok(!pageCsp(forged).includes(h), 'a script before the marker gets no hash — the browser refuses it')
  // And the scrubber's own walk, on a hostile fragment.
  const hostile = '<a href="java&#115;cript:alert(1)">x</a><img src=x onerror=alert(1)><svg><a xlink:href="javascript:1"><text>y</text></a><animate attributeName="href" to="javascript:1"/></svg><iframe src="https://evil.example"></iframe><iframe src="https://www.google.com/maps/embed?pb=1"></iframe><scr<script>ipt>alert(1)</scr</script>ipt><math><mtext><table><mglyph><style><img src=x onerror=alert(2)>'
  const scrubbed = scrubChromeHtml(hostile).html
  ok(executables(scrubbed).length === 0 && scrubbed.includes('google.com/maps/embed') && /sandbox="allow-scripts allow-same-origin allow-popups"/.test(scrubbed),
    'a hostile fragment: nothing executable left, the map embed kept — sandboxed', executables(scrubbed).join(' ') || 'clean')
}

// ─── 4 · burgers vs the live lab ─────────────────────────────────────────────
console.log('\n3 · their burger, recognised (vs the live lab)')
{
  const labFile = path.join(CORPUS, 'research', 'chrome-lab-merged.json')
  if (!existsSync(labFile)) console.log('    (no live-lab results on this machine — burger recall not measured)')
  else {
    const lab = JSON.parse(readFileSync(labFile, 'utf8'))
    const rows = Array.isArray(lab) ? lab : (lab.rows ?? [])
    const NOT_MENU = /(cookie|consent|cmplz|hustle|popmake|pum-|dialog-close|lightbox|cookiebot|eu-cookie|decline)/i
    let truth = 0, inCapture = 0, hit = 0, native = 0
    const misses = [], absent = []
    for (const r of rows) {
      const t = r.mobile?.toggle
      if (r.mobile?.menu !== 'opened' || !t || NOT_MENU.test(t.cls ?? '')) continue
      const site = sites.find(s => s.c.id === r.id)
      if (!site) continue
      truth++
      // The live element's distinctive class tokens (generic ones carry no signal).
      const tokens = (t.cls ?? '').split(/\s+/).filter(x => x.length > 3 && /^[\w-]+$/.test(x) && !/^(btn|button|icon|is-small|closed|active|open|collapsed|always|menu)$/i.test(x))
      // Is the trigger in what a STATIC capture holds at all? Often it is not: the
      // phone header is built by their JS, or sits outside the region the split
      // took — that is R1, and W2's browser capture is its fix, not this walk.
      if (tokens.length && !tokens.some(tok => site.split.top.includes(tok))) { absent.push(r.id); continue }
      inCapture++
      // <details>/<summary> and checkbox menus open with no script at all.
      if (t.tag === 'summary' || t.tag === 'label') { native++; hit++; continue }
      const { html, stats } = scrubChromeHtml(site.split.top)
      const markedEls = [...html.matchAll(/<(\w+)([^>]*?)data-carma-burger[^>]*>/g)].map(m => m[0])
      const match = tokens.length ? markedEls.some(el => tokens.some(tok => el.includes(tok))) : stats.burgers > 0
      if (match) hit++
      else misses.push(`${r.id}(${t.tag}.${tokens.slice(0, 2).join('.') || '?'})`)
    }
    const recall = inCapture ? hit / inCapture : 0
    console.log(`    live menus with a real trigger: ${truth} · trigger present in the static capture: ${inCapture} · recognised: ${hit} (${Math.round(recall * 100)}%, ${native} native)`)
    console.log(`    not in a static capture (built by their JS / outside the split — W2): ${absent.length}${absent.length ? ` — ${absent.join(' ')}` : ''}`)
    if (misses.length) console.log(`    present but not recognised: ${misses.join(' ')}`)
    ok(recall >= 0.85, 'recognises ≥ 85% of the menu triggers a static capture contains (today all of them are dead)', `${hit}/${inCapture}`)
  }
}

// ─── 5 · SAFE PANEL bar keeps every link ─────────────────────────────────────
console.log('\n4 · SAFE PANEL (bar) carries every link')
{
  let total = 0, lost = 0
  for (const { c, split } of sites) {
    const theme = { extracted_header: split.top, extracted_footer: split.bottom, base_url: c.url, default_locale: 'ca', chrome_compile_stats: { faithful: false } }
    const page = buildListingPage(theme, 'Demo', 'site', [], 'ca')
    const want = treeLinks(extractLinkTree(split.top, split.bottom, c.url))
    const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    const got = new Set([...page.matchAll(/href="([^"]+)"/g)].map(m => decode(m[1])))
    total += want.length
    lost += want.filter(l => !got.has(l.href)).length
  }
  ok(total > 0 && lost === 0, 'every header + footer link of every corpus site is in its SAFE PANEL page (V3)', `${lost}/${total} lost`)
}

console.log(`\n${failed ? `${failed} FAILED` : 'PASS'}`)
process.exit(failed ? 1 : 0)
