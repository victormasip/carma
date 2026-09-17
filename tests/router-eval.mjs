// Router eval suite (§7.1 / C-7) — treats the router prompt as code.
//
// ~18 fixture turns (ca, multi-site, held brief, account, memory) → expected intent.
// Two modes, chosen automatically:
//   · MOCK (default, and whenever OPENAI_API_KEY is absent): forces WA_MOCK_AGENT so
//     routeTurn is deterministic. This validates the harness + fixtures + the mock's
//     intent parity — free, runs anywhere, including this sandbox and pre-merge.
//   · REAL (OPENAI_API_KEY present, WA_ROUTER_EVAL_MOCK unset): runs gpt-4o-mini and
//     gates per-intent accuracy ≥ 90% (bet B2 kill-criterion). This is the run that
//     belongs on merge-to-main; a manual/mock-only gate is an open gate (C-7).
//
// Run: node --experimental-strip-types --import ./tests/register.mjs tests/router-eval.mjs
//   REAL: set OPENAI_API_KEY (and don't set WA_ROUTER_EVAL_MOCK).
//
// Env must be set BEFORE brain.ts is imported (config.ts reads it at module load), so
// the import is DYNAMIC, after we decide the mode.

const hasKey = !!process.env.OPENAI_API_KEY
const useMock = !hasKey || /^(1|true|yes)$/i.test(process.env.WA_ROUTER_EVAL_MOCK || '')

// v2 router is what we eval; force the mode deterministically for the run.
process.env.WA_BRAIN_V2 = '1'
process.env.WA_MOCK_AGENT = useMock ? '1' : ''

const { routeTurn } = await import('@/lib/whatsapp/brain.ts')

const ACCURACY_GATE = 0.9

// ── fixtures ──────────────────────────────────────────────────────────────────
function mkInput(message, over = {}) {
  return {
    message,
    history: [],
    siteContext: null,
    candidateSites: [],
    noSites: false,
    hasPendingDraft: false,
    pendingDraftTitle: null,
    awaitingEdit: false,
    pendingBrief: null,
    ownerContext: null,
    userPreferences: null,
    ...over,
  }
}

// realOnly: exercised only against the real model (the mock can't do e.g. name-picks
// or memory slot extraction — that's prompt behaviour, not regex).
const FIXTURES = [
  // chat
  { name: 'greeting', input: mkInput('hola!'), intent: 'chat' },
  { name: 'thanks', input: mkInput('gràcies, molt bé!'), intent: 'chat' },
  { name: 'smalltalk', input: mkInput('bon dia 😊'), intent: 'chat' },
  // write
  { name: 'clear idea', input: mkInput('vull un article sobre el turisme rural al Berguedà'), intent: 'write' },
  { name: 'thin idea', input: mkInput('els beneficis del formatge de cabra artesà'), intent: 'write' },
  { name: 'imperative', input: mkInput('escriu sobre receptes de tardor amb carbassa'), intent: 'write' },
  // publish (needs a pending draft)
  { name: 'publish text', input: mkInput("publica'l", { hasPendingDraft: true, pendingDraftTitle: 'Receptes de tardor' }), intent: 'publish' },
  { name: 'publish endavant', input: mkInput('endavant, publica', { hasPendingDraft: true, pendingDraftTitle: 'X' }), intent: 'publish' },
  // edit (needs a pending draft; mock matches these verbs)
  { name: 'edit title', input: mkInput('canvia el títol', { hasPendingDraft: true, awaitingEdit: true, pendingDraftTitle: 'X' }), intent: 'edit' },
  { name: 'edit shorter', input: mkInput('escurça el segon paràgraf', { hasPendingDraft: true, awaitingEdit: true, pendingDraftTitle: 'X' }), intent: 'edit' },
  { name: 'edit add', input: mkInput('afegeix una conclusió', { hasPendingDraft: true, awaitingEdit: true, pendingDraftTitle: 'X' }), intent: 'edit' },
  // account (v2)
  { name: 'punts left', input: mkInput('quants punts em queden?'), intent: 'account' },
  { name: 'cost', input: mkInput('què costa un article?'), intent: 'account' },
  { name: 'plan', input: mkInput('quin pla tinc?'), intent: 'account' },
  // ── The 2026-09-17 intents. Each one used to fall into 'chat' and get an
  //    invented answer; each now has a deterministic executor behind it, so a
  //    misroute is a wrong ANSWER rather than a vague one.
  { name: 'status', input: mkInput('com va el blog?'), intent: 'status' },
  { name: 'status visits', input: mkInput('quantes visites tinc aquest mes?'), intent: 'status' },
  { name: 'list', input: mkInput('què he publicat últimament?'), intent: 'list' },
  { name: 'modules on', input: mkInput('activa els comentaris'), intent: 'modules' },
  { name: 'modules off', input: mkInput('treu el mur de pagament'), intent: 'modules' },
  { name: 'cover', input: mkInput("posa-li una portada a l'article", { hasPendingDraft: true, pendingDraftTitle: 'X' }), intent: 'cover' },
  { name: 'help', input: mkInput('què saps fer?'), intent: 'help' },
  // site pick by number (mock + real)
  { name: 'site pick #', input: mkInput('1', { candidateSites: ['La Formatgeria', 'El Celler'], pendingBrief: 'formatge de cabra' }), intent: 'write', siteIndex: 1 },
  // ── real-only (prompt behaviour the mock can't emulate) ──
  { name: 'site pick by name', input: mkInput('el de la formatgeria', { candidateSites: ['La Formatgeria', 'El Celler'], pendingBrief: 'formatge de cabra' }), intent: 'write', siteIndex: 1, realOnly: true },
  { name: 'remember pref', input: mkInput("a partir d'ara escriu els títols sense emojis"), intent: 'chat', expectRemember: true, realOnly: true },
  { name: 'forget pref', input: mkInput('oblida això dels emojis als títols', { userPreferences: ['títols sense emojis'] }), intent: 'chat', expectForget: true, realOnly: true },
]

// ── run ───────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0
const fails = []
const perIntent = new Map() // intent → { total, correct }
function bump(intent, correct) {
  const s = perIntent.get(intent) ?? { total: 0, correct: 0 }
  s.total++
  if (correct) s.correct++
  perIntent.set(intent, s)
}

async function main() {
  console.log(`\nRouter eval — mode: ${useMock ? 'MOCK (deterministic)' : 'REAL (gpt-4o-mini, accuracy gate)'}\n`)
  if (useMock && hasKey) console.log('  (OPENAI_API_KEY present but WA_ROUTER_EVAL_MOCK forced mock)\n')
  if (useMock && !hasKey) console.log('  (no OPENAI_API_KEY → running the free structural pass; set the key on merge for the real gate)\n')

  const fixtures = FIXTURES.filter((f) => !f.realOnly || !useMock)

  for (const f of fixtures) {
    let route
    try {
      route = await routeTurn(f.input)
    } catch (e) {
      fail++; fails.push(`${f.name}: routeTurn threw — ${e instanceof Error ? e.message : e}`)
      bump(f.intent, false)
      continue
    }
    const intentOk = route.intent === f.intent
    const siteOk = f.siteIndex === undefined || route.siteIndex === f.siteIndex
    const rememberOk = !f.expectRemember || (typeof route.remember === 'string' && route.remember.length > 0)
    const forgetOk = !f.expectForget || (typeof route.forget === 'string' && route.forget.length > 0)
    const good = intentOk && siteOk && rememberOk && forgetOk
    bump(f.intent, good)

    if (useMock) {
      // Mock is deterministic → any miss is a harness/fixture bug (assert exactly).
      if (good) { pass++ } else {
        fail++
        fails.push(`${f.name}: got intent=${route.intent} siteIndex=${route.siteIndex} (expected ${f.intent}${f.siteIndex !== undefined ? ` #${f.siteIndex}` : ''})`)
      }
    } else {
      // Real mode: track for the accuracy gate below (individual misses are allowed).
      if (good) pass++; else { fail++; fails.push(`${f.name}: got ${route.intent}${f.siteIndex !== undefined ? ` #${route.siteIndex}` : ''} (wanted ${f.intent})`) }
    }
  }

  console.log(`Fixtures: ${pass} matched, ${fail} missed (of ${fixtures.length})`)
  console.log('\nPer-intent:')
  let gateFailed = false
  for (const [intent, s] of perIntent) {
    const acc = s.total ? s.correct / s.total : 1
    const line = `  ${intent.padEnd(8)} ${s.correct}/${s.total}  (${Math.round(acc * 100)}%)`
    console.log(line)
    if (!useMock && acc < ACCURACY_GATE) gateFailed = true
  }

  if (fails.length) { console.log('\nMisses:'); for (const m of fails) console.error('  ✗ ' + m) }

  if (useMock) {
    // Structural pass: the harness + fixtures + mock parity must be exact.
    console.log(`\n${fail ? '✗' : '✓'} router-eval (mock structural): ${pass}/${fixtures.length}`)
    process.exit(fail ? 1 : 0)
  } else {
    console.log(`\n${gateFailed ? '✗' : '✓'} router-eval (real): per-intent accuracy gate ${Math.round(ACCURACY_GATE * 100)}%`)
    process.exit(gateFailed ? 1 : 0)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
