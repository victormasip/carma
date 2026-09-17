'use client'

// "Notion-tier" writing canvas:
//   · Full-bleed surface with no chrome around it — just text.
//   · Bubble menu on selection (Medium-style) for inline formatting.
//   · Floating "+" insert menu on empty lines.
//   · Block drag-handle gutter (⋮⋮) with a per-block popover for delete /
//     duplicate / move / "+ new below". Drag to reorder.
//   · Slash menu ('/') for inserting any block by name.
//
// There is intentionally NO sticky toolbar. The editor IS the toolbar.

import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import { sanitizePastedHtml, looksLikeDocumentPaste } from './pasteSanitizer'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { Placeholder, Focus } from '@tiptap/extensions'
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Link2, Link2Off,
  Heading2, Heading3, Heading1, List, ListOrdered, Quote, Code, Minus,
  ImageIcon, Plus, Info, Images, Columns2, Video,
  Wand2, Sparkles, Minimize2, Maximize2, SpellCheck,
  ChevronRight, MousePointerClick, ListTree,
} from 'lucide-react'
import KnotSpinner from '@/components/ui/KnotSpinner'
import type { RewriteMode } from '@/lib/writing/rewrite'
import { Callout } from './extensions/Callout'
import { Gallery } from './extensions/Gallery'
import { Figure } from './extensions/Figure'
import { Embed } from './extensions/Embed'
import { parseEmbedUrl } from '@/lib/embed'
import { Columns, Column } from './extensions/Columns'
import { HeadingId } from './extensions/HeadingId'
import { Toggle, ToggleSummary } from './extensions/Toggle'
import { CtaButton } from './extensions/CtaButton'
import { Toc } from './extensions/Toc'
import { SlashCommand } from './extensions/SlashCommand'
import BlockHandle from './BlockHandle'
import { cn } from '@/lib/cn'
import { uploadImage } from '@/lib/upload'
import { useToast } from '@/components/ui/Toast'

// Upload dropped/pasted image files to storage, then insert each as a figure
// with its CLEAN URL — never a base64 data-URI (which broke the render + bloated
// the DB). Returns true synchronously so paste/drop is intercepted; the actual
// insert happens as each upload resolves.
function insertImageFiles(
  editor: Editor,
  files: FileList | File[],
  siteId: string,
  onError: (msg: string) => void,
): boolean {
  const images = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (images.length === 0) return false
  void (async () => {
    for (const file of images) {
      try {
        const url = await uploadImage(file, siteId)
        editor.chain().focus().setFigure({ src: url }).run()
      } catch (e) {
        onError(e instanceof Error ? e.message : 'No s’ha pogut pujar la imatge')
      }
    }
  })()
  return true
}

type CaretPos = { from: number; to: number }

type Props = {
  initialHtml?: string
  onChange: (html: string) => void
  placeholder?: string
  siteId: string
  /** Continuously mirrors the live selection (parent-owned ref, no re-renders). */
  selectionRef?: React.MutableRefObject<CaretPos | null>
  /** One-shot caret restore on mount — set by the parent right before a
      content-identical remount (the auto language relabel), consumed here. */
  restoreCaretRef?: React.MutableRefObject<CaretPos | null>
  /** Hands the live editor instance up so the parent's command palette can drive
      it (insert blocks, change format). Called with null on unmount. */
  onEditorReady?: (editor: Editor | null) => void
  /** Inline AI rewrite of the current selection. Returns the rewritten text, or
      null when it couldn't run (not premium / error — the parent surfaces why). */
  onAiRewrite?: (text: string, mode: RewriteMode) => Promise<string | null>
  /** Focus mode: dims every block except the one holding the caret. */
  focusMode?: boolean
}

export default function TipTapEditor({ initialHtml = '', onChange, placeholder, siteId, selectionRef, restoreCaretRef, onEditorReady, onAiRewrite, focusMode }: Props) {
  const { toast } = useToast()
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showImageInput, setShowImageInput] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [showVideoInput, setShowVideoInput] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  // Which rewrite mode is in flight (drives the spinner + disables re-entry); null = idle.
  const [aiMode, setAiMode] = useState<RewriteMode | null>(null)
  const editorRef = useRef<Editor | null>(null)
  // True until the first onUpdate of a content-seeded (re)mount. A freshly
  // remounted TipTap (its `key` changes on the parent's auto language relabel /
  // AI generate / translate) can fire one EMPTY update before its initial content
  // settles; propagating that "" would wipe the body the parent just set into the
  // active locale (the "title stays, content vanishes" data-loss bug). We swallow
  // exactly that first empty echo. Real edits — and any later clear — pass through.
  const pendingSeedRef = useRef(!!initialHtml)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false }),
      HeadingId.configure({ levels: [1, 2, 3] }),
      Placeholder.configure({
        showOnlyCurrent: true,
        includeChildren: true,
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Encapçalament…'
          if (node.type.name === 'paragraph') return placeholder || "Escriu alguna cosa, o prem '/' per inserir un bloc…"
          return ''
        },
      }),
      Underline,
      // Adds `.carma-focused` to the top-level block holding the caret so focus
      // mode can dim everything else (see globals.css `.carma-focus-mode`).
      Focus.configure({ className: 'carma-focused', mode: 'shallowest' }),
      Figure,
      Embed,
      Columns,
      Column,
      Toggle,
      ToggleSummary,
      CtaButton,
      Toc,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Callout,
      Gallery.configure({ siteId }),
      SlashCommand.configure({
        requestImage: () => { setShowImageInput(true); setShowLinkInput(false) },
      }),
    ],
    content: initialHtml || '',
    editorProps: {
      attributes: { class: 'carma-prose focus:outline-none' },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files
        if (files && files.length > 0 && editorRef.current && insertImageFiles(editorRef.current, files, siteId, m => toast(m, 'error'))) {
          event.preventDefault()
          return true
        }
        // Word / Google Docs / Notion paste (Fase 5). Their text/html flavour pins
        // every few words inside `<span style="font-family:Calibri;color:#1F1F1F">`,
        // which overrides the site's own typography and colour tokens — the classic
        // way a CMS article ends up looking nothing like the blog it lives on.
        // TipTap's schema drops unknown NODES but keeps inline styles on the ones it
        // knows, so nothing filtered this before.
        //
        // Only foreign payloads are touched: a paste from inside Carma still goes
        // through ProseMirror's normal path untouched.
        const html = event.clipboardData?.getData('text/html')
        if (html && looksLikeDocumentPaste(html) && editorRef.current) {
          const clean = sanitizePastedHtml(html)
          if (clean) {
            event.preventDefault()
            editorRef.current.chain().focus().insertContent(clean).run()
            return true
          }
        }
        return false
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files
        if (files && files.length > 0 && editorRef.current && insertImageFiles(editorRef.current, files, siteId, m => toast(m, 'error'))) {
          event.preventDefault()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      // Drop the first empty update of a content-seeded (re)mount — it's the
      // remount echo, not a real edit (see pendingSeedRef). Everything else,
      // including a deliberate clear on any later update, propagates normally.
      if (pendingSeedRef.current) {
        pendingSeedRef.current = false
        if (editor.isEmpty) return
      }
      onChange(editor.getHTML())
    },
    onSelectionUpdate: ({ editor }) => {
      if (selectionRef) {
        selectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to }
      }
    },
    onCreate: ({ editor }) => {
      // Auto language relabel remounts this component with IDENTICAL content;
      // restoring the stashed caret makes the switch invisible to the writer.
      const caret = restoreCaretRef?.current
      if (caret) {
        restoreCaretRef.current = null
        const max = editor.state.doc.content.size
        editor
          .chain()
          .focus()
          .setTextSelection({ from: Math.min(caret.from, max), to: Math.min(caret.to, max) })
          .run()
      }
    },
  })

  // Seed the initial document EXACTLY ONCE. The old guard (`editor.isEmpty`)
  // re-ran setContent on every parent re-render while the doc was empty —
  // autosave/status re-renders arrive within ~1s, and each setContent resets
  // the selection and tears down any open suggestion session. That killed the
  // "/" menu precisely on the first empty line.
  const seededRef = useRef(false)
  useEffect(() => {
    editorRef.current = editor
    if (editor && initialHtml && !seededRef.current && editor.isEmpty) {
      seededRef.current = true
      editor.commands.setContent(initialHtml)
    }
  }, [editor, initialHtml])

  // Publish the editor instance to the parent (command palette) and retract it on
  // unmount / remount so a stale instance is never driven.
  useEffect(() => {
    onEditorReady?.(editor)
    return () => onEditorReady?.(null)
  }, [editor, onEditorReady])

  if (!editor) return null

  // Rewrite the current selection in place via the parent's AI action.
  const runAi = async (mode: RewriteMode) => {
    if (!onAiRewrite || aiMode) return
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, ' ').trim()
    if (!text) { toast('Selecciona primer un fragment de text', 'info'); return }
    setAiMode(mode)
    try {
      const out = await onAiRewrite(text, mode)
      if (out) editor.chain().focus().insertContentAt({ from, to }, out).run()
    } finally {
      setAiMode(null)
      setAiOpen(false)
    }
  }

  // Bubble-menu button on the dark floating pill.
  /**
   * THE BUG THAT MADE EVERY MENU BUTTON LOOK BROKEN.
   *
   * Founder, 2026-09-16: "quan cliques sobre blanc apareixen unes opcions que no
   * funcionen be, per exemple encapçalament no fa res, obre linia en blanc".
   *
   * A <button> takes focus on MOUSEDOWN, before `click` ever fires. That single
   * fact breaks a TipTap menu three ways at once:
   *
   *   · the editor loses focus, so ProseMirror's selection collapses and the
   *     command — if it runs at all — runs against the wrong place;
   *   · FloatingMenu's `shouldShow` re-evaluates on that blur and hides the
   *     menu, so mouseup lands on nothing and NO click event is ever dispatched.
   *     The button is not slow or buggy; it was never pressed;
   *   · the caret ends up back in an empty paragraph, which is the "obre línia
   *     en blanc" part.
   *
   * preventDefault on mousedown stops the focus move entirely. The editor keeps
   * its selection, the menu stays up, the click lands, and `.chain().focus()`
   * has something real to act on. Every button in this file gets it.
   */
  const preventBlur = (e: React.MouseEvent) => e.preventDefault()

  const bbtn = (active: boolean) => cn(
    'cursor-pointer flex items-center justify-center w-8 h-8 rounded-md transition-colors',
    active ? 'bg-accent text-on-accent' : 'text-white/70 hover:bg-white/15 hover:text-white',
  )

  // Floating insert-menu button on empty lines.
  const fbtn = 'cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:bg-accent-soft hover:text-accent transition-colors'

  const applyLink = () => {
    if (!linkUrl.trim()) editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    setLinkUrl('')
    setShowLinkInput(false)
  }

  const openLinkInput = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    setLinkUrl(editor.getAttributes('link').href ?? '')
    setShowLinkInput(true)
    setShowImageInput(false)
  }

  const applyImage = () => {
    if (imageUrl.trim()) editor.chain().focus().setFigure({ src: imageUrl.trim() }).run()
    setImageUrl('')
    setShowImageInput(false)
  }

  const applyVideo = () => {
    const parsed = parseEmbedUrl(videoUrl)
    if (!parsed) { toast('Enganxa una URL de YouTube o Vimeo vàlida', 'error'); return }
    editor.chain().focus().setEmbed({ provider: parsed.provider, embedId: parsed.id, url: videoUrl.trim() }).run()
    setVideoUrl('')
    setShowVideoInput(false)
  }

  return (
    <div className="relative">
      {/* Block drag-handle gutter — appears on hover, no permanent UI. */}
      <BlockHandle editor={editor} />

      {/* Floating format menu on text selection — Medium-style. */}
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 p-1 bg-text rounded-xl shadow-pop ring-1 ring-white/10"
        options={{ placement: 'top' }}
        shouldShow={({ editor, state }) => {
          const { empty } = state.selection
          return !empty && editor.isEditable && !editor.isActive('figure')
        }}
      >
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleBold().run()} className={bbtn(editor.isActive('bold'))} title="Negreta (Ctrl/⌘+B)">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleItalic().run()} className={bbtn(editor.isActive('italic'))} title="Cursiva (Ctrl/⌘+I)">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleUnderline().run()} className={bbtn(editor.isActive('underline'))} title="Subratllat (Ctrl/⌘+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleStrike().run()} className={bbtn(editor.isActive('strike'))} title="Barrat">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleCode().run()} className={bbtn(editor.isActive('code'))} title="Codi">
          <Code className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-white/15 mx-0.5" />
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={bbtn(editor.isActive('heading', { level: 1 }))} title="Títol gran">
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={bbtn(editor.isActive('heading', { level: 2 }))} title="Títol">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={bbtn(editor.isActive('heading', { level: 3 }))} title="Subtítol">
          <Heading3 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={bbtn(editor.isActive('blockquote'))} title="Cita">
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={openLinkInput} className={bbtn(editor.isActive('link'))} title="Enllaç">
          {editor.isActive('link') ? <Link2Off className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        </button>

        {onAiRewrite && (
          <>
            <div className="w-px h-5 bg-white/15 mx-0.5" />
            <div className="relative">
              <button
                type="button"
                onMouseDown={preventBlur}
                onClick={() => setAiOpen(o => !o)}
                className={cn(
                  'cursor-pointer flex items-center justify-center gap-1 h-8 px-2 rounded-md transition-colors',
                  aiOpen || aiMode ? 'bg-accent text-on-accent' : 'text-white/70 hover:bg-white/15 hover:text-white',
                )}
                title="Reescriu la selecció amb IA"
              >
                {aiMode ? <KnotSpinner className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                <span className="text-xs font-semibold">IA</span>
              </button>
              {aiOpen && !aiMode && (
                <div className="absolute top-full right-0 mt-1.5 w-44 rounded-xl bg-text p-1 shadow-pop ring-1 ring-white/10">
                  {([
                    { mode: 'improve', label: 'Millora', icon: <Sparkles className="w-3.5 h-3.5" /> },
                    { mode: 'fix', label: 'Corregeix', icon: <SpellCheck className="w-3.5 h-3.5" /> },
                    { mode: 'shorten', label: 'Escurça', icon: <Minimize2 className="w-3.5 h-3.5" /> },
                    { mode: 'expand', label: 'Amplia', icon: <Maximize2 className="w-3.5 h-3.5" /> },
                  ] as const).map(o => (
                    <button
                      key={o.mode}
                      type="button"
                      onClick={() => { void runAi(o.mode) }}
                      className="cursor-pointer flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
                    >
                      <span className="text-white/60">{o.icon}</span> {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </BubbleMenu>

      {/* Floating insert menu on empty paragraphs */}
      <FloatingMenu
        editor={editor}
        className="w-52 max-h-[60vh] overflow-y-auto p-1.5 bg-bg-elevated rounded-xl shadow-pop ring-1 ring-border"
        options={{ placement: 'left-start' }}
      >
        <p className="px-3 pt-1 pb-1.5 text-xs font-bold uppercase tracking-widest text-subtle flex items-center gap-1">
          <Plus className="w-3 h-3" /> Inserir · prem <kbd className="px-1 py-0.5 bg-surface-subtle rounded text-subtle not-italic font-mono">/</kbd>
        </p>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={fbtn}>
          <Heading1 className="w-3.5 h-3.5 text-subtle" /> Títol gran
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={fbtn}>
          <Heading2 className="w-3.5 h-3.5 text-subtle" /> Títol
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={fbtn}>
          <Heading3 className="w-3.5 h-3.5 text-subtle" /> Subtítol
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleBulletList().run()} className={fbtn}>
          <List className="w-3.5 h-3.5 text-subtle" /> Llista
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={fbtn}>
          <ListOrdered className="w-3.5 h-3.5 text-subtle" /> Llista numerada
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={fbtn}>
          <Quote className="w-3.5 h-3.5 text-subtle" /> Cita
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => { setShowImageInput(true); setShowLinkInput(false); setShowVideoInput(false) }} className={fbtn}>
          <ImageIcon className="w-3.5 h-3.5 text-subtle" /> Imatge
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => { setShowVideoInput(true); setShowImageInput(false); setShowLinkInput(false) }} className={fbtn}>
          <Video className="w-3.5 h-3.5 text-subtle" /> Vídeo
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().setCallout({ variant: 'info' }).run()} className={fbtn}>
          <Info className="w-3.5 h-3.5 text-subtle" /> Targeta destacada
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().setGallery().run()} className={fbtn}>
          <Images className="w-3.5 h-3.5 text-subtle" /> Galeria
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().setColumns().run()} className={fbtn}>
          <Columns2 className="w-3.5 h-3.5 text-subtle" /> 2 columnes
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={fbtn}>
          <Code className="w-3.5 h-3.5 text-subtle" /> Bloc de codi
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().setToggleBlock().run()} className={fbtn}>
          <ChevronRight className="w-3.5 h-3.5 text-subtle" /> Desplegable
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().setCtaButton().run()} className={fbtn}>
          <MousePointerClick className="w-3.5 h-3.5 text-subtle" /> Botó d&apos;acció
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().setToc().run()} className={fbtn}>
          <ListTree className="w-3.5 h-3.5 text-subtle" /> Índex de continguts
        </button>
        <button type="button" onMouseDown={preventBlur} onClick={() => editor.chain().focus().setHorizontalRule().run()} className={fbtn}>
          <Minus className="w-3.5 h-3.5 text-subtle" /> Separador
        </button>
      </FloatingMenu>

      {/* Tiny inline link/image/video inputs — anchored above the canvas, only when triggered */}
      {(showLinkInput || showImageInput || showVideoInput) && (
        <div className="sticky top-0 z-20 -mt-2 mb-3 mx-auto max-w-[44rem] flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-elevated border border-border shadow-pop">
          {showLinkInput && (
            <>
              <Link2 className="w-3.5 h-3.5 text-subtle shrink-0" />
              <input
                autoFocus
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } if (e.key === 'Escape') setShowLinkInput(false) }}
                placeholder="https://example.com"
                className="flex-1 text-xs px-2 py-1.5 bg-transparent focus:outline-none text-text placeholder:text-subtle"
              />
              <button type="button" onMouseDown={preventBlur} onClick={applyLink} className="cursor-pointer text-xs font-semibold px-3 py-1.5 bg-accent text-on-accent rounded-md hover:bg-accent-hover transition-colors">
                Aplicar
              </button>
              <button type="button" onMouseDown={preventBlur} onClick={() => setShowLinkInput(false)} className="cursor-pointer text-xs font-medium px-2 py-1.5 text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors">
                Esc
              </button>
            </>
          )}
          {showImageInput && (
            <>
              <ImageIcon className="w-3.5 h-3.5 text-subtle shrink-0" />
              <input
                autoFocus
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyImage() } if (e.key === 'Escape') setShowImageInput(false) }}
                placeholder="https://example.com/imatge.jpg"
                className="flex-1 text-xs px-2 py-1.5 bg-transparent focus:outline-none text-text placeholder:text-subtle"
              />
              <button type="button" onMouseDown={preventBlur} onClick={applyImage} className="cursor-pointer text-xs font-semibold px-3 py-1.5 bg-accent text-on-accent rounded-md hover:bg-accent-hover transition-colors">
                Inserir
              </button>
              <button type="button" onMouseDown={preventBlur} onClick={() => setShowImageInput(false)} className="cursor-pointer text-xs font-medium px-2 py-1.5 text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors">
                Esc
              </button>
            </>
          )}
          {showVideoInput && (
            <>
              <Video className="w-3.5 h-3.5 text-subtle shrink-0" />
              <input
                autoFocus
                type="url"
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyVideo() } if (e.key === 'Escape') setShowVideoInput(false) }}
                placeholder="Enganxa una URL de YouTube o Vimeo"
                className="flex-1 text-xs px-2 py-1.5 bg-transparent focus:outline-none text-text placeholder:text-subtle"
              />
              <button type="button" onMouseDown={preventBlur} onClick={applyVideo} className="cursor-pointer text-xs font-semibold px-3 py-1.5 bg-accent text-on-accent rounded-md hover:bg-accent-hover transition-colors">
                Inserir
              </button>
              <button type="button" onMouseDown={preventBlur} onClick={() => setShowVideoInput(false)} className="cursor-pointer text-xs font-medium px-2 py-1.5 text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors">
                Esc
              </button>
            </>
          )}
        </div>
      )}

      {/* The canvas itself — full-bleed, no card border, no toolbar overhead. */}
      <EditorContent editor={editor} className={cn('carma-editor', focusMode && 'carma-focus-mode')} />
    </div>
  )
}
