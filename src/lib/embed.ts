// Shared video-embed helpers, used by BOTH the editor node (client, Embed.tsx)
// and the public render (server, theme.ts `fillEmbeds`). Single source of truth
// for which providers are allowed and how a safe iframe src is built — always
// from a VALIDATED id, never from raw user input. Pure + dependency-free so it's
// safe to import on the client and trivial to unit-test.

export type EmbedProvider = 'youtube' | 'vimeo'

// Extract the provider + id from a pasted/typed URL. Returns null when it's not a
// supported video URL, so callers can fall back (leave it as a plain link).
export function parseEmbedUrl(raw: string): { provider: EmbedProvider; id: string } | null {
  const url = (raw ?? '').trim()
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (yt) return { provider: 'youtube', id: yt[1] }
  const vi = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vi) return { provider: 'vimeo', id: vi[1] }
  return null
}

// Build the iframe src from a provider + id. The id is re-validated here (strict
// charset per provider), so an unexpected/tampered value can never leak into the
// src — it returns null instead, and callers render nothing.
export function embedSrc(provider: string, id: string): string | null {
  if (provider === 'youtube' && /^[a-zA-Z0-9_-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`
  if (provider === 'vimeo' && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
  return null
}
