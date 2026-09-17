'use client'

// "COMENÇA AMB UN BLOG MUNTAT" — the three archetypes, in the dashboard.
//
// The Mòduls tab used to open on a wall of nineteen switches, all off, sorted by
// category. That is a catalogue, and a catalogue asks the owner to design a blog
// before they have written one. An archetype answers the question instead: pick
// the one that sounds like you, and the blog arrives with its modules on and
// configured — the same three the landing page shows, from the same file.
//
// Applying REPLACES the module config (see `applyArchetype`), so it is behind a
// confirm when anything is already switched on. What the plan withholds is named
// out loud rather than silently dropped: a free account gets every free module
// of La Revista and is told, by name, what Premium would add.

import { useState, useTransition } from 'react'
import { Check, Lock, Sparkles, Wand2 } from 'lucide-react'
import {
  ARCHETYPES, archetypeModulesForPlan, type Archetype,
} from '@/lib/render/archetypes'
import { getModuleDef, TIER_RANK, type ModuleTier } from '@/lib/modules/registry'
import { getTemplate } from '@/lib/render/templates'
import { applyArchetype } from '@/lib/actions/modules'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'

const TIER_LABEL: Record<ModuleTier, string> = {
  free: 'Gratis',
  premium: 'Premium',
  gold: 'Or',
  agency: 'Agència',
}

export default function ArchetypePicker({
  siteId, plan, activeCount, onApplied,
}: {
  siteId: string
  plan: ModuleTier
  /** How many modules are on right now — decides whether we confirm first. */
  activeCount: number
  /** The parent owns the module state; we hand back the config we just wrote. */
  onApplied: (archetypeId: string) => void
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const apply = async (a: Archetype) => {
    if (activeCount > 0) {
      const ok = await confirm({
        title: `Aplicar «${a.name}»?`,
        message: 'Es substituirà la configuració de mòduls actual per la d’aquest arquetip. El disseny (colors, lletra, capçalera) no es toca.',
        confirmLabel: 'Aplicar',
        cancelLabel: 'Cancel·lar',
      })
      if (!ok) return
    }
    setBusyId(a.id)
    startTransition(async () => {
      const res = await applyArchetype(siteId, a.id)
      setBusyId(null)
      if (res.error) { toast(res.error, 'error'); return }
      const n = res.applied?.length ?? 0
      const blocked = res.blocked ?? []
      onApplied(a.id)
      if (blocked.length > 0) {
        const names = blocked.map(id => getModuleDef(id)?.name ?? id).join(', ')
        toast(`«${a.name}» aplicat amb ${n} mòduls. Amb ${TIER_LABEL[a.tier]} hi sumaries: ${names}.`, 'info')
      } else {
        toast(`«${a.name}» aplicat: ${n} mòduls actius i configurats.`, 'success')
      }
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Wand2 className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold text-text">Comença amb un blog muntat</h3>
        <span className="text-xs text-subtle">Tria un arquetip i els mòduls arriben engegats i escrits.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {ARCHETYPES.map(a => {
          const tpl = getTemplate(a.templateId)
          const { modules, blocked } = archetypeModulesForPlan(a, plan)
          const unlocked = Object.keys(modules).length
          const total = unlocked + blocked.length
          const locked = TIER_RANK[plan] < TIER_RANK[a.tier]
          const busy = busyId === a.id && pending

          return (
            <article
              key={a.id}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-2xl border bg-surface transition-colors',
                locked ? 'border-border' : 'border-border hover:border-accent/40',
              )}
            >
              {/* The look it dresses itself in, painted in its own real tokens —
                  the same trick the landing wall uses, so the card cannot drift
                  from what applying it actually produces. */}
              {tpl && (
                <div
                  className="flex items-center gap-2 border-b px-3.5 py-2.5"
                  style={{ background: tpl.swatch.bg, borderColor: tpl.swatch.border }}
                >
                  <span
                    className="truncate text-sm font-extrabold tracking-tight"
                    style={{ color: tpl.swatch.text, fontFamily: tpl.tokens.fontHeading }}
                  >
                    {a.name}
                  </span>
                  <span className="ml-auto h-2.5 w-8 shrink-0 rounded-full" style={{ background: tpl.swatch.accent }} />
                </div>
              )}

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wider',
                    locked ? 'bg-surface-hover text-muted' : 'bg-accent-soft text-accent',
                  )}>
                    {locked && <Lock className="h-2.5 w-2.5" />}
                    {TIER_LABEL[a.tier]}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-subtle">
                    {unlocked}/{total} mòduls
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-muted">{a.tagline}</p>

                <ul className="mt-auto space-y-1">
                  {a.headline.map(id => {
                    const def = getModuleDef(id)
                    if (!def) return null
                    const has = !!modules[id]
                    return (
                      <li key={id} className="flex items-center gap-1.5 text-xs font-semibold">
                        {has
                          ? <Check className="h-3 w-3 shrink-0 text-success" strokeWidth={3} />
                          : <Lock className="h-3 w-3 shrink-0 text-subtle" />}
                        <span className={has ? 'text-text' : 'text-subtle'}>{def.name}</span>
                      </li>
                    )
                  })}
                </ul>

                <button
                  type="button"
                  onClick={() => { void apply(a) }}
                  disabled={busy || unlocked === 0}
                  className={cn(
                    'mt-1 inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-60',
                    locked
                      ? 'border border-border bg-surface-subtle text-text hover:bg-surface-hover'
                      : 'bg-accent text-on-accent hover:bg-accent-hover',
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {busy ? 'Aplicant…' : locked ? `Aplicar el que puc (${unlocked})` : 'Aplicar'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
