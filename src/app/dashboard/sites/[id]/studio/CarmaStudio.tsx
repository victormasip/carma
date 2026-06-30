'use client'

// Carma Studio — the premium, real-time, inline theme editor. Canvas-first: a
// live device-framed preview you edit by clicking regions; a contextual inspector
// on the right; undo/redo + autosave. Replaces the old ThemeManager panel. Mounts
// inside the existing <ThemeStudioProvider> (so state, autosave and capture are
// unchanged); the capture progress modal still lives in SiteDetailClient.

import { useEffect, useState } from 'react'
import { Wand2, Globe, Newspaper, AlertCircle, PanelRightClose, PanelRightOpen } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Modal, ModalClose } from '@/components/ui/Modal'
import { PremiumPanel } from '../PremiumGate'
import { useThemeStudio } from '../ThemeStudioContext'
import StudioTopBar from './StudioTopBar'
import StudioCanvas, { type Device } from './StudioCanvas'
import StudioInspector from './StudioInspector'
import type { RegionId } from './regions'

export default function CarmaStudio({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const s = useThemeStudio()
  const [device, setDevice] = useState<Device>('desktop')
  const [region, setRegion] = useState<RegionId>('global')
  // The inspector collapses so the live canvas can use the full width — fixes the
  // cramped, "narrow embedded iframe" feel when both panels fight for space.
  const [inspectorOpen, setInspectorOpen] = useState(true)

  // Cmd/Ctrl+Z undo · Cmd/Ctrl+Shift+Z redo — but never hijack native undo while
  // the user is typing in an inspector field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const t = document.activeElement
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t as HTMLElement | null)?.isContentEditable) return
      e.preventDefault()
      if (e.shiftKey) s.redo(); else s.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s])

  if (!s.hasTheme) return <EmptyStudio />

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <StudioTopBar device={device} setDevice={setDevice} isSuperAdmin={isSuperAdmin} />

      <div className="relative flex min-h-0 flex-1">
        <StudioCanvas region={region} onRegion={setRegion} device={device} />

        {/* Seam rail carrying the collapse toggle — always reachable, sits just left
            of the inspector (or at the far edge when the inspector is hidden). */}
        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setInspectorOpen((o) => !o)}
            aria-label={inspectorOpen ? 'Amagar el panell' : 'Mostrar el panell'}
            title={inspectorOpen ? 'Amagar el panell' : 'Mostrar el panell'}
            className="absolute -left-10 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-elevated/95 text-muted shadow-card backdrop-blur transition-colors hover:text-text hover:bg-surface-hover"
          >
            {inspectorOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </div>

        {inspectorOpen && (
          <div className="hidden w-[380px] shrink-0 md:block xl:w-[420px]">
            <StudioInspector region={region} onRegion={setRegion} />
          </div>
        )}
      </div>

      {/* Freemium upsell when a free user exhausts their regeneration. */}
      {s.premiumBlocked && (
        <Modal open onClose={s.clearPremiumBlock} size="lg">
          <div className="relative">
            <div className="absolute right-3 top-3 z-20"><ModalClose onClose={s.clearPremiumBlock} /></div>
            <PremiumPanel
              feature="Regenera el teu tema"
              description="Ja has fet servir la teva regeneració gratuïta. Amb Premium pots tornar a capturar i regenerar el disseny tantes vegades com vulguis."
              perks={[
                'Regeneracions de tema il·limitades',
                'Re-clona el disseny quan actualitzis la teva web',
                'Traducció del header i footer amb IA',
                'Domini propi i API en directe',
              ]}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

// No theme yet → the capture prompt (Magic Wand). The progress modal that opens on
// `grab()` is rendered globally by SiteDetailClient.
function EmptyStudio() {
  const { url, setUrl, blogUrl, setBlogUrl, analyzing, error, grab } = useThemeStudio()
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Wand2 className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-bold text-text">Crea el teu tema en un clic</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">
        Enganxa la URL del teu lloc. Clonem el header i el footer originals (amb els seus estils) i n&apos;extreiem colors i tipografies per al blog. Després ho edites tot al directe.
      </p>
      <div className="mx-auto mt-5 flex max-w-md gap-2">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && grab()}
            placeholder="https://www.elmeuclient.com"
            disabled={analyzing}
            className="h-11 w-full rounded-xl border border-border bg-surface-subtle pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-accent placeholder:text-subtle disabled:opacity-60"
          />
        </div>
        <Button glow onClick={() => grab()} disabled={!url.trim() || analyzing} iconLeft={<Wand2 className="h-4 w-4" />}>
          Capturar
        </Button>
      </div>
      <div className="mx-auto mt-2.5 max-w-md">
        <div className="relative">
          <Newspaper className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="url"
            value={blogUrl}
            onChange={(e) => setBlogUrl(e.target.value)}
            placeholder="URL del blog/notícies (opcional)"
            disabled={analyzing}
            className="h-10 w-full rounded-xl border border-border bg-surface-subtle pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-accent placeholder:text-subtle disabled:opacity-60"
          />
        </div>
      </div>
      {error && !analyzing && (
        <div className="mx-auto mt-4 flex max-w-md items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft p-2.5 text-left">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs font-medium text-danger">{error}</p>
        </div>
      )}
    </div>
  )
}
