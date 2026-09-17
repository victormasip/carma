// ARQUETIPS — blogs que arriben MUNTATS.
//
// A `BLOG_TEMPLATES` hi ha vuit identitats: colors, lletra, capçalera, peu. Són
// la pell. El que no hi havia enlloc era el COS: una plantilla s'aplicava i el
// blog seguia sense cercador, sense comentaris, sense newsletter — vuit skins
// damunt del mateix blog buit. `BlogTemplate.modules` només porta una llista
// d'ids, o sigui "engega'ls amb la variant per defecte", que per a la meitat dels
// mòduls no és la que els fa lluir.
//
// Un ARQUETIP és una plantilla MÉS una configuració completa de mòduls: variants
// triades, opcions escrites, textos en català. Tres, un per esglaó de preu, i
// cadascun és una decisió editorial, no un catàleg:
//
//   · L'ESSENCIAL (gratis)  — que es llegeixi bé i es trobi. Res més.
//   · LA REVISTA (premium)  — que hi hagi gent a dins: comentaris, aplaudiments,
//                             articles relacionats. Una publicació amb veu.
//   · EL CREADOR (or)       — que converteixi: newsletter, mur de pagament,
//                             anunci. Un negoci, no un diari personal.
//
// EL SOSTRE DE PLA NO ES DECIDEIX AQUÍ. Un arquetip declara el que vol engegar;
// `applyArchetype` (lib/actions/modules.ts) filtra pel pla real del compte amb
// `moduleAllowedForPlan`, i el servidor sanititza igualment. Un free que tria
// La Revista s'emporta tot el que el seu pla permet i veu la resta amb cadenat,
// que és molt millor que no poder-la ni mirar.

import { BLOG_TEMPLATES, getTemplate, type BlogTemplate } from '@/lib/render/templates'
import {
  MODULES, moduleAllowedForPlan, type ModuleTier, type SiteModules,
} from '@/lib/modules/registry'

export type Archetype = {
  id: 'essencial' | 'revista' | 'creador'
  /** El nom que veu la persona. Igual en tots els idiomes: és un nom propi. */
  name: string
  /** El pla mínim on l'arquetip arriba SENCER. */
  tier: ModuleTier
  /** La identitat visual de BLOG_TEMPLATES sobre la qual es munta. */
  templateId: string
  /** Una línia. El que la gent ha de recordar. */
  tagline: string
  /** La configuració completa: variants i opcions, no només ids. */
  modules: SiteModules
  /** Els tres mòduls que el defineixen, per a targetes i comparatives. */
  headline: string[]
}

/** Drecera: `on('grid', { count: 4 })` → `{ enabled: true, variant, options }`. */
function on(variant?: string, options?: Record<string, unknown>): SiteModules[string] {
  return { enabled: true, ...(variant ? { variant } : {}), ...(options ? { options } : {}) }
}

// ─── 1. L'Essencial — gratis ──────────────────────────────────────────────────
// La temptació era omplir-lo per fer-lo semblar generós. És l'error: un blog
// gratuït que arriba amb nou mòduls encesos no es llegeix, es navega. Aquí només
// hi ha el que serveix la LECTURA (progrés, següent article, firma) i la
// TROBABILITAT (cerca). Tot de nivell free: s'activa sencer sense pagar res.
const essencial: Archetype = {
  id: 'essencial',
  name: "L'Essencial",
  tier: 'free',
  templateId: 'aperture',
  tagline: 'El mínim que fa que un blog es llegeixi: cerca, progrés de lectura i el següent article sempre a mà.',
  headline: ['search', 'readingProgress', 'prevNext'],
  modules: {
    search: on('bar'),
    readingProgress: on('bar', { position: 'top' }),
    prevNext: on('minimal'),
    authorCard: on('byline'),
    backToTop: on('minimal', { position: 'right' }),
    socialShare: on('inline', { networks: ['whatsapp', 'x', 'linkedin', 'copy'] }),
    whatsappShare: on('end'),
  },
}

// ─── 2. La Revista — premium ──────────────────────────────────────────────────
// L'esglaó on el blog deixa de ser un monòleg. Comentaris verificats i
// aplaudiments són el gruix del que es paga; la resta (destacats, filtres,
// relacionats, índex) és el que fa que sembli una redacció i no una llista.
// Serif de display via la plantilla `editorial` (Fraunces).
const revista: Archetype = {
  id: 'revista',
  name: 'La Revista',
  tier: 'premium',
  templateId: 'editorial',
  tagline: 'Una publicació amb lectors a dins: comentaris verificats, aplaudiments i articles relacionats triats sols.',
  headline: ['relatedPosts', 'comments', 'likes'],
  modules: {
    featuredHero: on('magazine'),
    categoryFilters: on('tabs'),
    search: on('expand'),
    tableOfContents: on('sidebar', { depth: 'h2h3' }),
    pullQuote: on('side', { count: 2, minChars: 80 }),
    relatedPosts: on('grid', { count: 3, matchBy: 'smart' }),
    comments: on('threaded', {
      title: 'La conversa',
      placeholder: 'Què t’ha semblat?',
      buttonText: 'Publicar',
      requireApproval: true,
      emptyMessage: 'Encara no hi ha comentaris. Comença tu la conversa.',
      closedMessage: '✓ Rebut. El publicarem quan l’hàgim llegit.',
    }),
    likes: on('clap', { label: 'Aplaudeix', showCount: true, maxPerReader: 10 }),
    authorCard: on('box'),
    socialShare: on('floating', { networks: ['whatsapp', 'x', 'linkedin', 'facebook', 'copy'] }),
    prevNext: on('cards'),
  },
}

// ─── 3. El Creador — or ───────────────────────────────────────────────────────
// Aquí el blog és un embut. Newsletter a cada article, mur de pagament amb
// desbloqueig per correu (el model Substack: el correu ÉS el preu), barra
// d'anuncis per al que toqui aquesta setmana. Conserva comentaris i
// aplaudiments perquè una audiència que no pot respondre no es converteix.
//
// `previewBlocks: 4` no és arbitrari: menys de tres paràgrafs i el lector no ha
// entrat encara a l'article, així que el mur talla abans de convèncer ningú.
const creador: Archetype = {
  id: 'creador',
  name: 'El Creador',
  tier: 'gold',
  templateId: 'carma',
  tagline: 'El blog com a negoci: captació de subscriptors a cada article i contingut premium darrere del mur.',
  headline: ['newsletter', 'paywall', 'announcementBar'],
  modules: {
    announcementBar: on('gradient', {
      text: '🎉 Nou aquesta setmana',
      linkText: 'Mira-ho',
      position: 'top',
      dismissible: true,
    }),
    featuredHero: on('split'),
    newsletter: on('banner', {
      title: 'Rep-ho abans que ningú',
      description: 'Un correu quan surt alguna cosa que val la pena. Res més.',
      buttonText: 'Apunta-m’hi',
      successMessage: '✓ Ja hi ets. Gràcies!',
    }),
    paywall: on('gradient', {
      previewBlocks: 4,
      title: 'Continua llegint',
      message: 'La resta d’aquest article és per a subscriptors. Deixa el teu correu i el desbloquegem a l’instant.',
      buttonText: 'Desbloquejar-lo',
      unlockWithEmail: true,
    }),
    keyTakeaways: on('card'),
    likes: on('heart', { showCount: true, maxPerReader: 1 }),
    comments: on('compact', { title: 'Comentaris', requireApproval: true }),
    relatedPosts: on('list', { count: 4, matchBy: 'smart' }),
    readNext: on('card'),
    socialShare: on('inline', { networks: ['whatsapp', 'x', 'linkedin', 'copy'] }),
    whatsappShare: on('float'),
    readingProgress: on('both'),
  },
}

export const ARCHETYPES: readonly Archetype[] = [essencial, revista, creador]

export function getArchetype(id: string): Archetype | undefined {
  return ARCHETYPES.find(a => a.id === id)
}

/**
 * The archetype a starter LOOK is the skin of, if any.
 *
 * This is what stops "naked templates": applying Editorial no longer just paints
 * the page and switches seven modules on at their default variants — it applies
 * La Revista, with the variants and the written copy the archetype declares.
 * Looks without an archetype keep the old merge-only behaviour.
 */
export function archetypeForTemplate(templateId: string): Archetype | undefined {
  return ARCHETYPES.find(a => a.templateId === templateId)
}

/** The look an archetype dresses itself in. */
export function archetypeTemplate(a: Archetype): BlogTemplate | undefined {
  return getTemplate(a.templateId) ?? BLOG_TEMPLATES[0]
}

/**
 * The module config this archetype can actually switch on for `plan`.
 *
 * Nothing is silently dropped for the user's benefit: `blocked` names what the
 * plan withheld, so the UI can say "three more with Premium" instead of applying
 * a preset that quietly arrives half-built.
 */
export function archetypeModulesForPlan(
  a: Archetype,
  plan: ModuleTier,
): { modules: SiteModules; blocked: string[] } {
  const modules: SiteModules = {}
  const blocked: string[] = []
  for (const [id, cfg] of Object.entries(a.modules)) {
    const def = MODULES.find(m => m.id === id)
    if (!def) continue
    if (moduleAllowedForPlan(def, plan)) modules[id] = cfg
    else blocked.push(id)
  }
  return { modules, blocked }
}

/** How many of this archetype's modules a plan unlocks — for the tier cards. */
export function archetypeUnlockedCount(a: Archetype, plan: ModuleTier): number {
  return Object.keys(archetypeModulesForPlan(a, plan).modules).length
}
