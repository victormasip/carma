import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { getKarma } from '@/lib/karma/karma'
import { getRewardStates } from '@/lib/karma/challenges'
import KarmaClient, { type LedgerEntry } from './KarmaClient'

// Saldo + reptes per usuari — mai prerenderat.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Punts de Carma · Carma' }

export default async function KarmaPage() {
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  const admin = createAdminClient()

  const [karma, rewardStates] = await Promise.all([
    getKarma(user.id, admin),
    getRewardStates(admin, user.id),
  ])

  // Moviments recents. 42P01-safe: sense la migració 028 la pàgina viu igual
  // (saldo amagat, reptes visibles però la reclamació avisarà).
  let ledger: LedgerEntry[] = []
  try {
    const { data } = await admin
      .from('karma_ledger')
      .select('id, delta, kind, action, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15)
    ledger = (data ?? []).map((r) => ({
      id: r.id as string,
      delta: r.delta as number,
      kind: r.kind as string,
      action: r.action as string,
      createdAt: r.created_at as string,
    }))
  } catch { /* pre-migració */ }

  return (
    <KarmaClient
      karma={{
        balance: karma.balance,
        allocation: karma.allocation,
        plan: karma.plan,
        superadmin: karma.superadmin || isSuperAdmin,
        available: karma.available,
      }}
      rewardStates={rewardStates}
      ledger={ledger}
    />
  )
}
