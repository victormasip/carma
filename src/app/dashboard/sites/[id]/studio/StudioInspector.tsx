'use client'

// Carma Studio — the contextual inspector. Shows ONLY the controls for the
// selected region (Elementor-style), plus region pills to switch. Every control
// edits the live ThemeStudio (autosaved). Reads everything from context.

import { AlignLeft, AlignCenter, AlignRight, LayoutGrid, Rows3, Type as TypeIcon } from 'lucide-react'
import { useThemeStudio } from '../ThemeStudioContext'
import VisualChromeEditor from '../VisualChromeEditor'
import NavEditor from '../NavEditor'
import type { DesignTokens } from '@/lib/scrape/tokens'
import { REGIONS, REGION_ORDER, type RegionId } from './regions'
import { ColorField, TextField, SelectField, SegmentedField, SliderField, FontPairField, GoogleFontField, LookGallery } from './StudioControls'
import { cn } from '@/lib/cn'

export default function StudioInspector({ region, onRegion }: {
  region: RegionId
  onRegion: (r: RegionId) => void
}) {
  const s = useThemeStudio()
  const { tokens } = s
  // Loosen the generic setter so string-valued unions don't fight inference.
  const set = s.setToken as unknown as (k: keyof DesignTokens, v: unknown) => void
  const applyPatch = (patch: Partial<DesignTokens>) => {
    for (const [k, v] of Object.entries(patch)) set(k as keyof DesignTokens, v)
  }
  const meta = REGIONS[region]

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-bg-elevated">
      {/* Region pills */}
      <div className="flex flex-wrap gap-1 border-b border-border p-2.5">
        {REGION_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onRegion(id)}
            className={cn(
              'cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
              region === id ? 'bg-accent text-on-accent' : 'text-muted hover:text-text hover:bg-surface-hover',
            )}
          >
            {REGIONS[id].label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-text">{meta.label}</h3>
          <p className="mt-0.5 text-xs text-muted leading-snug">{meta.hint}</p>
        </div>

        <div className="space-y-4">
          {region === 'global' && (
            <>
              <LookGallery active={tokens.feedLayout} onPick={applyPatch} />
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Accent" hint="Enllaços · CTA" value={String(tokens.colorAccent ?? '')} onChange={(v) => set('colorAccent', v)} />
                <ColorField label="Primari" hint="Marca" value={String(tokens.colorPrimary ?? '')} onChange={(v) => set('colorPrimary', v)} />
              </div>

              {/* Typography — quick pairings + a full searchable Google Fonts picker
                  for heading & body, so the auto-detected fonts are easy to replace. */}
              <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-subtle">Tipografia</p>
                <FontPairField heading={String(tokens.fontHeading ?? '')} body={String(tokens.fontBody ?? '')} onChange={(h, b) => { set('fontHeading', h); set('fontBody', b) }} />
                <GoogleFontField
                  label="Títols"
                  hint="Google Fonts"
                  value={String(tokens.fontHeading ?? '')}
                  onPick={(stack, url) => { set('fontHeading', stack); s.addFontLink(url) }}
                />
                <GoogleFontField
                  label="Cos de text"
                  hint="Google Fonts"
                  value={String(tokens.fontBody ?? '')}
                  onPick={(stack, url) => { set('fontBody', stack); s.addFontLink(url) }}
                />
              </div>

              <SliderField label="Mida de text base" value={tokens.baseFontSize} onChange={(v) => set('baseFontSize', v)} min={13} max={22} />
              <TextField label="Amplada del contingut" hint="px / %" value={String(tokens.maxWidth ?? '')} onChange={(v) => set('maxWidth', v)} placeholder="1200px" mono />
            </>
          )}

          {region === 'page' && (
            <>
              <ColorField label="Fons de pàgina" value={String(tokens.colorBg ?? '')} onChange={(v) => set('colorBg', v)} />
              <ColorField label="Color de text" value={String(tokens.colorText ?? '')} onChange={(v) => set('colorText', v)} />
              <ColorField label="Text secundari" hint="dates · captions" value={String(tokens.colorMuted ?? '')} onChange={(v) => set('colorMuted', v)} />
              <SliderField label="Mida de text base" value={tokens.baseFontSize} onChange={(v) => set('baseFontSize', v)} min={13} max={22} />
            </>
          )}

          {region === 'section' && (
            <>
              <TextField label="Text del títol" hint="o edita'l al preview" value={s.sectionTitle} onChange={s.setSectionTitle} placeholder="Articles" />
              <ColorField label="Color del títol" value={String(tokens.sectionTitleColor ?? tokens.colorText ?? '#111111')} onChange={(v) => set('sectionTitleColor', v)} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Mida" value={String(tokens.sectionTitleSize ?? '')} onChange={(v) => set('sectionTitleSize', v)} placeholder="1.6rem" mono />
                <SelectField
                  label="Pes"
                  value={String(tokens.sectionTitleWeight ?? '800')}
                  onChange={(v) => set('sectionTitleWeight', v)}
                  options={[['400', 'Normal'], ['500', 'Mig'], ['600', 'Seminegre'], ['700', 'Negre'], ['800', 'Extranegre'], ['900', 'Ultra']].map(([value, label]) => ({ value, label }))}
                />
              </div>
              <SegmentedField
                label="Alineació"
                value={(tokens.sectionTitleAlign ?? 'left')}
                onChange={(v) => set('sectionTitleAlign', v)}
                options={[
                  { value: 'left', label: '', icon: <AlignLeft className="h-3.5 w-3.5" /> },
                  { value: 'center', label: '', icon: <AlignCenter className="h-3.5 w-3.5" /> },
                  { value: 'right', label: '', icon: <AlignRight className="h-3.5 w-3.5" /> },
                ]}
              />
            </>
          )}

          {region === 'cards' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Targetes" hint="fons" value={String(tokens.colorSurface ?? '')} onChange={(v) => set('colorSurface', v)} />
                <ColorField label="Vores" value={String(tokens.colorBorder ?? '')} onChange={(v) => set('colorBorder', v)} />
              </div>
              <SliderField label="Cantonades" value={tokens.radius} onChange={(v) => { set('radius', v); set('radiusLg', `${Math.round(parseFloat(v) * 1.5)}px`) }} min={0} max={28} />
              <SegmentedField
                label="Disposició"
                value={(tokens.layout ?? 'grid')}
                onChange={(v) => set('layout', v)}
                options={[
                  { value: 'grid', label: 'Graella', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                  { value: 'list', label: 'Llista', icon: <Rows3 className="h-3.5 w-3.5" /> },
                ]}
              />
              {(tokens.layout ?? 'grid') === 'grid' && (
                <SegmentedField
                  label="Columnes"
                  value={String(tokens.columns ?? '3')}
                  onChange={(v) => set('columns', v)}
                  options={[{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]}
                />
              )}
            </>
          )}

          {region === 'chrome' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-2.5 text-xs text-muted">
                <TypeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
                <span>El header i el footer són el codi real del teu lloc. Edita el HTML o, més avall, els enllaços del menú de forma visual.</span>
              </div>
              <VisualChromeEditor
                header={s.extractedHeader}
                footer={s.extractedFooter}
                head={s.extractedHead}
                onHeaderChange={s.setExtractedHeader}
                onFooterChange={s.setExtractedFooter}
                onHeadChange={s.setExtractedHead}
              />
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">Menú de navegació</p>
                <NavEditor
                  header={s.extractedHeader}
                  footer={s.extractedFooter}
                  onHeaderChange={s.setExtractedHeader}
                  onFooterChange={s.setExtractedFooter}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
