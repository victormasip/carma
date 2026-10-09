// LOCALSTACK fixtures. Two profiles, both deterministic (same rows every run):
//
//   demo   — what an owner and a superadmin actually open: an owner's blog wearing a
//            REAL captured chrome from the Barcelona corpus (`.grabber-cache`), 240
//            posts with real remote images, 60 days of traffic (~42k page views —
//            above the 1,000-row API cap and near the dashboard's 50k scan cap), a
//            second blog whose capture is NOT faithful, a starter-template blog
//            with no captured chrome at all (isolates OUR bytes in Lighthouse), and
//            56 small blogs + 30 clients for the superadmin views.
//   scale  — one blog with 10,000 posts and 1,000,000 page views over a year: the
//            fixture the plan's scale-invariance and query-plan gates run against.
//
// Corpus chrome is a research fixture of real businesses' public pages. It stays
// on this machine: the seeded blogs are named by corpus id, never by the business.
//
// Needs the TS loader (it captures chrome with the REAL capture modules):
//   node --experimental-strip-types --no-warnings --import ./tests/register.mjs tests/localstack/stack.mjs up --seed=demo

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// NOT imported from stack.mjs: the CLI there awaits this module at top level, and
// a static import back into a module suspended at a top-level await deadlocks.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CORPUS = path.join(ROOT, '.grabber-cache')
const PASSWORD = 'localstack'

// Stable ids so measurements can address the same rows on every run.
export const IDS = {
  admin: '00000000-0000-4000-a000-000000000001',
  owner: '00000000-0000-4000-a000-000000000002',
  ownerSite: '00000000-0000-4000-b000-000000000001',
  unfaithfulSite: '00000000-0000-4000-b000-000000000002',
  templateSite: '00000000-0000-4000-b000-000000000003',
  scaleSite: '00000000-0000-4000-b000-0000000000ff',
}

// Real, stable, remote images (Lorem Picsum serves a fixed photo per id). The
// blog's images are other people's URLs in production too — /api/img fetches
// and transforms them exactly as it would a customer's CDN.
const photo = (n, w = 2000, h = 1333) => `https://picsum.photos/id/${10 + (n % 80)}/${w}/${h}.jpg`

// ─── Chrome from the corpus, through the real capture modules ────────────────

async function themeFromCorpus(id) {
  const { EVAL_DATASET } = await import('../../src/lib/grabber-lab/evalDataset.ts')
  const { collectStylesheets } = await import('../../src/lib/grabber-lab/evalRun.ts')
  const { splitPageChrome } = await import('../../src/lib/scrape/pageSplit.ts')
  const { compileChromeCss } = await import('../../src/lib/scrape/chromeCompiler.ts')
  const { buildExtractedHead } = await import('../../src/lib/scrape/headerFooter.ts')
  const { extractTokens, DEFAULT_TOKENS } = await import('../../src/lib/scrape/tokens.ts')
  const { parse } = createRequire(path.join(ROOT, 'package.json'))('node-html-parser')

  const c = EVAL_DATASET.find(x => x.id === id)
  const file = path.join(CORPUS, 'html', `${id}.html`)
  if (!c || !existsSync(file)) return null
  const sha1 = s => createHash('sha1').update(s).digest('hex')
  const cssFor = url => { const f = path.join(CORPUS, 'css', `${sha1(url).slice(0, 20)}.css`); return existsSync(f) ? readFileSync(f, 'utf8') : null }

  const html = readFileSync(file, 'utf8'), base = new URL(c.url), root = parse(html)
  const split = splitPageChrome(html, base)
  const { urls, inline, fontLinks } = collectStylesheets(html, base)
  const sheets = []; let budget = 400_000
  for (const u of urls.slice(0, 8)) {
    const css = cssFor(u); if (!css) continue
    const s = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
    budget -= s.length; sheets.push(s)
  }
  const rawCss = [...inline, ...sheets].join('\n')
  const compiled = compileChromeCss({ css: rawCss, headerHtml: split.top, footerHtml: split.bottom, bodyAttrs: split.bodyAttrs })
  return {
    url: c.url,
    row: {
      reference_url: c.url, base_url: base.origin,
      extracted_head: buildExtractedHead(root, base), extracted_header: split.top, extracted_footer: split.bottom,
      extracted_body_attrs: split.bodyAttrs,
      compiled_chrome_css: compiled.stats.rulesOut > 0 ? compiled.css : null,
      font_links: fontLinks, detected_framework: 'wordpress', detected_hosting: null,
      design_tokens: { ...DEFAULT_TOKENS, ...extractTokens({ root, cssTexts: [rawCss], fontLinks }) },
      default_locale: 'ca', section_title: 'Blog',
    },
  }
}

async function templateTheme(name) {
  const { getTemplate, templateChromeJson } = await import('../../src/lib/render/templates.ts')
  const { DEFAULT_TOKENS } = await import('../../src/lib/scrape/tokens.ts')
  const tpl = getTemplate('editorial')
  const chrome = templateChromeJson(tpl, name)
  return {
    extracted_header: chrome.header, extracted_footer: chrome.footer, extracted_head: null,
    font_links: tpl.fontLinks ?? [], design_tokens: { ...DEFAULT_TOKENS, ...tpl.tokens },
    default_locale: 'ca', section_title: tpl.sectionTitle,
  }
}

// ─── Content ─────────────────────────────────────────────────────────────────

const WORDS = 'consells salut barcelona família prevenció hàbits alimentació esport recuperació lesió tractament exercici postura esquena genoll espatlla estiramentes entrenament descans hidratació'.split(' ')
const sentence = (n, seed) => Array.from({ length: n }, (_, i) => WORDS[(seed * 7 + i * 3) % WORDS.length]).join(' ')
const title = (i) => sentence(7, i).replace(/^./, m => m.toUpperCase())

function articleHtml(i) {
  const fig = (k) => `<figure class="carma-figure"><img src="${photo(i * 3 + k, 1600, 1067)}" alt="${sentence(4, i + k)}"><figcaption>${sentence(6, i + k)}</figcaption></figure>`
  const blocks = []
  for (let s = 0; s < 8; s++) {
    blocks.push(`<h2 id="seccio-${s}">${title(i + s)}</h2><p>${sentence(70, i + s)}</p><p>${sentence(55, i + s + 1)}</p>`)
    if (s === 2) blocks.push(fig(1))
    if (s === 5) blocks.push(fig(2))
  }
  return blocks.join('')
}

async function createUser(pg, id, email, role = 'client', plan = 'free') {
  await pg.query(
    `INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, $2, crypt($3, gen_salt('bf', 4)))
     ON CONFLICT (id) DO NOTHING`, [id, email, PASSWORD])
  await pg.query('UPDATE public.profiles SET role = $2, plan = $3, email = $4 WHERE id = $1', [id, role, plan, email])
}

async function createSite(pg, { id, name, subdomain, origin, logo, owner, createdDaysAgo = 30 }) {
  await pg.query(
    `INSERT INTO public.sites (id, name, subdomain, origin_url, logo_url, created_at)
     VALUES ($1, $2, $3, $4, $5, now() - make_interval(days => $6)) ON CONFLICT (id) DO NOTHING`,
    [id, name, subdomain, origin, logo, createdDaysAgo])
  if (owner) await pg.query('INSERT INTO public.site_users (site_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, owner])
}

async function putTheme(pg, siteId, row) {
  const cols = Object.keys(row)
  await pg.query(
    `INSERT INTO public.site_themes (site_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (site_id) DO NOTHING`,
    [siteId, ...cols.map(c => (row[c] !== null && typeof row[c] === 'object' && !Array.isArray(row[c])) ? JSON.stringify(row[c]) : row[c])])
}

/** Posts in one INSERT … SELECT: content built in SQL from a per-row template. */
async function insertPosts(pg, siteId, n, { published = 0.92, i18nShare = 0.3, withImages = true, contentHtml } = {}) {
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({
      title: title(i), slug: `article-${i}`, excerpt: sentence(26, i + 3),
      featured_image: withImages ? photo(i) : null,
      categories: [['Consells', 'Lesions', 'Esport', 'Nutrició'][i % 4]],
      tags: ['salut', WORDS[i % WORDS.length]],
      is_published: (i % 100) < published * 100,
      days: i * 0.25 + (i % 7) * 0.01,
      content: contentHtml ? contentHtml(i) : articleHtml(i),
      i18n: i / n < i18nShare ? { es: { title: `ES · ${title(i)}`, slug: `es-articulo-${i}`, excerpt: sentence(20, i), content: { html: `<p>${sentence(80, i)}</p>` } } } : {},
    })
  }
  // Batches keep each statement under Postgres' parameter limit.
  for (let b = 0; b < rows.length; b += 200) {
    const batch = rows.slice(b, b + 200)
    const values = []
    const params = []
    batch.forEach((r, k) => {
      const o = k * 11
      values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}::jsonb, $${o + 5}, $${o + 6}, $${o + 7}::text[], $${o + 8}::text[], $${o + 9}, now() - make_interval(secs => $${o + 10}::float8 * 86400), $${o + 11}::jsonb, 'ca', 'Equip', '{}'::jsonb)`)
      params.push(siteId, r.title, r.slug, JSON.stringify({ html: r.content }), r.excerpt, r.featured_image, r.categories, r.tags, r.is_published, r.days, JSON.stringify(r.i18n))
    })
    await pg.query(
      `INSERT INTO public.posts (site_id, title, slug, content, excerpt, featured_image, categories, tags, is_published, created_at, i18n, default_locale, author_name, meta)
       VALUES ${values.join(', ')} ON CONFLICT (site_id, slug) DO NOTHING`, params)
  }
}

/** Page views generated in SQL: `perDay` views a day for `days` days, ~30% distinct visitors a day. */
async function insertViews(pg, siteId, { days, perDay }) {
  await pg.query(`
    WITH recent AS (
      SELECT coalesce(array_agg(id ORDER BY created_at DESC), '{}') AS ids,
             coalesce(array_agg(slug ORDER BY created_at DESC), '{}') AS slugs
      FROM (SELECT id, slug, created_at FROM public.posts
            WHERE site_id = $1 AND is_published ORDER BY created_at DESC LIMIT 40) x
    )
    INSERT INTO public.page_views (site_id, post_id, kind, path, locale, referrer_host, visitor_hash, created_at)
    SELECT $1,
           CASE WHEN g % 4 = 0 OR cardinality(r.ids) = 0 THEN NULL ELSE r.ids[1 + g % cardinality(r.ids)] END,
           CASE WHEN g % 4 = 0 OR cardinality(r.ids) = 0 THEN 'listing' ELSE 'article' END,
           CASE WHEN g % 4 = 0 OR cardinality(r.ids) = 0 THEN '/' ELSE '/' || r.slugs[1 + g % cardinality(r.ids)] END,
           'ca', CASE WHEN g % 3 = 0 THEN 'google.com' ELSE NULL END,
           md5((g % ($3::int * 3 / 10 + 1))::text || ':' || (g / $3::int)::text),
           now() - make_interval(secs => (g::float8 / $3::int) * 86400)
    FROM generate_series(0, $2::int * $3::int - 1) AS g, recent r`, [siteId, days, perDay])
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function seed(pg, profile) {
  const t0 = performance.now()
  if (profile === 'demo') {
    const done = (await pg.query('SELECT 1 FROM public.sites WHERE id = $1', [IDS.ownerSite])).rowCount
    if (done) return { profile, skipped: 'already seeded' }

    await createUser(pg, IDS.admin, 'admin@carma.local', 'superadmin', 'agency')
    await createUser(pg, IDS.owner, 'owner@carma.local', 'client', 'free')
    const clients = []
    for (let i = 1; i <= 30; i++) {
      const id = `00000000-0000-4000-a000-${String(100 + i).padStart(12, '0')}`
      await createUser(pg, id, `client-${String(i).padStart(2, '0')}@carma.local`)
      clients.push(id)
    }

    const castro = await themeFromCorpus('physio-castro')
    await createSite(pg, { id: IDS.ownerSite, name: 'Demo · physio-castro', subdomain: 'castro', origin: castro?.url ?? null, logo: photo(1, 400, 400), owner: IDS.owner, createdDaysAgo: 90 })
    if (castro) await putTheme(pg, IDS.ownerSite, castro.row)
    await insertPosts(pg, IDS.ownerSite, 240)
    await insertViews(pg, IDS.ownerSite, { days: 60, perDay: 700 })
    await pg.query(`INSERT INTO public.post_likes (post_id, site_id, reader_key, count)
      SELECT p.id, p.site_id, md5(p.id::text || g::text), 1 + (g % 5)
      FROM (SELECT id, site_id FROM public.posts WHERE site_id = $1 AND is_published ORDER BY created_at DESC LIMIT 30) p,
           generate_series(1, 12) g ON CONFLICT DO NOTHING`, [IDS.ownerSite])

    const cdb = await themeFromCorpus('dental-cdb')
    await createSite(pg, { id: IDS.unfaithfulSite, name: 'Demo · dental-cdb', subdomain: 'cdb', origin: cdb?.url ?? null, logo: photo(2, 400, 400), owner: clients[0], createdDaysAgo: 60 })
    if (cdb) await putTheme(pg, IDS.unfaithfulSite, cdb.row)
    await insertPosts(pg, IDS.unfaithfulSite, 40)

    await createSite(pg, { id: IDS.templateSite, name: 'Demo · template', subdomain: 'plantilla', origin: null, logo: null, owner: clients[1], createdDaysAgo: 45 })
    await putTheme(pg, IDS.templateSite, await templateTheme('Demo · template'))
    await insertPosts(pg, IDS.templateSite, 24, { i18nShare: 0 })
    await insertViews(pg, IDS.templateSite, { days: 30, perDay: 60 })

    for (let i = 0; i < 56; i++) {
      const id = `00000000-0000-4000-b000-${String(1000 + i).padStart(12, '0')}`
      await createSite(pg, { id, name: `Demo blog ${i + 1}`, subdomain: `demo-${i + 1}`, origin: null, logo: i % 3 ? photo(20 + i, 400, 400) : null, owner: clients[(i + 2) % clients.length], createdDaysAgo: 5 + i })
      await insertPosts(pg, id, i % 30, { i18nShare: 0, contentHtml: (k) => `<p>${sentence(120, k)}</p>` })
      if (i % 4 === 0) await insertViews(pg, id, { days: 30, perDay: 20 + i })
    }
  } else if (profile === 'scale') {
    const done = (await pg.query('SELECT 1 FROM public.sites WHERE id = $1', [IDS.scaleSite])).rowCount
    if (done) return { profile, skipped: 'already seeded' }
    await createSite(pg, { id: IDS.scaleSite, name: 'Scale · 10k', subdomain: 'scale', origin: null, logo: null, owner: null, createdDaysAgo: 400 })
    await putTheme(pg, IDS.scaleSite, await templateTheme('Scale · 10k'))
    await insertPosts(pg, IDS.scaleSite, 10_000, { i18nShare: 0.1, contentHtml: (k) => `<h2>${title(k)}</h2><p>${sentence(160, k)}</p>` })
    await insertViews(pg, IDS.scaleSite, { days: 365, perDay: 2740 })
  } else {
    throw new Error(`unknown seed profile "${profile}"`)
  }
  await pg.query('ANALYZE')
  const counts = (await pg.query(`SELECT
      (SELECT count(*) FROM public.sites)::int AS sites, (SELECT count(*) FROM public.posts)::int AS posts,
      (SELECT count(*) FROM public.page_views)::int AS page_views, (SELECT count(*) FROM auth.users)::int AS users`)).rows[0]
  return { profile, ms: Math.round(performance.now() - t0), ...counts }
}
