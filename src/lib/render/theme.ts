// Shared builders for the public /render routes AND the dashboard preview.
//
// Model (Theme Grabber):
//   · The client's <head> (fonts + stylesheets) + cloned <header>/<footer> are
//     emitted verbatim so the site chrome looks exactly like the original.
//   · The blog feed itself is OUR template, themed by the extracted design
//     tokens (colours, fonts, radii) exposed as CSS variables. Our template CSS
//     is emitted LAST and scoped under .carma-root so it wins over the client's
//     global rules and the feed stays on-brand but consistently OUR layout.

import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'

type Theme = {
  extracted_head?: string | null
  extracted_header?: string | null
  extracted_footer?: string | null
  extracted_scripts?: string | null
  design_tokens?: Partial<DesignTokens> | null
} | null

type Post = {
  id: string
  title: string
  slug: string
  content: { html?: string } | Record<string, unknown> | null
  excerpt: string | null
  featured_image: string | null
  categories: string[] | null
  tags: string[] | null
  author_name: string | null
  created_at: string
  is_published: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
const escapeAttr = escapeHtml

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ca-ES', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return iso }
}

function getContentHtml(post: Post): string {
  const c = post.content
  if (c && typeof c === 'object' && 'html' in c && typeof (c as { html: unknown }).html === 'string') {
    return (c as { html: string }).html
  }
  return ''
}

function tokensOf(theme: Theme): DesignTokens {
  return { ...DEFAULT_TOKENS, ...(theme?.design_tokens ?? {}) }
}

// ─── Token-driven CSS ───────────────────────────────────────────────────────

function buildTemplateCss(t: DesignTokens): string {
  return `
:root{
  --ct-primary:${t.colorPrimary};
  --ct-accent:${t.colorAccent};
  --ct-bg:${t.colorBg};
  --ct-surface:${t.colorSurface};
  --ct-text:${t.colorText};
  --ct-muted:${t.colorMuted};
  --ct-border:${t.colorBorder};
  --ct-font-heading:${t.fontHeading};
  --ct-font-body:${t.fontBody};
  --ct-size:${t.baseFontSize};
  --ct-radius:${t.radius};
  --ct-radius-lg:${t.radiusLg};
  --ct-max:${t.maxWidth};
}
.carma-root{background:var(--ct-bg);color:var(--ct-text);font-family:var(--ct-font-body);font-size:var(--ct-size);line-height:1.65;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.carma-root *,.carma-root *::before,.carma-root *::after{box-sizing:border-box}
.carma-main{max-width:var(--ct-max);margin:0 auto;padding:3rem 1.25rem}
.carma-root h1,.carma-root h2,.carma-root h3{font-family:var(--ct-font-heading);color:var(--ct-text);line-height:1.2;margin:0}
.carma-root a{color:inherit;text-decoration:none}
.carma-root img{display:block;max-width:100%}

/* Section heading */
.carma-section-title{font-family:var(--ct-font-heading);font-size:1.05rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--ct-muted);margin:0 0 1.25rem;padding-bottom:.6rem;border-bottom:2px solid var(--ct-border)}

/* Featured */
.carma-featured{display:grid;grid-template-columns:1.25fr 1fr;gap:1.75rem;align-items:stretch;background:var(--ct-surface);border:1px solid var(--ct-border);border-radius:var(--ct-radius-lg);overflow:hidden;margin-bottom:2.5rem}
.carma-featured-media{position:relative;min-height:260px;background:var(--ct-border)}
.carma-featured-media img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.carma-featured-body{padding:2rem;display:flex;flex-direction:column;justify-content:center;gap:.85rem}
.carma-badge{display:inline-block;align-self:flex-start;background:var(--ct-primary);color:#fff;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:.3rem .7rem;border-radius:999px}
.carma-featured-title{font-size:1.9rem;font-weight:800}
.carma-featured-excerpt{color:var(--ct-muted);font-size:1rem;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* Grid */
.carma-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.75rem}
.carma-card{background:var(--ct-surface);border:1px solid var(--ct-border);border-radius:var(--ct-radius-lg);overflow:hidden;display:flex;flex-direction:column;transition:transform .2s ease,box-shadow .2s ease}
.carma-card:hover{transform:translateY(-3px);box-shadow:0 16px 40px -16px rgba(0,0,0,.25)}
.carma-card-media{aspect-ratio:16/9;background:var(--ct-border);overflow:hidden}
.carma-card-media img{width:100%;height:100%;object-fit:cover}
.carma-card-body{padding:1.25rem 1.35rem 1.5rem;display:flex;flex-direction:column;gap:.6rem;flex:1}
.carma-card-title{font-size:1.18rem;font-weight:700}
.carma-card-excerpt{color:var(--ct-muted);font-size:.92rem;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1}
.carma-meta{font-size:.78rem;color:var(--ct-muted);font-weight:600;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.carma-meta .carma-cat{color:var(--ct-accent)}
.carma-card-link:hover .carma-card-title,.carma-featured:hover .carma-featured-title{color:var(--ct-accent)}

/* Article */
.carma-article{max-width:760px;margin:0 auto}
.carma-back{display:inline-flex;align-items:center;gap:.4rem;color:var(--ct-accent);font-weight:600;font-size:.88rem;margin-bottom:1.5rem}
.carma-article-title{font-size:2.5rem;font-weight:800;margin:0 0 1rem;line-height:1.15}
.carma-article-meta{font-size:.9rem;color:var(--ct-muted);margin-bottom:1.75rem;display:flex;gap:.6rem;flex-wrap:wrap}
.carma-article-image{width:100%;max-height:460px;object-fit:cover;border-radius:var(--ct-radius-lg);margin-bottom:2rem}
.carma-article-content{font-size:1.08rem;color:var(--ct-text);line-height:1.8}
.carma-article-content p{margin:1.15rem 0}
.carma-article-content h2{font-family:var(--ct-font-heading);font-size:1.6rem;margin:2rem 0 .75rem}
.carma-article-content h3{font-family:var(--ct-font-heading);font-size:1.3rem;margin:1.6rem 0 .6rem}
.carma-article-content img{border-radius:var(--ct-radius);margin:1.5rem 0}
.carma-article-content a{color:var(--ct-accent);text-decoration:underline}
.carma-article-content blockquote{border-left:4px solid var(--ct-accent);margin:1.5rem 0;padding:.5rem 0 .5rem 1.25rem;color:var(--ct-muted);font-style:italic}
.carma-article-content ul,.carma-article-content ol{padding-left:1.4rem;margin:1.15rem 0}

/* Empty state */
.carma-empty{text-align:center;padding:4.5rem 2rem;background:var(--ct-surface);border:2px dashed var(--ct-border);border-radius:var(--ct-radius-lg);max-width:560px;margin:0 auto}
.carma-empty-title{font-size:1.3rem;font-weight:800;margin:0 0 .6rem}
.carma-empty-desc{color:var(--ct-muted);margin:0;font-size:.95rem}

@media (max-width:720px){
  .carma-featured{grid-template-columns:1fr}
  .carma-featured-media{min-height:200px;position:relative}
  .carma-article-title{font-size:1.9rem}
}
`.trim()
}

function buildHead(theme: Theme, title: string, tokens: DesignTokens): string {
  const parts: string[] = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
  ]
  // Client head FIRST (fonts + stylesheets) so the cloned header/footer render
  // with the original look…
  if (theme?.extracted_head) parts.push(theme.extracted_head)
  // …then OUR token template CSS LAST so it wins for the feed.
  parts.push(`<style>${buildTemplateCss(tokens)}</style>`)
  return parts.join('\n')
}

function buildCard(post: Post, siteId: string): string {
  const href = `/render/${siteId}/${encodeURIComponent(post.slug)}`
  const media = post.featured_image
    ? `<div class="carma-card-media"><img src="${escapeAttr(post.featured_image)}" alt="${escapeAttr(post.title)}" loading="lazy" /></div>`
    : ''
  const excerpt = post.excerpt ? `<p class="carma-card-excerpt">${escapeHtml(post.excerpt)}</p>` : ''
  const cat = post.categories?.[0] ? `<span class="carma-cat">${escapeHtml(post.categories[0])}</span><span>·</span>` : ''
  return `<article class="carma-card"><a class="carma-card-link" href="${escapeAttr(href)}" style="display:flex;flex-direction:column;flex:1">
  ${media}
  <div class="carma-card-body">
    <div class="carma-meta">${cat}<time datetime="${escapeAttr(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time></div>
    <h2 class="carma-card-title">${escapeHtml(post.title)}</h2>
    ${excerpt}
  </div>
</a></article>`
}

function buildFeatured(post: Post, siteId: string): string {
  const href = `/render/${siteId}/${encodeURIComponent(post.slug)}`
  const media = post.featured_image
    ? `<div class="carma-featured-media"><img src="${escapeAttr(post.featured_image)}" alt="${escapeAttr(post.title)}" /></div>`
    : ''
  const excerpt = post.excerpt ? `<p class="carma-featured-excerpt">${escapeHtml(post.excerpt)}</p>` : ''
  return `<a class="carma-featured" href="${escapeAttr(href)}">
  ${media}
  <div class="carma-featured-body">
    <span class="carma-badge">Destacat</span>
    <h2 class="carma-featured-title">${escapeHtml(post.title)}</h2>
    ${excerpt}
    <div class="carma-meta"><time datetime="${escapeAttr(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time></div>
  </div>
</a>`
}

function buildEmptyState(siteName: string): string {
  return `<div class="carma-empty">
  <h2 class="carma-empty-title">Encara no hi ha articles publicats</h2>
  <p class="carma-empty-desc">Quan publiquis articles a Carma per <strong>${escapeHtml(siteName)}</strong>, apareixeran aquí amb el disseny del teu lloc.</p>
</div>`
}

// ─── Page builders ────────────────────────────────────────────────────────────

export function buildListingPage(theme: Theme, siteName: string, siteId: string, posts: Post[]): string {
  const tokens = tokensOf(theme)
  const head = buildHead(theme, siteName, tokens)
  const header = theme?.extracted_header ?? ''
  const footer = theme?.extracted_footer ?? ''
  const scripts = theme?.extracted_scripts ?? ''

  let feed: string
  if (posts.length === 0) {
    feed = buildEmptyState(siteName)
  } else {
    const [featured, ...rest] = posts
    const featuredHtml = buildFeatured(featured, siteId)
    const grid = rest.length > 0
      ? `<div class="carma-grid">\n${rest.map(p => buildCard(p, siteId)).join('\n')}\n</div>`
      : ''
    feed = `${featuredHtml}\n${grid}`
  }

  return `<!doctype html>
<html lang="ca">
<head>
${head}
</head>
<body>
${header}
<main class="carma-root carma-main">
<h1 class="carma-section-title">Articles</h1>
${feed}
</main>
${footer}
${scripts}
</body>
</html>`
}

export function buildArticlePage(theme: Theme, siteName: string, siteId: string, post: Post): string {
  const tokens = tokensOf(theme)
  const head = buildHead(theme, `${post.title} · ${siteName}`, tokens)
  const header = theme?.extracted_header ?? ''
  const footer = theme?.extracted_footer ?? ''
  const scripts = theme?.extracted_scripts ?? ''

  const contentHtml = getContentHtml(post)
  const featured = post.featured_image
    ? `<img src="${escapeAttr(post.featured_image)}" alt="${escapeAttr(post.title)}" class="carma-article-image" />`
    : ''

  const metaParts: string[] = []
  if (post.author_name) metaParts.push(`<span>${escapeHtml(post.author_name)}</span>`)
  metaParts.push(`<time datetime="${escapeAttr(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time>`)
  if (post.categories?.length) metaParts.push(`<span class="carma-cat">${post.categories.map(escapeHtml).join(', ')}</span>`)

  return `<!doctype html>
<html lang="ca">
<head>
${head}
</head>
<body>
${header}
<main class="carma-root carma-main">
  <article class="carma-article">
    <a href="/render/${escapeAttr(siteId)}" class="carma-back">← Tornar al llistat</a>
    <h1 class="carma-article-title">${escapeHtml(post.title)}</h1>
    <div class="carma-article-meta">${metaParts.join('<span>·</span>')}</div>
    ${featured}
    <div class="carma-article-content">
      ${contentHtml}
    </div>
  </article>
</main>
${footer}
${scripts}
</body>
</html>`
}

export function buildErrorPage(message: string, code = 404): { html: string; status: number } {
  const html = `<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${code} · Carma</title>
<style>
*{box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:1rem;font-family:system-ui,sans-serif;color:#444;text-align:center;padding:2rem;margin:0;background:#fafafa}
.err-code{font-size:3rem;margin:0;color:#999;font-weight:800}
.err-msg{margin:0;font-size:1rem;max-width:32rem}
</style>
</head>
<body>
<p class="err-code">${code}</p>
<p class="err-msg">${escapeHtml(message)}</p>
</body>
</html>`
  return { html, status: code }
}
