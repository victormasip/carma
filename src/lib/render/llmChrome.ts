// LLM Reconstruction Engine — the heart of "1-Click Visual Identity Replication".
//
// Instead of transplanting the client's real CSS (which bled, broke structure and
// 404'd assets), we hand Claude the region's raw HTML + the *relevant* slice of
// its real CSS + the extracted design tokens, and ask it to REBUILD each region
// as a pristine, fully self-contained component: clean semantic HTML + a tiny
// dedicated stylesheet whose selectors are namespaced under
// `[data-carma-chrome="…"]`. The output is then run through scopeChromeCss() so
// isolation is guaranteed deterministically, not just by trusting the model.
//
// Model is a single env-overridable constant: set THEME_LLM_MODEL=claude-haiku-4-5
// to trade fidelity for cost.

import Anthropic from '@anthropic-ai/sdk'

// Opus 4.7 gives the most faithful replica (the user confirmed it beat both
// Sonnet and Haiku). Cost is controlled NOT by a cheaper model but by: a single
// combined call (one system prompt + one thinking budget — parallel calls
// doubled both), the payload trimmer, and a tunable effort. Override per-env:
//   THEME_LLM_MODEL   — claude-sonnet-4-6 / claude-haiku-4-5 to cut cost
//   THEME_LLM_EFFORT  — low|medium|high|xhigh|max (lower = cheaper, less thinking)
const MODEL = process.env.THEME_LLM_MODEL || 'claude-opus-4-7'
const EFFORT = (process.env.THEME_LLM_EFFORT || 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type RebuiltRegion = { html: string; css: string }
export type RebuildResult = {
  header: RebuiltRegion | null
  footer: RebuiltRegion | null
}

export type RebuildInput = {
  siteName: string
  baseUrl: string
  tokens: Record<string, string>
  fontFamilies: string[]
  headerHtml: string
  footerHtml: string
  headerCss: string
  footerCss: string
}

// The trimmer already removed the dead weight, so we can afford richer context
// for fidelity without re-bloating the payload.
const REGION_HTML_CAP = 18_000
const REGION_CSS_CAP = 16_000

// ─── Payload trimmer ────────────────────────────────────────────────────────
// Aggressively shrink scraped markup before it hits the model. Scripts/styles/
// iframes carry no visual signal the model needs; SVGs and base64 blobs are
// enormous (the model rebuilds icons as its own inline SVG anyway). This is the
// single biggest lever on input-token cost.

export function trimPayload(html: string): string {
  if (!html) return ''
  return html
    // HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // script / noscript / style / iframe / template (tag + content)
    .replace(/<(script|noscript|style|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<iframe\b[^>]*\/?>/gi, '')
    // Strip only LARGE svgs (decorative illustrations, sprite sheets). Small ones
    // — logos, simple icons — are cheap and carry real brand fidelity, so keep them.
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, m => (m.length > 2000 ? '[icon]' : m))
    // base64 / data: URIs in attributes
    .replace(/\b(src|href|poster|data-src)\s*=\s*"data:[^"]*"/gi, '$1=""')
    .replace(/\b(src|href|poster|data-src)\s*=\s*'data:[^']*'/gi, "$1=''")
    // responsive srcset lists (huge, low value — src remains)
    .replace(/\ssrcset\s*=\s*"[^"]*"/gi, '')
    .replace(/\ssrcset\s*=\s*'[^']*'/gi, '')
    // base64 inside inline style url()
    .replace(/url\(\s*['"]?data:[^)]*\)/gi, 'url()')
    // long data-* attributes (framework state blobs)
    .replace(/\sdata-[\w-]+\s*=\s*"[^"]{40,}"/gi, '')
    .replace(/\sdata-[\w-]+\s*=\s*'[^']{40,}'/gi, '')
    // collapse whitespace
    .replace(/>\s+</g, '><')
    .replace(/[ \t\f\v]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// ─── Region-relevant CSS filter ────────────────────────────────────────────
// Shrinks the site's full CSS to only the rules that plausibly style a region,
// so the model gets real styling signal without us shipping 900KB of cascade.

type Rule = { prelude: string; body: string }

function parseTopRules(css: string): Rule[] {
  const rules: Rule[] = []
  let depth = 0
  let start = 0
  let preludeEnd = -1
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') {
      if (depth === 0) preludeEnd = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && preludeEnd >= 0) {
        rules.push({ prelude: css.slice(start, preludeEnd).trim(), body: css.slice(preludeEnd + 1, i) })
        start = i + 1
        preludeEnd = -1
      }
    }
  }
  return rules
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const REGION_TAGS = [
  'header', 'footer', 'nav', 'ul', 'ol', 'li', 'a', 'img', 'svg', 'button',
  'form', 'input', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'address',
]

function collectNeedles(html: string): RegExp[] {
  const classes = new Set<string>()
  const ids = new Set<string>()
  for (const m of html.matchAll(/class\s*=\s*["']([^"']+)["']/gi)) {
    for (const cls of m[1].split(/\s+/)) if (cls) classes.add(cls)
  }
  for (const m of html.matchAll(/id\s*=\s*["']([^"']+)["']/gi)) {
    if (m[1].trim()) ids.add(m[1].trim())
  }
  const needles: RegExp[] = []
  for (const c of classes) needles.push(new RegExp('\\.' + escapeRe(c) + '(?![\\w-])'))
  for (const id of ids) needles.push(new RegExp('#' + escapeRe(id) + '(?![\\w-])'))
  return needles
}

function selectorHasRegionTag(prelude: string): boolean {
  // Bare type selectors only (e.g. `header`, `nav ul`, `a:hover`) — not `.card a`,
  // which would match almost everything.
  return prelude.split(',').some(sel => {
    const first = sel.trim().split(/[\s>+~]/)[0]?.toLowerCase() ?? ''
    const tag = first.replace(/[:.#\[].*$/, '')
    return REGION_TAGS.includes(tag)
  })
}

function definesCustomProps(body: string): boolean {
  return /(^|[;{])\s*--[\w-]+\s*:/.test(body)
}

const NESTED_ATRULES = new Set(['media', 'supports', 'container', 'layer'])

function filterRules(rules: Rule[], needles: RegExp[]): string[] {
  const kept: string[] = []
  for (const { prelude, body } of rules) {
    if (prelude.startsWith('@')) {
      const kind = prelude.slice(1).match(/^[a-z-]+/i)?.[0]?.toLowerCase() ?? ''
      // @font-face is dropped on purpose: it can embed base64 font files (huge),
      // and the model only needs family NAMES, which it gets from fontFamilies.
      if (NESTED_ATRULES.has(kind)) {
        const inner = filterRules(parseTopRules(body), needles)
        if (inner.length) kept.push(`${prelude}{${inner.join('')}}`)
      }
      continue
    }
    const matched =
      definesCustomProps(body) ||
      selectorHasRegionTag(prelude) ||
      needles.some(re => re.test(prelude))
    if (matched) kept.push(`${prelude}{${body}}`)
  }
  return kept
}

export function filterCssForRegion(fullCss: string, regionHtml: string, cap = REGION_CSS_CAP): string {
  if (!fullCss.trim() || !regionHtml.trim()) return ''
  const needles = collectNeedles(regionHtml)
  const kept = filterRules(parseTopRules(fullCss), needles)
  let out = ''
  for (const rule of kept) {
    if (out.length + rule.length > cap) break
    out += rule + '\n'
  }
  // Drop any base64 blobs that survived inside kept rules.
  return out.replace(/url\(\s*['"]?data:[^)]*\)/gi, 'url()').trim()
}

// ─── The prompt (static → prompt-cached) ───────────────────────────────────

const SYSTEM_PROMPT = `You are a principal front-end engineer specializing in pixel-faithful UI reconstruction. You receive the raw HTML and the relevant CSS of a website's HEADER and/or FOOTER plus its design tokens, and you rebuild each region as a pristine, fully self-contained component that renders identically but is completely isolated from any host page.

You MUST return strict JSON matching the provided schema: an object with "header" and "footer", each { "html": string, "css": string }.

NON-NEGOTIABLE RULES:
1. SCOPING. Every CSS selector you write MUST begin with the region namespace attribute: \`[data-carma-chrome="header"]\` for the header, \`[data-carma-chrome="footer"]\` for the footer. Never emit a bare or global selector (no \`body\`, no \`*\`, no naked \`a{}\`). Example: \`[data-carma-chrome="header"] .cx-nav a{...}\`.
2. WRAPPER. Do NOT include the wrapper element carrying that attribute — the host adds it. Your "html" is what goes INSIDE it. Your root element is a <header>/<footer> (or <div>) with your own prefixed class.
3. PREFIX every class name you create with \`cx-\` (e.g. cx-nav, cx-logo, cx-cols) to avoid clashes.
4. EXPLICIT & SELF-CONTAINED. Assume the wrapper is \`all:initial\` — nothing is inherited. Set every visual property explicitly on your elements: font-family, font-size, font-weight, line-height, color, background, padding, margin, display, flex/grid, gap, border.
5. NO SCRIPTS. No <script>, no inline <style> inside html (all CSS goes in the "css" field), no @import, no external stylesheets. Fonts are already loaded by the host — just reference family names.
6. POSITIONING. Never use position:fixed (it would overlay our content). position:sticky;top:0 is allowed for a HEADER region only. A footer is static. For dropdown panels use position:absolute on the panel and position:relative on its parent <li>/trigger (NOT fixed).
7. ASSETS. Use the absolute image URLs EXACTLY as provided (logos, images). If no usable logo image exists, render the brand name as styled text. Render social/icon graphics as inline SVG using currentColor — never icon fonts or external icon images. Never invent or guess asset URLs.
8. CONTENT FIDELITY. Preserve every navigation link's visible text and its real href exactly. Preserve footer columns, headings, legal text, and copyright. Do not add menu items or links that are not in the source.
8b. LANGUAGE SWITCHER. If the header has a language switcher (links/flags/dropdown pointing to other-language versions of the site), REPRODUCE it faithfully in its native style, BUT: wrap it in a container whose class name includes "lang" (e.g. class="cx-lang-switcher"), and put an \`hreflang\` attribute with the 2-letter locale code on EACH language link (e.g. <a hreflang="en">EN</a>). Carma rewires these links at render time to serve the translated content, so the exact href doesn't matter here — the visible style/markup is what must match. If there is NO language switcher in the source, do not invent one.
9. INTERACTIVE STATES (CSS-only). Faithfully reproduce the source's interactive styling using pure CSS pseudo-classes — there is NO JavaScript. Add :hover AND :focus (and :focus-within where relevant) rules for links and buttons reflecting the source's hover colors/underlines/backgrounds. Add smooth transitions where the source implies them.
10. PURE-CSS DROPDOWNS / SUBMENUS. If the source nav has dropdowns or nested submenus, PRESERVE the nested markup (e.g. a child <ul> inside the <li>). Hide the submenu by default (e.g. opacity:0;visibility:hidden;transform + transition, or display:none) and REVEAL it on BOTH \`<parent-li>:hover\` AND \`<parent-li>:focus-within\` (so it is keyboard-accessible without JS). Position the submenu absolutely under its trigger. Never rely on a JS toggle, aria-expanded flips, or a hamburger that needs a click handler.
11. RESPONSIVE + MOBILE HAMBURGER (CSS-only, NO JavaScript). The header MUST be fully responsive with a real, working hamburger menu on small screens — built entirely with the CSS "checkbox hack" (no JS):
   • Add a hidden checkbox and a label that acts as the hamburger button, e.g.:
       <input type="checkbox" id="cx-nav-toggle" class="cx-nav-toggle" aria-hidden="true">
       <label for="cx-nav-toggle" class="cx-burger" aria-label="Menu"><span></span><span></span><span></span></label>
     Place the checkbox in the DOM as a sibling that PRECEDES the menu (<nav>/<ul>) it controls, so the sibling combinator works.
   • Visually hide the checkbox itself (position:absolute;opacity:0;width:1px;height:1px;pointer-events:none) — do NOT use display:none on the input (the label must still toggle it). The label is the visible button.
   • DESKTOP (default / min-width media query): show the normal horizontal nav, and hide the burger + checkbox (.cx-burger{display:none}).
   • MOBILE (e.g. @media (max-width:768px)): show the burger (.cx-burger{display:flex}); collapse the menu hidden by default; reveal it ONLY when checked, using the SAME namespaced sibling selector you wrote, e.g.:
       [data-carma-chrome="header"] .cx-nav-toggle:checked ~ .cx-menu{display:flex}
     (a max-height/opacity transition is even nicer). The expanded mobile menu should stack vertically full-width. Optionally animate the burger bars into an X on :checked.
   • Submenus/dropdowns: on desktop keep the pure-CSS hover/:focus-within reveal (rule 10); inside the open mobile menu they may expand inline (stacked).
   • The wrapper is all:initial, but that reset applies ONLY to the wrapper element, NOT its descendants — so a native <input type="checkbox"> descendant keeps working. Always make the burger a real, visible, tappable target (min 40×40px).
12. MATCH. Reproduce the colors, spacing, typography, borders and layout implied by the provided CSS and design tokens as closely as possible. Use the design tokens for any value the source CSS leaves unspecified.
13. EMPTY SOURCE. If a region's SOURCE HTML is empty or absent, return "" for both its "html" and "css". Never fabricate a region that was not provided.
14. FIDELITY OVER SIMPLICITY. Reproduce the source faithfully — do not omit links, columns, or elements, and do not "tidy" the layout into something generic. Match the original's spacing, padding, font sizes, font weights, gaps and colors as precisely as the source CSS indicates; when the CSS specifies a value, use that exact value rather than rounding to a convenient one. Preserve the original's proportions and visual rhythm.

FRONTEND QA PASS (do this before returning): Re-read your own output as a senior front-end QA engineer and CORRECT any structural defects so the component is visually flawless and responsive:
 • Every flex/grid container must declare its direction, alignment (align-items / justify-content) and gap explicitly — no relying on inherited or default alignment.
 • Multi-column footers must use display:grid with an explicit grid-template-columns (or flex with wrap + defined basis) and collapse to fewer columns / a single stacked column on mobile via a media query. No columns overflowing or overlapping.
 • Nav rows must align logo and links on a single baseline with correct vertical centering and not overflow horizontally; wrap or shrink on narrow widths.
 • No element may exceed 100% width or cause horizontal scroll; images get max-width:100%;height:auto.
 • Verify the dropdown reveal/hide actually works with the selectors you wrote (the parent that has :hover/:focus-within is the same element that contains the submenu).
 • Verify the mobile hamburger actually works: the checkbox PRECEDES the menu as a sibling, the reveal selector matches (#cx-nav-toggle:checked ~ .cx-menu), the burger is hidden on desktop and shown on mobile, and the menu is hidden on mobile until checked. The header must never overflow horizontally on a 360px-wide screen.
 Fix these directly in the html/css you emit.

Quality bar: the result must look like a hand-built, production-grade replica — clean, semantic, accessible, responsive, and visually faithful, with working CSS-only hover and dropdown interactions. Output ONLY the JSON object.`

const REGION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { html: { type: 'string' }, css: { type: 'string' } },
  required: ['html', 'css'],
} as const

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { header: REGION_SCHEMA, footer: REGION_SCHEMA },
  required: ['header', 'footer'],
} as const

function buildUserMessage(input: RebuildInput): string {
  const header = input.headerHtml.trim()
  const footer = input.footerHtml.trim()
  const parts: string[] = [
    `BRAND / SITE NAME: ${input.siteName || '(unknown)'}`,
    `SOURCE BASE URL: ${input.baseUrl}`,
    ``,
    `DESIGN TOKENS (use these for any value the CSS leaves unspecified):`,
    JSON.stringify(input.tokens, null, 2),
    ``,
    `WEBFONT FAMILIES AVAILABLE (already loaded by the host — reference by name):`,
    input.fontFamilies.length ? input.fontFamilies.join(', ') : '(none — use the tokens)',
    ``,
    `========== HEADER SOURCE ==========`,
    header ? `HTML:\n${header.slice(0, REGION_HTML_CAP)}` : '(no header found — return empty strings for header)',
  ]
  if (header && input.headerCss.trim()) parts.push(``, `RELEVANT CSS:\n${input.headerCss}`)
  parts.push(
    ``,
    `========== FOOTER SOURCE ==========`,
    footer ? `HTML:\n${footer.slice(0, REGION_HTML_CAP)}` : '(no footer found — return empty strings for footer)',
  )
  if (footer && input.footerCss.trim()) parts.push(``, `RELEVANT CSS:\n${input.footerCss}`)
  return parts.join('\n')
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // Defensive: pull the outermost {...} if the model wrapped it in prose.
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('LLM did not return valid JSON')
  }
}

function normalizeRegion(r: unknown): RebuiltRegion | null {
  if (!r || typeof r !== 'object') return null
  const html = (r as { html?: unknown }).html
  const css = (r as { css?: unknown }).css
  if (typeof html !== 'string' || !html.trim()) return null
  return { html, css: typeof css === 'string' ? css : '' }
}

// Capability gating so the model is genuinely swappable: adaptive thinking and
// the effort knob exist on Opus 4.6/4.7 and Sonnet 4.6, but error on Haiku 4.5.
// Structured outputs work on all three, so we always send the format.
const SUPPORTS_ADAPTIVE = /^claude-(opus-4-[67]|sonnet-4-6)/.test(MODEL)
const SUPPORTS_EFFORT = /^claude-(opus-4-[567]|sonnet-4-6)/.test(MODEL)

/**
 * Rebuild the header and footer with Claude in ONE combined call — one system
 * prompt, one shared thinking budget, shared brand context. This is materially
 * cheaper than two parallel calls (which doubled prompt + thinking tokens).
 * Throws on a missing API key or a hard API/parse failure so the route can
 * surface a clear error.
 */
export async function rebuildChrome(input: RebuildInput): Promise<RebuildResult> {
  if (!input.headerHtml.trim() && !input.footerHtml.trim()) {
    return { header: null, footer: null }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no està configurada')
  }

  const client = new Anthropic()
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 24_000,
    ...(SUPPORTS_ADAPTIVE ? { thinking: { type: 'adaptive' as const } } : {}),
    output_config: {
      ...(SUPPORTS_EFFORT ? { effort: EFFORT } : {}),
      format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
    },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  })

  const msg = await stream.finalMessage()
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const parsed = extractJson(text) as { header?: unknown; footer?: unknown }
  return {
    header: input.headerHtml.trim() ? normalizeRegion(parsed.header) : null,
    footer: input.footerHtml.trim() ? normalizeRegion(parsed.footer) : null,
  }
}
