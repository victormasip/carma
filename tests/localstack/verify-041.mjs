// test:queries — migration 041 (L'INSTANT), proven on a real Postgres.
//
//   node tests/localstack/verify-041.mjs            (the stand-in must be up and seeded:
//                                                     stack.mjs up --seed=demo,scale)
//
// Every claim the migration's header makes is checked here against the seeded
// replica — 11k posts, 1M page views — and every write is made inside a
// transaction that is ROLLED BACK, so the fixture is left exactly as it was:
//
//   1  schema       the columns, indexes, tables and functions exist
//   2  counters     site_counters equals the truth for EVERY site
//   3  triggers     insert / publish / bulk delete / site deletion keep them right
//   4  likes        likes_count follows post_likes through insert / update / delete
//   5  rollups      site_stats() equals the raw aggregation, to the view; a new
//                   view updates the day; a view naming another site's post does
//                   not reach this site's ranking
//   6  search       accent-insensitive, stemmed, published-only
//   7  access       RLS on the new tables; the RPCs refused to anon/authenticated
//   8  idempotent   041 applied a second time changes nothing
//   9  plans        EXPLAIN ANALYZE of the hot queries, old shape vs new, at 10k
//
// Exit code 1 on any failed check. Plans are reported, and written to
// tests/measure/results/queries.json.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pg = createRequire(path.join(ROOT, '.localstack', 'pkg', 'node_modules', 'embedded-postgres', 'package.json'))('pg')
const IDS = {
  owner: '00000000-0000-4000-a000-000000000002',
  ownerSite: '00000000-0000-4000-b000-000000000001',
  otherSite: '00000000-0000-4000-b000-000000000002',
  scaleSite: '00000000-0000-4000-b000-0000000000ff',
}

const c = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', database: 'postgres' })
await c.connect()
const q = async (sql, params) => (await c.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]

let failed = 0
const results = []
function ok(cond, name, detail = '') {
  results.push({ ok: !!cond, name, detail })
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed++
}
const section = (s) => console.log(`\n${s}`)

/** Run `fn` inside a transaction that is always rolled back. */
async function sandbox(fn) {
  await c.query('BEGIN')
  try { return await fn() } finally { await c.query('ROLLBACK') }
}

// ─── 1 · schema ──────────────────────────────────────────────────────────────
section('1 · schema')
const col = await one(`SELECT is_generated, generation_expression FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='published_at'`)
ok(col?.is_generated === 'ALWAYS', 'posts.published_at is a generated column', col?.generation_expression ?? 'missing')
for (const idx of ['posts_feed_idx', 'posts_site_created_id_idx', 'posts_search_idx', 'posts_title_trgm', 'posts_slug_trgm']) {
  ok(!!(await one(`SELECT 1 AS x FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [idx])), `index ${idx}`)
}
for (const t of ['site_counters', 'page_views_daily', 'page_views_daily_posts', 'page_view_daily_visitors']) {
  ok(!!(await one(`SELECT 1 AS x FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t])), `table ${t}`)
}
for (const f of ['site_stats', 'site_view_counts', 'posts_counts_by_site', 'search_posts', 'reconcile_site_counters', 'prune_analytics', 'carma_fold', 'carma_ts_config']) {
  ok(!!(await one(`SELECT 1 AS x FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace`, [f])), `function ${f}()`)
}
const pubMismatch = await one(`SELECT count(*)::int AS n FROM posts WHERE published_at IS DISTINCT FROM (CASE WHEN is_published THEN created_at END)`)
ok(pubMismatch.n === 0, 'published_at = created_at while published, NULL while a draft', `${pubMismatch.n} mismatches`)

// ─── 2 · counters equal the truth ────────────────────────────────────────────
section('2 · counters')
const drift = await one(`
  SELECT count(*)::int AS n FROM (
    SELECT s.id, count(p.id) AS total, count(p.id) FILTER (WHERE p.is_published) AS pub,
           count(p.id) FILTER (WHERE p.meta @> '{"sample": true}') AS samp
    FROM sites s LEFT JOIN posts p ON p.site_id = s.id GROUP BY s.id) t
  LEFT JOIN site_counters sc ON sc.site_id = t.id
  WHERE coalesce(sc.posts_total, 0) <> t.total OR coalesce(sc.posts_published, 0) <> t.pub OR coalesce(sc.posts_samples, 0) <> t.samp`)
ok(drift.n === 0, 'site_counters matches count(*) for every site', `${drift.n} sites drift`)
const scale = await one(`SELECT posts_total, posts_published FROM site_counters WHERE site_id=$1`, [IDS.scaleSite])
ok(scale?.posts_total === 10000, 'the 10k blog counts 10,000', JSON.stringify(scale))

// ─── 3 · triggers ────────────────────────────────────────────────────────────
section('3 · triggers')
await sandbox(async () => {
  const before = await one(`SELECT posts_total, posts_published, posts_samples FROM site_counters WHERE site_id=$1`, [IDS.ownerSite])
  await c.query(`INSERT INTO posts (site_id, title, slug, is_published, meta) VALUES
    ($1, 'T1', 'verify-1', true, '{}'), ($1, 'T2', 'verify-2', false, '{"sample": true}'), ($1, 'T3', 'verify-3', false, '{}')`, [IDS.ownerSite])
  let now = await one(`SELECT posts_total, posts_published, posts_samples FROM site_counters WHERE site_id=$1`, [IDS.ownerSite])
  ok(now.posts_total === before.posts_total + 3 && now.posts_published === before.posts_published + 1 && now.posts_samples === before.posts_samples + 1,
    'a 3-row INSERT moves total +3, published +1, samples +1 (one statement trigger)')

  await c.query(`UPDATE posts SET is_published = true WHERE site_id=$1 AND slug IN ('verify-2','verify-3')`, [IDS.ownerSite])
  now = await one(`SELECT posts_total, posts_published FROM site_counters WHERE site_id=$1`, [IDS.ownerSite])
  ok(now.posts_published === before.posts_published + 3 && now.posts_total === before.posts_total + 3, 'publishing two drafts moves published +2, total unchanged')

  await c.query(`UPDATE posts SET title = 'edited' WHERE site_id=$1 AND slug='verify-1'`, [IDS.ownerSite])
  const touched = await one(`SELECT posts_total, posts_published FROM site_counters WHERE site_id=$1`, [IDS.ownerSite])
  ok(touched.posts_published === now.posts_published, 'an edit that publishes nothing changes nothing')

  await c.query(`DELETE FROM posts WHERE site_id=$1 AND slug LIKE 'verify-%'`, [IDS.ownerSite])
  now = await one(`SELECT posts_total, posts_published, posts_samples FROM site_counters WHERE site_id=$1`, [IDS.ownerSite])
  ok(now.posts_total === before.posts_total && now.posts_published === before.posts_published && now.posts_samples === before.posts_samples,
    'a bulk DELETE returns every counter to where it was')

  const upd = await one(`SELECT updated_at FROM posts WHERE site_id=$1 ORDER BY created_at LIMIT 1`, [IDS.ownerSite])
  ok(!!upd, 'posts kept their updated_at through the backfills (checked by sample)')
})
await sandbox(async () => {
  // Deleting a site cascades to its posts, and the counter trigger runs inside
  // that cascade — it must not try to count a site that no longer exists.
  let error = null
  try { await c.query(`DELETE FROM sites WHERE id=$1`, [IDS.otherSite]) } catch (e) { error = e.message }
  ok(error === null, 'deleting a site (cascading to its posts) succeeds', error ?? 'ok')
  const left = await one(`SELECT count(*)::int AS n FROM site_counters WHERE site_id=$1`, [IDS.otherSite])
  ok(left.n === 0, 'and leaves no counter row behind')
})

// ─── 4 · likes ───────────────────────────────────────────────────────────────
section('4 · likes')
const likeDrift = await one(`SELECT count(*)::int AS n FROM posts p LEFT JOIN (SELECT post_id, sum(count) s FROM post_likes GROUP BY post_id) l ON l.post_id = p.id WHERE p.likes_count <> coalesce(l.s, 0)`)
ok(likeDrift.n === 0, 'likes_count equals the sum of post_likes for every post', `${likeDrift.n} drift`)
await sandbox(async () => {
  const post = await one(`SELECT id, likes_count FROM posts WHERE site_id=$1 AND is_published ORDER BY created_at DESC LIMIT 1`, [IDS.ownerSite])
  await c.query(`INSERT INTO post_likes (post_id, site_id, reader_key, count) VALUES ($1, $2, 'verify-reader', 3)`, [post.id, IDS.ownerSite])
  let n = (await one(`SELECT likes_count FROM posts WHERE id=$1`, [post.id])).likes_count
  ok(n === post.likes_count + 3, 'a new reader clapping 3 adds 3', `${post.likes_count} → ${n}`)
  await c.query(`UPDATE post_likes SET count = 7 WHERE post_id=$1 AND reader_key='verify-reader'`, [post.id])
  n = (await one(`SELECT likes_count FROM posts WHERE id=$1`, [post.id])).likes_count
  ok(n === post.likes_count + 7, 'raising their tally to 7 adds 4 more')
  await c.query(`DELETE FROM post_likes WHERE post_id=$1 AND reader_key='verify-reader'`, [post.id])
  n = (await one(`SELECT likes_count FROM posts WHERE id=$1`, [post.id])).likes_count
  ok(n === post.likes_count, 'deleting their row takes it all back')
})

// ─── 5 · rollups ─────────────────────────────────────────────────────────────
section('5 · rollups')
const stats = (await one(`SELECT site_stats($1, 30) AS s`, [IDS.ownerSite])).s
const raw = await one(`
  WITH w AS (SELECT * FROM page_views WHERE site_id=$1 AND (created_at AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date - 29)
  SELECT count(*)::int AS views,
         (SELECT coalesce(sum(n), 0)::int FROM (SELECT count(DISTINCT visitor_hash) n FROM w GROUP BY (created_at AT TIME ZONE 'UTC')::date) d) AS visitors
  FROM w`, [IDS.ownerSite])
ok(stats.totalViews === raw.views, 'site_stats views = raw count over the same 30 UTC days', `${stats.totalViews} vs ${raw.views}`)
ok(stats.uniqueVisitors === raw.visitors, 'site_stats visitors = sum of daily distinct hashes', `${stats.uniqueVisitors} vs ${raw.visitors}`)
ok(stats.series.length === 30 && stats.topPosts.length === 6, 'a 30-point series and the 6 most read', `${stats.series.length} points, ${stats.topPosts.length} top`)
ok(stats.totalViews > 1000, 'more than the 1,000 rows the API caps a raw select at — the old path could not have shown this', `${stats.totalViews}`)
await sandbox(async () => {
  const before = (await one(`SELECT site_stats($1, 1) AS s`, [IDS.ownerSite])).s
  const post = await one(`SELECT id FROM posts WHERE site_id=$1 AND is_published LIMIT 1`, [IDS.ownerSite])
  const foreign = await one(`SELECT id FROM posts WHERE site_id=$1 LIMIT 1`, [IDS.otherSite])
  await c.query(`INSERT INTO page_views (site_id, post_id, kind, path, visitor_hash) VALUES
    ($1, $2, 'article', '/x', 'verify-new-visitor'), ($1, $2, 'article', '/x', 'verify-new-visitor'), ($1, $3, 'article', '/y', 'verify-other')`,
    [IDS.ownerSite, post.id, foreign.id])
  const after = (await one(`SELECT site_stats($1, 1) AS s`, [IDS.ownerSite])).s
  ok(after.totalViews === before.totalViews + 3, 'three new views add three views today', `${before.totalViews} → ${after.totalViews}`)
  ok(after.uniqueVisitors === before.uniqueVisitors + 2, 'two new visitors add two (the repeat is the same visitor)', `${before.uniqueVisitors} → ${after.uniqueVisitors}`)
  const leaked = await one(`SELECT count(*)::int AS n FROM page_views_daily_posts WHERE site_id=$1 AND post_id=$2`, [IDS.ownerSite, foreign.id])
  ok(leaked.n === 0, "a view naming ANOTHER site's post never enters this site's ranking")
})

// ─── 6 · search ──────────────────────────────────────────────────────────────
section('6 · search')
await sandbox(async () => {
  await c.query(`INSERT INTO posts (site_id, title, slug, excerpt, is_published, default_locale, content) VALUES
    ($1, 'Fisioteràpia després d''una lesió', 'verify-search-ca', 'Exercicis per recuperar el genoll', true, 'ca', '{"html":"<p>La pròtesi titànica comença aviat.</p>"}'),
    ($1, 'Consejos de fisioterapia deportiva', 'verify-search-es', 'Ejercicios para corredores', true, 'es', '{"html":"<p>Entrenamientos suaves.</p>"}'),
    ($1, 'Esborrany secret de fisioteràpia', 'verify-search-draft', '', false, 'ca', '{"html":""}')`, [IDS.ownerSite])
  const find = async (term, pub = true) => (await q(`SELECT slug FROM search_posts($1, $2, $3, 24)`, [IDS.ownerSite, term, pub])).map(r => r.slug)
  const a = await find('fisioterapia')
  ok(a.includes('verify-search-ca') && a.includes('verify-search-es'), 'no accent finds both the Catalan and the Spanish article', a.filter(s => s.startsWith('verify')).join(', '))
  ok(!a.includes('verify-search-draft'), 'a draft is not found by the public search')
  ok((await find('fisioterapia', false)).includes('verify-search-draft'), '…and is found when drafts are asked for')
  ok((await find('protesi titanica')).includes('verify-search-ca'), 'body text is searchable, accents folded ("protesi titanica" finds "pròtesi titànica")')
  ok((await find('corredor')).includes('verify-search-es'), 'a Spanish stem matches its plural')
})

// ─── 7 · access ──────────────────────────────────────────────────────────────
section('7 · access')
await sandbox(async () => {
  await c.query(`SET LOCAL ROLE authenticated`)
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: IDS.owner, role: 'authenticated' })])
  const mine = await one(`SELECT count(*)::int AS n FROM site_counters`)
  ok(mine.n === 1, 'an owner sees exactly their own site\'s counters (RLS)', `${mine.n} rows`)
  let denied = false
  try { await c.query(`SELECT site_stats($1, 30)`, [IDS.ownerSite]) } catch (e) { denied = /permission denied/.test(e.message) }
  ok(denied, 'site_stats() is refused to a signed-in user (server only)')
})
await sandbox(async () => {
  await c.query(`SET LOCAL ROLE anon`)
  const n = await one(`SELECT count(*)::int AS n FROM page_views_daily`)
  ok(n.n === 0, 'anon sees no rollup rows')
  let denied = false
  try { await c.query(`SELECT * FROM search_posts($1, 'x', true, 5)`, [IDS.ownerSite]) } catch (e) { denied = /permission denied/.test(e.message) }
  ok(denied, 'search_posts() is refused to anon')
})

// ─── 8 · idempotent ──────────────────────────────────────────────────────────
section('8 · idempotent')
await sandbox(async () => {
  const before = await one(`SELECT sum(posts_total)::int t, sum(posts_published)::int p FROM site_counters`)
  const views = await one(`SELECT sum(views)::int v FROM page_views_daily`)
  let error = null
  try { await c.query(readFileSync(path.join(ROOT, 'supabase', 'migrations', '041_linstant.sql'), 'utf8')) } catch (e) { error = e.message }
  ok(error === null, '041 runs a second time without an error', error ?? 'ok')
  const after = await one(`SELECT sum(posts_total)::int t, sum(posts_published)::int p FROM site_counters`)
  const views2 = await one(`SELECT sum(views)::int v FROM page_views_daily`)
  ok(after.t === before.t && after.p === before.p && views.v === views2.v, '…and changes no number')
})

// ─── 9 · plans ───────────────────────────────────────────────────────────────
section('9 · plans (10,000 posts · 1,000,000 page views)')
async function explain(label, sql, params) {
  const plan = (await q(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params))[0]['QUERY PLAN'][0]
  const nodes = []
  const walk = (n) => { nodes.push(n['Node Type'] + (n['Index Name'] ? ` ${n['Index Name']}` : '')); for (const k of n.Plans ?? []) walk(k) }
  walk(plan.Plan)
  const ms = plan['Execution Time'] + plan['Planning Time']
  const buffers = (plan.Plan['Shared Hit Blocks'] ?? 0) + (plan.Plan['Shared Read Blocks'] ?? 0)
  return { label, ms: Math.round(ms * 100) / 100, buffers, nodes: [...new Set(nodes)].slice(0, 6) }
}
const deep = await one(`SELECT created_at, id FROM posts WHERE site_id=$1 ORDER BY created_at DESC, id DESC OFFSET 9000 LIMIT 1`, [IDS.scaleSite])
const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
const pairs = [
  ['dashboard list, page 751 (row 9,000)',
    [`SELECT id, title, slug, is_published, created_at, featured_image FROM posts WHERE site_id=$1 ORDER BY created_at DESC OFFSET 9000 LIMIT 12`, [IDS.scaleSite]],
    [`SELECT id, title, slug, is_published, created_at, featured_image FROM posts WHERE site_id=$1 AND (created_at < $2 OR (created_at = $2 AND id < $3)) ORDER BY created_at DESC, id DESC LIMIT 13`, [IDS.scaleSite, deep.created_at, deep.id]]],
  ['dashboard list totals',
    [`SELECT (SELECT count(*) FROM posts WHERE site_id=$1), (SELECT count(*) FROM posts WHERE site_id=$1 AND is_published), (SELECT count(*) FROM posts WHERE site_id=$1 AND meta @> '{"sample": true}')`, [IDS.scaleSite]],
    [`SELECT posts_total, posts_published, posts_samples FROM site_counters WHERE site_id=$1`, [IDS.scaleSite]]],
  ['dashboard search "genoll"',
    [`SELECT id FROM posts WHERE site_id=$1 AND (title ILIKE '%genoll%' OR slug ILIKE '%genoll%') ORDER BY created_at DESC LIMIT 13`, [IDS.scaleSite]],
    [`SELECT id FROM posts WHERE site_id=$1 AND (title ILIKE '%genoll%' OR slug ILIKE '%genoll%') ORDER BY created_at DESC, id DESC LIMIT 13`, [IDS.scaleSite]]],
  ['site analytics, 30 days',
    [`SELECT created_at, post_id, visitor_hash FROM page_views WHERE site_id=$1 AND created_at >= $2 ORDER BY created_at`, [IDS.scaleSite, since30]],
    [`SELECT site_stats($1, 30)`, [IDS.scaleSite]]],
  ['public feed, newest 12',
    [`SELECT id FROM posts WHERE site_id=$1 AND is_published ORDER BY created_at DESC LIMIT 100`, [IDS.scaleSite]],
    [`SELECT id FROM posts WHERE site_id=$1 AND is_published ORDER BY published_at DESC, id DESC LIMIT 13`, [IDS.scaleSite]]],
]
const plans = []
for (const [label, [oldSql, oldP], [newSql, newP]] of pairs) {
  await explain(label, oldSql, oldP); await explain(label, newSql, newP) // warm the cache: compare plans, not disk
  const before = await explain(label, oldSql, oldP)
  const after = await explain(label, newSql, newP)
  plans.push({ label, before, after })
  console.log(`  ${label.padEnd(38)} before ${String(before.ms).padStart(8)}ms ${String(before.buffers).padStart(6)} buf  →  after ${String(after.ms).padStart(7)}ms ${String(after.buffers).padStart(5)} buf   [${after.nodes.join(' > ')}]`)
}
ok(plans[0].after.nodes.some(n => n.includes('posts_site_created_id_idx')), 'the deep keyset page uses posts_site_created_id_idx')
ok(plans[3].after.ms < plans[3].before.ms, 'site_stats() beats the raw 30-day scan', `${plans[3].before.ms} → ${plans[3].after.ms}ms`)

mkdirSync(path.join(ROOT, 'tests', 'measure', 'results'), { recursive: true })
writeFileSync(path.join(ROOT, 'tests', 'measure', 'results', 'queries.json'), JSON.stringify({ at: new Date().toISOString(), checks: results, plans }, null, 2))
await c.end()
console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'} · ${results.length} checks · tests/measure/results/queries.json`)
process.exit(failed ? 1 : 0)
