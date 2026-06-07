// Centralised display formatting for the Catalan dashboard UI. Keeps the `ca-ES`
// locale — and the canonical date option-sets — in one place so every surface
// renders dates and numbers identically (and a future locale switch is one edit).

const LOCALE = 'ca-ES'

const DATE_STYLES = {
  // 7/6/2026 — bare numeric ("Creat el …" on site cards / headers).
  numeric: undefined,
  // 7 de jun. 2026 — day + short month + year (article rows, lab sample cards).
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions | undefined>

/** Format a date for display in the dashboard. Invalid input renders as the
 *  platform default ("Invalid Date") — callers that need a placeholder guard. */
export function formatDate(
  value: string | number | Date,
  style: keyof typeof DATE_STYLES = 'numeric',
): string {
  return new Date(value).toLocaleDateString(LOCALE, DATE_STYLES[style])
}

/** Locale-aware integer/number formatting (thousands separators). */
export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE)
}
