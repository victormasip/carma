// Per-viewer dismissals of the site page's two nudges, kept in COOKIES (W1).
//
// They used to live in localStorage, which a server render cannot read: the page
// was rendered without the nudge, then the client added it after hydration and
// pushed the whole workspace down — CLS 0.24 on the Articles tab and 0.27 on Resum,
// measured with Lighthouse on the local replica. A cookie lets the server render
// the page the visitor will keep. Imported by the page (names) and by the client
// components (names + writer); nothing here touches anything server-only.

/** "Vols escriure per WhatsApp?" — one dismissal for the whole account on this browser. */
export const WA_BANNER_COOKIE = 'carma_wa_banner_off'

/** The WordPress moment — per site. */
export const wpDiscoveryCookie = (siteId: string) => `carma_wpd_${siteId}`

/** Remember a dismissal for a year. Never throws (a blocked cookie just means it returns). */
export function rememberDismissal(name: string): void {
  try { document.cookie = `${name}=1; Path=/; Max-Age=31536000; SameSite=Lax` } catch { /* cookies blocked */ }
}
