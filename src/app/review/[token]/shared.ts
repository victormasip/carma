// /review/[token] — small shared helper (no 'use server'; pure util used by both
// the server page and the approve action).

import { publicSiteUrl } from '@/lib/sites/domain'

/**
 * The public URL a published article lives at. Thin wrapper over `publicSiteUrl`
 * (which owns the subdomain-first / engine-path-last policy) kept for the
 * argument order the review flow already uses.
 */
export function buildArticleUrl(
  subdomain: string | null | undefined,
  slug: string,
  siteId: string,
  host?: string,
): string {
  return publicSiteUrl({ id: siteId, subdomain }, { path: `/${slug}`, currentHost: host })
}
