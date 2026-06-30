#!/usr/bin/env node
// scripts/wa-diag.mjs — one-shot WhatsApp agent queue diagnostic.
// Reads .env.local, queries Supabase with the service-role key, prints the
// state of generation_jobs / wa_review_tokens / wa_threads so we can see whether
// jobs are stuck 'queued' (no driver) or 'done/error' (worker ran).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  let txt; try { txt = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m) continue
    let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('missing supabase env'); process.exit(1) }

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) return { error: `${res.status} ${await res.text()}` }
  return { rows: await res.json() }
}

const jobs = await q('generation_jobs?select=id,status,attempts,error,created_at,lease_until&order=created_at.desc&limit=10')
console.log('\n=== generation_jobs (latest 10) ===')
if (jobs.error) console.log(jobs.error)
else for (const j of jobs.rows) console.log(`${j.created_at}  ${j.status.padEnd(8)} attempts=${j.attempts} lease=${j.lease_until ?? '-'} ${j.error ? 'err='+j.error : ''}`)

const tok = await q('review_tokens?select=id,status,post_id,created_at,expires_at&order=created_at.desc&limit=5')
console.log('\n=== review_tokens (latest 5) ===')
if (tok.error) console.log(tok.error)
else for (const t of tok.rows) console.log(`${t.created_at}  ${t.status}  post=${t.post_id}`)

const th = await q('wa_threads?select=id,site_id,turn_count,cost_cents,agent_state,current_post_id,last_inbound_at&order=last_inbound_at.desc&limit=5')
console.log('\n=== wa_threads (latest 5) ===')
if (th.error) console.log(th.error)
else for (const t of th.rows) console.log(`${t.last_inbound_at}  site=${t.site_id ?? '-'} turns=${t.turn_count} cost=${t.cost_cents}c post=${t.current_post_id ?? '-'} state=${JSON.stringify(t.agent_state)}`)
