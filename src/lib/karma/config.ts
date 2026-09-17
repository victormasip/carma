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
  | 'peer_review'        // I6 — demanar que un company et validi l'esborrany
  | 'site_clone'         // (històric al ledger) — la clonació ara és GRATIS

// ─── El cost real, mesurat (2026-09-16) ───────────────────────────────────────
// Preus d'API vigents, model gpt-4o-mini (WA_ROUTER_MODEL) i gpt-image-1 a
// qualitat 'low' 1536x1024 (el que fa servir lib/whatsapp/coverImage.ts):
//
//   esborrany (2.000 in + 1.600 out)   $0,00126
//   revisió   (2.500 in + 1.600 out)   $0,00134
//   torn de conversa (800 in + 200 out) $0,00024
//   nota de veu de 30s (Whisper)       $0,00300
//   PORTADA (gpt-image-1 low)          $0,01600   <- el 74% del cost d'un article
//   síntesi del glimpse                $0,00096
//   distil·lació de marca              $0,00228
//
//   ARTICLE IL·LUSTRAT SENCER          $0,0216  ≈ €0,020
//   ARTICLE NOMÉS TEXT                 $0,0056  ≈ €0,005
//
// TRES CONCLUSIONS QUE CANVIEN DECISIONS:
//
//   1. LA IMATGE ÉS EL COST. El text és pràcticament gratis; la portada és el
//      74% de la factura d'un article. El pes en punts no ho reflectia (25 de
//      125 = 20%), així que la portada puja a 40. L'àncora "1 article = 100
//      punts" es manté intacta: només canvia el que val posar-hi foto.
//   2. STRIPE COSTA MÉS QUE LA IA. A 19 €, la comissió és ~0,80 € i l'API
//      ~0,08 €: la passarel·la de pagament costa DEU vegades la inferència. Cap
//      decisió de producte s'hauria de prendre per estalviar tokens.
//   3. LA CONVERSA HA DE SER GRATIS. Un torn val $0,00024. Cobrar-lo posava un
//      comptador a l'única cosa màgica del producte. agent_chat passa a 0.
//
// Marge brut a ple ús, després d'API i Stripe: Premium ~95%, Or ~96%,
// Agència ~96%. El límit de punts existeix per frenar abús i per fer llegible
// l'escala, no per protegir un marge que no està en risc.
// Desglossament complet: docs/plans/2026-09-16-modules-and-pricing-strategy.md

export const KARMA_COSTS: Record<KarmaAction, number> = {
  article_draft: 80,
  article_revision: 20,
  // GRATIS (directiva del fundador, 2026-09-16: "free whatsapps al principi
  // guest si"). Un torn costa $0,00024 i és l'única cosa del producte que fa
  // màgia. Posar-hi comptador era cobrar per parlar amb la Carma.
  agent_chat: 0,
  voice_note: 2,
  // 25 -> 40: la portada és el 74% del cost real d'un article i només era el
  // 20% del seu preu en punts. Un article il·lustrat val 140; un de text, 100.
  cover_image: 40,
  // I6 — VALIDACIÓ. L'únic cost d'aquesta línia no és API: és ATENCIÓ HUMANA.
  // L'autor paga 10 i el revisor en guanya 25; la diferència la posa Carma, i és
  // deliberada — el bucle ha de ser rendible per a qui LLEGEIX, perquè llegir és
  // la part que ningú fa espontàniament. Pla: docs/plans/2026-09-16-landing-and-
  // community-vision.md §6.5.
  peer_review: 10,
  // Directiva 2026-07-06: clonar no gasta punts MAI (el 402 aquí trencava el
  // funnel). El fre premium de les re-captures és la quota de regeneració
  // (migració 023). La clau es conserva per llegir el ledger antic.
  site_clone: 0,
}

// ─── Límits de llocs per pla (multi-site) ─────────────────────────────────────
// El free té UN blog; els plans de pagament n'obren més (Agència = dotzenes).
// L'aplica provisionOnboardingSite al servidor i el SiteSwitcher a la UI.
export const SITE_LIMITS: Record<KarmaPlan, number> = {
  free: 1,
  premium: 3,
  gold: 10,
  agency: 100,
}

// Quan runAgent respon amb una PREGUNTA (clarify) en lloc d'un esborrany, el
// torn es cobra com a esborrany (80) i es retorna la diferència fins a deixar
// el torn a 5 punts nets — atòmic i mai negatiu.
export const KARMA_CLARIFY_NET = 5

export type KarmaPlan = 'free' | 'premium' | 'gold' | 'agency'

/** Mirall de public.karma_allocation() — la font de veritat runtime és la BD. */
export const KARMA_ALLOCATIONS: Record<KarmaPlan, number> = {
  free: 100,
  premium: 500,
  gold: 1800,
  agency: 6500,
}

// ─── Sostre del que es pot GUANYAR amb la comunitat, per pla i mes ───────────
// Els punts que es guanyen llegint i comentant no costen res a Carma (són
// atenció humana, no inferència), però sense sostre un lector decidit encunya
// 450 punts al mes d'articles reals. El sostre manté el bucle generós — un
// usuari free que participa gairebé duplica el que pot publicar — i solvent.
// Pla d'interacció: docs/plans/2026-09-16-landing-and-community-vision.md §6.4
export const KARMA_COMMUNITY_CAP: Record<KarmaPlan, number> = {
  free: 150,
  premium: 500,
  gold: 900,
  agency: 2000,
}

// ─── Reptes (recompenses d'un sol cop, reclamables a /dashboard/karma) ────────
export type KarmaRewardKey =
  | 'benvinguda'
  | 'primer_article'
  | 'whatsapp_connectat'
  | 'estudi_fet'
  | 'primer_modul'
  | 'aparador'

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
  // COMMUNITY WAVE 2. 40 punts és car per a una casella, i és el preu correcte:
  // no estem pagant un clic, estem comprant prova social de veritat amb la nostra
  // pròpia moneda (pla 2026-09-16 §6.6). Un sol cop per compte — la clau de
  // dedupe `reward:aparador` és per usuari, així que tenir deu blogs no en paga deu.
  {
    key: 'aparador',
    amount: 40,
    title: 'Surt a l’aparador',
    description: 'Deixa que el teu blog aparegui al mur «Fet amb Carma» de la portada. Tu decideixes, i pots fer-te enrere quan vulguis.',
    ctaHref: '/dashboard/settings',
    ctaLabel: 'Obre la configuració',
  },
]

// ─── Etiquetes humanes per al llibre de moviments ─────────────────────────────
export const KARMA_ACTION_LABELS: Record<string, string> = {
  article_draft: 'Esborrany d’article',
  article_revision: 'Revisió d’article',
  agent_chat: 'Conversa amb l’agent',
  voice_note: 'Nota de veu (transcripció)',
  cover_image: 'Imatge de portada',
  peer_review: 'Validació d’un esborrany (I6)',
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
