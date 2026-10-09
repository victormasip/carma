// A CDN in front of `next start`, so a local number means what a production one means.
//
// In production every public blog page and every `/api/img` variant is served by
// Vercel's edge after the first request; locally, without this, every Lighthouse
// run would re-encode every AVIF with sharp and re-render every page — measuring
// a cold origin no reader ever meets. The rules are Vercel's, as documented:
//
//   · a response is stored when `Vercel-CDN-Cache-Control`, `CDN-Cache-Control`
//     or `Cache-Control: s-maxage` allows it (never `private` / `no-store`, never
//     with `Set-Cookie`), and for `/_next/static/*` (immutable build assets);
//   · `Vary` is honoured (Accept for /api/img, Accept-Encoding for everything);
//   · the CDN-only headers are stripped before the browser sees them;
//   · `Vercel-Cache-Tag` is remembered, and `POST /__cdn/purge?tag=` evicts by tag.
//
// It answers `x-vercel-cache: HIT | MISS | STALE | BYPASS` like the real one.

import { createServer, request as httpRequest } from 'node:http'

function directive(value, name) {
  const m = new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*(\\d+)`, 'i').exec(value ?? '')
  return m ? Number(m[1]) : null
}

/** How long the edge may keep this response (seconds), or 0. */
export function edgeTtl(path, headers) {
  if (headers['set-cookie']) return { ttl: 0, swr: 0 }
  const cdn = headers['vercel-cdn-cache-control'] ?? headers['cdn-cache-control']
  if (cdn) return { ttl: directive(cdn, 'max-age') ?? directive(cdn, 's-maxage') ?? 0, swr: directive(cdn, 'stale-while-revalidate') ?? 0 }
  const cc = String(headers['cache-control'] ?? '')
  if (/\b(private|no-store)\b/i.test(cc)) return { ttl: 0, swr: 0 }
  const s = directive(cc, 's-maxage')
  if (s !== null) return { ttl: s, swr: directive(cc, 'stale-while-revalidate') ?? 0 }
  if (path.startsWith('/_next/static/')) return { ttl: 31536000, swr: 0 }
  return { ttl: 0, swr: 0 }
}

export function startCdn({ port, upstreamPort }) {
  const cache = new Map()
  const stats = { hit: 0, miss: 0, stale: 0, bypass: 0 }

  const fetchUpstream = (req, body) => new Promise((resolve, reject) => {
    const up = httpRequest({ host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers: req.headers }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 502, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    up.on('error', reject)
    up.end(body)
  })

  const keyFor = (req, vary) => {
    const parts = [req.method, req.headers.host ?? '', req.url ?? '']
    for (const h of String(vary ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)) parts.push(`${h}=${req.headers[h] ?? ''}`)
    return parts.join('|')
  }

  const send = (res, entry, state) => {
    const headers = { ...entry.headers, 'x-vercel-cache': state }
    delete headers['vercel-cdn-cache-control']
    delete headers['cdn-cache-control']
    delete headers['vercel-cache-tag']
    delete headers['transfer-encoding']
    delete headers.connection
    headers['content-length'] = String(entry.body.length)
    res.writeHead(entry.status, headers)
    res.end(entry.body)
  }

  const server = createServer(async (req, res) => {
    const body = await new Promise(r => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => r(Buffer.concat(c))) })
    const path = (req.url ?? '/').split('?')[0]

    if (req.method === 'POST' && path === '/__cdn/purge') {
      const tag = new URL(req.url, 'http://x').searchParams.get('tag') ?? ''
      let n = 0
      for (const [k, e] of cache) if (e.tags.includes(tag)) { cache.delete(k); n++ }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ purged: n })); return
    }
    if (req.method === 'GET' && path === '/__cdn/stats') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...stats, entries: cache.size })); return
    }

    const cacheable = req.method === 'GET' || req.method === 'HEAD'
    if (cacheable) {
      // Two-step lookup: the stored entry tells us which request headers it varies on.
      const probe = cache.get(keyFor(req, cache.get(`vary|${req.headers.host}|${req.url}`)))
      if (probe) {
        const age = (Date.now() - probe.at) / 1000
        if (age <= probe.ttl) { stats.hit++; return send(res, probe, 'HIT') }
        if (age <= probe.ttl + probe.swr) {
          stats.stale++
          send(res, probe, 'STALE')
          fetchUpstream(req, body).then(fresh => {
            if (fresh.status !== 200) return
            probe.at = Date.now(); probe.body = fresh.body; probe.headers = fresh.headers
          }).catch(() => {})
          return
        }
      }
    }

    let up
    try { up = await fetchUpstream(req, body) } catch (e) { res.writeHead(502); res.end(`upstream error: ${e.message}`); return }
    const { ttl, swr } = cacheable && up.status === 200 ? edgeTtl(path, up.headers) : { ttl: 0, swr: 0 }
    if (ttl > 0) {
      stats.miss++
      const vary = up.headers.vary ?? ''
      cache.set(`vary|${req.headers.host}|${req.url}`, vary)
      const tags = String(up.headers['vercel-cache-tag'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const entry = { status: up.status, headers: up.headers, body: up.body, at: Date.now(), ttl, swr, tags }
      cache.set(keyFor(req, vary), entry)
      return send(res, entry, 'MISS')
    }
    stats.bypass++
    send(res, { status: up.status, headers: up.headers, body: up.body }, 'BYPASS')
  })

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    stats, cache,
    stop: () => new Promise(r => server.close(() => r())),
  })))
}
