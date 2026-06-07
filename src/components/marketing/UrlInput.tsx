'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe, Wand2, ArrowRight } from 'lucide-react'

const EXAMPLES = [
  'la-vinya-petita.cat',
  'ferreteria-roca.com',
  'optica-vidal.cat',
  'atelier-bcn.com',
  'boria-galeria.cat',
]

/**
 * The hero centerpiece — a single big input that cycles example domains as an
 * animated placeholder, follows the cursor with a soft gold spotlight, and fires
 * the Magic-Link funnel. Reusable (hero + final CTA).
 */
export default function UrlInput({
  onSubmit,
  autoFocus = false,
  size = 'lg',
}: {
  onSubmit: (url: string) => void
  autoFocus?: boolean
  size?: 'lg' | 'md'
}) {
  const [value, setValue] = useState('')
  const [exampleIdx, setExampleIdx] = useState(0)
  const [typed, setTyped] = useState('')
  const hostRef = useRef<HTMLDivElement>(null)

  // Type-on / type-off the rotating example as a living placeholder.
  useEffect(() => {
    if (value) return
    const target = EXAMPLES[exampleIdx]
    let i = 0
    let deleting = false
    const tick = () => {
      if (!deleting) {
        i++
        setTyped(target.slice(0, i))
        if (i >= target.length) {
          deleting = true
          return window.setTimeout(tick, 1700)
        }
      } else {
        i--
        setTyped(target.slice(0, i))
        if (i <= 0) {
          setExampleIdx((n) => (n + 1) % EXAMPLES.length)
          return
        }
      }
      window.setTimeout(tick, deleting ? 35 : 70)
    }
    const t = window.setTimeout(tick, 400)
    return () => window.clearTimeout(t)
  }, [exampleIdx, value])

  const onMove = (e: React.MouseEvent) => {
    const el = hostRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  const submit = () => {
    const v = value.trim()
    if (v) onSubmit(v)
  }

  const h = size === 'lg' ? 'h-16 sm:h-[4.5rem]' : 'h-14'

  return (
    <div
      ref={hostRef}
      onMouseMove={onMove}
      className="pointer-host group relative mx-auto flex w-full max-w-2xl items-center gap-2 rounded-[1.75rem] border border-border bg-bg-elevated p-2 shadow-premium transition-shadow focus-within:shadow-[0_30px_70px_-10px_rgba(245,188,0,0.25)]"
    >
      <span className="pointer-spot rounded-[1.75rem]" />
      <div className={`relative flex flex-1 items-center gap-3 pl-4 ${h}`}>
        <Globe className="h-5 w-5 shrink-0 text-subtle" />
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          inputMode="url"
          aria-label="La URL del teu lloc web"
          className="w-full bg-transparent text-lg font-medium text-text outline-none placeholder:text-transparent sm:text-xl"
        />
        {/* Animated placeholder overlay (only while empty). */}
        {!value && (
          <span className="caret-blink pointer-events-none absolute left-[2.25rem] text-lg font-medium text-subtle sm:text-xl">
            {typed || 'la-teva-web.cat'}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        className="btn-gold gold-trace [--gold-trace-w:1.5px] relative inline-flex h-full min-h-[3.25rem] shrink-0 items-center gap-2 rounded-[1.4rem] px-5 text-sm font-extrabold sm:px-7 sm:text-base"
      >
        <span className="relative z-[1] inline-flex items-center gap-2">
          <Wand2 className="h-4 w-4" />
          <span className="hidden sm:inline">Genera el meu blog</span>
          <span className="sm:hidden">Generar</span>
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  )
}
