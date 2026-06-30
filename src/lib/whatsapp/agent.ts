// WhatsApp Agent — the OpenAI brief→article brain (T4, server-only).
//
// One structured-output call decides Turn-Budget-1: draft on any usable topic,
// clarify only when the brief is empty/incomprehensible (or never, when
// MUST_DRAFT is set because we already spent our one clarification). Persona is
// Catalan, concise, professional, practical — no robotic pleasantries.
//
// Provider: OpenAI (WA_AGENT_MODEL). The dashboard's article generator
// (generate.ts) stays on Anthropic Opus 4.8; we only reuse its pure, security-
// sensitive sanitizeHtml + slugify here (DRY, no second copy of the sanitizer).

import OpenAI from 'openai'
import { sanitizeHtml, slugify } from '@/lib/writing/generate'
import { WA_AGENT_MODEL, WA_MOCK_AGENT } from './config'

export type AgentDraft = {
  title: string
  slug: string
  excerpt: string
  contentHtml: string
  seoTitle: string
  seoDescription: string
  focusKeyword: string
  categories: string[]
  tags: string[]
  niche: string
  strategy: string // shown to the owner in the WhatsApp reply — written in Catalan
}

export type AgentUsage = { in: number; out: number }

export type AgentResult =
  | { kind: 'clarify'; message: string; usage: AgentUsage }
  | { kind: 'draft'; draft: AgentDraft; usage: AgentUsage }

export type AgentInput = {
  brief: string
  articleLanguage: string // native label, e.g. "Català" / "Español" / "English"
  siteName: string
  existingCategories?: string[]
  // True once the single clarification has been spent (or the budget is 0): the
  // model MUST draft, never clarify.
  mustDraft: boolean
  // Edit loop (founder directive 2026-06-30): when the owner taps "Editar" and
  // sends change instructions, we re-run the agent to REVISE the existing draft
  // instead of writing a new one. Both fields are set together.
  editInstructions?: string
  currentDraft?: { title: string; contentHtml: string; excerpt?: string }
}

const SYSTEM_PROMPT = `You are Carma, an assistant that turns a short brief (often a transcribed WhatsApp voice note) from a small-business or agency owner into a publish-ready SEO blog article.

You ALWAYS return a strict JSON object with: decision ('clarify' | 'draft'), clarification, article.

DECISION RULE (Turn-Budget-1 — do NOT be chatty):
- Default to 'draft'. If the brief names ANY discernible topic, theme, product, service, event or question, draft immediately. Do not ask for confirmation, tone, length, audience or keywords — infer them.
- Use 'clarify' ONLY when the brief is empty, pure gibberish, or has no intelligible topic at all.
- If MUST_DRAFT is true in the request, you MUST draft even from a thin brief: pick the single most reasonable angle and write the article. Never clarify when MUST_DRAFT is true.

CLARIFICATION (decision='clarify'):
- 'clarification' is ONE short line in CATALAN — direct, casual and practical, like a quick WhatsApp from a helpful colleague. You MAY use ONE friendly emoji. No formal greeting, no "benvolgut", no corporate tone — just ask what the article should be about. Example: "No m'ha arribat cap tema! 😅 Envia'm de què vols l'article i m'hi poso."
- Leave every 'article' field as an empty string / empty array.

ARTICLE (decision='draft'): write it in the ARTICLE LANGUAGE given in the request.
- 'content_html' is an HTML FRAGMENT using ONLY these tags: <h2> <h3> <p> <ul> <ol> <li> <strong> <em> <a href> <blockquote>. No <h1>, no inline styles, no <script>, no class attributes. 700-1100 words of genuinely useful, specific content with a clear intro, well-structured H2/H3 sections and a short conclusion. Avoid AI clichés ("En el món actual", "En conclusió"). Open and close every tag.
- 'title' compelling and includes the focus keyword. 'slug' lowercase, ASCII, hyphenated. 'excerpt' 1-2 sentences. 'seo_title' ~50-60 chars with the keyword. 'seo_description' ~140-160 chars with the keyword. 'focus_keyword' the 2-4 word target phrase (must appear in title, first paragraph and at least one H2). 'categories' 1-3 and 'tags' 3-6, in the article language; reuse the provided existing categories when they fit. 'niche' one sentence naming the site topic + audience.
- 'strategy' is ONE short sentence in CATALAN naming the chosen angle and the search intent — it is shown to the owner over WhatsApp, so keep it crisp, casual and practical (no corporate tone).
- SAFETY: never invent specific statistics, prices, dates or quotes attributed to real people. Leave 'clarification' as an empty string.

Output ONLY the JSON object.`

const AGENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['clarify', 'draft'] },
    clarification: { type: 'string' },
    article: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        slug: { type: 'string' },
        excerpt: { type: 'string' },
        content_html: { type: 'string' },
        seo_title: { type: 'string' },
        seo_description: { type: 'string' },
        focus_keyword: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        niche: { type: 'string' },
        strategy: { type: 'string' },
      },
      required: [
        'title', 'slug', 'excerpt', 'content_html', 'seo_title', 'seo_description',
        'focus_keyword', 'categories', 'tags', 'niche', 'strategy',
      ],
    },
  },
  required: ['decision', 'clarification', 'article'],
}

function buildUserMessage(input: AgentInput): string {
  const lines = [
    `ARTICLE LANGUAGE: ${input.articleLanguage} — write the entire article in this language.`,
    `MUST_DRAFT: ${input.mustDraft ? 'true' : 'false'}`,
    `SITE: ${input.siteName || '(unknown)'}`,
  ]
  if (input.existingCategories?.length) {
    lines.push(`EXISTING CATEGORIES (reuse when they fit): ${input.existingCategories.join(' · ')}`)
  }
  // Edit loop: hand the model the current draft + the owner's change request so it
  // REVISES (keeps what works, applies the changes) rather than rewriting from zero.
  if (input.editInstructions && input.currentDraft) {
    lines.push(
      '',
      'REVISION MODE: the owner already has the draft below and wants changes. Apply the change request faithfully, keep everything else, and return the full updated article (decision="draft").',
      `CURRENT TITLE: ${input.currentDraft.title}`,
      'CURRENT CONTENT (HTML):', '"""', input.currentDraft.contentHtml, '"""',
      "CHANGE REQUEST (the owner's WhatsApp note):", '"""', input.editInstructions, '"""',
    )
    return lines.join('\n')
  }
  lines.push('', "BRIEF (the owner's WhatsApp note):", '"""', input.brief, '"""')
  return lines.join('\n')
}

// ─── Mock generator (WA_MOCK_AGENT) ───────────────────────────────────────────
// Deterministic, credit-free draft so the ack → buttons → approve/edit → publish
// flow can be tested without OpenAI. Echoes the brief/edit so it feels alive; the
// HTML clears the worker's "≥80 visible chars" sanity check. Never used in prod.
function mockAgent(input: AgentInput): AgentResult {
  const editing = !!(input.editInstructions && input.currentDraft)
  const topicRaw = (editing ? input.editInstructions : input.brief) || ''
  const topic = topicRaw.replace(/\s+/g, ' ').trim().slice(0, 80) || 'el teu tema'
  const focus = topic.toLowerCase().split(' ').slice(0, 3).join(' ') || 'tema'
  const title = editing
    ? `${input.currentDraft!.title} (revisat)`
    : `${topic.charAt(0).toUpperCase()}${topic.slice(1)}: guia pràctica`
  const contentHtml =
    `<p>[ESBORRANY DE PROVA · ${input.siteName || 'Carma'}] Aquest article s'ha generat amb el mode de proves (sense IA) per validar el flux de WhatsApp. ` +
    `Tema rebut: <strong>${topic}</strong>.</p>` +
    (editing ? `<p>Canvis aplicats: <em>${topic}</em>.</p>` : '') +
    `<h2>Per què és important ${focus}</h2><p>Contingut de mostra amb prou longitud per superar la validació del worker i renderitzar-se correctament a la pàgina de revisió. Pots aprovar-lo o editar-lo des de WhatsApp.</p>` +
    `<h2>Com aplicar-ho</h2><ul><li>Primer pas de mostra.</li><li>Segon pas de mostra.</li><li>Tercer pas de mostra.</li></ul>` +
    `<h3>Conclusió</h3><p>Aquest és un esborrany fictici. Desactiva WA_MOCK_AGENT per generar articles reals.</p>`
  return {
    kind: 'draft',
    usage: { in: 0, out: 0 },
    draft: {
      title,
      slug: slugify(title),
      excerpt: `Esborrany de prova sobre ${topic}.`,
      contentHtml: sanitizeHtml(contentHtml),
      seoTitle: title.slice(0, 60),
      seoDescription: `Guia de mostra sobre ${topic}. Generada en mode de proves de Carma.`.slice(0, 160),
      focusKeyword: focus,
      categories: ['Proves'],
      tags: ['mock', 'whatsapp', 'carma'],
      niche: `Blog de mostra de ${input.siteName || 'Carma'}.`,
      strategy: editing ? 'He aplicat els teus canvis (mode de proves).' : 'Esborrany de prova per validar el flux.',
    },
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []

const FALLBACK_CLARIFY = "No m'ha arribat cap tema! 😅 Envia'm de què vols l'article i m'hi poso."

/** Run one agent turn. Throws on missing key / provider error (worker retries). */
export async function runAgent(input: AgentInput): Promise<AgentResult> {
  // Credit-free testing path (never in production): skip OpenAI entirely.
  if (WA_MOCK_AGENT) return mockAgent(input)

  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no està configurada')

  const client = new OpenAI({ maxRetries: 1 })
  const completion = await client.chat.completions.create(
    {
      model: WA_AGENT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'carma_agent', strict: true, schema: AGENT_SCHEMA },
      },
    },
    { timeout: 160_000 },
  )

  const usage: AgentUsage = {
    in: completion.usage?.prompt_tokens ?? 0,
    out: completion.usage?.completion_tokens ?? 0,
  }
  const content = completion.choices[0]?.message?.content
  if (!content) {
    // Refusal or empty — never crash the thread; fall back to a clarification.
    return { kind: 'clarify', message: FALLBACK_CLARIFY, usage }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    return { kind: 'clarify', message: FALLBACK_CLARIFY, usage }
  }

  if (parsed.decision === 'clarify' && !input.mustDraft) {
    return { kind: 'clarify', message: str(parsed.clarification).trim() || FALLBACK_CLARIFY, usage }
  }

  const a = (parsed.article ?? {}) as Record<string, unknown>
  const contentHtml = sanitizeHtml(str(a.content_html))
  const title = str(a.title).trim()
  // The model said draft (or was forced to) but produced nothing usable.
  if (!title || contentHtml.replace(/<[^>]+>/g, '').trim().length < 80) {
    return {
      kind: 'clarify',
      usage,
      message: "M'he encallat amb aquest 😅 Dona'm una mica més de detall del tema i ho torno a provar.",
    }
  }

  return {
    kind: 'draft',
    usage,
    draft: {
      title,
      slug: slugify(str(a.slug) || title),
      excerpt: str(a.excerpt).trim(),
      contentHtml,
      seoTitle: str(a.seo_title).trim(),
      seoDescription: str(a.seo_description).trim(),
      focusKeyword: str(a.focus_keyword).trim(),
      categories: strArr(a.categories).slice(0, 3),
      tags: strArr(a.tags).slice(0, 6),
      niche: str(a.niche).trim(),
      strategy: str(a.strategy).trim(),
    },
  }
}
