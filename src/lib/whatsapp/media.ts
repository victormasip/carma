// WhatsApp Agent — deterministic replies for media we can't act on yet (B4/B5).
//
// Video / document / sticker / location / contact used to fall through as `text` with
// a null body → the worker answered "no m'ha arribat res" (confusing). Now the webhook
// tags them `unsupported` and the worker answers with a friendly, SPECIFIC, ZERO-LLM
// template.
//
// IMAGES ARE NO LONGER IN THIS FILE (2026-09-17). `imageNoCaptionReply` lived here
// and said "encara no sé escriure a partir d'imatges" — which stopped being true
// the day a photo became a cover. The whole image path is lib/whatsapp/inboundImage.ts
// plus executors/image.ts; nothing about a photograph is an apology any more.
//
// PURE + import-safe → unit-testable.

export type UnsupportedKind = 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'unknown'

/** Map a raw Kapso/Meta message type to our unsupported bucket. */
export function normalizeUnsupportedKind(kapsoType: string): UnsupportedKind {
  switch ((kapsoType || '').toLowerCase()) {
    case 'video':
      return 'video'
    case 'document':
      return 'document'
    case 'sticker':
      return 'sticker'
    case 'location':
      return 'location'
    case 'contact':
    case 'contacts':
      return 'contact'
    default:
      return 'unknown'
  }
}

const UNSUPPORTED_REPLY: Record<UnsupportedKind, string> = {
  video: 'Els vídeos encara no els sé mirar 😅 — envia’m la idea per text o àudio i m’hi poso.',
  document: 'Encara no sé llegir documents adjunts 😅 — copia’m el text important o envia’m un àudio i tiro.',
  sticker: 'Que bo, l’sticker! 😄 Amb un text o un àudio et preparo l’article de debò.',
  location: 'Ubicació rebuda 📍 — de moment no en sé fer res; explica-m’ho amb una frase i te’n faig un article.',
  contact: 'Un contacte! 🙌 Encara no els sé fer servir; envia’m la idea per text o àudio i m’hi poso.',
  unknown: 'Això encara no ho sé processar 😅 — envia’m un text o un àudio amb la idea i tiro.',
}

export function unsupportedMediaReply(kind: UnsupportedKind): string {
  return UNSUPPORTED_REPLY[kind] ?? UNSUPPORTED_REPLY.unknown
}


/**
 * §3.5 / C1: a low-confidence transcript → echo back what we heard and ask to
 * confirm/resend instead of drafting an article about noise. Quotes a short snippet
 * so the owner catches a mishearing in seconds. No draft is charged for this turn.
 */
export function lowConfidenceEcho(transcript: string): string {
  const clean = transcript.trim().replace(/\s+/g, ' ')
  const snippet = clean.slice(0, 90)
  return (
    `T’he sentit a mitges 😅 He entès una cosa com «${snippet}${clean.length > 90 ? '…' : ''}». ` +
    'Si és això, confirma-m’ho; si no, explica-m’ho amb una frase o reenvia’m l’àudio des d’un lloc més tranquil i m’hi poso.'
  )
}
