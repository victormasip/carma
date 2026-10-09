// Side by side: two measurement runs (tests/measure/results/<label>.json).
//
//   node tests/measure/compare.mjs baseline after [--md]
//
// Medians only, as run.mjs stored them. `--md` prints Markdown tables (for a
// report); the default is a terminal table. Δ is after − before; for every
// column here lower is better, except the Lighthouse score.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RESULTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results')
const [a = 'baseline', b = 'after'] = process.argv.slice(2).filter(x => !x.startsWith('--'))
const MD = process.argv.includes('--md')
const load = (label) => JSON.parse(readFileSync(path.join(RESULTS, `${label}.json`), 'utf8'))
const A = load(a), B = load(b)

const n = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d))
const pct = (x, y) => (x && y !== null && y !== undefined ? `${y >= x ? '+' : '−'}${Math.abs(Math.round(((y - x) / x) * 100))}%` : '')
const cell = (x, y, d = 0) => `${n(x, d)} → ${n(y, d)} ${pct(x, y)}`.trim()

function table(title, head, rows) {
  if (MD) {
    console.log(`\n**${title}**\n`)
    console.log(`| ${head.join(' | ')} |`)
    console.log(`|${head.map(() => '---').join('|')}|`)
    for (const r of rows) console.log(`| ${r.join(' | ')} |`)
    return
  }
  console.log(`\n${title}`)
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)))
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ')
  console.log(line(head))
  for (const r of rows) console.log(line(r))
}

const byId = (xs) => new Map((xs ?? []).map(x => [x.id, x]))

const dA = byId(A.dashboard), dB = byId(B.dashboard)
table(`DASHBOARD (Playwright, desktop 1440×900, median of ${B.dashboard?.[0]?.runs ?? '?'} cold runs) — ${a} → ${b}`,
  ['page', 'TTFB ms', 'FCP ms', 'content ready ms', 'LCP ms', 'doc KB', 'DB calls', 'auth calls'],
  [...dB.keys()].map(id => {
    const x = dA.get(id) ?? {}, y = dB.get(id)
    return [id, cell(x.ttfb, y.ttfb), cell(x.fcp, y.fcp), cell(x.content, y.content), cell(x.lcp, y.lcp), cell(x.docKB, y.docKB, 1), cell(x.apiCalls, y.apiCalls), cell(x.authCalls, y.authCalls)]
  }))

const lA = byId(A.lighthouse), lB = byId(B.lighthouse)
table(`LIGHTHOUSE 13 (median of ${B.lighthouse?.[0]?.runs ?? '?'}) — ${a} → ${b}`,
  ['page', 'form', 'score', 'FCP ms', 'LCP ms', 'TBT ms', 'CLS', 'image KB', 'total KB'],
  [...lB.keys()].map(id => {
    const x = lA.get(id) ?? {}, y = lB.get(id)
    return [id, y.form, `${n(x.score)} → ${n(y.score)}`, cell(x.fcp, y.fcp), cell(x.lcp, y.lcp), cell(x.tbt, y.tbt), `${n(x.cls, 3)} → ${n(y.cls, 3)}`, cell(x.imageKB, y.imageKB), cell(x.bytesKB, y.bytesKB)]
  }))

table(`IMAGE AUDITS (score, 1 = pass) — ${a} → ${b}`,
  ['page', 'lcp-discovery', 'image-delivery', 'unsized', 'LCP element (after)'],
  [...lB.keys()].map(id => {
    const x = lA.get(id)?.images ?? {}, y = lB.get(id)?.images ?? {}
    const s = (o, k) => (o[k]?.score === null || o[k]?.score === undefined ? '—' : String(o[k].score))
    return [id, `${s(x, 'lcp-discovery-insight')} → ${s(y, 'lcp-discovery-insight')}`, `${s(x, 'image-delivery-insight')} → ${s(y, 'image-delivery-insight')}`, `${s(x, 'unsized-images')} → ${s(y, 'unsized-images')}`, String(lB.get(id)?.lcpElement ?? '—').replace(/\|/g, '/').slice(0, 70)]
  }))

if ([...lB.values()].some(r => r.blocking?.length || r.shifts?.length)) {
  console.log(MD ? '\n**Diagnostics (after)**\n' : '\nDIAGNOSTICS (after)')
  for (const r of lB.values()) {
    const blocking = (r.blocking ?? []).map(x => `${x.url.replace(/^https?:\/\//, '').slice(0, 60)} (${x.ms}ms)`).join(', ')
    const shifts = (r.shifts ?? []).map(x => `${x.score} ${x.node.slice(0, 60)}`).join(' · ')
    console.log(`${MD ? '- ' : '  '}${r.id}: blocking [${blocking || 'none'}]${shifts ? ` · shifts [${shifts}]` : ''}`)
  }
}
