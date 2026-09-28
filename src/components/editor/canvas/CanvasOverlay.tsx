'use client'

// W7 — a box in the canvas's UI layer that sits exactly over the editor.
//
// UI that positions itself against the ProseMirror root (the block handle measures
// block rects relative to it) cannot live INSIDE that root: in the canvas the root
// is the blog's `.carma-article-content`, and anything placed in it becomes a blog
// grid item under the blog's rules. So the UI lives in #carma-ui, and this box
// tracks the root's document rect — size changes directly, moves through the body
// (a growing title pushes the article down).

import { useEffect, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'

type Box = { top: number; left: number; width: number; height: number }

export default function CanvasOverlay({ editor, children }: { editor: Editor; children: ReactNode }) {
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement
    const doc = dom.ownerDocument
    const win = doc.defaultView
    if (!win) return
    const measure = () => {
      const r = dom.getBoundingClientRect()
      setBox(prev => {
        const next = { top: r.top + win.scrollY, left: r.left + win.scrollX, width: r.width, height: r.height }
        return prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height ? prev : next
      })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(dom)
    ro.observe(doc.body)
    win.addEventListener('resize', measure)
    measure()
    return () => { ro.disconnect(); win.removeEventListener('resize', measure) }
  }, [editor])

  if (!box) return null
  return (
    <div style={{ position: 'absolute', top: box.top, left: box.left, width: box.width, height: box.height, pointerEvents: 'none' }}>
      {children}
    </div>
  )
}
