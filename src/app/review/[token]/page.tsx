// /review/[token] — the WhatsApp-agent draft approval page (T5).
//
// Public, token-gated (no login): the 256-bit single-use token in the URL is the
// capability. We resolve it to a draft, show one of four states (invalid / expired
// / already-published / active review), and let the owner publish with one tap.
//
// Reads use the admin client (the token is the authorization; RLS would block an
// anonymous visitor). All writes happen in the server action (./actions).

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/whatsapp/tokens'
import { WA_TABLES } from '@/lib/whatsapp/types'
import { sanitizeHtml } from '@/lib/writing/generate'
import ReviewScreen, { StatusView } from './ReviewClient'
import { buildArticleUrl } from './shared'

export const dynamic = 'force-dynamic'

// Review links must never be indexed (they carry a capability token).
export const metadata: Metadata = {
  title: 'Revisa el teu esborrany · Carma',
  robots: { index: false, follow: false },
}

function htmlOf(content: unknown): string {
  if (content && typeof content === 'object' && 'html' in content) {
    const h = (content as { html: unknown }).html
    if (typeof h === 'string') return h
  }
  return ''
}

function readingMinutes(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

// Kept out of the component body so the (impure) clock read isn't called during render.
function isTokenExpired(expiresAt: string, status: string): boolean {
  return new Date(expiresAt).getTime() < Date.now() || status === 'revoked' || status === 'expired'
}

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: tk } = await admin
    .from(WA_TABLES.reviewTokens)
    .select('post_id, site_id, status, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!tk) {
    return (
      <StatusView
        variant="invalid"
        title="Enllaç no vàlid"
        message="Aquest enllaç de revisió no existeix o ja no és actiu. Comprova que l'has copiat sencer."
      />
    )
  }

  const [{ data: post }, { data: site }, { data: outcome }] = await Promise.all([
    admin.from('posts').select('title, slug, content, excerpt, categories, meta, is_published').eq('id', tk.post_id).maybeSingle(),
    admin.from('sites').select('name, subdomain').eq('id', tk.site_id).maybeSingle(),
    admin.from(WA_TABLES.outcomes).select('transcript').eq('post_id', tk.post_id).maybeSingle(),
  ])

  if (!post) {
    return (
      <StatusView
        variant="invalid"
        title="Esborrany no trobat"
        message="L'article d'aquest enllaç ja no existeix."
      />
    )
  }

  const host = (await headers()).get('x-forwarded-host') ?? (await headers()).get('host') ?? undefined
  const articleUrl = buildArticleUrl(site?.subdomain as string | null | undefined, post.slug as string, tk.site_id, host)

  // Already-published (consumed token or the post is live) → success state.
  if (tk.status === 'consumed' || post.is_published === true) {
    return (
      <StatusView
        variant="published"
        title="Publicat ✓"
        message="Aquest article ja és online al teu blog."
        actionHref={articleUrl}
        actionLabel="Veure l'article"
      />
    )
  }

  // Expired / revoked → caducat state.
  if (isTokenExpired(tk.expires_at, tk.status) || tk.status !== 'active') {
    return (
      <StatusView
        variant="expired"
        title="Enllaç caducat"
        message="Aquest enllaç de revisió ha caducat. Torna a enviar-me la teva nota de veu i te'n preparo un de nou."
      />
    )
  }

  // Active → the review screen.
  const html = sanitizeHtml(htmlOf(post.content))
  const meta = (post.meta ?? {}) as { focus_keyword?: string }

  return (
    <ReviewScreen
      token={token}
      siteName={(site?.name as string) ?? ''}
      title={(post.title as string) ?? ''}
      html={html}
      excerpt={(post.excerpt as string) ?? ''}
      focusKeyword={meta.focus_keyword ?? ''}
      categories={((post.categories as string[] | null) ?? []).filter(Boolean)}
      transcript={(outcome?.transcript as string | null) ?? null}
      readingMin={readingMinutes(html)}
      editUrl={`/dashboard/sites/${tk.site_id}/posts/${tk.post_id}/edit`}
    />
  )
}
