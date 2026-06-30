// Theme Grabber Lab — automatic capture diagnostics (pure, isomorphic).
//
// Turns a raw LabCapture into objective quality signals + suggested failure tags,
// so the operator stops eyeballing every field and instead reviews a scored
// checklist that points straight at what the grabber got wrong. These same signals
// are the structured features the future data-driven extraction engine learns from
// (the whole point of the Lab — see the grabber-lab memory).
//
// Pure + dependency-free: safe to import from the client UI and unit-test in
// isolation. NEVER mutates the capture.

import type { LabCapture } from './types'
import { FAILURE_TAGS, type FailureTag } from './types'

export type DiagSeverity = 'pass' | 'warn' | 'fail'

export type DiagSignal = {
  id: string
  label: string
  severity: DiagSeverity
  detail: string
  /** Failure tag this signal implies (only set when severity !== 'pass'). */
  tag?: FailureTag
}

export type CaptureDiagnosis = {
  signals: DiagSignal[]
  /** 0–100 health score (100 = a clean, likely-perfect clone). */
  score: number
  /** High-confidence failure tags derived from failing/ warning signals. */
  suggestedTags: FailureTag[]
}

const len = (s: string | null | undefined) => (s ?? '').trim().length

// A <style> block in the CHROME with page-global selectors (body / html / * /
// :root / a{}) will bleed onto OUR blog template — the classic isolation breach.
const BROAD_CSS = /<style[^>]*>[\s\S]*?(^|[\s,{}])(body|html|\*|:root)\s*[,{]/i

function diag(id: string, label: string, severity: DiagSeverity, detail: string, tag?: FailureTag): DiagSignal {
  return severity === 'pass' ? { id, label, severity, detail } : { id, label, severity, detail, tag }
}

/**
 * Score one capture. Heuristics are deliberately conservative — a 'fail'/'warn'
 * means "very likely wrong", so the suggested tags are trustworthy enough to apply
 * in one click. The operator always has the final say.
 */
export function diagnoseCapture(c: LabCapture): CaptureDiagnosis {
  const signals: DiagSignal[] = []

  // ── Header ──
  const h = len(c.rawHeader)
  signals.push(
    h === 0
      ? diag('header', 'Header', 'fail', 'No s’ha extret cap header.', 'header-cut-too-early')
      : h < 200
        ? diag('header', 'Header', 'warn', `Header molt curt (${h} car.) — possiblement tallat massa aviat.`, 'header-cut-too-early')
        : diag('header', 'Header', 'pass', `${h} car. extrets.`),
  )

  // ── Footer ──
  const f = len(c.rawFooter)
  signals.push(
    f === 0
      ? diag('footer', 'Footer', 'fail', 'No s’ha extret cap footer.', 'footer-missing')
      : f < 120
        ? diag('footer', 'Footer', 'warn', `Footer molt curt (${f} car.) — comprova que no s’hagi tallat malament.`, 'footer-cut-wrong')
        : diag('footer', 'Footer', 'pass', `${f} car. extrets.`),
  )

  // ── CSS isolation (chrome <style> leaking onto the blog) ──
  const leak = BROAD_CSS.test(c.rawHeader) || BROAD_CSS.test(c.rawFooter) || BROAD_CSS.test(c.rawHead)
  signals.push(
    leak
      ? diag('css-leak', 'Aïllament CSS', 'warn', 'El chrome conté <style> amb selectors globals (body/html/*/:root) que poden filtrar-se al blog.', 'css-leak-into-blog')
      : diag('css-leak', 'Aïllament CSS', 'pass', 'Cap selector global perillós al chrome.'),
  )

  // ── Design tokens ──
  const t = c.designTokens
  const hasAccent = !!(t && (t.colorAccent || t.colorPrimary))
  const hasMax = !!(t && t.maxWidth)
  signals.push(
    !t
      ? diag('tokens', 'Tokens de disseny', 'fail', 'No s’han extret tokens.', 'tokens-wrong')
      : !hasAccent
        ? diag('tokens', 'Tokens de disseny', 'warn', 'Sense color d’accent/primari — la marca pot quedar genèrica.', 'tokens-wrong')
        : !hasMax
          ? diag('tokens', 'Amplada de contingut', 'warn', 'Sense max-width detectada — el feed pot no alinear-se amb el chrome.', 'tokens-wrong')
          : diag('tokens', 'Tokens de disseny', 'pass', `Accent + amplada (${String(t.maxWidth)}) detectats.`),
  )

  // ── Fonts ──
  signals.push(
    c.fontLinks.length === 0
      ? diag('fonts', 'Tipografies', 'warn', 'Cap font enllaçada — si el lloc en feia servir de web, faltaran.', 'fonts-missing')
      : diag('fonts', 'Tipografies', 'pass', `${c.fontLinks.length} font(s) enllaçada(es).`),
  )

  // ── Blog signature (native card replication) ──
  signals.push(
    !c.blogSignature
      ? diag('blogsig', 'Signatura del blog', 'warn', 'No s’ha detectat l’estil de les targetes natives — el feed pot no coincidir.', 'blog-card-mismatch')
      : diag('blogsig', 'Signatura del blog', 'pass', 'Estil de targeta natiu detectat.'),
  )

  // ── Scripts that can blank a hydrated (Next/React) page ──
  const fw = (c.detection.framework ?? '').toLowerCase()
  const jsHeavy = /next|react|nuxt|vue|gatsby|svelte/.test(fw)
  signals.push(
    jsHeavy && c.externalScripts.length > 0
      ? diag('scripts', 'Scripts', 'warn', `Lloc ${c.detection.framework} amb ${c.externalScripts.length} scripts — risc que la captura quedi en blanc sense render.`, 'scripts-blanked-page')
      : diag('scripts', 'Scripts', 'pass', `${c.externalScripts.length} scripts (sense risc evident).`),
  )

  // ── Score: fails cost 26, warnings 9; floored at 0. ──
  const fails = signals.filter(s => s.severity === 'fail').length
  const warns = signals.filter(s => s.severity === 'warn').length
  const score = Math.max(0, 100 - fails * 26 - warns * 9)

  // Suggested tags: every implied tag, de-duped, in canonical FAILURE_TAGS order.
  const implied = new Set<FailureTag>()
  for (const s of signals) if (s.tag) implied.add(s.tag)
  // A clean capture earns the positive 'perfect-clone' suggestion.
  if (fails === 0 && warns === 0) implied.add('perfect-clone')
  const suggestedTags = FAILURE_TAGS.filter(t => implied.has(t))

  return { signals, score, suggestedTags }
}
