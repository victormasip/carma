// The canvas lab's server, for the browser gates (test:canvas, test:editor-fidelity).
//
// LAB_URL set → use that server. Otherwise boot the BUILT app (`npm run build`
// first) on a random port with CARMA_LAB=1 — the flag the lab route 404s without —
// and stop it when the process exits. Same approach as test:vitals.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

async function up(base) {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`${base}/lab/canvas?preset=noir`); if (r.ok) return true } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 700))
  }
  return false
}

export async function labServer() {
  if (process.env.LAB_URL) return { base: process.env.LAB_URL, stop: () => {} }
  const root = process.cwd()
  if (!existsSync(path.join(root, '.next', 'server', 'app'))) throw new Error('no build found — run `npm run build` first')
  const port = 3960 + Math.floor(Math.random() * 30)
  const server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
    cwd: root, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, NODE_ENV: 'production', CARMA_LAB: '1' },
  })
  const stop = () => { try { server.kill() } catch { /* gone */ } }
  process.on('exit', stop)
  const base = `http://127.0.0.1:${port}`
  if (!await up(base)) { stop(); throw new Error('the lab server never came up') }
  return { base, stop }
}
