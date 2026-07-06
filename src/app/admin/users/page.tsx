import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import { KARMA_ALLOCATIONS, type KarmaPlan } from '@/lib/karma/config'
import UsersClient, { type AdminUserRow } from './UsersClient'

// Dades per usuari + saldos — mai prerenderat. El gate de superadmin viu al
// layout de /admin (redirect); aquí ja només hi arriben superadmins.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Usuaris · Admin · Carma' }

const USERS_CAP = 500

export default async function AdminUsersPage() {
  const { user } = await getSession() // el layout ja ha garantit superadmin
  const admin = createAdminClient()

  // Perfils (42703-safe: sense la migració 028 el `plan` no existeix encara).
  type ProfileRow = { id: string; email: string | null; role: string | null; plan?: string | null; created_at: string }
  let profilesRes = await admin
    .from('profiles')
    .select('id, email, role, plan, created_at')
    .order('created_at', { ascending: false })
    .limit(USERS_CAP)
  if (profilesRes.error?.code === '42703') {
    profilesRes = await admin
      .from('profiles')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false })
      .limit(USERS_CAP) as typeof profilesRes
  }
  const profiles = (profilesRes.data ?? []) as ProfileRow[]
  const ids = profiles.map((p) => p.id)

  // Saldos + membres de llocs, en paral·lel. Tot best-effort: una taula absent
  // (migracions pendents) deixa la columna en blanc, mai tomba la pàgina.
  const [walletsRes, membershipsRes] = await Promise.all([
    ids.length ? admin.from('karma_wallets').select('user_id, balance').in('user_id', ids) : Promise.resolve({ data: [] as { user_id: string; balance: number }[], error: null }),
    ids.length ? admin.from('site_users').select('user_id, site_id').in('user_id', ids) : Promise.resolve({ data: [] as { user_id: string; site_id: string }[], error: null }),
  ])

  const balances = new Map<string, number>()
  for (const w of walletsRes.data ?? []) balances.set(w.user_id as string, w.balance as number)

  const siteIdsByUser = new Map<string, string[]>()
  for (const m of membershipsRes.data ?? []) {
    const list = siteIdsByUser.get(m.user_id as string) ?? []
    list.push(m.site_id as string)
    siteIdsByUser.set(m.user_id as string, list)
  }

  const rows: AdminUserRow[] = profiles.map((p) => {
    const plan = (['free', 'premium', 'gold', 'agency'].includes(p.plan ?? '') ? p.plan : 'free') as KarmaPlan
    const superadmin = p.role === 'superadmin'
    const wallet = balances.get(p.id)
    return {
      id: p.id,
      email: p.email ?? '—',
      plan,
      superadmin,
      // null = cartera per estrenar → el saldo EFECTIU és l'assignació sencera
      // (la RPC la crearà així al primer moviment). El client ho mostra en gris.
      balance: wallet ?? null,
      allocation: KARMA_ALLOCATIONS[plan],
      siteIds: siteIdsByUser.get(p.id) ?? [],
      createdAt: p.created_at,
    }
  })

  return <UsersClient rows={rows} selfId={user?.id ?? ''} capped={profiles.length >= USERS_CAP} />
}
