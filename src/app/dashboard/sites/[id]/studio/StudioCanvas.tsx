'use client'

// Carma Studio — the canvas. The real /render page in a device frame, doubling as
// the edit surface: hover highlights a themeable region, click selects it (drives
// the inspector), and the section title is click-to-edit inline. Token edits push
// live via query params (no save); structural edits reload on `savedAt`. The whole
// edit layer is injected into the render's OPEN shadow root and fully guarded.

import { useEffect, useRef, useState } from 'react'
import KnotLoader from '@/components/ui/KnotLoader'
import { tokensToParams } from '@/lib/render/embedParams'
import { useThemeStudio } from '../ThemeStudioContext'
import { regionForElement, highlightTargetFor, type RegionId } from './regions'
import { cn } from '@/lib/cn'

export type Device = 'desktop' | 'tablet' | 'mobile'

const EDIT_CSS = `
.cstudio-hover{outline:2px dashed rgba(245,188,0,.65)!important;outline-offset:2px!important;cursor:pointer!important}
.cstudio-sel{outline:2px solid #f5bc00!important;outline-offset:3px!important}
.carma-section-title[contenteditable]{cursor:text!important;border-radius:4px}
.carma-section-title[contenteditable]:focus{outline:2px solid #f5bc00!important;outline-offset:4px!important}
.cstudio-editable{cursor:text!important;border-radius:5px;transition:box-shadow .15s ease}
.cstudio-editable:hover{box-shadow:0 0 0 2px rgba(245,188,0,.28)!important}
.cstudio-editable:focus{outline:2px solid #f5bc00!important;outline-offset:4px!important}
`

export default function StudioCanvas({ region, onRegion, device }: {
  region: RegionId
  onRegion: (r: RegionId) => void
  device: Device
}) {
  const { siteId, tokens, savedAt, setSectionTitle, view, editableArticle, saveArticleField } = useThemeStudio()
  const [loading, setLoading] = useState(true)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const rootRef = useRef<ParentNode | null>(null)

  // Latest-refs for the injected (long-lived) listeners.
  const onRegionRef = useRef(onRegion); onRegionRef.current = onRegion
  const setTitleRef = useRef(setSectionTitle); setTitleRef.current = setSectionTitle
  const regionRef = useRef(region); regionRef.current = region
  const saveArticleRef = useRef(saveArticleField); saveArticleRef.current = saveArticleField

  // Debounce token→params so dragging a picker doesn't thrash the frame.
  const liveParams = tokensToParams(tokens)
  const [debounced, setDebounced] = useState(liveParams)
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(liveParams); setLoading(true) }, 400)
    return () => clearTimeout(t)
  }, [liveParams])

  // Show the loader while the frame swaps between Feed and Article (or to the real
  // article once it resolves).
  useEffect(() => { setLoading(true) }, [view, editableArticle?.slug])

  // Feed → /render/<id> ; Article → /render/<id>/<slug> (the real published post, or
  // a sample under ?preview when the site has none yet). Same edit layer either way.
  const qs = [debounced, 'preview=1', `d=${device}`, `r=${savedAt}`, 'edit=1'].filter(Boolean).join('&')
  const articleSlug = editableArticle?.slug ?? 'preview'
  const src = view === 'article'
    ? `/render/${siteId}/${encodeURIComponent(articleSlug)}?${qs}`
    : `/render/${siteId}?${qs}`

  // Re-apply the selection outline when the selected region changes (no reload).
  useEffect(() => { applySelected(rootRef.current, region) }, [region])

  const inject = () => {
    try {
      const doc = frameRef.current?.contentDocument
      if (!doc) return
      const host = doc.querySelector('.carma-embed-host') as (Element & { shadowRoot?: ShadowRoot }) | null
      const root: ParentNode = host?.shadowRoot ?? doc
      rootRef.current = root

      // Inject the edit-layer styles once per (re)load.
      const styleHost = (host?.shadowRoot ?? doc.head) as ParentNode & { appendChild: (n: Node) => void }
      if (styleHost && !(root as Element | Document).querySelector?.('#cstudio-style')) {
        const st = doc.createElement('style'); st.id = 'cstudio-style'; st.textContent = EDIT_CSS
        styleHost.appendChild(st)
      }

      let hovered: Element | null = null
      const clearHover = () => { if (hovered) { hovered.classList.remove('cstudio-hover'); hovered = null } }

      root.addEventListener('pointerover', (e) => {
        const el = e.target as Element | null
        if (!el || typeof el.closest !== 'function') return
        const r = regionForElement(el)
        const target = highlightTargetFor(root, r)
        if (target === hovered) return
        clearHover()
        if (target) { target.classList.add('cstudio-hover'); hovered = target }
      }, { passive: true })
      root.addEventListener('pointerout', clearHover, { passive: true })
      root.addEventListener('click', (e) => {
        const el = e.target as Element | null
        if (!el || typeof el.closest !== 'function') return
        const r = regionForElement(el)
        clearHover()
        onRegionRef.current(r)
        applySelected(root, r)
      }, { passive: true })

      // Section title → click-to-edit inline (feed view).
      const title = root.querySelector('.carma-section-title') as HTMLElement | null
      if (title) {
        title.setAttribute('contenteditable', 'plaintext-only')
        title.setAttribute('spellcheck', 'false')
        const commit = () => {
          const v = (title.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (v) setTitleRef.current(v)
        }
        title.addEventListener('blur', commit)
        title.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); title.blur() } })
      }

      // Article view → inline-edit the headline + lede, saved to the real post. Only
      // when a real article is loaded (the sample preview is layout-only, no save).
      if (view === 'article' && editableArticle) {
        const bindField = (sel: string, field: 'title' | 'excerpt') => {
          const el = root.querySelector(sel) as HTMLElement | null
          if (!el) return
          el.setAttribute('contenteditable', 'plaintext-only')
          el.setAttribute('spellcheck', 'false')
          el.classList.add('cstudio-editable')
          const commit = () => {
            const v = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
            if (field === 'title' && !v) return // never blank the headline
            void saveArticleRef.current(field, v)
          }
          el.addEventListener('blur', commit)
          el.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.key === 'Enter' && field === 'title') || e.key === 'Escape') { e.preventDefault(); el.blur() }
          })
        }
        bindField('.carma-article-title', 'title')
        bindField('.carma-article-lede', 'excerpt')
      }

      applySelected(root, regionRef.current)
    } catch { /* render markup varies; never break the canvas */ }
  }

  const frameClass =
    device === 'mobile'
      ? 'w-[390px] h-full max-h-[760px] shrink-0 rounded-[2.25rem] border-[7px] border-[#1c1917] shadow-2xl'
      : device === 'tablet'
        ? 'w-[768px] h-full max-h-[1024px] shrink-0 rounded-[1.5rem] border-[8px] border-[#1c1917] shadow-2xl'
        : 'w-full h-full'

  return (
    <div className={cn('relative flex min-h-0 flex-1 justify-center bg-surface-subtle', device === 'desktop' ? 'items-stretch' : 'items-center overflow-auto py-6')}>
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/60 backdrop-blur-[1px]">
          <KnotLoader size={56} />
        </div>
      )}
      <iframe
        ref={frameRef}
        src={src}
        title="Vista prèvia editable"
        onLoad={() => { setLoading(false); inject() }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        className={cn('bg-white', frameClass)}
      />
    </div>
  )
}

function applySelected(root: ParentNode | null, region: RegionId) {
  if (!root) return
  try {
    ;(root as Element | Document).querySelectorAll?.('.cstudio-sel').forEach((el) => el.classList.remove('cstudio-sel'))
    const target = highlightTargetFor(root, region)
    if (target) target.classList.add('cstudio-sel')
  } catch { /* ignore */ }
}
