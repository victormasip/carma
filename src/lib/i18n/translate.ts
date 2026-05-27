// Claude-powered article translation.
//
// Translates a post's localized fields (title / body HTML / excerpt / SEO) from
// one locale to another while preserving the HTML structure EXACTLY — tags,
// attributes, classes, data-* (our block markers like data-carma-toc,
// carma-callout, carma-figure, etc.) and URLs are kept verbatim; only the
// human-readable text nodes + alt text are translated. Mirrors the Anthropic
// usage pattern in llmChrome.ts (single cached system prompt, structured JSON).

import Anthropic from '@anthropic-ai/sdk'
import { LOCALE_META, type Locale } from './config'

// Translation is far simpler than chrome reconstruction, so default to a cheaper
// model. Override with TRANSLATE_LLM_MODEL. Effort is kept low for cost/speed.
const MODEL = process.env.TRANSLATE_LLM_MODEL || 'claude-sonnet-4-6'
const SUPPORTS_EFFORT = /^claude-(opus-4-[567]|sonnet-4-6)/.test(MODEL)

export type TranslatableFields = {
  title: string
  html: string
  excerpt: string
  seoTitle: string
  seoDescription: string
}

const SYSTEM_PROMPT = `You are a professional localization engineer translating blog/CMS content between languages for a multilingual publishing platform.

You receive an article's fields in a SOURCE language and must return the SAME fields translated into the TARGET language, as strict JSON matching the provided schema.

NON-NEGOTIABLE RULES:
1. HTML FIDELITY. The "html" field is rich content. Preserve the markup EXACTLY: every tag, attribute, class name, id, data-* attribute, inline style, and the overall structure must be identical. Translate ONLY human-visible text nodes and user-facing attribute values (alt, title, aria-label, and a button/link's visible label). Never add, remove, reorder, or rename elements.
2. DO NOT TRANSLATE: URLs/hrefs/src, code or <pre>/<code> contents, class names, ids, data-* values, CSS, email addresses, numbers, brand/product names, or @handles. Keep them byte-for-byte.
3. NATURAL, IDIOMATIC translation — not literal/word-for-word. Match the register and tone of the source. Keep it fluent for a native reader of the target language.
4. SEO. Translate seo_title and seo_description naturally; keep them roughly the same length band as the source so they still fit search snippets (title ~50-60 chars, description ~140-160). Do not pad or truncate awkwardly.
5. EMPTY FIELDS. If a source field is empty, return it empty. Never invent content.
6. PUNCTUATION/TYPOGRAPHY. Use the target language's conventions (e.g. Spanish ¿¡, French spacing) where appropriate.

Output ONLY the JSON object. No commentary.`

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    html: { type: 'string' },
    excerpt: { type: 'string' },
    seo_title: { type: 'string' },
    seo_description: { type: 'string' },
  },
  required: ['title', 'html', 'excerpt', 'seo_title', 'seo_description'],
} as const

function localeName(locale: Locale): string {
  return `${LOCALE_META[locale].label} (${LOCALE_META[locale].native})`
}

function buildUserMessage(from: Locale, to: Locale, f: TranslatableFields): string {
  return [
    `SOURCE LANGUAGE: ${localeName(from)}`,
    `TARGET LANGUAGE: ${localeName(to)}`,
    ``,
    `Translate the following article fields from the source language into the target language, following every rule. Return JSON only.`,
    ``,
    JSON.stringify(
      {
        title: f.title,
        html: f.html,
        excerpt: f.excerpt,
        seo_title: f.seoTitle,
        seo_description: f.seoDescription,
      },
      null,
      2,
    ),
  ].join('\n')
}

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    throw new Error('La traducció no ha retornat un JSON vàlid')
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export async function translateFieldsWithClaude(
  from: Locale,
  to: Locale,
  fields: TranslatableFields,
): Promise<TranslatableFields> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no està configurada')
  }
  // Nothing to translate.
  if (!fields.title.trim() && !fields.html.trim() && !fields.excerpt.trim()) {
    return fields
  }

  const client = new Anthropic({ maxRetries: 1 })
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 32_000,
      output_config: {
        ...(SUPPORTS_EFFORT ? { effort: 'low' as const } : {}),
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserMessage(from, to, fields) }],
    },
    // Hard ceiling so a stalled stream surfaces as an error instead of hanging
    // the editor's spinner forever.
    { timeout: 110_000 },
  )

  const msg = await stream.finalMessage()
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const parsed = extractJson(text)
  return {
    title: str(parsed.title) || fields.title,
    html: str(parsed.html) || fields.html,
    excerpt: str(parsed.excerpt),
    seoTitle: str(parsed.seo_title),
    seoDescription: str(parsed.seo_description),
  }
}

// ─── Chrome (header/footer) translation ──────────────────────────────────────

export type ChromeTranslatable = { headerHtml: string; footerHtml: string; sectionTitle: string }

const CHROME_SYSTEM_PROMPT = `You are a localization engineer translating a website's HEADER and FOOTER markup plus its blog/news section title between languages. Return strict JSON: { "header_html": string, "footer_html": string, "section_title": string }.

RULES:
1. HTML FIDELITY. Preserve every tag, attribute, class, id, data-* attribute, inline style and the overall structure EXACTLY. Translate ONLY human-visible text nodes and user-facing attribute values (alt, title, aria-label, and a link/button's visible label). Never add, remove, reorder or rename elements.
2. DO NOT TRANSLATE: URLs/href/src, class names, ids, data-* values, inline CSS, code, email addresses, brand/product names, @handles. Keep the names of languages in a language switcher in their own language (e.g. "English", "Español", "Català").
3. NATURAL, idiomatic translation matching the target language's register and conventions.
4. EMPTY input field → empty output. Never invent content.

Output ONLY the JSON object.`

const CHROME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { header_html: { type: 'string' }, footer_html: { type: 'string' }, section_title: { type: 'string' } },
  required: ['header_html', 'footer_html', 'section_title'],
} as const

export async function translateChromeWithClaude(
  from: Locale,
  to: Locale,
  c: ChromeTranslatable,
): Promise<ChromeTranslatable> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no està configurada')
  if (!c.headerHtml.trim() && !c.footerHtml.trim() && !c.sectionTitle.trim()) return c

  const client = new Anthropic({ maxRetries: 1 })
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 32_000,
      output_config: {
        ...(SUPPORTS_EFFORT ? { effort: 'low' as const } : {}),
        format: { type: 'json_schema', schema: CHROME_SCHEMA },
      },
      system: [{ type: 'text', text: CHROME_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          `SOURCE LANGUAGE: ${localeName(from)}`,
          `TARGET LANGUAGE: ${localeName(to)}`,
          ``,
          `Translate the header/footer markup and the section title. Return JSON only.`,
          ``,
          JSON.stringify({ header_html: c.headerHtml, footer_html: c.footerHtml, section_title: c.sectionTitle }, null, 2),
        ].join('\n'),
      }],
    },
    { timeout: 110_000 },
  )

  const msg = await stream.finalMessage()
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const parsed = extractJson(text)
  return {
    headerHtml: str(parsed.header_html) || c.headerHtml,
    footerHtml: str(parsed.footer_html) || c.footerHtml,
    sectionTitle: str(parsed.section_title),
  }
}
