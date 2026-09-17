// WhatsApp Agent — deterministic edit-target resolution (pure, import-safe).
//
// Split out of executors/editPublished.ts so the accent-fold / date-window / match
// logic is unit-testable without loading the OpenAI SDK chain. The router passes
// HINTS (never the post itself); this resolves them against the site's posts.

export type TargetHints = { titleRef: string | null; contentRef: string | null; dateRef: string | null }
export type PostMatch = { id: string; title: string; slug: string; created_at?: string; html?: string }

const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Parse a fuzzy date reference into a generous created_at window, or null. */
export function parseDateRef(ref: string | null | undefined, now: number = Date.now()): { from: string; to: string } | null {
  if (!ref) return null
  const r = ref.toLowerCase().trim()
  const day = 86_400_000
  const mk = (fromMs: number, toMs: number) => ({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() })
  if (/\bahir\b|yesterday|ayer/.test(r)) return mk(now - 2 * day, now)
  if (/setmana passada|last week|semana pasada/.test(r)) return mk(now - 14 * day, now)
  if (/aquesta setmana|this week|esta semana/.test(r)) return mk(now - 7 * day, now + day)
  if (/mes passat|last month|mes pasado/.test(r)) return mk(now - 45 * day, now)
  const iso = Date.parse(r)
  if (Number.isFinite(iso)) return mk(iso - 2 * day, iso + 2 * day)
  return null
}

/** Filter candidate posts by the title/content hints (accent-folded, case-insensitive). */
export function matchPosts(rows: PostMatch[], hints: TargetHints): PostMatch[] {
  const title = hints.titleRef ? fold(hints.titleRef) : ''
  const content = hints.contentRef ? fold(hints.contentRef) : ''
  if (!title && !content) return rows // date-only (or no) text hints → the whole window
  return rows.filter((r) => {
    const t = fold(r.title || '')
    const c = fold(r.html || '')
    return (title && t.includes(title)) || (content && c.includes(content))
  })
}
