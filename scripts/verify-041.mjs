// Did migration 041 land? — run AFTER pasting supabase/migrations/041_linstant.sql
// into the Supabase SQL Editor:
//
//   node scripts/verify-041.mjs
//
// Reads .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) and asks
// the project's API — read-only, nothing is written — whether each piece of 041 is
// visible: the new columns, tables and functions, and that the counters agree with
// a direct count for a handful of sites. It never prints data, only verdicts.
//
// The full proof of the migration's behaviour (triggers, cascades, rollups vs raw,
// RLS, idempotency, query plans at 10k posts) runs against a local replica:
// `node tests/localstack/verify-041.mjs` — see tests/localstack/stack.mjs.

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local'); process.exit(2) }
const H = { apikey: key, Authorization: `Bearer ${key}` }

let failed = 0
const ok = (cond, name, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failed++ }
const get = (path, extra = {}) => fetch(`${url}/rest/v1/${path}`, { headers: { ...H, ...extra } })
const rpc = (fn, args) => fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })

const spec = await (await get('', { Accept: 'application/openapi+json' })).json()
const cols = (t) => Object.keys(spec.definitions?.[t]?.properties ?? {})
ok(cols('posts').includes('published_at'), 'posts.published_at')
ok(cols('posts').includes('likes_count'), 'posts.likes_count')
ok(cols('posts').includes('search'), 'posts.search')
for (const t of ['site_counters', 'page_views_daily', 'page_views_daily_posts']) ok(!!spec.definitions?.[t], `table ${t}`)
for (const f of ['site_stats', 'search_posts', 'reconcile_site_counters', 'prune_analytics']) ok(!!spec.paths?.[`/rpc/${f}`], `function ${f}()`)

// The counters, spot-checked against direct counts for up to five sites.
const counters = await (await get('site_counters?select=site_id,posts_total,posts_published&limit=5')).json()
let checked = 0, drift = 0
for (const c of Array.isArray(counters) ? counters : []) {
  const total = Number((await get(`posts?select=id&site_id=eq.${c.site_id}`, { Prefer: 'count=exact', Range: '0-0' })).headers.get('content-range')?.split('/')[1] ?? -1)
  const pub = Number((await get(`posts?select=id&site_id=eq.${c.site_id}&is_published=eq.true`, { Prefer: 'count=exact', Range: '0-0' })).headers.get('content-range')?.split('/')[1] ?? -1)
  checked++
  if (total !== c.posts_total || pub !== c.posts_published) drift++
}
ok(checked > 0 && drift === 0, 'site_counters agree with direct counts', `${checked} sites checked, ${drift} drifting`)

const statsRes = await rpc('site_stats', { p_site_id: counters?.[0]?.site_id ?? '00000000-0000-0000-0000-000000000000', p_days: 30 })
ok(statsRes.ok, 'site_stats() answers', `HTTP ${statsRes.status}`)

console.log(failed ? `\n${failed} check(s) failed — is the whole of 041 applied?` : '\n041 is live. The dashboard now reads counters and rollups.')
process.exit(failed ? 1 : 0)
