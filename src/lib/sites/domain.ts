// Pure, dependency-free helpers for tenant subdomain routing. Safe to import from
// edge middleware, server components/handlers, AND client components — it touches
// nothing but strings + NEXT_PUBLIC env.
//
// Model: each site has a `subdomain` and is served at `<subdomain>.<ROOT_DOMAIN>`
// (production) or `<subdomain>.localhost:<port>` (dev — Chrome/Edge/Firefox resolve
// any `*.localhost` to loopback). The canonical render route `/render/<uuid>` keeps
// working; the subdomain just rewrites onto it.
//
// Set `NEXT_PUBLIC_ROOT_DOMAIN` (e.g. `carma.cat`) in production. Unset in dev →
// `*.localhost` handling kicks in automatically.

// Labels that are NEVER a tenant blog (the app itself / infra / reserved routes).
const RESERVED = new Set([
  'www', 'app', 'api', 'admin', 'dashboard', 'mail', 'smtp', 'static', 'cdn',
  'assets', 'render', 'embed', 'auth', 'login', 'registre', 'register',
  'benvinguda', 'reset-password', 'preview', 'blog',
])

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/** Slugify a site name into a DNS-safe subdomain label. */
export function slugifySubdomain(name: string): string {
  const base = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (é→e, ç→c…)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return base || 'blog'
}

/** Configured production apex (lowercased, no port), or '' when unset (dev). */
export function rootDomain(): string {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN || '').trim().toLowerCase().split(':')[0]
}

/**
 * Given a request Host header, return the tenant subdomain label, or null when the
 * host is the app itself (apex / www / bare localhost) or any non-tenant host.
 * Conservative by design: anything it doesn't positively recognise as a single
 * tenant label returns null, so the main app is never misrouted.
 */
export function extractSubdomain(host: string | null | undefined): string | null {
  if (!host) return null
  const h = host.split(':')[0].trim().toLowerCase()
  if (!h) return null

  // Local dev: <sub>.localhost
  if (h === 'localhost' || h.endsWith('.localhost')) {
    if (h === 'localhost') return null
    const label = h.slice(0, -'.localhost'.length)
    return label && !label.includes('.') && !RESERVED.has(label) ? label : null
  }

  const root = rootDomain()
  if (!root) return null
  if (h === root || h === `www.${root}`) return null
  if (h.endsWith(`.${root}`)) {
    const label = h.slice(0, -(root.length + 1))
    if (!label || label.includes('.') || RESERVED.has(label)) return null
    return label
  }
  return null
}

/**
 * Host (incl. port) where a blog is publicly reachable, or null if it can't be
 * derived. `currentHost` (e.g. window.location.host) lets the client build the
 * right dev host/port when no ROOT_DOMAIN is configured.
 */
export function blogHost(subdomain: string, currentHost?: string): string | null {
  if (!subdomain) return null
  const root = rootDomain()
  if (root) {
    // Preserve a dev/preview port if present on the current host.
    const port = currentHost && currentHost.includes(':') ? `:${currentHost.split(':')[1]}` : ''
    return `${subdomain}.${root}${port}`
  }
  if (currentHost) {
    const [hostname, port] = currentHost.split(':')
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return `${subdomain}.localhost${port ? `:${port}` : ''}`
    }
  }
  return null
}

/** Full public blog URL, or null if the host can't be derived. */
export function publicBlogUrl(
  subdomain: string,
  opts: { currentHost?: string; path?: string } = {},
): string | null {
  const host = blogHost(subdomain, opts.currentHost)
  if (!host) return null
  const proto = host.split(':')[0].endsWith('localhost') ? 'http:' : 'https:'
  return `${proto}//${host}${opts.path ?? '/'}`
}
