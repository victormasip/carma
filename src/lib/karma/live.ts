// THE LIVE BALANCE — one number, two places on screen.
//
// THE BUG IT EXISTS FOR
// ─────────────────────
// Founder QA, 2026-09-18: "when claiming points from the sidebar, the balance
// does not update instantly". Half the optimistic UI was already there and
// working — /dashboard/karma paints the claim before it lands and counts the
// number up (see KarmaClient) — but the PUNTS WIDGET IN THE SIDEBAR is rendered
// by the (app) layout from a server read, so it kept showing the old figure
// until something happened to re-render the layout. The one number the owner is
// watching while they claim lived in the one component that could not hear about
// it, and you cannot win an argument about whether a claim felt instant while
// the sidebar still says 100.
//
// WHY A MODULE STORE AND NOT A CONTEXT
// ────────────────────────────────────
// The sidebar and the page are siblings under a SERVER layout, so a provider
// would mean a new client component wrapping the whole dashboard just to carry
// an integer. `useSyncExternalStore` over a module-level store crosses the same
// gap with no provider, no re-render of the tree, and no `'use client'` creeping
// up the layout — the same shape lib/onboarding/glimpse already uses.
//
// WHY IT CANNOT GO STALE
// ──────────────────────
// An override that simply wins forever would be a lie the moment points are
// spent somewhere else (an article drafted in another tab, say): the server
// would know the new balance and the widget would keep painting our old guess.
// So every publish records the SERVER figure it was taken against, and the
// widget only trusts the override while the server is still saying that same
// thing. The instant a fresh server render disagrees, the server wins and the
// override is ignored — no clearing, no races, no cache to invalidate.

/** A balance published by a client that just changed it. */
export type LiveBalance = {
  /** The new balance to show. `null` = unlimited (superadmin). */
  balance: number | null
  /**
   * The server-rendered balance this override was computed FROM. While the
   * widget's own server prop still equals this, the override is newer than the
   * server and wins; once it differs, the server has moved on and wins instead.
   */
  base: number | null
}

// A single mutable reference. `getSnapshot` MUST return the same object until it
// genuinely changes, or useSyncExternalStore re-renders forever.
let current: LiveBalance | null = null
const listeners = new Set<() => void>()

/** Tell every mounted balance indicator what the number is now. */
export function publishKarmaBalance(next: LiveBalance): void {
  if (current && current.balance === next.balance && current.base === next.base) return
  current = next
  for (const l of listeners) l()
}

export function subscribeKarmaBalance(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

export function karmaBalanceSnapshot(): LiveBalance | null {
  return current
}

/** No client has published anything during a server render, and saying so
 *  explicitly is what keeps hydration honest. */
export function karmaBalanceServerSnapshot(): LiveBalance | null {
  return null
}

/**
 * The balance to paint: the live one while it is still newer than the server's,
 * otherwise the server's. `serverBalance` is whatever the layout last rendered.
 */
export function resolveKarmaBalance(serverBalance: number | null, live: LiveBalance | null): number | null {
  return live && live.base === serverBalance ? live.balance : serverBalance
}
