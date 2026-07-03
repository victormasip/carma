// Premium starter looks — the "from scratch" path of site onboarding.
//
// Each template is a complete, hand-designed identity: a DesignTokens preset that
// drives the whole blog (feed + article typography), a matching native header +
// footer in the same { html, css } component format the clone produces (so the
// render path treats them identically and the visual editor can refine them), a
// default section heading, and the webfonts the look needs.
//
// These render in SCOPED mode: the CSS below is written un-namespaced (plain
// `.cx-… {}`), and scopeChromeCss force-scopes every selector under
// `[data-carma-chrome="…"]` + an `all:initial` reset at render. So every visual
// property is set explicitly (nothing is inherited), and `@media` blocks are
// preserved (the headers are responsive). Applying one writes straight into the
// live Theme Studio state, which autosaves — instant, gorgeous, zero LLM.

import type { DesignTokens } from '@/lib/scrape/tokens'

export type TemplateChrome = { html: string; css: string }

export type BlogTemplate = {
  id: string
  name: string
  tagline: string
  tokens: Partial<DesignTokens>
  sectionTitle: string
  fontLinks: string[]
  /** Colour set for the gallery card's live mini-preview. */
  swatch: { bg: string; surface: string; text: string; accent: string; border: string }
  header: (siteName: string) => TemplateChrome
  footer: (siteName: string) => TemplateChrome
  /** Smart Modules this look ships with ON (registry ids) — applied via the
   *  merge-only enableModules action, so the user can flip any off in Mòduls. */
  modules?: string[]
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const YEAR = new Date().getFullYear()
const GF = (family: string) => `https://fonts.googleapis.com/css2?family=${family}&display=swap`

// Default generic nav — these are starter sites with no real menu yet. Kept short
// and tasteful; the user edits them in the visual editor.
const NAV = ['Inici', 'Articles', 'Sobre', 'Contacte']

// ─── 1. Aperture — minimalist studio, monochrome with a single accent ─────────
const aperture: BlogTemplate = {
  id: 'aperture',
  name: 'Aperture',
  tagline: 'Estudi minimalista: molt aire, tipografia precisa i un sol accent. Modern i atemporal.',
  modules: ['search', 'readingProgress'],
  sectionTitle: 'Journal',
  fontLinks: [GF('Inter+Tight:wght@400;500;600;700;800'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#0a0a0a', colorAccent: '#4f46e5', colorBg: '#ffffff', colorSurface: '#ffffff',
    colorText: '#0a0a0a', colorMuted: '#6b7280', colorBorder: '#ececec',
    fontHeading: "'Inter Tight', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '17px', radius: '12px', radiusLg: '20px', maxWidth: '1180px',
    layout: 'grid', columns: '3', feedLayout: 'minimal',
    sectionTitleColor: '#0a0a0a', sectionTitleSize: '2.6rem', sectionTitleWeight: '800', sectionTitleAlign: 'left',
    headingWeight: '700', linkColor: '#4f46e5', linkUnderline: 'hover',
  },
  swatch: { bg: '#ffffff', surface: '#ffffff', text: '#0a0a0a', accent: '#4f46e5', border: '#ececec' },
  header: (s) => ({
    html: `<header class="cx-ap-h"><div class="cx-ap-in">
  <a class="cx-ap-brand" href="#"><span class="cx-ap-mark"></span>${esc(s)}</a>
  <nav class="cx-ap-nav">${NAV.map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
  <a class="cx-ap-cta" href="#">Subscriu-te</a>
</div></header>`,
    css: `
.cx-ap-h{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.82);backdrop-filter:saturate(180%) blur(14px);-webkit-backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid #ececec}
.cx-ap-in{display:flex;align-items:center;gap:1.5rem;max-width:1180px;margin:0 auto;padding:1.05rem 1.5rem}
.cx-ap-brand{display:inline-flex;align-items:center;gap:.6rem;font-family:'Inter Tight',system-ui,sans-serif;font-size:1.2rem;font-weight:800;letter-spacing:-.02em;color:#0a0a0a;text-decoration:none}
.cx-ap-mark{width:.95rem;height:.95rem;border-radius:5px;background:#0a0a0a;display:inline-block;transform:rotate(45deg)}
.cx-ap-nav{display:flex;align-items:center;gap:1.6rem;margin-left:auto}
.cx-ap-nav a{font-family:'Inter',system-ui,sans-serif;font-size:.9rem;font-weight:500;color:#4b5563;text-decoration:none;transition:color .15s ease}
.cx-ap-nav a:hover{color:#0a0a0a}
.cx-ap-cta{font-family:'Inter',system-ui,sans-serif;font-size:.85rem;font-weight:600;color:#fff;background:#0a0a0a;padding:.55rem 1.05rem;border-radius:9999px;text-decoration:none;transition:transform .15s ease,background .15s ease}
.cx-ap-cta:hover{background:#4f46e5;transform:translateY(-1px)}
@media (max-width:720px){.cx-ap-nav{display:none}.cx-ap-in{padding:.9rem 1.15rem}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-ap-f"><div class="cx-ap-fin">
  <div class="cx-ap-fbrand"><a class="cx-ap-brand" href="#"><span class="cx-ap-mark"></span>${esc(s)}</a><p>Idees, històries i novetats. Cada setmana.</p></div>
  <nav class="cx-ap-fnav">${NAV.map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</div><div class="cx-ap-fbar"><span>© ${YEAR} ${esc(s)}</span><span>Fet amb cura</span></div></footer>`,
    css: `
.cx-ap-f{background:#fff;border-top:1px solid #ececec}
.cx-ap-fin{display:flex;flex-wrap:wrap;gap:2.5rem;justify-content:space-between;max-width:1180px;margin:0 auto;padding:3rem 1.5rem 2rem}
.cx-ap-fbrand .cx-ap-brand{font-family:'Inter Tight',system-ui,sans-serif;font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:#0a0a0a;text-decoration:none;display:inline-flex;align-items:center;gap:.6rem}
.cx-ap-fbrand .cx-ap-mark{width:.95rem;height:.95rem;border-radius:5px;background:#0a0a0a;display:inline-block;transform:rotate(45deg)}
.cx-ap-fbrand p{margin:.7rem 0 0;font-family:'Inter',system-ui,sans-serif;font-size:.9rem;color:#6b7280;max-width:24rem;line-height:1.6}
.cx-ap-fnav{display:flex;flex-direction:column;gap:.6rem}
.cx-ap-fnav a{font-family:'Inter',system-ui,sans-serif;font-size:.9rem;font-weight:500;color:#4b5563;text-decoration:none}
.cx-ap-fnav a:hover{color:#4f46e5}
.cx-ap-fbar{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;max-width:1180px;margin:0 auto;padding:1.25rem 1.5rem;border-top:1px solid #f3f4f6;font-family:'Inter',system-ui,sans-serif;font-size:.8rem;color:#9ca3af}`,
  }),
}

// ─── 2. Editorial — luxury magazine, display serif, warm paper ────────────────
const editorial: BlogTemplate = {
  id: 'editorial',
  name: 'Editorial',
  tagline: 'Revista de luxe: serif de display, paper càlid i un masthead elegant. Per a publicacions amb veu.',
  modules: ['newsletter', 'relatedPosts'],
  sectionTitle: 'Actualitat',
  fontLinks: [GF('Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700'), GF('Inter:wght@400;500;600;700')],
  tokens: {
    colorPrimary: '#1c1714', colorAccent: '#b5451f', colorBg: '#faf6ef', colorSurface: '#ffffff',
    colorText: '#1c1714', colorMuted: '#7c6f64', colorBorder: '#e7ddcf',
    fontHeading: "'Fraunces', Georgia, 'Times New Roman', serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '18px', radius: '6px', radiusLg: '12px', maxWidth: '1160px',
    layout: 'grid', columns: '2', feedLayout: 'editorial',
    sectionTitleColor: '#1c1714', sectionTitleSize: '2.9rem', sectionTitleWeight: '600', sectionTitleAlign: 'center',
    headingWeight: '600', blockquoteStyle: 'italic', blockquoteBorderColor: '#b5451f', linkColor: '#b5451f', linkUnderline: 'always',
  },
  swatch: { bg: '#faf6ef', surface: '#ffffff', text: '#1c1714', accent: '#b5451f', border: '#e7ddcf' },
  header: (s) => ({
    html: `<header class="cx-ed-h">
  <div class="cx-ed-top"><span>${esc(NAV[2])} · ${esc(NAV[3])}</span><span class="cx-ed-date">${YEAR}</span></div>
  <a class="cx-ed-brand" href="#">${esc(s)}</a>
  <nav class="cx-ed-nav">${['Actualitat', 'Cultura', 'Opinió', 'Entrevistes'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</header>`,
    css: `
.cx-ed-h{background:#faf6ef;border-bottom:2px solid #1c1714;text-align:center;padding:.65rem 1.5rem 0}
.cx-ed-top{display:flex;align-items:center;justify-content:space-between;max-width:1160px;margin:0 auto;font-family:'Inter',system-ui,sans-serif;font-size:.72rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#9a8c7d}
.cx-ed-brand{display:block;font-family:'Fraunces',Georgia,serif;font-size:clamp(2.4rem,7vw,4.25rem);font-weight:600;color:#1c1714;text-decoration:none;line-height:1;letter-spacing:-.01em;padding:1.1rem 0 .9rem}
.cx-ed-brand:hover{color:#b5451f}
.cx-ed-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:1.9rem;max-width:1160px;margin:0 auto;border-top:1px solid #e0d4c2;padding:.85rem 0}
.cx-ed-nav a{font-family:'Inter',system-ui,sans-serif;font-size:.82rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#3f372f;text-decoration:none;transition:color .15s ease}
.cx-ed-nav a:hover{color:#b5451f}
@media (max-width:640px){.cx-ed-nav{gap:1.1rem}.cx-ed-top span:first-child{display:none}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-ed-f">
  <div class="cx-ed-fmast">${esc(s)}</div>
  <nav class="cx-ed-fnav">${['Actualitat', 'Cultura', 'Opinió', 'Sobre nosaltres', 'Contacte'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
  <p class="cx-ed-fmeta">© ${YEAR} ${esc(s)} · Tots els drets reservats</p>
</footer>`,
    css: `
.cx-ed-f{background:#1c1714;color:#f3ece1;text-align:center;padding:3.25rem 1.5rem 2.75rem}
.cx-ed-fmast{font-family:'Fraunces',Georgia,serif;font-size:2rem;font-weight:600;letter-spacing:-.01em;color:#fff}
.cx-ed-fnav{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:1.6rem;margin:1.4rem auto 0;max-width:760px}
.cx-ed-fnav a{font-family:'Inter',system-ui,sans-serif;font-size:.82rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#cdbfae;text-decoration:none}
.cx-ed-fnav a:hover{color:#e8a585}
.cx-ed-fmeta{margin:1.8rem 0 0;font-family:'Inter',system-ui,sans-serif;font-size:.8rem;color:#8a7c6d}`,
  }),
}

// ─── 3. Beacon — bold modern magazine, vivid accent bar, energetic ────────────
const beacon: BlogTemplate = {
  id: 'beacon',
  name: 'Beacon',
  tagline: 'Magazine atrevit: tipografia potent, una barra d’accent vibrant i graella de 3 columnes. Energètic.',
  modules: ['search', 'categoryFilters'],
  sectionTitle: 'El blog',
  fontLinks: [GF('Archivo:wght@500;600;700;800;900'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#0b1020', colorAccent: '#e11d48', colorBg: '#ffffff', colorSurface: '#ffffff',
    colorText: '#0b1020', colorMuted: '#64748b', colorBorder: '#e6e8ee',
    fontHeading: "'Archivo', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '16px', radius: '14px', radiusLg: '22px', maxWidth: '1280px',
    layout: 'grid', columns: '3', feedLayout: 'magazine',
    sectionTitleColor: '#0b1020', sectionTitleSize: '2.8rem', sectionTitleWeight: '900', sectionTitleAlign: 'left',
    headingWeight: '800', linkColor: '#e11d48', linkUnderline: 'hover',
  },
  swatch: { bg: '#ffffff', surface: '#ffffff', text: '#0b1020', accent: '#e11d48', border: '#e6e8ee' },
  header: (s) => ({
    html: `<header class="cx-be-h"><div class="cx-be-accent"></div><div class="cx-be-in">
  <a class="cx-be-brand" href="#">${esc(s)}<span>.</span></a>
  <nav class="cx-be-nav">${NAV.map((n, i) => `<a href="#"${i === 1 ? ' class="on"' : ''}>${esc(n)}</a>`).join('')}</nav>
  <a class="cx-be-cta" href="#">Comença →</a>
</div></header>`,
    css: `
.cx-be-h{background:#fff;border-bottom:1px solid #e6e8ee;position:sticky;top:0;z-index:20}
.cx-be-accent{height:4px;background:linear-gradient(90deg,#e11d48,#f59e0b 55%,#6366f1)}
.cx-be-in{display:flex;align-items:center;gap:1.5rem;max-width:1280px;margin:0 auto;padding:1.1rem 1.5rem}
.cx-be-brand{font-family:'Archivo',system-ui,sans-serif;font-size:1.5rem;font-weight:900;letter-spacing:-.035em;color:#0b1020;text-decoration:none}
.cx-be-brand span{color:#e11d48}
.cx-be-nav{display:flex;align-items:center;gap:1.7rem;margin-left:auto}
.cx-be-nav a{font-family:'Inter',system-ui,sans-serif;font-size:.92rem;font-weight:600;color:#475569;text-decoration:none;padding:.3rem 0;border-bottom:2px solid transparent;transition:color .15s ease,border-color .15s ease}
.cx-be-nav a:hover{color:#0b1020}
.cx-be-nav a.on{color:#0b1020;border-color:#e11d48}
.cx-be-cta{font-family:'Archivo',system-ui,sans-serif;font-size:.85rem;font-weight:800;color:#fff;background:#0b1020;padding:.6rem 1.15rem;border-radius:10px;text-decoration:none;transition:background .15s ease}
.cx-be-cta:hover{background:#e11d48}
@media (max-width:760px){.cx-be-nav,.cx-be-cta{display:none}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-be-f"><div class="cx-be-fin">
  <div class="cx-be-col cx-be-brandcol"><span class="cx-be-fbrand">${esc(s)}<span>.</span></span><p>El millor contingut, directe a la teva safata.</p></div>
  <div class="cx-be-col"><h4>Explora</h4>${NAV.map(n => `<a href="#">${esc(n)}</a>`).join('')}</div>
  <div class="cx-be-col"><h4>Social</h4>${['Twitter / X', 'Instagram', 'LinkedIn', 'YouTube'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</div>
</div><div class="cx-be-fbar"><span>© ${YEAR} ${esc(s)}</span><span>Privacitat · Termes</span></div></footer>`,
    css: `
.cx-be-f{background:#0b1020;color:#cbd5e1}
.cx-be-fin{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:2.5rem;max-width:1280px;margin:0 auto;padding:3.5rem 1.5rem 2.5rem}
.cx-be-fbrand{font-family:'Archivo',system-ui,sans-serif;font-size:1.5rem;font-weight:900;letter-spacing:-.035em;color:#fff}
.cx-be-fbrand span{color:#fb7185}
.cx-be-brandcol p{margin:.8rem 0 0;font-family:'Inter',system-ui,sans-serif;font-size:.92rem;line-height:1.65;color:#94a3b8;max-width:22rem}
.cx-be-col h4{margin:0 0 1rem;font-family:'Archivo',system-ui,sans-serif;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fff}
.cx-be-col a{display:block;font-family:'Inter',system-ui,sans-serif;font-size:.92rem;color:#94a3b8;text-decoration:none;padding:.32rem 0;transition:color .15s ease}
.cx-be-col a:hover{color:#fb7185}
.cx-be-fbar{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;max-width:1280px;margin:0 auto;padding:1.4rem 1.5rem;border-top:1px solid #1e293b;font-family:'Inter',system-ui,sans-serif;font-size:.8rem;color:#64748b}
@media (max-width:760px){.cx-be-fin{grid-template-columns:1fr 1fr;gap:2rem}.cx-be-brandcol{grid-column:1/-1}}`,
  }),
}

// ─── 4. Noir — dark premium, neon mint accent, geometric wordmark ─────────────
const noir: BlogTemplate = {
  id: 'noir',
  name: 'Noir',
  tagline: 'Mode fosc premium: negre profund, accent neó i tipografia geomètrica. Atrevit i tecnològic.',
  modules: ['search', 'socialShare'],
  sectionTitle: 'Latest',
  fontLinks: [GF('Space+Grotesk:wght@500;600;700'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#eef2f6', colorAccent: '#5eead4', colorBg: '#08090c', colorSurface: '#111317',
    colorText: '#eef2f6', colorMuted: '#8b94a3', colorBorder: '#20242c',
    fontHeading: "'Space Grotesk', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '16px', radius: '14px', radiusLg: '20px', maxWidth: '1220px',
    layout: 'grid', columns: '3', feedLayout: 'overlay',
    sectionTitleColor: '#ffffff', sectionTitleSize: '2.5rem', sectionTitleWeight: '700', sectionTitleAlign: 'left',
    headingWeight: '600', linkColor: '#5eead4', linkUnderline: 'hover',
  },
  swatch: { bg: '#08090c', surface: '#111317', text: '#eef2f6', accent: '#5eead4', border: '#20242c' },
  header: (s) => ({
    html: `<header class="cx-no-h"><div class="cx-no-in">
  <a class="cx-no-brand" href="#"><span class="cx-no-dot"></span>${esc(s)}</a>
  <nav class="cx-no-nav">${NAV.map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
  <a class="cx-no-cta" href="#">Subscriu-te</a>
</div></header>`,
    css: `
.cx-no-h{position:sticky;top:0;z-index:20;background:rgba(8,9,12,.78);backdrop-filter:saturate(160%) blur(14px);-webkit-backdrop-filter:saturate(160%) blur(14px);border-bottom:1px solid #20242c}
.cx-no-in{display:flex;align-items:center;gap:1.5rem;max-width:1220px;margin:0 auto;padding:1.05rem 1.5rem}
.cx-no-brand{display:inline-flex;align-items:center;gap:.65rem;font-family:'Space Grotesk',system-ui,sans-serif;font-size:1.25rem;font-weight:700;letter-spacing:-.02em;color:#eef2f6;text-decoration:none}
.cx-no-dot{width:.62rem;height:.62rem;border-radius:9999px;background:#5eead4;box-shadow:0 0 14px #5eead4;display:inline-block}
.cx-no-nav{display:flex;align-items:center;gap:1.7rem;margin-left:auto}
.cx-no-nav a{font-family:'Inter',system-ui,sans-serif;font-size:.9rem;font-weight:500;color:#9aa3b2;text-decoration:none;transition:color .15s ease}
.cx-no-nav a:hover{color:#5eead4}
.cx-no-cta{font-family:'Space Grotesk',system-ui,sans-serif;font-size:.85rem;font-weight:700;color:#08090c;background:#5eead4;padding:.55rem 1.1rem;border-radius:9999px;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease}
.cx-no-cta:hover{transform:translateY(-1px);box-shadow:0 8px 24px -8px #5eead4}
@media (max-width:720px){.cx-no-nav{display:none}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-no-f"><div class="cx-no-fin">
  <div><a class="cx-no-brand" href="#"><span class="cx-no-dot"></span>${esc(s)}</a><p>Senyals des de la frontera de la tecnologia.</p></div>
  <nav class="cx-no-fnav">${NAV.map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</div><div class="cx-no-fbar"><span>© ${YEAR} ${esc(s)}</span><span>Construït per a la nit</span></div></footer>`,
    css: `
.cx-no-f{background:#08090c;border-top:1px solid #20242c}
.cx-no-fin{display:flex;flex-wrap:wrap;gap:2.5rem;justify-content:space-between;max-width:1220px;margin:0 auto;padding:3rem 1.5rem 2rem}
.cx-no-fin .cx-no-brand{font-family:'Space Grotesk',system-ui,sans-serif;font-size:1.2rem;font-weight:700;color:#eef2f6;text-decoration:none;display:inline-flex;align-items:center;gap:.65rem}
.cx-no-fin .cx-no-dot{width:.62rem;height:.62rem;border-radius:9999px;background:#5eead4;box-shadow:0 0 14px #5eead4;display:inline-block}
.cx-no-fin p{margin:.75rem 0 0;font-family:'Inter',system-ui,sans-serif;font-size:.9rem;color:#8b94a3;max-width:22rem;line-height:1.6}
.cx-no-fnav{display:flex;flex-direction:column;gap:.6rem}
.cx-no-fnav a{font-family:'Inter',system-ui,sans-serif;font-size:.9rem;color:#9aa3b2;text-decoration:none}
.cx-no-fnav a:hover{color:#5eead4}
.cx-no-fbar{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;max-width:1220px;margin:0 auto;padding:1.3rem 1.5rem;border-top:1px solid #15181d;font-family:'Inter',system-ui,sans-serif;font-size:.8rem;color:#5b6472}`,
  }),
}

// ─── 5. Terra — warm editorial for lifestyle / wellness, soft & premium ───────
const terra: BlogTemplate = {
  id: 'terra',
  name: 'Terra',
  tagline: 'Editorial càlid per a lifestyle i benestar: tons sorra, serif suau i molta calma. Acollidor.',
  modules: ['newsletter', 'socialShare'],
  sectionTitle: 'Stories',
  fontLinks: [GF('Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#2c2622', colorAccent: '#a3672f', colorBg: '#f6f1e9', colorSurface: '#fffdf9',
    colorText: '#2c2622', colorMuted: '#857a6d', colorBorder: '#e6dccb',
    fontHeading: "'Newsreader', Georgia, serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '18px', radius: '16px', radiusLg: '26px', maxWidth: '1120px',
    layout: 'grid', columns: '2', feedLayout: 'gridxl',
    sectionTitleColor: '#2c2622', sectionTitleSize: '2.6rem', sectionTitleWeight: '500', sectionTitleAlign: 'center',
    headingWeight: '500', blockquoteStyle: 'italic', blockquoteBorderColor: '#a3672f', linkColor: '#a3672f', linkUnderline: 'always',
  },
  swatch: { bg: '#f6f1e9', surface: '#fffdf9', text: '#2c2622', accent: '#a3672f', border: '#e6dccb' },
  header: (s) => ({
    html: `<header class="cx-te-h"><div class="cx-te-in">
  <nav class="cx-te-nav cx-te-left">${['Stories', 'Receptes'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
  <a class="cx-te-brand" href="#">${esc(s)}</a>
  <nav class="cx-te-nav cx-te-right">${['Sobre', 'Newsletter'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</div></header>`,
    css: `
.cx-te-h{background:#f6f1e9;border-bottom:1px solid #e6dccb}
.cx-te-in{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;max-width:1120px;margin:0 auto;padding:1.5rem}
.cx-te-brand{font-family:'Newsreader',Georgia,serif;font-size:clamp(1.6rem,4vw,2.2rem);font-weight:500;letter-spacing:.01em;color:#2c2622;text-decoration:none;text-align:center;white-space:nowrap}
.cx-te-brand:hover{color:#a3672f}
.cx-te-nav{display:flex;align-items:center;gap:1.5rem}
.cx-te-right{justify-content:flex-end}
.cx-te-nav a{font-family:'Inter',system-ui,sans-serif;font-size:.82rem;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#6e6356;text-decoration:none;transition:color .15s ease}
.cx-te-nav a:hover{color:#a3672f}
@media (max-width:680px){.cx-te-in{grid-template-columns:1fr}.cx-te-nav{display:none}.cx-te-brand{font-size:1.7rem}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-te-f">
  <p class="cx-te-fkick">Uneix-te a la nostra comunitat</p>
  <div class="cx-te-fbrand">${esc(s)}</div>
  <nav class="cx-te-fnav">${['Stories', 'Receptes', 'Sobre', 'Newsletter', 'Contacte'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
  <p class="cx-te-fmeta">© ${YEAR} ${esc(s)} · Amb amor i cura</p>
</footer>`,
    css: `
.cx-te-f{background:#efe7da;text-align:center;padding:3.5rem 1.5rem 3rem}
.cx-te-fkick{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:.74rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#a3672f}
.cx-te-fbrand{font-family:'Newsreader',Georgia,serif;font-size:2.2rem;font-weight:500;color:#2c2622;margin-top:.5rem}
.cx-te-fnav{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:1.5rem;margin:1.5rem auto 0;max-width:680px}
.cx-te-fnav a{font-family:'Inter',system-ui,sans-serif;font-size:.82rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#6e6356;text-decoration:none}
.cx-te-fnav a:hover{color:#a3672f}
.cx-te-fmeta{margin:1.8rem 0 0;font-family:'Inter',system-ui,sans-serif;font-size:.8rem;color:#9a8d7c}`,
  }),
}

// ─── 0. Carma — the official house look: warm paper, gold, Plus Jakarta Sans ──
const carma: BlogTemplate = {
  id: 'carma',
  name: 'Carma',
  tagline: 'La nostra identitat de casa: paper càlid, daurat i Plus Jakarta Sans. Premium, net i acollidor.',
  modules: ['search', 'relatedPosts'],
  sectionTitle: 'El blog',
  fontLinks: [GF('Plus+Jakarta+Sans:wght@400;500;600;700;800')],
  tokens: {
    colorPrimary: '#1c1917', colorAccent: '#f5bc00', colorBg: '#faf8f3', colorSurface: '#ffffff',
    colorText: '#1c1917', colorMuted: '#78716c', colorBorder: '#ece8e1',
    fontHeading: "'Plus Jakarta Sans', system-ui, sans-serif", fontBody: "'Plus Jakarta Sans', system-ui, sans-serif",
    baseFontSize: '18px', radius: '14px', radiusLg: '24px', maxWidth: '1180px',
    layout: 'grid', columns: '3', feedLayout: 'gridxl',
    sectionTitleColor: '#1c1917', sectionTitleSize: '2.7rem', sectionTitleWeight: '800', sectionTitleAlign: 'left',
    headingWeight: '800', linkColor: '#a87f00', linkUnderline: 'hover', blockquoteBorderColor: '#f5bc00',
  },
  swatch: { bg: '#faf8f3', surface: '#ffffff', text: '#1c1917', accent: '#f5bc00', border: '#ece8e1' },
  header: (s) => ({
    html: `<div class="cx-ca-top"></div>
<header class="cx-ca-h"><div class="cx-ca-in">
  <a class="cx-ca-brand" href="#">${esc(s)}<span class="cx-ca-dot">.</span></a>
  <nav class="cx-ca-nav">${['Inici', 'El blog', 'Sobre', 'Contacte'].map((n, i) => `<a href="#"${i === 1 ? ' class="on"' : ''}>${esc(n)}</a>`).join('')}</nav>
  <a class="cx-ca-cta" href="#">Subscriu-te</a>
</div></header>`,
    css: `
.cx-ca-top{height:3px;background:linear-gradient(90deg,#b58f27,#f5bc00 35%,#ffe27a 50%,#f5bc00 65%,#b58f27)}
.cx-ca-h{position:sticky;top:0;z-index:20;background:rgba(250,247,240,.86);backdrop-filter:saturate(180%) blur(14px);-webkit-backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid #ece6da}
.cx-ca-in{display:flex;align-items:center;gap:1.5rem;max-width:1180px;margin:0 auto;padding:1.1rem 1.5rem}
.cx-ca-brand{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:1.5rem;font-weight:800;letter-spacing:-.035em;color:#1c1917;text-decoration:none}
.cx-ca-dot{color:#f5bc00}
.cx-ca-nav{display:flex;align-items:center;gap:1.8rem;margin-left:auto}
.cx-ca-nav a{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.95rem;font-weight:600;color:#57534e;text-decoration:none;padding:.35rem 0;border-bottom:2px solid transparent;transition:color .15s ease,border-color .15s ease}
.cx-ca-nav a:hover{color:#1c1917}
.cx-ca-nav a.on{color:#1c1917;border-color:#f5bc00}
.cx-ca-cta{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.9rem;font-weight:800;color:#1a1400;background:linear-gradient(180deg,#ffd23d,#f0a800);padding:.58rem 1.25rem;border-radius:9999px;text-decoration:none;box-shadow:0 8px 22px -8px rgba(245,188,0,.6);transition:transform .15s ease,filter .15s ease}
.cx-ca-cta:hover{transform:translateY(-1px);filter:brightness(1.05)}
@media (max-width:760px){.cx-ca-nav,.cx-ca-cta{display:none}.cx-ca-in{padding:.95rem 1.15rem}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-ca-f"><div class="cx-ca-fin">
  <div class="cx-ca-fbrand"><p class="cx-ca-fkick">El blog que estima la teva marca</p><a class="cx-ca-fb" href="#">${esc(s)}<span class="cx-ca-dot">.</span></a><p class="cx-ca-fmanifest">Històries, idees i novetats — escrites amb cura i publicades amb estil.</p></div>
  <nav class="cx-ca-fnav"><span class="cx-ca-fh">Explora</span>${['Inici', 'El blog', 'Sobre', 'Contacte'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</div><div class="cx-ca-fbar"><span>© ${YEAR} ${esc(s)}</span><span>Fet amb daurat a Catalunya</span></div></footer>`,
    css: `
.cx-ca-f{background:#1c1917;color:#e7e2d8}
.cx-ca-fin{display:flex;flex-wrap:wrap;gap:2.5rem;justify-content:space-between;max-width:1180px;margin:0 auto;padding:3.5rem 1.5rem 2.5rem}
.cx-ca-fkick{margin:0 0 .55rem;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.72rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#f5bc00}
.cx-ca-fb{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:1.65rem;font-weight:800;letter-spacing:-.035em;color:#fff;text-decoration:none}
.cx-ca-fb .cx-ca-dot{color:#f5bc00}
.cx-ca-fmanifest{margin:.8rem 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.98rem;color:#b8b1a4;max-width:26rem;line-height:1.65}
.cx-ca-fnav{display:flex;flex-direction:column;gap:.7rem}
.cx-ca-fh{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8a8377;margin-bottom:.3rem}
.cx-ca-fnav a{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.95rem;font-weight:600;color:#cbc4b6;text-decoration:none}
.cx-ca-fnav a:hover{color:#ffd23d}
.cx-ca-fbar{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;max-width:1180px;margin:0 auto;padding:1.3rem 1.5rem;border-top:1px solid #2b2622;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:.82rem;color:#8a8377}`,
  }),
}

// ─── 7. Pulse — SaaS/tech: geometric type, violet gradient, crisp UI ──────────
const pulse: BlogTemplate = {
  id: 'pulse',
  name: 'Pulse',
  tagline: 'Tech i SaaS: tipografia geomètrica, degradat violeta i una interfície nítida. Ràpid i modern.',
  modules: ['search', 'darkModeToggle'],
  sectionTitle: 'Changelog & blog',
  fontLinks: [GF('Space+Grotesk:wght@500;600;700'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#101322', colorAccent: '#7c3aed', colorBg: '#fbfbfe', colorSurface: '#ffffff',
    colorText: '#101322', colorMuted: '#5b6172', colorBorder: '#e7e7f2',
    fontHeading: "'Space Grotesk', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '16px', radius: '12px', radiusLg: '18px', maxWidth: '1240px',
    layout: 'grid', columns: '3', feedLayout: 'compact',
    sectionTitleColor: '#101322', sectionTitleSize: '2.4rem', sectionTitleWeight: '700', sectionTitleAlign: 'left',
    headingWeight: '700', linkColor: '#7c3aed', linkUnderline: 'hover',
    buttonBg: 'linear-gradient(135deg,#7c3aed,#5b21b6)', buttonText: '#ffffff', buttonRadius: '10px', buttonWeight: '600',
  },
  swatch: { bg: '#fbfbfe', surface: '#ffffff', text: '#101322', accent: '#7c3aed', border: '#e7e7f2' },
  header: (s) => ({
    html: `<header class="cx-pu-h"><div class="cx-pu-in">
  <a class="cx-pu-brand" href="#"><span class="cx-pu-logo">▲</span>${esc(s)}</a>
  <nav class="cx-pu-nav">${['Producte', 'Blog', 'Docs', 'Preus'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
  <div class="cx-pu-actions"><a class="cx-pu-ghost" href="#">Entra</a><a class="cx-pu-cta" href="#">Prova-ho gratis</a></div>
</div></header>`,
    css: `
.cx-pu-h{position:sticky;top:0;z-index:20;background:rgba(251,251,254,.85);backdrop-filter:saturate(160%) blur(12px);-webkit-backdrop-filter:saturate(160%) blur(12px);border-bottom:1px solid #e7e7f2}
.cx-pu-in{display:flex;align-items:center;gap:1.75rem;max-width:1240px;margin:0 auto;padding:.85rem 1.5rem}
.cx-pu-brand{display:inline-flex;align-items:center;gap:.55rem;font-family:'Space Grotesk',system-ui,sans-serif;font-size:1.15rem;font-weight:700;letter-spacing:-.02em;color:#101322;text-decoration:none}
.cx-pu-logo{display:inline-flex;align-items:center;justify-content:center;width:1.7rem;height:1.7rem;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;font-size:.7rem}
.cx-pu-nav{display:flex;align-items:center;gap:1.5rem;margin-left:.75rem}
.cx-pu-nav a{font-family:'Inter',system-ui,sans-serif;font-size:.88rem;font-weight:500;color:#5b6172;text-decoration:none;transition:color .15s ease}
.cx-pu-nav a:hover{color:#101322}
.cx-pu-actions{display:flex;align-items:center;gap:.65rem;margin-left:auto}
.cx-pu-ghost{font-family:'Inter',system-ui,sans-serif;font-size:.86rem;font-weight:600;color:#101322;text-decoration:none;padding:.5rem .8rem;border-radius:9px}
.cx-pu-ghost:hover{background:#f0eefb}
.cx-pu-cta{font-family:'Inter',system-ui,sans-serif;font-size:.86rem;font-weight:600;color:#fff;background:linear-gradient(135deg,#7c3aed,#5b21b6);padding:.55rem 1rem;border-radius:10px;text-decoration:none;box-shadow:0 8px 20px -10px rgba(124,58,237,.55);transition:transform .15s ease,box-shadow .15s ease}
.cx-pu-cta:hover{transform:translateY(-1px);box-shadow:0 12px 26px -10px rgba(124,58,237,.65)}
@media (max-width:760px){.cx-pu-nav,.cx-pu-ghost{display:none}.cx-pu-in{padding:.75rem 1.1rem}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-pu-f"><div class="cx-pu-fin">
  <div class="cx-pu-fbrand"><a class="cx-pu-fb" href="#"><span class="cx-pu-logo">▲</span>${esc(s)}</a><p>Construïm en públic. Novetats, guies i canvis, cada setmana.</p></div>
  <nav class="cx-pu-fnav"><span class="cx-pu-fh">Recursos</span>${['Blog', 'Docs', 'Changelog', 'Estat'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
  <nav class="cx-pu-fnav"><span class="cx-pu-fh">Empresa</span>${['Sobre', 'Contacte', 'Privacitat'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</div><div class="cx-pu-fbar"><span>© ${YEAR} ${esc(s)}</span><span>Sistema operatiu ✓</span></div></footer>`,
    css: `
.cx-pu-f{background:#0d1020;color:#c9cbdd}
.cx-pu-fin{display:flex;flex-wrap:wrap;gap:2.75rem;justify-content:space-between;max-width:1240px;margin:0 auto;padding:3.25rem 1.5rem 2.25rem}
.cx-pu-fb{display:inline-flex;align-items:center;gap:.55rem;font-family:'Space Grotesk',system-ui,sans-serif;font-size:1.1rem;font-weight:700;color:#fff;text-decoration:none}
.cx-pu-fbrand p{margin:.8rem 0 0;font-family:'Inter',system-ui,sans-serif;font-size:.9rem;color:#8f93ab;max-width:23rem;line-height:1.65}
.cx-pu-fnav{display:flex;flex-direction:column;gap:.55rem}
.cx-pu-fh{font-family:'Inter',system-ui,sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#6d7190;margin-bottom:.35rem}
.cx-pu-fnav a{font-family:'Inter',system-ui,sans-serif;font-size:.9rem;font-weight:500;color:#c9cbdd;text-decoration:none}
.cx-pu-fnav a:hover{color:#a78bfa}
.cx-pu-fbar{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;max-width:1240px;margin:0 auto;padding:1.25rem 1.5rem;border-top:1px solid #1d2136;font-family:'Inter',system-ui,sans-serif;font-size:.8rem;color:#6d7190}`,
  }),
}

// ─── 8. Atelier — high-fashion luxe: huge serif, ivory & ink, hairline rules ──
const atelier: BlogTemplate = {
  id: 'atelier',
  name: 'Atelier',
  tagline: 'Luxe fred: serif enorme, marfil i tinta, filets fins i majúscules espaiades. Per a marques amb aura.',
  modules: ['newsletter', 'socialShare'],
  sectionTitle: 'Le Journal',
  fontLinks: [GF('Cormorant+Garamond:wght@400;500;600'), GF('Jost:wght@300;400;500;600')],
  tokens: {
    colorPrimary: '#141210', colorAccent: '#8a6d3b', colorBg: '#f8f6f1', colorSurface: '#fdfcf9',
    colorText: '#141210', colorMuted: '#7d7668', colorBorder: '#e4dfd3',
    fontHeading: "'Cormorant Garamond', Georgia, serif", fontBody: "'Jost', system-ui, sans-serif",
    baseFontSize: '17px', radius: '0px', radiusLg: '0px', maxWidth: '1200px',
    layout: 'grid', columns: '3', feedLayout: 'overlay',
    sectionTitleColor: '#141210', sectionTitleSize: '3.2rem', sectionTitleWeight: '500', sectionTitleAlign: 'center',
    headingWeight: '500', linkColor: '#8a6d3b', linkUnderline: 'always',
    buttonBg: '#141210', buttonText: '#f8f6f1', buttonRadius: '0px', buttonWeight: '500', buttonTextTransform: 'uppercase',
  },
  swatch: { bg: '#f8f6f1', surface: '#fdfcf9', text: '#141210', accent: '#8a6d3b', border: '#e4dfd3' },
  header: (s) => ({
    html: `<header class="cx-at-h">
  <div class="cx-at-top"><span>Nova col·lecció</span><a href="#">Descobreix-la</a></div>
  <div class="cx-at-mast"><a class="cx-at-brand" href="#">${esc(s)}</a></div>
  <nav class="cx-at-nav">${['Journal', 'Col·leccions', 'Atelier', 'Contacte'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</header>`,
    css: `
.cx-at-h{background:#f8f6f1;border-bottom:1px solid #141210}
.cx-at-top{display:flex;align-items:center;justify-content:center;gap:.8rem;background:#141210;color:#f8f6f1;font-family:'Jost',system-ui,sans-serif;font-size:.72rem;font-weight:400;letter-spacing:.22em;text-transform:uppercase;padding:.5rem 1rem}
.cx-at-top a{color:#d8c49a;text-decoration:underline;text-underline-offset:3px}
.cx-at-mast{text-align:center;padding:1.6rem 1rem 1.1rem}
.cx-at-brand{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(2.2rem,6vw,3.6rem);font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#141210;text-decoration:none;line-height:1}
.cx-at-brand:hover{color:#8a6d3b}
.cx-at-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2.4rem;border-top:1px solid #e4dfd3;max-width:1200px;margin:0 auto;padding:.9rem 1rem}
.cx-at-nav a{font-family:'Jost',system-ui,sans-serif;font-size:.78rem;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:#3d382f;text-decoration:none;transition:color .15s ease}
.cx-at-nav a:hover{color:#8a6d3b}
@media (max-width:640px){.cx-at-nav{gap:1.3rem}.cx-at-top span{display:none}}`,
  }),
  footer: (s) => ({
    html: `<footer class="cx-at-f"><div class="cx-at-fin">
  <a class="cx-at-fbrand" href="#">${esc(s)}</a>
  <p class="cx-at-fm">Peces úniques, històries lentes. Escrit des de l'atelier.</p>
  <nav class="cx-at-fnav">${['Journal', 'Col·leccions', 'Atelier', 'Contacte'].map(n => `<a href="#">${esc(n)}</a>`).join('')}</nav>
</div><div class="cx-at-fbar"><span>© ${YEAR} ${esc(s)}</span><span>Fet a mà</span></div></footer>`,
    css: `
.cx-at-f{background:#141210;color:#cfc9bb;text-align:center}
.cx-at-fin{max-width:1200px;margin:0 auto;padding:3.5rem 1.5rem 2rem}
.cx-at-fbrand{font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#f8f6f1;text-decoration:none}
.cx-at-fm{margin:1rem auto 0;font-family:'Jost',system-ui,sans-serif;font-size:.92rem;font-weight:300;color:#a49d8d;max-width:26rem;line-height:1.7}
.cx-at-fnav{display:flex;flex-wrap:wrap;justify-content:center;gap:2rem;margin-top:1.9rem}
.cx-at-fnav a{font-family:'Jost',system-ui,sans-serif;font-size:.74rem;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:#cfc9bb;text-decoration:none}
.cx-at-fnav a:hover{color:#d8c49a}
.cx-at-fbar{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;max-width:1200px;margin:0 auto;padding:1.25rem 1.5rem;border-top:1px solid #2a261f;font-family:'Jost',system-ui,sans-serif;font-size:.76rem;letter-spacing:.08em;color:#7d7668}`,
  }),
}

export const BLOG_TEMPLATES: readonly BlogTemplate[] = [carma, aperture, editorial, pulse, beacon, atelier, noir, terra]

export function getTemplate(id: string): BlogTemplate | undefined {
  return BLOG_TEMPLATES.find(t => t.id === id)
}

/** Build the stored chrome JSON strings ({ html, css }) for a template. */
export function templateChromeJson(tpl: BlogTemplate, siteName: string): { header: string; footer: string } {
  return {
    header: JSON.stringify(tpl.header(siteName)),
    footer: JSON.stringify(tpl.footer(siteName)),
  }
}
