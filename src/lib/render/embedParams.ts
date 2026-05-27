// Live-embed param bridge — the single source of truth shared by the dashboard
// (which builds the copy-paste snippet) and the public /render routes (which
// apply the overrides). Keeping the mapping in one pure, dependency-free module
// guarantees the snippet a user copies always decodes to exactly what they see.
//
// Model: the SAVED theme is the baseline. The embed snippet only carries the
// tokens that DIFFER from the saved/default values, so the URL stays short and
// "what you tweaked" is legible. An absent param ⇒ use the saved value.

import { DEFAULT_TOKENS, type DesignTokens } from '@/lib/scrape/tokens'

// short query-param name → DesignTokens key. Short names keep the snippet tidy.
export const PARAM_MAP: Record<string, keyof DesignTokens> = {
  primary: 'colorPrimary',
  accent: 'colorAccent',
  bg: 'colorBg',
  surface: 'colorSurface',
  text: 'colorText',
  muted: 'colorMuted',
  border: 'colorBorder',
  fonth: 'fontHeading',
  fontb: 'fontBody',
  size: 'baseFontSize',
  radius: 'radius',
  radiusLg: 'radiusLg',
  maxw: 'maxWidth',
  layout: 'layout',
  cols: 'columns',
}

const KEY_TO_PARAM: Partial<Record<keyof DesignTokens, string>> = Object.fromEntries(
  Object.entries(PARAM_MAP).map(([param, key]) => [key, param]),
) as Partial<Record<keyof DesignTokens, string>>

const ALLOWED: Record<string, (v: string) => boolean> = {
  layout: v => v === 'grid' || v === 'list',
  cols: v => v === '2' || v === '3' || v === '4',
}

// Anything that looks like a stylesheet break-out or is wildly long is rejected
// before it reaches the render CSS. Token values are short, simple strings.
function isSafeValue(v: string): boolean {
  return v.length <= 120 && !/[<>{}]/.test(v)
}

/**
 * Build the query-string diff between `tokens` and the baseline (saved values,
 * falling back to defaults). Only changed keys are emitted, so the snippet
 * reflects exactly what the editor changed. Returns a sorted, stable string
 * (no leading `?`) so the snippet doesn't churn on unrelated re-renders.
 */
export function tokensToParams(
  tokens: Partial<DesignTokens>,
  baseline: Partial<DesignTokens> = DEFAULT_TOKENS,
): string {
  const sp = new URLSearchParams()
  for (const [param, key] of Object.entries(PARAM_MAP)) {
    const value = tokens[key]
    if (value == null) continue
    const base = baseline[key] ?? DEFAULT_TOKENS[key]
    if (String(value) === String(base)) continue
    if (!isSafeValue(String(value))) continue
    sp.set(param, String(value))
  }
  sp.sort()
  return sp.toString()
}

/**
 * Merge query-param overrides onto a base token set. Unknown params are
 * ignored; constrained params (layout/cols) are validated. Used server-side by
 * the render routes so an embed can preview live tweaks without a save.
 */
export function applyParamsToTokens(
  base: DesignTokens,
  sp: URLSearchParams,
): DesignTokens {
  const out: DesignTokens = { ...base }
  for (const [param, key] of Object.entries(PARAM_MAP)) {
    const raw = sp.get(param)
    if (raw == null) continue
    const value = raw.trim()
    if (!isSafeValue(value)) continue
    const validate = ALLOWED[param]
    if (validate && !validate(value)) continue
    // Every key in PARAM_MAP is string-valued; the per-key union write would
    // otherwise narrow the target to `never`.
    ;(out as unknown as Record<string, string>)[key] = value
  }
  return out
}

export { KEY_TO_PARAM }
