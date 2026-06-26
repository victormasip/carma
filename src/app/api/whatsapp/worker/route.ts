// WhatsApp Agent worker endpoint (T4) — secure cron handler.
//
// Drains generation_jobs. Invoked every minute by the Netlify Scheduled Function
// (netlify/functions/agent-worker-cron.mts), which passes the shared secret. Kept
// as a Route Handler so the worker can import the app's libs (the @/ alias) and be
// driven/tested in the Next runtime.
//
// Note on the long generation (≤160s) vs Netlify's synchronous function cap:
// runDueJobs processes one job at a time with a soft time budget and the job queue
// is durable + lease-based, so a cut-off invocation is retried by the next cron
// tick. For very slow generations, promote this to a Netlify Background Function
// (15-min budget) that imports runDueJobs — same logic, longer ceiling.

import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runDueJobs } from '@/lib/whatsapp/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.WA_WORKER_SECRET
  if (!secret) return false
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('forbidden', { status: 403 })

  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit')) || 5, 1), 20)
  try {
    const processed = await runDueJobs(limit)
    return NextResponse.json({ ok: true, processed })
  } catch (e) {
    console.error('[wa/worker] run failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
