'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { Placeholder } from '@tiptap/extensions'
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Link2, ImageIcon,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Minus,
  Undo2, Redo2, Link2Off, Plus, Info, Images, Columns2,
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

// Insert dropped/pasted image files into the editor as data-URL figures.
function insertImageFiles(editor: Editor, files: FileList | File[]): boolean {
  const images = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (images.length === 0) return false
  images.forEach(file => {
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result
      if (typeof src === 'string') editor.chain().focus().setFigure({ src }).run()
    }
    reader.readAsDataURL(file)
  })
  return true
}

type Props = {
  initialHtml?: string
  onChange: (html: string) => void
  placeholder?: string
}

export default function TipTapEditor({ initialHtml = '', onChange, placeholder }: Props) {
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
          // Only prompt on plain paragraphs — never on figures/galleries/columns,
          // which have their own affordances (e.g. the figure caption field).
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
      Gallery,
      SlashCommand.configure({
        requestImage: () => { setShowImageInput(true); setShowLinkInput(false) },
      }),
    ],
    content: initialHtml || '',
    editorProps: {
      attributes: { class: 'carma-prose focus:outline-none' },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files
        if (files && files.length > 0 && editorRef.current && insertImageFiles(editorRef.current, files)) {
          event.preventDefault()
          return true
        }
        return false
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files
        if (files && files.length > 0 && editorRef.current && insertImageFiles(editorRef.current, files)) {
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

  const tbtn = (active: boolean) =>
    `cursor-pointer p-2 rounded-lg transition-colors ${active ? 'bg-carma-100 text-carma-700' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`

  // Bubble-menu button (on the dark floating pill).
  const bbtn = (active: boolean) =>
    `cursor-pointer flex items-center justify-center w-8 h-8 rounded-md transition-colors ${active ? 'bg-carma-500 text-white' : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'}`

  // Floating insert-menu button (on empty lines).
  const fbtn = 'cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:bg-carma-50 hover:text-carma-700 transition-colors'

  const applyLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    }
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
    if (imageUrl.trim()) {
      editor.chain().focus().setFigure({ src: imageUrl.trim() }).run()
    }
    setImageUrl('')
    setShowImageInput(false)
  }

  return (
    <div className="relative border border-neutral-200 rounded-2xl focus-within:border-carma-300 focus-within:shadow-[0_0_0_4px_rgba(212,175,55,0.08)] transition-all bg-white">
      {/* Slim, sticky toolbar — solid bg + rounded top so it never bleeds over text */}
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-neutral-200 bg-white rounded-t-2xl shadow-[0_1px_0_rgba(0,0,0,0.02)]">
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={tbtn(false)} title="Desfer">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={tbtn(false)} title="Refer">
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={tbtn(editor.isActive('heading', { level: 1 }))} title="Encapçalament 1">
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={tbtn(editor.isActive('heading', { level: 2 }))} title="Encapçalament 2">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={tbtn(editor.isActive('heading', { level: 3 }))} title="Encapçalament 3">
          <Heading3 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={tbtn(editor.isActive('bold'))} title="Negreta">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={tbtn(editor.isActive('italic'))} title="Cursiva">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={tbtn(editor.isActive('underline'))} title="Subratllat">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={tbtn(editor.isActive('strike'))} title="Barrat">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={tbtn(editor.isActive('code'))} title="Codi en línia">
          <Code className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={tbtn(editor.isActive('bulletList'))} title="Llista">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={tbtn(editor.isActive('orderedList'))} title="Llista numerada">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={tbtn(editor.isActive('blockquote'))} title="Cita">
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={tbtn(false)} title="Separador">
          <Minus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button type="button" onClick={openLinkInput} className={tbtn(editor.isActive('link'))} title="Enllaç">
          {editor.isActive('link') ? <Link2Off className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => { setShowImageInput(v => !v); setShowLinkInput(false) }}
          className={tbtn(showImageInput)}
          title="Imatge per URL"
        >
          <ImageIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 bg-carma-50/40">
          <input
            autoFocus
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } if (e.key === 'Escape') setShowLinkInput(false) }}
            placeholder="https://example.com"
            className="flex-1 text-xs px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 bg-white"
          />
          <button type="button" onClick={applyLink} className="cursor-pointer text-xs font-bold px-3 py-1.5 bg-carma-500 text-white rounded-lg hover:bg-carma-600 transition-colors">
            Aplicar
          </button>
          <button type="button" onClick={() => setShowLinkInput(false)} className="cursor-pointer text-xs font-bold px-3 py-1.5 text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">
            Cancel·lar
          </button>
        </div>
      )}

      {/* Inline image URL input */}
      {showImageInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 bg-carma-50/40">
          <input
            autoFocus
            type="url"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyImage() } if (e.key === 'Escape') setShowImageInput(false) }}
            placeholder="https://example.com/imatge.jpg"
            className="flex-1 text-xs px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 bg-white"
          />
          <button type="button" onClick={applyImage} className="cursor-pointer text-xs font-bold px-3 py-1.5 bg-carma-500 text-white rounded-lg hover:bg-carma-600 transition-colors">
            Inserir
          </button>
          <button type="button" onClick={() => setShowImageInput(false)} className="cursor-pointer text-xs font-bold px-3 py-1.5 text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">
            Cancel·lar
          </button>
        </div>
      )}

      {/* Floating format menu — appears over a text selection (Medium-style) */}
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 p-1 bg-neutral-900 rounded-xl shadow-2xl shadow-black/30 ring-1 ring-white/10"
        options={{ placement: 'top' }}
        shouldShow={({ editor, state }) => {
          const { empty } = state.selection
          return !empty && editor.isEditable && !editor.isActive('figure')
        }}
      >
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={bbtn(editor.isActive('bold'))} title="Negreta">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={bbtn(editor.isActive('italic'))} title="Cursiva">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={bbtn(editor.isActive('underline'))} title="Subratllat">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={bbtn(editor.isActive('strike'))} title="Barrat">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={bbtn(editor.isActive('code'))} title="Codi">
          <Code className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-white/15 mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={bbtn(editor.isActive('heading', { level: 2 }))} title="Títol">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={bbtn(editor.isActive('heading', { level: 3 }))} title="Subtítol">
          <Heading3 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={bbtn(editor.isActive('blockquote'))} title="Cita">
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={openLinkInput} className={bbtn(editor.isActive('link'))} title="Enllaç">
          <Link2 className="w-3.5 h-3.5" />
        </button>
      </BubbleMenu>

      {/* Floating insert menu — appears at the start of an empty line */}
      <FloatingMenu
        editor={editor}
        className="w-44 p-1.5 bg-white rounded-xl shadow-xl ring-1 ring-neutral-200"
        options={{ placement: 'left-start' }}
      >
        <p className="px-3 pt-1 pb-1.5 text-xs font-bold uppercase tracking-widest text-neutral-300 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Inserir · prem <kbd className="px-1 py-0.5 bg-neutral-100 rounded text-neutral-400 not-italic font-mono">/</kbd>
        </p>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={fbtn}>
          <Heading1 className="w-3.5 h-3.5 text-neutral-400" /> Títol gran
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={fbtn}>
          <Heading2 className="w-3.5 h-3.5 text-neutral-400" /> Títol
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={fbtn}>
          <List className="w-3.5 h-3.5 text-neutral-400" /> Llista
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={fbtn}>
          <ListOrdered className="w-3.5 h-3.5 text-neutral-400" /> Llista numerada
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={fbtn}>
          <Quote className="w-3.5 h-3.5 text-neutral-400" /> Cita
        </button>
        <button type="button" onClick={() => { setShowImageInput(true); setShowLinkInput(false) }} className={fbtn}>
          <ImageIcon className="w-3.5 h-3.5 text-neutral-400" /> Imatge
        </button>
        <button type="button" onClick={() => editor.chain().focus().setCallout({ variant: 'info' }).run()} className={fbtn}>
          <Info className="w-3.5 h-3.5 text-neutral-400" /> Targeta destacada
        </button>
        <button type="button" onClick={() => editor.chain().focus().setGallery().run()} className={fbtn}>
          <Images className="w-3.5 h-3.5 text-neutral-400" /> Galeria d&apos;imatges
        </button>
        <button type="button" onClick={() => editor.chain().focus().setColumns().run()} className={fbtn}>
          <Columns2 className="w-3.5 h-3.5 text-neutral-400" /> 2 columnes
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={fbtn}>
          <Minus className="w-3.5 h-3.5 text-neutral-400" /> Separador
        </button>
      </FloatingMenu>

      {/* Editor content (placeholder handled by the Placeholder extension) */}
      <div className="relative">
        <EditorContent
          editor={editor}
          className="carma-editor px-6 sm:px-10 py-6"
        />
      </div>
    </div>
  )
}
