// Theme Grabber Lab — DOM pattern analysis (pure, isomorphic, dependency-free).
//
// Given a chunk of captured chrome HTML (header / footer / head), it surfaces the
// STRUCTURAL fingerprint an operator needs to debug a bad clone at a glance: which
// page-builder framework the markup came from, how deep and how heavy it is, and
// the specific patterns (hashed CSS-in-JS classes, iframes, forests of inline
// styles) that make a site hard to scope and clone cleanly.
//
// Regex-based on purpose: no DOMParser (works server-side + in unit tests), no
// dependency, and it never throws on malformed input — the grabber feeds it the
// messiest HTML on the web.

export type DomFlagSeverity = 'info' | 'warn' | 'risk'

export type DomFlag = { id: string; label: string; severity: DomFlagSeverity; detail: string }

export type DomAnalysis = {
  totalTags: number
  tagCounts: { tag: string; count: number }[]
  classInstances: number
  uniqueClasses: number
  topClasses: { name: string; count: number }[]
  families: { prefix: string; count: number; framework: string | null }[]
  ids: string[]
  resources: {
    scripts: number; styles: number; links: number; images: number
    iframes: number; svgs: number; forms: number; inlineStyles: number; dataAttrs: number
  }
  maxDepth: number
  frameworks: string[]
  flags: DomFlag[]
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

// Class-name family prefix → the page-builder / framework it fingerprints.
const FRAMEWORK_BY_PREFIX: Record<string, string> = {
  elementor: 'Elementor', 'e': 'Elementor',
  et_pb: 'Divi', et: 'Divi',
  wp: 'WordPress', 'wp-block': 'WordPress (Gutenberg)', 'has': 'WordPress',
  jet: 'JetElements', fl: 'Beaver Builder', vc: 'WPBakery', 'wpb': 'WPBakery',
  av: 'Enfold/Avia', x: 'Themeco X', cs: 'Cornerstone',
  fusion: 'Avada', 'so-widget': 'SiteOrigin', brz: 'Brizy', oxy: 'Oxygen', ct: 'Oxygen',
  css: 'CSS-in-JS (emotion)', sc: 'styled-components', mui: 'MUI', 'Mui': 'MUI',
  'framer': 'Framer', 'svelte': 'Svelte', 'astro': 'Astro', swiper: 'Swiper',
}

// A class that looks machine-generated (emotion `css-1ab2c3`, styled `sc-xxxx`,
// CSS-modules `Button_root__x9f2`, Astro `astro-XXXX`) — a strong signal the site
// styles dynamically and won't clone with static token extraction.
const HASHED_CLASS = /^(css-[a-z0-9]{4,}|sc-[a-z0-9]{5,}|[A-Za-z]\w+_[A-Za-z]\w+__[\w-]{4,}|astro-[a-z0-9]{6,}|jsx-\d{6,})$/

function familyOf(cls: string): string {
  const cut = cls.indexOf('-') >= 0 ? cls.indexOf('-') : cls.indexOf('_')
  return cut > 0 ? cls.slice(0, cut) : cls
}

export function analyzeDom(html: string): DomAnalysis {
  const src = html || ''

  // ── tags + approximate nesting depth ──
  const tagCount = new Map<string, number>()
  let total = 0, depth = 0, maxDepth = 0
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(src))) {
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    const selfClose = m[4] === '/' || VOID.has(tag)
    if (closing) { depth = Math.max(0, depth - 1); continue }
    total++
    tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
    if (!selfClose) { depth++; if (depth > maxDepth) maxDepth = depth }
  }
  const tagCounts = [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 14)

  // ── classes ──
  const classCount = new Map<string, number>()
  let classInstances = 0
  const clsRe = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  while ((m = clsRe.exec(src))) {
    const raw = (m[1] ?? m[2] ?? '')
    for (const c of raw.split(/\s+/)) {
      if (!c) continue
      classInstances++
      classCount.set(c, (classCount.get(c) ?? 0) + 1)
    }
  }
  const topClasses = [...classCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12)

  // ── families (framework fingerprint) ──
  const famCount = new Map<string, number>()
  for (const [cls, n] of classCount) famCount.set(familyOf(cls), (famCount.get(familyOf(cls)) ?? 0) + n)
  const families = [...famCount.entries()]
    .map(([prefix, count]) => ({ prefix, count, framework: FRAMEWORK_BY_PREFIX[prefix] ?? null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  const frameworks = [...new Set(families.map(f => f.framework).filter((f): f is string => !!f))]

  // ── ids ──
  const idSet = new Set<string>()
  const idRe = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  while ((m = idRe.exec(src))) { const v = (m[1] ?? m[2] ?? '').trim(); if (v) idSet.add(v) }

  // ── resources ──
  const count = (re: RegExp) => (src.match(re) ?? []).length
  const resources = {
    scripts: count(/<script[\s>]/gi),
    styles: count(/<style[\s>]/gi),
    links: count(/<link[\s>]/gi),
    images: count(/<img[\s>]/gi),
    iframes: count(/<iframe[\s>]/gi),
    svgs: count(/<svg[\s>]/gi),
    forms: count(/<form[\s>]/gi),
    inlineStyles: count(/\sstyle\s*=\s*['"]/gi),
    dataAttrs: count(/\sdata-[\w-]+\s*=/gi),
  }

  // ── hashed / dynamic class detection ──
  const hashed = [...classCount.keys()].filter(c => HASHED_CLASS.test(c)).length

  // ── flags ──
  const flags: DomFlag[] = []
  if (resources.iframes > 0) flags.push({ id: 'iframes', label: `${resources.iframes} iframe(s)`, severity: 'risk', detail: 'Els iframes no es clonen amb el chrome — cal recrear o eliminar-los manualment.' })
  if (hashed > 0) flags.push({ id: 'hashed', label: `${hashed} classes generades`, severity: 'risk', detail: 'Classes tipus emotion/styled/CSS-modules (css-1ab2, sc-…). L’estil és dinàmic i no s’extreu amb tokens estàtics.' })
  if (resources.inlineStyles > 20) flags.push({ id: 'inline', label: `${resources.inlineStyles} estils inline`, severity: 'warn', detail: 'Molts atributs style="" — dificulten l’extracció neta de tokens i poden imposar colors fixos.' })
  if (maxDepth > 22) flags.push({ id: 'depth', label: `Profunditat ${maxDepth}`, severity: 'warn', detail: 'Arbre molt profund (constructor de pàgines). Risc de tallar el límit chrome/contingut al lloc equivocat.' })
  if (resources.scripts > 0) flags.push({ id: 'scripts', label: `${resources.scripts} script(s)`, severity: 'info', detail: 'Scripts al chrome — es conserven per als menús, però revisa que no depenguin d’hidratació.' })
  if (frameworks.length > 0) flags.push({ id: 'fw', label: frameworks.join(' · '), severity: 'info', detail: 'Frameworks detectats per les famílies de classes.' })
  if (total > 0 && flags.length === (frameworks.length > 0 ? 1 : 0)) flags.push({ id: 'clean', label: 'Marcatge net', severity: 'info', detail: 'Sense senyals de risc evidents: poques classes dinàmiques, sense iframes.' })

  return {
    totalTags: total,
    tagCounts,
    classInstances,
    uniqueClasses: classCount.size,
    topClasses,
    families,
    ids: [...idSet].slice(0, 12),
    resources,
    maxDepth,
    frameworks,
    flags,
  }
}
