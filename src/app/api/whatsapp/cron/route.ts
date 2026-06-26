// WhatsApp Agent — portable cron entry point (final MVP step).
//
// GET /api/whatsapp/cron drains the generation_jobs queue by calling the T4 worker
// (runDueJobs). It is the platform-agnostic "engine starter": wire it to Vercel Cron,
// an external pinger (cron-job.org / UptimeRobot / a GitHub Action), or any scheduler
// that can hit a URL once a minute.
//
// Auth — a single pre-shared key, CRON_SECRET, accepted three ways so any pinger works:
//   1. Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends exactly this)
//   2. X-Cron-Secret: <CRON_SECRET>          (custom header)
//   3. ?key=<CRON_SECRET>                     (query param — for pingers that can't set headers)
// Constant-time comparison; fails closed when CRON_SECRET is unset.
//
// Time safety — runDueJobs claims jobs under a lease and stops taking new work once a
// soft time budget elapses, so this always returns within the serverless cap; a job
// cut off mid-generation keeps its lease and is retried on the next tick (durable
// queue). For very slow generations, promote to a Netlify Background Function (15-min)
// importing runDueJobs — same logic, longer ceiling.
//
// Relationship to the existing drivers: the T4 Netlify Scheduled Function
// (netlify/functions/agent-worker-cron.mts) hits POST /api/whatsapp/worker with
// WA_WORKER_SECRET. This GET route is an ALTERNATIVE, portable driver. Both funnel
// into runDueJobs, whose lease-based claim makes even simultaneous drivers safe — but
// in production enable just ONE to avoid paying for duplicate ticks.

import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runDueJobs } from '@/lib/whatsapp/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed — no secret configured, no access

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (bearer && safeEqual(bearer, secret)) return true

  const header = (req.headers.get('x-cron-secret') ?? '').trim()
  if (header && safeEqual(header, secret)) return true

  const key = (req.nextUrl.searchParams.get('key') ?? '').trim()
  if (key && safeEqual(key, secret)) return true

  return false
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('forbidden', { status: 403 })

  // How many jobs to drain this tick (1–20, default 5). runDueJobs self-limits the
  // wall-clock via its internal budget regardless of this count.
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 5, 1), 20)

  try {
    const processed = await runDueJobs(limit)
    return NextResponse.json({ ok: true, processed })
  } catch (e) {
    console.error('[wa/cron] run failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
