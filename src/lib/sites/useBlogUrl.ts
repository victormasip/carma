'use client'

// Client-side resolution of a blog's PUBLIC address.
//
// The value has to be stable across hydration — an href that differs between the
// server render and the first client render is a mismatch — so the snapshot
// deliberately does NOT read `window` during render. `publicSiteUrl` already
// produces the real pretty URL on the server in production (rootDomain() has a
// prod fallback), and the only thing the browser adds is the dev PORT.
//
// So: render the stable URL, and upgrade it at CLICK time via `openBlog`, which
// is allowed to read window.location.host because nothing is being hydrated.

import { useCallback } from 'react'
import { publicSiteUrl } from './domain'

export type BlogSite = { id: string; subdomain?: string | null }

/** Stable, hydration-safe href for a blog page. Use for `href`. */
export function blogHref(site: BlogSite, path = '/'): string {
  return publicSiteUrl(site, { path })
}

/**
 * Opens a blog page in a new tab at the best address the browser can build, with
 * a cache-buster so an owner who just published never sees the edge copy.
 * Pair it with `blogHref` on the same element so middle-click still works.
 */
export function useOpenBlog(site: BlogSite) {
  const { id, subdomain } = site
  return useCallback((path = '/') => {
    const url = publicSiteUrl(
      { id, subdomain },
      { path, currentHost: window.location.host, bust: true },
    )
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [id, subdomain])
}
