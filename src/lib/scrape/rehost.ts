// Re-host external/scraped images into Supabase Storage during import.
//
// Imported articles arrive with images that point at the SOURCE site
// (featured image + every <img> inside the content). Storing those raw external
// URLs is fragile: the source can hot-link-protect them, delete them, serve them
// over http (mixed-content) or behind auth, and the article silently breaks. The
// directive's preferred fix is to fetch each image once and re-upload it to our
// own public `post-media` bucket, so everything is hosted natively.
//
// Everything here is BEST-EFFORT and failure-tolerant: if an image can't be
// fetched/uploaded (404, too large, not an image, SSRF-blocked, timeout), we keep
// the ORIGINAL url so the article still renders. We never throw.

import { parse } from 'node-html-parser'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSafeUrl } from '@/lib/scrape/http'

const BUCKET = 'post-media'
const MAX_BYTES = 10 * 1024 * 1024 // skip anything over 10 MB
const FETCH_TIMEOUT = 12_000
const CONCURRENCY = 4

// content-type → file extension for the storage key.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

type AdminClient = ReturnType<typeof createAdminClient>

/** True for URLs we should attempt to re-host (absolute http(s), not already ours). */
function isRehostable(src: string, ownHost: string | null): boolean {
  if (!src) return false
  // data: / blob: are handled elsewhere (rendered inline); never fetch them here.
  if (!/^https?:\/\//i.test(src)) return false
  if (!isSafeUrl(src)) return false
  if (ownHost) {
    try {
      if (new URL(src).host === ownHost) return false // already on our storage
    } catch { /* fall through */ }
  }
  return true
}

/** Fetch one image and upload it to the bucket. Returns the public URL or null. */
async function fetchAndUpload(admin: AdminClient, siteId: string, src: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(src, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Carma-CMS-Bot/1.0 (image rehost)' },
      redirect: 'follow',
    })
    if (!res.ok) return null

    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ct.startsWith('image/')) return null

    const ab = await res.arrayBuffer()
    if (ab.byteLength === 0 || ab.byteLength > MAX_BYTES) return null
    const buf = new Uint8Array(ab)

    const ext = EXT_BY_MIME[ct] ?? 'bin'
    const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const path = `${siteId}/imported/${rand}.${ext}`

    const { error } = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: ct,
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) return null

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Map over items with a fixed concurrency, preserving order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return out
}

/** Derive the public storage host (so we don't re-host our own URLs). */
function ownStorageHost(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  try { return new URL(base).host } catch { return null }
}

/**
 * Re-host the article's images into Supabase Storage.
 *
 * Re-hosts the featured image and every `<img src>` in the content HTML, mapping
 * each unique external URL to a clean public URL. Deduplicates (the same source
 * URL is fetched once). On any failure for a given image, the original URL is
 * kept. Returns the rewritten `{ featuredImage, contentHtml }`.
 *
 * No-op (returns the inputs untouched) when there are no rehostable URLs.
 */
export async function rehostImportedImages(
  siteId: string,
  contentHtml: string,
  featuredImage: string,
): Promise<{ contentHtml: string; featuredImage: string }> {
  const ownHost = ownStorageHost()

  // Collect every candidate URL (featured + in-content) up front, deduped.
  const urls = new Set<string>()
  if (isRehostable(featuredImage, ownHost)) urls.add(featuredImage)

  let root: ReturnType<typeof parse> | null = null
  if (contentHtml && contentHtml.includes('<img')) {
    try {
      root = parse(contentHtml)
      for (const img of root.querySelectorAll('img')) {
        const src = img.getAttribute('src') ?? ''
        if (isRehostable(src, ownHost)) urls.add(src)
        // Drop srcset — it points at source-hosted variants we won't re-host, and
        // the renderer's /api/img builds its own responsive srcset from `src`.
        if (img.getAttribute('srcset')) img.removeAttribute('srcset')
      }
    } catch {
      root = null
    }
  }

  if (urls.size === 0) return { contentHtml, featuredImage }

  const admin = createAdminClient()
  const list = [...urls]
  const mapped = await mapWithConcurrency(list, CONCURRENCY, src => fetchAndUpload(admin, siteId, src))

  // src → new url (only successful ones).
  const replacement = new Map<string, string>()
  list.forEach((src, i) => { const u = mapped[i]; if (u) replacement.set(src, u) })

  if (replacement.size === 0) return { contentHtml, featuredImage }

  const newFeatured = replacement.get(featuredImage) ?? featuredImage

  let newHtml = contentHtml
  if (root) {
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? ''
      const repl = replacement.get(src)
      if (repl) img.setAttribute('src', repl)
    }
    newHtml = root.toString()
  }

  return { contentHtml: newHtml, featuredImage: newFeatured }
}
