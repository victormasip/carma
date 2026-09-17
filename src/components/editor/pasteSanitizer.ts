// Paste sanitiser (Super MVP Fase 5).
//
// Pasting a draft out of Word, Google Docs or Notion is the single most common way
// a CMS article gets poisoned. The clipboard's `text/html` flavour carries:
//
//   · `<span style="font-family:Calibri;font-size:11pt;color:#1F1F1F">` wrapped
//     around every few words — which pins the article to the SOURCE document's
//     typography and colours, overriding the site's own tokens. On a Carma blog
//     that means a cloned WordPress header in the brand's font sitting above body
//     copy in Calibri black.
//   · `<o:p>`, `<w:*>`, `<!--[if gte mso 9]>` and `class="MsoNormal"` from Word.
//   · `<meta charset>` / `<style>` blocks Google Docs prepends.
//   · `id="docs-internal-guid-…"` anchors.
//   · `<b style="font-weight:normal">` — Docs' wrapper that LOOKS bold and isn't.
//
// TipTap's schema drops unknown NODES, but it keeps inline styles and classes on
// the ones it recognises, so none of the above is filtered by default.
//
// What survives: the structure (headings, lists, links, emphasis, tables, images)
// and nothing else. Semantics in, decoration out.

/** Inline styles that are never the writer's intent when pasted from a document. */
const STYLE_DROP = /^(font|color|background|line-height|letter-spacing|text-indent|mso-|margin|padding|width|height|border|vertical-align|white-space)/i

/** Attributes we never carry across from a foreign document. */
const ATTR_DROP = new Set(['class', 'id', 'style', 'lang', 'dir', 'align', 'width', 'height', 'bgcolor', 'face', 'size', 'color'])

/** Elements that carry no meaning once their styling is gone. */
const UNWRAP = new Set(['SPAN', 'FONT', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'CENTER'])

/** Elements removed outright, contents and all. */
const STRIP = new Set(['STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'HEAD', 'O:P', 'W:SDT', 'XML', 'COLGROUP', 'COL'])

/** Tags TipTap's schema understands and we want to keep. */
const KEEP = new Set([
  'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'CODE', 'PRE',
  'BLOCKQUOTE', 'A', 'IMG', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'FIGURE', 'FIGCAPTION',
])

/**
 * Keep only the inline styles that carry MEANING. A pasted `font-weight:700` on a
 * `<span>` is the document's way of saying bold, so it becomes `<strong>` rather
 * than being thrown away with the rest of the decoration.
 */
function meaningfulMarks(el: Element): { bold: boolean; italic: boolean; underline: boolean } {
  const style = el.getAttribute('style') ?? ''
  const weight = /font-weight\s*:\s*(\d+|bold)/i.exec(style)?.[1]
  const numeric = weight && /^\d+$/.test(weight) ? Number(weight) : weight === 'bold' ? 700 : 0
  return {
    // Google Docs wraps its whole payload in <b style="font-weight:normal">, so a
    // bare <b> is only honoured when the style does not contradict it.
    bold: numeric >= 600,
    italic: /font-style\s*:\s*italic/i.test(style),
    underline: /text-decoration[^;]*underline/i.test(style),
  }
}

function wrapWith(doc: Document, node: Node, tags: string[]): Node {
  return tags.reduce<Node>((inner, tag) => {
    const w = doc.createElement(tag)
    w.appendChild(inner)
    return w
  }, node)
}

/**
 * Clean a clipboard HTML payload down to structure. Pure and DOM-based, so it
 * runs in the browser only (the editor is a client component).
 */
export function sanitizePastedHtml(html: string): string {
  if (!html?.trim()) return ''

  // Word wraps chunks in downlevel-revealed conditional comments; strip before
  // parsing so their contents never enter the tree.
  const pre = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(o:p|w:[a-z]+|v:[a-z]+|m:[a-z]+)[^>]*>/gi, '')

  const doc = new DOMParser().parseFromString(pre, 'text/html')

  const walk = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Word/Docs pad with non-breaking spaces; they collapse wrong in prose.
      const text = (node.textContent ?? '').replace(/ /g, ' ')
      return text ? [doc.createTextNode(text)] : []
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []

    const el = node as Element
    const tag = el.tagName.toUpperCase()
    if (STRIP.has(tag)) return []

    const children = Array.from(el.childNodes).flatMap(walk)

    if (UNWRAP.has(tag)) {
      // A styled span may still be saying "bold"/"italic" — preserve that meaning
      // and discard the rest of the decoration.
      const { bold, italic, underline } = meaningfulMarks(el)
      const marks = [bold && 'strong', italic && 'em', underline && 'u'].filter(Boolean) as string[]
      if (marks.length && children.length) {
        const frag = doc.createDocumentFragment()
        children.forEach(c => frag.appendChild(c))
        return [wrapWith(doc, frag, marks)]
      }
      // A DIV that held block content becomes a paragraph break, not a silent join.
      if (tag === 'DIV' && children.some(c => c.nodeType === Node.ELEMENT_NODE)) return children
      return children
    }

    if (!KEEP.has(tag)) return children

    // Google Docs' <b style="font-weight:normal"> outer wrapper: not bold at all.
    if ((tag === 'B' || tag === 'STRONG') && /font-weight\s*:\s*(normal|400)/i.test(el.getAttribute('style') ?? '')) {
      return children
    }

    const clean = doc.createElement(tag.toLowerCase())
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name.startsWith('data-') || name.startsWith('aria-')) continue
      if (ATTR_DROP.has(name)) continue
      // href/src/alt/title/colspan/rowspan survive — they're content, not styling.
      if (name === 'href' && /^\s*javascript:/i.test(attr.value)) continue
      clean.setAttribute(name, attr.value)
    }
    // Re-apply only the handful of styles worth keeping (text-align on a block).
    const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(el.getAttribute('style') ?? '')?.[1]
    if (align && /^(P|H[1-6]|TD|TH|BLOCKQUOTE)$/.test(tag)) clean.setAttribute('style', `text-align:${align.toLowerCase()}`)

    children.forEach(c => clean.appendChild(c))
    if (!clean.textContent?.trim() && !['BR', 'HR', 'IMG', 'TD', 'TH'].includes(tag)) return []
    return [clean]
  }

  const out = doc.createElement('div')
  Array.from(doc.body.childNodes).flatMap(walk).forEach(n => out.appendChild(n))
  void STYLE_DROP // documented above; the allow-list above is what enforces it
  return out.innerHTML.trim()
}

/**
 * True when a clipboard payload looks like it came from a word processor and is
 * worth sanitising. A paste from within Carma (or any clean HTML) is left alone,
 * so copy/paste inside the editor keeps working exactly as before.
 */
export function looksLikeDocumentPaste(html: string): boolean {
  if (!html) return false
  return (
    /class\s*=\s*"?Mso/i.test(html) ||
    /<o:p|<w:|urn:schemas-microsoft-com/i.test(html) ||
    /docs-internal-guid/i.test(html) ||
    /<meta\s+charset|<style[^>]*>/i.test(html) ||
    // A dense run of inline font/colour styling is the Docs/Word signature.
    (html.match(/style="[^"]*font-(family|size)/gi)?.length ?? 0) >= 3
  )
}
