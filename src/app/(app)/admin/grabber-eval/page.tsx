import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import GrabberEval from './GrabberEval'
import type { EvalReviewRow } from '@/lib/actions/grabberEval'

// The Eval reads the freshly-saved review list each visit; never prerender.

export default async function GrabberEvalPage() {
  // Belt-and-suspenders: the /admin layout already gates this, but a page that
  // touches the review dataset asserts the role itself too.
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  if (!isSuperAdmin) redirect('/dashboard')

  // Saved reviews for the reward strip + per-case chips. Tolerate the table not
  // existing yet (migration 031 not run) so the Eval still loads and can run.
  const admin = createAdminClient()
  const { data } = await admin
    .from('grabber_eval_reviews')
    .select('case_id, points, header_ok, content_ok, footer_ok, styles_ok, observations, region_hashes, engine_hash, auto_score, updated_at')
  const reviews = (data ?? []) as EvalReviewRow[]

  return <GrabberEval initialReviews={reviews} />
}
