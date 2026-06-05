'use client'

// Per-block "⋮⋮" hover menu — minimal, dependency-free.
//
// On mouse-move over the editor we resolve the top-level block under the cursor
// via ProseMirror's posAtCoords, then float a small ⋮⋮ button in the left
// gutter for that block. Click opens a popover with:
//   · + Inserir bloc a sota
//   · Duplicar
//   · Moure amunt / Moure avall
//   · Eliminar
//
// No drag-to-reorder (that requires the heavy y-tiptap chain). Move arrows
// cover the use case without extra deps.

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown, Copy } from 'lucide-react'
import { cn } from '@/lib/cn'

type Active = { pos: number; node: PMNode; top: number; height: number }

export default function BlockHandle({ editor }: { editor: Editor }) {
  const [active, setActive] = useState<Active | null>(null)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Track which top-level block the cursor is hovering. `nodeDOM` gives us the
  // precise DOM rect so the handle aligns to the block's TOP edge regardless of
  // line-height (cleaner than computing from the coords directly).
  useEffect(() => {
    const view = editor.view
    const dom = view.dom as HTMLElement

    const onMove = (e: MouseEvent) => {
      // Skip if pointer is inside our floating UI (the menu).
      if (open) return
      const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (!pos) { setActive(null); return }

      // Walk up to the top-level block (depth 1).
      const $pos = view.state.doc.resolve(pos.pos)
      if ($pos.depth < 1) { setActive(null); return }
      const blockPos = $pos.before(1)
      const node = view.state.doc.nodeAt(blockPos)
      if (!node) { setActive(null); return }

      const nodeEl = view.nodeDOM(blockPos) as HTMLElement | null
      if (!nodeEl || !wrapperRef.current) { setActive(null); return }
      const editorRect = dom.getBoundingClientRect()
      const nodeRect = nodeEl.getBoundingClientRect()

      setActive(prev => {
        const top = nodeRect.top - editorRect.top
        if (prev && prev.pos === blockPos && prev.top === top) return prev
        return { pos: blockPos, node, top, height: nodeRect.height }
      })
    }

    const onLeave = () => { if (!open) setActive(null) }

    dom.addEventListener('mousemove', onMove)
    dom.addEventListener('mouseleave', onLeave)
    return () => {
      dom.removeEventListener('mousemove', onMove)
      dom.removeEventListener('mouseleave', onLeave)
    }
  }, [editor, open])

  // Close popover on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const insertBelow = () => {
    if (!active) return
    const end = active.pos + active.node.nodeSize
    editor.chain().focus().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run()
    setOpen(false)
  }

  const removeBlock = () => {
    if (!active) return
    editor
      .chain().focus()
      .deleteRange({ from: active.pos, to: active.pos + active.node.nodeSize })
      .run()
    setOpen(false)
    setActive(null)
  }

  const duplicateBlock = () => {
    if (!active) return
    const json = active.node.toJSON()
    const end = active.pos + active.node.nodeSize
    editor.chain().focus().insertContentAt(end, json).run()
    setOpen(false)
  }

  const moveBlock = (direction: 'up' | 'down') => {
    if (!active) return
    const doc = editor.state.doc
    // Find this block's index among top-level children.
    let index = -1
    let offset = 0
    for (let i = 0; i < doc.childCount; i++) {
      if (offset === active.pos - 1) { index = i; break }
      offset += doc.child(i).nodeSize
    }
    // posAtCoords gives us the position *after* the opening tag; recompute by
    // matching nodeSize windows.
    if (index === -1) {
      let cur = 0
      for (let i = 0; i < doc.childCount; i++) {
        const childPos = cur
        const child = doc.child(i)
        if (childPos === active.pos) { index = i; break }
        cur += child.nodeSize
      }
    }
    if (index === -1) return
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= doc.childCount) return

    const json = active.node.toJSON()
    let cursor = 0
    for (let i = 0; i < doc.childCount; i++) {
      if (i === index) break
      cursor += doc.child(i).nodeSize
    }
    const fromTo = { from: cursor, to: cursor + active.node.nodeSize }
    // After deletion, recompute the target insertion position.
    let insertAt = 0
    if (direction === 'down') {
      // Skip the block that was originally at `target`.
      for (let i = 0; i < target + 1; i++) {
        if (i === index) continue
        insertAt += doc.child(i).nodeSize
      }
    } else {
      for (let i = 0; i < target; i++) insertAt += doc.child(i).nodeSize
    }
    editor.chain().focus().deleteRange(fromTo).insertContentAt(insertAt, json).run()
    setOpen(false)
  }

  // Position the handle absolutely inside the wrapper (which the editor
  // content sits in). When there's no active block, render nothing.
  return (
    <div ref={wrapperRef} className="pointer-events-none absolute inset-0 z-10">
      {active && (
        <div
          className="pointer-events-auto absolute"
          style={{
            top: active.top + 4,
            left: -28,
            height: Math.min(active.height, 32),
          }}
        >
          <button
            type="button"
            aria-label="Accions del bloc"
            onClick={() => setOpen(o => !o)}
            className={cn(
              'flex h-7 w-6 items-center justify-center rounded-md cursor-pointer',
              'text-subtle hover:text-text hover:bg-surface-hover transition-colors',
            )}
            title="Accions del bloc"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {open && (
            <div
              role="menu"
              className="absolute z-40 top-0 left-7 w-48 bg-bg-elevated border border-border rounded-lg shadow-pop p-1"
            >
              <MenuItem icon={<Plus className="w-3.5 h-3.5" />}      label="Inserir a sota" onClick={insertBelow} />
              <MenuItem icon={<Copy className="w-3.5 h-3.5" />}      label="Duplicar"        onClick={duplicateBlock} />
              <MenuItem icon={<ArrowUp className="w-3.5 h-3.5" />}   label="Moure amunt"     onClick={() => moveBlock('up')} />
              <MenuItem icon={<ArrowDown className="w-3.5 h-3.5" />} label="Moure avall"     onClick={() => moveBlock('down')} />
              <div className="my-1 h-px bg-border" />
              <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />}    label="Eliminar"        onClick={removeBlock} tone="danger" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon, label, onClick, tone,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  tone?: 'danger'
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'cursor-pointer w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
        tone === 'danger'
          ? 'text-muted hover:text-danger hover:bg-danger-soft'
          : 'text-muted hover:text-text hover:bg-surface-hover',
      )}
    >
      <span className={cn('shrink-0', tone === 'danger' ? 'text-danger' : 'text-subtle')}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}
