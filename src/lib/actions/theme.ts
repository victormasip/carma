'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { DesignTokens } from '@/lib/scrape/tokens'
import { normalizeLocale } from '@/lib/i18n/config'
import { translateChromeWithClaude } from '@/lib/i18n/translate'

type ActionResult = { error?: string }

// site_themes.chrome_i18n isn't present until migration 011.
const UNDEFINED_COLUMN = '42703'

export type ChromeI18nEntry = { header?: string | null; footer?: string | null; section_title?: string | null }

export type ThemeData = {
  reference_url?: string | null
  extracted_head?: string | null
  extracted_header?: string | null
  extracted_footer?: string | null
  extracted_scripts?: string | null
  external_styles?: string[]
  external_scripts?: string[]
  font_links?: string[]
  base_url?: string | null
  detected_framework?: string | null
  detected_hosting?: string | null
  design_tokens?: DesignTokens | null
  section_title?: string | null
  chrome_i18n?: Record<string, ChromeI18nEntry>
}

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') throw new Error('Accés denegat')
  return createAdminClient()
}

// Theme customization is available to free clients too (they edit the design of
// the sites assigned to them), so this allows a superadmin OR an assigned site
// member — unlike re-capture/delete, which stay superadmin-only.
async function assertThemeAccess(siteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()

  if (profile?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users')
      .select('user_id')
      .eq('site_id', siteId)
      .eq('user_id', user.id)
      .single()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }
  return admin
}

export async function saveTheme(siteId: string, data: ThemeData): Promise<ActionResult> {
  try {
    const admin = await assertThemeAccess(siteId)

    const baseRow = {
      site_id: siteId,
      reference_url: data.reference_url ?? null,
      extracted_head: data.extracted_head ?? null,
      extracted_header: data.extracted_header ?? null,
      extracted_footer: data.extracted_footer ?? null,
      extracted_scripts: data.extracted_scripts ?? null,
      external_styles: data.external_styles ?? [],
      external_scripts: data.external_scripts ?? [],
      font_links: data.font_links ?? [],
      base_url: data.base_url ?? null,
      detected_framework: data.detected_framework ?? null,
      detected_hosting: data.detected_hosting ?? null,
      design_tokens: data.design_tokens ?? {},
      section_title: data.section_title ?? null,
      is_enabled: true,
    }
    const withI18n = { ...baseRow, chrome_i18n: data.chrome_i18n ?? {} }

    let { error } = await admin.from('site_themes').upsert(withI18n, { onConflict: 'site_id' })
    if (error?.code === UNDEFINED_COLUMN) {
      ;({ error } = await admin.from('site_themes').upsert(baseRow, { onConflict: 'site_id' }))
    }

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    revalidatePath(`/render/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

// Parse / re-assemble a chrome region JSON ({ html, css }).
function parseRegionJson(json: string | null | undefined): { html: string; css: string } | null {
  if (!json) return null
  try {
    const o = JSON.parse(json) as { html?: unknown; css?: unknown }
    if (typeof o.html !== 'string') return null
    return { html: o.html, css: typeof o.css === 'string' ? o.css : '' }
  } catch { return null }
}

/**
 * AI-translate the base header/footer/section title into another locale. Keeps
 * each region's CSS untouched (only the HTML text is translated). Returns the
 * translated chrome entry for the editor to store in chrome_i18n[toLocale].
 */
export async function translateChrome(
  siteId: string,
  fromLocale: string,
  toLocale: string,
  base: { header?: string | null; footer?: string | null; section_title?: string | null },
): Promise<ActionResult & { result?: ChromeI18nEntry }> {
  try {
    await assertThemeAccess(siteId)
    const from = normalizeLocale(fromLocale)
    const to = normalizeLocale(toLocale)
    if (from === to) return { error: "L'idioma d'origen i el de destí són el mateix" }

    const header = parseRegionJson(base.header)
    const footer = parseRegionJson(base.footer)

    const translated = await translateChromeWithClaude(from, to, {
      headerHtml: header?.html ?? '',
      footerHtml: footer?.html ?? '',
      sectionTitle: base.section_title ?? '',
    })

    return {
      result: {
        header: header ? JSON.stringify({ html: translated.headerHtml, css: header.css }) : null,
        footer: footer ? JSON.stringify({ html: translated.footerHtml, css: footer.css }) : null,
        section_title: translated.sectionTitle || null,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error de traducció' }
  }
}

export async function deleteTheme(siteId: string): Promise<ActionResult> {
  try {
    const admin = await assertSuperAdmin()
    const { error } = await admin.from('site_themes').delete().eq('site_id', siteId)
    if (error) return { error: error.message }
    revalidatePath(`/dashboard/sites/${siteId}`)
    revalidatePath(`/render/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
