'use server'

// Punts de Carma — reclamar reptes (server half de /dashboard/karma).
//
// Sempre re-verifica la condició del repte contra la BD abans de pagar; el
// pagament (earnKarmaReward → RPC karma_earn) és idempotent per sempre via la
// clau de dedupe reward:<clau>, així que doble clics, refrescos o carreres no
// poden cobrar dues vegades.
//
// PER QUÈ AQUESTES ACCIONS TORNEN TANT (2026-09-17)
// ─────────────────────────────────────────────────
// Directiva del fundador: «reclaiming points feels slow — optimize the backend
// logic and implement optimistic UI updates so claiming points and seeing the
// balance update feels instant».
//
// La lentitud no era la transacció: la RPC és una escriptura bloquejada, i triga
// el que triga una escriptura. Era el que venia DESPRÉS. El client cridava
// `router.refresh()`, que torna a renderitzar TOTA la ruta al servidor —
// `getKarma`, els cinc reptes, el llibre de moviments — per ensenyar un número
// que l'acció ja sabia. Una reclamació = dos viatges al servidor, i el segon era
// el car.
//
// Així que ara cada acció torna l'estat SENCER que la pantalla necessita: el
// saldo nou, l'estat de tots els reptes i el moviment acabat de fer. El client
// pinta optimista, reconcilia amb això i no refresca res.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { earnKarmaReward, getKarma } from '@/lib/karma/karma'
import { checkRewardEligibility, getRewardStates, type RewardState } from '@/lib/karma/challenges'
import { KARMA_REWARDS, type KarmaRewardKey } from '@/lib/karma/config'

/** Tot el que la pantalla ha de saber després d'una reclamació. */
export type ClaimPayload = {
  /** Punts realment ingressats en aquesta crida (0 si ja estava reclamat). */
  amount: number
  /** Saldo després. null = il·limitat (superadmin) o pre-migració. */
  balance: number | null
  /** Ja el tenia reclamat: el pagament és idempotent, no es torna a cobrar. */
  already: boolean
  /** Estat fresc de TOTS els reptes, perquè el client no hagi de refrescar. */
  states: Record<KarmaRewardKey, RewardState>
}

export type ClaimResult = { ok: true; data: ClaimPayload } | { ok: false; error: string }

async function session() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function claimKarmaReward(key: KarmaRewardKey): Promise<ClaimResult> {
  try {
    const user = await session()
    if (!user) return { ok: false, error: 'No has iniciat sessió' }

    const reward = KARMA_REWARDS.find((r) => r.key === key)
    if (!reward) return { ok: false, error: 'Repte desconegut' }

    const admin = createAdminClient()
    const eligible = await checkRewardEligibility(admin, user.id, key)
    if (!eligible) return { ok: false, error: 'Encara no has completat aquest repte. Vinga, que el tens a prop!' }

    const res = await earnKarmaReward(user.id, key, admin)
    if (!res.ok) return { ok: false, error: 'Ara mateix no hem pogut sumar-te els punts. Torna-ho a provar d’aquí un moment.' }

    // Els reptes es llegeixen EN PARAL·LEL amb el saldo: cap dels dos depèn de
    // l'altre i junts són el que la pantalla ha de repintar.
    const [states, karma] = await Promise.all([
      getRewardStates(admin, user.id),
      // `karma_earn` ja retorna el saldo; només el tornem a llegir si la RPC no
      // el va donar (pre-migració), i llavors és una lectura barata.
      res.balance === null ? getKarma(user.id, admin) : Promise.resolve(null),
    ])

    return {
      ok: true,
      data: {
        amount: res.already ? 0 : reward.amount,
        balance: res.balance ?? karma?.balance ?? null,
        already: res.already,
        states,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/**
 * RECLAMA-HO TOT — un sol viatge per a tots els reptes pendents.
 *
 * L'estat anterior obligava a una petició per repte: cinc clics, cinc round
 * trips i cinc re-renders complets de la ruta. Aquí es verifiquen i es paguen
 * tots dins la mateixa crida, en SÈRIE a propòsit — el ledger és una transacció
 * bloquejada per usuari i llançar-ne cinc alhora només serviria per fer-les
 * esperar l'una a l'altra.
 *
 * Idempotent com la individual: cada pagament porta la seva clau de dedupe, així
 * que un doble clic sobre «Reclama-ho tot» no cobra res dues vegades.
 */
export async function claimAllKarmaRewards(): Promise<ClaimResult> {
  try {
    const user = await session()
    if (!user) return { ok: false, error: 'No has iniciat sessió' }

    const admin = createAdminClient()
    const before = await getRewardStates(admin, user.id)
    const pending = KARMA_REWARDS.filter((r) => before[r.key]?.eligible && !before[r.key]?.claimed)
    if (!pending.length) {
      const karma = await getKarma(user.id, admin)
      return { ok: true, data: { amount: 0, balance: karma.balance, already: true, states: before } }
    }

    let amount = 0
    let balance: number | null = null
    for (const r of pending) {
      const res = await earnKarmaReward(user.id, r.key, admin)
      if (!res.ok) continue
      if (!res.already) amount += r.amount
      if (res.balance !== null) balance = res.balance
    }

    const [states, karma] = await Promise.all([
      getRewardStates(admin, user.id),
      balance === null ? getKarma(user.id, admin) : Promise.resolve(null),
    ])

    return {
      ok: true,
      data: { amount, balance: balance ?? karma?.balance ?? null, already: amount === 0, states },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
