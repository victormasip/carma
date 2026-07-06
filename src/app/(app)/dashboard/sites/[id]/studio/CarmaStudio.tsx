'use client'

// Carma Studio — the premium, pure-inline theme editor.
//
// A Framer-style infinite canvas (StudioStage) you edit by clicking directly on
// the live blog: every element pops a floating contextual toolbar, text edits in
// place, header/footer open a dedicated drawer. The only non-element surface is
// the site-wide "Global" panel (brand, typography, layout), opened from the top
// bar. Mounts inside the existing <ThemeStudioProvider> so state, autosave and
// capture are unchanged; the capture progress modal still lives in SiteDetailClient.

import { useEffect, useState } from 'react'
import { Wand2, Globe, Newspaper, AlertCircle, X, Paintbrush } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Modal, ModalClose } from '@/components/ui/Modal'
import { PremiumPanel } from '../PremiumGate'
import { useThemeStudio } from '../ThemeStudioContext'
import StudioTopBar from './StudioTopBar'
import StudioStage from './StudioStage'
import { RegionControls } from './StudioToolbar'
import type { Device } from './types'
import { cn } from '@/lib/cn'

export default function CarmaStudio({ isSuperAdmin, fullscreen = false, exitHref }: {
  isSuperAdmin: boolean
  /** Fill the viewport (the /edit/<id> "edit on your live site" experience). */
  fullscreen?: boolean
  /** When set, the top bar shows an exit link back to the live site. */
  exitHref?: string
}) {
  const s = useThemeStudio()
  const [device, setDevice] = useState<Device>('desktop')
  const [globalOpen, setGlobalOpen] = useState(false)
  const [interact, setInteract] = useState(false)

  // Cmd/Ctrl+Z undo · Cmd/Ctrl+Shift+Z redo — never hijack native undo while
  // typing in a field or a contenteditable.
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

  if (!s.hasTheme) return <EmptyStudio fullscreen={fullscreen} />

  return (
    <div className={cn(
      'flex flex-col overflow-hidden',
      fullscreen ? 'h-full' : 'h-[calc(100vh-6.5rem)] min-h-[620px] rounded-2xl border border-border bg-surface shadow-card',
    )}>
      <StudioTopBar
        device={device}
        setDevice={setDevice}
        isSuperAdmin={isSuperAdmin}
        globalOpen={globalOpen}
        onToggleGlobal={() => setGlobalOpen((o) => !o)}
        interact={interact}
        onToggleInteract={() => setInteract((i) => !i)}
        exitHref={exitHref}
      />

      <div className="relative flex min-h-0 flex-1">
        <StudioStage device={device} interact={interact} />
        {globalOpen && !interact && <GlobalPanel onClose={() => setGlobalOpen(false)} />}
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

// Site-wide settings that aren't tied to a single element — brand, typography,
// layout look. A light left-docked panel opened from the top bar.
function GlobalPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute left-4 top-4 z-40 w-[300px] overflow-hidden rounded-2xl border border-border bg-bg-elevated/95 shadow-pop backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent"><Paintbrush className="h-3.5 w-3.5" /></span>
          <span className="text-xs font-bold text-text">Tema global</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Tancar" className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-hover hover:text-text">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[calc(100vh-13rem)] overflow-y-auto p-3">
        <RegionControls region="global" />
      </div>
    </div>
  )
}

// No theme yet → the capture prompt (Magic Wand). The progress modal that opens on
// `grab()` is rendered globally by SiteDetailClient (or FullscreenStudio).
function EmptyStudio({ fullscreen = false }: { fullscreen?: boolean }) {
  const { url, setUrl, blogUrl, setBlogUrl, analyzing, error, grab } = useThemeStudio()
  const card = (
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
  return fullscreen
    ? <div className="flex h-full items-center justify-center p-6">{card}</div>
    : card
}
