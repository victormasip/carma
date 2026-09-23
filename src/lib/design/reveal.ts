// W5 — DOOR A: the design half of the reveal (server-only).
//
// THE PROGRESSIVE REVEAL, IN ONE PARAGRAPH
// ────────────────────────────────────────
// The deterministic director (W3) turns evidence into three genomes in under a
// millisecond; the art director (W4) takes ~41 seconds to do it better. Forty-one
// seconds is not a page load, it is an abandoned tab. So the reveal PAINTS W3 at
// once — three real, live blogs — and asks W4 in the background. Both produce the
// same artefact through the same pipeline (validate → sample → cohesion → compile),
// so the upgrade is a swap of data, never a different code path, and a failed or
// slow upgrade costs the visitor nothing: they keep a complete product.
//
// WHAT THIS FILE OWNS
//   · reading a site's design evidence during the glimpse — with EXACTLY the
//     stylesheet limits the W2/W3 gates were calibrated on (8 sheets, 400KB);
//   · shaping directions into the variants the Door draws;
//   · the preview URL of each variant (the real renderer, fed by the genome);
//   · the signed token that carries evidence + brief across the browser and back.
//
// It never imports the model client. The upgrade route does that, alone, so the
// glimpse's bundle never carries the Anthropic SDK.
//
// WHY A SIGNED TOKEN AND NOT THE EVIDENCE ITSELF
// The upgrade is a ~$0.10 model call on an unauthenticated endpoint, and its
// input is a prompt. Accepting evidence from the browser would make it an open
// relay for both — unbounded spend from any IP pool, and a prompt the attacker
// writes. Accepting only what OUR glimpse signed means every upgrade was paid for
// by a scrape that passed the glimpse's own rate limits, and its prompt is ours.
// No table, no TTL row, no migration — strings across the boundary, the same
// decision glimpse.ts already documents.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { isSafeUrl, safeFetchText } from '@/lib/scrape/http'
import { collectStylesheets } from '@/lib/grabber-lab/evalRun'
import { splitPageChrome } from '@/lib/scrape/pageSplit'
import { readEvidence, type DesignEvidence } from '@/lib/design/evidence'
import { directDeterministic, type Directed } from '@/lib/design/director'
import { compileGenome } from '@/lib/design/compile'
import { font } from '@/lib/design/fonts'
import type { Genome } from '@/lib/design/genome'
import type { BrandBrief } from '@/lib/design/llm'
import {
  REVEAL_ORDER,
  type RevealAdvice, type RevealDesign, type RevealVariant, type RevealVariantName,
} from '@/lib/design/revealTypes'

// ─── Evidence ────────────────────────────────────────────────────────────────

// The calibration the W2/W3 gates ran on. Reading more CSS than the gates did
// would make the live evidence something no gate has ever measured.
const MAX_SHEETS = 8
const CSS_BUDGET = 400_000
const SHEET_TIMEOUT_MS = 6_000

/**
 * The site's design evidence, from the home page the glimpse already fetched.
 *
 * Sheets are fetched in PARALLEL (the scrape's prose pages stay sequential —
 * those are a courtesy to someone's server; eight CSS files from a CDN are not),
 * then admitted in document order under the byte budget, exactly as the gates do.
 * Never throws: null means "no design half to this reveal", and the Door shows
 * the understanding alone, as it did before W5.
 */
export async function readSiteEvidence(url: string, html: string): Promise<DesignEvidence | null> {
  try {
    const base = new URL(url)
    const { urls, inline, fontLinks } = collectStylesheets(html, base)
    const sheets = await Promise.all(urls.slice(0, MAX_SHEETS).map(u =>
      isSafeUrl(u)
        ? safeFetchText(u, { accept: 'text/css,*/*', timeout: SHEET_TIMEOUT_MS, retries: 0 }).catch(() => null)
        : Promise.resolve(null),
    ))
    const cssTexts = [...inline]
    let budget = CSS_BUDGET
    for (const css of sheets) {
      if (!css || budget <= 0) continue
      const slice = css.length > budget ? css.slice(0, css.lastIndexOf('}', budget) + 1) : css
      budget -= slice.length
      if (slice) cssTexts.push(slice)
    }
    const split = splitPageChrome(html, base)
    return readEvidence({
      url, html, cssTexts, fontLinks,
      chrome: { top: split.top, bottom: split.bottom, bodyAttrs: split.bodyAttrs },
    })
  } catch (e) {
    console.error('[design/reveal] evidence failed:', e instanceof Error ? e.message : e)
    return null
  }
}

// ─── Variants ────────────────────────────────────────────────────────────────

export type PreviewPitch = { title: string; angle: string }

/** Everything a preview needs besides the genome. Carried inside the token. */
export type RevealContext = {
  siteName: string | null
  locale: string | null
  pitches: PreviewPitch[]
}

/**
 * The brand as a masthead: "Verne Barcelona | Web Oficial" → "Verne Barcelona".
 *
 * The glimpse's name is the page's og:site_name or <title>, which is usually a
 * title (a name plus a slogan or "Web Oficial"). A separator only counts with
 * spaces around it, or when it is a bar or a middle dot — so "Sant-Martí" and
 * "Can Culleretes" survive intact.
 */
export function mastheadName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim().split(/\s[|·–—-]\s|\s*[|·]\s*/)[0]?.trim() ?? ''
  return name ? name.slice(0, 80) : null
}

/** `g_` + 16 hex of sha-256 over the genome. Same genome, same id, forever. */
export function genomeId(g: Genome): string {
  return `g_${createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 16)}`
}

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url')

/** Pitches as the preview carries them: capped, plain, nothing else. */
export function previewPitches(pitches: { title?: string; angle?: string }[] | null | undefined): PreviewPitch[] {
  return (pitches ?? [])
    .map(p => ({ title: String(p.title ?? '').trim().slice(0, 140), angle: String(p.angle ?? '').trim().slice(0, 240) }))
    .filter(p => p.title)
    .slice(0, 3)
}

/**
 * The live preview of one genome — a GET, so the browser loads it as an iframe
 * `src` and caches it: switching back to a tab never renders twice. The genome
 * rides in the query (~1.6KB base64url; the whole URL stays near 3KB). The
 * endpoint re-validates it: this is a URL, and anyone can write one.
 */
export function previewPath(genome: Genome, ctx: RevealContext): string {
  const q = new URLSearchParams({ g: b64url(genome), l: ctx.locale || 'ca', preview: '1' })
  if (ctx.siteName) q.set('n', ctx.siteName.slice(0, 80))
  if (ctx.pitches.length) q.set('p', b64url(ctx.pitches.map(p => ({ t: p.title, a: p.angle }))))
  return `/api/onboarding/design/preview?${q.toString()}`
}

/** Directions → the variants the Door draws. `why` is the model's, when there is one. */
export function toRevealVariants(
  directed: Pick<Directed, RevealVariantName>,
  ctx: RevealContext,
  why: Partial<Record<RevealVariantName, string>> = {},
): RevealVariant[] {
  return REVEAL_ORDER.map(variant => {
    const genome = directed[variant].genome
    const t = compileGenome(genome).tokens
    return {
      variant,
      id: genomeId(genome),
      genome,
      register: genome.register,
      heading: font(genome.type.heading).family,
      body: font(genome.type.body).family,
      ground: genome.palette.ground,
      swatches: [t.colorBg, t.colorText, t.colorAccent, t.colorPrimary],
      preview: previewPath(genome, ctx),
      why: why[variant]?.trim() || null,
    }
  })
}

/**
 * Which tab opens first — plan §9.1, decision 4.
 *
 * Fidel, unless the Eye judged the source tired AND can say why with a number the
 * owner can check: then Elevat, with that number. A verdict with no quotable
 * measurement pre-selects nothing — "your website is dated" is an opinion, and the
 * Door does not volunteer opinions about someone's business.
 */
export function preferredFor(evidence: DesignEvidence): { preferred: RevealVariantName; advice: RevealAdvice | null } {
  const sq = evidence.sourceQuality
  if (!sq || sq.verdict === 'inherit') return { preferred: 'faithful', advice: null }
  const { bodyRatio, linkRatio } = sq.reading
  if (bodyRatio !== null && bodyRatio < 4.5) return { preferred: 'elevated', advice: { kind: 'body', ratio: bodyRatio } }
  if (linkRatio !== null && linkRatio < 4.5) return { preferred: 'elevated', advice: { kind: 'link', ratio: linkRatio } }
  return { preferred: 'faithful', advice: null }
}

// ─── The token ───────────────────────────────────────────────────────────────

export type DesignTokenPayload = RevealContext & {
  v: 1
  /** Minted at, ms. */
  at: number
  evidence: DesignEvidence
  brief: BrandBrief | null
}

/** The model upgrade must be asked for within this window of the glimpse. */
export const UPGRADE_TOKEN_TTL_MS = 60 * 60 * 1000

function tokenKey(): Buffer | null {
  const secret = process.env.DESIGN_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  // Domain-separated: this key signs design tokens and nothing else, even when it
  // is derived from a secret that has another job.
  return createHash('sha256').update(`carma.design-token.v1\u0000${secret}`).digest()
}

export function signDesignToken(p: Omit<DesignTokenPayload, 'v' | 'at'>): string | null {
  const key = tokenKey()
  if (!key) return null
  const body = Buffer.from(JSON.stringify({ ...p, v: 1, at: Date.now() }), 'utf8').toString('base64url')
  const sig = createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** The payload, if and only if we signed it and it is fresh enough. */
export function verifyDesignToken(token: unknown, maxAgeMs = UPGRADE_TOKEN_TTL_MS): DesignTokenPayload | null {
  const key = tokenKey()
  if (!key || typeof token !== 'string' || token.length > 64_000) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), 'base64url')
  const want = createHmac('sha256', key).update(body).digest()
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DesignTokenPayload
    if (p?.v !== 1 || typeof p.at !== 'number' || Date.now() - p.at > maxAgeMs || !p.evidence) return null
    return p
  } catch {
    return null
  }
}

// ─── The glimpse's design half ───────────────────────────────────────────────

/**
 * Evidence → the design half of the reveal: three W3 variants, painted at once,
 * plus the token that lets the browser ask for the W4 upgrade. Never throws.
 */
export function doorDesign(evidence: DesignEvidence, rawCtx: RevealContext, brief: BrandBrief | null): RevealDesign | null {
  try {
    // Normalised ONCE, here, because the context is signed into the token: the
    // upgrade's previews then carry exactly the same masthead as the first paint.
    const ctx: RevealContext = { ...rawCtx, siteName: mastheadName(rawCtx.siteName) }
    const directed = directDeterministic(evidence, { siteId: evidence.url })
    const { preferred, advice } = preferredFor(evidence)
    return {
      token: signDesignToken({ ...ctx, evidence, brief }),
      source: 'derived',
      variants: toRevealVariants(directed, ctx),
      preferred,
      advice,
    }
  } catch (e) {
    console.error('[design/reveal] direction failed:', e instanceof Error ? e.message : e)
    return null
  }
}
