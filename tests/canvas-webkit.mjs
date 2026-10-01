// W7.5 — THE CANVAS IN WEBKIT: Safari's engine, not Chrome pretending.
//
//   npm run build && npm run test:canvas-webkit
//
// test:canvas drives the editor in Chrome; its "iPhone" is Chrome with a touch
// screen. This drives the SAME lab page in Playwright's WebKit (the engine Safari
// ships), on a desktop viewport and under iPhone emulation (touch, isMobile,
// the iPhone's viewport and user agent) — the interactions the plan named as the
// risk of an iframe canvas: focus from the first click / tap, typing, keyboard
// selection, undo, the bubble menu's position across the frame boundary, the
// slash menu, the header's plain-text contentEditable, the CTA label, links.
//
// What this CANNOT cover, said plainly: it runs WebKit on Windows (Playwright's
// build), not iOS Safari on a device. There is no virtual keyboard, no iOS text
// selection handles, no iOS "focus only inside a user gesture" keyboard policy.
// Those need a real iPhone (or the iOS Simulator, macOS only).

import { labServer } from './lab-server.mjs'

let pw
try { pw = await import('playwright-core') } catch { console.log('SKIP  playwright-core is not installed (this is not a pass)'); process.exit(0) }
const { webkit, devices } = pw.default ?? pw

let pass = 0, fail = 0
const fails = []
const ok = (cond, msg, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${msg}${detail ? `  (${detail})` : ''}`) }
  else { fail++; fails.push(msg); console.log(`  ✗ ${msg}${detail ? `\n      ${detail}` : ''}`) }
}
const head = t => console.log(`\n── ${t}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
/** Video hosts and the image transform answered offline, as in the Chrome suites. */
async function stub(context) {
  await context.route(/(youtube-nocookie\.com|youtube\.com|vimeo\.com|ytimg\.com)/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }))
  await context.route(/\/api\/img\?/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }))
}

const server = await labServer()
let browser
try {
  browser = await webkit.launch()
} catch (e) {
  server.stop()
  console.log(`SKIP  WebKit is not installed — run \`npx playwright-core install webkit\` (this is not a pass)\n      ${String(e.message).split('\n')[0]}`)
  process.exit(0)
}
console.log(`CANVAS IN WEBKIT — ${browser.version()} (Playwright's WebKit, not iOS Safari)`)
const errors = []

async function open(context) {
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text().slice(0, 120)} — ${m.location()?.url?.slice(0, 80) ?? ''}`) })
  await page.goto(`${server.base}/lab/canvas?preset=noir`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 45000 })
  const frame = page.frames().find(f => f !== page.mainFrame())
  await frame.waitForSelector('.ProseMirror.carma-article-content p', { timeout: 15000 })
  await sleep(250)
  return { page, frame }
}
const html = page => page.evaluate(() => window.__lab.editor.getHTML())
const selLen = page => page.evaluate(() => { const s = window.__lab.editor.state.selection; return s.to - s.from })
const docPos = (page, type) => page.evaluate(t => { let at = -1; window.__lab.editor.state.doc.descendants((n, p) => { if (n.type.name === t && at < 0) at = p }); return at }, type)

try {
  // ── DESKTOP ─────────────────────────────────────────────────────────────────
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await stub(desk)

  head('1. THE PAGE — born inside the blog, in WebKit')
  let { page, frame } = await open(desk)
  const shape = await frame.evaluate(() => {
    const pm = document.querySelector('.ProseMirror')
    return { content: pm.classList.contains('carma-article-content'), article: !!pm.closest('article.carma-article'), owner: pm.ownerDocument === document, kids: [...pm.children].slice(0, 3).map(c => c.tagName).join(',') }
  })
  ok(shape.content && shape.article && shape.owner, 'the ProseMirror root is the blog’s content column, owned by the canvas document')
  ok(shape.kids === 'NAV,P,H2', 'blocks are its direct children', shape.kids)

  head('2. FOCUS, TYPING, SELECTION, UNDO')
  const lastP = frame.locator('.ProseMirror > p').last()
  await lastP.scrollIntoViewIfNeeded()
  const lb = await lastP.boundingBox()
  await page.mouse.click(lb.x + lb.width - 3, lb.y + lb.height / 2)
  await sleep(150)
  const focus = await page.evaluate(() => ({ parent: document.activeElement?.tagName, inner: document.querySelector('iframe').contentDocument.activeElement?.className ?? '', focused: window.__lab.editor.isFocused }))
  ok(focus.parent === 'IFRAME' && /ProseMirror/.test(focus.inner) && focus.focused, 'one click focuses the editor inside the frame', JSON.stringify(focus))
  await page.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift')
  await sleep(150)
  ok(await selLen(page) === 4, 'a keyboard selection made before any edit is seen by the editor', `${await selLen(page)} chars`)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type(' hola webkit')
  await sleep(150)
  ok((await html(page)).includes('hola webkit'), 'typing lands in the document')
  await page.keyboard.press('Control+z'); await sleep(150)
  ok(!(await html(page)).includes('hola webkit'), 'Ctrl+Z undoes it')
  await page.keyboard.press('Control+Shift+z'); await sleep(150)
  ok((await html(page)).includes('hola webkit'), 'Ctrl+Shift+Z redoes it')

  head('3. THE BUBBLE MENU — a portal + floating-ui across the frame')
  ;({ page, frame } = await open(desk))
  const em = frame.locator('.ProseMirror > p em').first()
  await em.scrollIntoViewIfNeeded()
  await em.dblclick()
  await sleep(400)
  const bubble = await frame.evaluate(() => {
    const m = [...document.querySelectorAll('#carma-ui > div')].find(d => getComputedStyle(d).visibility !== 'hidden' && /Negreta/.test(d.innerHTML))
    const w = document.querySelector('.ProseMirror > p em').getBoundingClientRect()
    if (!m) return null
    const r = m.getBoundingClientRect()
    return { menuBottom: Math.round(r.bottom), wordTop: Math.round(w.top), menuLeft: Math.round(r.left), menuRight: Math.round(r.right), wordMid: Math.round(w.left + w.width / 2), bg: getComputedStyle(m).backgroundColor }
  })
  ok(!!bubble, 'a double-click selects the word and shows the bubble menu, in the UI layer')
  ok(bubble && bubble.menuBottom <= bubble.wordTop + 2 && bubble.wordTop - bubble.menuBottom < 60 && bubble.menuLeft < bubble.wordMid && bubble.menuRight > bubble.wordMid,
    'it floats just above the selection, centred over it', bubble ? `menu bottom ${bubble.menuBottom} · word top ${bubble.wordTop}` : '')
  ok(bubble && bubble.bg !== 'rgba(0, 0, 0, 0)', 'it is dressed by the app’s UI classes', bubble?.bg ?? '')
  await frame.locator('#carma-ui button[title^="Negreta"]').first().click()
  await sleep(200)
  ok(/<strong><em>cursiva<\/em><\/strong>|<em><strong>cursiva<\/strong><\/em>/.test(await html(page)), 'its Bold button works — a React click handler inside the frame')

  head('4. THE SLASH MENU')
  ;({ page, frame } = await open(desk))
  await page.evaluate(() => window.__lab.editor.chain().focus('end').insertContent('<p></p>').run())
  await sleep(150)
  await page.keyboard.type('/')
  await sleep(400)
  // The caret through ProseMirror's own coordsAtPos — WebKit reports an empty rect
  // for a collapsed DOM range, and these are the coordinates the menus use anyway.
  const slash = await page.evaluate(() => {
    const doc = document.querySelector('iframe').contentDocument
    const m = [...doc.querySelectorAll('#carma-ui > *')].find(d => d.querySelectorAll('button').length > 8 && getComputedStyle(d).display !== 'none')
    const view = window.__lab.editor.view
    const c = view.coordsAtPos(view.state.selection.from)
    return m ? { items: m.querySelectorAll('button').length, top: Math.round(m.getBoundingClientRect().top), bottom: Math.round(m.getBoundingClientRect().bottom), caretTop: Math.round(c.top), caretBottom: Math.round(c.bottom) } : null
  })
  ok(!!slash && slash.items > 8, 'typing “/” opens the slash menu inside the frame', slash ? `${slash.items} items` : 'none')
  ok(slash && (slash.top >= slash.caretBottom - 2 || slash.bottom <= slash.caretTop + 2) && Math.min(Math.abs(slash.top - slash.caretBottom), Math.abs(slash.caretTop - slash.bottom)) < 40, 'it opens beside the caret', slash ? `menu ${slash.top}–${slash.bottom} · caret ${slash.caretTop}–${slash.caretBottom}` : '')

  head('5. THE HEADER AND THE BLOCKS')
  ;({ page, frame } = await open(desk))
  const h1 = frame.locator('h1.carma-article-title')
  await h1.click()
  await frame.evaluate(() => { const t = document.querySelector('h1.carma-article-title'); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r) })
  await page.keyboard.type(' nou')
  await sleep(150)
  ok((await page.evaluate(() => window.__lab.header.title)).endsWith(' nou'), 'the title (plain-text contentEditable <h1>) takes typing, and the state follows')
  await page.keyboard.press('Enter')
  await sleep(150)
  ok(await page.evaluate(() => window.__lab.editor.isFocused) && !(await page.evaluate(() => window.__lab.header.title)).includes('\n'), 'Enter in the title moves to the body')
  const cta = await docPos(page, 'ctaButton')
  await page.evaluate(p => window.__lab.editor.chain().focus().setTextSelection(p + 1 + 'Reserva'.length).run(), cta)
  await sleep(120)
  await page.keyboard.type(' ara')
  await sleep(150)
  ok(/<a class="carma-button"[^>]*>Reserva ara<\/a>/.test(await html(page)), 'typing at the end of the CTA label stays inside the button')
  const pagesBefore = desk.pages().length
  const link = frame.locator('.ProseMirror > p a[href]').first()
  await link.scrollIntoViewIfNeeded()
  await link.click()
  await sleep(400)
  ok(desk.pages().length === pagesBefore && await page.evaluate(() => !!document.querySelector('iframe').contentDocument.querySelector('.ProseMirror')), 'clicking a link opens no tab and never navigates the canvas away')
  const shield = frame.locator('.ProseMirror .carma-embed > .carma-embed-shield')
  await shield.scrollIntoViewIfNeeded()
  await shield.click()
  await sleep(200)
  ok(await page.evaluate(() => window.__lab.editor.state.selection.node?.type.name === 'embed'), 'clicking a video selects its block')

  // ── iPHONE (WebKit + touch + mobile viewport) ────────────────────────────────
  const phoneDevice = devices['iPhone 15 Pro'] ?? devices['iPhone 14 Pro'] ?? devices['iPhone 13']
  const phone = await browser.newContext({ ...phoneDevice })
  await stub(phone)

  head('6. iPHONE EMULATION IN WEBKIT — tap focus, typing, the header')
  ;({ page, frame } = await open(phone))
  const p2 = frame.locator('.ProseMirror > p').nth(1)
  await p2.scrollIntoViewIfNeeded()
  await p2.tap({ position: { x: 30, y: 8 } })
  await sleep(300)
  const pf = await page.evaluate(() => ({ focused: window.__lab.editor.isFocused, inner: document.querySelector('iframe').contentDocument.activeElement?.className ?? '' }))
  ok(pf.focused && /ProseMirror/.test(pf.inner), 'a tap focuses the editor inside the frame', JSON.stringify(pf))
  await page.keyboard.type('tap ')
  await sleep(150)
  ok((await html(page)).includes('tap '), 'typing after a tap lands in the document')
  const vw = await page.evaluate(() => document.querySelector('iframe').contentWindow.innerWidth)
  ok(vw <= 402, 'the canvas is phone-wide', `${vw}px`)
  await frame.locator('h1.carma-article-title').tap()
  await sleep(250)
  const titleFocus = await frame.evaluate(() => document.activeElement?.classList.contains('carma-article-title'))
  ok(titleFocus, 'a tap on the title focuses the title')
  await page.keyboard.type('!')
  await sleep(150)
  ok((await page.evaluate(() => window.__lab.header.title)).includes('!'), 'and typing reaches it')
  // Programmatic selection (touch selection handles are iOS UI, not emulated), then the bubble by touch.
  await page.evaluate(() => { const ed = window.__lab.editor; let f = -1; ed.state.doc.descendants((n, p) => { if (f < 0 && n.isText && n.text.includes('segon')) f = p + n.text.indexOf('segon') }); ed.chain().focus().setTextSelection({ from: f, to: f + 5 }).run() })
  await sleep(400)
  const boldBtn = frame.locator('#carma-ui button[title^="Negreta"]').first()
  const visible = await boldBtn.isVisible().catch(() => false)
  ok(visible, 'a selection shows the bubble menu on the phone')
  if (visible) { await boldBtn.tap(); await sleep(200) }
  ok(/<strong>segon<\/strong>/.test(await html(page)), 'a TAP on its Bold button applies it (touch events reach the portal in the frame)')

  // KNOWN, and not the canvas's: WebKit has no Presentation API, so the embed's
  // `sandbox="… allow-presentation"` — the PUBLISHED markup (render/blockMarkup.ts),
  // which every Safari reader's console shows today — is reported as an invalid
  // token and ignored. Listed, counted, and left to a product decision.
  const known = errors.filter(e => /'allow-presentation' is an invalid sandbox flag/.test(e))
  const unknown = errors.filter(e => !known.includes(e))
  if (known.length) console.log(`  · known: WebKit rejects the embed's sandbox token 'allow-presentation' (${known.length}×) — published markup, harmless`)
  ok(unknown.length === 0, 'no other page errors or console errors', unknown.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  server.stop()
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed · ${fail} failed`)
if (fail) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1) }
