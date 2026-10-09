// LOCALSTACK — a Supabase stand-in on this machine: real Postgres 17, real
// PostgREST, and a gateway that answers the slice of the Auth API the app calls.
//
// WHY. Every performance number about the dashboard, every query plan, every
// migration test needs a database — and the only database the repo knew was
// production. This one is disposable, seeded on purpose (10,000 posts, a million
// page views), and reached by the app through the SAME supabase-js calls it makes
// in production: `NEXT_PUBLIC_SUPABASE_URL` simply points here.
//
//   node tests/localstack/stack.mjs up [--fresh] [--seed=demo,scale]
//       → starts everything, applies shim + baseline + supabase/migrations/*.sql,
//         seeds, prints the env block, and stays up until Ctrl+C.
//   node tests/localstack/stack.mjs env
//       → prints the env block only (keys are derived, not secret).
//
//   import { startStack } from './tests/localstack/stack.mjs'   (gates use this)
//
// Binaries are fetched once into .localstack/ (git-ignored): the
// `embedded-postgres` npm package (a real Postgres build, no service install)
// and the PostgREST release binary. Nothing here can reach a Supabase project.

import { spawn, execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '..', '..')
const CACHE = path.join(ROOT, '.localstack')
const PKG = path.join(CACHE, 'pkg')
const BIN = path.join(CACHE, 'bin')

export const PORTS = { pg: 54329, rest: 54330, gateway: 54321 }
const PG_VERSION = '17.10.0-beta.17'
const POSTGREST_VERSION = 'v12.2.12'

// A fixed, local-only secret: the keys below are derived from it, so the env
// block is the same on every run and every machine. It protects nothing real.
export const JWT_SECRET = 'carma-localstack-jwt-secret-not-for-production-0001'

// ─── JWTs (HS256) ────────────────────────────────────────────────────────────

const b64url = (buf) => Buffer.from(buf).toString('base64url')
export function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
export function verifyJwt(token) {
  const [head, body, sig] = String(token ?? '').split('.')
  if (!head || !body || !sig) return null
  const want = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')
  if (want !== sig) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (claims.exp && claims.exp * 1000 < Date.now()) return null
    return claims
  } catch { return null }
}

const FOREVER = 4102444800 // 2100-01-01
export const ANON_KEY = signJwt({ iss: 'supabase-local', role: 'anon', exp: FOREVER })
export const SERVICE_KEY = signJwt({ iss: 'supabase-local', role: 'service_role', exp: FOREVER })

/** The env a `next build` / `next start` needs to talk to this stack instead of production. */
export function stackEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PORTS.gateway}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  }
}

/**
 * A logged-in session for a seeded user, as @supabase/ssr stores it: cookie
 * `sb-<host label>-auth-token` = `base64-` + base64url(JSON session). The label
 * for 127.0.0.1 is "127". Under ~3,180 encoded chars it is a single cookie.
 */
export function sessionCookie(user) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 24 * 3600
  const access = signJwt({
    sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated',
    iat: now, exp, session_id: randomUUID(), iss: `http://127.0.0.1:${PORTS.gateway}/auth/v1`,
  })
  const session = {
    access_token: access, token_type: 'bearer', expires_in: exp - now, expires_at: exp,
    refresh_token: `local-refresh-${user.id}`,
    user: authUser(user),
  }
  return { name: 'sb-127-auth-token', value: `base64-${b64url(JSON.stringify(session))}` }
}

function authUser(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.created_at ?? new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    identities: [], created_at: u.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
    is_anonymous: false,
  }
}

// ─── Binaries ────────────────────────────────────────────────────────────────

/**
 * The Postgres build that ships inside the `embedded-postgres` npm package, used
 * for its BINARIES only: its own launcher spawns postgres.exe directly, which a
 * Windows session with administrator rights is refused ("Execution of PostgreSQL
 * by a user with administrative permissions is not permitted"). `pg_ctl` starts
 * the server through a restricted token, so we drive initdb/pg_ctl ourselves.
 */
function ensurePostgresBinaries() {
  const entry = path.join(PKG, 'node_modules', 'embedded-postgres', 'package.json')
  if (!existsSync(entry)) {
    mkdirSync(PKG, { recursive: true })
    if (!existsSync(path.join(PKG, 'package.json'))) writeFileSync(path.join(PKG, 'package.json'), '{"name":"carma-localstack","private":true}')
    console.log(`[localstack] installing embedded-postgres@${PG_VERSION} into .localstack/pkg (one time)…`)
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '--no-audit', '--no-fund', `embedded-postgres@${PG_VERSION}`],
      { cwd: PKG, stdio: 'inherit', shell: process.platform === 'win32' })
  }
  const os = process.platform === 'win32' ? 'windows' : process.platform
  const bin = path.join(PKG, 'node_modules', '@embedded-postgres', `${os}-${process.arch}`, 'native', 'bin')
  if (!existsSync(bin)) throw new Error(`[localstack] no Postgres binaries at ${bin}`)
  const exe = (n) => path.join(bin, process.platform === 'win32' ? `${n}.exe` : n)
  return { bin, initdb: exe('initdb'), pgCtl: exe('pg_ctl'), require: createRequire(entry) }
}

async function ensurePostgrest() {
  const exe = path.join(BIN, process.platform === 'win32' ? 'postgrest.exe' : 'postgrest')
  if (existsSync(exe)) return exe
  mkdirSync(BIN, { recursive: true })
  const asset = process.platform === 'win32' ? `postgrest-${POSTGREST_VERSION}-windows-x86-64.zip`
    : process.platform === 'linux' ? `postgrest-${POSTGREST_VERSION}-linux-static-x86-64.tar.xz`
    : null
  if (!asset) throw new Error(`[localstack] no PostgREST asset for ${process.platform}; put the binary at ${exe}`)
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/${asset}`
  console.log(`[localstack] downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`[localstack] PostgREST download failed: ${res.status}`)
  const archive = path.join(BIN, asset)
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
  if (asset.endsWith('.zip')) execFileSync('tar', ['-xf', archive, '-C', BIN])
  else execFileSync('tar', ['-xJf', archive, '-C', BIN])
  rmSync(archive, { force: true })
  if (!existsSync(exe)) throw new Error('[localstack] PostgREST archive did not contain the binary')
  return exe
}

// ─── Postgres ────────────────────────────────────────────────────────────────

/** Every file the schema is built from, in order: platform shim, baseline, migrations. */
export function schemaFiles() {
  const migDir = path.join(ROOT, 'supabase', 'migrations')
  return [
    path.join(HERE, 'shim.sql'),
    path.join(HERE, 'baseline.sql'),
    ...readdirSync(migDir).filter(f => f.endsWith('.sql')).sort().map(f => path.join(migDir, f)),
  ]
}

async function applySchema(client, { only } = {}) {
  await client.query('CREATE SCHEMA IF NOT EXISTS localstack')
  await client.query('CREATE TABLE IF NOT EXISTS localstack.applied (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
  const done = new Set((await client.query('SELECT name FROM localstack.applied')).rows.map(r => r.name))
  const applied = []
  for (const file of schemaFiles()) {
    const name = path.basename(file)
    if (done.has(name)) continue
    if (only && !only(name)) continue
    const sql = readFileSync(file, 'utf8')
    const t0 = performance.now()
    try {
      await client.query(sql)
    } catch (e) {
      throw new Error(`[localstack] ${name} failed: ${e.message}${e.position ? ` (at char ${e.position})` : ''}`)
    }
    await client.query('INSERT INTO localstack.applied (name) VALUES ($1)', [name])
    applied.push({ name, ms: Math.round(performance.now() - t0) })
  }
  return applied
}

// ─── The gateway: /rest/v1 → PostgREST, /auth/v1 → the slice the app uses ────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, range, x-client-info, accept-profile, content-profile, x-supabase-api-version')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD')
  res.setHeader('Access-Control-Expose-Headers', 'content-range, content-location, preference-applied')
}

function json(res, status, body) {
  cors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

function bearer(req) {
  const h = req.headers.authorization ?? ''
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : String(req.headers.apikey ?? '')
}

function startGateway(pgClient, stats, latencyMs = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORTS.gateway}`)
    // PRODUCTION DISTANCE. Locally every Supabase call costs ~1ms; from a Vercel
    // function it costs a network round trip, and that — not render time — is what
    // a page with 19 calls pays. `latencyMs` adds one such trip to every API call.
    if (latencyMs > 0 && (url.pathname.startsWith('/rest/v1') || url.pathname.startsWith('/auth/v1'))) {
      await new Promise(r => setTimeout(r, latencyMs))
    }
    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return }

    // How many API round trips the app has made — read before and after one page
    // load, the difference is that page's database cost (the N+1 detector).
    if (url.pathname === '/__localstack/stats') return json(res, 200, { ...stats, latencyMs, byPath: Object.fromEntries(stats.byPath), authBy: Object.fromEntries(stats.authBy) })

    if (url.pathname.startsWith('/rest/v1')) {
      const table = url.pathname.slice('/rest/v1/'.length) || '/'
      stats.byPath.set(table, (stats.byPath.get(table) ?? 0) + 1)
      stats.rest++
      const target = url.pathname.slice('/rest/v1'.length) || '/'
      const headers = { ...req.headers, host: `127.0.0.1:${PORTS.rest}` }
      // Kong's rule: no Authorization header → the apikey is the bearer.
      if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`
      const up = httpRequest({ host: '127.0.0.1', port: PORTS.rest, method: req.method, path: target + url.search, headers }, (upRes) => {
        cors(res)
        const h = { ...upRes.headers }
        delete h['access-control-allow-origin']
        res.writeHead(upRes.statusCode ?? 502, h)
        upRes.pipe(res)
      })
      up.on('error', (e) => json(res, 502, { message: `PostgREST unreachable: ${e.message}` }))
      req.pipe(up)
      return
    }

    if (url.pathname.startsWith('/auth/v1')) {
      stats.auth++
      // WHO asked: a browser (the client SDK) or the server (proxy, page, action) —
      // the split that says which of the two to fix when the number is high.
      const who = /Mozilla|Chrome|Safari/.test(String(req.headers['user-agent'] ?? '')) ? 'browser' : 'server'
      const key = `${who} ${req.method} ${url.pathname.slice('/auth/v1'.length)}`
      stats.authBy.set(key, (stats.authBy.get(key) ?? 0) + 1)
      const route = url.pathname.slice('/auth/v1'.length)
      if (route === '/user' && req.method === 'GET') {
        const claims = verifyJwt(bearer(req))
        if (!claims?.sub) return json(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
        const { rows } = await pgClient.query('SELECT id, email, created_at FROM auth.users WHERE id = $1', [claims.sub])
        if (!rows[0]) return json(res, 404, { code: 404, error_code: 'user_not_found', msg: 'User not found' })
        return json(res, 200, authUser({ ...rows[0], created_at: rows[0].created_at.toISOString() }))
      }
      if (route === '/token' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const grant = url.searchParams.get('grant_type')
        let row = null
        if (grant === 'password') {
          const r = await pgClient.query(
            "SELECT id, email, created_at FROM auth.users WHERE lower(email) = lower($1) AND encrypted_password = crypt($2, encrypted_password)",
            [body.email ?? '', body.password ?? ''])
          row = r.rows[0] ?? null
        } else if (grant === 'refresh_token') {
          const id = String(body.refresh_token ?? '').replace(/^local-refresh-/, '')
          const r = await pgClient.query('SELECT id, email, created_at FROM auth.users WHERE id::text = $1', [id])
          row = r.rows[0] ?? null
        }
        if (!row) return json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
        const user = { ...row, created_at: row.created_at.toISOString() }
        const cookie = sessionCookie(user)
        return json(res, 200, JSON.parse(Buffer.from(cookie.value.slice('base64-'.length), 'base64url').toString('utf8')))
      }
      if (route === '/logout') { cors(res); res.writeHead(204); res.end(); return }
      return json(res, 404, { code: 404, msg: `localstack: auth route ${route} not implemented` })
    }

    json(res, 404, { message: `localstack: ${url.pathname} not implemented` })
  })
  return new Promise((resolve) => server.listen(PORTS.gateway, '127.0.0.1', () => resolve(server)))
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** Kill the process a previous run recorded, if it is still alive. Only ours: by recorded PID. */
function killPidFile(file) {
  if (!existsSync(file)) return
  const pid = Number(readFileSync(file, 'utf8').trim())
  rmSync(file, { force: true })
  if (!Number.isInteger(pid) || pid <= 0) return
  try { process.kill(pid) } catch { /* already gone */ }
}

async function waitFor(fn, ms, what) {
  const until = Date.now() + ms
  let last
  while (Date.now() < until) {
    try { if (await fn()) return } catch (e) { last = e }
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error(`[localstack] timed out waiting for ${what}${last ? `: ${last.message}` : ''}`)
}

/**
 * Start Postgres + PostgREST + the gateway. `fresh` wipes the data directory;
 * otherwise an existing cluster is reused (migrations not yet applied are —
 * unless `migrate: false`, which serves a snapshot exactly as it was, e.g. the
 * pre-041 state production is in until the founder applies the migration).
 * Returns { env, pg (a superuser pg.Client), stop() }.
 */
export async function startStack({ fresh = false, dataDir = path.join(CACHE, 'data'), quiet = false, latencyMs = 0, migrate = true } = {}) {
  const bins = ensurePostgresBinaries()
  const pgLib = bins.require('pg')
  const postgrestExe = await ensurePostgrest()

  // pg_ctl detaches the server and Windows never reaps a dead parent's children,
  // so a previous run that died leaves Postgres and PostgREST holding the ports.
  const pgCtl = (...args) => execFileSync(bins.pgCtl, ['-D', dataDir, ...args], { stdio: 'ignore' })
  if (existsSync(path.join(dataDir, 'postmaster.pid'))) { try { pgCtl('-m', 'immediate', '-w', 'stop') } catch { /* stale pid file */ } }
  killPidFile(path.join(CACHE, 'postgrest.pid'))
  if (fresh) rmSync(dataDir, { recursive: true, force: true })
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    execFileSync(bins.initdb, ['-D', dataDir, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C'], { stdio: 'ignore' })
  }
  // A scale fixture writes a million rows: give the planner real memory, and
  // don't fsync a database that exists to be thrown away.
  const opts = [`-p ${PORTS.pg}`, '-c listen_addresses=127.0.0.1', '-c shared_buffers=256MB', '-c work_mem=32MB',
    '-c fsync=off', '-c synchronous_commit=off', '-c full_page_writes=off', '-c max_connections=60'].join(' ')
  pgCtl('-l', path.join(CACHE, 'postgres.log'), '-o', opts, '-w', '-t', '60', 'start')
  const pg = { stop: async () => { try { pgCtl('-m', 'fast', '-w', 'stop') } catch { /* already down */ } } }

  const client = new pgLib.Client({ host: '127.0.0.1', port: PORTS.pg, user: 'postgres', database: 'postgres' })
  await client.connect()
  const applied = migrate || fresh ? await applySchema(client) : []
  if (!quiet && applied.length) console.log(`[localstack] applied ${applied.length} schema files (${applied.map(a => `${a.name}:${a.ms}ms`).join(', ')})`)

  const conf = path.join(CACHE, 'postgrest.conf')
  writeFileSync(conf, [
    `db-uri = "postgres://authenticator:localstack@127.0.0.1:${PORTS.pg}/postgres"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    `jwt-secret = "${JWT_SECRET}"`,
    'server-host = "127.0.0.1"',
    `server-port = ${PORTS.rest}`,
    'db-pool = 20',
    // Supabase's default API "Max rows". Production answers ANY select with at
    // most 1,000 rows unless the project changed it — the stand-in must too.
    'db-max-rows = 1000',
    'db-channel-enabled = true',
    'log-level = "crit"',
  ].join('\n'))
  // PostgREST links libpq dynamically; the Postgres build's bin dir carries it
  // (on Windows a missing DLL is a silent exit 0xC0000135, not an error message).
  const rest = spawn(postgrestExe, [conf], {
    stdio: quiet ? 'ignore' : ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PATH: `${bins.bin}${path.delimiter}${process.env.PATH ?? ''}` },
  })
  writeFileSync(path.join(CACHE, 'postgrest.pid'), String(rest.pid))
  await waitFor(async () => (await fetch(`http://127.0.0.1:${PORTS.rest}/`, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } })).ok, 30_000, 'PostgREST')

  const stats = { rest: 0, auth: 0, byPath: new Map(), authBy: new Map() }
  const gateway = await startGateway(client, stats, latencyMs)

  const stop = async () => {
    await new Promise(r => gateway.close(() => r()))
    rest.kill()
    rmSync(path.join(CACHE, 'postgrest.pid'), { force: true })
    await client.end().catch(() => {})
    await pg.stop()
  }
  return { env: stackEnv(), pg: client, pgLib, stats, applied, stop, reloadSchema: () => client.query("NOTIFY pgrst, 'reload schema'") }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const cmd = process.argv[2] ?? 'up'
  const flag = (n) => process.argv.find(a => a === `--${n}` || a.startsWith(`--${n}=`))
  if (cmd === 'env') {
    for (const [k, v] of Object.entries(stackEnv())) console.log(`${k}=${v}`)
  } else if (cmd === 'up') {
    // --data=<dir> serves another cluster under .localstack/ (e.g. data-pre041,
    // the seeded state before migration 041 — the fail-open path production runs
    // until the migration is applied).
    const data = flag('data')?.split('=')[1]
    // --latency=<ms> adds one network round trip to every API call (see startGateway).
    const latencyMs = Number(flag('latency')?.split('=')[1] ?? 0) || 0
    const stack = await startStack({ fresh: !!flag('fresh'), latencyMs, migrate: !flag('no-migrate'), ...(data ? { dataDir: path.join(CACHE, data) } : {}) })
    const seedArg = flag('seed')?.split('=')[1]
    if (seedArg) {
      const { seed } = await import('./seed.mjs')
      for (const profile of seedArg.split(',')) {
        const out = await seed(stack.pg, profile)
        console.log(`[localstack] seeded "${profile}":`, JSON.stringify(out))
      }
      await stack.reloadSchema()
    }
    console.log('\n# localstack is up — point the app at it with:')
    for (const [k, v] of Object.entries(stack.env)) console.log(`${k}=${v}`)
    const shutdown = async () => { await stack.stop(); process.exit(0) }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } else {
    console.error('usage: node tests/localstack/stack.mjs up [--fresh] [--seed=demo,scale] [--data=<dir>] [--no-migrate] [--latency=<ms>] | env')
    process.exit(2)
  }
}
