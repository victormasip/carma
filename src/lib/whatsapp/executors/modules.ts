// "ACTIVA ELS COMENTARIS" — running the blog's features from WhatsApp (P4).
//
// This is the interaction that makes the agent feel like it runs the blog rather
// than just writing for it. The owner says a feature's name in their own words;
// the change lands on the live site in one turn.
//
// WHICH modules is decided by a DETERMINISTIC matcher (lib/modules/apply.ts), not
// by the model. The router only decides that this turn is about features and
// whether it is an on or an off; a model that is allowed to pick the ids will
// eventually switch on a paywall because someone said "pagament". The registry
// and the plan then have the last word, and anything refused is NAMED.

import { setModulesAsAdmin, matchModules } from '@/lib/modules/apply'
import { buildSiteContext } from '../persona'
import type { ModuleTier } from '@/lib/modules/registry'
import type { ExecutorCtx } from './shared'

export async function executeModules(ctx: ExecutorCtx): Promise<void> {
  const { admin, t, siteCtx, karmaNow, route, inboundText } = ctx

  if (!siteCtx || !ctx.siteId) {
    await ctx.say('Primer necessito saber de quin blog parlem 🤔 Connecta’n un a carma.cat i després els engego jo.')
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  const plan: ModuleTier = karmaNow.superadmin ? 'agency' : karmaNow.plan
  // The router's `topic` carries the distilled request; the raw message is the
  // belt (people name the feature in the sentence, not in a summary of it).
  const said = `${route.topic} ${inboundText}`
  const wanted = matchModules(said)

  if (!wanted.length) {
    const on = siteCtx.modulesOn.map(m => m.name).join(', ') || 'cap, de moment'
    const off = siteCtx.modulesAvailable.slice(0, 8).map(m => m.name).join(', ')
    await ctx.say(
      `No he entès quina funcionalitat 🤔\n\nAra tens actives: ${on}.` +
      (off ? `\nAmb el teu pla també pots encendre: ${off}.` : '') +
      '\n\nDigue’m el nom i te l’engego.',
    )
    await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
    return ctx.finish('done')
  }

  // On or off. The negative forms are the reliable signal; everything else is on.
  const off = /\b(apaga|apagar|treu|treure|desactiva|desactivar|amaga|amagar|quita|quitar|desactiva|remove|disable|turn off|sense)\b/i.test(said)
  const res = await setModulesAsAdmin(admin, ctx.siteId, wanted.map(w => w.id), plan, !off)

  const parts: string[] = []
  if (res.changed.length) {
    const names = res.changed.map(c => c.name).join(', ')
    parts.push(off ? `Fet — he apagat: ${names} ✅` : `Fet — ja tens ${names} al blog ✅`)
  }
  if (res.noop.length) {
    const names = res.noop.map(c => c.name).join(', ')
    parts.push(off ? `${names} ja estava${res.noop.length === 1 ? '' : 'ven'} apagat.` : `${names} ja hi era${res.noop.length === 1 ? '' : 'n'}.`)
  }
  if (res.blocked.length) {
    parts.push(
      `${res.blocked.map(c => c.name).join(', ')} no entra${res.blocked.length === 1 ? '' : 'n'} al pla ${plan}. ` +
      'Si el puges, te l’engego al moment.',
    )
  }
  if (res.unknown.length && !res.changed.length && !res.noop.length && !res.blocked.length) {
    parts.push('Aquesta no la tinc 🤔 Digue’m el nom tal com surt al Carma i la busco.')
  }
  if (res.changed.length) parts.push(`Ja es veu a ${siteCtx.publicUrl}`)

  await ctx.say(parts.join('\n\n') || 'No he pogut tocar res 😕 Torna-ho a provar d’aquí un moment.')

  // The context the NEXT turn reads is now stale by exactly this change, and the
  // most likely next message is about the same feature. Cheap to refresh.
  if (res.changed.length) {
    try { ctx.siteCtx = await buildSiteContext(admin, ctx.siteId, plan) } catch { /* keep the old one */ }
  }

  await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
  return ctx.finish('done')
}
