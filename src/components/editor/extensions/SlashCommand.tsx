'use client'

import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { computePosition, flip, shift, offset } from '@floating-ui/dom'
import {
  forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
  type ComponentType,
} from 'react'
import {
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Minus,
  ImageIcon, Images, Info, Pilcrow, Columns2, CircleCheck, TriangleAlert,
  ListTree, ChevronRight, MousePointerClick,
  type LucideProps,
} from 'lucide-react'
import type { CalloutVariant } from './Callout'

type RunCtx = { editor: Editor; range: Range }
type CommandItem = {
  title: string
  subtitle: string
  icon: ComponentType<LucideProps>
  terms: string[]
  run: (ctx: RunCtx) => void
}

export type SlashCommandOptions = {
  /** Opens the editor's inline image-URL input (wired by TipTapEditor). */
  requestImage: () => void
}

function buildCommands(options: SlashCommandOptions): CommandItem[] {
  const callout = (variant: CalloutVariant): CommandItem['run'] =>
    ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout({ variant }).run()

  return [
    {
      title: 'Text', subtitle: 'Paràgraf normal', icon: Pilcrow, terms: ['text', 'paragraf', 'p', 'body'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      title: 'Títol 1', subtitle: 'Encapçalament gran', icon: Heading1, terms: ['h1', 'titol', 'heading'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      title: 'Títol 2', subtitle: 'Encapçalament de secció', icon: Heading2, terms: ['h2', 'titol', 'heading'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      title: 'Títol 3', subtitle: 'Subsecció', icon: Heading3, terms: ['h3', 'titol', 'heading'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      title: 'Llista', subtitle: 'Llista de punts', icon: List, terms: ['llista', 'bullet', 'ul'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: 'Llista numerada', subtitle: 'Llista ordenada', icon: ListOrdered, terms: ['numerada', 'ordered', 'ol', '1'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: 'Cita', subtitle: 'Bloc de citació', icon: Quote, terms: ['cita', 'quote', 'blockquote'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: '2 columnes', subtitle: 'Graella de dues columnes', icon: Columns2, terms: ['columnes', 'columns', 'grid', 'graella', '2'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setColumns().run(),
    },
    {
      title: 'Índex', subtitle: 'Taula de continguts automàtica', icon: ListTree, terms: ['index', 'toc', 'taula', 'continguts', 'sumari'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setToc().run(),
    },
    {
      title: 'Desplegable', subtitle: 'Bloc plegable (accordion)', icon: ChevronRight, terms: ['desplegable', 'toggle', 'accordion', 'plegable', 'detalls'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setToggleBlock().run(),
    },
    {
      title: 'Botó', subtitle: 'Botó de crida a l’acció (CTA)', icon: MousePointerClick, terms: ['boto', 'button', 'cta', 'enllac', 'accio'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCtaButton().run(),
    },
    {
      title: 'Targeta destacada', subtitle: 'Callout informatiu (blau)', icon: Info, terms: ['callout', 'destacat', 'targeta', 'card', 'info', 'avis'],
      run: callout('info'),
    },
    {
      title: 'Targeta d’èxit', subtitle: 'Callout verd', icon: CircleCheck, terms: ['callout', 'exit', 'success', 'verd', 'ok'],
      run: callout('success'),
    },
    {
      title: 'Targeta d’avís', subtitle: 'Callout groc', icon: TriangleAlert, terms: ['callout', 'avis', 'warning', 'groc', 'alerta'],
      run: callout('warning'),
    },
    {
      title: 'Galeria d’imatges', subtitle: 'Carrusel d’imatges amb fletxes', icon: Images, terms: ['galeria', 'gallery', 'imatges', 'carrusel', 'fotos'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setGallery().run(),
    },
    {
      title: 'Imatge', subtitle: 'Insereix una imatge per URL', icon: ImageIcon, terms: ['imatge', 'image', 'foto', 'img'],
      run: ({ editor, range }) => { editor.chain().focus().deleteRange(range).run(); options.requestImage() },
    },
    {
      title: 'Codi', subtitle: 'Bloc de codi', icon: Code, terms: ['codi', 'code', 'pre'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: 'Separador', subtitle: 'Línia divisòria', icon: Minus, terms: ['separador', 'divider', 'hr', 'linia'],
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
  ]
}

// ── The floating command palette ─────────────────────────────────────────────
type ListProps = {
  items: CommandItem[]
  command: (item: CommandItem) => void
}
export type SlashListRef = { onKeyDown: (e: KeyboardEvent) => boolean }

const SlashCommandList = forwardRef<SlashListRef, ListProps>(({ items, command }, ref) => {
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setActive(0), [items])

  useLayoutEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (e.key === 'ArrowUp') {
        setActive((a) => (a + items.length - 1) % items.length)
        return true
      }
      if (e.key === 'ArrowDown') {
        setActive((a) => (a + 1) % items.length)
        return true
      }
      if (e.key === 'Enter') {
        if (items[active]) command(items[active])
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div className="w-72 p-3 bg-white rounded-xl shadow-2xl ring-1 ring-neutral-200 text-xs font-semibold text-neutral-400">
        Cap bloc coincideix
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-72 max-h-80 overflow-y-auto p-1.5 bg-white rounded-xl shadow-2xl ring-1 ring-neutral-200"
    >
      <p className="px-2.5 pt-1 pb-1.5 text-xs font-bold uppercase tracking-widest text-neutral-300">Blocs bàsics</p>
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={item.title}
            data-idx={i}
            type="button"
            onMouseEnter={() => setActive(i)}
            onClick={() => command(item)}
            className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
              i === active ? 'bg-carma-50' : 'hover:bg-neutral-50'
            }`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
              i === active ? 'border-carma-200 bg-white text-carma-600' : 'border-neutral-200 bg-white text-neutral-500'
            }`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-neutral-800 truncate">{item.title}</span>
              <span className="block text-xs font-medium text-neutral-400 truncate">{item.subtitle}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
})
SlashCommandList.displayName = 'SlashCommandList'

// ── Extension ────────────────────────────────────────────────────────────────
function makeSuggestion(options: SlashCommandOptions): Omit<SuggestionOptions<CommandItem>, 'editor'> {
  return {
    char: '/',
    startOfLine: false,
    allowSpaces: false,
    items: ({ query }) => {
      const all = buildCommands(options)
      const q = query.toLowerCase().trim()
      if (!q) return all
      return all.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.terms.some((t) => t.includes(q)),
      )
    },
    command: ({ editor, range, props }) => props.run({ editor, range }),
    render: () => {
      let component: ReactRenderer<SlashListRef, ListProps> | null = null
      let el: HTMLElement | null = null

      const reposition = (clientRect?: (() => DOMRect | null) | null) => {
        if (!el || !clientRect) return
        const rect = clientRect()
        if (!rect) return
        const virtual = { getBoundingClientRect: () => rect }
        computePosition(virtual, el, {
          strategy: 'fixed',
          placement: 'bottom-start',
          middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          if (el) Object.assign(el.style, { left: `${x}px`, top: `${y}px` })
        })
      }

      return {
        onStart: (props) => {
          component = new ReactRenderer(SlashCommandList, {
            props: { items: props.items, command: (item: CommandItem) => props.command(item) },
            editor: props.editor,
          })
          el = document.createElement('div')
          el.style.position = 'fixed'
          el.style.top = '0'
          el.style.left = '0'
          el.style.zIndex = '60'
          el.appendChild(component.element)
          document.body.appendChild(el)
          reposition(props.clientRect)
        },
        onUpdate: (props) => {
          component?.updateProps({ items: props.items, command: (item: CommandItem) => props.command(item) })
          reposition(props.clientRect)
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            el?.remove()
            el = null
            return true
          }
          return component?.ref?.onKeyDown(props.event) ?? false
        },
        onExit: () => {
          component?.destroy()
          el?.remove()
          component = null
          el = null
        },
      }
    },
  }
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { requestImage: () => {} }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<CommandItem>({
        editor: this.editor,
        ...makeSuggestion(this.options),
      }),
    ]
  },
})
