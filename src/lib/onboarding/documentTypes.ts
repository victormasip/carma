// Which documents Carma accepts — and NOTHING else.
//
// WHY THIS IS ITS OWN FILE
// ────────────────────────
// This used to live in `lib/brand/documents.ts` alongside the parsers. That file
// is server-only and reaches pdf-parse and mammoth through dynamic imports —
// which is correct there, and catastrophic the moment a CLIENT component imports
// the three-line `isAcceptedDocument` from it: the bundler follows the module,
// finds the dynamic imports, and emits pdf.js as a chunk on the route. The
// landing Door did exactly that and put ~47KB gzip of PDF parser on a marketing
// page whose entire budget is 40.
//
// So the predicate lives here, with zero imports, and both sides use it. The gate
// (`npm run test:landing`) measures the landing's own JavaScript separately from
// the framework floor precisely so a regression like that shows up as a number
// rather than as a slow page nobody can explain.

export const ACCEPTED_DOC_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const

export const ACCEPTED_DOC_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const

/** The `accept` attribute for a file input, kept in step with the two lists. */
export const ACCEPT_ATTR = `${ACCEPTED_DOC_EXTENSIONS.join(',')},${ACCEPTED_DOC_TYPES.join(',')}`

/**
 * True when a file is one we can read.
 *
 * Checks the MIME type first and the extension second, because browsers lie in
 * both directions: Windows hands us an empty `type` for .md, and some mail
 * clients label a .docx as application/octet-stream.
 */
export function isAcceptedDocument(file: { name?: string; type?: string }): boolean {
  const t = (file.type || '').toLowerCase()
  if (t === 'application/pdf' || t.includes('wordprocessingml') || t.startsWith('text/')) return true
  return /\.(pdf|docx|txt|md)$/i.test(file.name || '')
}
