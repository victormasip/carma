import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

// Gate de segment per a /admin — estrictament superadmin. El shell (sidebar +
// main) el posa el layout del grup (app); aquí NOMÉS la porta. getSession és
// React.cache → cap consulta extra respecte al shell del mateix request. El
// gate BLOQUEJA el render dels fills (mai streaming de dades d'admin abans de
// la verificació).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  if (!isSuperAdmin) redirect('/dashboard')
  return children
}
