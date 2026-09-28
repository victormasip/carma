'use client'

// W7 — THE WRITING CANVAS: a same-origin iframe that IS the blog's article page.
//
// Its document is the article page's own skeleton (the classes theme.ts emits),
// styled by the stylesheet the published article's shadow root receives
// (lib/render/canvas.ts), so every blog selector matches as-is and nothing of the
// app's CSS can reach it. The editor (TipTap) stays in the parent's React tree and
// is PORTALED into the slots this component exposes once the document is ready:
//
//   header  → the article's <header>: the title and the lede
//   featured→ where the featured image sits
//   editor  → where the ProseMirror root goes (it becomes .carma-article-content)
//   ui      → #carma-ui, OUTSIDE .carma-root: menus, the block handle
//
// It also does the three things a frame boundary would otherwise break:
//   · HEIGHT — the frame grows with its content, so the page scrolls (not the
//     frame) and floating UI never lives in a nested scroller;
//   · KEYS — modifier shortcuts (⌘K, ⌘S…) are re-dispatched on the parent window,
//     where the editor's shortcuts listen; a preventDefault there cancels here;
//   · THEME — the UI inside follows the app's light/dark mode (its variables are
//     copied, resolved); the page under it keeps the BLOG's ground, always.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CanvasSpec } from '@/lib/render/canvas'
import { copyUiVariables, uiStylesheet } from './uiStyles'

export type CanvasMounts = {
  doc: Document
  win: Window
  frame: HTMLIFrameElement
  header: HTMLElement
  featured: HTMLElement
  editor: HTMLElement
  ui: HTMLElement
}

export const CANVAS_WIDTHS = { desktop: '100%', phone: '390px' } as const

/** Retag a canvas document's language (a plain DOM write, outside React's state). */
function tagLanguage(doc: Document | null | undefined, lang: string): void {
  if (doc) doc.documentElement.lang = lang
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function canvasDocument(spec: CanvasSpec): string {
  return `<!doctype html><html lang="${esc(spec.lang)}"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">${spec.headHtml}`
    + `<style id="carma-canvas">${spec.css}</style></head><body>`
    + `<main class="carma-root carma-main"><article class="carma-article">`
    + `<header class="carma-article-header" data-slot="header"></header>`
    + `<div data-slot="featured"></div><div data-slot="editor"></div>`
    + `</article></main><div id="carma-ui"></div></body></html>`
}

export default function CanvasFrame({
  spec, lang, width = 'desktop', title = 'Editor', minHeight = 480, children,
}: {
  spec: CanvasSpec
  /** The locale being edited, when it differs from the spec's (no reload needed). */
  lang?: string
  width?: keyof typeof CANVAS_WIDTHS
  title?: string
  minHeight?: number
  children: (mounts: CanvasMounts) => ReactNode
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [mounts, setMounts] = useState<CanvasMounts | null>(null)
  // The document is a pure function of the spec: a new spec is a new page.
  const srcDoc = useMemo(() => canvasDocument(spec), [spec])

  const onLoad = useCallback(() => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    const win = frame?.contentWindow
    if (!frame || !doc || !win) return
    if (!doc.querySelector('[data-slot="editor"]')) return // not our document yet
    const q = (s: string) => doc.querySelector<HTMLElement>(s)!
    if (!doc.getElementById('carma-ui-css')) {
      const style = doc.createElement('style')
      style.id = 'carma-ui-css'
      style.textContent = uiStylesheet(document)
      doc.head.appendChild(style)
    }
    copyUiVariables(document, doc)
    setMounts({ doc, win, frame, header: q('[data-slot="header"]'), featured: q('[data-slot="featured"]'), editor: q('[data-slot="editor"]'), ui: q('#carma-ui') })
  }, [])

  // THE HYDRATION RACE (found by the W7.0 spike). The srcdoc is in the server HTML,
  // so the frame can finish loading BEFORE React attaches onLoad — that load is
  // simply missed and the editor never mounts. On mount, adopt a frame that is
  // already complete; onLoad stays for every later (re)load. onLoad is idempotent.
  useEffect(() => {
    if (frameRef.current?.contentDocument?.readyState === 'complete') onLoad()
  }, [onLoad])

  // The Genome's title case (and hyphenation, and quotes) follow the EDITED
  // language: switching it retags the page instead of rebuilding it.
  useEffect(() => {
    if (mounts) tagLanguage(frameRef.current?.contentDocument, lang ?? spec.lang)
  }, [mounts, lang, spec.lang])

  // Height, keys and theme — wired once the document exists, torn down with it.
  useEffect(() => {
    if (!mounts) return
    const { doc } = mounts
    // The BODY's height, not the root's scrollHeight: that one never drops below the
    // frame's own height, so a frame that grew could never shrink again.
    const fit = () => {
      const frame = frameRef.current
      if (frame) frame.style.height = `${Math.max(minHeight, Math.ceil(doc.body.getBoundingClientRect().height))}px`
    }
    const ro = new ResizeObserver(fit)
    ro.observe(doc.documentElement)
    ro.observe(doc.body)
    fit()

    const forward = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey || e.altKey) && e.key !== 'Escape') return
      const copy = new KeyboardEvent('keydown', {
        key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
        altKey: e.altKey, repeat: e.repeat, bubbles: true, cancelable: true,
      })
      window.dispatchEvent(copy)
      if (copy.defaultPrevented) e.preventDefault()
    }
    doc.addEventListener('keydown', forward)

    const retheme = () => copyUiVariables(document, doc)
    const mo = new MutationObserver(retheme)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', retheme)

    return () => {
      ro.disconnect()
      doc.removeEventListener('keydown', forward)
      mo.disconnect()
      mq.removeEventListener('change', retheme)
    }
  }, [mounts, minHeight])

  return (
    <div className="w-full" data-canvas-width={width}>
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={srcDoc}
        onLoad={onLoad}
        className={width === 'phone'
          ? // box-content: the border must not eat the 390px the blog's media queries see.
            'mx-auto box-content block rounded-[1.75rem] border border-border shadow-pop transition-[width] duration-300'
          : 'mx-auto block border-0 transition-[width] duration-300'}
        style={{ width: CANVAS_WIDTHS[width], minHeight, colorScheme: 'normal' }}
      />
      {mounts && children(mounts)}
    </div>
  )
}
