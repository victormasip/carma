import { connection } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAgentMetrics } from '@/lib/whatsapp/metrics'
import { WA_BRAIN_V2 } from '@/lib/whatsapp/config'
import AgentDashboard from './AgentDashboard'

// Instrumentation snapshot — never prerendered. The superadmin gate lives in the
// /admin layout (redirect); only superadmins reach here.
//
// `connection()` is how "never prerendered" is DECLARED under Cache Components:
// getAgentMetrics windows on Date.now(), and reading the current time during a
// prerender would bake one build-time instant into the page forever. Awaiting the
// connection defers this subtree to request time; the (app) layout's Suspense
// boundary paints the shell meanwhile.

export const metadata = { title: 'Agent · Admin · Carma' }

export default async function AdminAgentPage() {
  await connection()
  const admin = createAdminClient()
  const metrics = await getAgentMetrics(admin)
  return <AgentDashboard metrics={metrics} brainV2={WA_BRAIN_V2} />
}
