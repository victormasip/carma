// One-case engine debug: run the REAL splitPageChrome over a cached snapshot and
// print the meta + halves. `node --experimental-strip-types --import ./tests/register.mjs tests/grabber-debug.mjs <case-id>`
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { EVAL_DATASET } from '@/lib/grabber-lab/evalDataset'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { visibleTextLength } from '@/lib/grabber-lab/evalRun'

const id = process.argv[2]
const c = EVAL_DATASET.find((x) => x.id === id)
if (!c) { console.error('unknown case', id); process.exit(1) }
const html = readFileSync(path.join(process.cwd(), '.grabber-cache/html', `${id}.html`), 'utf8')
const split = splitPageChrome(html, new URL(c.url))
const total = visibleTextLength(html)
const top = visibleTextLength(split.top), bottom = visibleTextLength(split.bottom)
console.log({ id, strategy: split.strategy, meta: split.meta, topChars: split.top.length, bottomChars: split.bottom.length, textRatio: total ? ((top + bottom) / total).toFixed(3) : '-' })
console.log('\nTOP tail:', JSON.stringify(split.top.slice(-400)))
console.log('\nBOTTOM head:', JSON.stringify(split.bottom.slice(0, 400)))
