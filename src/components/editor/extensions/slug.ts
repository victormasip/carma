// Shared, deterministic heading slug — used by the heading id extension AND the
// table-of-contents so anchors always match between an `<h*>` and its TOC link.
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'seccio'
  )
}
