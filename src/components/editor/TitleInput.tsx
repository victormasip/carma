'use client'

// The article title (Super MVP Fase 5).
//
// WAS: `<input type="text">` at text-5xl. A single line. Any title longer than the
// canvas scrolled sideways and the writer could never see the whole thing —
// reported by the founder, and exactly what the markup did.
//
// NOW: a textarea that grows to fit. Two mechanisms, deliberately:
//
//   · `field-sizing: content` (Chrome/Edge 123+) does it natively, with no JS and
//     no layout thrash.
//   · A scrollHeight sync covers Safari and Firefox, and runs on mount, on input,
//     and on width changes (a ResizeObserver, because the drawer opening changes
//     the canvas width without any input event firing).
//
// Enter moves to the body instead of inserting a newline — a title is one line of
// meaning even when it wraps to three. Paste is flattened for the same reason:
// pasting a headline out of a doc used to smuggle a newline into the <h1>.

import { useCallback, useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Focus the body editor — what Enter and Tab-out should do. */
  onCommit?: () => void
  autoFocus?: boolean
  'aria-label'?: string
}

export default function TitleInput({
  value, onChange, placeholder = "Títol de l'article", onCommit, autoFocus,
  'aria-label': ariaLabel = "Títol de l'article",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Re-measure. No-op where `field-sizing` is supported, so the two mechanisms
  // never fight: we only touch inline height when the browser isn't sizing it.
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { resize() }, [value, resize])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // The drawer opening/closing changes the canvas width with no input event, so
    // the wrap point moves and the height has to follow.
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [resize])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={placeholder}
      spellCheck
      // enterKeyHint so mobile keyboards show "next", not a newline affordance.
      enterKeyHint="next"
      onChange={e => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit?.()
        }
      }}
      onPaste={e => {
        const text = e.clipboardData.getData('text/plain')
        if (!text.includes('\n')) return
        // A headline pasted out of a document drags its newline along; flatten it
        // rather than letting it become a line break inside the <h1>.
        e.preventDefault()
        const el = e.currentTarget
        const flat = text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
        const next = value.slice(0, el.selectionStart) + flat + value.slice(el.selectionEnd)
        onChange(next)
      }}
      className="w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-2 text-4xl font-bold tracking-tight text-text placeholder:text-subtle focus:outline-none sm:text-5xl"
      style={{ lineHeight: 1.1, fieldSizing: 'content' } as React.CSSProperties}
    />
  )
}
