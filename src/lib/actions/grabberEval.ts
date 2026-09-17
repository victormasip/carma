'use server'

// Server actions for the Grabber Eval (superadmin benchmark review over the
// Barcelona-100 dataset). Same defense-in-depth contract as actions/grabberLab:
// every action re-asserts the superadmin role before touching the service-role
// client, and the reads are 42P01-tolerant (migration 031 may not be applied
// yet — the Lab must still load and run captures).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeFetch, safeFetchText } from '@/lib/scrape/http'
import { ENGINE_VERSION } from '@/lib/scrape/pageSplit'
import { evalCaseFromHtml, collectStylesheets, type EvalRunResult } from '@/lib/grabber-lab/evalRun'
import { getEvalCase } from '@/lib/grabber-lab/evalDataset'

const EVAL_PATH = '/admin/grabber-eval'
const MAX_SHEETS = 6
const CSS_BUDGET = 300_000
// Regions travel to the client for display; cap them so one mega-page can't
// blow the action payload. (Hashes are computed over the FULL regions first.)
const REGION_DISPLAY_CAP = 80_000

async function assertSuperAdmin(): Promise<{ admin: ReturnType<typeof createAdminClient>; userId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') throw new Error('Accés denegat')
  return { admin: createAdminClient(), userId: user.id }
}

export type EvalCaseRun = {
  caseId: string
  url: string
  engineVersion: string
  fetched: boolean
  result?: Omit<EvalRunResult, 'regions'> & {
    regions: EvalRunResult['regions']
    regionsTruncated: boolean
  }
  error?: string
}

/** Live-run one dataset case through the REAL engine (same measurement core as
 *  the batch runner) and return everything the review panel needs. */
export async function runEvalCase(caseId: string): Promise<EvalCaseRun> {
  await assertSuperAdmin()
  const c = getEvalCase(caseId)
  if (!c) return { caseId, url: '', engineVersion: ENGINE_VERSION, fetched: false, error: 'Cas desconegut' }

  const page = await safeFetch(c.url, { timeout: 15_000 })
  if (!page) return { caseId, url: c.url, engineVersion: ENGINE_VERSION, fetched: false, error: 'No s\'ha pogut llegir la web (bloqueig o caiguda).' }

  const base = new URL(c.url)
  const { urls, inline, fontLinks } = collectStylesheets(page.body, base)
  const cssTexts = [...inline]
  let budget = CSS_BUDGET
  for (const u of urls.slice(0, MAX_SHEETS)) {
    if (budget <= 0) break
    const css = await safeFetchText(u, { accept: 'text/css,*/*', timeout: 8_000 })
    if (!css) continue
    const slice = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
    budget -= slice.length
    if (slice) cssTexts.push(slice)
  }

  const r = evalCaseFromHtml({ url: c.url, html: page.body, cssTexts, fontLinks })
  const truncate = (s: string) => (s.length > REGION_DISPLAY_CAP ? s.slice(0, REGION_DISPLAY_CAP) : s)
  const regionsTruncated = Object.values(r.regions).some(s => s.length > REGION_DISPLAY_CAP)

  return {
    caseId,
    url: c.url,
    engineVersion: ENGINE_VERSION,
    fetched: true,
    result: {
      ...r,
      regions: {
        top: truncate(r.regions.top),
        bottom: truncate(r.regions.bottom),
        head: truncate(r.regions.head),
        bodyAttrs: r.regions.bodyAttrs,
      },
      regionsTruncated,
    },
  }
}

export type EvalReviewInput = {
  caseId: string
  points: number
  headerOk: boolean | null
  contentOk: boolean | null
  footerOk: boolean | null
  stylesOk: boolean | null
  observations: string
  regionHashes: Record<string, string> | null
  autoScore: number | null
}

export type EvalReviewRow = {
  case_id: string
  points: number
  header_ok: boolean | null
  content_ok: boolean | null
  footer_ok: boolean | null
  styles_ok: boolean | null
  observations: string | null
  region_hashes: Record<string, string> | null
  engine_hash: string | null
  auto_score: number | null
  updated_at: string
}

/** Upsert the founder's review for a case (one living review per case). */
export async function saveEvalReview(input: EvalReviewInput): Promise<{ error?: string }> {
  try {
    const { admin, userId } = await assertSuperAdmin()
    const c = getEvalCase(input.caseId)
    if (!c) return { error: 'Cas desconegut' }
    const points = Math.max(0, Math.min(10, Math.round(input.points)))
    const { error } = await admin.from('grabber_eval_reviews').upsert({
      case_id: input.caseId,
      url: c.url,
      points,
      header_ok: input.headerOk,
      content_ok: input.contentOk,
      footer_ok: input.footerOk,
      styles_ok: input.stylesOk,
      observations: input.observations.trim() || null,
      region_hashes: input.regionHashes,
      engine_hash: ENGINE_VERSION,
      auto_score: input.autoScore,
      reviewed_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'case_id' })
    if (error) return { error: error.message }
    revalidatePath(EVAL_PATH)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/** All saved reviews (empty pre-migration — the Lab still works). */
export async function listEvalReviews(): Promise<EvalReviewRow[]> {
  try {
    const { admin } = await assertSuperAdmin()
    const { data, error } = await admin
      .from('grabber_eval_reviews')
      .select('case_id, points, header_ok, content_ok, footer_ok, styles_ok, observations, region_hashes, engine_hash, auto_score, updated_at')
    if (error) return [] // 42P01 pre-migració — fail-open
    return (data ?? []) as EvalReviewRow[]
  } catch {
    return []
  }
}
