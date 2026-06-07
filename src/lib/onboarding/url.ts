// Pure URL helpers shared by the onboarding funnel (landing modal, registration,
// the /benvinguda provisioning hub, and the server action). Kept out of the
// 'use server' module so synchronous functions can be imported anywhere.

export function normalizeUrl(raw: string): string {
  const v = (raw || '').trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

export function displayUrl(raw: string): string {
  return (raw || '').replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/**
 * Derive a friendly site name from a URL host (or a fallback). Used to seed the
 * first site during self-serve onboarding so the dashboard isn't "Untitled".
 *   https://www.la-vinya-petita.cat/blog → "La Vinya Petita"
 */
export function siteNameFromUrl(raw: string): string {
  try {
    const host = new URL(normalizeUrl(raw)).hostname
    const core = host.replace(/^www\./, '').split('.')[0] || host
    return (
      core
        .split(/[-_]/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
        .trim() || 'El meu blog'
    )
  } catch {
    return 'El meu blog'
  }
}
