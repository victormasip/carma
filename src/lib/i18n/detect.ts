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

// franc returns ISO 639-3; map to our 639-1 codes.
const FRANC_TO_LOCALE: Record<string, Locale> = {
  cat: 'ca',
  spa: 'es',
  eng: 'en',
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

/**
 * ≥3 hits across ≥2 distinct Catalan markers in the plain text.
 *
 * Tokenizes on Unicode letter runs (`\p{L}` + the `u` flag) instead of per-word
 * `\b…\b` regexes: JS `\b` is ASCII-only, so a trailing boundary after an
 * accented letter (això, també, què…) never matches — that would silently
 * disable our most distinctive markers.
 */
function hasCatalanSignals(plain: string): boolean {
  const lower = plain.toLowerCase()
  let hits = 0
  const kinds = new Set<string>()
  for (const tok of lower.split(/[^\p{L}]+/u)) {
    if (CATALAN_MARKERS.has(tok)) {
      hits += 1
      kinds.add(tok)
    }
  }
  const apostrophes = lower.match(CATALAN_APOSTROPHE)
  if (apostrophes) {
    hits += apostrophes.length
    kinds.add('apostrophe')
  }
  return hits >= 3 && kinds.size >= 2
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
  // floor, so loaded/typed Catalan is labeled immediately.
  if (hasCatalanSignals(plain)) {
    return { locale: 'ca', confidence: 0.95, sample, source: 'tokens' }
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
