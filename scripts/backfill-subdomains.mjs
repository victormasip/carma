#!/usr/bin/env node
// Backfill `sites.subdomain` for sites created before subdomain provisioning
// (or while migration 021 was pending). Idempotent: only touches rows where
// subdomain IS NULL/empty; derives the label from the site name exactly like
// the app (slugifySubdomain) and disambiguates collisions with a short suffix.
//
// Usage:  node scripts/backfill-subdomains.mjs [--dry]
// Env:    NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from
//         .env.local automatically if present).

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Minimal .env.local loader (no dependency): KEY=VALUE lines only.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them or run from the repo root with .env.local).')
  process.exit(1)
}
const dry = process.argv.includes('--dry')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

// Mirror of src/lib/sites/domain.ts slugifySubdomain (kept in sync by hand —
// this script must stay runnable without the TS build).
function slugifySubdomain(name) {
  const base = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return base || 'blog'
}

const { data: sites, error } = await admin
  .from('sites')
  .select('id, name, subdomain')
  .order('created_at', { ascending: true })
if (error) {
  console.error('Could not list sites:', error.message)
  process.exit(1)
}

const taken = new Set(sites.filter((s) => s.subdomain).map((s) => s.subdomain))
const missing = sites.filter((s) => !s.subdomain || !String(s.subdomain).trim())
console.log(`${sites.length} sites · ${missing.length} without a subdomain${dry ? ' (dry run)' : ''}`)

for (const site of missing) {
  const base = slugifySubdomain(site.name)
  let candidate = base
  let i = 0
  while (taken.has(candidate)) {
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`
    if (++i > 8) candidate = `${base}-${Date.now().toString(36).slice(-5)}`
  }
  taken.add(candidate)
  if (dry) {
    console.log(`  would set ${site.id}  «${site.name}» → ${candidate}`)
    continue
  }
  const { error: upErr } = await admin.from('sites').update({ subdomain: candidate }).eq('id', site.id)
  console.log(upErr ? `  ✗ ${site.id} «${site.name}»: ${upErr.message}` : `  ✓ ${site.id}  «${site.name}» → ${candidate}`)
}
console.log('Done.')
