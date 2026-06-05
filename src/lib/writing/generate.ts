// "Magic SEO Article" — autonomous, ready-to-publish article generation.
//
// The directive: from the user's own website URL, Claude deduces the niche,
// audience, competitors and copy tone, picks a high-intent SEO angle, and writes
// ONE complete, optimized article straight into the editor. This is the heavy,
// structural AI task → Claude Opus 4.8 (the project's model for structural work),
// adaptive thinking, high effort, prompt-cached system prompt.
//
// We DON'T scrape the whole site — we feed Claude a compact "site brief" (title,
// description, headings, nav labels, sample link text) harvested from the
// homepage, which is enough signal to infer niche + tone without a crawl. The
// model returns a strict JSON article that maps 1:1 onto the editor's fields and
// renders with Carma's own blocks (no raw <script>, no foreign markup).

import Anthropic from '@anthropic-ai/sdk'
import { parse } from 'node-html-parser'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import { safeFetch, decodeEntities } from '@/lib/scrape/http'

// Opus 4.8 for the structural/creative heavy lift. Overridable per the project's
// env-override convention (cf. TRANSLATE_LLM_MODEL / WRITING_LLM_MODEL).
const MODEL = process.env.WRITING_GEN_MODEL || 'claude-opus-4-8'
const EFFORT = (process.env.WRITING_GEN_EFFORT || 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max'
// effort is GA on Opus 4.5+ / Sonnet 4.6; older models would 400.
const SUPPORTS_EFFORT = /^claude-(opus-4-[5678]|sonnet-4-6)/.test(MODEL)

export type GeneratedArticle = {
  title: string
  slug: string
  excerpt: string
  contentHtml: string
  seoTitle: string
  seoDescription: string
  focusKeyword: string
  categories: string[]
  tags: string[]
  // Model-surfaced reasoning, shown to the user so the generation isn't a black box.
  niche: string
  strategy: string
}

export type SiteBrief = {
  url: string
  siteName: string
  title: string
  description: string
  headings: string[]
  navLabels: string[]
  sampleLinks: string[]
  detectedLocale: Locale
}

// ─── Site brief harvesting ───────────────────────────────────────────────────

const PLATFORM_HOST = 'carma.cat'

/** Pull a compact signal set off the homepage (no crawl). Best-effort. */
export async function harvestSiteBrief(url: string, siteName: string, locale: Locale): Promise<SiteBrief> {
  const brief: SiteBrief = {
    url, siteName, title: '', description: '', headings: [], navLabels: [], sampleLinks: [], detectedLocale: locale,
  }

  // Don't bother fetching our own placeholder subdomain — there's no real site there yet.
  try {
    if (new URL(url).host.endsWith(PLATFORM_HOST)) return brief
  } catch { /* fall through — try the fetch */ }

  const res = await safeFetch(url, { timeout: 12_000 }).catch(() => null)
  if (!res?.body) return brief

  let root: ReturnType<typeof parse>
  try { root = parse(res.body) } catch { return brief }

  const meta = (k: string) =>
    root.querySelector(`meta[property="${k}"]`)?.getAttribute('content') ??
    root.querySelector(`meta[name="${k}"]`)?.getAttribute('content') ?? ''

  brief.title = decodeEntities((meta('og:title') || root.querySelector('title')?.text || '').replace(/\s+/g, ' ').trim()).slice(0, 200)
  brief.description = decodeEntities((meta('og:description') || meta('description')).replace(/\s+/g, ' ').trim()).slice(0, 400)

  for (const h of root.querySelectorAll('h1, h2')) {
    const t = decodeEntities((h.text || '').replace(/\s+/g, ' ').trim())
    if (t && t.length <= 120) brief.headings.push(t)
    if (brief.headings.length >= 14) break
  }

  const nav = root.querySelector('nav') ?? root.querySelector('header')
  if (nav) {
    for (const a of nav.querySelectorAll('a')) {
      const t = decodeEntities((a.text || '').replace(/\s+/g, ' ').trim())
      if (t && t.length <= 40) brief.navLabels.push(t)
      if (brief.navLabels.length >= 20) break
    }
  }

  for (const a of root.querySelectorAll('a')) {
    const t = decodeEntities((a.text || '').replace(/\s+/g, ' ').trim())
    if (t && t.length >= 8 && t.length <= 90) brief.sampleLinks.push(t)
    if (brief.sampleLinks.length >= 24) break
  }

  return brief
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    niche: { type: 'string' },
    strategy: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: 'string' },
    content_html: { type: 'string' },
    seo_title: { type: 'string' },
    seo_description: { type: 'string' },
    focus_keyword: { type: 'string' },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
  },
  required: [
    'niche', 'strategy', 'title', 'slug', 'excerpt', 'content_html',
    'seo_title', 'seo_description', 'focus_keyword', 'categories', 'tags',
  ],
} as const

const SYSTEM_PROMPT = `You are an elite SEO content strategist and copywriter for a multilingual publishing platform. From a brief about a website, you (1) deduce the site's NICHE, target audience, likely competitors and the copy TONE that fits, (2) choose the single highest-value, high-search-intent article angle for that site, and (3) write ONE complete, ready-to-publish, search-optimized article.

You return a STRICT JSON object matching the provided schema. No commentary outside the JSON.

NON-NEGOTIABLE RULES:
1. LANGUAGE. Write EVERYTHING (title, excerpt, body, SEO fields, categories, tags) in the TARGET LANGUAGE given in the request. Use that language's natural register and typography. Never mix languages.
2. NICHE & STRATEGY. "niche" = one sentence naming the site's topic/industry and audience. "strategy" = one or two sentences: the chosen article angle, the search intent it targets, and why it fits this site. Be concrete (mention the focus keyword and the reader's goal).
3. ARTICLE QUALITY. 700–1100 words of genuinely useful, specific, non-generic content. A clear intro that states the value, well-structured H2/H3 sections, and a short conclusion. Demonstrate real expertise for the niche; avoid filler and AI clichés ("In today's fast-paced world", "Let's dive in", "In conclusion"). Be original — do not copy the site's own copy.
4. HTML FORMAT. "content_html" is an HTML FRAGMENT (no <html>/<head>/<body>, no inline styles, no <script>, no class attributes). Use ONLY these tags: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <blockquote>. Do NOT include the article's <h1> title in the body (the title field is rendered separately). Open and close every tag correctly.
5. SEO. "seo_title" ≈ 50–60 chars and includes the focus keyword. "seo_description" ≈ 140–160 chars, compelling, includes the focus keyword. "focus_keyword" is the primary 2–4 word target phrase. The focus keyword must appear in the title, the first paragraph, at least one H2, and naturally throughout the body. "slug" is a short, lowercase, hyphenated, ASCII-folded version of the title (no stop-word stuffing).
6. FAQ BONUS. Where natural for the topic, include one H2 section of 2–3 question-style H3 subheadings (ending in "?") with concise answers — the platform emits FAQ structured data from these.
7. CATEGORIES & TAGS. 1–3 categories and 3–6 tags relevant to the niche, in the target language. Prefer reusing the site's existing categories when they fit (they're provided when known).
8. SAFETY. Never invent specific statistics, prices, dates, or quotes attributed to real people. Keep claims general and defensible.

Output ONLY the JSON object.`

function buildUserMessage(brief: SiteBrief, existingCategories: string[]): string {
  const loc = LOCALE_META[brief.detectedLocale]
  const lines: string[] = [
    `TARGET LANGUAGE: ${loc.label} (${loc.native}) — write the entire article in this language.`,
    ``,
    `SITE BRIEF`,
    `- Site name: ${brief.siteName || '(unknown)'}`,
    `- URL: ${brief.url}`,
  ]
  if (brief.title) lines.push(`- Homepage title: ${brief.title}`)
  if (brief.description) lines.push(`- Meta description: ${brief.description}`)
  if (brief.headings.length) lines.push(`- Headings seen: ${brief.headings.join(' · ')}`)
  if (brief.navLabels.length) lines.push(`- Navigation labels: ${brief.navLabels.join(' · ')}`)
  if (brief.sampleLinks.length) lines.push(`- Sample link text: ${brief.sampleLinks.slice(0, 16).join(' · ')}`)
  if (existingCategories.length) lines.push(`- Existing categories on this blog (reuse when they fit): ${existingCategories.join(' · ')}`)
  lines.push(
    ``,
    brief.title || brief.description || brief.headings.length
      ? `Deduce the niche from the brief above, choose the best SEO article angle, and write the complete article. Return JSON only.`
      : `The homepage gave little signal. Infer the most likely niche from the site name and URL, choose a broadly useful high-intent article angle for that kind of site, and write the complete article. Return JSON only.`,
  )
  return lines.join('\n')
}

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) as Record<string, unknown> } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    throw new Error('La generació no ha retornat un JSON vàlid')
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()) : []

// Defense-in-depth HTML sanitizer for the generated body. The schema + prompt
// already constrain the model to a safe tag set, but we never inject unvalidated
// markup: strip <script>/<style>/<iframe>, inline event handlers and javascript:
// URLs, regardless of what the model returned.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?(?:script|style|iframe|object|embed|form|input|link|meta)\b[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .trim()
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/**
 * Generate a complete SEO article from a site brief. Throws on missing API key,
 * malformed model output, or an empty article (the caller surfaces the error).
 */
export async function generateArticle(brief: SiteBrief, existingCategories: string[] = []): Promise<GeneratedArticle> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no està configurada')

  const client = new Anthropic({ maxRetries: 1 })
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 16_000,
      // Adaptive thinking + effort is the Opus 4.8 surface (no budget_tokens / temperature).
      ...(SUPPORTS_EFFORT ? { thinking: { type: 'adaptive' as const } } : {}),
      output_config: {
        ...(SUPPORTS_EFFORT ? { effort: EFFORT } : {}),
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserMessage(brief, existingCategories) }],
    },
    // Hard ceiling so a stalled stream surfaces as an error rather than hanging the editor.
    { timeout: 160_000 },
  )

  const msg = await stream.finalMessage()
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const parsed = extractJson(text)
  const title = str(parsed.title).trim()
  const contentHtml = sanitizeHtml(str(parsed.content_html))
  if (!title || contentHtml.replace(/<[^>]+>/g, '').trim().length < 120) {
    throw new Error("La IA no ha pogut generar un article complet. Torna-ho a provar.")
  }

  return {
    title,
    slug: slugify(str(parsed.slug) || title),
    excerpt: str(parsed.excerpt).trim(),
    contentHtml,
    seoTitle: str(parsed.seo_title).trim(),
    seoDescription: str(parsed.seo_description).trim(),
    focusKeyword: str(parsed.focus_keyword).trim(),
    categories: strArr(parsed.categories).slice(0, 3),
    tags: strArr(parsed.tags).slice(0, 6),
    niche: str(parsed.niche).trim(),
    strategy: str(parsed.strategy).trim(),
  }
}
