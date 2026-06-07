import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parse, type HTMLElement } from 'node-html-parser'
import { isValidHttpUrl, isSafeUrl, safeFetchText } from '@/lib/scrape/http'

// ─── Smart link extraction ────────────────────────────────────────────────────

// Tags/classes whose anchors should be ignored (author bio, tag cloud, share, etc)
const NOISE_SELECTOR = '[class*="author"],[class*="byline"],[class*="category"],[class*="categories"],[class*="tag"],[class*="share"],[class*="social"],[rel~="author"],[rel~="category"],[rel~="tag"]'

function extractOnclickHref(onclick: string): string | null {
  // Patterns: location.href='...', window.location='...', window.location.href='...'
  const patterns = [
    /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i,
    /window\.open\s*\(\s*['"]([^'"]+)['"]/i,
  ]
  for (const re of patterns) {
    const m = onclick.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

function findHrefForElement(el: HTMLElement): string | null {
  // 1. Element itself is an anchor
  if (el.tagName?.toLowerCase() === 'a') {
    const h = el.getAttribute('href')?.trim()
    if (h) return h
  }

  // 2. Element is wrapped by an anchor (card inside <a>)
  const wrapping = el.closest('a[href]')
  if (wrapping && wrapping !== el) {
    const h = wrapping.getAttribute('href')?.trim()
    if (h) return h
  }

  // 3. data-href / data-url / data-link / data-permalink on the element itself
  for (const attr of ['data-href', 'data-url', 'data-link', 'data-permalink']) {
    const h = el.getAttribute(attr)?.trim()
    if (h) return h
  }

  // 4. onclick handler with location.href=
  const onclick = el.getAttribute('onclick')
  if (onclick) {
    const h = extractOnclickHref(onclick)
    if (h) return h
  }

  // 5. Find best descendant anchor — prefer those wrapping a heading,
  //    skip anchors inside noise zones (author, category, etc)
  const anchors = el.querySelectorAll('a[href]')
  if (anchors.length > 0) {
    // Remove noise-wrapped anchors
    const candidates = anchors.filter(a => !a.closest(NOISE_SELECTOR))
    const pool = candidates.length > 0 ? candidates : anchors

    // Prefer anchor that contains or is contained by a heading
    const headingAnchor = pool.find(a =>
      a.querySelector('h1,h2,h3,h4') || a.closest('h1,h2,h3,h4')
    )
    if (headingAnchor) {
      const h = headingAnchor.getAttribute('href')?.trim()
      if (h) return h
    }

    // Otherwise: anchor with the longest text (usually the title link)
    let best: HTMLElement | null = null
    let bestLen = 0
    for (const a of pool) {
      const len = (a.text ?? '').replace(/\s+/g, ' ').trim().length
      if (len > bestLen) { best = a; bestLen = len }
    }
    if (best) {
      const h = best.getAttribute('href')?.trim()
      if (h) return h
    }

    // Fallback: first anchor in pool
    const h = pool[0].getAttribute('href')?.trim()
    if (h) return h
  }

  // 6. Descendant element with data-href / onclick
  for (const attr of ['data-href', 'data-url', 'data-link']) {
    const child = el.querySelector(`[${attr}]`)
    const h = child?.getAttribute(attr)?.trim()
    if (h) return h
  }
  const onclickChild = el.querySelector('[onclick*="location"]') ?? el.querySelector('[onclick*="window.open"]')
  if (onclickChild) {
    const oc = onclickChild.getAttribute('onclick')
    if (oc) {
      const h = extractOnclickHref(oc)
      if (h) return h
    }
  }

  return null
}

function extractTitleForElement(el: HTMLElement): string {
  // Prefer headings inside the card
  const heading = el.querySelector('h1,h2,h3,h4,h5,h6')
  if (heading) {
    const t = heading.text?.replace(/\s+/g, ' ').trim()
    if (t) return t.slice(0, 200)
  }
  // Wrapping anchor's heading
  const wrapper = el.closest('a')
  if (wrapper) {
    const wh = wrapper.querySelector('h1,h2,h3,h4,h5,h6')
    if (wh) {
      const t = wh.text?.replace(/\s+/g, ' ').trim()
      if (t) return t.slice(0, 200)
    }
  }
  // Anchor title attribute, aria-label
  const aTitle = el.getAttribute('title') ?? el.getAttribute('aria-label')
  if (aTitle?.trim()) return aTitle.trim().slice(0, 200)

  // [class*="title"] inside
  const titleClass = el.querySelector('[class*="title"],[class*="headline"]')
  if (titleClass) {
    const t = titleClass.text?.replace(/\s+/g, ' ').trim()
    if (t) return t.slice(0, 200)
  }

  // Last resort: full text (truncated)
  const t = el.text?.replace(/\s+/g, ' ').trim() ?? ''
  return t.slice(0, 200)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  // Read-only crawl of a public URL (no DB writes) — open to any authenticated
  // user (the write step, /api/import/articles, is what enforces site membership).
  let body: { url?: string; linkSelector?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  const rawUrl = body.url?.trim() ?? ''
  const linkSelector = body.linkSelector?.trim() ?? ''

  if (!isValidHttpUrl(rawUrl)) return NextResponse.json({ error: 'URL no vàlida' }, { status: 400 })
  if (!isSafeUrl(rawUrl)) return NextResponse.json({ error: 'URL no permesa' }, { status: 400 })
  if (!linkSelector) return NextResponse.json({ error: 'El selector CSS és obligatori' }, { status: 400 })

  const html = await safeFetchText(rawUrl)
  if (!html) return NextResponse.json({ error: "No s'ha pogut accedir a la pàgina llistadora" }, { status: 422 })

  const base = new URL(rawUrl)
  let root
  try { root = parse(html) } catch { return NextResponse.json({ error: 'Error parsejant HTML' }, { status: 422 }) }

  const seen = new Set<string>()
  const articles: { url: string; title: string }[] = []
  const listingNormalised = rawUrl.replace(/\/$/, '')

  let elements: HTMLElement[]
  try {
    elements = root.querySelectorAll(linkSelector)
  } catch {
    return NextResponse.json({ error: 'Selector CSS no vàlid' }, { status: 400 })
  }

  for (const el of elements) {
    const href = findHrefForElement(el)
    if (!href) continue
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.toLowerCase().startsWith('javascript:')) continue

    let absUrl: string
    try { absUrl = new URL(href, base).toString() } catch { continue }

    // Same domain only
    let parsed: URL
    try { parsed = new URL(absUrl) } catch { continue }
    if (parsed.hostname !== base.hostname) continue

    // Strip query/hash for dedup; keep original for navigation
    const normalised = absUrl.replace(/[#?].*$/, '').replace(/\/$/, '')
    if (normalised === listingNormalised) continue
    if (seen.has(normalised)) continue
    seen.add(normalised)

    const title = extractTitleForElement(el)
    articles.push({ url: absUrl, title })
    if (articles.length >= 200) break
  }

  if (articles.length === 0) {
    return NextResponse.json(
      { error: "Cap article trobat. Comprova que el selector apunta als cards o enllaços dels articles (suporta <a>, divs envoltats per <a>, data-href, i onclick)." },
      { status: 404 }
    )
  }

  return NextResponse.json({ method: 'crawl', articles, count: articles.length })
}
