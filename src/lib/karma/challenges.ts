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
import { KARMA_REWARDS, type KarmaRewardKey } from './config'

type Admin = ReturnType<typeof createAdminClient>

export type RewardState = { eligible: boolean; claimed: boolean }

async function userSiteIds(admin: Admin, userId: string): Promise<string[]> {
  try {
    const { data } = await admin.from('site_users').select('site_id').eq('user_id', userId)
    return (data ?? []).map((r) => r.site_id as string)
  } catch { return [] }
}

type ThemeRow = { created_at: string; updated_at: string; modules?: Record<string, { enabled?: boolean } | null> | null }

// Una sola lectura de site_themes serveix DOS reptes (estudi_fet + primer_modul).
// 42703-safe: sense la columna modules (pre-024) es reintenta sense.
async function fetchThemes(admin: Admin, siteIds: string[]): Promise<ThemeRow[]> {
  if (!siteIds.length) return []
  try {
    let res = await admin.from('site_themes').select('created_at, updated_at, modules').in('site_id', siteIds).limit(20)
    if (res.error?.code === '42703') {
      res = await admin.from('site_themes').select('created_at, updated_at').in('site_id', siteIds).limit(20) as typeof res
    }
    return (res.data ?? []) as unknown as ThemeRow[]
  } catch { return [] }
}

const themeCustomized = (rows: ThemeRow[]) => rows.some((r) => {
  // "Personalitzat" = el tema s'ha tocat clarament DESPRÉS de la captura
  // (marge de 60s perquè el desat inicial de la captura no compti).
  const created = new Date(r.created_at).getTime()
  const updated = new Date(r.updated_at).getTime()
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 60_000
})

const anyModuleEnabled = (rows: ThemeRow[]) => rows.some((r) =>
  Object.values(r.modules ?? {}).some((m) => m?.enabled === true))

/** El repte concret es compleix ara mateix? (independent de si ja s'ha reclamat) */
export async function checkRewardEligibility(
  admin: Admin,
  userId: string,
  key: KarmaRewardKey,
  siteIds?: string[],
  themes?: ThemeRow[],
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
        return themeCustomized(themes ?? await fetchThemes(admin, ids))
      }

      case 'primer_modul': {
        const ids = siteIds ?? await userSiteIds(admin, userId)
        return anyModuleEnabled(themes ?? await fetchThemes(admin, ids))
      }

      case 'aparador': {
        // Complert quan ALMENYS UN dels seus blogs ha dit que sí a l'aparador.
        //
        // 42703-safe cap a NO COMPLERT, no cap a complert: sense la migració 038
        // la columna no existeix, i per tant ningú hi ha dit que sí. Regalar 40
        // punts per una decisió que encara no es pot prendre seria pagar per res.
        const ids = siteIds ?? await userSiteIds(admin, userId)
        if (!ids.length) return false
        const { count, error } = await admin
          .from('sites').select('id', { count: 'exact', head: true })
          .in('id', ids).eq('showcase', true)
        if (error) return false
        return (count ?? 0) > 0
      }
    }
  } catch { return false }
}

/** Estat complet de tots els reptes per a la pàgina (eligible + reclamat). */
export async function getRewardStates(
  admin: Admin,
  userId: string,
): Promise<Record<KarmaRewardKey, RewardState>> {
  const keys: KarmaRewardKey[] = ['benvinguda', 'primer_article', 'whatsapp_connectat', 'estudi_fet', 'primer_modul', 'aparador']

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
  const themes = await fetchThemes(admin, siteIds) // 1 lectura per a 2 reptes
  const entries = await Promise.all(keys.map(async (key) => {
    const eligible = await checkRewardEligibility(admin, userId, key, siteIds, themes)
    return [key, { eligible, claimed: claimed.has(key) }] as const
  }))

  return Object.fromEntries(entries) as Record<KarmaRewardKey, RewardState>
}

/**
 * The first repte the owner can claim RIGHT NOW (eligible + unclaimed), for the
 * context-aware out-of-punts upsell (§3.3). Best-effort; null when none is claimable
 * or pre-migration. Honest by construction: only surfaces reptes truly ready to redeem.
 */
export async function firstUnclaimedReward(
  admin: Admin,
  userId: string,
): Promise<{ title: string; amount: number } | null> {
  try {
    const states = await getRewardStates(admin, userId)
    for (const r of KARMA_REWARDS) {
      const st = states[r.key]
      if (st?.eligible && !st.claimed) return { title: r.title, amount: r.amount }
    }
  } catch {
    /* pre-migration or transient — the upsell falls back to the generic reptes line */
  }
  return null
}
