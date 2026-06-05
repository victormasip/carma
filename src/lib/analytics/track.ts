// Server-only analytics helpers shared by the /api/track beacon endpoint.
//
// Privacy model: we never store IPs or raw user-agents. "Unique visitors" is
// approximated by a DAILY-ROTATING hash of (ip + ua + yyyy-mm-dd + salt), so the
// same person counts once per day per site and the hash can't be reversed to a
// person nor correlated across days. This keeps the feature cookieless and
// GDPR-friendly while still giving useful unique-visitor counts.

import { createHash } from 'node:crypto'

const SALT = process.env.ANALYTICS_SALT ?? 'carma-analytics-v1'

export type ViewKind = 'article' | 'listing'

// Known crawlers / preview bots — they run JS rarely, but the beacon could still
// fire from headless previews, so we drop them to keep counts honest.
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|slackbot|discordbot|lighthouse|headlesschrome|google-?(?:bot|other)|ahrefs|semrush|yandex|baidu|duckduck|petalbot|gptbot|claudebot|ccbot/i

export function isBotUA(ua: string | null | undefined): boolean {
  if (!ua) return true // no UA at all → almost certainly not a real browser
  return BOT_RE.test(ua)
}

// The first public IP in the forwarding chain (Vercel/proxies prepend it).
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return headers.get('x-real-ip')?.trim() || '0.0.0.0'
}

// Daily-rotating, non-reversible visitor fingerprint.
export function visitorHash(ip: string, ua: string, day = new Date()): string {
  const ymd = day.toISOString().slice(0, 10)
  return createHash('sha256').update(`${ip}|${ua}|${ymd}|${SALT}`).digest('hex').slice(0, 32)
}

// The bare hostname of a referrer URL (for a "top sources" breakdown later).
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null
  try { return new URL(referrer).hostname.replace(/^www\./, '') || null } catch { return null }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
