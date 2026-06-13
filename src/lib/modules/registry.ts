// Smart Modules — the single, extensible catalogue shared by the dashboard
// control panel ("Mòduls" tab) and the public render engine.
//
// DESIGN
// ──────
// Everything a module needs to be *offered*, *configured* and *rendered* is
// declared here, in ONE client-safe file (type-only imports, no server deps), so
// the dashboard and the server renderer agree on exactly the same contract.
//
// Adding a brand-new module = append one entry to MODULES. No DB migration (the
// config lives in the free-form `site_themes.modules` JSONB — see migration 024)
// and no change to the dashboard UI (it renders generically from this catalogue).
//
// V2: a module's config is a deep nested object — `{ enabled, variant, options }`
// where `options` carries rich, typed settings (text, toggle, number, range,
// select, multiselect, color, plus `group` separators). A module the user hasn't
// touched falls back to the registry defaults, and a site with NO module config
// renders exactly as before (every module ships `defaultEnabled: false`), so the
// feature is purely additive.

export type ModuleScope = 'listing' | 'article' | 'both'

// Bento sections in the dashboard, in display order.
export type ModuleCategory = 'discovery' | 'engagement' | 'reading' | 'growth'

export const CATEGORY_META: Record<ModuleCategory, { label: string; description: string }> = {
  discovery:  { label: 'Descoberta',   description: 'Ajuda els lectors a trobar contingut' },
  engagement: { label: 'Interacció',   description: 'Manté els lectors al teu blog' },
  reading:    { label: 'Lectura',      description: "Millora l'experiència de l'article" },
  growth:     { label: 'Creixement',   description: 'Captura, monetitza i fes créixer' },
}

export type ModuleOptionType =
  | 'toggle' | 'text' | 'textarea' | 'number' | 'range'
  | 'select' | 'multiselect' | 'color' | 'group'

export type ModuleOption = {
  key: string
  label: string
  type: ModuleOptionType
  default: string | number | boolean | string[]
  placeholder?: string
  help?: string
  min?: number
  max?: number
  step?: number
  unit?: string
  /** For 'select' / 'multiselect'. */
  choices?: { value: string; label: string }[]
  /** Only show this option when another option key is truthy. */
  showIf?: string
}

export type ModuleVariant = {
  id: string
  name: string
  description: string
}

export type ModuleDef = {
  id: string
  name: string
  /** Short pitch shown on the bento card. */
  description: string
  /** lucide-react icon name; mapped to a component in the dashboard. */
  icon: string
  category: ModuleCategory
  /** Where the module renders. */
  scope: ModuleScope
  premium: boolean
  /** Flagged as AI-powered in the UI (e.g. related posts). */
  ai?: boolean
  /** Layout variations. Always at least one. */
  variants: ModuleVariant[]
  defaultVariant: string
  options?: ModuleOption[]
  defaultEnabled: boolean
}

// ─── Reusable option fragments ────────────────────────────────────────────────

const POS_CHOICES = [
  { value: 'left', label: 'Esquerra' },
  { value: 'right', label: 'Dreta' },
]

// ─── The catalogue ────────────────────────────────────────────────────────────

export const MODULES: ModuleDef[] = [
  // ── Discovery ──────────────────────────────────────────────────────────────
  {
    id: 'search',
    name: 'Cerca global',
    description: 'Un cercador que filtra els articles del feed a l’instant.',
    icon: 'Search',
    category: 'discovery',
    scope: 'listing',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'bar',
    variants: [
      { id: 'bar', name: 'Barra', description: 'Camp de cerca ample sobre el feed' },
      { id: 'expand', name: 'Icona expansible', description: 'Una icona que s’obre en clicar' },
      { id: 'command', name: 'Paleta (⌘K)', description: 'Superposició central tipus command palette' },
    ],
    options: [
      { key: 'placeholder', label: 'Text del camp', type: 'text', default: 'Cerca articles…' },
      { key: 'showCount', label: 'Mostrar nombre de resultats', type: 'toggle', default: true },
    ],
  },
  {
    id: 'categoryFilters',
    name: 'Filtres de categoria',
    description: 'Deixa filtrar el feed per categoria amb un sol clic.',
    icon: 'Filter',
    category: 'discovery',
    scope: 'listing',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'pills',
    variants: [
      { id: 'pills', name: 'Càpsules', description: 'Fila de botons arrodonits' },
      { id: 'tabs', name: 'Pestanyes', description: 'Pestanyes amb subratllat' },
      { id: 'dropdown', name: 'Desplegable', description: 'Un selector compacte' },
    ],
    options: [
      { key: 'allLabel', label: 'Etiqueta «Totes»', type: 'text', default: 'Totes' },
      { key: 'showCounts', label: 'Mostrar el recompte per categoria', type: 'toggle', default: false },
      { key: 'sticky', label: 'Barra adherida en fer scroll', type: 'toggle', default: false },
    ],
  },
  {
    id: 'featuredHero',
    name: 'Hero d’articles destacats',
    description: 'Destaca els articles més recents en una secció protagonista.',
    icon: 'Star',
    category: 'discovery',
    scope: 'listing',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'spotlight',
    variants: [
      { id: 'spotlight', name: 'Spotlight', description: 'Un article gran a tota amplada' },
      { id: 'split', name: 'Split', description: '1 destacat gran + petits al costat' },
      { id: 'magazine', name: 'Magazine', description: 'Graella editorial de destacats' },
    ],
    options: [
      { key: 'heading', label: 'Títol de la secció', type: 'text', default: '', placeholder: 'p. ex. Destacats (opcional)' },
      { key: 'count', label: 'Nombre de destacats', type: 'range', default: 3, min: 1, max: 5, help: 'S’aplica a Split i Magazine.' },
      { key: 'showExcerpt', label: 'Mostrar resum', type: 'toggle', default: true },
    ],
  },

  // ── Engagement ───────────────────────────────────────────────────────────────
  {
    id: 'relatedPosts',
    name: 'Articles relacionats',
    description: 'Recomana articles afins al final de cada article amb IA.',
    icon: 'Sparkles',
    category: 'engagement',
    scope: 'article',
    premium: true,
    ai: true,
    defaultEnabled: false,
    defaultVariant: 'grid',
    variants: [
      { id: 'grid', name: 'Graella', description: 'Targetes en graella' },
      { id: 'list', name: 'Llista', description: 'Llista compacta amb miniatura' },
      { id: 'carousel', name: 'Carrusel', description: 'Lliscable horitzontalment' },
    ],
    options: [
      { key: 'heading', label: 'Títol de la secció', type: 'text', default: 'Continua llegint' },
      { key: 'count', label: 'Quantitat', type: 'range', default: 3, min: 2, max: 6 },
      { key: 'matchBy', label: 'Criteri de relació', type: 'select', default: 'smart', choices: [
        { value: 'smart', label: 'IA (etiquetes + categories)' },
        { value: 'tags', label: 'Etiquetes' },
        { value: 'categories', label: 'Categories' },
      ] },
      { key: 'showImage', label: 'Mostrar imatges', type: 'toggle', default: true },
    ],
  },
  {
    id: 'prevNext',
    name: 'Article anterior / següent',
    description: 'Navegació entre articles consecutius al final de la lectura.',
    icon: 'ArrowLeftRight',
    category: 'engagement',
    scope: 'article',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'cards',
    variants: [
      { id: 'cards', name: 'Targetes', description: 'Dues targetes anterior/següent' },
      { id: 'bar', name: 'Barra', description: 'Barra inferior compacta' },
      { id: 'minimal', name: 'Mínim', description: 'Només enllaços de text' },
    ],
    options: [
      { key: 'showImage', label: 'Mostrar miniatures', type: 'toggle', default: false },
    ],
  },
  {
    id: 'socialShare',
    name: 'Compartir a xarxes',
    description: 'Botons per compartir l’article a les xarxes socials.',
    icon: 'Share2',
    category: 'engagement',
    scope: 'article',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'inline',
    variants: [
      { id: 'inline', name: 'En línia', description: 'Fila de botons sota el títol' },
      { id: 'floating', name: 'Flotant', description: 'Barra vertical adherida al lateral' },
      { id: 'top', name: 'A dalt', description: 'Compacta, a la capçalera de l’article' },
    ],
    options: [
      { key: 'networks', label: 'Xarxes', type: 'multiselect', default: ['x', 'facebook', 'linkedin', 'copy'], choices: [
        { value: 'x', label: 'X' },
        { value: 'facebook', label: 'Facebook' },
        { value: 'linkedin', label: 'LinkedIn' },
        { value: 'whatsapp', label: 'WhatsApp' },
        { value: 'telegram', label: 'Telegram' },
        { value: 'email', label: 'Correu' },
        { value: 'copy', label: 'Copiar enllaç' },
      ] },
      { key: 'showLabel', label: 'Mostrar l’etiqueta «Comparteix»', type: 'toggle', default: true },
    ],
  },
  {
    id: 'backToTop',
    name: 'Tornar a dalt',
    description: 'Un botó que apareix en fer scroll i torna a l’inici.',
    icon: 'ArrowUp',
    category: 'engagement',
    scope: 'both',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'circle',
    variants: [
      { id: 'circle', name: 'Cercle', description: 'Botó circular amb fletxa' },
      { id: 'pill', name: 'Càpsula', description: 'Botó amb text «A dalt»' },
      { id: 'minimal', name: 'Mínim', description: 'Fletxa discreta' },
    ],
    options: [
      { key: 'position', label: 'Posició', type: 'select', default: 'right', choices: POS_CHOICES },
    ],
  },

  // ── Reading ──────────────────────────────────────────────────────────────────
  {
    id: 'readingProgress',
    name: 'Temps i progrés de lectura',
    description: 'Barra de progrés i temps estimat de lectura de l’article.',
    icon: 'BookOpen',
    category: 'reading',
    scope: 'article',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'bar',
    variants: [
      { id: 'bar', name: 'Barra', description: 'Barra de progrés fina' },
      { id: 'badge', name: 'Etiqueta', description: 'Només «X min de lectura»' },
      { id: 'both', name: 'Barra + etiqueta', description: 'Les dues coses' },
      { id: 'circle', name: 'Cercle flotant', description: 'Indicador circular de progrés' },
    ],
    options: [
      { key: 'position', label: 'Posició de la barra', type: 'select', default: 'top', choices: [
        { value: 'top', label: 'A dalt' },
        { value: 'bottom', label: 'A baix' },
      ] },
      { key: 'color', label: 'Color (opcional)', type: 'color', default: '', help: 'Per defecte, el color d’accent de la teva marca.' },
    ],
  },
  {
    id: 'tableOfContents',
    name: 'Índex de continguts',
    description: 'Genera automàticament un índex navegable dels títols.',
    icon: 'ListTree',
    category: 'reading',
    scope: 'article',
    premium: true,
    defaultEnabled: false,
    defaultVariant: 'sidebar',
    variants: [
      { id: 'sidebar', name: 'Lateral adherit', description: 'Columna lateral que segueix l’scroll' },
      { id: 'top', name: 'A dalt plegable', description: 'Bloc plegable abans del contingut' },
      { id: 'floating', name: 'Flotant', description: 'Pastilla flotant amb l’índex' },
    ],
    options: [
      { key: 'heading', label: 'Títol', type: 'text', default: 'En aquesta pàgina' },
      { key: 'depth', label: 'Profunditat', type: 'select', default: 'h2h3', choices: [
        { value: 'h2', label: 'Només H2' },
        { value: 'h2h3', label: 'H2 i H3' },
      ] },
      { key: 'numbered', label: 'Numerat', type: 'toggle', default: false },
    ],
  },
  {
    id: 'authorCard',
    name: 'Targeta d’autor',
    description: 'Mostra l’autor de l’article amb avatar i biografia.',
    icon: 'UserCircle',
    category: 'reading',
    scope: 'article',
    premium: false,
    defaultEnabled: false,
    defaultVariant: 'box',
    variants: [
      { id: 'box', name: 'Caixa', description: 'Targeta destacada al final' },
      { id: 'byline', name: 'Signatura', description: 'Fila compacta sota el títol' },
      { id: 'inline', name: 'En línia', description: 'Avatar + nom minimalista' },
    ],
    options: [
      { key: 'role', label: 'Càrrec / rol', type: 'text', default: '', placeholder: 'p. ex. Editora' },
      { key: 'bio', label: 'Biografia per defecte', type: 'textarea', default: '', placeholder: 'Una breu bio (si l’article no en té)' },
      { key: 'avatar', label: 'Avatar per defecte (URL)', type: 'text', default: '', placeholder: 'https://…/avatar.jpg' },
    ],
  },

  // ── Growth ─────────────────────────────────────────────────────────────────
  {
    id: 'newsletter',
    name: 'Newsletter / Captació',
    description: 'Captura correus dels lectors amb un formulari elegant.',
    icon: 'Mail',
    category: 'growth',
    scope: 'both',
    premium: true,
    defaultEnabled: false,
    defaultVariant: 'inline',
    variants: [
      { id: 'inline', name: 'En línia', description: 'Bloc al final de l’article' },
      { id: 'banner', name: 'Bàner', description: 'Franja ampla destacada' },
      { id: 'card', name: 'Targeta al feed', description: 'Al final del feed' },
      { id: 'footer', name: 'Peu', description: 'Discret, al final de la pàgina' },
    ],
    options: [
      { key: 'title', label: 'Títol', type: 'text', default: 'Subscriu-te a la newsletter' },
      { key: 'description', label: 'Descripció', type: 'textarea', default: 'Rep els nous articles directament al teu correu. Sense spam.' },
      { key: 'buttonText', label: 'Text del botó', type: 'text', default: 'Subscriure’m' },
      { key: 'placeholder', label: 'Placeholder del camp', type: 'text', default: 'El teu correu electrònic' },
      { key: 'consent', label: 'Text de consentiment (petit)', type: 'text', default: '', placeholder: 'En subscriure’t acceptes…' },
      { key: 'successMessage', label: 'Missatge d’èxit', type: 'text', default: '✓ Subscripció confirmada!' },
      { key: 'accent', label: 'Color del botó (opcional)', type: 'color', default: '' },
    ],
  },
  {
    id: 'paywall',
    name: 'Paywall / Contingut bloquejat',
    description: 'Bloqueja la resta de l’article darrere d’un mur estil Substack.',
    icon: 'Lock',
    category: 'growth',
    scope: 'article',
    premium: true,
    defaultEnabled: false,
    defaultVariant: 'gradient',
    variants: [
      { id: 'gradient', name: 'Esvaït', description: 'El text s’esvaeix sota un degradat' },
      { id: 'blur', name: 'Difuminat', description: 'Un mur amb fons difuminat' },
      { id: 'hard', name: 'Tall net', description: 'Tall sec amb el mur a sota' },
    ],
    options: [
      { key: 'previewBlocks', label: 'Paràgrafs visibles (vista prèvia)', type: 'range', default: 3, min: 1, max: 12, help: 'Quants blocs es mostren abans del mur.' },
      { key: 'title', label: 'Títol del mur', type: 'text', default: 'Continua llegint' },
      { key: 'message', label: 'Missatge', type: 'textarea', default: 'Aquest article és per a subscriptors. Subscriu-te gratis per llegir-lo sencer.' },
      { key: 'buttonText', label: 'Text del botó', type: 'text', default: 'Desbloquejar l’article' },
      { key: 'unlockWithEmail', label: 'Desbloquejar amb el correu (estil Substack)', type: 'toggle', default: true, help: 'El lector deixa el correu i es desbloqueja el contingut.' },
    ],
  },
  {
    id: 'announcementBar',
    name: 'Barra d’anuncis',
    description: 'Una franja per a promocions, avisos o novetats.',
    icon: 'Megaphone',
    category: 'growth',
    scope: 'both',
    premium: true,
    defaultEnabled: false,
    defaultVariant: 'gradient',
    variants: [
      { id: 'gradient', name: 'Degradat', description: 'Franja amb degradat de marca' },
      { id: 'solid', name: 'Sòlid', description: 'Color de marca pla' },
      { id: 'minimal', name: 'Mínim', description: 'Subtil, amb vora' },
    ],
    options: [
      { key: 'text', label: 'Text', type: 'text', default: '🎉 Tenim novetats!', placeholder: 'El teu missatge' },
      { key: 'linkText', label: 'Text de l’enllaç', type: 'text', default: 'Saber-ne més' },
      { key: 'linkUrl', label: 'URL de l’enllaç', type: 'text', default: '', placeholder: 'https://…' },
      { key: 'position', label: 'Posició', type: 'select', default: 'top', choices: [
        { value: 'top', label: 'A dalt' },
        { value: 'bottom', label: 'A baix (adherida)' },
      ] },
      { key: 'background', label: 'Color de fons (opcional)', type: 'color', default: '' },
      { key: 'dismissible', label: 'Es pot tancar', type: 'toggle', default: true },
    ],
  },
  {
    id: 'darkModeToggle',
    name: 'Mode fosc',
    description: 'Un selector perquè el lector triï tema clar o fosc.',
    icon: 'MoonStar',
    category: 'growth',
    scope: 'both',
    premium: true,
    defaultEnabled: false,
    defaultVariant: 'icon',
    variants: [
      { id: 'icon', name: 'Icona', description: 'Botó d’icona sol/lluna' },
      { id: 'switch', name: 'Interruptor', description: 'Un switch clar/fosc' },
    ],
    options: [
      { key: 'position', label: 'Posició', type: 'select', default: 'left', choices: POS_CHOICES },
      { key: 'default', label: 'Tema per defecte', type: 'select', default: 'light', choices: [
        { value: 'light', label: 'Clar' },
        { value: 'dark', label: 'Fosc' },
        { value: 'system', label: 'Segons el sistema' },
      ] },
    ],
  },
]

// ─── Config shape (stored in site_themes.modules JSONB) ───────────────────────

export type ModuleConfig = {
  enabled: boolean
  variant?: string
  options?: Record<string, unknown>
}

export type SiteModules = Record<string, ModuleConfig>

export type ResolvedModule = {
  def: ModuleDef
  enabled: boolean
  variant: string
  options: Record<string, unknown>
}

const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map(m => [m.id, m]))

export function getModuleDef(id: string): ModuleDef | undefined {
  return MODULE_BY_ID[id]
}

/** Default options object for a module (every value-bearing option's `default`). */
export function defaultOptions(def: ModuleDef): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const o of def.options ?? []) {
    if (o.type === 'group') continue
    out[o.key] = Array.isArray(o.default) ? [...o.default] : o.default
  }
  return out
}

/**
 * Resolve a module's effective config = stored config merged over registry
 * defaults. A variant the registry no longer offers falls back to the default
 * variant, so renaming/removing a variant can never produce a broken layout.
 */
export function resolveModule(modules: SiteModules | null | undefined, id: string): ResolvedModule | null {
  const def = MODULE_BY_ID[id]
  if (!def) return null
  const cfg = modules?.[id]
  const variant = def.variants.some(v => v.id === cfg?.variant) ? cfg!.variant! : def.defaultVariant
  return {
    def,
    enabled: cfg?.enabled ?? def.defaultEnabled,
    variant,
    options: { ...defaultOptions(def), ...(cfg?.options ?? {}) },
  }
}

/** True when a module is switched on for this site. */
export function isModuleOn(modules: SiteModules | null | undefined, id: string): boolean {
  return resolveModule(modules, id)?.enabled ?? false
}

// Typed option readers (defensive against hand-edited JSON).
export function optStr(opts: Record<string, unknown>, key: string, fallback = ''): string {
  const v = opts[key]
  return typeof v === 'string' ? v : fallback
}
export function optBool(opts: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = opts[key]
  return typeof v === 'boolean' ? v : fallback
}
export function optNum(opts: Record<string, unknown>, key: string, fallback = 0): number {
  const v = opts[key]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}
export function optArr(opts: Record<string, unknown>, key: string, fallback: string[] = []): string[] {
  const v = opts[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback
}
