'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type ActionResult = { error?: string }

export type ThemeData = {
  reference_url_home?: string | null
  reference_url_listing?: string | null
  reference_url_article?: string | null
  raw_css?: string | null
  extracted_head?: string | null
  extracted_header?: string | null
  extracted_footer?: string | null
  extracted_scripts?: string | null
  external_styles?: string[]
  external_scripts?: string[]
  font_links?: string[]
  class_article_wrapper?: string | null
  class_article_title?: string | null
  class_article_content?: string | null
  class_article_meta?: string | null
  class_card_grid?: string | null
  class_card?: string | null
  class_main_wrapper?: string | null
  base_url?: string | null
  detected_framework?: string | null
  detected_hosting?: string | null
  is_enabled?: boolean
}

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') throw new Error('Accés denegat')
  return createAdminClient()
}

export async function saveTheme(siteId: string, data: ThemeData): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()

    const { error } = await admin.from('site_themes').upsert(
      {
        site_id: siteId,
        reference_url_home: data.reference_url_home ?? null,
        reference_url_listing: data.reference_url_listing ?? null,
        reference_url_article: data.reference_url_article ?? null,
        raw_css: data.raw_css ?? null,
        extracted_head: data.extracted_head ?? null,
        extracted_header: data.extracted_header ?? null,
        extracted_footer: data.extracted_footer ?? null,
        extracted_scripts: data.extracted_scripts ?? null,
        external_styles: data.external_styles ?? [],
        external_scripts: data.external_scripts ?? [],
        font_links: data.font_links ?? [],
        class_article_wrapper: data.class_article_wrapper ?? null,
        class_article_title: data.class_article_title ?? null,
        class_article_content: data.class_article_content ?? null,
        class_article_meta: data.class_article_meta ?? null,
        class_card_grid: data.class_card_grid ?? null,
        class_card: data.class_card ?? null,
        class_main_wrapper: data.class_main_wrapper ?? null,
        base_url: data.base_url ?? null,
        detected_framework: data.detected_framework ?? null,
        detected_hosting: data.detected_hosting ?? null,
        is_enabled: data.is_enabled ?? false,
      },
      { onConflict: 'site_id' },
    )

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    revalidatePath(`/render/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function deleteTheme(siteId: string): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()
    const { error } = await admin.from('site_themes').delete().eq('site_id', siteId)
    if (error) return { error: error.message }
    revalidatePath(`/dashboard/sites/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
