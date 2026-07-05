'use server'

// Punts de Carma — l'acció de reclamar un repte (server half de /dashboard/karma).
//
// Sempre re-verifica la condició del repte contra la BD abans de pagar; el
// pagament (earnKarmaReward → RPC karma_earn) és idempotent per sempre via la
// clau de dedupe reward:<clau>, així que doble clics, refrescos o carreres no
// poden cobrar dues vegades.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { earnKarmaReward } from '@/lib/karma/karma'
import { checkRewardEligibility } from '@/lib/karma/challenges'
import { KARMA_REWARDS, type KarmaRewardKey } from '@/lib/karma/config'

export type ClaimResult =
  | { ok: true; amount: number; balance: number | null; already: boolean }
  | { ok: false; error: string }

export async function claimKarmaReward(key: KarmaRewardKey): Promise<ClaimResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No has iniciat sessió' }

    const reward = KARMA_REWARDS.find((r) => r.key === key)
    if (!reward) return { ok: false, error: 'Repte desconegut' }

    const admin = createAdminClient()
    const eligible = await checkRewardEligibility(admin, user.id, key)
    if (!eligible) return { ok: false, error: 'Encara no has completat aquest repte. Vinga, que el tens a prop!' }

    const res = await earnKarmaReward(user.id, key, admin)
    if (!res.ok) return { ok: false, error: 'Ara mateix no hem pogut sumar-te els punts. Torna-ho a provar d’aquí un moment.' }
    return { ok: true, amount: reward.amount, balance: res.balance, already: res.already }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
