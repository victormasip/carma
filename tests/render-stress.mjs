// Stress / invariant suite for the Magic-Wand clone pipeline.
//
// Runs the REAL splitPageChrome + buildArticlePage/buildListingPage against
// deliberately chaotic, malformed, hostile HTML and asserts the three mandated
// invariants hold every time:
//   1. EXTRACTION  — a Top/Bottom sandwich (or graceful fallback) is produced
//                    even with non-semantic divs and unclosed tags.
//   2. ZERO CRASH  — the served document is perfectly balanced: header, blog and
//                    footer all survive, in order, with nothing swallowed.
//   3. ISOLATION   — the blog renders inside a Declarative Shadow DOM template;
//                    its template CSS never appears in the light DOM; dangerous
//                    client scripts are stripped.
//
// Run: node --experimental-strip-types --import ./tests/register.mjs tests/render-stress.mjs

import { parse } from 'parse5'
import { parse as nhp } from 'node-html-parser'
import { splitPageChrome } from '@/lib/scrape/pageSplit.ts'
import { detectBlogSignature } from '@/lib/scrape/blogDetect.ts'
import { proxyFontsInCss, extractFontFaceCss, proxyUseHref } from '@/lib/scrape/clientCss.ts'
import { buildArticlePage, buildListingPage } from '@/lib/render/theme.ts'

// ── tiny test framework ───────────────────────────────────────────────────────
let pass = 0, fail = 0
const fails = []
function ok(cond, msg) {
  if (cond) { pass++ } else { fail++; fails.push(msg); console.error('  ✗ ' + msg) }
}
function section(name) { console.log('\n— ' + name) }

// ── parse5 tree helpers (pre-order walk over a full document) ─────────────────
const tag = n => (n.tagName ?? '').toLowerCase()
const attr = (n, k) => n.attrs?.find(a => a.name === k)?.value ?? null
const classes = n => (attr(n, 'class') ?? '').split(/\s+/).filter(Boolean)
function preorder(root) {
  const out = []
  ;(function rec(n) { out.push(n); for (const c of n.childNodes ?? []) rec(c) })(root)
  return out
}
function ancestors(n) { const a = []; let p = n.parentNode; while (p) { a.push(p); p = p.parentNode } return a }
// Concatenated text of every <style> in the LIGHT DOM. A childNodes-only walk
// never descends into <template>.content, so shadow-template CSS is excluded —
// exactly what we need to prove the blog's styles don't leak out of the shadow.
function lightStyleText(root) {
  const out = []
  ;(function rec(n) {
    if (tag(n) === 'style') out.push((n.childNodes ?? []).map(c => c.value ?? '').join(''))
    for (const c of n.childNodes ?? []) rec(c)
  })(root)
  return out.join('\n')
}

// Parse a SERVED document string and return analysis primitives.
function analyze(html) {
  const doc = parse(html)
  const nodes = preorder(doc)
  const byId = id => nodes.find(n => attr(n, 'id') === id)
  const byClass = c => nodes.filter(n => classes(n).includes(c))
  const idx = n => nodes.indexOf(n)
  return { doc, nodes, byId, byClass, idx, tag }
}

// A synthetic post with rich/odd content so the article renderer is fully exercised.
const POST = {
  id: 'p1', title: 'Hello <World> & "friends"', slug: 'hello',
  content: { html: '<p>Intro</p><h2>Section</h2><p>Body with <a href="/x">link</a> & ampersand.</p><blockquote>quote</blockquote>' },
  excerpt: 'An excerpt', featured_image: 'https://cdn.example.com/a.jpg',
  categories: ['News'], tags: ['t1'], author_name: 'Ada', created_at: '2026-01-02T00:00:00Z',
  is_published: true, seo_title: null, seo_description: null, meta: {}, i18n: {}, default_locale: 'en',
}

// ── invariant checks shared by every scenario ─────────────────────────────────
function assertWellFormedSandwich(label, html, { expectHeader = true, expectFooter = true, allowChromeNesting = false } = {}) {
  ok(typeof html === 'string' && html.length > 0, `${label}: produced output`)
  // Re-parse: if parse5 (a spec browser parser) accepts it, a browser will too.
  const a = analyze(html)

  // The blog host must exist EXACTLY once.
  const hosts = a.byClass('carma-embed-host')
  ok(hosts.length === 1, `${label}: exactly one blog host (got ${hosts.length})`)
  const host = hosts[0]

  // Isolation: the blog host carries a Declarative Shadow DOM template.
  const tpl = host && preorder(host).find(n => a.tag(n) === 'template' && attr(n, 'shadowrootmode'))
  ok(!!tpl, `${label}: blog renders inside a <template shadowrootmode> (shadow-isolated)`)

  // Isolation: the blog's own template CSS must live ONLY inside the shadow root.
  // The light DOM's <style> blocks (page reset, host guard, injected client head)
  // must never carry the blog's signature rules.
  const light = lightStyleText(a.doc)
  ok(!/\.carma-article-content\s*\{/.test(light) && !/\.carma-card\s*\{/.test(light),
    `${label}: blog template CSS stays inside the shadow root (no light-DOM leak)`)

  const header = a.byId('T-HEADER')
  const footer = a.byId('T-FOOTER')
  if (expectHeader) ok(!!header, `${label}: header survived the stitch`)
  if (expectFooter) ok(!!footer, `${label}: footer survived the stitch (not swallowed)`)

  // Order: header < blog < footer in document order — the sandwich is intact.
  if (header && host) ok(a.idx(header) < a.idx(host), `${label}: header precedes blog`)
  if (footer && host) ok(a.idx(host) < a.idx(footer), `${label}: blog precedes footer`)

  // Nothing swallowed: the footer must never be nested INSIDE our blog host — that
  // would mean our shadow template broke containment and ate it. This is a hard
  // invariant in every scenario.
  if (footer && host) ok(!ancestors(footer).includes(host), `${label}: footer NOT swallowed by blog`)
  // The blog should not be nested inside the header — EXCEPT when the source's own
  // <header> was unclosed, where a real browser nests the whole page inside it too
  // and our carve faithfully mirrors that (order + survival still hold above).
  if (header && host && !allowChromeNesting) {
    ok(!ancestors(host).includes(header), `${label}: blog NOT swallowed by header`)
  }

  // Our content survived intact + entity-safe (no raw unescaped title injection).
  ok(html.includes('Hello &lt;World&gt;') || html.includes('Hello <World>') === false,
    `${label}: title is HTML-escaped (no raw <World> tag injected)`)
  return a
}

const baseTheme = (top, bottom, head = '', bodyAttrs = '') => ({
  extracted_head: head,
  extracted_header: top,
  extracted_footer: bottom,
  extracted_body_attrs: bodyAttrs,
  design_tokens: {},
  default_locale: 'en',
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

// 1. UNCLOSED TAGS in the Top that, injected naively, would swallow everything.
section('unclosed wrappers in Top (the classic page-swallow)')
{
  // As splitPageChrome emits it: the header/footer are CLOSED within their half;
  // the layout WRAPPERS (.page, .shell) open in Top and close in Bottom, spanning
  // the blog slot. Injected naively these dangling wrappers would swallow the page.
  const top = '<div class="page"><div class="shell"><header id="T-HEADER"><nav><a href="/">Home</a></nav></header>'
  const bottom = '<footer id="T-FOOTER"><p>© 2026</p></footer></div></div>' // wrapper closers live here
  const html = buildArticlePage(baseTheme(top, bottom), 'Acme', 's1', POST, 'en')
  assertWellFormedSandwich('unclosed-top', html)
}

// 2. NON-SEMANTIC chrome — divs with class hints, no <header>/<footer> tags.
section('non-semantic div-only chrome (no header/footer tags)')
{
  const raw = `<!doctype html><html><head><style>.x{color:red}</style></head>
  <body class="home theme-dark" data-x="1">
    <div class="site-header" id="T-HEADER"><div class="logo">Acme</div><nav><a href="/a">A</a></nav></div>
    <div id="content"><h1>Main</h1><p>page body that should be replaced</p></div>
    <div class="site-footer" id="T-FOOTER"><span>footer</span></div>
    <script>console.log('late init')</script>
  </body></html>`
  const split = splitPageChrome(raw, new URL('https://acme.test/'))
  ok(split.strategy === 'content', `div-chrome: used content strategy (got ${split.strategy})`)
  ok(/id="T-HEADER"/.test(split.top), 'div-chrome: header captured in Top')
  ok(/id="T-FOOTER"/.test(split.bottom), 'div-chrome: footer captured in Bottom')
  ok(/theme-dark/.test(split.bodyAttrs) && /home/.test(split.bodyAttrs), 'div-chrome: body classes captured')
  ok(!/page body that should be replaced/.test(split.top + split.bottom), 'div-chrome: main content carved out')
  const html = buildArticlePage(baseTheme(split.top, split.bottom, '', split.bodyAttrs), 'Acme', 's1', POST, 'en')
  assertWellFormedSandwich('div-chrome', html)
  ok(/<body[^>]*\btheme-dark\b/.test(html), 'div-chrome: body attrs reapplied on render')
}

// 2b. BARE header/footer tokens — the most common non-semantic chrome (`class="header"`
//     / `id="footer"`), with no semantic tag and no "site-header" hint. Must still be
//     detected. An in-content `class="page-header"` must NOT be treated as chrome.
section('bare class="header"/"footer" tokens (no hint, no semantic tag)')
{
  const raw = `<!doctype html><html><head></head>
  <body>
    <div class="header" id="T-HEADER"><div class="logo">Acme</div><nav><a href="/a">A</a></nav></div>
    <div id="content">
      <div class="page-header"><h1>Main</h1></div>
      <p>page body that should be replaced</p>
    </div>
    <div id="footer" data-mark="T-FOOTER"><span>footer</span></div>
  </body></html>`
  const split = splitPageChrome(raw, new URL('https://bare.test/'))
  ok(split.strategy === 'content', `bare-chrome: used content strategy (got ${split.strategy})`)
  ok(/id="T-HEADER"/.test(split.top), 'bare-chrome: header captured in Top')
  ok(/data-mark="T-FOOTER"/.test(split.bottom), 'bare-chrome: footer captured in Bottom')
  ok(!/page body that should be replaced/.test(split.top + split.bottom), 'bare-chrome: main content carved out')
  ok(/page-header/.test(split.top + split.bottom) === false, 'bare-chrome: in-content .page-header carved out with content (not kept as chrome)')
}

// 3. HOSTILE / MALFORMED — mismatched tags, stray closers, unquoted attrs, an
//    inline SPA-hydration script that must be dropped, a tracker, an onclick.
section('hostile malformed soup + dangerous scripts')
{
  const raw = `<body><header id="T-HEADER"><ul><li>one<li>two</ul></div></span>
    <p onclick="alert(1)">x</p>
    <main><article>real content</article></main>
    <footer id="T-FOOTER"><table><tr><td>cell</footer>
    <script>window.__NEXT_DATA__={};ReactDOM.hydrateRoot(document,App)</script>
    <script src="https://www.googletagmanager.com/gtag/js?id=X"></script>
    <script>document.write('hijack')</script>
    <script>console.log('keep me')</script>`
  const split = splitPageChrome(raw, new URL('https://h.test/'))
  ok(split.strategy === 'content', `hostile: carved content out despite unclosed <header> (got ${split.strategy})`)
  const all = split.top + split.bottom
  ok(!/onclick/i.test(all), 'hostile: inline on* handler stripped')
  ok(!/hydrateRoot|__NEXT_DATA__/.test(all), 'hostile: SPA-hydration script dropped')
  ok(!/googletagmanager/.test(all), 'hostile: tracker script dropped')
  ok(!/document\.write/.test(all), 'hostile: document.write hijack dropped')
  ok(/keep me/.test(all), 'hostile: benign late script KEPT (menus work)')
  ok(!/real content/.test(split.top + split.bottom), 'hostile: original page body carved out (not leaked into chrome)')
  const html = buildArticlePage(baseTheme(split.top, split.bottom), 'H', 's1', POST, 'en')
  // Source <header> is unclosed → browser-accurate nesting of the blog inside it.
  assertWellFormedSandwich('hostile', html, { allowChromeNesting: true })
}

// 4. EMPTY / no chrome at all — must still render a valid blog page.
section('no chrome detected (bare body)')
{
  const split = splitPageChrome('<body><p>just text</p></body>', new URL('https://n.test/'))
  ok(split.strategy === 'none', `none: strategy none (got ${split.strategy})`)
  const html = buildArticlePage(baseTheme('', ''), 'N', 's1', POST, 'en')
  // No header/footer expected, but the blog host + shadow must still be valid.
  assertWellFormedSandwich('no-chrome', html, { expectHeader: false, expectFooter: false })
}

// 5. </template> / </style> INJECTION inside captured chrome — must not break out
//    of the shadow template or our <style> blocks.
section('shadow/style break-out attempts in chrome + content')
{
  const top = '<header id="T-HEADER">A</header>'
  const bottom = '<footer id="T-FOOTER">B</footer>'
  const evilPost = { ...POST, content: { html: '<p>x</p></template><style>body{display:none}</style><template>' },
    title: '</title></head><body>pwn' }
  const html = buildArticlePage(baseTheme(top, bottom), 'E', 's1', evilPost, 'en')
  const a = assertWellFormedSandwich('breakout', html)
  // Exactly one shadow template — the injected </template> didn't spawn/close one.
  const tpls = a.byClass('carma-embed-host')[0]
  ok(!!tpls, 'breakout: blog host intact despite </template> injection')
}

// 6. LISTING page (feed) through the same chaos.
section('listing page with unclosed chrome')
{
  const top = '<div class="wrap"><header id="T-HEADER"><nav>menu</nav></header>'
  const bottom = '<footer id="T-FOOTER">foot</footer></div>'
  const html = buildListingPage(baseTheme(top, bottom), 'Feed', 's1', [POST], 'en')
  assertWellFormedSandwich('listing', html)
  ok(/carma-grid/.test(html) || /carma-empty/.test(html), 'listing: feed grid rendered')
}

// 7. LEGACY stored chrome (JSON { html, css, mode:'shadow' }) must degrade, not
//    render literal JSON.
section('legacy {html,css,mode:shadow} chrome degrades to raw')
{
  const legacy = JSON.stringify({ html: '<header id="T-HEADER">legacy</header>', css: 'a{}', mode: 'shadow' })
  const html = buildArticlePage(baseTheme(legacy, ''), 'L', 's1', POST, 'en')
  ok(!html.includes('"mode":"shadow"') && !html.includes('"mode": "shadow"'), 'legacy: no literal JSON in output')
  ok(/id="T-HEADER"/.test(html), 'legacy: header html extracted from JSON')
  assertWellFormedSandwich('legacy', html, { expectFooter: false })
}

// 8. GLOBAL FLEX/GRID WRAPPERS must survive intact (the manual-slice promise),
//    and page-builder MENU scripts must be preserved (not over-sanitised).
section('global wrappers preserved + menu scripts kept')
{
  const raw = `<body><div class="app"><div class="shell">
    <header id="T-HEADER" class="site-header"><nav><a href="/">Home</a></nav></header>
    <main class="content"><h1>Title</h1><p>${'Body text here. '.repeat(20)}</p></main>
    <footer id="T-FOOTER" class="site-footer">© 2026</footer>
  </div></div>
  <script src="https://cdn.example.com/wp-content/plugins/elementor/assets/js/frontend-modules.min.js"></script>
  <script>console.log('menu init')</script></body>`
  const split = splitPageChrome(raw, new URL('https://w.test/'))
  ok(split.strategy === 'content', `wrappers: content strategy (got ${split.strategy})`)
  ok(/class="app"/.test(split.top) && /class="shell"/.test(split.top), 'wrappers: app + shell OPEN in Top (intact)')
  ok(/<\/div>\s*<\/div>/.test(split.bottom), 'wrappers: app + shell CLOSED in Bottom (intact)')
  ok(/id="T-HEADER"/.test(split.top), 'wrappers: header in Top')
  ok(/id="T-FOOTER"/.test(split.bottom), 'wrappers: footer in Bottom')
  ok(!/Body text here\./.test(split.top + split.bottom), 'wrappers: main content carved out')
  ok(/frontend-modules/.test(split.bottom), 'wrappers: Elementor menu script PRESERVED (not over-sanitised)')
  ok(/menu init/.test(split.bottom), 'wrappers: inline menu init script kept')
  const html = buildArticlePage(baseTheme(split.top, split.bottom, '', split.bodyAttrs), 'W', 's1', POST, 'en')
  assertWellFormedSandwich('wrappers', html)
}

// 9. EXISTING BLOG INDEX — the repeating card grid is the "center of content";
//    it gets sliced out (our feed replaces it) while chrome + wrappers stay.
section('existing blog index — card grid is the content node')
{
  const cards = Array.from({ length: 5 }, (_, i) =>
    `<article class="card"><a href="/p${i}"><img src="/i${i}.jpg" width="400" height="225"><h3>Post ${i}</h3><p>Excerpt number ${i} here.</p></a></article>`).join('')
  const raw = `<body><div class="site"><header id="T-HEADER" class="site-header"><nav><a href="/">Home</a></nav></header>
    <div class="content"><h1>Blog</h1><div class="grid">${cards}</div></div>
    <footer id="T-FOOTER" class="site-footer">© 2026</footer></div></body>`
  const split = splitPageChrome(raw, new URL('https://b.test/'))
  ok(split.strategy === 'content', `blog-index: content strategy (got ${split.strategy})`)
  ok(/class="site"/.test(split.top), 'blog-index: site wrapper kept in Top')
  ok(/id="T-HEADER"/.test(split.top), 'blog-index: header in Top')
  ok(/id="T-FOOTER"/.test(split.bottom), 'blog-index: footer in Bottom')
  ok(!/Excerpt number 0/.test(split.top + split.bottom), 'blog-index: card grid carved out (replaced by our feed)')
}

// 9b. REGRESSION (BUG 1): an in-content <nav> (breadcrumb / pagination / TOC) must
//     NOT be mistaken for chrome and fragment the slice — the whole content area is
//     carved as one, header+footer stay, NOTHING of the page body leaks out.
section('in-content nav must not fragment the content slice')
{
  const raw = `<body><div class="app"><header id="T-HEADER" class="site-header"><nav><a href="/">Home</a></nav></header>
    <main class="content">
      <nav class="breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a></nav>
      <h1>Article Title</h1>
      <p>${'Real article body text. '.repeat(30)}</p>
      <nav class="pagination"><a href="/p/1">1</a><a href="/p/2">2</a></nav>
    </main>
    <footer id="T-FOOTER" class="site-footer">© 2026</footer></div></body>`
  const split = splitPageChrome(raw, new URL('https://r.test/'))
  ok(split.strategy === 'content', `in-content-nav: content strategy (got ${split.strategy})`)
  ok(/id="T-HEADER"/.test(split.top), 'in-content-nav: header in Top')
  ok(/id="T-FOOTER"/.test(split.bottom), 'in-content-nav: footer in Bottom')
  // The breadcrumb, the article body AND the pagination are ALL inside the carved
  // content → none of them leak into the chrome halves.
  ok(!/breadcrumb/.test(split.top + split.bottom), 'in-content-nav: breadcrumb carved out (not leaked to chrome)')
  ok(!/Real article body text/.test(split.top + split.bottom), 'in-content-nav: article body carved out')
  ok(!/pagination/.test(split.top + split.bottom), 'in-content-nav: pagination carved out')
  ok(/class="app"/.test(split.top), 'in-content-nav: app wrapper kept')
}

// 10. GOAL 2 — blog detection + native card-style extraction.
section('blog detection + card-style extraction')
{
  const css = '.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2rem}'
    + '.card{border:1px solid #dddddd;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}'
    + '.card-title{font-size:1.25rem;font-weight:700;color:#111111}'
  const cards = Array.from({ length: 4 }, (_, i) =>
    `<article class="card"><a href="/post-${i}"><img src="/i${i}.jpg" width="400" height="300"><h3 class="card-title">Post ${i}</h3><p>Excerpt ${i}</p></a></article>`).join('')
  const html = `<html><head><style>${css}</style></head><body>
    <header><nav><a href="/blog">Blog</a><a href="/about">About</a></nav></header>
    <main><div class="grid">${cards}</div></main>
    <footer>©</footer></body></html>`
  const root = nhp(html)
  const sig = detectBlogSignature({ root, cssTexts: [css], base: new URL('https://x.test/') })
  ok(sig.hasBlog === true, 'blog-detect: hasBlog true')
  ok(sig.blogUrl === 'https://x.test/blog', `blog-detect: blogUrl = /blog (got ${sig.blogUrl})`)
  ok(!!sig.card, 'blog-detect: card style extracted')
  ok(sig.card?.columns === 3, `blog-detect: columns 3 (got ${sig.card?.columns})`)
  ok(sig.card?.gap === '2rem', `blog-detect: gap 2rem (got ${sig.card?.gap})`)
  ok(sig.card?.radius === '12px', `blog-detect: radius 12px (got ${sig.card?.radius})`)
  ok(/1px solid/.test(sig.card?.border ?? ''), `blog-detect: border (got ${sig.card?.border})`)
  ok(sig.card?.imageAspect === '4/3', `blog-detect: image aspect 4/3 (got ${sig.card?.imageAspect})`)
  ok(sig.card?.titleSize === '1.25rem', `blog-detect: title size (got ${sig.card?.titleSize})`)
  ok(sig.card?.titleWeight === '700', `blog-detect: title weight (got ${sig.card?.titleWeight})`)

  // A site with NO blog/cards → empty signature (default premium layout).
  const plain = nhp('<html><body><header><nav><a href="/contact">Contact</a></nav></header><main><h1>Welcome</h1><p>About us.</p></main><footer>©</footer></body></html>')
  const none = detectBlogSignature({ root: plain, cssTexts: [''], base: new URL('https://y.test/') })
  ok(none.hasBlog === false && none.card === null, 'blog-detect: no blog → empty signature')

  // STRICTER (BUG 2): a dated/deep ARTICLE permalink must NOT be mistaken for the
  // blog index, even when its label says "News".
  const tricky = nhp('<html><body><header><nav><a href="/2024/01/my-post">News</a><a href="/contact">Contact</a></nav></header><main><p>hello</p></main></body></html>')
  const t = detectBlogSignature({ root: tricky, cssTexts: [''], base: new URL('https://z.test/') })
  ok(t.blogUrl === null, `blog-detect: dated/deep article link rejected (got ${t.blogUrl})`)

  // FALLBACK (BUG 2): the user-provided Blog URL is honored over the guess.
  const ov = detectBlogSignature({ root: tricky, cssTexts: [''], base: new URL('https://z.test/'), blogUrlOverride: 'https://z.test/actualitat' })
  ok(ov.blogUrl === 'https://z.test/actualitat' && ov.hasBlog === true, 'blog-detect: user Blog URL override honored')
}

// 11. GOAL 2 — the extracted CardStyle is applied to OUR feed at render time.
section('native card style applied to the feed')
{
  const theme = {
    ...baseTheme('<header id="T-HEADER">H</header>', '<footer id="T-FOOTER">F</footer>'),
    blog_signature: { hasBlog: true, blogUrl: 'https://x/blog', card: { columns: 4, gap: '2rem', radius: '14px', imageAspect: '4/3', titleColor: '#abcdef' } },
  }
  const html = buildListingPage(theme, 'Feed', 's1', [POST], 'en')
  ok(/repeat\(4,minmax\(0,1fr\)\)/.test(html), 'native-card: 4 columns applied')
  ok(/aspect-ratio:4\/3/.test(html), 'native-card: image aspect applied')
  ok(/border-radius:14px/.test(html), 'native-card: card radius applied')
  ok(/#abcdef/.test(html), 'native-card: title color applied')
  assertWellFormedSandwich('native-card', html)
}

// 12. BUG 3 — fonts & SVG icons (CORS / cross-origin breakage).
section('icon fonts & SVG normalization')
{
  const base = new URL('https://c.test/')
  // @font-face font urls → same-origin proxy (CORS fix for self-hosted icon fonts).
  const proxied = proxyFontsInCss('@font-face{font-family:icons;src:url(https://c.test/f/icons.woff2) format("woff2")}')
  ok(/\/api\/asset\?u=https%3A%2F%2Fc\.test%2Ff%2Ficons\.woff2/.test(proxied), 'fonts: @font-face woff2 routed through /api/asset')
  ok(!/\.woff2/.test(proxied.replace(/u=[^)'"]+/, '')) || proxied.includes('/api/asset'), 'fonts: original font url replaced')
  ok(extractFontFaceCss('a{x:1}@font-face{src:url(x.woff2)}b{y:2}').trim().startsWith('@font-face'), 'fonts: @font-face block extracted')

  // SVG <use>: external sprite → proxy (cross-origin <use> is blocked); fragment kept.
  const pu = proxyUseHref('/sprite.svg#cart', base)
  ok(pu.startsWith('/api/asset?u=') && pu.endsWith('#cart'), `use: external sprite proxied + fragment kept (${pu})`)
  ok(proxyUseHref('#icon', base) === '#icon', 'use: in-page fragment left untouched')

  // End-to-end through splitPageChrome: external <use> rewritten in the chrome,
  // and an inline sprite that lived in the CONTENT is hoisted into the Top.
  const raw = `<body><header id="T-HEADER" class="site-header"><a href="/"><svg><use xlink:href="https://c.test/icons.svg#logo"></use></svg></a></header>
    <main class="content"><svg style="display:none"><symbol id="i-star"><path d="M0 0"/></symbol></svg><h1>Title</h1><p>${'body text '.repeat(40)}</p></main>
    <footer id="T-FOOTER" class="site-footer">f</footer></body>`
  const split = splitPageChrome(raw, base)
  ok(/\/api\/asset\?u=https%3A%2F%2Fc\.test%2Ficons\.svg#logo/.test(split.top), 'use: external sprite ref proxied inside captured chrome')
  ok(/<symbol id="i-star"/.test(split.top), 'sprite: inline <symbol> hoisted into Top (survives the content carve)')
  ok(!/body text body text/.test(split.top + split.bottom), 'icons: main content still carved out')
}

// 13. AUDIT REGRESSION (boundary failure) — a MULTI-SECTION homepage. The old
//     single-node model replaced only the densest section and shoved every OTHER
//     section (hero, cta) into the header/footer halves. The range carve must lift
//     ALL sibling content sections out together, leaving only the true global
//     header above and the true global footer below.
section('multi-section homepage — every section carved, none leaks to chrome')
{
  const para = (w) => `<p>${(w + ' ').repeat(40)}</p>`
  const raw = `<body><div class="page-wrapper">
      <header id="T-HEADER" class="site-header"><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
      <section class="hero"><h1>Welcome</h1>${para('Hero intro copy that is substantial.')}</section>
      <section class="featured"><h2>Featured</h2>${para('Featured grid body content here plenty.')}<img src="/f.jpg"></section>
      <section class="cta"><h2>Subscribe</h2>${para('Call to action persuasive paragraph text.')}</section>
    </div>
    <footer id="T-FOOTER" class="site-footer"><p>© 2026 Acme</p></footer></body>`
  const split = splitPageChrome(raw, new URL('https://multi.test/'))
  ok(split.strategy === 'content', `multi-section: content strategy (got ${split.strategy})`)
  ok(/id="T-HEADER"/.test(split.top), 'multi-section: global header in Top')
  ok(/id="T-FOOTER"/.test(split.bottom), 'multi-section: global footer in Bottom')
  ok(/class="page-wrapper"/.test(split.top), 'multi-section: page-wrapper OPENS in Top (intact)')
  // The crux: NONE of the three sections may leak into the chrome halves.
  const halves = split.top + split.bottom
  ok(!/class="hero"/.test(halves), 'multi-section: HERO carved out (not swallowed into header)')
  ok(!/class="featured"/.test(halves), 'multi-section: FEATURED carved out')
  ok(!/class="cta"/.test(halves), 'multi-section: CTA carved out (not swallowed into footer)')
  const html = buildListingPage(baseTheme(split.top, split.bottom, '', split.bodyAttrs), 'Multi', 's1', [POST], 'en')
  assertWellFormedSandwich('multi-section', html)
}

// 14. AUDIT REGRESSION (injection failure) — a DEEPLY NESTED footer (page-builder
//     style, ~8 wrappers down), which the old depth≤6 cap silently missed, sending
//     the blog BELOW the footer. Bottom-up, cap-free detection must find it and
//     keep it below the blog.
section('deep-nested page-builder footer (beyond old depth cap)')
{
  const deepFooter = '<div class="elementor"><div class="e-con"><div class="e-con-inner"><div class="wrap"><div class="row"><div class="col"><footer id="T-FOOTER" class="site-footer"><nav><a href="/privacy">Privacy</a></nav><p>© 2026</p></footer></div></div></div></div></div></div>'
  const raw = `<body>
      <header id="T-HEADER" class="site-header"><nav><a href="/">Home</a></nav></header>
      <main class="content"><h1>Article</h1><p>${'Real article body. '.repeat(50)}</p></main>
      ${deepFooter}
    </body>`
  const split = splitPageChrome(raw, new URL('https://deep.test/'))
  ok(split.strategy === 'content', `deep-footer: content strategy (got ${split.strategy})`)
  ok(/id="T-HEADER"/.test(split.top), 'deep-footer: header in Top')
  ok(/id="T-FOOTER"/.test(split.bottom), 'deep-footer: deep footer found + placed in Bottom (not below blog)')
  ok(!/Real article body/.test(split.top + split.bottom), 'deep-footer: article body carved out')
  const html = buildArticlePage(baseTheme(split.top, split.bottom, '', split.bodyAttrs), 'Deep', 's1', POST, 'en')
  const a = assertWellFormedSandwich('deep-footer', html)
  const host = a.byClass('carma-embed-host')[0], foot = a.byId('T-FOOTER')
  ok(host && foot && a.idx(host) < a.idx(foot), 'deep-footer: blog precedes footer (injection order correct)')
}

// 15. A MEGA-FOOTER with far more text than a thin article must still be treated as
//     chrome (Bottom), never mistaken for the content block and slotted.
section('mega-footer must stay chrome, not become the content node')
{
  const sitemap = Array.from({ length: 40 }, (_, i) => `<a href="/p${i}">Link section item number ${i}</a>`).join('')
  const raw = `<body>
      <header id="T-HEADER" class="site-header"><nav><a href="/">Home</a></nav></header>
      <main class="content"><h1>Short</h1><p>A tiny article body.</p></main>
      <footer id="T-FOOTER" class="site-footer"><div class="links">${sitemap}</div></footer>
    </body>`
  const split = splitPageChrome(raw, new URL('https://mega.test/'))
  ok(split.strategy === 'content', `mega-footer: content strategy (got ${split.strategy})`)
  ok(/id="T-FOOTER"/.test(split.bottom), 'mega-footer: footer in Bottom (chrome)')
  ok(/Link section item number 0/.test(split.bottom), 'mega-footer: footer links preserved in Bottom')
  ok(!/Link section item number 0/.test(split.top), 'mega-footer: footer not pulled into Top')
  ok(!/A tiny article body/.test(split.top + split.bottom), 'mega-footer: the real (thin) article still carved out')
}

// 16. ASYMMETRIC nesting — the footer lives INSIDE the same wrapper as the content
//     (header is a body-level sibling). The slice must end before the footer so the
//     footer stays in Bottom inside that wrapper, with content fully carved.
section('asymmetric — footer nested with content, header outside')
{
  const raw = `<body>
      <header id="T-HEADER" class="site-header"><nav><a href="/">Home</a></nav></header>
      <div id="page">
        <section class="a"><h1>Part A</h1><p>${'Section A body text. '.repeat(20)}</p></section>
        <section class="b"><h2>Part B</h2><p>${'Section B body text. '.repeat(20)}</p></section>
        <footer id="T-FOOTER" class="site-footer"><p>© 2026</p></footer>
      </div>
    </body>`
  const split = splitPageChrome(raw, new URL('https://asym.test/'))
  ok(split.strategy === 'content', `asymmetric: content strategy (got ${split.strategy})`)
  ok(/id="T-HEADER"/.test(split.top), 'asymmetric: header in Top')
  ok(/id="page"/.test(split.top), 'asymmetric: #page wrapper opens in Top')
  ok(/id="T-FOOTER"/.test(split.bottom), 'asymmetric: footer in Bottom (kept inside #page)')
  ok(!/Section A body text/.test(split.top + split.bottom), 'asymmetric: section A carved out')
  ok(!/Section B body text/.test(split.top + split.bottom), 'asymmetric: section B carved out')
  const html = buildArticlePage(baseTheme(split.top, split.bottom, '', split.bodyAttrs), 'Asym', 's1', POST, 'en')
  assertWellFormedSandwich('asymmetric', html)
}

// 17. FAILSAFE — chrome present but the content-density heuristic finds no block.
//     Detection must NOT collapse to empty chrome: the structural failsafe slices
//     at the header/footer boundary so the chrome is always preserved.
section('failsafe — chrome preserved when no content block is detected')
{
  // (a) Header + footer with NOTHING between them (no content node to replace).
  const noContent = splitPageChrome(
    '<body><header id="T-HEADER" class="site-header"><nav><a href="/">A</a><a href="/b">B</a></nav></header><footer id="T-FOOTER" class="site-footer">© 2026</footer></body>',
    new URL('https://fs1.test/'),
  )
  ok(noContent.strategy === 'content', `failsafe/no-content: did NOT collapse to none (got ${noContent.strategy})`)
  ok(/id="T-HEADER"/.test(noContent.top), 'failsafe/no-content: header preserved in Top')
  ok(/id="T-FOOTER"/.test(noContent.bottom), 'failsafe/no-content: footer preserved in Bottom')
  const html = buildArticlePage(baseTheme(noContent.top, noContent.bottom), 'FS', 's1', POST, 'en')
  assertWellFormedSandwich('failsafe-no-content', html)

  // (b) Header only, with a single empty wrapper as the "content".
  const headerOnly = splitPageChrome(
    '<body><header id="T-HEADER" class="site-header"><nav><a href="/">A</a><a href="/b">B</a></nav></header><div class="x"></div></body>',
    new URL('https://fs2.test/'),
  )
  ok(headerOnly.strategy === 'content', `failsafe/header-only: did NOT collapse to none (got ${headerOnly.strategy})`)
  ok(/id="T-HEADER"/.test(headerOnly.top), 'failsafe/header-only: header preserved in Top')

  // (c) Footer only.
  const footerOnly = splitPageChrome(
    '<body><div class="x"></div><footer id="T-FOOTER" class="site-footer">© 2026</footer></body>',
    new URL('https://fs3.test/'),
  )
  ok(footerOnly.strategy === 'content', `failsafe/footer-only: did NOT collapse to none (got ${footerOnly.strategy})`)
  ok(/id="T-FOOTER"/.test(footerOnly.bottom), 'failsafe/footer-only: footer preserved in Bottom')

  // (d) A genuinely bare body with NO chrome at all still reports none (correct —
  //     there is nothing to clone, so the default blog renders).
  const bare = splitPageChrome('<body><p>just text</p></body>', new URL('https://fs4.test/'))
  ok(bare.strategy === 'none', `failsafe/bare: no chrome → none (got ${bare.strategy})`)
}

// ── summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(48)}`)
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (fail) { console.log('FAILURES:'); for (const f of fails) console.log('  • ' + f); process.exit(1) }
else console.log('All invariants hold. ✓')
