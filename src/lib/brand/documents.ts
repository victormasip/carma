// Brand Brain — document intake (server-only).
//
// The owner drops a brand guide, a company deck, an "about us" PDF, whatever they
// have. We only ever want the PROSE out of it: the distiller downstream reads
// text, and every byte of layout we carry through is a byte of budget stolen from
// their actual words.
//
// Deliberately narrow: four formats, a hard byte cap per file, a hard total cap,
// and every parser failure degrades to "this file contributed nothing" rather than
// failing the capture. Someone uploading a 200MB scanned PDF must not be able to
// break their own onboarding.

import type { BrandSource } from './types'
// The accept-list and its predicate live in a dependency-free module: this file
// reaches pdf-parse and mammoth, so a client component importing anything from
// here drags a PDF parser into the browser bundle. It happened once; see the
// header of lib/onboarding/documentTypes.ts.
import { ACCEPTED_DOC_TYPES, ACCEPTED_DOC_EXTENSIONS, isAcceptedDocument } from '@/lib/onboarding/documentTypes'

export { ACCEPTED_DOC_TYPES, ACCEPTED_DOC_EXTENSIONS, isAcceptedDocument }

/** Per-file cap. Bigger than any real brand document, small enough to stay cheap. */
const MAX_FILE_BYTES = 15 * 1024 * 1024
/** Total prose budget across all documents — roughly 25k tokens. */
const MAX_TOTAL_CHARS = 100_000
/** Per-file prose budget, so one long PDF can't crowd out the other four files. */
const MAX_FILE_CHARS = 40_000

export type ParsedDocument = { source: BrandSource; text: string }

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

/** Collapse the whitespace a PDF/DOCX extractor inevitably produces. */
function tidy(raw: string): string {
  return raw
    // PDF extractors emit a newline per visual line; rejoin sentences that were
    // only broken by the page layout, and keep real paragraph breaks.
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/([^\n.!?:;])\n(?=[a-zà-ÿ(])/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

async function parsePdf(bytes: Uint8Array): Promise<string> {
  // pdf-parse v2 exposes a PDFParse class. Imported lazily so this module stays
  // importable from the plain-node test harness (no pdfjs at import time).
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: Buffer.from(bytes) })
  try {
    const res = await parser.getText()
    return typeof res?.text === 'string' ? res.text : ''
  } finally {
    await parser.destroy?.()
  }
}

async function parseDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth')
  const res = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  return typeof res?.value === 'string' ? res.value : ''
}

/**
 * Turn one uploaded file into prose. Returns null when the file is unreadable,
 * unsupported, empty, or over the cap — never throws, because one bad file must
 * not cost the owner their whole onboarding.
 */
export async function parseDocument(file: File): Promise<ParsedDocument | null> {
  const name = file.name || 'document'
  if (file.size > MAX_FILE_BYTES) return null

  const ext = extensionOf(name)
  const type = (file.type || '').toLowerCase()

  let raw = ''
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) return null

    if (type === 'application/pdf' || ext === '.pdf') {
      raw = await parsePdf(bytes)
    } else if (type.includes('wordprocessingml') || ext === '.docx') {
      raw = await parseDocx(bytes)
    } else if (type.startsWith('text/') || ext === '.txt' || ext === '.md') {
      raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    } else {
      return null
    }
  } catch {
    // A password-protected PDF, a corrupt zip, an image-only scan with no text
    // layer — all land here. Silently contributing nothing is the right outcome.
    return null
  }

  const text = tidy(raw).slice(0, MAX_FILE_CHARS)
  // Under ~200 characters there is nothing to distil — most likely a scan with no
  // text layer, which would otherwise look like a successful parse.
  if (text.length < 200) return null

  return { source: { kind: 'document', label: name, chars: text.length }, text }
}

/**
 * Parse every uploaded file, keeping the total inside one prose budget. Files are
 * processed in the order given, so the owner's ordering is their priority.
 */
export async function parseDocuments(files: File[]): Promise<ParsedDocument[]> {
  const out: ParsedDocument[] = []
  let budget = MAX_TOTAL_CHARS
  for (const file of files) {
    if (budget <= 0) break
    const parsed = await parseDocument(file)
    if (!parsed) continue
    if (parsed.text.length > budget) {
      // Cut at a paragraph boundary so the distiller never sees a half sentence.
      const cut = parsed.text.lastIndexOf('\n', budget)
      parsed.text = parsed.text.slice(0, cut > 400 ? cut : budget)
      parsed.source.chars = parsed.text.length
    }
    budget -= parsed.text.length
    out.push(parsed)
  }
  return out
}


