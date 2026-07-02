// Carma Studio — live token CSS.
//
// The public render bakes design tokens into the shadow-root stylesheet at build
// time, so a token edit would otherwise need a full iframe reload to show. This
// pure builder re-emits JUST the token-driven declarations (the `--ct-*` variable
// block + the fully-styleable section-title rule) so the Studio can inject them
// straight into the live render's shadow root and every colour / font / size /
// section-title tweak lands INSTANTLY, with no reload.
//
// Mirrors the variable block + section-title rule in theme.ts `buildTemplateCss`.
// Structural tokens (layout / columns / feedLayout) change CSS *rules*, not these
// variables, so they stay on the reload path — this only covers the visual ones.

import type { DesignTokens } from '@/lib/scrape/tokens'

// A CSS value safe to interpolate: no rule/stylesheet break-out, bounded length.
function safe(v: unknown): string {
  return String(v ?? '').replace(/[<>{}]/g, '').slice(0, 120).trim()
}

const VAR_MAP: [cssVar: string, key: keyof DesignTokens][] = [
  ['--ct-primary', 'colorPrimary'],
  ['--ct-accent', 'colorAccent'],
  ['--ct-bg', 'colorBg'],
  ['--ct-surface', 'colorSurface'],
  ['--ct-text', 'colorText'],
  ['--ct-muted', 'colorMuted'],
  ['--ct-border', 'colorBorder'],
  ['--ct-font-heading', 'fontHeading'],
  ['--ct-font-body', 'fontBody'],
  ['--ct-size', 'baseFontSize'],
  ['--ct-radius', 'radius'],
  ['--ct-radius-lg', 'radiusLg'],
  ['--ct-max', 'maxWidth'],
]

export function studioLiveCss(t: Partial<DesignTokens>): string {
  const vars = VAR_MAP
    .map(([cssVar, key]) => {
      const val = t[key]
      return val == null || val === '' ? '' : `${cssVar}:${safe(val)}`
    })
    .filter(Boolean)
    .join(';')

  // Section title — the render hard-codes these into a rule, so re-emit it with
  // the same specificity + !important so this override wins when injected last.
  const align = safe(t.sectionTitleAlign) || 'left'
  const st =
    `.carma-root .carma-section-head .carma-section-title{` +
    `font-family:var(--ct-font-heading)!important;` +
    (t.sectionTitleSize ? `font-size:${safe(t.sectionTitleSize)}!important;` : '') +
    (t.sectionTitleWeight ? `font-weight:${safe(t.sectionTitleWeight)}!important;` : '') +
    (t.sectionTitleColor ? `color:${safe(t.sectionTitleColor)}!important;` : '') +
    `text-align:${align}!important;` +
    (align === 'center' ? `margin-left:auto!important;margin-right:auto!important;` : '') +
    `}`

  return `:host,:root{${vars}}\n${st}`
}
