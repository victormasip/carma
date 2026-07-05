// Punts de Carma — l'economia en un sol lloc (isomorphic: costos i reptes els
// llegeixen tant els servidors com la UI del dashboard).
//
// Disseny aprovat: docs/plans/2026-07-05-punts-de-carma.md. L'àncora és
// "1 article tot inclòs = 100 punts" (esborrany 80 + una revisió 20); la resta
// de pesos deriven del cost real d'API de cada operació. Les assignacions per
// pla viuen TAMBÉ a la BD (karma_allocation, migració 028) perquè la renovació
// mensual passa dins la transacció bloquejada — aquest fitxer és el mirall que
// la UI mostra. Si canvies un número, canvia'l als dos llocs.

export type KarmaAction =
  | 'article_draft'      // runAgent → esborrany complet (WA o consola)
  | 'article_revision'   // runAgent → revisió d'un esborrany pendent
  | 'agent_chat'         // torn de conversa del router de WhatsApp
  | 'voice_note'         // transcripció Whisper d'una nota de veu
  | 'cover_image'        // imatge de portada (nano-banana / DALL·E)
  | 'site_clone'         // captura/clonació del grabber (re-captures)

export const KARMA_COSTS: Record<KarmaAction, number> = {
  article_draft: 80,
  article_revision: 20,
  agent_chat: 1,
  voice_note: 2,
  cover_image: 25,
  site_clone: 40,
}

// Quan runAgent respon amb una PREGUNTA (clarify) en lloc d'un esborrany, el
// torn es cobra com a esborrany (80) i es retorna la diferència fins a deixar
// el torn a 5 punts nets — atòmic i mai negatiu.
export const KARMA_CLARIFY_NET = 5

export type KarmaPlan = 'free' | 'premium' | 'gold' | 'agency'

/** Mirall de public.karma_allocation() — la font de veritat runtime és la BD. */
export const KARMA_ALLOCATIONS: Record<KarmaPlan, number> = {
  free: 100,
  premium: 400,
  gold: 800,
  agency: 2500,
}

// ─── Reptes (recompenses d'un sol cop, reclamables a /dashboard/karma) ────────
export type KarmaRewardKey =
  | 'benvinguda'
  | 'primer_article'
  | 'whatsapp_connectat'
  | 'estudi_fet'
  | 'primer_modul'

export type KarmaReward = {
  key: KarmaRewardKey
  amount: number
  /** Títol i descripció en català (el cos del dashboard és ca-first). */
  title: string
  description: string
  /** On porta el CTA quan el repte encara no es compleix. */
  ctaHref: string
  ctaLabel: string
}

export const KARMA_REWARDS: KarmaReward[] = [
  {
    key: 'benvinguda',
    amount: 25,
    title: 'Benvinguda a Carma',
    description: 'Descobreix els Punts de Carma i reclama el teu regal de benvinguda.',
    ctaHref: '/dashboard/karma',
    ctaLabel: 'Ja hi ets!',
  },
  {
    key: 'primer_article',
    amount: 50,
    title: 'Publica el teu primer article',
    description: 'Estrena el teu blog: publica el primer article (amb l’agent o amb l’editor).',
    ctaHref: '/dashboard/agent',
    ctaLabel: 'Escriu-lo amb l’agent',
  },
  {
    key: 'whatsapp_connectat',
    amount: 75,
    title: 'Connecta WhatsApp',
    description: 'Vincula i verifica el teu número: envia una nota de veu i tindràs l’article fet.',
    ctaHref: '/dashboard/agent',
    ctaLabel: 'Connecta’l',
  },
  {
    key: 'estudi_fet',
    amount: 40,
    title: 'Fes teu l’Estudi',
    description: 'Personalitza el disseny del teu blog des de l’Estudi (colors, fonts, el que vulguis).',
    ctaHref: '/dashboard/studio',
    ctaLabel: 'Obre l’Estudi',
  },
  {
    key: 'primer_modul',
    amount: 30,
    title: 'Activa un mòdul intel·ligent',
    description: 'Cerca, newsletter, articles relacionats… activa el teu primer mòdul.',
    ctaHref: '/dashboard',
    ctaLabel: 'Tria un mòdul',
  },
]

// ─── Etiquetes humanes per al llibre de moviments ─────────────────────────────
export const KARMA_ACTION_LABELS: Record<string, string> = {
  article_draft: 'Esborrany d’article',
  article_revision: 'Revisió d’article',
  agent_chat: 'Conversa amb l’agent',
  voice_note: 'Nota de veu (transcripció)',
  cover_image: 'Imatge de portada',
  site_clone: 'Clonació del web',
  clarify_refund: 'Retorn (l’agent ha preguntat)',
  monthly_refresh: 'Renovació mensual',
  job_failed_refund: 'Retorn (no ha sortit bé)',
}

/** Etiqueta d'un moviment del llibre — les recompenses van amb prefix reward:. */
export function karmaActionLabel(action: string): string {
  if (action.startsWith('reward:')) {
    const key = action.slice('reward:'.length) as KarmaRewardKey
    const reward = KARMA_REWARDS.find((r) => r.key === key)
    return reward ? `Repte: ${reward.title}` : 'Repte completat'
  }
  return KARMA_ACTION_LABELS[action] ?? action
}
