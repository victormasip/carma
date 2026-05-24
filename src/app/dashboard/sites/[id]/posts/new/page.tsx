import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PostEditorClient from '@/components/editor/PostEditorClient'

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: siteId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .single()

  if (!site) redirect('/dashboard')

  return (
    <PostEditorClient
      siteId={siteId}
      siteName={site.name}
    />
  )
}
