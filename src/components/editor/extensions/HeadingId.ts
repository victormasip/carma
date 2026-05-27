import Heading from '@tiptap/extension-heading'
import { mergeAttributes } from '@tiptap/core'
import { slugify } from './slug'

/**
 * Heading that serializes a stable, text-derived `id` (e.g. `<h2 id="el-meu-titol">`)
 * so the Table of Contents can anchor to it on the public blog. Replaces the
 * StarterKit heading (configure `heading: false`).
 */
export const HeadingId = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level: number = node.attrs.level && this.options.levels.includes(node.attrs.level)
      ? node.attrs.level
      : this.options.levels[0]
    const id = slugify(node.textContent || '')
    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { id }), 0]
  },
})
