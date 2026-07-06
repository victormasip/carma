'use client'

// Raw source editor for the injected header / footer (and the captured <head>).
//
// Since the PIVOT to raw-HTML injection, a captured header/footer is the client's
// REAL markup, styled by the client's REAL <head> CSS (injected at render). There
// is no per-region stylesheet to tweak and no faithful in-dashboard preview
// (it would need the whole client head + light-DOM context), so the old
// click-to-edit/visual inspector is gone. What remains is honest and reliable: a
// raw HTML source editor per region. Fine-grained menu editing lives in NavEditor;
// design/colour/typography of the BLOG lives in the token panels. Edits flow
// straight into the Theme Studio state, which autosaves.

import { useState, type ReactNode } from 'react'
import { Code2, PanelTop, PanelBottom, FileCode2, ChevronDown } from 'lucide-react'

const codeAreaClass =
  'w-full px-3 py-2.5 bg-text border border-white/10 rounded-lg ' +
  'focus:outline-none focus:border-accent text-xs font-mono text-subtle ' +
  'resize-y transition-all leading-relaxed'

// Detect a legacy JSON region ({ html, css }) so we can show its inner HTML in the
// editor instead of raw JSON. New captures are already raw HTML (returned as-is).
function displayHtml(value: string): string {
  const s = value?.trim() ?? ''
  if (!s.startsWith('{')) return value ?? ''
  try {
    const o = JSON.parse(s) as { html?: unknown }
    return typeof o.html === 'string' ? o.html : value
  } catch {
    return value
  }
}

function RegionEditor({
  label, icon: Icon, value, onChange,
}: {
  label: string
  icon: typeof PanelTop
  value: string
  onChange: (html: string) => void
}) {
  const html = displayHtml(value)
  const hasHtml = html.trim().length > 0

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-surface">
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-subtle border-b border-border">
        <span className="flex items-center gap-2 text-xs font-bold text-text">
          <Icon className="w-3.5 h-3.5 text-subtle" />
          {label}
          <span className="text-xs font-medium text-subtle">· {html.length.toLocaleString()} chars</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-subtle">
          <Code2 className="w-3.5 h-3.5" /> HTML original
        </span>
      </div>
      <div className="p-3">
        <textarea
          value={html}
          onChange={e => onChange(e.target.value)}
          rows={hasHtml ? 12 : 6}
          spellCheck={false}
          placeholder="(buit — captura un tema o enganxa el codi HTML del header/footer)"
          className={codeAreaClass}
        />
        <p className="text-xs text-subtle mt-2 leading-relaxed">
          Aquest és el HTML real del lloc d&apos;origen. Es renderitza tal qual i s&apos;estila amb el
          CSS original del lloc (injectat automàticament). Per editar els enllaços del menú de
          forma visual, usa el bloc «Menú de navegació» de sota.
        </p>
      </div>
    </div>
  )
}

function HeadEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const len = (value ?? '').length
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-surface">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer w-full flex items-center gap-2 px-4 py-2.5 bg-surface-subtle border-b border-border text-left"
      >
        <FileCode2 className="w-3.5 h-3.5 text-subtle" />
        <span className="text-xs font-bold text-text">Estils i scripts capturats (&lt;head&gt;)</span>
        <span className="text-xs font-medium text-subtle">· {len.toLocaleString()} chars</span>
        <ChevronDown className={`w-3.5 h-3.5 text-subtle ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-3">
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder="(buit)"
            className={codeAreaClass}
          />
          <p className="text-xs text-subtle mt-2 leading-relaxed">
            Els fulls d&apos;estil, tipografies i scripts originals del lloc. S&apos;injecten al
            &lt;head&gt; del render perquè el header i el footer es vegin idèntics a l&apos;original.
            Edita&apos;ls només si saps el que fas.
          </p>
        </div>
      )}
    </div>
  )
}

export default function VisualChromeEditor({
  header, footer, head, onHeaderChange, onFooterChange, onHeadChange,
}: {
  header: string
  footer: string
  head?: string
  onHeaderChange: (html: string) => void
  onFooterChange: (html: string) => void
  onHeadChange?: (html: string) => void
}): ReactNode {
  return (
    <div className="space-y-4">
      <RegionEditor label="Header" icon={PanelTop} value={header} onChange={onHeaderChange} />
      <RegionEditor label="Footer" icon={PanelBottom} value={footer} onChange={onFooterChange} />
      {onHeadChange && <HeadEditor value={head ?? ''} onChange={onHeadChange} />}
    </div>
  )
}
