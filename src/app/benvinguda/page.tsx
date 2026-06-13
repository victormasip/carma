import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BenvingudaClient from './BenvingudaClient'

/**
 * Provisioning hub — the single landing point after self-serve signup (email
 * confirmation OR OAuth) AND after "unlock" from the preview.
 *
 * This server component does AUTH ONLY. The actual site provisioning is a
 * mutation, so it is deferred to the client (BenvingudaClient → a one-shot
 * server action). Doing it here, during render, made a prefetched
 * `<Link href="/benvinguda?url=…">` create a phantom duplicate site — that bug
 * is now structurally impossible.
 */
export default async function BenvingudaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { url: qUrl } = await searchParams
  const cloneUrl = typeof qUrl === 'string' && qUrl ? qUrl : undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(cloneUrl ? `/registre?url=${encodeURIComponent(cloneUrl)}` : '/login')

  return <BenvingudaClient cloneUrl={cloneUrl} />
}
