// Carma's intent router — the fast conversational half of the brain (server-only).
//
// Brain overhaul (founder directive 2026-07-05): every inbound WhatsApp turn first
// passes through ONE cheap LLM call that (a) understands what the owner wants —
// new article, edit, publish, or just conversation — and (b) writes the immediate
// WhatsApp reply in Carma's voice, in the owner's language. This kills the rigid
// phase machine: greetings no longer become articles about "hola", "publica'l" as
// TEXT publishes (not only the button), and site picks work by name or number.
//
// The heavy article writing stays in agent.ts (runAgent) — the router only decides
// and talks. Model: WA_ROUTER_MODEL (default gpt-4o-mini — pennies per turn).

import OpenAI from 'openai'
import { CARMA_PERSONA } from './persona'
import { WA_ROUTER_MODEL, WA_MOCK_AGENT } from './config'
import type { AgentUsage } from './agent'

export type RouterIntent = 'write' | 'edit' | 'publish' | 'chat'

export type RouterResult = {
  intent: RouterIntent
  /** The WhatsApp reply to send right now (Carma's voice, owner's language). */
  reply: string
  /** write → the distilled article brief · edit → the change request · else "". */
  topic: string
  /** 1-based pick when the owner chose from the offered blog list, else null. */
  siteIndex: number | null
  usage: AgentUsage
}

export type HistoryTurn = { role: 'owner' | 'carma'; text: string }

export type RouterInput = {
  message: string
  history: HistoryTurn[]
  /** formatSiteContext() block when the thread's site is resolved. */
  siteContext: string | null
  /** Blog names, in candidate order, when the owner must pick one (>1 sites). */
  candidateSites: string[]
  /** True when the owner has zero connected blogs (router must explain onboarding). */
  noSites: boolean
  hasPendingDraft: boolean
  pendingDraftTitle: string | null
  /** The owner tapped "Editar" — this message is most likely the change request. */
  awaitingEdit: boolean
  /** A brief held while we asked which blog to write for. */
  pendingBrief: string | null
}

const ROUTER_SYSTEM = `${CARMA_PERSONA}

You receive the owner's newest WhatsApp message, the recent conversation and the blog's context. Decide ONE intent and write the reply you send right now.

INTENTS:
- "write": the message contains an idea, topic, request or question that should become a NEW article — including a thin one-liner (you infer the angle). Also when the owner picks which blog a held idea was for.
- "edit": there IS a pending draft and the owner wants it changed (tone, length, add/remove something, new title…). If AWAITING_EDIT is true, treat the message as the change request unless it is clearly something else.
- "publish": there IS a pending draft and the owner is telling you to publish/approve it ("publica'l", "endavant", "dale", "adelante", "go ahead", "aprovat"…).
- "chat": everything else — greetings, thanks, questions about their blog or about you, feedback, unclear messages. Answer fully and warmly in "reply", then gently point at what you can do next.

REPLY RULES ("reply" is sent to WhatsApp immediately):
- write → confirm the topic with genuine (not gushing) enthusiasm and say you're already on it; the draft arrives in a couple of minutes. Do NOT ask about tone, length, audience or keywords — you infer those.
- edit → confirm exactly what you're about to change, briefly.
- publish → confirm you're publishing right now (the live link follows automatically — do not invent a URL).
- chat → the full answer.
- If CANDIDATE BLOGS are listed and the message contains an article idea but the target blog is unclear: keep intent "write" and set "topic", but leave "site_index" null and make your reply ask which blog — include the numbered list. (The idea is held; the next turn drafts it.)
- If the owner picks a blog from an offered list (by number OR by name), set "site_index" (1-based position in the CANDIDATE BLOGS list) and carry on with the held idea (intent "write", topic = the held brief plus any new details).
- If NO_SITES is true, warmly explain they first need to create/connect their blog at carma.cat — intent "chat".
- If there is NO pending draft, never answer "edit" or "publish"; explain there's nothing pending and offer to write something ("chat").

"topic": for write, the distilled brief — keep the owner's concrete details verbatim, never enrich with facts they didn't say. For edit, the change request. Otherwise "".
"site_index": the 1-based pick, or null.

Return ONLY the JSON object.`

const ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['write', 'edit', 'publish', 'chat'] },
    reply: { type: 'string' },
    topic: { type: 'string' },
    site_index: { type: ['integer', 'null'] },
  },
  required: ['intent', 'reply', 'topic', 'site_index'],
}

function buildRouterMessage(input: RouterInput): string {
  const lines: string[] = []
  if (input.siteContext) lines.push('BLOG CONTEXT:', input.siteContext, '')
  if (input.candidateSites.length) {
    lines.push('CANDIDATE BLOGS (the owner must pick one):', ...input.candidateSites.map((n, i) => `${i + 1}) ${n}`), '')
  }
  lines.push(`NO_SITES: ${input.noSites}`)
  lines.push(`PENDING_DRAFT: ${input.hasPendingDraft ? `yes${input.pendingDraftTitle ? ` — «${input.pendingDraftTitle}»` : ''}` : 'no'}`)
  lines.push(`AWAITING_EDIT: ${input.awaitingEdit}`)
  if (input.pendingBrief) lines.push(`HELD BRIEF (waiting for a blog pick): """${input.pendingBrief}"""`)
  if (input.history.length) {
    lines.push('', 'RECENT CONVERSATION (oldest first):')
    for (const h of input.history) lines.push(`${h.role === 'owner' ? 'Owner' : 'Carma'}: ${h.text}`)
  }
  lines.push('', "OWNER'S NEW MESSAGE:", '"""', input.message, '"""')
  return lines.join('\n')
}

// ─── Mock router (WA_MOCK_AGENT) ───────────────────────────────────────────────
// Deterministic, credit-free routing so wa-replay can exercise the full flow —
// site pick → write → edit → publish — without OpenAI. Mirrors the real intents.
function mockRoute(input: RouterInput): RouterResult {
  const m = input.message.trim().toLowerCase()
  const usage: AgentUsage = { in: 0, out: 0 }
  const n = Number.parseInt(m.replace(/[^\d]/g, ''), 10)
  if (input.candidateSites.length > 1 && Number.isFinite(n) && n >= 1 && n <= input.candidateSites.length) {
    return { intent: 'write', reply: `Perfecte! M'hi poso ara mateix ✨ (mode de proves)`, topic: input.pendingBrief ?? '', siteIndex: n, usage }
  }
  if (input.hasPendingDraft && /^(publica|publicar|aprova|aprovar|endavant|dale|publish|approve|s[íi]\b|yes\b)/.test(m)) {
    return { intent: 'publish', reply: 'Ara mateix el publico 🚀 (mode de proves)', topic: '', siteIndex: null, usage }
  }
  if ((input.awaitingEdit || input.hasPendingDraft) && /^(canvia|edita|treu|afegeix|escur[çc]a|allarga|edit|change)/.test(m)) {
    return { intent: 'edit', reply: 'Marxant! Aplico aquests canvis ✏️ (mode de proves)', topic: input.message, siteIndex: null, usage }
  }
  if (/^(hola|bones|bon dia|bona tarda|gr[àa]cies|merci|thanks|hello|hi|hey|adeu|ok|d'acord|vale)\b/.test(m) || m.length < 4) {
    return { intent: 'chat', reply: 'Hola! 👋 Envia\'m una idea (text o àudio) i et preparo un article. (mode de proves)', topic: '', siteIndex: null, usage }
  }
  return { intent: 'write', reply: `Quina bona idea! Ara mateix m'hi poso ✍️ (mode de proves)`, topic: input.message, siteIndex: null, usage }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Route one inbound turn. Falls back to intent "write" with an empty reply on any
 * parse hiccup — the drafting brain downstream is the safest default (it can still
 * decide to clarify). Throws on provider/network errors so the job retries.
 */
export async function routeTurn(input: RouterInput): Promise<RouterResult> {
  if (WA_MOCK_AGENT) return mockRoute(input)
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no està configurada')

  const client = new OpenAI({ maxRetries: 1 })
  const completion = await client.chat.completions.create(
    {
      model: WA_ROUTER_MODEL,
      messages: [
        { role: 'system', content: ROUTER_SYSTEM },
        { role: 'user', content: buildRouterMessage(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'carma_router', strict: true, schema: ROUTER_SCHEMA },
      },
    },
    { timeout: 30_000 },
  )

  const usage: AgentUsage = {
    in: completion.usage?.prompt_tokens ?? 0,
    out: completion.usage?.completion_tokens ?? 0,
  }

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>
  } catch {
    /* fall through to the write default below */
  }

  const intent = (['write', 'edit', 'publish', 'chat'] as const).includes(parsed.intent as RouterIntent)
    ? (parsed.intent as RouterIntent)
    : 'write'
  const rawIndex = parsed.site_index
  const siteIndex = typeof rawIndex === 'number' && Number.isInteger(rawIndex) && rawIndex >= 1 ? rawIndex : null

  return { intent, reply: str(parsed.reply).trim(), topic: str(parsed.topic).trim(), siteIndex, usage }
}
