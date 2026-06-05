// Structured-data helpers for the public renderer.
//
// We emit two flavors of JSON-LD per article:
//
//   1. schema.org `Article` — universal SEO + Google Search rich results.
//   2. schema.org `BreadcrumbList` — listing → article navigation hint.
//
// AI-chatbot citation (ChatGPT, Perplexity, Claude) leans heavily on
// well-structured `Article` JSON-LD with `description`, `headline`, `author`,
// `datePublished`, and `inLanguage` — so emitting these is also our "appear on
// chatbots" play.

import type { Locale } from '@/lib/i18n/config'

export type ArticleSchemaInput = {
  url: string
  headline: string
  description?: string | null
  image?: string | null
  authorName?: string | null
  datePublished?: string | null
  dateModified?: string | null
  locale: Locale
  siteName: string
  /** Section / category name (single, primary). */
  section?: string | null
  keywords?: string[] | null
  /** Plain-text article body. Carried in JSON-LD as the crawlable copy of the
   *  article, since the rendered prose now lives inside a Shadow DOM (which
   *  search/AI crawlers don't read). */
  articleBody?: string | null
}

const BCP47: Record<Locale, string> = { en: 'en-US', es: 'es-ES', ca: 'ca-ES' }

/** JSON.stringify with sane defaults for embedding into an HTML `<script>`. */
function safeStringify(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

export function buildArticleJsonLd(input: ArticleSchemaInput): string {
  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    inLanguage: BCP47[input.locale],
    isPartOf: { '@type': 'Blog', name: input.siteName },
  }
  if (input.description) payload.description = input.description
  if (input.image) payload.image = [input.image]
  if (input.authorName) payload.author = { '@type': 'Person', name: input.authorName }
  if (input.datePublished) payload.datePublished = input.datePublished
  if (input.dateModified) payload.dateModified = input.dateModified
  if (input.section) payload.articleSection = input.section
  if (input.keywords && input.keywords.length) payload.keywords = input.keywords.join(', ')
  if (input.articleBody && input.articleBody.trim()) payload.articleBody = input.articleBody.trim()

  return `<script type="application/ld+json">${safeStringify(payload)}</script>`
}

export type BreadcrumbInput = {
  listingUrl: string
  listingName: string
  articleUrl?: string | null
  articleName?: string | null
}

export function buildBreadcrumbJsonLd(input: BreadcrumbInput): string {
  const items: Record<string, unknown>[] = [
    { '@type': 'ListItem', position: 1, name: input.listingName, item: input.listingUrl },
  ]
  if (input.articleUrl && input.articleName) {
    items.push({ '@type': 'ListItem', position: 2, name: input.articleName, item: input.articleUrl })
  }
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  }
  return `<script type="application/ld+json">${safeStringify(payload)}</script>`
}

export type BlogSchemaInput = {
  url: string
  name: string
  description?: string | null
  locale: Locale
}

export function buildBlogJsonLd(input: BlogSchemaInput): string {
  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: input.name,
    url: input.url,
    inLanguage: BCP47[input.locale],
  }
  if (input.description) payload.description = input.description
  return `<script type="application/ld+json">${safeStringify(payload)}</script>`
}

// ─── AI-chatbot extraction helpers ──────────────────────────────────────────
//
// Tools like Perplexity and ChatGPT's Browse feature do a strip-tags-then-summarize
// pass. We can dramatically improve citation accuracy by exposing a clean, plain-text
// excerpt at the top of the article (already done by SEO description) PLUS a tight
// FAQ block when the article naturally has Q&A structure. The FAQ JSON-LD is
// auto-derived from the content's headings + first paragraph after each, when the
// heading ends with a "?" — opt-in by content shape, no editor toggle needed.

import { parse } from 'node-html-parser'

export function maybeBuildFaqJsonLd(contentHtml: string): string {
  if (!contentHtml || !contentHtml.includes('?')) return ''
  let root: ReturnType<typeof parse>
  try { root = parse(contentHtml) } catch { return '' }

  type FaqItem = { question: string; answer: string }
  const items: FaqItem[] = []

  // Collect H2/H3 that end with "?" + the next paragraph's text.
  const headings = root.querySelectorAll('h2, h3')
  for (const h of headings) {
    const question = h.text.trim()
    if (!question.endsWith('?')) continue
    // Find the next sibling paragraph.
    let next = h.nextElementSibling
    while (next && next.tagName !== 'P' && next.tagName !== 'H2' && next.tagName !== 'H3') {
      next = next.nextElementSibling
    }
    if (!next || next.tagName === 'H2' || next.tagName === 'H3') continue
    const answer = next.text.trim()
    if (answer.length < 20) continue
    items.push({ question, answer: answer.slice(0, 600) })
  }

  if (items.length < 2) return ''

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(it => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: { '@type': 'Answer', text: it.answer },
    })),
  }
  return `<script type="application/ld+json">${safeStringify(payload)}</script>`
}
