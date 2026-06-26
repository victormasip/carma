// Netlify Scheduled Function — the 1-minute re-driver for the WhatsApp agent.
//
// Netlify detects the schedule from the exported `config.schedule` and invokes
// this handler on cron. It does no work itself: it POSTs to the worker Route
// Handler (which can import the app's libs) with the shared secret. The job queue
// is durable + lease-based, so this also recovers jobs from a crashed worker.
//
// Dependency-free on purpose (this file is in the app tsconfig via **/*.mts):
// only globals (fetch, process, console). No @netlify/functions import needed.

export default async function handler(): Promise<void> {
  // Netlify sets URL to the site's primary URL at runtime; allow an override.
  const base = (process.env.WA_WORKER_INTERNAL_URL || process.env.URL || '').replace(/\/+$/, '')
  const secret = process.env.WA_WORKER_SECRET
  if (!base || !secret) {
    console.error('[wa/cron] missing WA_WORKER_INTERNAL_URL/URL or WA_WORKER_SECRET')
    return
  }
  try {
    const res = await fetch(`${base}/api/whatsapp/worker?limit=5`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (!res.ok) console.error('[wa/cron] worker returned', res.status)
  } catch (e) {
    console.error('[wa/cron] worker call failed:', e instanceof Error ? e.message : e)
  }
}

export const config = { schedule: '* * * * *' }
