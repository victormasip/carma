// "QUÈ SAPS FER?" — the capability answer (P4).
//
// Not a menu. An owner who asks this is not browsing a feature list; they are
// wondering whether the thing they have in mind is possible. So the answer is
// short, phrased as sentences they could send back verbatim, and GROUNDED in
// this blog: it names their features, their draft, their plan.
//
// Deterministic on purpose. A model asked "what can you do" invents capabilities
// — scheduling, social posting, replying to comments — and every invented one is
// a broken promise the next turn has to walk back.

import type { ExecutorCtx } from './shared'

export async function executeHelp(ctx: ExecutorCtx): Promise<void> {
  const { t, siteCtx, state } = ctx
  const name = ctx.ownerName ? `${ctx.ownerName}, ` : ''
  const blog = siteCtx?.siteName ? ` a *${siteCtx.siteName}*` : ''

  const lines: string[] = [
    `${name}això és el que puc fer${blog} 👇`.replace(/^./, c => c.toUpperCase()),
    '',
    '✍️ *Escriure* — envia’m una idea, escrita o en àudio, i te’n faig l’article sencer.',
    '📸 *Fotos* — passa’m una foto i te la poso de portada, ajustada i retallada.',
    '✏️ *Canviar* — «fes-lo més curt», «tuteja», «treu el tercer apartat». També en articles ja publicats.',
    '🚀 *Publicar* — quan dius que sí, surt online i et passo l’enllaç.',
    '📊 *Com va* — «com va el blog?» i et dono visites, articles i què s’ha llegit més.',
    '📰 *Què hi ha* — «què he publicat?» i te’n passo la llista amb els enllaços.',
    '🎛️ *Funcionalitats* — «activa els comentaris», «treu la newsletter». Es veu al moment.',
    '💛 *Punts* — «quants punts em queden?», «què costa un article?».',
  ]

  // What they can do RIGHT NOW beats anything abstract.
  const next =
    state.phase === 'awaiting_review' || state.phase === 'awaiting_edit'
      ? 'Ara mateix tens un esborrany a mitges: digues «publica» o explica’m què li canvio.'
      : siteCtx && siteCtx.draftCount > 0
        ? `Tens ${siteCtx.draftCount} esborrany${siteCtx.draftCount === 1 ? '' : 's'} esperant. Vols que en repassem un?`
        : 'Comença per on vulguis — una frase ja em serveix.'
  lines.push('', next)

  await ctx.say(lines.join('\n'))
  await ctx.patchThread({ turn_count: t.turn_count + 1, cost_cents: t.cost_cents + ctx.cost })
  return ctx.finish('done')
}
