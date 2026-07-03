'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { MODULES, getModuleDef, type ModuleConfig, type SiteModules } from '@/lib/modules/registry'

// site_themes.modules isn't present until migration 024.
const UNDEFINED_COLUMN = '42703'

type ActionResult = { error?: string }

// Member of the site OR superadmin — same policy as theme/locale editing:
// module configuration is part of customizing the blog, available to assigned
// clients too. Returns the admin client and the caller's premium status (today
// premium === superadmin, mirroring the rest of the app's tier mapping).
async function assertModuleAccess(siteId: string): Promise<{ admin: ReturnType<typeof createAdminClient>; isPremium: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()
  const isSuperadmin = profile?.role === 'superadmin'
  if (!isSuperadmin) {
    const { data: membership } = await admin
      .from('site_users').select('user_id')
      .eq('site_id', siteId).eq('user_id', user.id).single()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }
  return { admin, isPremium: isSuperadmin }
}

// Coerce one stored option value to the type the registry declares for it. Hand
// edits / stale clients can't poison the config: unknown keys are dropped and
// values are clamped/validated.
function coerceOptions(moduleId: string, raw: unknown): Record<string, unknown> {
  const def = getModuleDef(moduleId)
  if (!def?.options || typeof raw !== 'object' || raw === null) return {}
  const src = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const opt of def.options) {
    if (opt.type === 'group') continue
    const v = src[opt.key]
    if (v === undefined) continue
    switch (opt.type) {
      case 'toggle':
        out[opt.key] = Boolean(v)
        break
      case 'number':
      case 'range': {
        const n = typeof v === 'number' ? v : Number(v)
        if (!Number.isFinite(n)) break
        const min = opt.min ?? -Infinity
        const max = opt.max ?? Infinity
        out[opt.key] = Math.min(max, Math.max(min, Math.round(n)))
        break
      }
      case 'select': {
        const s = String(v)
        if (opt.choices?.some(c => c.value === s)) out[opt.key] = s
        break
      }
      case 'multiselect': {
        if (!Array.isArray(v)) break
        const allowed = new Set((opt.choices ?? []).map(c => c.value))
        out[opt.key] = v.filter((x): x is string => typeof x === 'string' && allowed.has(x))
        break
      }
      case 'color': {
        // A CSS colour literal only: keep #hex / rgb()/hsl() / a named colour,
        // never anything that could break out of a CSS declaration.
        const s = String(v).trim().slice(0, 60)
        out[opt.key] = /[<>{};]/.test(s) ? '' : s
        break
      }
      case 'textarea':
        out[opt.key] = String(v).slice(0, 4000)
        break
      default: // 'text'
        out[opt.key] = String(v).slice(0, 600)
    }
  }
  return out
}

// Rebuild the whole config from scratch against the registry — never trust the
// shape the client sent. Premium modules can't be enabled by a non-premium
// caller (UI also blocks this; this is the authoritative server-side gate).
function sanitizeModules(raw: unknown, isPremium: boolean): SiteModules {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const out: SiteModules = {}
  for (const def of MODULES) {
    const incoming = src[def.id]
    if (typeof incoming !== 'object' || incoming === null) continue
    const cfg = incoming as Partial<ModuleConfig>
    const wantEnabled = Boolean(cfg.enabled)
    const enabled = wantEnabled && (!def.premium || isPremium)
    const variant = def.variants.some(v => v.id === cfg.variant) ? cfg.variant! : def.defaultVariant
    const options = coerceOptions(def.id, cfg.options)
    // Only persist entries that diverge from the pure default (enabled or a
    // non-default variant or any option set) so the JSONB stays compact.
    if (!enabled && variant === def.defaultVariant && Object.keys(options).length === 0) continue
    out[def.id] = { enabled, variant, ...(Object.keys(options).length ? { options } : {}) }
  }
  return out
}

/**
 * MERGE-enable a set of modules (capture-time feature detection). Unlike
 * saveSiteModules this never clobbers existing config: already-configured
 * modules keep their variant/options, unknown ids are dropped, premium modules
 * are skipped for non-premium callers, and everything passes the same
 * registry sanitizer before persisting.
 */
export async function enableModules(siteId: string, ids: string[]): Promise<ActionResult & { enabled?: string[] }> {
  try {
    if (!Array.isArray(ids) || ids.length === 0) return { enabled: [] }
    const { admin, isPremium } = await assertModuleAccess(siteId)

    const { data, error: readErr } = await admin
      .from('site_themes').select('modules').eq('site_id', siteId).maybeSingle()
    if (readErr?.code === UNDEFINED_COLUMN) return {} // pre-024 schema — best-effort no-op
    if (readErr) return { error: readErr.message }

    const current = ((data?.modules ?? {}) as SiteModules)
    const next: SiteModules = { ...current }
    const enabled: string[] = []
    for (const id of ids) {
      const def = getModuleDef(id)
      if (!def) continue
      if (def.premium && !isPremium) continue
      if (next[id]?.enabled) continue
      next[id] = { ...(next[id] ?? {}), enabled: true, variant: next[id]?.variant ?? def.defaultVariant }
      enabled.push(id)
    }
    if (enabled.length === 0) return { enabled: [] }

    const clean = sanitizeModules(next, isPremium)
    const { error } = await admin.from('site_themes').upsert(
      { site_id: siteId, modules: clean },
      { onConflict: 'site_id' },
    )
    if (error?.code === UNDEFINED_COLUMN) return {}
    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    revalidatePath(`/render/${siteId}`)
    return { enabled }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function saveSiteModules(siteId: string, modules: unknown): Promise<ActionResult> {
  try {
    const { admin, isPremium } = await assertModuleAccess(siteId)
    const clean = sanitizeModules(modules, isPremium)

    // Scoped upsert (onConflict site_id) writes ONLY the modules column — it never
    // clobbers the rest of the theme row and is race-safe vs the theme autosave.
    const { error } = await admin.from('site_themes').upsert(
      { site_id: siteId, modules: clean },
      { onConflict: 'site_id' },
    )
    if (error?.code === UNDEFINED_COLUMN) return {} // pre-024 schema — best-effort no-op
    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    revalidatePath(`/render/${siteId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
