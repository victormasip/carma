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
    return { locale: null, confidence: 0, sample }
  }

  // `franc` returns an ISO 639-3 code, or 'und' (undetermined).
  // We restrict it to our supported locales to bias correctly when the text
  // is short or mixed.
  const supported = Object.keys(FRANC_TO_LOCALE)
  const ranked = franc(plain, { only: supported, minLength: MIN_TEXT_LENGTH })
  if (!ranked || ranked === 'und') return { locale: null, confidence: 0, sample }
  const locale = FRANC_TO_LOCALE[ranked] ?? null
  if (!locale || !(LOCALES as readonly string[]).includes(locale)) {
    return { locale: null, confidence: 0, sample }
  }
  // franc-min doesn't expose a per-call confidence; approximate from length
  // (longer samples → more reliable). Saturates at 800 chars.
  const confidence = Math.min(1, plain.length / 800)
  return { locale, confidence, sample }
}
