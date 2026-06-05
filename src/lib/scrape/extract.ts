// Article field extraction from raw HTML, used by both the import preview
// route and the bulk import route. Lives here (not in a route file) so route
// handlers don't import from each other.

import { parse } from 'node-html-parser'
import { decodeEntities } from '@/lib/scrape/http'

// ─── Candidate selectors tried in order per field ─────────────────────────────

const TITLE_SELECTORS = [
  'meta[property="og:title"]@content',
  'meta[name="twitter:title"]@content',
  'h1.post-title', 'h1.entry-title', 'h1.article-title', 'h1.page-title',
  '[class*="post-title"]', '[class*="entry-title"]', '[class*="article-title"]',
  '[itemprop="headline"]', 'h1',
  'title',
]

const CONTENT_SELECTORS = [
  '[class*="post-content"]', '[class*="entry-content"]', '[class*="article-content"]',
  '[class*="article-body"]', '[class*="post-body"]', '[class*="page-content"]',
  '[class*="content-area"]', '[class*="blog-content"]',
  'article .content', 'article .body', 'article',
  '[itemprop="articleBody"]',
  'main article', 'main .post', 'main',
]

const IMAGE_SELECTORS = [
  'meta[property="og:image"]@content',
  'meta[name="twitter:image"]@content',
  '.featured-image img@src', '.post-thumbnail img@src', '.wp-post-image@src',
  '[class*="featured-image"] img@src', '[class*="post-thumbnail"] img@src',
  '[class*="hero"] img@src', '[class*="banner"] img@src',
  'article img:first-of-type@src',
]

const AUTHOR_SELECTORS = [
  '[rel="author"]', '[class*="author-name"]', '[class*="post-author"]',
  '[itemprop="author"]', '.byline .author', '.byline',
  '[class*="byline"]', '[class*="author"]',
  'meta[name="author"]@content',
]

const DATE_SELECTORS = [
  'time[datetime]@datetime', 'time@datetime',
  '[class*="post-date"]', '[class*="entry-date"]', '[class*="publish-date"]',
  '[class*="date"]', '[itemprop="datePublished"]@content',
  'meta[property="article:published_time"]@content',
]

const CATEGORY_SELECTORS = [
  '[class*="cat-links"] a', '[class*="categories"] a', '[class*="post-categories"] a',
  '[class*="category"] a', '[rel~="category tag"]', '[class*="tag"] a',
]

const CONTENT_NOISE_SELECTOR =
  'script,style,nav,header,footer,aside,noscript,[class*="sidebar"],[class*="comment"],[id*="comment"],[class*="widget"],[class*="related"],[class*="share"],[class*="social"]'

// ─── Extraction helpers ───────────────────────────────────────────────────────

function trySelectors(root: ReturnType<typeof parse>, candidates: string[]): { value: string; selector: string } {
  for (const sel of candidates) {
    const [cssSel, attr] = sel.split('@')
    try {
      const el = root.querySelector(cssSel)
      if (!el) continue
      const value = attr ? el.getAttribute(attr) : el.text
      if (value?.trim()) return { value: value.trim(), selector: sel }
    } catch { continue }
  }
  return { value: '', selector: '' }
}

function trySelectorsMulti(root: ReturnType<typeof parse>, candidates: string[]): { values: string[]; selector: string } {
  for (const sel of candidates) {
    const [cssSel, attr] = sel.split('@')
    try {
      const els = root.querySelectorAll(cssSel)
      if (!els.length) continue
      const values = els.map(el => (attr ? el.getAttribute(attr) : el.text)?.trim()).filter(Boolean) as string[]
      if (values.length) return { values, selector: sel }
    } catch { continue }
  }
  return { values: [], selector: '' }
}

export type ExtractedArticle = {
  title: string
  content: string
  contentPreview: string
  contentLength: number
  image: string
  author: string
  date: string
  categories: string[]
  selectorsUsed: {
    title: string
    content: string
    image: string
    author: string
    date: string
    categories: string
  }
}

export function extractWithSelectors(html: string, custom: Record<string, string> = {}): ExtractedArticle {
  const root = parse(html)

  // Build per-field candidate lists: custom selector first if provided
  const titleCandidates   = custom.title      ? [custom.title, ...TITLE_SELECTORS]       : TITLE_SELECTORS
  const contentCandidates = custom.content    ? [custom.content, ...CONTENT_SELECTORS]   : CONTENT_SELECTORS
  const imageCandidates   = custom.image      ? [custom.image, ...IMAGE_SELECTORS]       : IMAGE_SELECTORS
  const authorCandidates  = custom.author     ? [custom.author, ...AUTHOR_SELECTORS]     : AUTHOR_SELECTORS
  const dateCandidates    = custom.date       ? [custom.date, ...DATE_SELECTORS]         : DATE_SELECTORS
  const catCandidates     = custom.categories ? [custom.categories, ...CATEGORY_SELECTORS] : CATEGORY_SELECTORS

  const titleResult  = trySelectors(root, titleCandidates)
  const imageResult  = trySelectors(root, imageCandidates)
  const authorResult = trySelectors(root, authorCandidates)
  const dateResult   = trySelectors(root, dateCandidates)
  const catResult    = trySelectorsMulti(root, catCandidates)

  // Content: remove noise before extracting
  const cleanRoot = parse(html)
  cleanRoot.querySelectorAll(CONTENT_NOISE_SELECTOR).forEach(el => el.remove())

  let contentEl: ReturnType<typeof cleanRoot.querySelector> = null
  let contentSel = ''
  for (const sel of contentCandidates) {
    const [cssSel] = sel.split('@')
    try {
      const el = cleanRoot.querySelector(cssSel)
      if (el && el.innerHTML.trim().length > 100) { contentEl = el; contentSel = sel; break }
    } catch { continue }
  }
  const contentHtml = contentEl?.innerHTML.trim() ?? ''
  const contentText = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  return {
    title: decodeEntities(titleResult.value),
    content: contentHtml,
    contentPreview: decodeEntities(contentText.slice(0, 400)),
    contentLength: contentText.length,
    image: imageResult.value,
    author: decodeEntities(authorResult.value),
    date: dateResult.value,
    categories: catResult.values.map(decodeEntities),
    selectorsUsed: {
      title: titleResult.selector,
      content: contentSel,
      image: imageResult.selector,
      author: authorResult.selector,
      date: dateResult.selector,
      categories: catResult.selector,
    },
  }
}
