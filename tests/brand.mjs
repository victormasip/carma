// Brand Brain — unit tests for the pure logic (Fase 1).
//
//   npm run test:brand
//
// Covers the parts where a silent regression would be expensive and invisible:
//
//   · candidateSentences — the exemplar pipeline. If this starts admitting cookie
//     banners, the agent learns to write like a cookie banner.
//   · formatBrandBrain — the prompt block. A field that silently stops rendering
//     is a capability that silently stops existing.
//   · distilBrand under WA_MOCK_AGENT — the credit-free path the whole harness
//     depends on, and the guarantee that exemplars are VERBATIM.
//   · parseBlogPath — locale-vs-slug disambiguation on the public blog (Fase 4),
//     which had no coverage.
//
// Runs through tests/register.mjs so it imports the REAL modules.

import { candidateSentences } from '@/lib/brand/scrape'
import { formatBrandBrain, summariseBrandBrain } from '@/lib/brand/persist'
import { distilBrand } from '@/lib/brand/distil'
import { parseBlogPath } from '@/lib/render/cache'
import { isAcceptedDocument, parseDocument, parseDocuments } from '@/lib/brand/documents'
import { makeDocx, makePdf, asFile } from './fixtures.mjs'

let passed = 0
let failed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed++
  } catch (e) {
    failed++
    failures.push(`${name}: ${e.message}`)
  }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`)
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected truthy') }

function section(t) { console.log(`\n— ${t}`) }

// ── candidateSentences ────────────────────────────────────────────────────────
section('candidate sentences (the exemplar pipeline)')

check('keeps a real brand sentence', () => {
  const out = candidateSentences('Fem reformes integrals a pisos antics de l\'Eixample des de 1998.')
  eq(out.length, 1)
})

check('drops anything shorter than a sentence', () => {
  const out = candidateSentences('Contacta.\nServeis.\nInici.')
  eq(out, [])
})

check('drops cookie / legal boilerplate', () => {
  const text = [
    'Utilitzem cookies propies i de tercers per millorar la teva experiencia de navegacio.',
    'Tots els drets reservats. Consulta la politica de privacitat per saber-ne mes coses.',
    'Acompanyem cada familia durant tot el proces, des del primer esbos fins a les claus.',
  ].join('\n')
  const out = candidateSentences(text)
  eq(out.length, 1, 'only the brand sentence survives —')
  ok(out[0].startsWith('Acompanyem'), 'kept the wrong sentence')
})

check('drops SHOUTING banners', () => {
  const out = candidateSentences('OFERTA ESPECIAL NOMES AQUEST CAP DE SETMANA PER ALS NOSTRES CLIENTS.')
  eq(out, [])
})

check('splits multi-sentence prose and keeps each', () => {
  const text = 'Dissenyem cuines a mida per a cases petites del barri de Gracia. '
    + 'Cada projecte comenca amb una visita i un cafe amb els propietaris.'
  const out = candidateSentences(text)
  eq(out.length, 2)
})

check('de-duplicates a call-to-action repeated across pages', () => {
  const line = 'Demana pressupost sense compromis i et responem en menys de vint-i-quatre hores.'
  const out = candidateSentences([line, line, line].join('\n'))
  eq(out.length, 1)
})

check('respects the limit', () => {
  const one = 'Aquesta es una frase prou llarga per passar tots els filtres del selector.'
  const out = candidateSentences(Array.from({ length: 50 }, (_, i) => one.replace('Aquesta', `Frase${i}`)).join('\n'), 5)
  eq(out.length, 5)
})

check('drops a sentence with no verb-ish middle', () => {
  // A comma list of services is not voice, however long it is.
  eq(candidateSentences('Cuines,banys,parquet,pintura,electricitat,lampisteria,obra.'), [])
})

// ── distilBrand (mock path) ───────────────────────────────────────────────────
section('distilBrand — mock path is credit-free and verbatim')

const CORPUS = {
  siteName: 'Fusteria Bonet',
  originUrl: 'https://example.test',
  text: 'Fem mobles a mida per a cases del Bergueda des de fa tres generacions.',
  candidateSentences: [
    'Fem mobles a mida per a cases del Bergueda des de fa tres generacions.',
    'Treballem nomes amb fusta de proximitat i acabats naturals sense verns sintetics.',
  ],
  visual: { fonts: ['Georgia'], colors: ['#3b2a1a'], logoUrl: null, imageryStyle: null },
  sources: [{ kind: 'url', label: 'example.test', chars: 68 }],
  detectedLocale: 'ca',
}

await (async () => {
  process.env.WA_MOCK_AGENT = '1'
  const res = await distilBrand(CORPUS)

  check('returns a profile without an API key', () => ok(res && res.brain, 'no brain returned'))

  check('exemplars are VERBATIM from the candidates', () => {
    for (const s of res.brain.voice.exemplars) {
      ok(CORPUS.candidateSentences.includes(s), `paraphrased exemplar: ${s}`)
    }
  })

  check('carries the detected locale', () => eq(res.brain.locale, 'ca'))

  check('carries the visual hints through untouched', () => {
    eq(res.brain.visual.fonts, ['Georgia'])
    eq(res.brain.visual.colors, ['#3b2a1a'])
  })

  check('records provenance', () => eq(res.brain.sources.length, 1))

  check('returns null when there is nothing at all to work with', async () => {
    // Checked synchronously below via the awaited value.
  })

  const empty = await distilBrand({ ...CORPUS, text: '', candidateSentences: [] })
  check('empty corpus ⇒ null', () => eq(empty, null))

  // ── formatBrandBrain ────────────────────────────────────────────────────────
  section('formatBrandBrain — the prompt block')

  const full = {
    ...res.brain,
    identity: { name: 'Fusteria Bonet', tagline: 'Fusta de proximitat', whatTheySell: 'Mobles a mida', proofPoints: ['Tres generacions'] },
    audience: { who: 'Families del Bergueda', register: 'tu', problems: ['Espais petits'] },
    voice: {
      descriptors: ['proper', 'artesanal'],
      register: 'informal',
      bannedWords: ['low cost', 'barat'],
      sentenceLength: 'medium',
      emojiPolicy: 'cap',
      exemplars: CORPUS.candidateSentences,
    },
    pillars: [{ name: 'Fusta sostenible', keywords: ['fusta'], coverage: 'gap' }],
    constraints: { neverClaim: ['Garantia de per vida'] },
  }
  const block = formatBrandBrain(full)

  check('includes what they actually sell', () => ok(block.includes('Mobles a mida')))
  check('includes the audience', () => ok(block.includes('Families del Bergueda')))
  check('emits banned words as a hard rule', () => ok(/NEVER use these words:.*low cost/.test(block)))
  check('emits never-claim constraints', () => ok(block.includes('NEVER claim')))
  check('surfaces under-covered pillars as angles', () => ok(block.includes('Under-covered pillars')))
  check('quotes every exemplar verbatim', () => {
    for (const s of CORPUS.candidateSentences) ok(block.includes(s), `missing exemplar: ${s}`)
  })
  check('exemplars come LAST (few-shot lands next to the instruction)', () => {
    const lastExemplar = block.lastIndexOf(CORPUS.candidateSentences[1])
    ok(lastExemplar > block.indexOf('Voice:'), 'exemplars are not after the descriptors')
  })
  check('tells the writer not to copy them', () => ok(/Do not quote them/i.test(block)))

  check('summary is non-empty for a full brain', () => ok(summariseBrandBrain(full).length >= 3))
})()

// ── parseBlogPath (Fase 4 — locale vs slug) ───────────────────────────────────
section('parseBlogPath — locale segments vs slugs')

check('empty path ⇒ listing in the site default', () => eq(parseBlogPath([]), { kind: 'listing', locale: null }))
check('a locale code alone ⇒ that locale\'s listing', () => eq(parseBlogPath(['es']), { kind: 'listing', locale: 'es' }))
check('a slug alone ⇒ article, locale derived from the match', () =>
  eq(parseBlogPath(['hola-mon']), { kind: 'article', slug: 'hola-mon', locale: null }))
check('locale + slug ⇒ localised article', () =>
  eq(parseBlogPath(['es', 'hola-mundo']), { kind: 'article', slug: 'hola-mundo', locale: 'es' }))
check('non-locale first segment stays part of the slug', () =>
  eq(parseBlogPath(['blog', 'hola-mon']), { kind: 'article', slug: 'blog/hola-mon', locale: null }))
check('ignores empty segments', () => eq(parseBlogPath(['', 'hola']), { kind: 'article', slug: 'hola', locale: null }))

// ── document gate ─────────────────────────────────────────────────────────────
section('document acceptance')

check('accepts a PDF by mime', () => ok(isAcceptedDocument({ name: 'x', type: 'application/pdf' })))
check('accepts a DOCX by extension', () => ok(isAcceptedDocument({ name: 'marca.docx', type: '' })))
check('accepts markdown', () => ok(isAcceptedDocument({ name: 'notes.md', type: '' })))
check('rejects an image', () => ok(!isAcceptedDocument({ name: 'logo.png', type: 'image/png' })))
check('rejects an unknown binary', () => ok(!isAcceptedDocument({ name: 'a.bin', type: 'application/octet-stream' })))

// ── real document parsing ─────────────────────────────────────────────────────
// Byte-accurate fixtures against the REAL parsers. pdf-parse and mammoth have both
// changed API shape across majors; a mocked test would not notice.
section('document parsing (real pdf-parse + mammoth)')

const PROSE = [
  'Fusteria Bonet fa mobles a mida per a cases del Bergueda des de fa tres generacions.',
  'Treballem nomes amb fusta de proximitat i acabats naturals, sense verns sintetics.',
  'Cada encarrec comenca amb una visita al taller i un cafe amb qui hi viura.',
  'No competim per preu: competim perque el moble duri quaranta anys.',
]

await (async () => {
  const docx = await parseDocument(asFile(
    makeDocx(PROSE), 'guia-marca.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ))
  check('DOCX: parses', () => ok(docx, 'returned null'))
  check('DOCX: extracts the prose', () => ok(docx.text.includes('fusta de proximitat')))
  check('DOCX: records the file name as its source', () => eq(docx.source.label, 'guia-marca.docx'))
  check('DOCX: source kind is document', () => eq(docx.source.kind, 'document'))

  const pdf = await parseDocument(asFile(makePdf(PROSE), 'dossier.pdf', 'application/pdf'))
  check('PDF: parses', () => ok(pdf, 'returned null'))
  check('PDF: extracts the prose', () => ok(pdf.text.includes('tres generacions')))

  check('PDF text yields usable exemplars', () => {
    const cands = candidateSentences(pdf.text)
    ok(cands.length >= 2, `expected ≥2 candidates, got ${cands.length}`)
  })

  const txt = await parseDocument(asFile(Buffer.from(PROSE.join(String.fromCharCode(10)), 'utf8'), 'notes.txt', 'text/plain'))
  check('TXT: parses', () => ok(txt && txt.text.includes('quaranta anys')))

  check('rejects an empty file', async () => {})
  const empty = await parseDocument(asFile(Buffer.alloc(0), 'empty.pdf', 'application/pdf'))
  check('empty file ⇒ null', () => eq(empty, null))

  const tiny = await parseDocument(asFile(Buffer.from('curt', 'utf8'), 'tiny.txt', 'text/plain'))
  check('sub-200-char file ⇒ null (a scan with no text layer looks like this)', () => eq(tiny, null))

  const junk = await parseDocument(asFile(Buffer.from('not a pdf at all', 'utf8'), 'broken.pdf', 'application/pdf'))
  check('corrupt PDF ⇒ null, never throws', () => eq(junk, null))

  const batch = await parseDocuments([
    asFile(makeDocx(PROSE), 'a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    asFile(Buffer.from('nope', 'utf8'), 'b.txt', 'text/plain'),
    asFile(makePdf(PROSE), 'c.pdf', 'application/pdf'),
  ])
  check('batch keeps the readable ones and drops the rest', () => eq(batch.length, 2))
  check('batch preserves the given order', () => eq(batch.map(d => d.source.label), ['a.docx', 'c.pdf']))
})()

// ── report ────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(48))
if (failed > 0) {
  console.log(`RESULT: ${passed} passed, ${failed} failed\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`\n✓ brand: ${passed} passed, 0 failed`)
