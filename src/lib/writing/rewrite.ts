// Inline AI rewrite — the "✦ IA" action in the editor's selection (bubble) menu.
// Takes the plain text of a selection + a mode and returns a rewritten string in
// the SAME language. Deliberately plain-text in/out: the selection is inline
// prose and we reinsert the result as text, so there's no HTML to preserve.
// Mirrors the Anthropic usage in coach.ts / translate.ts (single cached system
// prompt, low effort, hard timeout).

import Anthropic from '@anthropic-ai/sdk'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'

const MODEL = process.env.WRITING_LLM_MODEL || 'claude-sonnet-4-6'
const SUPPORTS_EFFORT = /^claude-(opus-4-[567]|sonnet-4-6)/.test(MODEL)

export type RewriteMode = 'improve' | 'shorten' | 'expand' | 'fix'

const MODE_INSTRUCTION: Record<RewriteMode, string> = {
  improve: 'Rewrite it to be clearer, more direct and more engaging. Keep the meaning and roughly the same length.',
  shorten: 'Make it noticeably shorter and tighter while keeping every key point.',
  expand: 'Expand it with one or two sentences of relevant, concrete detail. No filler, no repetition.',
  fix: 'Fix spelling, grammar and punctuation only. Keep the wording and meaning as close to the original as possible.',
}

const SYSTEM_PROMPT = `You are an inline writing assistant inside a rich-text editor. The user selected a passage and asked you to transform it.

NON-NEGOTIABLE RULES:
1. Respond IN THE SAME LANGUAGE as the passage. Match its register (formal / casual) and voice.
2. Return ONLY the transformed passage as PLAIN TEXT. No quotes around it, no markdown, no HTML, no commentary, no preamble, no trailing notes.
3. Keep proper nouns, numbers, URLs and code unchanged.
4. Do not add headings or bullet points unless the original had them. Return prose that can drop straight back where the selection was.`

export async function rewriteSelection(opts: {
  text: string
  locale: Locale
  mode: RewriteMode
}): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no està configurada')
  const text = opts.text.trim()
  if (!text) return opts.text
  if (text.length > 6000) throw new Error('La selecció és massa llarga per reescriure-la (màx. ~6000 caràcters)')

  const client = new Anthropic({ maxRetries: 1 })
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 4000,
      ...(SUPPORTS_EFFORT ? { output_config: { effort: 'low' as const } } : {}),
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          `PASSAGE LANGUAGE: ${LOCALE_META[opts.locale].label} (${LOCALE_META[opts.locale].native})`,
          `TASK: ${MODE_INSTRUCTION[opts.mode]}`,
          ``,
          `PASSAGE:`,
          text,
        ].join('\n'),
      }],
    },
    { timeout: 60_000 },
  )

  const msg = await stream.finalMessage()
  const out = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
    // Defensive: strip a wrapping pair of quotes if the model added them anyway.
    .replace(/^["'“”«»]|["'“”«»]$/g, '')
    .trim()

  return out || text
}
