import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import GrabberLab from './GrabberLab'
import type { LabSampleListItem } from '@/lib/grabber-lab/types'

// The Lab reads the freshly-saved sample list each visit; never prerender.
export const dynamic = 'force-dynamic'

export default async function GrabberLabPage() {
  // Belt-and-suspenders: the /admin layout already gates this, but a page that
  // touches the dataset asserts the role itself too (memoized — costs nothing).
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  if (!isSuperAdmin) redirect('/dashboard')

  // Recent samples for the history rail. Tolerate the table not existing yet
  // (migration 017 not run) so the Lab still loads and can run captures.
  const admin = createAdminClient()
  const { data } = await admin
    .from('grabber_lab_samples')
    .select('id, target_url, detected_framework, status, updated_at, diagnostic_notes')
    .order('updated_at', { ascending: false })
    .limit(60)
  const recent = (data ?? []) as LabSampleListItem[]

  return <GrabberLab recent={recent} />
}
