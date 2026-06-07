'use server'

// Server actions for the Theme Grabber Lab (internal superadmin tool).
// Every action re-verifies the superadmin role server-side BEFORE using the
// service-role client — the route is also gated, but actions are an independent
// entry point so they assert again (defense in depth, same as actions/theme.ts).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { LabSampleInput, LabSampleRow } from '@/lib/grabber-lab/types'

type ActionResult = { error?: string }

async function assertSuperAdmin(): Promise<{ admin: ReturnType<typeof createAdminClient>; userId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') throw new Error('Accés denegat')
  return { admin: createAdminClient(), userId: user.id }
}

// Map the camelCase client payload onto the snake_case columns. Only fields that
// are present are written, so a partial save (e.g. annotating notes on an
// existing row) never clobbers the system snapshot with nulls.
function toRow(input: LabSampleInput): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const set = (col: string, val: unknown) => { if (val !== undefined) row[col] = val }

  set('target_url', input.targetUrl)
  set('blog_url', input.blogUrl ?? null)
  set('base_url', input.baseUrl ?? null)

  set('detected_framework', input.detectedFramework ?? null)
  set('detected_framework_version', input.detectedFrameworkVersion ?? null)
  set('detected_hosting', input.detectedHosting ?? null)
  set('detection_confidence', input.detectionConfidence ?? null)
  set('detected_locale', input.detectedLocale ?? null)
  set('detected_site_name', input.detectedSiteName ?? null)
  set('detected_section_title', input.detectedSectionTitle ?? null)

  set('system_raw_head', input.systemRawHead ?? null)
  set('system_raw_header', input.systemRawHeader ?? null)
  set('system_raw_footer', input.systemRawFooter ?? null)
  set('system_body_attrs', input.systemBodyAttrs ?? null)
  set('system_design_tokens', input.systemDesignTokens ?? null)
  set('system_blog_signature', input.systemBlogSignature ?? null)
  set('system_external_styles', input.systemExternalStyles ?? [])
  set('system_external_scripts', input.systemExternalScripts ?? [])
  set('system_font_links', input.systemFontLinks ?? [])
  set('capture_raw', input.captureRaw ?? null)

  set('truth_raw_header', input.truthRawHeader ?? null)
  set('truth_raw_footer', input.truthRawFooter ?? null)
  set('truth_body_attrs', input.truthBodyAttrs ?? null)
  set('perfect_html', input.perfectHtml ?? null)

  set('diagnostic_notes', input.diagnosticNotes ?? null)
  set('failure_tags', input.failureTags ?? [])
  set('status', input.status ?? 'draft')

  return row
}

/** Insert a new sample (no id) or update an existing one. Returns its id. */
export async function saveLabSample(input: LabSampleInput): Promise<ActionResult & { id?: string }> {
  try {
    if (!input.targetUrl?.trim()) return { error: 'Cal una URL de prova' }
    const { admin, userId } = await assertSuperAdmin()
    const row = toRow(input)

    if (input.id) {
      const { error } = await admin.from('grabber_lab_samples').update(row).eq('id', input.id)
      if (error) return { error: error.message }
      revalidatePath('/admin/grabber-lab')
      return { id: input.id }
    }

    const { data, error } = await admin
      .from('grabber_lab_samples')
      .insert({ ...row, created_by: userId })
      .select('id')
      .single()
    if (error) return { error: error.message }
    revalidatePath('/admin/grabber-lab')
    return { id: (data as { id: string }).id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/** Load one sample (full row) so the operator can reopen + keep annotating it. */
export async function getLabSample(id: string): Promise<ActionResult & { sample?: LabSampleRow }> {
  try {
    const { admin } = await assertSuperAdmin()
    const { data, error } = await admin.from('grabber_lab_samples').select('*').eq('id', id).single()
    if (error) return { error: error.message }
    return { sample: data as LabSampleRow }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function deleteLabSample(id: string): Promise<ActionResult> {
  try {
    const { admin } = await assertSuperAdmin()
    const { error } = await admin.from('grabber_lab_samples').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/grabber-lab')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
