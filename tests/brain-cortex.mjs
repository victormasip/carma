// Invariant suite for the "Living Brain" P0 + P1 work (docs/plans/2026-07-07-…).
//
// Mirrors the test:render ethos: run the REAL modules against deterministic fixtures
// and assert the guarantees that matter. Everything here is PURE or DB-faked — no
// OpenAI, no Supabase, no network — so it runs in plain node with type-stripping:
//
//   node --experimental-strip-types --import ./tests/register.mjs tests/brain-cortex.mjs
//
// Covers: (1) per-thread job serialization (E-20, the highest-risk P0 fix), (2) the
// Tier-1 OWNER CONTEXT token budget + agency cap, (3) the context-aware upsell (§3.3),
// (4) unsupported-media replies (B5/B4), (5) the seed-aware profiler helpers, and
// (6) fail-open degradation.

import { claimNextJob, claimNextJobFallback } from '@/lib/whatsapp/claim.ts'
import { KARMA_ALLOCATIONS } from '@/lib/karma/config'
import sharp from 'sharp'
import { formatLightContext, buildLightContext } from '@/lib/whatsapp/persona.ts'
import { outOfPuntsMessage } from '@/lib/whatsapp/upsell.ts'
import { normalizeUnsupportedKind, unsupportedMediaReply, lowConfidenceEcho } from '@/lib/whatsapp/media.ts'
import { matchModules } from '@/lib/modules/match.ts'
import { processCoverImage, wasThumbnail, COVER_W, COVER_H } from '@/lib/whatsapp/inboundImage.ts'
import { extractVerifyCode, inboundMatchesCode } from '@/lib/whatsapp/verify.ts'
import { classifyProfileSource, computeSeoSnapshot, formatBrainProfile } from '@/lib/whatsapp/profile.ts'
import { applyRemember, applyForget, factsToStrings } from '@/lib/whatsapp/memory.ts'
import { assessTranscript } from '@/lib/whatsapp/transcript.ts'
import { accountSummary } from '@/lib/whatsapp/upsell.ts'
import { buildCoverPrompt } from '@/lib/whatsapp/coverImage.ts'
import { parseDateRef, matchPosts } from '@/lib/whatsapp/resolve.ts'
import { resolveHeldAction, firstPick } from '@/lib/whatsapp/transition.ts'
import { pickNudge } from '@/lib/whatsapp/nudge.ts'

// ── tiny test framework (same shape as render-stress.mjs) ─────────────────────
let pass = 0, fail = 0
const fails = []
function ok(cond, msg) {
  if (cond) { pass++ } else { fail++; fails.push(msg); console.error('  ✗ ' + msg) }
}
function section(name) { console.log('\n— ' + name) }

// ══════════════════════════════════════════════════════════════════════════════
// A fake supabase-admin sufficient for the two claim paths. Holds an in-memory
// generation_jobs array and emulates JUST the query chains claim.ts uses.
// ══════════════════════════════════════════════════════════════════════════════
function makeJobs(specs) {
  const base = Date.now()
  return specs.map((s, i) => ({
    id: s.id,
    thread_id: s.thread,
    status: s.status ?? 'queued',
    lease_until: s.lease ?? null,
    attempts: s.attempts ?? 0,
    // earlier index ⇒ older created_at (so [a,b] ⇒ a is oldest)
    created_at: new Date(base - (specs.length - i) * 1000).toISOString(),
    message_id: s.id + '-msg',
    kind: 'agent_turn',
    payload: {},
    result: null,
    error: null,
    updated_at: new Date(base).toISOString(),
  }))
}

function fakeJobsAdmin(jobs, { rpcMissing = false } = {}) {
  const nowMs = () => Date.now()
  const liveRunning = (j) => j.status === 'running' && j.lease_until && new Date(j.lease_until).getTime() >= nowMs()
  const claimable = (j) => j.status === 'queued' || (j.status === 'running' && (!j.lease_until || new Date(j.lease_until).getTime() < nowMs()))

  async function rpc(name, args) {
    if (rpcMissing) return { data: null, error: { code: '42883', message: 'function does not exist' } }
    if (name !== 'claim_next_agent_job') return { data: null, error: { code: 'PGRST202' } }
    const busy = new Set(jobs.filter(liveRunning).map((j) => j.thread_id))
    const cand = jobs
      .filter(claimable)
      .filter((j) => !busy.has(j.thread_id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    if (!cand) return { data: [], error: null }
    cand.status = 'running'
    cand.lease_until = new Date(nowMs() + (args?.p_lease_seconds ?? 300) * 1000).toISOString()
    cand.attempts = (cand.attempts ?? 0) + 1
    return { data: [{ ...cand }], error: null }
  }

  function from(table) {
    const q = { table, kind: 'select', eq: [], gt: [], or: null, not: null, order: null, limit: null, patch: null }
    const api = {
      select() { return api },
      update(patch) { q.kind = 'update'; q.patch = patch; return api },
      eq(c, v) { q.eq.push([c, v]); return api },
      gt(c, v) { q.gt.push([c, v]); return api },
      or(s) { q.or = s; return api },
      not(c, op, vals) { q.not = [c, op, vals]; return api },
      order(c, o) { q.order = [c, o]; return api },
      limit(n) { q.limit = n; return api },
      maybeSingle() { return Promise.resolve(run(q, true)) },
      single() { return Promise.resolve(run(q, true)) },
      then(res, rej) { return Promise.resolve(run(q, false)).then(res, rej) },
    }
    return api
  }

  function run(q, single) {
    if (q.table !== 'generation_jobs') return single ? { data: null } : { data: [] }
    let rows = jobs.slice()
    for (const [c, v] of q.eq) rows = rows.filter((j) => j[c] === v)
    for (const [c, v] of q.gt) rows = rows.filter((j) => j[c] && new Date(j[c]).getTime() > new Date(v).getTime())
    if (q.or) rows = rows.filter(claimable) // the only .or() used is the claimable predicate
    if (q.not) {
      const set = new Set(String(q.not[2]).replace(/[()]/g, '').split(',').filter(Boolean))
      rows = rows.filter((j) => !set.has(String(j[q.not[0]])))
    }
    if (q.order) rows.sort((a, b) => String(a[q.order[0]]).localeCompare(String(b[q.order[0]])) * (q.order[1]?.ascending === false ? -1 : 1))
    if (q.kind === 'update') {
      const updated = rows.map((j) => { Object.assign(j, q.patch); return { ...j } })
      return { data: single ? updated[0] ?? null : updated }
    }
    if (typeof q.limit === 'number') rows = rows.slice(0, q.limit)
    return { data: single ? rows[0] ?? null : rows.map((r) => ({ ...r })) }
  }

  return { rpc, from }
}

// ── A fake admin for buildLightContext (sites + posts_counts_by_site) ─────────
function fakeDataAdmin({ sites = [], counts = null, rpcError = false, throwOnPosts = false }) {
  async function rpc(name) {
    if (name === 'posts_counts_by_site') return rpcError ? { data: null, error: { code: '42883' } } : { data: counts ?? [], error: null }
    return { data: null, error: { code: 'PGRST202' } }
  }
  function from(table) {
    let inVals = null
    const api = {
      select() { return api },
      eq() { return api },
      in(_c, vals) { inVals = vals; return api },
      maybeSingle() { return Promise.resolve({ data: null }) },
      then(res, rej) {
        try {
          if (table === 'sites') return Promise.resolve({ data: sites.filter((s) => inVals?.includes(s.id)) }).then(res, rej)
          if (table === 'posts') {
            if (throwOnPosts) throw new Error('boom')
            return Promise.resolve({ data: [] }).then(res, rej)
          }
          return Promise.resolve({ data: [] }).then(res, rej)
        } catch {
          return Promise.resolve({ data: null }).then(res, rej)
        }
      },
    }
    return api
  }
  return { rpc, from }
}

// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  // ── 1. Per-thread serialization (E-20) — the headline P0 fix ────────────────
  section('per-thread job serialization (E-20)')
  {
    // RPC path: two queued jobs, SAME thread → the 2nd claim must find nothing.
    const jobs = makeJobs([{ id: 'a', thread: 'T' }, { id: 'b', thread: 'T' }])
    const admin = fakeJobsAdmin(jobs)
    const first = await claimNextJob(admin)
    const second = await claimNextJob(admin)
    ok(first && first.id === 'a', 'RPC: first claim takes the oldest job of thread T')
    ok(second === null, 'RPC: second claim on the SAME thread returns null (serialized — no double-spend)')
  }
  {
    // RPC path: DIFFERENT threads → both claim, then exhausted.
    const jobs = makeJobs([{ id: 'a', thread: 'T' }, { id: 'b', thread: 'U' }])
    const admin = fakeJobsAdmin(jobs)
    const c1 = await claimNextJob(admin)
    const c2 = await claimNextJob(admin)
    const c3 = await claimNextJob(admin)
    ok(c1 && c2 && c1.thread_id !== c2.thread_id, 'RPC: two different threads both get claimed')
    ok(c3 === null, 'RPC: nothing left to claim')
  }
  {
    // Fallback path (pre-030): a live running job on T must exclude T's queued job.
    const future = new Date(Date.now() + 60_000).toISOString()
    const jobs = makeJobs([
      { id: 'r1', thread: 'T', status: 'running', lease: future },
      { id: 'q1', thread: 'T' },
      { id: 'q2', thread: 'U' },
    ])
    const admin = fakeJobsAdmin(jobs, { rpcMissing: true })
    const claimed = await claimNextJobFallback(admin)
    ok(claimed && claimed.id === 'q2', 'fallback: skips the thread that already has a live running job')
    const next = await claimNextJobFallback(admin)
    ok(next === null, 'fallback: no claimable job on a free thread → null')
  }
  {
    // claimNextJob transparently falls back when the RPC is missing.
    const jobs = makeJobs([{ id: 'a', thread: 'T' }])
    const admin = fakeJobsAdmin(jobs, { rpcMissing: true })
    const claimed = await claimNextJob(admin)
    ok(claimed && claimed.id === 'a', 'claimNextJob falls back to the JS claim when the RPC is absent')
  }

  // ── 2. Tier-1 OWNER CONTEXT: token budget + agency cap ──────────────────────
  section('Tier-1 OWNER CONTEXT (§2.1 / §7.7)')
  {
    const sites = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `El Blog del Client Número ${i + 1}`, total: 20 + i, published: 10 + i }))
    const block = formatLightContext({
      ownerName: 'Marta', plan: 'agency', punts: 2500, puntsAvailable: true, superadmin: false,
      sites, extraSiteCount: 0, pendingDraftTitle: 'Un esborrany qualsevol',
    })
    ok(block.includes('Marta'), 'renders the owner name')
    ok(block.includes('Blogs (8)'), 'renders all 8 blogs')
    ok(block.length <= 1400, `8-site OWNER CONTEXT stays within budget (~350 tokens): ${block.length} chars`)
  }
  {
    const sites = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `Blog ${i}`, total: 5, published: 3 }))
    const block = formatLightContext({
      ownerName: null, plan: 'gold', punts: 800, puntsAvailable: true, superadmin: false,
      sites, extraSiteCount: 4, pendingDraftTitle: null,
    })
    ok(block.includes('Blogs (12)') && block.includes('…i 4 més'), 'agency cap renders "…i N més" for the overflow')
    ok(!block.includes('Owner:'), 'no owner line when name is unknown (greeting degrades)')
  }
  {
    const block = formatLightContext({
      ownerName: 'Admin', plan: 'free', punts: null, puntsAvailable: false, superadmin: true,
      sites: [], extraSiteCount: 0, pendingDraftTitle: null,
    })
    ok(block.includes('superadmin'), 'superadmin renders unlimited punts')
    ok(!/\bpunts\b(?!\s*il)/.test(block.replace('punts il·limitats', '')), 'no numeric balance leaked for superadmin')
  }

  // ── 3. buildLightContext assembly (cap + fail-open) ─────────────────────────
  section('buildLightContext assembly + degradation (E-15)')
  {
    const sites = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `Blog ${i}` }))
    const counts = sites.map((s, i) => ({ site_id: s.id, total: 10, published: i }))
    const admin = fakeDataAdmin({ sites, counts })
    const ctx = await buildLightContext(admin, {
      ownerName: 'Jordi', karma: { plan: 'agency', balance: 2500, available: true, superadmin: false }, siteIds: sites.map((s) => s.id),
    })
    ok(ctx.sites.length === 8 && ctx.extraSiteCount === 2, 'caps at 8 shown sites, 2 overflow')
    ok(formatLightContext(ctx).includes('…i 2 més'), 'assembled context renders the overflow tail')
  }
  {
    // rpc AND posts both fail → must not throw; sites still render by name.
    const sites = [{ id: 's0', name: 'Únic Blog' }]
    const admin = fakeDataAdmin({ sites, rpcError: true, throwOnPosts: true })
    let threw = false
    let ctx = null
    try {
      ctx = await buildLightContext(admin, { ownerName: null, karma: { plan: 'free', balance: 100, available: true, superadmin: false }, siteIds: ['s0'] })
    } catch { threw = true }
    ok(!threw, 'buildLightContext fails open (no throw) when counts are unavailable')
    ok(ctx && ctx.sites.length === 1 && ctx.sites[0].published === 0, 'sites still render by name with zero counts')
  }

  // ── 4. Context-aware upsell (§3.3, D1/D3) ───────────────────────────────────
  section('context-aware out-of-punts upsell (§3.3)')
  {
    const classic = outOfPuntsMessage()
    ok(classic.includes('Punts de Carma') && classic.includes('/dashboard/karma'), 'no-context call = classic one-liner (WA_BRAIN_V2-off parity)')
  }
  {
    const rich = outOfPuntsMessage({
      ownerName: 'Marta', plan: 'free', heldIdea: true,
      unclaimedChallenges: [{ title: 'Fes teu l’Estudi', amount: 40 }],
    })
    ok(rich.includes('Marta'), 'upsell greets by name')
    ok(rich.includes('Free') && rich.includes('100/mes'), 'upsell states the real plan + allocation')
    ok(rich.includes('Fes teu l’Estudi') && rich.includes('+40'), 'upsell surfaces a claimable repte')
    // The number comes from the config, not from this file: the allocation moved
    // (400 -> 500) with the 2026-09-16 pricing change and a hardcoded literal
    // failed a test that was still testing the right thing.
    ok(
      rich.includes('Premium') && rich.includes(String(KARMA_ALLOCATIONS.premium)),
      'upsell offers the next plan up',
    )
    ok(rich.includes('guardo'), 'held idea is reassured (nothing lost)')
  }
  {
    const mid = outOfPuntsMessage({ ownerName: 'Pau', plan: 'free', variant: 'mid_flow', heldIdea: true })
    ok(mid.includes('publicar gratis'), 'D3 mid-flow: the draft is publishable free')
    ok(!mid.includes('guardo'), 'D3 mid-flow does not tack on the held-idea line')
  }

  // ── 5. Unsupported media replies (B5 / B4) ──────────────────────────────────
  // ── Claim-by-code (migration 035) ─────────────────────────────────────────
  // This extractor decides WHOSE ACCOUNT a phone number gets attached to, so it
  // is the most security-sensitive pure function in the WhatsApp path. A false
  // positive binds a stranger's handset to someone else's blog.
  section('claim by code (extractVerifyCode)')
  {
    ok(extractVerifyCode('Carma 481920') === '481920', 'the happy path: the deep-link message')
    ok(extractVerifyCode('carma  481920  ') === '481920', 'tolerant of spacing')
    ok(extractVerifyCode('el meu codi és 481920, gràcies!') === '481920', 'finds it inside a sentence')

    ok(extractVerifyCode('') === null, 'empty message → null')
    ok(extractVerifyCode(null) === null, 'null message → null')
    ok(extractVerifyCode('hola, com va?') === null, 'no digits → null')
    ok(extractVerifyCode('12345') === null, 'five digits is not a code')

    // The two that matter. A run LONGER than six is not a code, and TWO
    // candidates is ambiguous — guessing at an ambiguous credential is exactly
    // how an account gets bound to the wrong person.
    ok(extractVerifyCode('+34 600 123456789') === null, 'a long digit run is not a code')
    ok(extractVerifyCode('Carma 481920 o 123456?') === null, 'two candidates → null, never a guess')
    ok(extractVerifyCode('34600123456') === null, 'a pasted phone number yields nothing')

    // And the older matcher still behaves for the phone-first path.
    ok(inboundMatchesCode('Carma 481920', '481920'), 'inboundMatchesCode still matches')
    ok(!inboundMatchesCode('Carma 481920', '999999'), 'inboundMatchesCode rejects a wrong code')
    ok(!inboundMatchesCode('Carma 481920', null), 'no code to match against → false')
  }

  section('unsupported media (B5)')
  {
    ok(normalizeUnsupportedKind('video') === 'video', 'video → video')
    ok(normalizeUnsupportedKind('document') === 'document', 'document → document')
    ok(normalizeUnsupportedKind('sticker') === 'sticker', 'sticker → sticker')
    ok(normalizeUnsupportedKind('location') === 'location', 'location → location')
    ok(normalizeUnsupportedKind('contacts') === 'contact', 'contacts → contact')
    ok(normalizeUnsupportedKind('whatever') === 'unknown', 'unknown type → unknown')
    ok(unsupportedMediaReply('video') !== unsupportedMediaReply('sticker'), 'replies vary by media type')
    ok(unsupportedMediaReply('video').length > 10, 'reply is a real, friendly message')
  }

  // ── The 2026-09-17 image path. `imageNoCaptionReply` used to be asserted here;
  //    it was deleted with the behaviour it described ("encara no sé escriure a
  //    partir d'imatges"), which stopped being true the day a photo became a
  //    cover. What replaces it is the processing that has to be right.
  section('inbound photo → cover (2026-09-17)')
  {
    // A portrait phone photo, smaller than the cover box in BOTH axes — the
    // common WhatsApp case, and the one a naive resize letterboxes.
    const portrait = await sharp({
      create: { width: 600, height: 800, channels: 3, background: { r: 200, g: 120, b: 40 } },
    }).jpeg().toBuffer()
    const out = await processCoverImage(portrait)
    ok(!('error' in out), 'a 600x800 portrait JPEG processes without error')
    if (!('error' in out)) {
      ok(out.width === COVER_W && out.height === COVER_H, `fills the cover box exactly (${out.width}x${out.height})`)
      ok(out.contentType === 'image/webp', 'comes out as WebP, not a 4MB JPEG')
      ok(out.upscaled === true, 'a source smaller than the box is flagged as upscaled')
      ok(out.sourceWidth === 600 && out.sourceHeight === 800, 'remembers the real source size')
      ok(wasThumbnail(out) === false, '600px wide is small but not a thumbnail')
      ok(out.bytes.length < 400_000, `stays a sane hero weight (${(out.bytes.length / 1024).toFixed(0)}KB)`)
    }
  }
  {
    const tiny = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 10, g: 80, b: 120 } },
    }).png().toBuffer()
    const out = await processCoverImage(tiny)
    ok(!('error' in out) && wasThumbnail(out), 'a 320px source is called what it is: a thumbnail')
  }
  {
    const out = await processCoverImage(Buffer.from('this is not an image'))
    ok('error' in out, 'garbage bytes fail closed instead of throwing')
  }

  // ── The feature matcher. It must be a LOOKUP, never a guess: "activa els
  //    comentaris" has exactly one correct answer, every single time.
  section('module matcher (P4 — "activa els comentaris")')
  {
    const hit = (s) => matchModules(s).map(m => m.id)
    ok(hit('activa els comentaris').includes('comments'), 'catalan, with the article')
    ok(hit('activa los comentarios').includes('comments'), 'spanish')
    ok(hit('turn on comments').includes('comments'), 'english')
    ok(hit('posa-hi la newsletter').includes('newsletter'), 'newsletter by name')
    ok(hit('treu el mur de pagament').includes('paywall'), 'paywall by its catalan name')
    ok(hit('vull el cercador').includes('search'), 'search by a word nobody spells like the id')
    ok(hit('activa l\u2019índex de l\u2019article').includes('tableOfContents'), 'accent-folded match')
    ok(hit('').length === 0, 'an empty message matches nothing')
    ok(hit('escriu un article sobre pastissos').length === 0, 'an ordinary brief matches nothing')
    // The trap: a short id must not match inside an unrelated word.
    ok(!hit('m\u2019agradaria escriure sobre bicicletes').includes('likes'), 'short ids need a word boundary')
  }

  // ── 6. Profiler helpers (seed-aware, SEO snapshot) ──────────────────────────
  section('brand profiler helpers (§2.2, bet B4)')
  {
    ok(classifyProfileSource(4) === 'auto', 'threshold met → auto profile')
    ok(classifyProfileSource(3) === 'seed', 'thin data (3 posts) → seed profile')
    ok(classifyProfileSource(0) === 'seed', 'no data → seed profile')
  }
  {
    const posts = [
      { title: 'Nou menú', categories: ['menús'], is_published: true, created_at: '2026-07-01T00:00:00Z', meta: { focus_keyword: 'menú tardor' } },
      { title: 'Vi novell', categories: ['vins'], is_published: true, created_at: '2026-06-01T00:00:00Z', meta: { focus_keyword: 'vi novell' } },
      { title: 'Receptes antigues', categories: ['receptes'], is_published: true, created_at: '2026-01-01T00:00:00Z', meta: {} },
    ]
    const snap = computeSeoSnapshot(posts, 2)
    ok(snap.lastPublishedAt === '2026-07-01T00:00:00Z', 'SEO snapshot picks the newest published date')
    ok(snap.focusKeywordsUsed.includes('menú tardor') && snap.focusKeywordsUsed.includes('vi novell'), 'collects used focus keywords')
    ok(snap.opportunities.includes('receptes'), 'flags a category gone quiet as an opportunity')
  }
  {
    const seed = formatBrainProfile({ siteId: 's', industry: 'formatgeria', audience: 'gurmets', tone: null, contentPillars: null, seo: null, writingRules: null, source: 'seed', generatedAt: null, stale: false })
    ok(seed.includes('seed') && seed.includes('formatgeria'), 'seed profile is labeled a light hint')
    const auto = formatBrainProfile({ siteId: 's', industry: 'formatgeria', audience: 'gurmets', tone: null, contentPillars: null, seo: null, writingRules: null, source: 'auto', generatedAt: null, stale: false })
    ok(!auto.includes('seed'), 'auto profile is not labeled seed')
  }

  // ── 7. Owner memory (§2.3) — P2 ─────────────────────────────────────────────
  section('owner memory: remember / forget (§2.3)')
  {
    const r1 = applyRemember({ facts: [] }, 'títols sense emojis', { max: 3 })
    ok(factsToStrings(r1.memory).includes('títols sense emojis'), 'remember appends a fact')
    ok(r1.evicted === null, 'no eviction under the cap')

    let mem = { facts: [] }
    mem = applyRemember(mem, 'a', { max: 2 }).memory
    mem = applyRemember(mem, 'b', { max: 2 }).memory
    const r3 = applyRemember(mem, 'c', { max: 2 })
    ok(r3.evicted === 'a', 'FIFO eviction returns the oldest fact so it can be announced (E-11)')
    ok(factsToStrings(r3.memory).join(',') === 'b,c', 'cap keeps the two newest')

    const dd = applyRemember({ facts: [{ text: 'x', learned_at: 't' }, { text: 'y', learned_at: 't' }] }, 'X', { max: 2 })
    ok(dd.evicted === null && factsToStrings(dd.memory).join(',') === 'y,X', 'dedupe re-adds newest (new casing wins) without evicting')

    const fg = applyForget({ facts: [{ text: 'títols sense emojis', learned_at: 't' }, { text: 'to informal', learned_at: 't' }] }, 'emojis')
    ok(fg.removed === 'títols sense emojis', 'forget removes the best string-match fact')
    ok(applyForget({ facts: [] }, 'res').removed === null, 'forget with nothing to match returns null')
  }

  // ── 8. Whisper transcript confidence (§5 C1 / E-16) — P2 ───────────────────
  section('Whisper transcript confidence (E-16)')
  {
    ok(assessTranscript('hola tot bé', [{ avg_logprob: -0.2, no_speech_prob: 0.05, compression_ratio: 1.4 }]).lowConfidence === false, 'clean segments → confident')
    ok(assessTranscript('x', [{ avg_logprob: -1.6 }]).lowConfidence === true, 'very negative avg_logprob → low confidence')
    ok(assessTranscript('x', [{ no_speech_prob: 0.8 }]).lowConfidence === true, 'high no_speech_prob → low confidence')
    ok(assessTranscript('x', [{ compression_ratio: 3.0 }]).lowConfidence === true, 'high compression_ratio → low confidence (repetition)')
    ok(assessTranscript('x', []).lowConfidence === false, 'no segments → cannot judge → not low (never blocks)')
    ok(assessTranscript('x', [{ no_speech_prob: 0.1 }, { no_speech_prob: 0.9 }]).lowConfidence === true, 'worst segment drives the no_speech verdict')
  }

  // ── 9. Account summary (§2.5 — cost 0, worker-rendered numbers E-19) — P2 ───
  section('account summary (E-19)')
  {
    const a = accountSummary({ balance: 320, plan: 'free', allocation: 100, superadmin: false })
    ok(a.includes('320') && a.includes('Free') && a.includes('100/mes'), 'states the real balance + plan + allocation')
    ok(a.includes('80') && a.includes('20'), 'includes catalogue prices (article / revision)')
    ok(accountSummary({ balance: null, plan: 'free', allocation: 100, superadmin: true }).includes('il·limitats'), 'superadmin → unlimited')
    ok(!/tens\s+\d/i.test(accountSummary({ balance: null, plan: 'premium', allocation: 400, superadmin: false })), 'unknown balance → no invented number')
  }

  // ── 10. Low-confidence echo-back (§3.5) — P2 ────────────────────────────────
  section('low-confidence echo-back (§3.5)')
  {
    const e = lowConfidenceEcho('vull un article sobre la fira de tardor del poble')
    ok(e.includes('fira de tardor'), 'echoes the understood fragment back')
    ok(/mitges|confirma/i.test(e), 'asks to confirm / resend')
    ok(lowConfidenceEcho('x'.repeat(200)).includes('…'), 'truncates a long transcript with an ellipsis')
  }

  // ── 11. Cover image prompt (P2.5) ──────────────────────────────────────────
  section('cover image prompt (P2.5)')
  {
    const p = buildCoverPrompt({ title: 'Postres de tardor', excerpt: 'carbassa i canyella', brandHint: 'La Cuina de la Marta' })
    ok(p.includes('Postres de tardor'), 'prompt names the article title')
    ok(p.includes('carbassa i canyella'), 'prompt carries the theme/excerpt')
    ok(/no text|no lettering/i.test(p), 'prompt forbids text overlay (clean hero)')
  }

  // ── 12. Edit-published resolver (E-5) ───────────────────────────────────────
  section('edit-published deterministic resolver (E-5)')
  {
    const now = Date.parse('2026-07-08T12:00:00Z')
    const win = parseDateRef('ahir', now)
    ok(win && new Date(win.from).getTime() < now && new Date(win.to).getTime() <= now + 1, '"ahir" → a recent created_at window')
    ok(parseDateRef('la setmana passada', now) !== null, '"la setmana passada" parses')
    ok(parseDateRef(null) === null && parseDateRef('qualsevol cosa') === null, 'no/garbage date → null')

    const rows = [
      { id: '1', title: 'El menú de tardor', slug: 'menu-tardor', html: '<p>Preu 25€ el cap de setmana</p>' },
      { id: '2', title: 'El menú de Nadal', slug: 'menu-nadal', html: '<p>Reserva ja</p>' },
      { id: '3', title: 'Vins novells', slug: 'vins', html: '<p>El preu ha pujat</p>' },
    ]
    // confusable titles (E-23): "menú de tardor" must not match "menú de Nadal"
    ok(matchPosts(rows, { titleRef: 'menú de tardor', contentRef: null, dateRef: null }).map(r => r.id).join() === '1', 'accent-folded title match is precise (tardor ≠ Nadal)')
    // content ILIKE: "preu" matches posts 1 and 3
    ok(matchPosts(rows, { titleRef: null, contentRef: 'preu', dateRef: null }).map(r => r.id).sort().join() === '1,3', 'content hint matches the body (accent-folded)')
    ok(matchPosts(rows, { titleRef: 'inexistent', contentRef: null, dateRef: null }).length === 0, 'no match → empty (never edits a guess)')
    ok(matchPosts(rows, { titleRef: null, contentRef: null, dateRef: 'ahir' }).length === 3, 'date-only hints → the whole window (resolver then narrows)')
  }

  // ── 13. Held-action transition table (E-14) ─────────────────────────────────
  section('held-action transition table (E-14)')
  {
    ok(firstPick('el 2') === 2 && firstPick('vull el número 3 gràcies') === 3, 'firstPick reads a numbered choice')
    ok(firstPick('cap número aquí') === null, 'no number → null')
    const held = (missing) => ({ kind: 'edit', payload: 'canvia el preu', missing, candidates: ['a', 'b', 'c'], site_id: 's', held_at: 't' })
    const route = (over = {}) => ({ intent: 'edit', reply: '', topic: '', siteIndex: null, remember: null, forget: null, hadToGuess: false, targetPost: null, usage: { in: 0, out: 0 }, ...over })
    ok(resolveHeldAction(held('target_post'), route(), '2', false).action === 'resume', 'target_post resumes on a numbered pick')
    ok(resolveHeldAction(held('target_post'), route(), '2', false).pickIndex === 2, 'the picked index is carried')
    ok(resolveHeldAction(held('target_post'), route(), 'millor un altre tema', false).action === 'drop', 'target_post drops on a non-pick (edit re-resolves fresh)')
    ok(resolveHeldAction(held('site'), route({ siteIndex: 1 }), 'el primer', false).action === 'resume', 'site resumes on a site_index pick')
    ok(resolveHeldAction(held('confirm_transcript'), route({ intent: 'chat' }), 'sí, exacte', false).action === 'resume', 'confirm_transcript resumes on an explicit yes')
    ok(resolveHeldAction(held('confirm_transcript'), route({ intent: 'write' }), '(àudio nou)', true).action === 'drop', 'a fresh audio is a NEW brief, not a confirm')
  }

  // ── 14. Proactive nudge throttle (§2.4.7 / E-21) ────────────────────────────
  section('proactive nudge throttle (E-21)')
  {
    const opps = ['receptes', 'vins de tardor']
    const now = new Date('2026-07-08T12:00:00Z')
    const ms = now.getTime()
    const fresh = pickNudge(opps, null, { now, cooldownDays: 14, minGapHours: 20 })
    ok(fresh && fresh.text.includes('receptes'), 'picks the first quiet topic when nothing was nudged')
    ok(fresh.key === 'receptes', 'key is the slugified topic')
    // same key within cooldown → skip to the next opportunity
    const recentSameKey = { key: 'receptes', at: new Date(ms - 3 * 86400_000).toISOString() }
    const next = pickNudge(opps, recentSameKey, { now, cooldownDays: 14, minGapHours: 20 })
    ok(next && next.key === 'vins-de-tardor', 'same key within cooldown → next topic')
    // any nudge within minGap → stay quiet entirely (never two turns running)
    const veryRecent = { key: 'altre', at: new Date(ms - 2 * 3600_000).toISOString() }
    ok(pickNudge(opps, veryRecent, { now, cooldownDays: 14, minGapHours: 20 }) === null, 'a nudge < minGap ago → silent this turn')
    ok(pickNudge([], null, { now }) === null, 'no opportunities → no nudge (degrades off)')
  }

  // ── summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${fail ? '✗' : '✓'} brain-cortex: ${pass} passed, ${fail} failed`)
  if (fail) { for (const f of fails) console.error('   · ' + f); process.exit(1) }
}

main().catch((e) => { console.error(e); process.exit(1) })
