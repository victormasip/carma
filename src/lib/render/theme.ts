// Shared helpers for the public /render routes.
// Build full HTML pages that wrap Carma posts inside the client's own theme.
//
// Design notes:
// - Fallback CSS is ALWAYS included as a base, even if a theme exists.
//   The theme's <link rel="stylesheet"> and inline CSS load AFTER and
//   override by cascade order. This way a partially-extracted theme still
//   produces a styled, readable page.
// - When there are no published posts, we render a clear empty state so
//   the page is never "blank".

type Theme = {
  raw_css: string | null
  extracted_head: string | null
  extracted_header: string | null
  extracted_footer: string | null
  extracted_scripts: string | null
  external_styles: string[] | null
  external_scripts: string[] | null
  font_links: string[] | null
  base_url: string | null
  class_article_wrapper: string | null
  class_article_title: string | null
  class_article_content: string | null
  class_article_meta: string | null
  class_card_grid: string | null
  class_card: string | null
  class_main_wrapper: string | null
  is_enabled: boolean
}

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

// Strip leading dot from a stored class selector for use as a className.
function cls(stored: string | null, fallback: string): string {
  if (!stored) return fallback
  const trimmed = stored.trim()
  if (!trimmed) return fallback
  const matches = trimmed.match(/\.[A-Za-z0-9_-]+/g)
  if (matches && matches.length > 0) return matches.map(m => m.slice(1)).join(' ')
  return fallback
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

function themeDebugInfo(theme: Theme | null, postsCount: number): string {
  const items: string[] = []
  items.push(`theme: ${theme ? 'configured' : 'none (fallback)'}`)
  if (theme) {
    items.push(`enabled: ${theme.is_enabled}`)
    items.push(`head: ${theme.extracted_head ? theme.extracted_head.length + ' chars' : 'empty'}`)
    items.push(`header: ${theme.extracted_header ? theme.extracted_header.length + ' chars' : 'empty'}`)
    items.push(`footer: ${theme.extracted_footer ? theme.extracted_footer.length + ' chars' : 'empty'}`)
    items.push(`scripts: ${theme.extracted_scripts ? theme.extracted_scripts.length + ' chars' : 'empty'}`)
    items.push(`ext styles: ${(theme.external_styles ?? []).length}`)
    items.push(`ext scripts: ${(theme.external_scripts ?? []).length}`)
  }
  items.push(`posts: ${postsCount}`)
  return items.join(' · ')
}

// ─── Page builders ────────────────────────────────────────────────────────────

export function buildListingPage(theme: Theme | null, siteName: string, siteId: string, posts: Post[]): string {
  const head = buildHead(theme, siteName)
  const header = theme?.extracted_header ?? ''
  const footer = theme?.extracted_footer ?? ''
  const mainCls = cls(theme?.class_main_wrapper ?? null, 'carma-main')
  const gridCls = cls(theme?.class_card_grid ?? null, 'carma-grid')
  const cardCls = cls(theme?.class_card ?? null, 'carma-card')

  const body = posts.length > 0
    ? `<div class="${escapeAttr(gridCls)}">\n${posts.map(p => buildCardHtml(p, siteId, cardCls)).join('\n')}\n</div>`
    : buildEmptyState({
        title: 'Encara no hi ha articles publicats',
        description: `Quan publiquis articles al panell de Carma per <strong>${escapeHtml(siteName)}</strong>, apareixeran aquí amb el disseny configurat.`,
      })

  const scripts = theme?.extracted_scripts ?? ''

  return `<!doctype html>
<html lang="ca">
<head>
${head}
</head>
<body>
<!-- Carma render · ${themeDebugInfo(theme, posts.length)} -->
${header}
<main class="${escapeAttr(mainCls)}">
${body}
</main>
${footer}
${scripts}
</body>
</html>`
}

export function buildArticlePage(theme: Theme | null, siteName: string, siteId: string, post: Post): string {
  const head = buildHead(theme, `${post.title} · ${siteName}`)
  const header = theme?.extracted_header ?? ''
  const footer = theme?.extracted_footer ?? ''
  const mainCls = cls(theme?.class_main_wrapper ?? null, 'carma-main')
  const wrapperCls = cls(theme?.class_article_wrapper ?? null, 'carma-article')
  const titleCls = cls(theme?.class_article_title ?? null, 'carma-article-title')
  const contentCls = cls(theme?.class_article_content ?? null, 'carma-article-content')
  const metaCls = cls(theme?.class_article_meta ?? null, 'carma-article-meta')

  const contentHtml = getContentHtml(post)
  const featured = post.featured_image
    ? `<img src="${escapeAttr(post.featured_image)}" alt="${escapeAttr(post.title)}" class="carma-article-image" />`
    : ''

  const metaParts: string[] = []
  if (post.author_name) metaParts.push(`<span class="carma-author">${escapeHtml(post.author_name)}</span>`)
  metaParts.push(`<time datetime="${escapeAttr(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time>`)
  if (post.categories && post.categories.length > 0) {
    metaParts.push(`<span class="carma-categories">${post.categories.map(c => escapeHtml(c)).join(', ')}</span>`)
  }

  const scripts = theme?.extracted_scripts ?? ''

  return `<!doctype html>
<html lang="ca">
<head>
${head}
</head>
<body>
<!-- Carma render · article · ${themeDebugInfo(theme, 1)} -->
${header}
<main class="${escapeAttr(mainCls)}">
  <article class="${escapeAttr(wrapperCls)}">
    <a href="/render/${escapeAttr(siteId)}" class="carma-back-link">← Tornar al llistat</a>
    <h1 class="${escapeAttr(titleCls)}">${escapeHtml(post.title)}</h1>
    <div class="${escapeAttr(metaCls)}">${metaParts.join(' · ')}</div>
    ${featured}
    <div class="${escapeAttr(contentCls)}">
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
<style>${FALLBACK_CSS_INNER}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:1rem;font-family:system-ui,sans-serif;color:#444;text-align:center;padding:2rem}
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

// ─── Internals ────────────────────────────────────────────────────────────────

function buildHead(theme: Theme | null, title: string): string {
  // Order matters for CSS cascade:
  // 1. Charset + viewport (always first)
  // 2. Fallback CSS (always — base styling)
  // 3. Theme extracted head (overrides fallback via cascade)
  // 4. Theme raw_css (last — highest priority)
  const parts: string[] = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>${FALLBACK_CSS_INNER}</style>`,
  ]
  if (theme?.extracted_head) parts.push(theme.extracted_head)
  if (theme?.raw_css) parts.push(`<style>${theme.raw_css}</style>`)
  return parts.join('\n')
}

function buildCardHtml(post: Post, siteId: string, cardClass: string): string {
  const href = `/render/${siteId}/${encodeURIComponent(post.slug)}`
  const img = post.featured_image
    ? `<img src="${escapeAttr(post.featured_image)}" alt="${escapeAttr(post.title)}" />`
    : ''
  const excerpt = post.excerpt
    ? `<p class="carma-card-excerpt">${escapeHtml(post.excerpt)}</p>`
    : ''
  return `<article class="${escapeAttr(cardClass)}">
  <a href="${escapeAttr(href)}" class="carma-card-link">
    ${img}
    <h2 class="carma-card-title">${escapeHtml(post.title)}</h2>
    ${excerpt}
    <time datetime="${escapeAttr(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time>
  </a>
</article>`
}

function buildEmptyState({ title, description }: { title: string; description: string }): string {
  return `<div class="carma-empty">
  <svg class="carma-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
    <line x1="9" y1="9" x2="10" y2="9" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
  <h2 class="carma-empty-title">${title}</h2>
  <p class="carma-empty-desc">${description}</p>
</div>`
}

const FALLBACK_CSS_INNER = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#222;line-height:1.6;min-height:100vh}
.carma-main{max-width:1200px;margin:0 auto;padding:2rem 1rem}
.carma-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem}
.carma-card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:transform .2s,box-shadow .2s}
.carma-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.1)}
.carma-card-link{display:block;text-decoration:none;color:inherit;padding:1.5rem}
.carma-card img{width:calc(100% + 3rem);margin:-1.5rem -1.5rem 1rem;display:block;aspect-ratio:16/9;object-fit:cover}
.carma-card-title{margin:0 0 .5rem;font-size:1.125rem;font-weight:700;line-height:1.3}
.carma-card-excerpt{margin:0 0 .75rem;color:#666;font-size:.9rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.carma-card time{font-size:.75rem;color:#999;font-weight:500}
.carma-article{max-width:780px;margin:0 auto;background:#fff;padding:3rem 2rem;border-radius:12px}
.carma-back-link{display:inline-block;margin-bottom:1.5rem;color:#666;text-decoration:none;font-size:.875rem;font-weight:500}
.carma-back-link:hover{color:#222}
.carma-article-title,h1.carma-article-title{margin:0 0 1rem;font-size:2.25rem;font-weight:800;line-height:1.2}
.carma-article-meta{font-size:.875rem;color:#777;margin-bottom:2rem}
.carma-article-image{width:100%;max-height:480px;object-fit:cover;border-radius:8px;margin-bottom:2rem;display:block}
.carma-article-content{font-size:1.0625rem;color:#333}
.carma-article-content img{max-width:100%;height:auto;border-radius:4px;margin:1rem 0}
.carma-article-content h2{margin-top:2rem;font-size:1.5rem}
.carma-article-content h3{margin-top:1.5rem;font-size:1.25rem}
.carma-article-content p{margin:1rem 0}
.carma-article-content a{color:#0066cc;text-decoration:underline}
.carma-article-content blockquote{border-left:4px solid #ddd;padding-left:1rem;margin:1.5rem 0;color:#555;font-style:italic}
.carma-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem 2rem;text-align:center;background:#fff;border:2px dashed #e0e0e0;border-radius:16px;color:#666;max-width:560px;margin:2rem auto}
.carma-empty-icon{color:#bbb;margin-bottom:1rem}
.carma-empty-title{margin:0 0 .75rem;font-size:1.25rem;font-weight:700;color:#333}
.carma-empty-desc{margin:0;font-size:.9rem;line-height:1.6;color:#888}
`.trim()
