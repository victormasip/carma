import { NextResponse, type NextRequest } from 'next/server'
import { cacheLife, cacheTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicSiteUrl, hasPublicUrl } from '@/lib/sites/domain'

// THE STABLE PUBLIC ALIAS for Carma's own blog.
//
// Founder, 2026-09-17: "our own blog loads extremely slowly and points to a
// zombie /render route."
//
// Both halves had the same cause, and it was here.
//
// SLOW. Every single hit on /blog opened a Supabase admin client, queried
// `sites` by name, and only then issued a redirect — so the visitor paid a cold
// serverless start plus a database round-trip BEFORE the blog itself began to
// load. For a value that changes when we run a migration, roughly never.
//
// ZOMBIE. `publicSiteUrl` falls back to `/render/<uuid>` when a site has no
// subdomain, and the Carma site was seeded by migration 018 — BEFORE 021 added
// the column, whose backfill ran once and never saw it. So the redirect always
// landed on the engine path. Migration 037 gives it `blog`; this route now
// refuses to hand anyone the engine path even if that migration has not run.

/** Where the showcase blog actually lives. Cached — it changes on deploy, not on request. */
async function showcaseUrl(): Promise<string | null> {
  'use cache'
  // A day, not 'max': a migration or a rename should take effect without a
  // deploy, and one lookup a day is not a cost worth optimising further.
  cacheLife('days')
  cacheTag('carma-showcase-blog')

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('sites')
      .select('id, subdomain')
      .eq('name', 'Carma')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!data?.id) return null

    const site = { id: data.id as string, subdomain: (data as { subdomain?: string | null }).subdomain ?? null }
    // NEVER hand out `/render/<uuid>`. It is the engine, not an address — if the
    // site has no real public URL yet, the honest answer is the marketing home,
    // not a URL the owner will copy into a menu and be stuck with.
    if (!hasPublicUrl(site)) return null
    return publicSiteUrl(site)
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const to = await showcaseUrl()
  return NextResponse.redirect(new URL(to ?? '/', origin))
}
