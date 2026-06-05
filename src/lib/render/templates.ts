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
  sectionTitle: 'Journal',
  fontLinks: [GF('Inter+Tight:wght@400;500;600;700;800'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#0a0a0a', colorAccent: '#4f46e5', colorBg: '#ffffff', colorSurface: '#ffffff',
    colorText: '#0a0a0a', colorMuted: '#6b7280', colorBorder: '#ececec',
    fontHeading: "'Inter Tight', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '17px', radius: '12px', radiusLg: '20px', maxWidth: '1180px',
    layout: 'grid', columns: '3',
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
  sectionTitle: 'Actualitat',
  fontLinks: [GF('Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700'), GF('Inter:wght@400;500;600;700')],
  tokens: {
    colorPrimary: '#1c1714', colorAccent: '#b5451f', colorBg: '#faf6ef', colorSurface: '#ffffff',
    colorText: '#1c1714', colorMuted: '#7c6f64', colorBorder: '#e7ddcf',
    fontHeading: "'Fraunces', Georgia, 'Times New Roman', serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '18px', radius: '6px', radiusLg: '12px', maxWidth: '1160px',
    layout: 'grid', columns: '2',
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
  sectionTitle: 'El blog',
  fontLinks: [GF('Archivo:wght@500;600;700;800;900'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#0b1020', colorAccent: '#e11d48', colorBg: '#ffffff', colorSurface: '#ffffff',
    colorText: '#0b1020', colorMuted: '#64748b', colorBorder: '#e6e8ee',
    fontHeading: "'Archivo', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '16px', radius: '14px', radiusLg: '22px', maxWidth: '1280px',
    layout: 'grid', columns: '3',
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
  sectionTitle: 'Latest',
  fontLinks: [GF('Space+Grotesk:wght@500;600;700'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#eef2f6', colorAccent: '#5eead4', colorBg: '#08090c', colorSurface: '#111317',
    colorText: '#eef2f6', colorMuted: '#8b94a3', colorBorder: '#20242c',
    fontHeading: "'Space Grotesk', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '16px', radius: '14px', radiusLg: '20px', maxWidth: '1220px',
    layout: 'grid', columns: '3',
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
  sectionTitle: 'Stories',
  fontLinks: [GF('Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600'), GF('Inter:wght@400;500;600')],
  tokens: {
    colorPrimary: '#2c2622', colorAccent: '#a3672f', colorBg: '#f6f1e9', colorSurface: '#fffdf9',
    colorText: '#2c2622', colorMuted: '#857a6d', colorBorder: '#e6dccb',
    fontHeading: "'Newsreader', Georgia, serif", fontBody: "'Inter', system-ui, sans-serif",
    baseFontSize: '18px', radius: '16px', radiusLg: '26px', maxWidth: '1120px',
    layout: 'grid', columns: '2',
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

export const BLOG_TEMPLATES: readonly BlogTemplate[] = [aperture, editorial, beacon, noir, terra]

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
