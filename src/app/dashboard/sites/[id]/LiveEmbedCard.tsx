'use client'

// Live embed snippet — bound to the real-time Theme Studio state. The moment a
// color, font or layout changes in the editor, the copy-paste snippet below
// re-derives its configuration payload (the query string) and the live preview
// reloads. The saved theme is the baseline; the snippet encodes every value
// that differs from Carma's defaults, so it is fully self-describing.
//
// Two delivery modes:
//   · Script (recommended) — a single <script> tag renders the blog into a
//     Shadow DOM right where it sits, injecting Carma's token-driven CSS in an
//     isolated root. It looks perfect on ANY site regardless of native styles,
//     with no iframe height guessing.
//   · iframe — the classic isolated frame, for environments that forbid inline
//     scripts (strict CSP).

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Copy, Check, Radio, RefreshCw, ExternalLink, Code2, SquareStack } from 'lucide-react'
import { tokensToParams } from '@/lib/render/embedParams'
import { DEFAULT_TOKENS } from '@/lib/scrape/tokens'
import { useThemeStudio } from './ThemeStudioContext'

const PREVIEW_DEBOUNCE_MS = 700

type Mode = 'script' | 'iframe'

export default function LiveEmbedCard() {
  const { siteId, tokens, hasTheme } = useThemeStudio()
  const [mode, setMode] = useState<Mode>('script')

  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => 'https://el-teu-carma.com',
  )

  const params = tokensToParams(tokens, DEFAULT_TOKENS)
  const query = params ? `?${params}` : ''
  const renderUrl = `${origin}/render/${siteId}${query}`
  const embedUrl = `${origin}/embed/${siteId}${query}`

  const scriptSnippet = `<script src="${embedUrl}" defer></script>`
  const iframeSnippet = `<iframe
  src="${renderUrl}"
  style="width:100%;min-height:900px;border:0"
  loading="lazy"
  title="Blog"
></iframe>`
  const snippet = mode === 'script' ? scriptSnippet : iframeSnippet

  // Reload the live preview on a debounce so editing doesn't hammer the render.
  const [previewUrl, setPreviewUrl] = useState(renderUrl)
  useEffect(() => {
    const t = setTimeout(() => setPreviewUrl(renderUrl), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [renderUrl])

  if (!hasTheme) return null

  return (
    <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-carma-500" />
          <h3 className="text-base font-bold text-neutral-900">Embed en directe</h3>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Sincronitzat
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
        Enganxa aquest codi al lloc del client. Injecta els estils de Carma en un entorn aïllat (Shadow DOM), així el blog es veu <strong>perfecte a qualsevol web</strong> independentment del seu CSS. La configuració s&apos;actualitza a l&apos;instant amb cada canvi de la pestanya <strong>Tema</strong>.
      </p>

      {/* Mode switch */}
      <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl w-fit mb-3">
        <ModeButton active={mode === 'script'} icon={Code2} label="Script (recomanat)" onClick={() => setMode('script')} />
        <ModeButton active={mode === 'iframe'} icon={SquareStack} label="iframe" onClick={() => setMode('iframe')} />
      </div>

      {/* Snippet */}
      <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800">
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
            {mode === 'script' ? 'Snippet · Shadow DOM' : 'Snippet · iframe'}
          </span>
          <CopyBtn text={snippet} />
        </div>
        <pre className="p-4 text-xs font-mono leading-relaxed text-neutral-300 overflow-x-auto whitespace-pre">{snippet}</pre>
      </div>

      {mode === 'script' && (
        <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
          El blog es renderitza on col·loquis el <code className="font-mono text-neutral-500">&lt;script&gt;</code>. Per situar-lo en un contenidor concret, afegeix <code className="font-mono text-neutral-500">data-carma-target=&quot;#el-meu-div&quot;</code>.
        </p>
      )}

      {/* Raw URL */}
      <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-5 min-w-0">
        <code className="text-xs font-mono text-neutral-600 truncate flex-1 min-w-0">{mode === 'script' ? embedUrl : renderUrl}</code>
        <a href={mode === 'script' ? embedUrl : renderUrl} target="_blank" rel="noreferrer" className="cursor-pointer text-neutral-400 hover:text-carma-600 shrink-0" title="Obrir en una pestanya">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <CopyBtn text={mode === 'script' ? embedUrl : renderUrl} subtle />
      </div>

      {/* Live preview */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-neutral-400 uppercase tracking-widest">
          <RefreshCw className="w-3 h-3" />
          Previsualització en viu
        </div>
        <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50">
          <iframe
            key={previewUrl}
            src={previewUrl}
            title="Previsualització del blog"
            className="w-full h-[480px] bg-white"
            loading="lazy"
          />
        </div>
        {params && (
          <p className="text-xs text-neutral-400 mt-2 break-all">
            Payload de configuració: <code className="font-mono text-neutral-500">?{params}</code>
          </p>
        )}
      </div>
    </div>
  )
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Code2; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
        active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function CopyBtn({ text, subtle = false }: { text: string; subtle?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* */ }
  }
  if (subtle) {
    return (
      <button onClick={copy} title="Copiar" className="cursor-pointer text-neutral-400 hover:text-carma-600 shrink-0">
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    )
  }
  return (
    <button onClick={copy} className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-xs font-bold transition-colors shrink-0">
      {copied ? <><Check className="w-3.5 h-3.5 text-carma-400" />Copiat</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
    </button>
  )
}
