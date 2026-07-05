// Punts de Carma — verificació dels reptes (server-only).
//
// Cada repte es verifica contra l'estat REAL de la BD, mai contra el que digui
// el client: la pàgina /dashboard/karma els mostra amb aquesta mateixa funció i
// l'acció de reclamar torna a verificar abans de pagar (earnKarmaReward ja és
// idempotent per sempre via dedupe reward:<clau>, així que ni un doble clic ni
// una carrera poden pagar dos cops).
//
// Tot és 42P01/42703-safe: una taula/columna que encara no existeix (migracions
// pendents) compta com a "no complert", mai com un error de pàgina.

import { createAdminClient } from '@/lib/supabase/admin'
import type { KarmaRewardKey } from './config'

type Admin = ReturnType<typeof createAdminClient>

export type RewardState = { eligible: boolean; claimed: boolean }

async function userSiteIds(admin: Admin, userId: string): Promise<string[]> {
  try {
    const { data } = await admin.from('site_users').select('site_id').eq('user_id', userId)
    return (data ?? []).map((r) => r.site_id as string)
  } catch { return [] }
}

/** El repte concret es compleix ara mateix? (independent de si ja s'ha reclamat) */
export async function checkRewardEligibility(
  admin: Admin,
  userId: string,
  key: KarmaRewardKey,
  siteIds?: string[],
): Promise<boolean> {
  try {
    switch (key) {
      case 'benvinguda':
        // Arribar a la pàgina JA és el repte (ganxo d'activació).
        return true

      case 'primer_article': {
        const ids = siteIds ?? await userSiteIds(admin, userId)
        if (!ids.length) return false
        const { count } = await admin
          .from('posts').select('id', { count: 'exact', head: true })
          .in('site_id', ids).eq('is_published', true)
        return (count ?? 0) > 0
      }

      case 'whatsapp_connectat': {
        const { count } = await admin
          .from('wa_identities').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('status', 'active')
        return (count ?? 0) > 0
      }

      case 'estudi_fet': {
        const ids = siteIds ?? await userSiteIds(admin, userId)
        if (!ids.length) return false
        const { data } = await admin
          .from('site_themes').select('created_at, updated_at').in('site_id', ids).limit(20)
        // "Personalitzat" = el tema s'ha tocat clarament DESPRÉS de la captura
        // (marge de 60s perquè el desat inicial de la captura no compti).
        return (data ?? []).some((r) => {
          const created = new Date(r.created_at as string).getTime()
          const updated = new Date(r.updated_at as string).getTime()
          return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 60_000
        })
      }

      case 'primer_modul': {
        const ids = siteIds ?? await userSiteIds(admin, userId)
        if (!ids.length) return false
        const { data } = await admin
          .from('site_themes').select('modules').in('site_id', ids).limit(20)
        return (data ?? []).some((r) => {
          const mods = (r.modules ?? {}) as Record<string, { enabled?: boolean } | null>
          return Object.values(mods).some((m) => m?.enabled === true)
        })
      }
    }
  } catch { return false }
}

/** Estat complet de tots els reptes per a la pàgina (eligible + reclamat). */
export async function getRewardStates(
  admin: Admin,
  userId: string,
): Promise<Record<KarmaRewardKey, RewardState>> {
  const keys: KarmaRewardKey[] = ['benvinguda', 'primer_article', 'whatsapp_connectat', 'estudi_fet', 'primer_modul']

  let claimed = new Set<string>()
  try {
    const { data } = await admin
      .from('karma_ledger')
      .select('action')
      .eq('user_id', userId)
      .eq('kind', 'earn')
      .like('action', 'reward:%')
    claimed = new Set((data ?? []).map((r) => String(r.action).slice('reward:'.length)))
  } catch { /* pre-migració 028 → res reclamat */ }

  const siteIds = await userSiteIds(admin, userId)
  const entries = await Promise.all(keys.map(async (key) => {
    const eligible = await checkRewardEligibility(admin, userId, key, siteIds)
    return [key, { eligible, claimed: claimed.has(key) }] as const
  }))

  return Object.fromEntries(entries) as Record<KarmaRewardKey, RewardState>
}
