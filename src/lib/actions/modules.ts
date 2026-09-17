'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { siteTag } from '@/lib/render/cache'
import {
  MODULES, getModuleDef, moduleAllowedForPlan,
  type ModuleConfig, type ModuleTier, type SiteModules,
} from '@/lib/modules/registry'
import { getArchetype, archetypeModulesForPlan } from '@/lib/render/archetypes'

// site_themes.modules isn't present until migration 024.
const UNDEFINED_COLUMN = '42703'

type ActionResult = { error?: string }

// Member of the site OR superadmin — same policy as theme/locale editing:
// module configuration is part of customizing the blog, available to assigned
// clients too.
//
// THE PLAN IS THE PLAN (2026-09-17). This used to return `isPremium: isSuperadmin`,
// which meant a paying Premium customer could not switch on a single Premium
// module: the whole four-tier catalogue in registry.ts was gated on "are you
// staff". The gate is now the account's real `profiles.plan`, read through the
// same 42703-safe path the rest of the app uses (pre-028 schema → 'free').
// Superadmins keep everything, as 'agency'.
async function assertModuleAccess(siteId: string): Promise<{
  admin: ReturnType<typeof createAdminClient>
  plan: ModuleTier
  isPremium: boolean
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticat')

  const profileRes = await supabase.from('profiles').select('role, plan').eq('id', user.id).maybeSingle()
  // `plan` only exists after migration 028; without it everyone reads as free.
  const profile = (profileRes.error?.code === UNDEFINED_COLUMN
    ? (await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()).data
    : profileRes.data) as { role?: string; plan?: string } | null

  const admin = createAdminClient()
  const isSuperadmin = profile?.role === 'superadmin'
  if (!isSuperadmin) {
    const { data: membership } = await admin
      .from('site_users').select('user_id')
      .eq('site_id', siteId).eq('user_id', user.id).single()
    if (!membership) throw new Error('Accés denegat a aquest site')
  }

  const plan: ModuleTier = isSuperadmin
    ? 'agency'
    : (['free', 'premium', 'gold', 'agency'].includes(profile?.plan ?? '') ? profile!.plan as ModuleTier : 'free')
  return { admin, plan, isPremium: plan !== 'free' }
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
// shape the client sent. This is the AUTHORITATIVE tier gate: the catalogue is
// four-tier (`def.tier`), so a Premium account gets Premium modules and stops
// short of Gold ones. The old boolean check (`def.premium`) could only say
// "paid or not", which let Premium reach the paywall and locked Premium out of
// everything at once.
function sanitizeModules(raw: unknown, plan: ModuleTier): SiteModules {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const out: SiteModules = {}
  for (const def of MODULES) {
    const incoming = src[def.id]
    if (typeof incoming !== 'object' || incoming === null) continue
    const cfg = incoming as Partial<ModuleConfig>
    const wantEnabled = Boolean(cfg.enabled)
    const enabled = wantEnabled && moduleAllowedForPlan(def, plan)
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
    const { admin, plan } = await assertModuleAccess(siteId)

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
      if (!moduleAllowedForPlan(def, plan)) continue
      if (next[id]?.enabled) continue
      next[id] = { ...(next[id] ?? {}), enabled: true, variant: next[id]?.variant ?? def.defaultVariant }
      enabled.push(id)
    }
    if (enabled.length === 0) return { enabled: [] }

    const clean = sanitizeModules(next, plan)
    const { error } = await admin.from('site_themes').upsert(
      { site_id: siteId, modules: clean },
      { onConflict: 'site_id' },
    )
    if (error?.code === UNDEFINED_COLUMN) return {}
    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    updateTag(siteTag(siteId))
    return { enabled }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

export async function saveSiteModules(siteId: string, modules: unknown): Promise<ActionResult> {
  try {
    const { admin, plan } = await assertModuleAccess(siteId)
    const clean = sanitizeModules(modules, plan)

    // Scoped upsert (onConflict site_id) writes ONLY the modules column — it never
    // clobbers the rest of the theme row and is race-safe vs the theme autosave.
    const { error } = await admin.from('site_themes').upsert(
      { site_id: siteId, modules: clean },
      { onConflict: 'site_id' },
    )
    if (error?.code === UNDEFINED_COLUMN) return {} // pre-024 schema — best-effort no-op
    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    updateTag(siteTag(siteId))
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/**
 * Apply a READY-TO-PLAY ARCHETYPE: its whole module configuration at once.
 *
 * Different from `enableModules` on purpose. That one MERGES ids with default
 * variants (capture-time feature detection — "this site had a search box, so
 * switch ours on"). An archetype is an editorial decision with variants and
 * written copy, so it REPLACES the module config wholesale: choosing "La
 * Revista" and getting a half-Revista crossed with whatever was there before is
 * the thing that makes presets feel broken.
 *
 * The theme (colours, fonts, header, footer) is NOT touched here — the Studio
 * owns that and applies the archetype's template separately, so an owner who has
 * already made the look theirs does not lose it by switching archetype.
 *
 * `blocked` is returned, not hidden: a free account choosing La Revista gets
 * every free module of it and an honest list of what Premium would add.
 */
export async function applyArchetype(
  siteId: string,
  archetypeId: string,
): Promise<ActionResult & { applied?: string[]; blocked?: string[]; plan?: ModuleTier }> {
  try {
    const archetype = getArchetype(archetypeId)
    if (!archetype) return { error: 'Arquetip desconegut' }

    const { admin, plan } = await assertModuleAccess(siteId)
    const { modules, blocked } = archetypeModulesForPlan(archetype, plan)

    // Still sanitized: `archetypeModulesForPlan` decides WHAT to offer, the
    // sanitizer decides what is storable. Neither trusts the other.
    const clean = sanitizeModules(modules, plan)
    const { error } = await admin.from('site_themes').upsert(
      { site_id: siteId, modules: clean },
      { onConflict: 'site_id' },
    )
    if (error?.code === UNDEFINED_COLUMN) return {} // pre-024 schema — best-effort no-op
    if (error) return { error: error.message }

    revalidatePath(`/dashboard/sites/${siteId}`)
    updateTag(siteTag(siteId))
    return {
      applied: Object.entries(clean).filter(([, c]) => c.enabled).map(([id]) => id),
      blocked,
      plan,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
