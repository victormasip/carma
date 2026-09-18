// WHERE THE AUTH SURFACE SENDS SOMEONE NEXT.
//
// Two callers need this answer and they live on opposite sides of the network:
// the server gate on /login and /registre (which redirects an already-signed-in
// visitor before a single byte of form is rendered) and AuthPanel itself (which
// navigates after a successful submit, and can switch mode without navigating).
// One pure function, so the two can never disagree about where the funnel goes.
//
// THE RULES, AND WHY THEY ARE THE SHAPE THEY ARE
//
//   · A clone URL in `?url=` means the visitor came through the Door with a
//     website they want cloned. BOTH register and login must continue to the
//     provisioning hub — otherwise toggling register→login (the toggle carries
//     no `?next=` of its own) would drop the clone and dump them on /dashboard.
//   · `?nova=1` — "I have no website yet" — is a funnel intent too, and has to
//     survive signup the same way `?url=` does.
//   · An explicit `?next=` wins for login only. Register always goes to the hub,
//     because a brand-new account has nothing to go back to.

export type AuthMode = 'login' | 'register'

/** Reads one query parameter. `URLSearchParams.get` satisfies this as-is. */
export type ParamReader = (key: string) => string | null

/** The provisioning hub, carrying whatever funnel intent came with the visitor. */
export function cloneNextFor(get: ParamReader): string {
  const cloneUrl = get('url') || ''
  if (cloneUrl) return `/benvinguda?url=${encodeURIComponent(cloneUrl)}`
  if (get('nova') === '1') return '/benvinguda?nova=1'
  return '/benvinguda'
}

export function authNextFor(mode: AuthMode, get: ParamReader): string {
  if (mode === 'register') return cloneNextFor(get)
  const explicit = get('next')
  if (explicit) return explicit
  const hasFunnelIntent = !!(get('url') || get('nova') === '1')
  return hasFunnelIntent ? cloneNextFor(get) : '/dashboard'
}

/** A ParamReader over Next's plain `searchParams` object (server side). */
export function readerFor(params: Record<string, string | string[] | undefined>): ParamReader {
  return key => {
    const v = params[key]
    if (Array.isArray(v)) return v[0] ?? null
    return v ?? null
  }
}
