import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import SettingsClient from './SettingsClient'

// Per-user, never prerendered.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Configuració · Carma' }

export default async function SettingsPage() {
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')

  const displayName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''

  return (
    <SettingsClient
      email={user.email ?? ''}
      displayName={displayName}
      isSuperAdmin={isSuperAdmin}
    />
  )
}
