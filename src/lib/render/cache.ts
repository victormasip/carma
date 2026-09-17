// Caching + link-context policy for the public blog (Super MVP Fase 4).
//
// One place decides three things that used to be scattered across the two render
// route handlers (and drifted between them):
//
//   1. WHICH requests are cacheable        → isPlainPublicRequest
//   2. WHAT tag they are stored under      → siteTag / postTag
//   3. WHICH address space their links use → linkCtxFor
//
// Kept dependency-light (strings + URLSearchParams) so the eval harness and the
// render-stress suite can import it without pulling in Next or Supabase.

import type { LinkCtx } from '@/lib/render/theme'
import { isUuid } from '@/lib/sites/domain'
import { isLocale, type Locale } from '@/lib/i18n/config'

// ─── 1. Cacheability ──────────────────────────────────────────────────────────

// Query params that make a request genuinely per-visitor. `lang` is NOT one of
// them: it is part of the cache key instead, because a language is a public,
// shareable variant of the page, not personalisation.
//
//   · format=fragment  → the embed payload for a third-party page (CORS, JSON)
//   · preview / edit   → dashboard surfaces carrying unsaved state
//   · ui               → the HOST app's chrome language, not the content's
//   · anything else    → live Theme-Studio token overrides (embedParams)
const CACHE_SAFE_PARAMS = new Set(['lang'])

/**
 * True when this is an ordinary public visit that can be served from cache.
 * Deliberately conservative: an unknown query param means "someone is overriding
 * something", so we take the dynamic path rather than risk caching a variant.
 */
export function isPlainPublicRequest(sp: URLSearchParams): boolean {
  for (const key of sp.keys()) {
    if (!CACHE_SAFE_PARAMS.has(key)) return false
  }
  return true
}

// ─── 2. Cache tags ────────────────────────────────────────────────────────────
//
// These are what finally make invalidation real. Before Fase 4 the ~8
// `revalidatePath('/render/…')` call sites in the codebase were no-ops, because a
// force-dynamic route has no cache to revalidate (lib/actions/posts.ts even said
// so in a comment). Now a publish expires exactly the affected entries.
//
// Tags must be ≤ 256 chars; a UUID plus prefix is nowhere near that.

/** Everything rendered for one site: its listing, and every article on it. */
export function siteTag(siteId: string): string {
  return `site:${siteId}`
}

/** One article, in every locale. Lets a single-post edit skip the listing rebuild. */
export function postTag(siteId: string, postId: string): string {
  return `post:${siteId}:${postId}`
}

// ─── 3. Link context ──────────────────────────────────────────────────────────

/**
 * Decide which address space this render's links live in.
 *
 * The route param is the discriminator, and it needs no header sniffing:
 *
 *   · a UUID          → someone hit the canonical /render/<uuid> directly
 *                       (dashboard preview, embed host, an old bookmark), so
 *                       links must stay fully qualified under that prefix.
 *   · a subdomain label → the proxy rewrote <sub>.<domain>/<path> to here, so the
 *                       visitor's address bar shows the pretty URL and links must
 *                       be SITE-RELATIVE (`/hola-mon`, `/es/hola-mundo`).
 *
 * That second branch is the whole fix for "ugly links": the rewrite always
 * worked, but theme.ts hardcoded `/render/${siteId}/…` into every href, so a
 * visitor on blog.carma.cat clicked an article and landed back on
 * blog.carma.cat/render/8f3a…/hola-mon.
 */
export function linkCtxFor(
  param: string,
  siteId: string,
  theme?: { default_locale?: string | null } | null,
): LinkCtx {
  const dl = theme?.default_locale
  const siteDefault: Locale | null = dl && isLocale(dl) ? (dl as Locale) : null
  return { base: isUuid(param) ? `/render/${siteId}` : '', siteDefault }
}

// ─── Cache-Control ────────────────────────────────────────────────────────────

/**
 * Edge caching for a public blog document.
 *
 * `max-age=0` (browser always revalidates) is deliberate and unchanged: the owner
 * must see a re-capture or a theme save immediately, and a 304 is cheap.
 *
 * `s-maxage` went from 60s to 5 minutes. It is capped there ON PURPOSE: we set an
 * explicit Cache-Control header, which opts this route out of Next-managed CDN
 * invalidation, so a cache tag update does NOT purge the edge. Five minutes is
 * the honest upper bound on how stale a just-published article may look at the
 * CDN — the origin behind it is now nearly free thanks to `use cache`.
 *
 * FOLLOW-UP (measure, don't assume): if Vercel is confirmed to purge the edge for
 * tag updates on manually-headered route handlers, raise s-maxage to a year and
 * let the tags own correctness entirely.
 */
export const BLOG_CACHE_CONTROL =
  'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'

/** A paywalled article varies by a per-reader unlock cookie — never shared-cached. */
export const PRIVATE_CACHE_CONTROL = 'private, no-store'

// ─── Path parsing (locale segments) ───────────────────────────────────────────

export type BlogPath =
  | { kind: 'listing'; locale: Locale | null }
  | { kind: 'article'; slug: string; locale: Locale | null }

/**
 * Parse the catch-all segments under /render/<tenant>/…
 *
 *   []                    → listing, site default locale
 *   ['es']                → listing in Spanish
 *   ['hola-mon']          → article (locale derived from which slug matched)
 *   ['es','hola-mundo']   → Spanish article
 *
 * Ambiguity note: a single segment that IS a locale code (`/es`) is read as a
 * locale listing. An article whose slug is literally "es" would be shadowed —
 * vanishingly rare, and the caller falls back to an article lookup when the site
 * doesn't publish that locale.
 */
export function parseBlogPath(segments: string[]): BlogPath {
  const parts = segments.filter(Boolean)
  if (parts.length === 0) return { kind: 'listing', locale: null }
  if (parts.length === 1) {
    return isLocale(parts[0])
      ? { kind: 'listing', locale: parts[0] as Locale }
      : { kind: 'article', slug: parts[0], locale: null }
  }
  const [maybeLocale, ...rest] = parts
  if (isLocale(maybeLocale)) {
    return { kind: 'article', slug: rest.join('/'), locale: maybeLocale as Locale }
  }
  return { kind: 'article', slug: parts.join('/'), locale: null }
}
