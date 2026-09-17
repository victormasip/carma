// Structural inspector for cached eval snapshots: prints the <body> tree (top
// levels), per-node density scores, and candidate footer/header signals.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'parse5'

const id = process.argv[2]
const html = readFileSync(path.join(process.cwd(), '.grabber-cache/html', `${id}.html`), 'utf8')

const isEl = (n) => typeof n.tagName === 'string'
const tag = (n) => (n.tagName ?? '').toLowerCase()
const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value ?? null

function textLen(n) {
  let t = 0
  const walk = (x) => {
    if (x.nodeName === '#text' && typeof x.value === 'string') t += x.value.trim().length
    for (const c of x.childNodes ?? []) walk(c)
  }
  walk(n)
  return t
}
function linkTextLen(n) {
  let t = 0
  const walk = (x, inA) => {
    const a = inA || (isEl(x) && tag(x) === 'a')
    if (x.nodeName === '#text' && typeof x.value === 'string' && a) t += x.value.trim().length
    for (const c of x.childNodes ?? []) walk(c, a)
  }
  walk(n, false)
  return t
}
const sig = (n) => {
  const id = attr(n, 'id'); const cls = (attr(n, 'class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3)
  return `${tag(n)}${id ? '#' + id : ''}${cls.length ? '.' + cls.join('.') : ''}`
}

function findBody(n) {
  if (isEl(n) && tag(n) === 'body') return n
  for (const c of n.childNodes ?? []) { const b = findBody(c); if (b) return b }
  return null
}
const body = findBody(parse(html))

function tree(n, depth, maxDepth) {
  if (depth > maxDepth) return
  for (const c of n.childNodes ?? []) {
    if (!isEl(c)) continue
    const t = textLen(c), lt = linkTextLen(c)
    if (t < 20 && tag(c) === 'script') continue
    console.log(`${'  '.repeat(depth)}${sig(c)}  text=${t} linkText=${lt} ld=${t ? (lt / t).toFixed(2) : '-'}`)
    tree(c, depth + 1, maxDepth)
  }
}
console.log(`── ${id} · body text=${textLen(body)}`)
tree(body, 0, 3)

// candidate footers: anything whose class/id CONTAINS footer/peu/pie/colophon
console.log('\ncandidate footer-ish nodes:')
const cands = []
const walkAll = (n) => { if (isEl(n)) cands.push(n); for (const c of n.childNodes ?? []) walkAll(c) }
walkAll(body)
for (const n of cands) {
  const hay = `${attr(n, 'id') ?? ''} ${attr(n, 'class') ?? ''}`.toLowerCase()
  if (/footer|colophon|peu|rodape|pie(?:$|[^a-z])/.test(hay) || tag(n) === 'footer') {
    console.log(' ', sig(n), 'text=', textLen(n))
  }
}
// copyright
const idx = html.search(/©|&copy;|copyright/i)
console.log('\ncopyright at byte:', idx, idx >= 0 ? JSON.stringify(html.slice(idx - 80, idx + 120).replace(/\s+/g, ' ')) : '')
