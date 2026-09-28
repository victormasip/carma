// W7.0 — THE IFRAME SPIKE: can TipTap/ProseMirror live inside the canvas iframe?
//
//   CARMA_LAB=1 npx next start -p 3107   (after a fresh build), then:
//   npm run test:canvas
//
// Drives the REAL editor on /lab/canvas in Chrome through every interaction the
// plan named as a risk — typing, undo/redo, selection sync from the first click,
// the bubble and floating menus (React portals + floating-ui across the frame),
// the slash menu, a React node view's controls, the block handle, focus, shortcut
// forwarding, paste, IME composition, a caret inside a ligature — and again under
// iPhone emulation with touch. Every section starts from a FRESH page, so a
// failure belongs to the section that reports it.
//
// Chrome only: this machine has no WebKit or Firefox, so Safari's own behaviour is
// NOT covered (iPhone emulation is Chrome with a touch screen and a phone
// viewport, not WebKit).

import path from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const BASE = process.env.LAB_URL || 'http://localhost:3107'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PPTR = [
  path.join(process.cwd(), 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js'),
  path.join(process.env.USERPROFILE ?? '', '.claude/plugins/cache/claude-plugins-official/chrome-devtools-mcp/1.9.0/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'),
].find(existsSync)
if (!PPTR) { console.log('SKIP  no puppeteer-core found (install the chrome-devtools-mcp plugin)'); process.exit(0) }
const mod = await import(pathToFileURL(PPTR).href)
const puppeteer = mod.default ?? mod

let pass = 0, fail = 0
const fails = []
const ok = (cond, msg, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${msg}${detail ? `  (${detail})` : ''}`) }
  else { fail++; fails.push(msg); console.log(`  ✗ ${msg}${detail ? `\n      ${detail}` : ''}`) }
}
const head = t => console.log(`\n── ${t}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const errors = []
/** A fresh lab page; `page` is reused, the document is new. */
async function fresh(page, query = 'preset=noir') {
  await page.goto(`${BASE}/lab/canvas?${query}`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => window.__lab?.ready === true, { timeout: 45000 })
  const frame = await (await page.$('iframe')).contentFrame()
  await frame.waitForSelector('.ProseMirror.carma-article-content p', { timeout: 15000 })
  await sleep(150)
  return frame
}
const html = page => page.evaluate(() => window.__lab.editor.getHTML())
/** An element in the frame, scrolled into the viewport (the page scrolls; the frame never does). */
async function el(frame, sel, pick) {
  const h = pick ? (await frame.evaluateHandle(pick)).asElement() : await frame.$(sel)
  if (!h) return null
  await h.evaluate(n => n.scrollIntoView({ block: 'center' }))
  await sleep(60)
  return h
}
const visibleUi = (frame, re) => frame.evaluate(src => {
  const rx = new RegExp(src)
  const m = [...document.querySelectorAll('#carma-ui > div')].find(d => getComputedStyle(d).visibility !== 'hidden' && rx.test(d.innerHTML))
  if (!m) return null
  const r = m.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height, bg: getComputedStyle(m).backgroundColor, radius: getComputedStyle(m).borderRadius }
}, re.source)
const key = async (page, combo) => {
  const parts = combo.split('+'), last = parts.pop()
  for (const k of parts) await page.keyboard.down(k)
  await page.keyboard.press(last)
  for (const k of parts.reverse()) await page.keyboard.up(k)
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })

  head('1. THE PAGE — the editor is born inside the blog')
  let frame = await fresh(page)
  const shape = await frame.evaluate(() => {
    const pm = document.querySelector('.ProseMirror')
    return {
      isContent: pm.classList.contains('carma-article-content'),
      inArticle: !!pm.closest('main.carma-root article.carma-article'),
      uiOutside: !!document.querySelector('#carma-ui') && !document.querySelector('#carma-ui').closest('.carma-root'),
      kids: [...pm.children].slice(0, 3).map(c => c.tagName).join(','),
      bg: getComputedStyle(document.body).backgroundColor,
    }
  })
  ok(shape.isContent && shape.inArticle, 'the ProseMirror root IS .carma-article-content, inside the article page skeleton')
  ok(shape.kids.startsWith('P,H2'), 'blocks are its direct children, as `.carma-article-content > *` expects', shape.kids)
  ok(shape.uiOutside, 'the UI layer (#carma-ui) lives outside .carma-root — no blog rule reaches it')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await sleep(150)
  const bgDark = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok(bgDark === shape.bg, 'app dark mode does not repaint the canvas — the ground is the blog’s', `${shape.bg} → ${bgDark}`)
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))

  head('2. TYPING, SELECTION, UNDO — through the frame boundary')
  frame = await fresh(page)
  const lastP = await el(frame, null, () => [...document.querySelectorAll('.ProseMirror > p')].at(-1))
  const lb = await lastP.boundingBox()
  await lastP.click({ offset: { x: lb.width - 3, y: lb.height / 2 } })
  await sleep(100)
  const focus = await page.evaluate(() => ({ parent: document.activeElement?.tagName, frame: document.querySelector('iframe').contentDocument.activeElement?.className ?? '', focused: window.__lab.editor.isFocused }))
  ok(focus.parent === 'IFRAME' && /ProseMirror/.test(focus.frame) && focus.focused, 'one click focuses the editor inside the frame')
  // Selection sync BEFORE any transaction — the ownerDocument trap: the view must
  // observe the frame's selectionchange from birth.
  await page.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift')
  await sleep(80)
  const sel = await page.evaluate(() => { const s = window.__lab.editor.state.selection; return s.to - s.from })
  ok(sel === 4, 'a keyboard selection made before any edit is seen by the editor', `${sel} chars`)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type(' hola canvas')
  await sleep(120)
  ok((await html(page)).includes('hola canvas'), 'typing lands in the document')
  await key(page, 'Control+KeyZ'); await sleep(120)
  ok(!(await html(page)).includes('hola canvas'), 'Ctrl+Z undoes it')
  await key(page, 'Control+Shift+KeyZ'); await sleep(120)
  ok((await html(page)).includes('hola canvas'), 'Ctrl+Shift+Z redoes it')
  const em = await el(frame, '.ProseMirror > p em')
  const eb = await em.boundingBox()
  await page.mouse.move(eb.x + 1, eb.y + eb.height / 2); await page.mouse.down()
  await page.mouse.move(eb.x + eb.width - 1, eb.y + eb.height / 2, { steps: 5 }); await page.mouse.up()
  await sleep(150)
  ok(await page.evaluate(() => window.__lab.editor.state.doc.textBetween(window.__lab.editor.state.selection.from, window.__lab.editor.state.selection.to)) === 'cursiva', 'a mouse drag selects exactly the word dragged over')

  head('3. THE BUBBLE MENU — a React portal + floating-ui across the frame')
  frame = await fresh(page)
  const em3 = await el(frame, '.ProseMirror > p em')
  await em3.click({ count: 2 })
  await sleep(350)
  const eb3 = await em3.boundingBox()
  const bubble = await visibleUi(frame, /Negreta/)
  const off = await page.evaluate(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { x: r.left, y: r.top } })
  ok(!!bubble, 'a double-click selects the word and shows the bubble menu, in the UI layer')
  ok(bubble && bubble.y + off.y + bubble.h <= eb3.y + 2 && eb3.y - (bubble.y + off.y + bubble.h) < 60, 'it floats just above the selection', bubble ? `menu bottom ${Math.round(bubble.y + off.y + bubble.h)} · word top ${Math.round(eb3.y)}` : '')
  ok(bubble && bubble.bg !== 'rgba(0, 0, 0, 0)' && bubble.radius !== '0px', 'it is dressed by the app’s UI classes (the scoped copy)', bubble ? `${bubble.bg} · radius ${bubble.radius}` : '')
  if (bubble) await (await frame.$('#carma-ui button[title^="Negreta"]')).click()
  await sleep(150)
  ok(/<strong><em>cursiva<\/em><\/strong>|<em><strong>cursiva<\/strong><\/em>/.test(await html(page)), 'its Bold button works — a React click handler inside the frame')

  head('4. THE FLOATING MENU AND THE SLASH MENU')
  frame = await fresh(page)
  const p2 = await el(frame, '.ProseMirror > p:nth-of-type(2)')
  await p2.click()
  await sleep(150)
  await key(page, 'Control+End')
  await sleep(80)
  await page.keyboard.press('Enter')
  await sleep(350)
  const floating = await visibleUi(frame, /Inserir/)
  ok(!!floating, 'an empty line shows the floating insert menu')
  const titol = await frame.evaluateHandle(() => [...document.querySelectorAll('#carma-ui button')].find(b => /^\s*Títol\s*$/.test(b.textContent ?? '')))
  if (titol.asElement()) await titol.asElement().click()
  await sleep(150)
  await page.keyboard.type('Nou títol')
  await sleep(100)
  ok(/<h2[^>]*>Nou títol<\/h2>/.test(await html(page)), 'its “Títol” item turns the line into a heading')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await sleep(350)
  const slash = await frame.evaluate(() => {
    const e = [...document.querySelectorAll('#carma-ui > div')].find(d => d.style.position === 'fixed' && d.style.visibility === 'visible')
    if (!e) return null
    const r = e.getBoundingClientRect(), c = window.getSelection().getRangeAt(0).getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, caretTop: c.top, caretBottom: c.bottom, caretLeft: c.left, items: e.querySelectorAll('button').length, frameH: document.documentElement.clientHeight }
  })
  ok(!!slash && slash.items > 3, 'typing “/” opens the slash menu inside the frame', slash ? `${slash.items} items` : 'none')
  // Below the caret — or above it where the frame ends (nothing renders past the
  // frame's edge, so floating-ui flips); always beside the caret and inside the frame.
  const below = slash && slash.top >= slash.caretBottom - 2 && slash.top - slash.caretBottom < 40
  const above = slash && slash.bottom <= slash.caretTop + 2 && slash.caretTop - slash.bottom < 40
  ok(slash && (below || above) && Math.abs(slash.left - slash.caretLeft) < 40 && slash.top >= 0 && slash.bottom <= slash.frameH, 'it opens beside the caret, inside the frame', slash ? `${below ? 'below' : above ? 'above' : 'detached'}: menu ${Math.round(slash.top)}–${Math.round(slash.bottom)} · caret ${Math.round(slash.caretTop)}–${Math.round(slash.caretBottom)}` : '')
  await page.keyboard.type('cita')
  await sleep(200)
  await page.keyboard.press('Enter')
  await sleep(200)
  ok(((await html(page)).match(/<blockquote>/g) ?? []).length === 2, 'filtering and Enter insert the block (a second quote)')

  head('5. A REACT NODE VIEW — the CTA block’s controls')
  frame = await fresh(page)
  const ctaPos = await page.evaluate(() => { let at = -1; window.__lab.editor.state.doc.descendants((n, p) => { if (n.type.name === 'ctaButton' && at < 0) at = p }); return at })
  await page.evaluate(p => window.__lab.editor.chain().focus().setNodeSelection(p).run(), ctaPos)
  await sleep(300)
  const center = await el(frame, '.carma-cta-controls button[title="center"]')
  ok(!!center, 'selecting the CTA shows its React controls, inside the frame')
  if (center) await center.click()
  await sleep(200)
  ok(/data-align="center"/.test(await html(page)), 'its “center” button updates the node — React events reach node views in the frame')

  head('6. THE BLOCK HANDLE')
  frame = await fresh(page)
  const h2 = await el(frame, '.ProseMirror > h2')
  const hb = await h2.boundingBox()
  await page.mouse.move(hb.x + 20, hb.y + hb.height / 2)
  await sleep(200)
  const grip = await frame.$('#carma-ui button[aria-label="Accions del bloc"]')
  const gb = grip && await grip.boundingBox()
  ok(!!gb, 'hovering a block shows its handle, from the UI layer')
  ok(gb && Math.abs(gb.y + gb.height / 2 - (hb.y + hb.height / 2)) < 30 && gb.x < hb.x, 'beside that block, in the left gutter', gb ? `grip y ${Math.round(gb.y + gb.height / 2)} · block y ${Math.round(hb.y + hb.height / 2)}` : '')
  const h2Before = ((await html(page)).match(/<h2/g) ?? []).length
  if (gb) {
    // Travel to the grip the way a hand does — left along the block's row.
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2, { steps: 8 })
    await sleep(120)
    const still = await frame.$('#carma-ui button[aria-label="Accions del bloc"]')
    ok(!!still, 'the handle survives the pointer travelling onto it')
    if (still) {
      await still.click()
      await sleep(150)
      const dup = (await frame.evaluateHandle(() => [...document.querySelectorAll('#carma-ui [role="menuitem"]')].find(x => /Duplicar/.test(x.textContent ?? '')))).asElement()
      if (dup) await dup.click()
      await sleep(150)
    }
  }
  ok(((await html(page)).match(/<h2/g) ?? []).length === h2Before + 1, 'its menu’s “Duplicar” duplicates the block')

  head('7. FOCUS, SHORTCUTS, PASTE, IME, LIGATURES')
  frame = await fresh(page)
  await (await el(frame, '.ProseMirror > p:nth-of-type(2)')).click()
  await page.mouse.click(8, 8) // outside the frame
  await sleep(80)
  const blurred = await page.evaluate(() => !window.__lab.editor.isFocused)
  await page.evaluate(() => window.__lab.editor.commands.focus('end'))
  await sleep(120)
  const refocus = await page.evaluate(() => ({ focused: window.__lab.editor.isFocused, parent: document.activeElement?.tagName }))
  ok(blurred && refocus.focused && refocus.parent === 'IFRAME', 'clicking away blurs it; a focus from the parent puts the caret back in the frame')
  await key(page, 'Control+KeyK'); await key(page, 'Control+KeyS'); await sleep(80)
  const shortcuts = await page.evaluate(() => window.__lab.shortcuts)
  ok(shortcuts.includes('ctrl+k') && shortcuts.includes('ctrl+s'), 'Ctrl+K and Ctrl+S pressed inside the frame reach the page’s shortcut listener')
  const notDefault = await frame.evaluate(() => {
    const pm = document.querySelector('.ProseMirror')
    const dt = new DataTransfer()
    dt.setData('text/html', '<meta name="Generator" content="Microsoft Word 15"><p class="MsoNormal"><span style="font-family:Calibri;color:#1F1F1F">Text enganxat de Word</span></p>')
    dt.setData('text/plain', 'Text enganxat de Word')
    return pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await sleep(150)
  const pasted = await html(page)
  ok(notDefault === false && pasted.includes('Text enganxat de Word') && !/Calibri/.test(pasted), 'a Word paste lands, stripped of its inline fonts (the sanitiser runs in the frame)')
  const cdp = await page.createCDPSession()
  await page.evaluate(() => window.__lab.editor.commands.focus('end'))
  await sleep(120)
  await cdp.send('Input.imeSetComposition', { text: 'ka', selectionStart: 2, selectionEnd: 2 })
  await sleep(60)
  await cdp.send('Input.insertText', { text: 'か' })
  await sleep(150)
  const ime = await html(page)
  ok(ime.includes('か') && !/kaか/.test(ime), 'IME composition commits once, without its preedit text')
  const office = await page.evaluate(() => { let at = -1; window.__lab.editor.state.doc.descendants((n, p) => { if (n.isText && at < 0 && n.text.includes('office')) at = p + n.text.indexOf('office') }); return at })
  await page.evaluate(p => window.__lab.editor.chain().focus().setTextSelection(p + 2).run(), office) // of|fice
  await sleep(120)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('X')
  await sleep(100)
  ok((await html(page)).includes('offXice'), 'the caret steps through a ligature one letter at a time (ligatures stay ON)')

  head('8. THE FRAME ITSELF')
  frame = await fresh(page)
  const fit = await page.evaluate(() => { const f = document.querySelector('iframe'); return { frame: Math.round(f.getBoundingClientRect().height), doc: f.contentDocument.documentElement.scrollHeight, scroll: f.contentWindow.scrollY } })
  ok(Math.abs(fit.frame - fit.doc) <= 2 && fit.scroll === 0, 'the frame grows with its content — the page scrolls, never the frame', `${fit.frame}px`)
  await page.click('[data-lab-width="phone"]')
  await sleep(500)
  const phone = await page.evaluate(() => document.querySelector('iframe').contentWindow.innerWidth)
  ok(phone === 390, 'the phone toggle gives the blog a 390px viewport of its own', `${phone}px`)

  head('9. iPHONE EMULATION — touch focus and typing (Chrome, not WebKit)')
  const phonePage = await browser.newPage()
  await phonePage.emulate((mod.KnownDevices ?? puppeteer.KnownDevices)['iPhone 17 Pro'])
  phonePage.on('pageerror', e => errors.push(String(e).slice(0, 200)))
  const pf = await fresh(phonePage)
  const tap = await el(pf, '.ProseMirror > p:nth-of-type(2)')
  const tb = await tap.boundingBox()
  await phonePage.touchscreen.tap(tb.x + 30, tb.y + 8)
  await sleep(250)
  const pFocus = await phonePage.evaluate(() => ({ focused: window.__lab.editor.isFocused, frame: document.querySelector('iframe').contentDocument.activeElement?.className ?? '' }))
  ok(pFocus.focused && /ProseMirror/.test(pFocus.frame), 'a tap focuses the editor inside the frame')
  await phonePage.keyboard.type('tap ')
  await sleep(120)
  ok((await phonePage.evaluate(() => window.__lab.editor.getHTML())).includes('tap '), 'typing after a tap lands in the document')
  const vw = await phonePage.evaluate(() => document.querySelector('iframe').contentWindow.innerWidth)
  ok(vw <= 402, 'on a phone the canvas is phone-wide', `${vw}px`)

  ok(errors.length === 0, 'no page errors or console errors in any section', errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed · ${fail} failed`)
if (fail) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1) }
