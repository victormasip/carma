#!/usr/bin/env node
// scripts/wa-replay.mjs — local Kapso webhook simulator.
//
// Constructs a VALID Kapso `whatsapp.message.received` JSON payload (an inbound
// WhatsApp message), signs it with HMAC-SHA256 using KAPSO_WEBHOOK_SECRET exactly
// like the real Kapso platform, and POSTs it to the local webhook. Lets you drive
// the whole agent loop on localhost without a real phone or Kapso delivery.
//
// Reads KAPSO_WEBHOOK_SECRET / KAPSO_PHONE_NUMBER_ID from .env.local automatically
// (no dependency — tiny built-in parser), so the signature always matches the
// running server (which reads the same file). Node 20+, zero dependencies.
//
// USAGE
//   node scripts/wa-replay.mjs --from +34600111222 --text "Vull un article sobre maridatges de vins del Priorat"
//   node scripts/wa-replay.mjs --from +34600111222                       # audio (default sample)
//   node scripts/wa-replay.mjs --from +34600111222 --audio-url https://host/voice.ogg
//
// FLAGS
//   --from <+E164>     sender phone. MUST match an ACTIVE wa_identities.phone_e164 (required)
//   --text "<brief>"   send a TEXT message (skips media + Whisper — the reliable smoke test)
//   --audio-url <url>  PUBLIC audio url for the voice note (default sample below).
//                      NOTE: must be public — the SSRF guard blocks localhost/private hosts.
//   --pnid <id>        phone_number_id (default: KAPSO_PHONE_NUMBER_ID from env)
//   --id <wamid>       message id for dedupe (default: random; reuse it to test idempotency)
//   --url <webhook>    target webhook (default: http://localhost:3000/api/whatsapp/webhook)
//   --help

import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// A short, public, speech audio clip (Wikimedia Commons, public domain). Override
// with --audio-url. Must be PUBLIC: safeFetchBinary refuses localhost/private hosts.
const DEFAULT_SAMPLE_AUDIO = 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFiles() {
  for (const f of ['.env.local', '.env']) {
    let txt
    try { txt = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let val = m[2]
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val
    }
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++ } else { out[key] = true }
  }
  return out
}

function die(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

loadEnvFiles()
const args = parseArgs(process.argv.slice(2))

if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 27).join('\n').replace(/^\/\/ ?/gm, ''))
  process.exit(0)
}

const WEBHOOK_URL = (typeof args.url === 'string' && args.url) || process.env.WA_WEBHOOK_URL || 'http://carma.cat/api/whatsapp/webhook'
const SECRET = process.env.KAPSO_WEBHOOK_SECRET
const FROM = (typeof args.from === 'string' && args.from) || process.env.WA_TEST_FROM || ''
const PNID = (typeof args.pnid === 'string' && args.pnid) || process.env.KAPSO_PHONE_NUMBER_ID || '000000000000000'
const WAMID = (typeof args.id === 'string' && args.id) || `wamid.SIM${randomBytes(10).toString('hex')}`
const AUDIO_URL = (typeof args['audio-url'] === 'string' && args['audio-url']) || process.env.WA_SAMPLE_AUDIO_URL || DEFAULT_SAMPLE_AUDIO
const TEXT = typeof args.text === 'string' ? args.text : null

if (!SECRET) die('KAPSO_WEBHOOK_SECRET is not set. Add it to .env.local (any value for local — it just has to match the running server, which reads the same file).')
if (!FROM || !/^\+\d{6,15}$/.test(FROM)) die('Provide --from +<E164>, e.g. --from +34600111222. It MUST match an ACTIVE wa_identities.phone_e164 row, or the webhook drops it (200, no job). See the runbook for the seed SQL.')

const phoneDigits = FROM.replace(/^\+/, '')
const timestamp = Math.floor(Date.now() / 1000).toString()

// Kapso `data.message` shape (see docs.kapso.ai event-types). Text vs audio.
const message = TEXT !== null
  ? {
      id: WAMID, timestamp, type: 'text', from: phoneDigits,
      text: { body: TEXT },
      kapso: { direction: 'inbound', status: 'received', origin: 'cloud_api', has_media: false, content: TEXT },
    }
  : {
      id: WAMID, timestamp, type: 'audio', from: phoneDigits,
      audio: { id: `media-SIM${randomBytes(6).toString('hex')}`, mime_type: 'audio/ogg', voice: true },
      kapso: { direction: 'inbound', status: 'received', origin: 'cloud_api', has_media: true, media_url: AUDIO_URL, media_data: { url: AUDIO_URL } },
    }

const payload = {
  event: 'whatsapp.message.received',
  data: {
    message,
    conversation: { id: `conv-SIM-${phoneDigits}` },
    is_new_conversation: false,
    phone_number_id: PNID,
  },
}

// Sign the EXACT bytes we send (the webhook verifies HMAC over the raw body).
const body = JSON.stringify(payload)
const signature = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')

console.log(`→ POST ${WEBHOOK_URL}`)
console.log(`  ${TEXT !== null ? 'text' : 'audio'} message · from ${FROM} · id ${WAMID}`)
if (TEXT === null) console.log(`  media_url ${AUDIO_URL}`)

let res
try {
  res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'whatsapp.message.received',
      'X-Webhook-Signature': signature,
      'X-Idempotency-Key': randomUUID(),
      'X-Webhook-Payload-Version': 'v2',
    },
    body,
  })
} catch (e) {
  die(`Could not reach the webhook. Is \`npm run dev\` running? (${e instanceof Error ? e.message : e})`)
}

const text = await res.text()
console.log(`\n← ${res.status} ${res.statusText}: ${text}`)

if (res.status === 403) {
  die('403 — signature rejected. KAPSO_WEBHOOK_SECRET in .env.local does not match the value the running server loaded. Restart `npm run dev` after editing .env.local.')
}
if (res.ok) {
  console.log('\n✓ Accepted. Now wake the worker to process the queued job:')
  console.log('    curl "http://carma.cat/api/whatsapp/cron?key=<CRON_SECRET>"')
  console.log('  Then watch the `npm run dev` console for:  [wa/dev] review link → http://carma.cat/review/<token>')
}
