'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Eye, EyeOff, Loader2, Tag, X, ImageIcon,
  ChevronDown, ChevronUp, User, FileText, Globe,
} from 'lucide-react'
import TipTapEditor from './TipTapEditor'
import { createPost, updatePost, type PostData } from '@/lib/actions/posts'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

type Post = {
  id: string
  title: string
  slug: string
  content: { html?: string } | Record<string, unknown>
  excerpt?: string | null
  featured_image?: string | null
  categories?: string[]
  tags?: string[]
  seo_title?: string | null
  seo_description?: string | null
  author_name?: string | null
  is_published: boolean
}

type Props = {
  siteId: string
  siteName: string
  post?: Post
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100) || 'article'
}

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (vals: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const trimmed = input.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInput('')
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest pl-1">{label}</label>
      <div className="flex flex-wrap gap-1.5 p-2 border border-neutral-200 rounded-xl bg-neutral-50/50 min-h-[44px] focus-within:border-carma-400 focus-within:bg-white transition-colors">
        {values.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-carma-100 text-carma-700 rounded-lg text-xs font-semibold">
            {tag}
            <button type="button" onClick={() => onChange(values.filter(t => t !== tag))} className="cursor-pointer hover:text-red-600 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
            if (e.key === 'Backspace' && !input && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={addTag}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-xs font-medium outline-none placeholder:text-neutral-400"
        />
      </div>
    </div>
  )
}

export default function PostEditorClient({ siteId, siteName, post }: Props) {
  const isNew = !post
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(post?.title ?? '')
  const [slug, setSlug] = useState(post?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [contentHtml, setContentHtml] = useState(
    typeof post?.content === 'object' && post.content !== null && 'html' in post.content
      ? (post.content as { html: string }).html
      : ''
  )
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '')
  const [featuredImage, setFeaturedImage] = useState(post?.featured_image ?? '')
  const [categories, setCategories] = useState<string[]>(post?.categories ?? [])
  const [tags, setTags] = useState<string[]>(post?.tags ?? [])
  const [seoTitle, setSeoTitle] = useState(post?.seo_title ?? '')
  const [seoDescription, setSeoDescription] = useState(post?.seo_description ?? '')
  const [authorName, setAuthorName] = useState(post?.author_name ?? '')
  const [isPublished, setIsPublished] = useState(post?.is_published ?? false)
  const [showSeo, setShowSeo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (!slugTouched) setSlug(generateSlug(val))
  }

  const handleContentChange = useCallback((html: string) => {
    setContentHtml(html)
  }, [])

  const buildData = (): PostData => ({
    title,
    slug,
    content: { html: contentHtml },
    excerpt: excerpt || undefined,
    featured_image: featuredImage || undefined,
    categories,
    tags,
    seo_title: seoTitle || undefined,
    seo_description: seoDescription || undefined,
    author_name: authorName || undefined,
    is_published: isPublished,
  })

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const data = buildData()
      let result: { error?: string; id?: string }

      if (isNew) {
        result = await createPost(siteId, data)
      } else {
        result = await updatePost(post.id, siteId, data)
      }

      if (result.error) {
        setError(result.error)
        return
      }

      toast(isNew ? `Article creat${isPublished ? ' i publicat' : ' com a esborrany'}` : 'Article desat correctament', 'success')
      router.push(`/dashboard/sites/${siteId}`)
    })
  }

  const fieldClass = "w-full px-4 py-3 bg-neutral-50/50 border border-neutral-200/80 rounded-xl focus:outline-none focus:border-carma-400 focus:bg-white text-sm font-medium transition-all"
  const labelClass = "block text-[11px] font-bold text-neutral-400 uppercase tracking-widest pl-1 mb-1.5"

  return (
    <div className="fixed inset-0 z-20 overflow-auto bg-[#F9F8F6]">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/dashboard/sites/${siteId}`}
              className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-1.5 text-sm text-neutral-500 min-w-0">
              <span className="truncate font-medium">{siteName}</span>
              <span className="text-neutral-300">/</span>
              <span className="font-semibold text-neutral-900 truncate">
                {isNew ? 'Nou article' : (title || 'Editar article')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${isPublished ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
              {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {isPublished ? 'Publicat' : 'Esborrany'}
            </span>

            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !title.trim()}
              className="cursor-pointer flex items-center gap-2 px-4 py-1.5 bg-carma-500 hover:bg-carma-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Desar
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8 items-start">

        {/* Left: content */}
        <div className="flex-1 min-w-0 space-y-5">
          {error && (
            <div className="p-3 text-sm rounded-xl bg-red-50 border border-red-100 text-red-600 font-medium">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className={labelClass}>Títol</label>
            <input
              type="text"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="El títol del teu article..."
              className="w-full px-0 py-2 bg-transparent border-0 border-b border-neutral-200 focus:outline-none focus:border-carma-400 text-2xl font-extrabold text-neutral-900 placeholder:text-neutral-300 transition-colors"
            />
          </div>

          {/* Slug */}
          <div>
            <label className={labelClass}>Slug (URL)</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400 font-mono shrink-0">/</span>
              <input
                type="text"
                value={slug}
                onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')) }}
                className="flex-1 px-3 py-2 bg-neutral-50/50 border border-neutral-200 rounded-lg focus:outline-none focus:border-carma-400 focus:bg-white text-xs font-mono transition-all"
                placeholder="el-teu-article"
              />
            </div>
          </div>

          {/* TipTap content */}
          <div>
            <label className={labelClass}>Contingut</label>
            <TipTapEditor
              initialHtml={contentHtml}
              onChange={handleContentChange}
              placeholder="Comença a escriure el contingut del teu article..."
            />
          </div>
        </div>

        {/* Right: meta sidebar */}
        <div className="w-72 shrink-0 space-y-4">

          {/* Publish state card */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Publicació</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublished(false)}
                className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-bold transition-all ${!isPublished ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:border-neutral-300'}`}
              >
                <EyeOff className="w-4 h-4" />
                Esborrany
              </button>
              <button
                type="button"
                onClick={() => setIsPublished(true)}
                className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-bold transition-all ${isPublished ? 'bg-green-600 text-white border-green-600' : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:border-neutral-300'}`}
              >
                <Eye className="w-4 h-4" />
                Publicat
              </button>
            </div>
          </div>

          {/* Featured image */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Imatge destacada</p>
            </div>
            {featuredImage && (
              <div className="relative rounded-xl overflow-hidden aspect-video bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={featuredImage} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <input
              type="url"
              value={featuredImage}
              onChange={e => setFeaturedImage(e.target.value)}
              placeholder="https://example.com/imatge.jpg"
              className={fieldClass + ' text-xs'}
            />
          </div>

          {/* Excerpt */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-neutral-400" />
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Extracte</p>
            </div>
            <textarea
              value={excerpt}
              onChange={e => setExcerpt(e.target.value)}
              rows={3}
              placeholder="Breu descripció de l'article..."
              className={fieldClass + ' resize-none text-xs'}
            />
          </div>

          {/* Author */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-neutral-400" />
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Autor</p>
            </div>
            <input
              type="text"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              placeholder="Nom de l'autor"
              className={fieldClass + ' text-xs'}
            />
          </div>

          {/* Categories & Tags */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-neutral-400" />
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Categories i Etiquetes</p>
            </div>
            <TagInput label="Categories" values={categories} onChange={setCategories} placeholder="Afegeix una categoria..." />
            <TagInput label="Etiquetes" values={tags} onChange={setTags} placeholder="Afegeix una etiqueta..." />
          </div>

          {/* SEO */}
          <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setShowSeo(v => !v)}
              className="cursor-pointer w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">SEO</span>
              </div>
              {showSeo ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
            </button>

            {showSeo && (
              <div className="px-5 pb-5 space-y-3 border-t border-neutral-100">
                <div className="pt-3">
                  <label className={labelClass}>Títol SEO</label>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={e => setSeoTitle(e.target.value)}
                    placeholder={title || 'Títol per a cercadors'}
                    maxLength={60}
                    className={fieldClass + ' text-xs'}
                  />
                  <p className="text-[10px] text-neutral-400 mt-1 pl-1">{seoTitle.length}/60</p>
                </div>
                <div>
                  <label className={labelClass}>Descripció SEO</label>
                  <textarea
                    value={seoDescription}
                    onChange={e => setSeoDescription(e.target.value)}
                    rows={3}
                    placeholder={excerpt || 'Descripció per a cercadors'}
                    maxLength={160}
                    className={fieldClass + ' resize-none text-xs'}
                  />
                  <p className="text-[10px] text-neutral-400 mt-1 pl-1">{seoDescription.length}/160</p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
