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
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { Placeholder } from '@tiptap/extensions'
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Link2, Link2Off,
  Heading2, Heading3, Heading1, List, ListOrdered, Quote, Code, Minus,
  ImageIcon, Plus, Info, Images, Columns2,
} from 'lucide-react'
import { Callout } from './extensions/Callout'
import { Gallery } from './extensions/Gallery'
import { Figure } from './extensions/Figure'
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

type Props = {
  initialHtml?: string
  onChange: (html: string) => void
  placeholder?: string
  siteId: string
}

export default function TipTapEditor({ initialHtml = '', onChange, placeholder, siteId }: Props) {
  const { toast } = useToast()
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showImageInput, setShowImageInput] = useState(false)
  const editorRef = useRef<Editor | null>(null)

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
      Figure,
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
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    editorRef.current = editor
    if (editor && initialHtml && editor.isEmpty) {
      editor.commands.setContent(initialHtml)
    }
  }, [editor, initialHtml])

  if (!editor) return null

  // Bubble-menu button on the dark floating pill.
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
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={bbtn(editor.isActive('bold'))} title="Negreta (Ctrl/⌘+B)">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={bbtn(editor.isActive('italic'))} title="Cursiva (Ctrl/⌘+I)">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={bbtn(editor.isActive('underline'))} title="Subratllat (Ctrl/⌘+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={bbtn(editor.isActive('strike'))} title="Barrat">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={bbtn(editor.isActive('code'))} title="Codi">
          <Code className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-white/15 mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={bbtn(editor.isActive('heading', { level: 1 }))} title="Títol gran">
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={bbtn(editor.isActive('heading', { level: 2 }))} title="Títol">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={bbtn(editor.isActive('heading', { level: 3 }))} title="Subtítol">
          <Heading3 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={bbtn(editor.isActive('blockquote'))} title="Cita">
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={openLinkInput} className={bbtn(editor.isActive('link'))} title="Enllaç (Ctrl/⌘+K)">
          {editor.isActive('link') ? <Link2Off className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        </button>
      </BubbleMenu>

      {/* Floating insert menu on empty paragraphs */}
      <FloatingMenu
        editor={editor}
        className="w-48 p-1.5 bg-bg-elevated rounded-xl shadow-pop ring-1 ring-border"
        options={{ placement: 'left-start' }}
      >
        <p className="px-3 pt-1 pb-1.5 text-xs font-bold uppercase tracking-widest text-subtle flex items-center gap-1">
          <Plus className="w-3 h-3" /> Inserir · prem <kbd className="px-1 py-0.5 bg-surface-subtle rounded text-subtle not-italic font-mono">/</kbd>
        </p>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={fbtn}>
          <Heading1 className="w-3.5 h-3.5 text-subtle" /> Títol gran
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={fbtn}>
          <Heading2 className="w-3.5 h-3.5 text-subtle" /> Títol
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={fbtn}>
          <List className="w-3.5 h-3.5 text-subtle" /> Llista
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={fbtn}>
          <ListOrdered className="w-3.5 h-3.5 text-subtle" /> Llista numerada
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={fbtn}>
          <Quote className="w-3.5 h-3.5 text-subtle" /> Cita
        </button>
        <button type="button" onClick={() => { setShowImageInput(true); setShowLinkInput(false) }} className={fbtn}>
          <ImageIcon className="w-3.5 h-3.5 text-subtle" /> Imatge
        </button>
        <button type="button" onClick={() => editor.chain().focus().setCallout({ variant: 'info' }).run()} className={fbtn}>
          <Info className="w-3.5 h-3.5 text-subtle" /> Targeta destacada
        </button>
        <button type="button" onClick={() => editor.chain().focus().setGallery().run()} className={fbtn}>
          <Images className="w-3.5 h-3.5 text-subtle" /> Galeria
        </button>
        <button type="button" onClick={() => editor.chain().focus().setColumns().run()} className={fbtn}>
          <Columns2 className="w-3.5 h-3.5 text-subtle" /> 2 columnes
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={fbtn}>
          <Minus className="w-3.5 h-3.5 text-subtle" /> Separador
        </button>
      </FloatingMenu>

      {/* Tiny inline link/image inputs — anchored above the canvas, only when triggered */}
      {(showLinkInput || showImageInput) && (
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
              <button type="button" onClick={applyLink} className="cursor-pointer text-xs font-semibold px-3 py-1.5 bg-accent text-on-accent rounded-md hover:bg-accent-hover transition-colors">
                Aplicar
              </button>
              <button type="button" onClick={() => setShowLinkInput(false)} className="cursor-pointer text-xs font-medium px-2 py-1.5 text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors">
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
              <button type="button" onClick={applyImage} className="cursor-pointer text-xs font-semibold px-3 py-1.5 bg-accent text-on-accent rounded-md hover:bg-accent-hover transition-colors">
                Inserir
              </button>
              <button type="button" onClick={() => setShowImageInput(false)} className="cursor-pointer text-xs font-medium px-2 py-1.5 text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors">
                Esc
              </button>
            </>
          )}
        </div>
      )}

      {/* The canvas itself — full-bleed, no card border, no toolbar overhead. */}
      <EditorContent editor={editor} className="carma-editor" />
    </div>
  )
}
