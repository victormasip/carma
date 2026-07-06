'use server'

// Gestió d'usuaris del superadmin (/admin/users) — les mutacions.
//
// TOTES verifiquen el cridador amb getSession() (rol real a la BD via RLS),
// mai amb res que vingui del client. Les escriptures de punts passen per les
// RPCs atòmiques de la migració 028 (karma_earn / karma_spend), així que cada
// ajust manual queda al llibre major amb la seva acció ('admin_grant' /
// 'admin_adjustment') i el ref porta QUI ho ha fet — auditoria completa.

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { KARMA_ALLOCATIONS, type KarmaPlan } from '@/lib/karma/config'

const PLANS: KarmaPlan[] = ['free', 'premium', 'gold', 'agency']

async function assertSuperadmin() {
  const { user, isSuperAdmin } = await getSession()
  if (!user || !isSuperAdmin) throw new Error('Només per a superadmins')
  return { callerId: user.id, admin: createAdminClient() }
}

export type AdjustKarmaResult =
  | { ok: true; balance: number | null; applied: number; infinite?: boolean }
  | { ok: false; error: string }

/**
 * Suma o resta punts a la cartera d'un usuari. Positiu → 'admin_grant' (kind
 * earn); negatiu → 'admin_adjustment' (kind spend), RETALLAT al saldo real si
 * cal (la cartera mai queda en negatiu — el CHECK de la BD tampoc ho permetria).
 */
export async function adminAdjustKarma(
  targetUserId: string,
  delta: number,
  note?: string,
): Promise<AdjustKarmaResult> {
  try {
    const { callerId, admin } = await assertSuperadmin()
    const amount = Math.trunc(delta)
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000) {
      return { ok: false, error: 'Import no vàlid' }
    }
    const ref = `admin:${callerId}${note?.trim() ? ` — ${note.trim().slice(0, 160)}` : ''}`

    if (amount > 0) {
      const { data, error } = await admin.rpc('karma_earn', {
        p_user: targetUserId, p_amount: amount, p_action: 'admin_grant', p_ref: ref, p_dedupe: null,
      })
      if (error) return { ok: false, error: error.message }
      const r = (data ?? {}) as { balance?: number | null; superadmin?: boolean }
      if (r.superadmin) return { ok: true, balance: null, applied: 0, infinite: true }
      revalidatePath('/admin/users')
      return { ok: true, balance: r.balance ?? null, applied: amount }
    }

    // Resta: intenta el total; si no hi arriba, retalla al saldo disponible.
    let toSpend = Math.abs(amount)
    let { data, error } = await admin.rpc('karma_spend', {
      p_user: targetUserId, p_cost: toSpend, p_action: 'admin_adjustment', p_ref: ref, p_dedupe: null,
    })
    if (error) return { ok: false, error: error.message }
    let r = (data ?? {}) as { ok?: boolean; balance?: number | null; superadmin?: boolean }
    if (r.superadmin) return { ok: true, balance: null, applied: 0, infinite: true }
    if (r.ok === false) {
      const available = (r as { balance?: number }).balance ?? 0
      if (available <= 0) return { ok: true, balance: 0, applied: 0 }
      toSpend = available
      ;({ data, error } = await admin.rpc('karma_spend', {
        p_user: targetUserId, p_cost: toSpend, p_action: 'admin_adjustment', p_ref: ref, p_dedupe: null,
      }))
      if (error) return { ok: false, error: error.message }
      r = (data ?? {}) as typeof r
    }
    revalidatePath('/admin/users')
    return { ok: true, balance: r.balance ?? null, applied: -toSpend }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export type SetPlanResult =
  | { ok: true; plan: KarmaPlan; balance: number | null; allocation: number }
  | { ok: false; error: string }

/**
 * Canvia el pla i re-avalua l'assignació A L'INSTANT: en una millora, el saldo
 * puja fins a la nova assignació ara mateix (kind earn, action 'plan_change',
 * dedupe per usuari+pla+mes → un doble clic no regala dos cops). En una
 * baixada, el saldo actual es conserva — el que tenen, ho han guanyat.
 */
export async function adminSetPlan(targetUserId: string, plan: KarmaPlan): Promise<SetPlanResult> {
  try {
    const { callerId, admin } = await assertSuperadmin()
    if (!PLANS.includes(plan)) return { ok: false, error: 'Pla desconegut' }

    const { error: upErr } = await admin.from('profiles').update({ plan }).eq('id', targetUserId)
    if (upErr) return { ok: false, error: upErr.message }

    const allocation = KARMA_ALLOCATIONS[plan]

    // Saldo actual (la RPC crea/renova la cartera amb el pla NOU ja desat).
    const { data: balData, error: balErr } = await admin.rpc('karma_balance', { p_user: targetUserId })
    if (balErr) {
      revalidatePath('/admin/users')
      return { ok: true, plan, balance: null, allocation }
    }
    const bal = (balData ?? {}) as { balance?: number | null; superadmin?: boolean }
    if (bal.superadmin || bal.balance == null) {
      revalidatePath('/admin/users')
      return { ok: true, plan, balance: bal.balance ?? null, allocation }
    }

    let balance = bal.balance
    if (balance < allocation) {
      const month = new Date().toISOString().slice(0, 7)
      const { data: earnData } = await admin.rpc('karma_earn', {
        p_user: targetUserId,
        p_amount: allocation - balance,
        p_action: 'plan_change',
        p_ref: `admin:${callerId} — ${plan}`,
        p_dedupe: `planup:${targetUserId}:${plan}:${month}`,
      })
      const earned = (earnData ?? {}) as { balance?: number | null }
      if (typeof earned.balance === 'number') balance = earned.balance
    }

    revalidatePath('/admin/users')
    return { ok: true, plan, balance, allocation }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

// ─── Accions en BLOC (selecció múltiple a /admin/users) ───────────────────────
// Reutilitzen les accions unitàries (getSession és React.cache → l'assert de
// superadmin només costa un cop per request) en chunks paral·lels de 10: prou
// ràpid per a desenes d'usuaris i mai ofega la BD (el lock de cartera ja
// serialitza per usuari, usuaris DIFERENTS van en paral·lel sense conflicte).

const BULK_MAX = 200
const CHUNK = 10

async function inChunks<T>(items: string[], run: (id: string) => Promise<T>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(...await Promise.all(items.slice(i, i + CHUNK).map(run)))
  }
  return out
}

export type BulkResult = { ok: true; done: number; failed: number } | { ok: false; error: string }

export async function adminBulkSetPlan(targetUserIds: string[], plan: KarmaPlan): Promise<BulkResult> {
  try {
    await assertSuperadmin()
    const ids = [...new Set(targetUserIds)].slice(0, BULK_MAX)
    if (!ids.length) return { ok: false, error: 'Cap usuari seleccionat' }
    const results = await inChunks(ids, (id) => adminSetPlan(id, plan))
    const done = results.filter((r) => r.ok).length
    revalidatePath('/admin/users')
    return { ok: true, done, failed: ids.length - done }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function adminBulkAdjustKarma(targetUserIds: string[], delta: number, note?: string): Promise<BulkResult> {
  try {
    await assertSuperadmin()
    const ids = [...new Set(targetUserIds)].slice(0, BULK_MAX)
    if (!ids.length) return { ok: false, error: 'Cap usuari seleccionat' }
    const results = await inChunks(ids, (id) => adminAdjustKarma(id, delta, note))
    const done = results.filter((r) => r.ok).length
    revalidatePath('/admin/users')
    return { ok: true, done, failed: ids.length - done }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export type DeleteUserResult = { ok: true } | { ok: false; error: string }

/**
 * Elimina el COMPTE d'un usuari (auth + perfil en cascada). Mai a tu mateix ni
 * a un superadmin (revoca-li el rol primer — fricció deliberada). Els llocs es
 * conserven sense usuari assignat: esborrar contingut de clients és una decisió
 * separada que es pren lloc a lloc, mai en cascada silenciosa.
 */
export async function adminDeleteUser(targetUserId: string): Promise<DeleteUserResult> {
  try {
    const { callerId, admin } = await assertSuperadmin()
    if (targetUserId === callerId) return { ok: false, error: 'No et pots eliminar a tu mateix.' }

    const { data: target } = await admin.from('profiles').select('role, email').eq('id', targetUserId).maybeSingle()
    if (!target) return { ok: false, error: 'Usuari no trobat' }
    if (target.role === 'superadmin') {
      return { ok: false, error: 'És superadmin: revoca-li el rol abans d’eliminar-lo.' }
    }

    const { error } = await admin.auth.admin.deleteUser(targetUserId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export type SetRoleResult = { ok: true; superadmin: boolean } | { ok: false; error: string }

/** Concedeix o revoca superadmin (∞ punts). Mai a tu mateix — anti-bloqueig. */
export async function adminSetSuperadmin(targetUserId: string, superadmin: boolean): Promise<SetRoleResult> {
  try {
    const { callerId, admin } = await assertSuperadmin()
    if (targetUserId === callerId && !superadmin) {
      return { ok: false, error: 'No et pots revocar el superadmin a tu mateix (algú altre ho ha de fer).' }
    }
    const { error } = await admin
      .from('profiles')
      .update({ role: superadmin ? 'superadmin' : 'client' })
      .eq('id', targetUserId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/users')
    return { ok: true, superadmin }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
