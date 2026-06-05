// AI Writing Coach — Claude analyzes the article and returns concrete,
// actionable rewrite suggestions. Premium feature; called from the SEO/AI tab.
//
// Why not a deterministic readability score (Flesch, etc.)? Those work for EN
// but degrade in CA/ES, and they don't suggest fixes. Asking Claude with a tight
// JSON schema gives us per-locale rewrites and rationale, in one call.

import Anthropic from '@anthropic-ai/sdk'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'

const MODEL = process.env.WRITING_LLM_MODEL || 'claude-sonnet-4-6'
const SUPPORTS_EFFORT = /^claude-(opus-4-[567]|sonnet-4-6)/.test(MODEL)

export type WritingSuggestion = {
  category: 'clarity' | 'length' | 'jargon' | 'flow' | 'tone'
  severity: 'low' | 'medium' | 'high'
  before: string
  after: string
  why: string
}

export type WritingAnalysis = {
  readabilityScore: number       // 0–100 (higher = easier to read)
  readabilityLabel: string       // localized label, e.g. "Difícil"
  summary: string                // one-sentence overall verdict in the target locale
  suggestions: WritingSuggestion[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    readability_score: { type: 'integer' },
    readability_label: { type: 'string' },
    summary: { type: 'string' },
    suggestions: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['clarity', 'length', 'jargon', 'flow', 'tone'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          before: { type: 'string' },
          after: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['category', 'severity', 'before', 'after', 'why'],
      },
    },
  },
  required: ['readability_score', 'readability_label', 'summary', 'suggestions'],
} as const

const SYSTEM_PROMPT = `You are a professional editor / writing coach for a multilingual publishing platform.

You receive an article's HTML body and its target language. You must return a strict JSON object that scores its readability and proposes UP TO 8 concrete, actionable rewrite suggestions.

NON-NEGOTIABLE RULES:
1. Respond IN THE ARTICLE'S OWN LANGUAGE. The summary, the readability label, the "why" rationale and the "after" rewrites are all in that language. Match the article's register (formal / casual) — don't change the voice.
2. Each suggestion has a strict shape: { category, severity, before, after, why }.
   · "category": clarity | length | jargon | flow | tone
   · "severity": low | medium | high — high = clearly hurts comprehension
   · "before": the EXACT sentence (or short paragraph) from the article that should change. Use the source's wording verbatim — do not paraphrase, summarize, or merge sentences.
   · "after": the rewrite, equivalent in meaning. Shorter, simpler, more direct. Keep proper nouns, numbers, links and code unchanged.
   · "why": one short sentence (≤ 140 chars) explaining the gain.
3. PRIORITIZE the highest-impact issues. If the article is well-written, return fewer (or zero) suggestions instead of nitpicking.
4. NO MARKDOWN, NO HTML in the "before"/"after"/"why" fields — plain text only. Strip any leftover HTML tags from the source when quoting.
5. readability_score is 0–100. 0 = unreadable, 50 = newspaper, 80+ = elementary. Use the audience's perspective (a general reader of the article's language).
6. readability_label is a short word in the target language (e.g. "Difícil", "Bo", "Excel·lent").

Output ONLY the JSON object. No commentary.`

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) as Record<string, unknown> } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    throw new Error('La resposta del coach no és un JSON vàlid')
  }
}

function plainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function castSuggestion(raw: unknown): WritingSuggestion | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const category = ['clarity', 'length', 'jargon', 'flow', 'tone'].includes(String(r.category)) ? r.category as WritingSuggestion['category'] : null
  const severity = ['low', 'medium', 'high'].includes(String(r.severity)) ? r.severity as WritingSuggestion['severity'] : null
  if (!category || !severity) return null
  const before = typeof r.before === 'string' ? r.before.trim() : ''
  const after = typeof r.after === 'string' ? r.after.trim() : ''
  const why = typeof r.why === 'string' ? r.why.trim() : ''
  if (!before || !after) return null
  return { category, severity, before, after, why }
}

export async function analyzeWriting(opts: {
  title: string
  html: string
  locale: Locale
}): Promise<WritingAnalysis> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no està configurada')

  const plain = plainText(opts.html)
  if (plain.length < 80) {
    throw new Error("Cal una mica més de contingut perquè el coach pugui analitzar l'article")
  }

  const client = new Anthropic({ maxRetries: 1 })
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 4000,
      output_config: {
        ...(SUPPORTS_EFFORT ? { effort: 'low' as const } : {}),
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          `ARTICLE LANGUAGE: ${LOCALE_META[opts.locale].label} (${LOCALE_META[opts.locale].native})`,
          ``,
          `TITLE: ${opts.title}`,
          ``,
          `BODY (HTML — translate visible text only when quoting in suggestions; never quote tags):`,
          ``,
          opts.html.slice(0, 30_000),
        ].join('\n'),
      }],
    },
    { timeout: 90_000 },
  )

  const msg = await stream.finalMessage()
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const parsed = extractJson(text)
  const suggestions = Array.isArray(parsed.suggestions)
    ? (parsed.suggestions.map(castSuggestion).filter(Boolean) as WritingSuggestion[])
    : []

  return {
    readabilityScore: Math.max(0, Math.min(100, Number(parsed.readability_score) || 0)),
    readabilityLabel: typeof parsed.readability_label === 'string' ? parsed.readability_label : '—',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    suggestions,
  }
}
