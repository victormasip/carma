// Switching blog features on and off from a SERVER context that has no session
// (the WhatsApp worker, a webhook, a cron) — server-only.
//
// `lib/actions/modules.ts` already does this, but every entry point there is a
// Server Action that starts with `assertModuleAccess(siteId)` — a `createClient()`
// read of the logged-in user. The agent has no logged-in user: it has a verified
// phone number bound to an owner, which the worker has already checked twice
// before anything reaches here.
//
// So this is the same operation with the authorisation moved to the caller and
// the plan passed in explicitly. The guarantees that matter are unchanged:
//
//   · the REGISTRY is the vocabulary — an id nobody defined is dropped, never
//     written through to the JSONB;
//   · the PLAN is the ceiling — `moduleAllowedForPlan` decides, and a module the
//     account cannot reach is skipped and NAMED, so the caller can say why;
//   · the write is a scoped upsert on `modules` alone, so it can never clobber
//     the rest of the theme row or race the Studio's autosave;
//   · pre-024 (no `modules` column) is a no-op, not an error.

import type { createAdminClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'
import { siteTag } from '@/lib/render/cache'
import {
  MODULES, getModuleDef, moduleAllowedForPlan,
  type ModuleTier, type SiteModules,
} from './registry'

// Re-exported so callers only ever need one import for "change the modules".
// It lives in its own file because it is PURE — the test harness loads it in
// plain node, where `next/cache` (imported above) does not resolve.
export { matchModules } from './match'

type Admin = ReturnType<typeof createAdminClient>

const UNDEFINED_COLUMN = '42703'

export type ModuleChange = {
  /** Ids actually switched on (or off) by this call. */
  changed: { id: string; name: string }[]
  /** Asked for but out of reach on this plan — named so the reply can be concrete. */
  blocked: { id: string; name: string }[]
  /** Asked for but already in the requested state. */
  noop: { id: string; name: string }[]
  /** Asked for but not a module. */
  unknown: string[]
}

const empty = (): ModuleChange => ({ changed: [], blocked: [], noop: [], unknown: [] })

/**
 * Turn modules on or off. Merge-only: a module already configured keeps its
 * variant and options, and everything not named here is left exactly as it was.
 */
export async function setModulesAsAdmin(
  admin: Admin,
  siteId: string,
  ids: string[],
  plan: ModuleTier,
  enabled: boolean,
): Promise<ModuleChange> {
  const out = empty()
  const wanted = [...new Set(ids.map(i => i.trim()).filter(Boolean))]
  if (!wanted.length) return out

  let current: SiteModules = {}
  try {
    const { data, error } = await admin.from('site_themes').select('modules').eq('site_id', siteId).maybeSingle()
    if (error?.code === UNDEFINED_COLUMN) return out // pre-024 — nothing to write to
    if (error) return out
    current = ((data?.modules ?? {}) as SiteModules)
  } catch {
    return out
  }

  const next: SiteModules = { ...current }
  for (const id of wanted) {
    const def = getModuleDef(id)
    if (!def) { out.unknown.push(id); continue }
    const entry = { id: def.id, name: def.name }
    if (enabled && !moduleAllowedForPlan(def, plan)) { out.blocked.push(entry); continue }
    const isOn = next[id]?.enabled === true
    if (isOn === enabled) { out.noop.push(entry); continue }
    next[id] = { ...(next[id] ?? {}), enabled, variant: next[id]?.variant ?? def.defaultVariant }
    out.changed.push(entry)
  }
  if (!out.changed.length) return out

  // Rebuild the WHOLE config against the registry before persisting, so a row
  // that drifted (an id retired, a plan downgraded) is cleaned on the way past
  // rather than carried forward for ever.
  const clean: SiteModules = {}
  for (const def of MODULES) {
    const cfg = next[def.id]
    if (!cfg) continue
    const on = cfg.enabled === true && moduleAllowedForPlan(def, plan)
    const variant = def.variants.some(v => v.id === cfg.variant) ? cfg.variant! : def.defaultVariant
    const options = (cfg.options && typeof cfg.options === 'object') ? cfg.options : undefined
    if (!on && variant === def.defaultVariant && !options) continue
    clean[def.id] = { enabled: on, variant, ...(options ? { options } : {}) }
  }

  try {
    const { error } = await admin.from('site_themes').upsert(
      { site_id: siteId, modules: clean },
      { onConflict: 'site_id' },
    )
    if (error) return empty()
  } catch {
    return empty()
  }

  // revalidateTag, not updateTag: this runs inside a ROUTE HANDLER (the worker,
  // the webhook), and `updateTag` is Server-Action-only under Cache Components.
  try { revalidateTag(siteTag(siteId), { expire: 0 }) } catch { /* not in a request scope */ }

  return out
}
