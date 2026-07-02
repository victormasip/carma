'use client'

// Carma Studio — the floating contextual toolbar.
//
// A small popover that appears anchored to the element you clicked on the canvas
// and shows ONLY that element's controls (Framer/Notion-style). It replaces the
// old fixed sidebar. `RegionControls` is exported so the top bar can reuse the
// exact same fields for the site-wide "Global" panel.

import { useLayoutEffect, useRef, useState } from 'react'
import {
  AlignLeft, AlignCenter, AlignRight, LayoutGrid, Rows3, X, PanelsTopLeft, Palette,
} from 'lucide-react'
import type { DesignTokens } from '@/lib/scrape/tokens'
import { useThemeStudio } from '../ThemeStudioContext'
import { REGIONS, type RegionId } from './regions'
import {
  ColorField, TextField, SelectField, SegmentedField, SliderField,
  FontPairField, GoogleFontField, LookGallery,
} from './StudioControls'
import { cn } from '@/lib/cn'

export default function StudioToolbar({
  region, rect, stage, onClose, onOpenChrome,
}: {
  region: RegionId
  rect: DOMRect
  stage: HTMLElement | null
  onClose: () => void
  onOpenChrome: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const meta = REGIONS[region]

  // Place to the right of the element, flipping left / clamping to the stage.
  useLayoutEffect(() => {
    const el = ref.current, st = stage
    if (!el || !st) return
    const W = el.offsetWidth, H = el.offsetHeight
    const sw = st.clientWidth, sh = st.clientHeight
    let left = rect.right + 14
    if (left + W > sw - 8) left = rect.left - W - 14
    if (left < 8) left = Math.min(Math.max(8, rect.left), sw - W - 8)
    const top = Math.min(Math.max(12, rect.top), Math.max(12, sh - H - 12))
    setPos({ left, top })
  }, [rect, stage])

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-30 w-[288px] overflow-hidden rounded-2xl border border-border bg-bg-elevated/95 shadow-pop backdrop-blur transition-opacity',
        pos ? 'opacity-100' : 'opacity-0',
      )}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent"><Palette className="h-3.5 w-3.5" /></span>
          <span className="text-xs font-bold text-text">{meta.label}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Tancar" className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-hover hover:text-text">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[62vh] overflow-y-auto p-3">
        <RegionControls region={region} onOpenChrome={onOpenChrome} />
      </div>
    </div>
  )
}

// The controls for a region — shared by the floating toolbar and the Global panel.
export function RegionControls({ region, onOpenChrome }: { region: RegionId; onOpenChrome?: () => void }) {
  const s = useThemeStudio()
  const { tokens } = s
  const set = s.setToken as unknown as (k: keyof DesignTokens, v: unknown) => void
  const applyPatch = (patch: Partial<DesignTokens>) => { for (const [k, v] of Object.entries(patch)) set(k as keyof DesignTokens, v) }

  if (region === 'global') {
    return (
      <div className="space-y-4">
        <LookGallery active={tokens.feedLayout} onPick={applyPatch} />
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Accent" hint="Enllaços · CTA" value={String(tokens.colorAccent ?? '')} onChange={(v) => set('colorAccent', v)} />
          <ColorField label="Primari" hint="Marca" value={String(tokens.colorPrimary ?? '')} onChange={(v) => set('colorPrimary', v)} />
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-subtle">Tipografia</p>
          <FontPairField heading={String(tokens.fontHeading ?? '')} body={String(tokens.fontBody ?? '')} onChange={(h, b) => { set('fontHeading', h); set('fontBody', b) }} />
          <GoogleFontField label="Títols" hint="Google Fonts" value={String(tokens.fontHeading ?? '')} onPick={(stack, url) => { set('fontHeading', stack); s.addFontLink(url) }} />
          <GoogleFontField label="Cos de text" hint="Google Fonts" value={String(tokens.fontBody ?? '')} onPick={(stack, url) => { set('fontBody', stack); s.addFontLink(url) }} />
        </div>
        <SliderField label="Mida de text base" value={tokens.baseFontSize} onChange={(v) => set('baseFontSize', v)} min={13} max={22} />
        <TextField label="Amplada del contingut" hint="px / %" value={String(tokens.maxWidth ?? '')} onChange={(v) => set('maxWidth', v)} placeholder="1200px" mono />
      </div>
    )
  }

  if (region === 'page') {
    return (
      <div className="space-y-4">
        <ColorField label="Fons de pàgina" value={String(tokens.colorBg ?? '')} onChange={(v) => set('colorBg', v)} />
        <ColorField label="Color de text" value={String(tokens.colorText ?? '')} onChange={(v) => set('colorText', v)} />
        <ColorField label="Text secundari" hint="dates · captions" value={String(tokens.colorMuted ?? '')} onChange={(v) => set('colorMuted', v)} />
        <SliderField label="Mida de text base" value={tokens.baseFontSize} onChange={(v) => set('baseFontSize', v)} min={13} max={22} />
      </div>
    )
  }

  if (region === 'section') {
    return (
      <div className="space-y-4">
        <TextField label="Text del títol" hint="o doble-clic al preview" value={s.sectionTitle} onChange={s.setSectionTitle} placeholder="Articles" />
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
      </div>
    )
  }

  if (region === 'cards') {
    return (
      <div className="space-y-4">
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
      </div>
    )
  }

  // chrome
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-2.5 text-xs text-muted">
        <PanelsTopLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
        <span>El header i el footer són el codi real del teu lloc. Edita el HTML o els enllaços del menú en un editor dedicat.</span>
      </div>
      <button
        type="button"
        onClick={onOpenChrome}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-on-accent transition-opacity hover:opacity-90"
      >
        <PanelsTopLeft className="h-4 w-4" /> Edita capçalera i peu
      </button>
    </div>
  )
}
