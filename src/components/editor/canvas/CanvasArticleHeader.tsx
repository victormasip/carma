'use client'

// W7.2 — the article's header and cover, ON the canvas.
//
// Portaled into the canvas's header and featured slots, and written in the
// published article's own markup (theme.ts `articleBlogInner`): the title IS
// `<h1 class="carma-article-title">`, the lede IS `<p class="carma-article-lede">`,
// the meta line IS `.carma-article-meta` — so the blog's stylesheet dresses them
// exactly as it will for the reader, and `test:editor-fidelity` compares them.
//
// The title and the lede are plain-text contentEditable elements, not inputs: an
// <input> or a <textarea> is a replaced element with its own box, and could never
// be the blog's <h1>. Enter moves on instead of breaking the line — a title is
// one line of meaning even when it wraps to three — and paste is flattened.
//
// What only a writer sees lives in the `carma.editor` layer (lib/render/canvas.ts):
// the placeholders, and the empty lede, which appears only while the header is
// hovered or being edited — at rest the page is the reader's, with no lede.

import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { BCP47, type Locale } from '@/lib/i18n/config'
import { responsiveFeaturedImage } from '@/lib/render/imageMarkup'

const flat = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ')

function PlainEditable({ tag, className, value, onChange, placeholder, label, onEnter }: {
  tag: 'h1' | 'p'
  className: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  onEnter?: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  // The DOM owns the text while it is being typed; React only writes when the
  // value changed from OUTSIDE (a locale switch, the AI, the drawer's field) —
  // writing on every keystroke would throw the caret back to the start.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.textContent !== value) el.textContent = value
  }, [value])

  const props: HTMLAttributes<HTMLElement> & { 'data-placeholder': string; 'data-empty'?: string } = {
    className,
    contentEditable: 'plaintext-only',
    suppressContentEditableWarning: true,
    role: 'textbox',
    'aria-label': label,
    'aria-multiline': false,
    spellCheck: true,
    enterKeyHint: 'next',
    'data-placeholder': placeholder,
    'data-empty': value ? undefined : '',
    onInput: e => onChange(flat(e.currentTarget.textContent ?? '')),
    onKeyDown: e => {
      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
      e.preventDefault()
      onEnter?.()
    },
    onPaste: e => {
      e.preventDefault()
      // A clipboard's closing newline must not leave a trailing space in the title.
      const text = flat(e.clipboardData.getData('text/plain')).replace(/\s+$/, '')
      // execCommand keeps the paste on the element's own undo stack.
      e.currentTarget.ownerDocument.execCommand('insertText', false, text)
    },
  }
  return tag === 'h1'
    ? <h1 ref={ref as Ref<HTMLHeadingElement>} {...props} />
    : <p ref={ref as Ref<HTMLParagraphElement>} {...props} />
}

function formatArticleDate(iso: string, locale: Locale): string {
  try {
    return new Date(iso).toLocaleDateString(BCP47[locale], { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return iso }
}

export function CanvasArticleHeader({
  title, onTitle, lede, onLede, onCommit, author, date, categories, locale,
  titlePlaceholder = "Títol de l'article",
  ledePlaceholder = 'Entradeta — una o dues frases sota el títol (opcional)',
}: {
  title: string
  onTitle: (v: string) => void
  lede: string
  onLede: (v: string) => void
  /** Enter in the title or the lede: go to the body. */
  onCommit?: () => void
  author?: string | null
  /** ISO date or YYYY-MM-DD; empty → today, as the published page will show. */
  date?: string | null
  categories?: string[] | null
  locale: Locale
  titlePlaceholder?: string
  ledePlaceholder?: string
}) {
  const [today] = useState(() => new Date().toISOString())
  const when = date ? (date.length === 10 ? `${date}T12:00:00` : date) : today

  // The published meta line, part for part: author · date · categories.
  const parts: ReactNode[] = []
  if (author?.trim()) parts.push(<span key="a">{author}</span>)
  parts.push(<time key="t" dateTime={when}>{formatArticleDate(when, locale)}</time>)
  if (categories?.length) parts.push(<span key="c" className="carma-cat">{categories.join(', ')}</span>)
  const meta = parts.flatMap((p, i) => (i ? [<span key={`s${i}`}>·</span>, p] : [p]))

  return (
    <>
      <PlainEditable tag="h1" className="carma-article-title" value={title} onChange={onTitle}
        placeholder={titlePlaceholder} label="Títol de l'article" onEnter={onCommit} />
      <PlainEditable tag="p" className="carma-article-lede" value={lede} onChange={onLede}
        placeholder={ledePlaceholder} label="Entradeta" onEnter={onCommit} />
      <div className="carma-article-meta" contentEditable={false}>{meta}</div>
    </>
  )
}

/**
 * The cover, as the reader gets it — the render's own `responsiveFeaturedImage`
 * markup (a <picture> through /api/img, or the plain <img> it keeps for data URIs)
 * — with its two controls on top, in a `data-carma-ui` element.
 */
export function CanvasFeaturedImage({ src, alt = '', busy, onReplace, onRemove }: {
  src: string
  /** The published page uses the article's title. */
  alt?: string
  busy?: boolean
  onReplace: () => void
  onRemove: () => void
}) {
  const figRef = useRef<HTMLElement>(null)
  // The picture is the render's markup STRING; React keeps only the controls.
  useLayoutEffect(() => {
    const fig = figRef.current
    if (!fig) return
    const frag = fig.ownerDocument.createRange().createContextualFragment(responsiveFeaturedImage(src, alt))
    const nodes = Array.from(frag.childNodes)
    fig.prepend(frag)
    return () => { for (const n of nodes) n.remove() }
  }, [src, alt])

  return (
    <figure ref={figRef} className="carma-article-image-wrap">
      <div data-carma-ui className="carma-cover-tools absolute right-2 top-2 flex gap-1.5">
        <button type="button" onClick={onReplace} disabled={busy}
          className="cursor-pointer rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-60">
          {busy ? 'Pujant…' : 'Canviar'}
        </button>
        <button type="button" onClick={onRemove}
          className="cursor-pointer rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/75">
          Treure
        </button>
      </div>
    </figure>
  )
}
