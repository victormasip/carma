'use client'

// Hybrid visual editor for the LLM-rebuilt header / footer.
//
// CLICK-TO-EDIT: click any element in the live preview to select it; a floating
// inspector lets you edit its text/href and patch color, background, font-size,
// padding and alignment — Webflow style. CODE COMBO: a raw HTML + CSS editor is
// always one toggle away for advanced tweaks.
//
// How edits map back to the stored value:
//   · The region value is JSON { html, css }.
//   · Every element is tagged with a stable `data-cx-id` so an inspector tweak
//     targets exactly one node.
//   · Visual style tweaks are emitted as a generated CSS override block appended
//     after a marker, keyed by `[data-cx-id="N"]`. The render-time scoper namespaces
//     it under [data-carma-chrome=…] just like the rest of the chrome, so overrides
//     are isolated exactly the same way. Text/href edits rewrite the html string.
//   · Splitting css at the marker lets us recover the inspector state on reload,
//     while the human-editable "base" CSS stays clean in the code editor.
//
// React 19 compliance: the preview is driven imperatively (innerHTML + an inline
// outline on the selected node) so there is no setState-in-effect for layout,
// and the inspector reads a computed-style SNAPSHOT captured at click time, so
// no ref is read during render.

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Code2, PanelTop, PanelBottom, MousePointerClick, Type, X, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { scopeChromeCss } from '@/lib/render/scopeCss'

type Region = 'header' | 'footer'

const STYLE_PROPS = {
  color: 'color',
  background: 'background',
  fontSize: 'font-size',
  padding: 'padding',
  textAlign: 'text-align',
} as const
type StyleKey = keyof typeof STYLE_PROPS
const CSSPROP_TO_KEY: Record<string, StyleKey> = Object.fromEntries(
  Object.entries(STYLE_PROPS).map(([k, v]) => [v, k as StyleKey]),
) as Record<string, StyleKey>

type Overrides = Record<string, Partial<Record<StyleKey, string>>>

const OV_MARKER = '/*__cx_overrides__*/'

// ─── value (de)serialization ──────────────────────────────────────────────

function parseValue(json: string): { html: string; css: string } {
  if (!json?.trim()) return { html: '', css: '' }
  try {
    const o = JSON.parse(json) as { html?: unknown; css?: unknown }
    return {
      html: typeof o.html === 'string' ? o.html : '',
      css: typeof o.css === 'string' ? o.css : '',
    }
  } catch {
    return { html: json, css: '' }
  }
}

function splitCss(css: string): { base: string; overrides: Overrides } {
  const idx = css.indexOf(OV_MARKER)
  if (idx < 0) return { base: css, overrides: {} }
  return {
    base: css.slice(0, idx).trimEnd(),
    overrides: parseOverrideBlock(css.slice(idx + OV_MARKER.length)),
  }
}

function parseOverrideBlock(block: string): Overrides {
  const map: Overrides = {}
  for (const m of block.matchAll(/\[data-cx-id="([^"]+)"\]\s*\{([^}]*)\}/g)) {
    const id = m[1]
    const props: Partial<Record<StyleKey, string>> = {}
    for (const decl of m[2].split(';')) {
      const ci = decl.indexOf(':')
      if (ci < 0) continue
      const prop = decl.slice(0, ci).trim().toLowerCase()
      const key = CSSPROP_TO_KEY[prop]
      if (!key) continue
      props[key] = decl.slice(ci + 1).replace(/!important/i, '').trim()
    }
    if (Object.keys(props).length) map[id] = props
  }
  return map
}

function genOverrideBlock(overrides: Overrides): string {
  const lines: string[] = []
  for (const [id, props] of Object.entries(overrides)) {
    const decls = Object.entries(props)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${STYLE_PROPS[k as StyleKey]}:${v} !important`)
    if (decls.length) lines.push(`[data-cx-id="${id}"]{${decls.join(';')}}`)
  }
  return lines.length ? `${OV_MARKER}\n${lines.join('\n')}\n` : ''
}

function composeCss(base: string, overrides: Overrides): string {
  const block = genOverrideBlock(overrides)
  return block ? `${base.trimEnd()}\n${block}` : base
}

// Tag every element with a stable data-cx-id so inspector edits address one node.
function ensureIds(html: string): string {
  if (!html.trim() || typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let n = 0
  doc.body.querySelectorAll('[data-cx-id]').forEach(el => {
    const v = parseInt(el.getAttribute('data-cx-id') || '', 10)
    if (!Number.isNaN(v) && v >= n) n = v + 1
  })
  doc.body.querySelectorAll('*').forEach(el => {
    if (!el.getAttribute('data-cx-id')) el.setAttribute('data-cx-id', String(n++))
  })
  return doc.body.innerHTML
}

function rgbToHex(value: string): string | null {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!m) return null
  return '#' + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('')
}
const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v.trim())
function toHexInput(value: string): string {
  if (isHex(value)) return value.trim()
  return rgbToHex(value) ?? '#000000'
}

// ─── one region ─────────────────────────────────────────────────────────────

const codeAreaClass =
  'w-full px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg ' +
  'focus:outline-none focus:border-carma-500 text-xs font-mono text-neutral-200 ' +
  'resize-y transition-all leading-relaxed'

type SelMeta = { tag: string; textEditable: boolean; isLink: boolean }
type Snapshot = Partial<Record<StyleKey, string>>

function RegionEditor({
  region, label, icon: Icon, value, onChange,
}: {
  region: Region
  label: string
  icon: typeof PanelTop
  value: string
  onChange: (json: string) => void
}) {
  const [html, setHtml] = useState('')
  const [baseCss, setBaseCss] = useState('')
  const [overrides, setOverrides] = useState<Overrides>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sel, setSel] = useState<SelMeta | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>({})
  const [hrefDraft, setHrefDraft] = useState('')
  const [showCode, setShowCode] = useState(false)

  const previewRef = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string | null>(null)
  // True while the user is typing into an on-canvas contentEditable node, so the
  // structural re-render effect doesn't blow away the live node + caret.
  const editingRef = useRef(false)

  // Sync from the incoming value, but only on an EXTERNAL change (e.g. a fresh
  // grab) — not the echo of our own last emit.
  useEffect(() => {
    if (value === lastEmitted.current) return
    const { html: h0, css } = parseValue(value)
    const { base, overrides: ov } = splitCss(css)
    setHtml(ensureIds(h0))
    setBaseCss(base)
    setOverrides(ov)
    setSelectedId(null)
    setSel(null)
  }, [value])

  // Recompute the full css + emit. Called only from user edits.
  const emit = useCallback((next: { html?: string; baseCss?: string; overrides?: Overrides }) => {
    const h = next.html ?? html
    const b = next.baseCss ?? baseCss
    const o = next.overrides ?? overrides
    if (next.html !== undefined) setHtml(h)
    if (next.baseCss !== undefined) setBaseCss(b)
    if (next.overrides !== undefined) setOverrides(o)
    const json = JSON.stringify({ html: h, css: composeCss(b, o) })
    lastEmitted.current = json
    onChange(json)
  }, [html, baseCss, overrides, onChange])

  // Apply the visual selection state to the live DOM: highlight the chosen node
  // and — if it's a leaf text node — make it directly editable on the canvas.
  // `focus` is true only on a fresh selection so re-renders never steal the caret.
  const applySelection = useCallback((container: HTMLElement, id: string | null, focus: boolean) => {
    container.querySelectorAll<HTMLElement>('[data-cx-id]').forEach(el => {
      el.style.outline = ''
      el.style.outlineOffset = ''
      if (el.getAttribute('contenteditable')) el.removeAttribute('contenteditable')
    })
    if (!id) return
    const target = container.querySelector<HTMLElement>(`[data-cx-id="${id}"]`)
    if (!target) return
    target.style.outline = '2px solid #d4af37'
    target.style.outlineOffset = '1px'
    const editable = target.children.length === 0 && (target.textContent ?? '').trim().length > 0
    if (editable) {
      target.setAttribute('contenteditable', 'true')
      target.spellcheck = false
      if (focus) {
        target.focus()
        const range = document.createRange()
        range.selectNodeContents(target)
        range.collapse(false)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }, [])

  // Effect A — structural render. Rebuilds the preview HTML when content/styles
  // change. Skipped while actively typing so the caret survives. Re-applies the
  // current selection WITHOUT grabbing focus.
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    if (editingRef.current) return
    if (!html.trim()) { el.innerHTML = ''; return }
    const scoped = scopeChromeCss(composeCss(baseCss, overrides).replace(/<\/style/gi, '<\\/style'), region)
    el.innerHTML = `<style>${scoped}</style>${html}`
    applySelection(el, selectedId, false)
  }, [html, baseCss, overrides, region, selectedId, applySelection])

  // Effect B — selection visuals only (no innerHTML rebuild), so clicking an
  // element can focus it and drop the caret in without a structural reflow.
  useEffect(() => {
    const el = previewRef.current
    if (!el || editingRef.current) return
    applySelection(el, selectedId, true)
  }, [selectedId, applySelection])

  // Commit the on-canvas text edit back into the html string (one re-render).
  const commitInlineText = useCallback(() => {
    editingRef.current = false
    const container = previewRef.current
    if (!container) return
    const live = container.querySelector<HTMLElement>('[contenteditable="true"]')
    if (!live) return
    const id = live.getAttribute('data-cx-id')
    if (!id) return
    const text = live.textContent ?? ''
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const node = doc.body.querySelector(`[data-cx-id="${id}"]`)
    if (!node || (node.textContent ?? '') === text) return
    node.textContent = text
    emit({ html: doc.body.innerHTML })
  }, [html, emit])

  // Selection happens in the click handler (an event, not render) so we can read
  // the live element + its computed styles without touching refs during render.
  const onPreviewClick = (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cx-id]')
    if (!target) { setSelectedId(null); setSel(null); return }
    const id = target.getAttribute('data-cx-id')
    const cs = getComputedStyle(target)
    setSelectedId(id)
    setSel({
      tag: target.tagName.toLowerCase(),
      textEditable: target.children.length === 0 && (target.textContent ?? '').trim().length > 0,
      isLink: target.tagName === 'A',
    })
    setHrefDraft(target.getAttribute('href') ?? '')
    setSnapshot({
      color: cs.color,
      background: cs.backgroundColor,
      fontSize: cs.fontSize,
      padding: cs.padding,
      textAlign: cs.textAlign,
    })
  }

  // ── editing helpers (all go through emit) ──
  const editHtmlNode = (mutate: (node: Element) => void) => {
    if (!selectedId) return
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const node = doc.body.querySelector(`[data-cx-id="${selectedId}"]`)
    if (!node) return
    mutate(node)
    emit({ html: doc.body.innerHTML })
  }

  const commitHref = () => editHtmlNode(n => { n.setAttribute('href', hrefDraft) })

  const setStyle = (key: StyleKey, val: string) => {
    if (!selectedId) return
    const next: Overrides = { ...overrides, [selectedId]: { ...overrides[selectedId] } }
    if (val.trim()) next[selectedId][key] = val
    else delete next[selectedId][key]
    if (Object.keys(next[selectedId]).length === 0) delete next[selectedId]
    emit({ overrides: next })
  }

  // Display value: an explicit override wins; otherwise the click-time snapshot.
  const fieldValue = (key: StyleKey): string =>
    (selectedId ? overrides[selectedId]?.[key] : undefined) ?? snapshot[key] ?? ''

  const resetSelected = () => {
    if (!selectedId) return
    const n = { ...overrides }
    delete n[selectedId]
    emit({ overrides: n })
  }

  const hasHtml = html.trim().length > 0

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
        <span className="flex items-center gap-2 text-xs font-bold text-neutral-700">
          <Icon className="w-3.5 h-3.5 text-neutral-400" />
          {label}
          {hasHtml && (
            <span className="flex items-center gap-1 text-xs font-semibold text-carma-600 bg-carma-50 px-1.5 py-0.5 rounded-full">
              <MousePointerClick className="w-3 h-3" /> Clica per editar
            </span>
          )}
        </span>
        {hasHtml && (
          <button
            type="button"
            onClick={() => setShowCode(v => !v)}
            className="cursor-pointer flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-800 transition-colors"
          >
            <Code2 className="w-3.5 h-3.5" />
            {showCode ? 'Amagar codi' : 'Codi avançat'}
            {showCode ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {hasHtml ? (
        <div className="flex flex-col lg:flex-row">
          {/* Preview canvas */}
          <div className="flex-1 min-w-0 p-3 bg-neutral-100">
            <div className="bg-white rounded-lg overflow-auto shadow-inner max-h-[460px]">
              <div
                ref={previewRef}
                data-carma-chrome={region}
                onClickCapture={onPreviewClick}
                onInput={() => { editingRef.current = true }}
                onBlur={commitInlineText}
                onKeyDown={e => {
                  const t = e.target as HTMLElement
                  if (e.key === 'Enter' && t.isContentEditable) { e.preventDefault(); t.blur() }
                }}
                className="cursor-text"
              />
            </div>
          </div>

          {/* Inspector */}
          {selectedId && sel && (
            <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-neutral-200 bg-white p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-neutral-900 text-white rounded text-xs font-mono">{sel.tag}</span>
                  Inspector
                </span>
                <button onClick={() => { setSelectedId(null); setSel(null) }} className="cursor-pointer text-neutral-400 hover:text-neutral-700" title="Tancar">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {sel.textEditable && (
                <div className="flex items-start gap-2 px-2.5 py-2 bg-carma-50 border border-carma-100 rounded-lg">
                  <Type className="w-3.5 h-3.5 text-carma-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-carma-700 leading-relaxed">
                    Edita el text <strong>directament a la previsualització</strong>. Prem Enter per confirmar.
                  </p>
                </div>
              )}

              {sel.isLink && (
                <Field label="Enllaç (href)">
                  <input
                    value={hrefDraft}
                    onChange={e => setHrefDraft(e.target.value)}
                    onBlur={commitHref}
                    spellCheck={false}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                  />
                </Field>
              )}

              <ColorField label="Color de text" value={fieldValue('color')} onChange={v => setStyle('color', v)} />
              <ColorField label="Fons" value={fieldValue('background')} onChange={v => setStyle('background', v)} />

              <Field label="Mida de lletra">
                <input
                  value={overrides[selectedId]?.fontSize ?? ''}
                  onChange={e => setStyle('fontSize', e.target.value)}
                  placeholder={snapshot.fontSize || '16px'}
                  className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                />
              </Field>

              <Field label="Espaiat (padding)">
                <input
                  value={overrides[selectedId]?.padding ?? ''}
                  onChange={e => setStyle('padding', e.target.value)}
                  placeholder={snapshot.padding || '8px 16px'}
                  className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                />
              </Field>

              <Field label="Alineació">
                <div className="flex gap-1">
                  {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([val, Ico]) => {
                    const activeAlign = (overrides[selectedId]?.textAlign ?? snapshot.textAlign) === val
                    return (
                      <button
                        key={val}
                        onClick={() => setStyle('textAlign', val)}
                        className={`cursor-pointer flex-1 flex items-center justify-center py-1.5 rounded-lg border transition-all ${activeAlign ? 'bg-carma-500 border-carma-500 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}
                      >
                        <Ico className="w-3.5 h-3.5" />
                      </button>
                    )
                  })}
                </div>
              </Field>

              {overrides[selectedId] && (
                <button
                  onClick={resetSelected}
                  className="cursor-pointer w-full text-xs font-semibold text-red-500 hover:bg-red-50 py-1.5 rounded-lg transition-colors"
                >
                  Restablir aquest element
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-xs text-neutral-400 flex flex-col items-center gap-2">
          <Type className="w-5 h-5 text-neutral-300" />
          No detectat. Captura un tema o enganxa el codi a sota.
        </div>
      )}

      {(showCode || !hasHtml) && (
        <div className="p-3 space-y-3 border-t border-neutral-200">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">
              HTML · {html.length.toLocaleString()} chars
            </label>
            <textarea
              value={html}
              onChange={e => emit({ html: e.target.value })}
              rows={8}
              spellCheck={false}
              placeholder="(buit)"
              className={codeAreaClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">
              CSS base · {baseCss.length.toLocaleString()} chars
            </label>
            <textarea
              value={baseCss}
              onChange={e => emit({ baseCss: e.target.value })}
              rows={8}
              spellCheck={false}
              placeholder="(buit)"
              className={codeAreaClass}
            />
          </div>
          <p className="text-xs text-neutral-400">
            Edita el codi i veuràs el canvi a la previsualització a l&apos;instant. Els ajustos visuals
            que facis clicant s&apos;afegeixen com a CSS aïllat (no afecten la resta de la pàgina).
          </p>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg border border-neutral-200 shrink-0" style={{ background: value || 'transparent' }} aria-hidden />
        <input
          type="color"
          value={toHexInput(value)}
          onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-neutral-200 bg-white p-0 shrink-0"
          aria-label={label}
        />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          className="flex-1 min-w-0 px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
        />
      </div>
    </Field>
  )
}

export default function VisualChromeEditor({
  header, footer, onHeaderChange, onFooterChange,
}: {
  header: string
  footer: string
  onHeaderChange: (json: string) => void
  onFooterChange: (json: string) => void
}) {
  return (
    <div className="space-y-4">
      <RegionEditor region="header" label="Header" icon={PanelTop} value={header} onChange={onHeaderChange} />
      <RegionEditor region="footer" label="Footer" icon={PanelBottom} value={footer} onChange={onFooterChange} />
    </div>
  )
}
