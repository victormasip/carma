'use server'

// L'APARADOR — l'opt-in del propietari al mur «Fet amb Carma» de la portada.
//
// Community Wave 2 (pla 2026-09-16 §6.6/§6.8). Tres coses passen aquí, i l'ordre
// importa:
//
//   1. COMPROVAR QUI ÉS. `userCanWriteSite` amb el client de la SESSIÓ, mai amb
//      l'admin i mai amb un id que vingui del client sense verificar. Posar el
//      blog d'un altre a la portada ha de ser impossible, no improbable.
//   2. ESCRIURE LA DECISIÓ. `showcase` + `showcase_at`, i el timestamp NOMÉS la
//      primera vegada: és el registre honest de quan va dir que sí, no un camp
//      d'«última modificació».
//   3. PAGAR EL REPTE. `earnKarmaReward(user, 'aparador')` — +40 punts, idempotent
//      per sempre via la clau de dedupe `reward:aparador`, que és PER USUARI. Deu
//      blogs no paguen deu vegades, i tornar a activar-ho tampoc.
//
// I després invalidar el mur, perquè una decisió de privacitat que triga una
// hora a fer efecte no és una decisió de privacitat.

import { updateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { userCanWriteSite } from '@/lib/auth/siteAccess'
import { earnKarmaReward } from '@/lib/karma/karma'
import { KARMA_REWARDS } from '@/lib/karma/config'
import { WALL_TAG } from '@/lib/marketing/wall'

const UNDEFINED_COLUMN = '42703'

export type ShowcaseResult =
  | {
      ok: true
      showcase: boolean
      /** Punts ingressats ARA (0 si ja s'havia cobrat abans o s'ha desactivat). */
      earned: number
    }
  | { ok: false; error: string }

const REWARD = KARMA_REWARDS.find(r => r.key === 'aparador')!

export async function setSiteShowcase(siteId: string, on: boolean): Promise<ShowcaseResult> {
  try {
    const id = (siteId ?? '').trim()
    if (!id) return { ok: false, error: 'Falta el blog.' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No has iniciat sessió.' }
    if (!(await userCanWriteSite(supabase, user.id, id))) {
      return { ok: false, error: 'Aquest blog no és teu.' }
    }

    const admin = createAdminClient()

    // El timestamp és de la PRIMERA vegada. Es llegeix abans d'escriure perquè
    // un segon "sí" no ha de reescriure la data del primer.
    let firstTime = true
    try {
      const { data } = await admin.from('sites').select('showcase_at').eq('id', id).maybeSingle()
      firstTime = !(data as { showcase_at?: string | null } | null)?.showcase_at
    } catch { /* pre-038: l'update de sota ho dirà */ }

    const patch: Record<string, unknown> = { showcase: on }
    if (on && firstTime) patch.showcase_at = new Date().toISOString()

    const { error } = await admin.from('sites').update(patch).eq('id', id)
    if (error?.code === UNDEFINED_COLUMN) {
      return { ok: false, error: 'L’aparador encara no està actiu (migració 038 pendent).' }
    }
    if (error) return { ok: false, error: error.message }

    // El repte, només en activar. `karma_earn` és idempotent per la clau de
    // dedupe, així que no cal comprovar si ja s'havia cobrat: si ja hi era,
    // torna `already` i no suma res.
    let earned = 0
    if (on) {
      const res = await earnKarmaReward(user.id, 'aparador', admin)
      if (res.ok && !res.already) earned = REWARD.amount
    }

    // La portada ha de reflectir-ho JA. `updateTag` i no `revalidateTag` perquè
    // això sí que és una Server Action — és l'única forma que Cache Components
    // permet aquí, i a més refresca l'entrada en comptes de només caducar-la.
    // Una decisió de privacitat que triga una hora a fer efecte no és una
    // decisió de privacitat.
    try { updateTag(WALL_TAG) } catch { /* fora d'un scope d'acció */ }

    return { ok: true, showcase: on, earned }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
