// Client-side language detection — uses franc-min (small footprint, MIT) over
// the article's plain text. Mapped to the platform's supported locales.
//
// Returns null when:
//   · The sample is too short to be reliable (< 60 plain chars)
//   · The detected language isn't one we support
//   · Confidence is too low
//
// Source of truth is the user's manual switch — detection is a SUGGESTION,
// surfaced as a pill the user confirms or dismisses.

import { franc } from 'franc-min'
import { LOCALES, type Locale } from './config'

// franc returns ISO 639-3; map to our 639-1 content locales. Covers every
// publishing language in config.LOCALES that franc-min can recognise, so a
// detected French/German/Italian/… article keeps its real language instead of
// collapsing to the Catalan default (the old 3-language map was the root of the
// "importer only ever finds ca/es/en" bug).
const FRANC_TO_LOCALE: Record<string, Locale> = {
  cat: 'ca',
  spa: 'es',
  eng: 'en',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  glg: 'gl',
  eus: 'eu',
  nld: 'nl',
}

const MIN_TEXT_LENGTH = 60

export type DetectionResult = {
  locale: Locale | null
  confidence: number   // franc returns a number 0–1; passed through
  sample: string       // first ~80 chars of the analyzed text (for the UI hint)
  /** 'tokens' = the Catalan stopword rule fired (high precision); 'franc' = statistical. */
  source: 'tokens' | 'franc' | null
}

// ── Catalan-first token rule ──────────────────────────────────────────────────
// franc-min's trigram model confuses ca↔es on short/mixed text, and Catalan is
// our home market — mislabeling it is the worst failure. These markers are
// CATALAN-DISTINCTIVE: common function words Spanish (and English) never use,
// plus the apostrophized articles. The rule needs ≥3 total hits across ≥2
// distinct markers, so a single quoted Catalan word can't flip an article.
const CATALAN_MARKERS = new Set([
  'amb', 'dels', 'als', 'pels', 'això', 'també', 'només', 'perquè', 'què',
  'fins', 'avui', 'després', 'aquesta', 'aquest', 'són', 'està', 'molt',
])
// l'/d'/s'/n'/m'/t' + vowel or h — the apostrophized articles/pronouns. Uses a
// lookahead (not a trailing \b), so accents on the next word don't break it.
const CATALAN_APOSTROPHE = /\b[ldsnmt]['’](?=[haeiouàèéíòóúHAEIOUÀÈÉÍÒÓÚ])/g

// ── Spanish-first token rule ──────────────────────────────────────────────────
// franc-min's trigram model confuses Spanish with its Iberian neighbours (Galician,
// Portuguese, even Catalan) on short or mixed text, so a clearly-Spanish article was
// sometimes labelled 'gl'/'pt' — the "importer still fails to detect Spanish" bug.
// These markers are SPANISH-DISTINCTIVE: everyday function words that Galician,
// Portuguese and Catalan spell differently (gl 'moi'/'tamén'/'agora', pt
// 'muito'/'também'/'agora', ca 'molt'/'també'/'ara'), so a real Spanish text trips
// the rule but a Galician/Portuguese/Catalan one does not.
const SPANISH_MARKERS = new Set([
  'muy', 'también', 'hacia', 'esto', 'eso', 'mismo', 'misma', 'ahora', 'entonces',
  'siempre', 'aunque', 'español', 'años', 'cómo', 'según', 'hasta', 'desde', 'cuando',
  'donde', 'porque', 'pero', 'está', 'están', 'ningún', 'alguna',
])

// Shared marker scan: ≥3 total hits across ≥2 distinct markers in the plain text.
// Tokenizes on Unicode letter runs (`\p{L}` + the `u` flag); JS `\b` is ASCII-only,
// so a trailing boundary after an accented letter (això, también, què…) never
// matches — that would silently disable our most distinctive markers.
function markerSignals(plain: string, markers: Set<string>): boolean {
  const lower = plain.toLowerCase()
  let hits = 0
  const kinds = new Set<string>()
  for (const tok of lower.split(/[^\p{L}]+/u)) {
    if (markers.has(tok)) { hits += 1; kinds.add(tok) }
  }
  return hits >= 3 && kinds.size >= 2
}

function hasCatalanSignals(plain: string): boolean {
  if (markerSignals(plain, CATALAN_MARKERS)) {
    // Already ≥3/≥2 on the plain markers; the apostrophe rule only strengthens it.
    return true
  }
  // Apostrophized articles/pronouns (l'/d'/s'/…) are Catalan-distinctive too; fold
  // them in so loaded Catalan with few stopwords still trips the ≥3/≥2 threshold.
  const lower = plain.toLowerCase()
  let hits = 0
  const kinds = new Set<string>()
  for (const tok of lower.split(/[^\p{L}]+/u)) {
    if (CATALAN_MARKERS.has(tok)) { hits += 1; kinds.add(tok) }
  }
  const apostrophes = lower.match(CATALAN_APOSTROPHE)
  if (apostrophes) { hits += apostrophes.length; kinds.add('apostrophe') }
  return hits >= 3 && kinds.size >= 2
}

function hasSpanishSignals(plain: string): boolean {
  return markerSignals(plain, SPANISH_MARKERS)
}

/** Strip HTML tags + collapse whitespace to get usable plain text. */
export function htmlToPlain(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectLocale(textOrHtml: string): DetectionResult {
  const plain = htmlToPlain(textOrHtml)
  const sample = plain.slice(0, 80)

  if (plain.length < MIN_TEXT_LENGTH) {
    return { locale: null, confidence: 0, sample, source: null }
  }

  // Language-first heuristic: distinctive Catalan function words beat the
  // statistical model outright — high precision, and it fires from the 60-char
  // floor, so loaded/typed Catalan is labeled immediately. Catalan is checked
  // before Spanish because ca↔es is the closest pair and ca is the home market.
  if (hasCatalanSignals(plain)) {
    return { locale: 'ca', confidence: 0.95, sample, source: 'tokens' }
  }
  // Spanish-distinctive markers beat franc's ca/gl/pt confusion (the "still fails
  // to detect Spanish" bug). Runs after Catalan so a ca article is never stolen.
  if (hasSpanishSignals(plain)) {
    return { locale: 'es', confidence: 0.92, sample, source: 'tokens' }
  }

  // `franc` returns an ISO 639-3 code, or 'und' (undetermined).
  // We restrict it to our supported locales to bias correctly when the text
  // is short or mixed.
  const supported = Object.keys(FRANC_TO_LOCALE)
  const ranked = franc(plain, { only: supported, minLength: MIN_TEXT_LENGTH })
  if (!ranked || ranked === 'und') return { locale: null, confidence: 0, sample, source: null }
  const locale = FRANC_TO_LOCALE[ranked] ?? null
  if (!locale || !(LOCALES as readonly string[]).includes(locale)) {
    return { locale: null, confidence: 0, sample, source: null }
  }
  // franc-min doesn't expose a per-call confidence; approximate from length
  // (longer samples → more reliable). Saturates at 800 chars.
  const confidence = Math.min(1, plain.length / 800)
  return { locale, confidence, sample, source: 'franc' }
}
