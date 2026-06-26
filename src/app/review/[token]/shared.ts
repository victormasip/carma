// /review/[token] — small shared helper (no 'use server'; pure util used by both
// the server page and the approve action).

import { publicBlogUrl } from '@/lib/sites/domain'

/**
 * The public URL a published article lives at: the tenant subdomain when one is
 * configured (`<sub>.<ROOT_DOMAIN>/<slug>`), else the canonical render path which
 * always resolves (`/render/<siteId>/<slug>`).
 */
export function buildArticleUrl(
  subdomain: string | null | undefined,
  slug: string,
  siteId: string,
  host?: string,
): string {
  if (subdomain) {
    const u = publicBlogUrl(subdomain, { currentHost: host, path: `/${slug}` })
    if (u) return u
  }
  return `/render/${siteId}/${slug}`
}
