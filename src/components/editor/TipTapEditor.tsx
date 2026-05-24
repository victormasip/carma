'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useEffect, useState } from 'react'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Link2, ImageIcon,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Minus,
  Undo2, Redo2, Link2Off,
} from 'lucide-react'

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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
    ],
    content: initialHtml || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    if (editor && initialHtml && editor.isEmpty) {
      editor.commands.setContent(initialHtml)
    }
  }, [editor, initialHtml])

  if (!editor) return null

  const btn = (active: boolean) =>
    `p-2 rounded-lg transition-colors ${active ? 'bg-carma-100 text-carma-700' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`

  const applyLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    }
    setLinkUrl('')
    setShowLinkInput(false)
  }

  const applyImage = () => {
    if (imageUrl.trim()) {
      editor.chain().focus().setImage({ src: imageUrl.trim() }).run()
    }
    setImageUrl('')
    setShowImageInput(false)
  }

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden focus-within:border-carma-400 transition-colors bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-neutral-100 bg-neutral-50/60">
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} title="Desfer">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} title="Refer">
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))} title="Encapçalament 1">
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))} title="Encapçalament 2">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))} title="Encapçalament 3">
          <Heading3 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Negreta">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Cursiva">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))} title="Subratllat">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))} title="Barrat">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive('code'))} title="Codi en línia">
          <Code className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Llista">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Llista numerada">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))} title="Cita">
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))} title="Bloc de codi">
          <Code className="w-3.5 h-3.5" /><span className="text-[9px] font-bold leading-none">{'{ }'}</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Separador">
          <Minus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        <button
          type="button"
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run()
            } else {
              setLinkUrl(editor.getAttributes('link').href ?? '')
              setShowLinkInput(v => !v)
              setShowImageInput(false)
            }
          }}
          className={btn(editor.isActive('link'))}
          title="Enllaç"
        >
          {editor.isActive('link') ? <Link2Off className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => { setShowImageInput(v => !v); setShowLinkInput(false) }}
          className={btn(showImageInput)}
          title="Imatge per URL"
        >
          <ImageIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 bg-blue-50/40">
          <input
            autoFocus
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } if (e.key === 'Escape') setShowLinkInput(false) }}
            placeholder="https://example.com"
            className="flex-1 text-xs px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 bg-white"
          />
          <button type="button" onClick={applyLink} className="text-xs font-bold px-3 py-1.5 bg-carma-500 text-white rounded-lg hover:bg-carma-600 transition-colors">
            Aplicar
          </button>
          <button type="button" onClick={() => setShowLinkInput(false)} className="text-xs font-bold px-3 py-1.5 text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">
            Cancel·lar
          </button>
        </div>
      )}

      {/* Inline image URL input */}
      {showImageInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 bg-blue-50/40">
          <input
            autoFocus
            type="url"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyImage() } if (e.key === 'Escape') setShowImageInput(false) }}
            placeholder="https://example.com/imatge.jpg"
            className="flex-1 text-xs px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 bg-white"
          />
          <button type="button" onClick={applyImage} className="text-xs font-bold px-3 py-1.5 bg-carma-500 text-white rounded-lg hover:bg-carma-600 transition-colors">
            Inserir
          </button>
          <button type="button" onClick={() => setShowImageInput(false)} className="text-xs font-bold px-3 py-1.5 text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">
            Cancel·lar
          </button>
        </div>
      )}

      {/* Editor content */}
      <div className="relative min-h-[320px]">
        {editor.isEmpty && placeholder && (
          <p className="absolute top-4 left-5 text-sm text-neutral-400 pointer-events-none select-none">{placeholder}</p>
        )}
        <EditorContent
          editor={editor}
          className="carma-editor px-5 py-4"
        />
      </div>
    </div>
  )
}
