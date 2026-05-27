'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { DEFAULT_LOCALE, LOCALES, isLocale, normalizeLocale, type Locale } from '@/lib/i18n/config'

// site_themes.default_locale / locales aren't present until migration 009.
const UNDEFINED_COLUMN = '42703'

export type SiteLocaleConfig = { defaultLocale: Locale; locales: Locale[] }

const FALLBACK: SiteLocaleConfig = { defaultLocale: DEFAULT_LOCALE, locales: [DEFAULT_LOCALE] }

// Member of the site OR superadmin. Mirrors the theme-editing access policy:
// language config is content configuration, available to assigned clients too.
async function assertSiteAccess(siteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()
  if (profile?.role !== 'superadmin') {
    const { data: membership } = await admin
      .from('site_users').select('user_id')
      .eq('site_id', siteId).eq('user_id', user.id).single()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }
  return admin
}

// Normalize a raw row into an ordered, valid config (default always included).
function normalizeConfig(defaultRaw: unknown, localesRaw: unknown): SiteLocaleConfig {
  const defaultLocale = normalizeLocale(defaultRaw, DEFAULT_LOCALE)
  const set = new Set<Locale>([defaultLocale])
  if (Array.isArray(localesRaw)) {
    for (const l of localesRaw) if (isLocale(l)) set.add(l)
  }
  return { defaultLocale, locales: LOCALES.filter(l => set.has(l)) }
}

export async function getSiteLocaleConfig(siteId: string): Promise<SiteLocaleConfig> {
  try {
    const admin = await assertSiteAccess(siteId)
    const { data, error } = await admin
      .from('site_themes')
      .select('default_locale, locales')
      .eq('site_id', siteId)
      .maybeSingle()
    if (error?.code === UNDEFINED_COLUMN || !data) return FALLBACK
    return normalizeConfig((data as Record<string, unknown>).default_locale, (data as Record<string, unknown>).locales)
  } catch {
    return FALLBACK
  }
}

// Persist ONLY the locale columns without clobbering the rest of the theme row.
// A scoped upsert (onConflict site_id) updates just default_locale + locales on
// an existing row and creates a minimal row otherwise — race-safe vs the theme
// autosave, and it never flips is_enabled.
async function writeConfig(
  admin: ReturnType<typeof createAdminClient>,
  siteId: string,
  next: SiteLocaleConfig,
): Promise<{ error?: string }> {
  const { error } = await admin.from('site_themes').upsert(
    { site_id: siteId, default_locale: next.defaultLocale, locales: next.locales },
    { onConflict: 'site_id' },
  )
  if (error?.code === UNDEFINED_COLUMN) return {} // columns missing — best-effort no-op
  if (error) return { error: error.message }
  revalidatePath(`/render/${siteId}`)
  return {}
}

export async function addSiteLocale(siteId: string, locale: string): Promise<SiteLocaleConfig & { error?: string }> {
  try {
    if (!isLocale(locale)) return { ...FALLBACK, error: 'Idioma no suportat' }
    const admin = await assertSiteAccess(siteId)
    const current = await getSiteLocaleConfig(siteId)
    if (current.locales.includes(locale)) return current
    const next = normalizeConfig(current.defaultLocale, [...current.locales, locale])
    const res = await writeConfig(admin, siteId, next)
    return { ...next, ...(res.error ? { error: res.error } : {}) }
  } catch (err) {
    return { ...FALLBACK, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function setSiteDefaultLocale(siteId: string, locale: string): Promise<SiteLocaleConfig & { error?: string }> {
  try {
    if (!isLocale(locale)) return { ...FALLBACK, error: 'Idioma no suportat' }
    const admin = await assertSiteAccess(siteId)
    const current = await getSiteLocaleConfig(siteId)
    const next = normalizeConfig(locale, [...current.locales, locale])
    const res = await writeConfig(admin, siteId, next)
    return { ...next, ...(res.error ? { error: res.error } : {}) }
  } catch (err) {
    return { ...FALLBACK, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
