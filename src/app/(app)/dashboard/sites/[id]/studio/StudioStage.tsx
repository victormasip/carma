'use client'

// Carma Studio — the editing surface.
//
// The live /render page is loaded into a same-origin iframe shown at FULL SIZE
// (the real page, real width, native vertical scroll — not a zoomed artboard), so
// editing feels like editing the actual site. A transparent SHIELD over the iframe
// resolves clicks by piercing into the render (light-DOM chrome + the feed's open
// shadow root) with elementFromPoint: single click selects an element's region and
// pops the contextual toolbar next to it; double click on a title / text / card
// drops the shield so you type in place. Wheel/trackpad scroll passes straight
// through to the page. Visual token edits stream LIVE via injected CSS (no reload);
// only structural chrome/body changes reload.

import { useCallback, useEffect, useRef, useState } from 'react'
import { MousePointerClick } from 'lucide-react'
import KnotLoader from '@/components/ui/KnotLoader'
import { studioLiveCss } from '@/lib/render/studioLiveCss'
import { cn } from '@/lib/cn'
import { useThemeStudio } from '../ThemeStudioContext'
import StudioBodyEditor from './StudioBodyEditor'
import StudioToolbar from './StudioToolbar'
import ChromeDrawer from './ChromeDrawer'
import { regionForElement, highlightTargetFor, type RegionId } from './regions'
import { DEVICE_WIDTH, type Device } from './types'

const CLICK_SLOP = 6 // px of movement still treated as a click (vs a scroll/drag)

// Edit-layer styles injected into BOTH the light DOM (chrome) and the feed shadow
// root so the hover/selection outlines render wherever the user is pointing.
const EDIT_CSS = `
.cstudio-hover{outline:2px dashed rgba(245,188,0,.7)!important;outline-offset:-1px!important;cursor:pointer!important}
.cstudio-sel{outline:2.5px solid #f5bc00!important;outline-offset:-1px!important}
.cstudio-editing{outline:2.5px solid #f5bc00!important;outline-offset:3px!important;cursor:text!important;border-radius:3px}
`

// The selected element travels WITH the selection state (not a parallel ref):
// one source of truth, and scroll re-anchoring can read it from the updater.
type Sel = { region: RegionId; rect: DOMRect; el: Element } | null

export default function StudioStage({ device, interact }: { device: Device; interact: boolean }) {
  const {
    siteId, tokens, savedAt, view, editableArticle, setSectionTitle, saveArticleField, saveCardField,
    extractedHeader, extractedFooter, extractedHead,
  } = useThemeStudio()

  const stageRef = useRef<HTMLDivElement>(null) // the scroll container
  const shieldRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const [loadedSrc, setLoadedSrc] = useState('')
  const [contentH, setContentH] = useState(1200)
  const [sel, setSel] = useState<Sel>(null)
  const [chromeOpen, setChromeOpen] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  // State mirror of the stage node so JSX below can pass it as a prop without
  // reading a ref during render (react-hooks/refs).
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)
  // The "click an element" hint auto-retires after a few seconds so it never
  // squats over the canvas (async timeout callback — lint-safe).
  const [hintDismissed, setHintDismissed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHintDismissed(true), 7000)
    return () => clearTimeout(t)
  }, [])

  const deviceWidth = DEVICE_WIDTH[device]
  const framed = device !== 'desktop'
  const canEditBody = view === 'article' && !!editableArticle

  // ── iframe src ──
  // Only structural tokens (feed layout / grid-vs-list / columns) change CSS RULES
  // and need a reload; every visual token is applied live via injected CSS below.
  const structParams = `layout=${tokens.layout ?? 'grid'}&cols=${tokens.columns ?? '3'}&feed=${tokens.feedLayout ?? 'standard'}`
  const [reloadTick, setReloadTick] = useState(0)
  const chromeSig = extractedHeader + '␟' + extractedFooter + '␟' + extractedHead
  const lastChromeSig = useRef(chromeSig)
  useEffect(() => {
    if (chromeSig !== lastChromeSig.current) { lastChromeSig.current = chromeSig; setReloadTick((t) => t + 1) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAt])

  // Adjust state DURING render when the editing context changes (React re-renders
  // immediately with the new state — no effect, no cascading pass): leaving the
  // article view closes the body editor, and any context switch (view / article /
  // device / interact toggle) drops the selection + its toolbar.
  const resetKey = `${view}␟${editableArticle?.slug ?? ''}␟${device}␟${interact}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setSel(null)
    if (view !== 'article' && editingBody) setEditingBody(false)
  }

  const qs = [structParams, 'preview=1', `d=${device}`, 'edit=1', `r=${reloadTick}`].join('&')
  const src = view === 'article'
    ? `/render/${siteId}/${encodeURIComponent(editableArticle?.slug ?? 'preview')}?${qs}`
    : `/render/${siteId}?${qs}`

  // Loader is derived (not effect-driven), so it's race-free: it shows only while
  // the CURRENT src hasn't loaded yet and clears the instant onFrameLoad records it.
  // Fixes the "loads forever" bug where editableArticle resolving in feed view set
  // loading=true without changing src, so onLoad never re-fired.
  const loading = loadedSrc !== src

  // ── geometry helpers ────────────────────────────────────────────────────────
  const roots = useCallback((): { doc: Document; host: Element | null; shadow: ShadowRoot | null } | null => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return null
    const host = doc.querySelector('.carma-embed-host')
    const shadow = (host as (Element & { shadowRoot?: ShadowRoot }) | null)?.shadowRoot ?? null
    return { doc, host, shadow }
  }, [])

  // Element under a viewport point, piercing into the feed shadow root. The iframe
  // is shown at 1:1 with no internal scroll (it's sized to its content), so a
  // viewport point maps to iframe-local coords by simple offset.
  const elementAt = useCallback((clientX: number, clientY: number): { el: Element; inShadow: boolean } | null => {
    const r = roots(); const frame = frameRef.current
    if (!r || !frame) return null
    const fr = frame.getBoundingClientRect()
    const lx = clientX - fr.left, ly = clientY - fr.top
    let el = r.doc.elementFromPoint(lx, ly)
    let inShadow = false
    if (el && r.host && (el === r.host || r.host.contains(el)) && r.shadow) {
      const inner = r.shadow.elementFromPoint(lx, ly)
      if (inner) { el = inner; inShadow = true }
    }
    if (!el) return null
    return { el, inShadow }
  }, [roots])

  const classify = useCallback((hit: { el: Element; inShadow: boolean }): { region: RegionId; target: Element | null } => {
    if (!hit.inShadow) {
      const target = hit.el.closest('header, footer, nav') ?? hit.el
      return { region: 'chrome', target }
    }
    const r = roots()
    const region = regionForElement(hit.el)
    const target = (r?.shadow && highlightTargetFor(r.shadow, region)) ?? hit.el
    return { region, target }
  }, [roots])

  const outline = useCallback((el: Element | null, cls: string) => {
    const r = roots()
    r?.doc.querySelectorAll('.' + cls).forEach(n => n.classList.remove(cls))
    r?.shadow?.querySelectorAll('.' + cls).forEach(n => n.classList.remove(cls))
    el?.classList.add(cls)
  }, [roots])

  const rectFor = useCallback((el: Element): DOMRect => {
    const frame = frameRef.current!
    const stage = stageRef.current!
    const fr = frame.getBoundingClientRect()
    const sr = stage.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return new DOMRect(fr.left - sr.left + r.left, fr.top - sr.top + r.top, r.width, r.height)
  }, [])

  const clearSelection = useCallback(() => {
    outline(null, 'cstudio-sel'); outline(null, 'cstudio-hover')
    setSel(null)
  }, [outline])

  const select = useCallback((region: RegionId, target: Element | null) => {
    if (region === 'chrome') { setChromeOpen(true); return }
    outline(null, 'cstudio-hover')
    outline(target, 'cstudio-sel')
    setSel(target ? { region, rect: rectFor(target), el: target } : null)
  }, [outline, rectFor])

  // Keep the toolbar glued to its element as the page scrolls.
  const onScroll = useCallback(() => {
    setSel(s => (s ? { ...s, rect: rectFor(s.el) } : s))
  }, [rectFor])

  // Interact mode doesn't reload the iframe, so the outline classes must be
  // scrubbed from the live document — a DOM-only sync (state is reset above).
  useEffect(() => {
    if (interact) { outline(null, 'cstudio-sel'); outline(null, 'cstudio-hover') }
  }, [interact, outline])

  // ── inline text editing (double-click) ──────────────────────────────────────
  const beginInlineText = useCallback((el: Element) => {
    const he = el as HTMLElement
    const isArtTitle = he.classList.contains('carma-article-title')
    const isArtLede = he.classList.contains('carma-article-lede')
    const isSection = he.classList.contains('carma-section-title')
    const isCardTitle = he.classList.contains('carma-card-title')
    const isCardExcerpt = he.classList.contains('carma-card-excerpt')
    const card = (isCardTitle || isCardExcerpt) ? (he.closest('.carma-card') as HTMLElement | null) : null
    const postId = card?.getAttribute('data-carma-post') ?? ''
    const isCard = (isCardTitle || isCardExcerpt) && !!postId
    if (!isArtTitle && !isArtLede && !isSection && !isCard) return false

    const singleLine = isArtTitle || isSection || isCardTitle
    const link = isCard ? (he.closest('.carma-card-link') as HTMLElement | null) : null
    const blockNav = (e: Event) => e.preventDefault()
    link?.addEventListener('click', blockNav)

    outline(null, 'cstudio-hover'); outline(null, 'cstudio-sel'); setSel(null)
    he.classList.add('cstudio-editing')
    he.setAttribute('contenteditable', 'plaintext-only')
    he.setAttribute('spellcheck', 'false')
    he.focus()
    // Put the caret where the user double-clicked (best-effort).
    try {
      const selc = he.ownerDocument.getSelection()
      selc?.selectAllChildren(he); selc?.collapseToEnd()
    } catch { /* noop */ }
    const commit = () => {
      const v = (he.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (isSection) { if (v) setSectionTitle(v) }
      else if (isCard) { if (!(isCardTitle && !v)) void saveCardField(postId, isCardTitle ? 'title' : 'excerpt', v) }
      else if (editableArticle) { if (!(isArtTitle && !v)) void saveArticleField(isArtTitle ? 'title' : 'excerpt', v) }
      he.removeAttribute('contenteditable')
      he.classList.remove('cstudio-editing')
      link?.removeEventListener('click', blockNav)
      he.removeEventListener('blur', commit)
      he.removeEventListener('keydown', onKey)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && singleLine)) { e.preventDefault(); he.blur() }
    }
    he.addEventListener('blur', commit)
    he.addEventListener('keydown', onKey)
    return true
  }, [editableArticle, saveArticleField, saveCardField, setSectionTitle, outline])

  // ── shield input: click = select, double-click = edit, drag/scroll = ignore ──
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    press.current = { x: e.clientX, y: e.clientY, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current
    if (p) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP) p.moved = true
      return
    }
    // hover highlight (no button pressed)
    const hit = elementAt(e.clientX, e.clientY)
    if (hit) { const { target } = classify(hit); if (target && target !== sel?.el) outline(target, 'cstudio-hover') }
    else outline(null, 'cstudio-hover')
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current; press.current = null
    if (!p || p.moved) return // was a scroll/drag, not a click
    const hit = elementAt(e.clientX, e.clientY)
    if (!hit) { clearSelection(); return }
    if (canEditBody && hit.inShadow && hit.el.closest('.carma-article-content')) { setEditingBody(true); return }
    const { region, target } = classify(hit)
    select(region, target)
  }
  const onDoubleClick = (e: React.MouseEvent) => {
    const hit = elementAt(e.clientX, e.clientY)
    if (hit && hit.inShadow) beginInlineText(hit.el)
  }

  // ── live token CSS injection (instant, no reload) ────────────────────────────
  const liveStyleRef = useRef<HTMLStyleElement | null>(null)
  const applyLiveCss = useCallback(() => {
    const r = roots(); if (!r) return
    const target: (ParentNode & { appendChild: (n: Node) => void }) | null = r.shadow ?? r.doc.head
    if (!target) return
    let st = liveStyleRef.current
    if (!st || !st.isConnected) {
      st = r.doc.createElement('style'); st.id = 'cstudio-live'
      target.appendChild(st)
      liveStyleRef.current = st
    }
    st.textContent = studioLiveCss(tokens)
  }, [roots, tokens])
  useEffect(() => { applyLiveCss() }, [applyLiveCss])

  // ── iframe load: inject edit CSS + live token CSS, measure content ──
  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
    if (h > 0) setContentH(h)
  }, [])

  const onFrameLoad = () => {
    setLoadedSrc(src)
    const r = roots(); if (!r) return
    const addStyle = (t: Document | ShadowRoot | null, parent: HTMLElement | ShadowRoot | null | undefined) => {
      if (!t || !parent || t.querySelector('#cstudio-style')) return
      const st = r.doc.createElement('style'); st.id = 'cstudio-style'; st.textContent = EDIT_CSS
      parent.appendChild(st)
    }
    try { addStyle(r.doc, r.doc.head) } catch { /* noop */ }
    try { addStyle(r.shadow, r.shadow) } catch { /* noop */ }
    liveStyleRef.current = null
    applyLiveCss()
    measure()
  }

  // Robust load handling: React can MISS an iframe onLoad if the frame finishes
  // before the handler attaches (fast/cached). So on each src change we (a) shortly
  // after paint, run onFrameLoad if the frame is already complete — which clears the
  // loader AND runs the edit-layer injection — and (b) failsafe-clear the loader so
  // it can never hang. This is what fixes "the editor loads forever".
  useEffect(() => {
    const f = frameRef.current
    const quick = setTimeout(() => {
      try { if (f?.contentDocument?.readyState === 'complete') onFrameLoad() } catch { /* mid-navigation */ }
    }, 90)
    const failsafe = setTimeout(() => setLoadedSrc(src), 6000)
    return () => { clearTimeout(quick); clearTimeout(failsafe) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // Re-measure as fonts/images settle and when the content mutates.
  useEffect(() => {
    const t1 = setTimeout(measure, 400), t2 = setTimeout(measure, 1200)
    const doc = frameRef.current?.contentDocument
    let ro: ResizeObserver | null = null
    if (doc?.body && 'ResizeObserver' in window) { ro = new ResizeObserver(() => measure()); ro.observe(doc.body) }
    return () => { clearTimeout(t1); clearTimeout(t2); ro?.disconnect() }
  }, [measure, src])

  const screenStyle: React.CSSProperties = framed
    ? { width: deviceWidth, height: contentH }
    : { width: '100%', height: contentH }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={(node) => { stageRef.current = node; setStageEl(node) }}
        onScroll={onScroll}
        className={cn('absolute inset-0 overflow-y-auto overflow-x-hidden', framed ? 'bg-surface-subtle py-8' : 'bg-white')}
      >
        <div
          className={cn(
            'relative bg-white',
            framed && 'mx-auto border-[10px] border-[#0c0a09] shadow-2xl',
            device === 'mobile' ? 'rounded-[2.25rem]' : device === 'tablet' ? 'rounded-[1.5rem]' : '',
          )}
          style={screenStyle}
        >
          <iframe
            ref={frameRef}
            src={src}
            title="Vista prèvia editable"
            onLoad={onFrameLoad}
            onError={() => setLoadedSrc(src)}
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="block w-full"
            style={{ height: contentH, border: 0 }}
            scrolling="no"
          />
          {/* Interaction shield — owns click-select; dropped in Interact mode + inline edit. */}
          <div
            ref={shieldRef}
            className={cn('absolute inset-0 z-10', interact ? 'pointer-events-none' : 'cursor-pointer')}
            style={{ touchAction: 'pan-y' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
            onPointerLeave={() => outline(null, 'cstudio-hover')}
          />
        </div>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface/50 backdrop-blur-[1px]">
          <KnotLoader size={56} />
        </div>
      )}

      {/* Contextual floating toolbar, anchored to the selected element. */}
      {sel && !interact && (
        <StudioToolbar
          region={sel.region}
          rect={sel.rect}
          stage={stageEl}
          onClose={clearSelection}
          onOpenChrome={() => setChromeOpen(true)}
        />
      )}

      {/* One-time onboarding hint — it must never squat on the canvas: it
          fades out by itself after a few seconds (or at the first selection). */}
      {!hintDismissed && !sel && !loading && !editingBody && !interact && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-bg-elevated/90 px-3.5 py-1.5 text-xs font-semibold text-muted shadow-card backdrop-blur">
          <MousePointerClick className="h-3.5 w-3.5 text-accent" />
          Clica un element per editar-ne l&apos;estil · doble clic a un títol, text o targeta per escriure-hi
        </div>
      )}

      {chromeOpen && <ChromeDrawer onClose={() => setChromeOpen(false)} />}
      {editingBody && <StudioBodyEditor device={device} onClose={() => { setEditingBody(false); setReloadTick((t) => t + 1) }} />}
    </div>
  )
}
