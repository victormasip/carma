// Makes a rendered preview inert.
//
// Every link and form in a public preview is cancelled in the capture phase: no
// navigating into /render/preview/* (which would 404), and no leaving for the
// client's real site from inside our frame. Shared by the clone preview and the
// Door's design preview (W5).

import { createHash } from 'node:crypto'

export const PREVIEW_CLICK_BLOCKER =
  `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(a){e.preventDefault();e.stopPropagation();}},true);document.addEventListener('submit',function(e){e.preventDefault();},true);</script>`

/**
 * The CSP source-expression of every inline script that executes in `html`.
 * Data blocks (JSON-LD) never execute and need none; the renderer emits no
 * external scripts. A browser hashes a script's text exactly as written, which is
 * what this reads. Used by the Door's preview (W6), whose CSP allows exactly the
 * scripts a page WITHOUT the captured chrome runs.
 */
export function scriptHashes(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1] ?? '')?.[1] ?? '').toLowerCase()
    if (type && !/javascript|module/.test(type)) continue
    out.add(`'sha256-${createHash('sha256').update(m[2] ?? '', 'utf8').digest('base64')}'`)
  }
  return [...out]
}

export function guardPreview(html: string): string {
  return html.includes('</body>')
    ? html.replace('</body>', `${PREVIEW_CLICK_BLOCKER}</body>`)
    : html + PREVIEW_CLICK_BLOCKER
}
