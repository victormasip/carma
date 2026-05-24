// Strips content from scraped HTML fragments that could break the render
// page: scripts that try to manipulate the original site's DOM, SPA
// frameworks that hijack document.body, document.write() calls, etc.

/**
 * Remove all <script> and <noscript> tags (and their content).
 * Applied to every extracted HTML region before it is stored or rendered.
 */
export function stripScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '')
}

/**
 * Sanitize a structural fragment (header / footer HTML).
 * Strips scripts; keeps all HTML structure and inline styles intact
 * so the visual fidelity from CSS is preserved.
 */
export function sanitizeStructural(html: string): string {
  return stripScripts(html)
}

/**
 * Sanitize the extracted <head> fragment.
 * extractHead() already whitelists only meta/link/style, so scripts are
 * never present there. This is a defense-in-depth layer for old stored data.
 * Additionally strips:
 *   - <meta http-equiv="refresh">  → would navigate away from our page
 *   - <meta http-equiv="Content-Security-Policy"> → could block our inline styles
 *   - <base>  → would break relative-URL resolution in our own templates
 */
export function sanitizeHead(html: string): string {
  return stripScripts(html)
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*\/?>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*\/?>/gi, '')
    .replace(/<base\b[^>]*\/?>/gi, '')
}
