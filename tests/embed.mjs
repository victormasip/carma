// Verifies the video-embed feature (B9) end to end WITHOUT a browser:
//   1. parseEmbedUrl — recognises the YouTube/Vimeo URL shapes, rejects the rest.
//   2. embedSrc — builds a safe src only from a strictly-validated id.
//   3. The REAL render path (buildArticlePage → fillEmbeds) turns stored
//      placeholders into sandboxed iframes, and NEVER emits one for a tampered
//      id / unknown provider (the security guarantee).
//
// Run: node --experimental-strip-types --import ./tests/register.mjs tests/embed.mjs

import { parse } from 'parse5'
import { buildArticlePage } from '@/lib/render/theme.ts'
import { parseEmbedUrl, embedSrc } from '@/lib/embed.ts'

let pass = 0, fail = 0
const fails = []
function ok(cond, msg) { if (cond) { pass++ } else { fail++; fails.push(msg); console.error('  ✗ ' + msg) } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`) }
function section(n) { console.log('\n— ' + n) }

section('parseEmbedUrl')
eq(parseEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' }, 'youtube watch?v')
eq(parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' }, 'youtu.be short')
eq(parseEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' }, 'youtube /embed')
eq(parseEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' }, 'youtube /shorts')
eq(parseEmbedUrl('https://vimeo.com/76979871'), { provider: 'vimeo', id: '76979871' }, 'vimeo.com/<id>')
eq(parseEmbedUrl('https://player.vimeo.com/video/76979871'), { provider: 'vimeo', id: '76979871' }, 'player.vimeo /video')
ok(parseEmbedUrl('https://example.com/watch?v=nope') === null, 'non-video URL → null')
ok(parseEmbedUrl('') === null, 'empty → null')

section('embedSrc — strict validation')
ok(embedSrc('youtube', 'dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube → nocookie src')
ok(embedSrc('vimeo', '76979871') === 'https://player.vimeo.com/video/76979871', 'vimeo → player src')
ok(embedSrc('youtube', 'short') === null, 'youtube id wrong length → null')
ok(embedSrc('youtube', 'bad chars!!') === null, 'youtube id bad chars → null')
ok(embedSrc('vimeo', 'abc') === null, 'vimeo non-numeric id → null')
ok(embedSrc('evil', 'dQw4w9WgXcQ') === null, 'unknown provider → null')

section('render: fillEmbeds via buildArticlePage')
const theme = {
  extracted_head: '', extracted_header: '<header id="H">h</header>', extracted_footer: '<footer id="F">f</footer>',
  extracted_body_attrs: '', design_tokens: {}, default_locale: 'en',
}
const content = [
  '<p>Intro</p>',
  '<div data-carma-embed data-provider="youtube" data-embed-id="dQw4w9WgXcQ"></div>',
  '<div data-carma-embed data-provider="vimeo" data-embed-id="76979871"></div>',
  '<div data-carma-embed data-provider="youtube" data-embed-id="short"></div>',        // invalid id
  '<div data-carma-embed data-provider="evil" data-embed-id="whatever1234"></div>',     // unknown provider
].join('')
const post = {
  id: 'p1', title: 'T', slug: 't', content: { html: content }, excerpt: '', featured_image: null,
  categories: [], tags: [], author_name: null, created_at: '2026-01-01T00:00:00Z', is_published: true,
  seo_title: null, seo_description: null, meta: {}, i18n: {}, default_locale: 'en',
}
const html = buildArticlePage(theme, 'S', 's1', post, 'en')

ok(typeof html === 'string' && html.length > 0, 'produced output')
ok(html.includes('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'valid youtube → nocookie iframe src')
ok(html.includes('https://player.vimeo.com/video/76979871'), 'valid vimeo → player iframe src')
ok(/<iframe\b[^>]*\bsandbox=/.test(html), 'embed iframe carries a sandbox')
ok(!html.includes('/embed/short'), 'invalid (short) id → no iframe emitted')
const iframeCount = (html.match(/<iframe\b/g) || []).length
ok(iframeCount === 2, `exactly 2 embed iframes — invalid + unknown produced none (got ${iframeCount})`)
let wellFormed = true
try { parse(html) } catch { wellFormed = false }
ok(wellFormed, 'served HTML is well-formed (parse5 accepts it)')
ok(!/<script[^>]*>\s*alert/.test(html), 'no script injection from embeds')

console.log(`\n${fail ? '✗' : '✓'} embed: ${pass} passed, ${fail} failed`)
if (fail) { console.error('\nFailures:\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1) }
