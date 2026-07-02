'use server'

// Agent Console — the dashboard chat's server half.
//
// The same brain as the WhatsApp channel: `runAgent` (a pure function) decides
// clarify-or-draft and handles the revision loop. The console calls it
// SYNCHRONOUSLY — no webhook, no job queue, no Kapso — because the caller is an
// authenticated dashboard session holding an open request, not an inbound phone
// message with a 3-second provider timeout. That also means none of the phone
// channel's stranger-cost guardrails are needed here: every turn is behind
// login + site membership.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAgent, type AgentDraft } from '@/lib/whatsapp/agent'
import { createPost } from '@/lib/actions/posts'
import { WA_TABLES } from '@/lib/whatsapp/types'
import { publicBlogUrl } from '@/lib/sites/domain'
import { LOCALE_META, normalizeLocale } from '@/lib/i18n/config'

export type ConsoleTurnResult =
  | { ok: true; kind: 'clarify'; message: string }
  | { ok: true; kind: 'draft'; draft: AgentDraft }
  | { ok: false; error: string }

export type ConsolePublishResult =
  | { ok: true; postId: string; editorUrl: string; liveUrl: string; published: boolean }
  | { ok: false; error: string }

// Same write policy as the rest of the CMS: superadmin, or an assigned member
// of THIS site. Returns the admin client on success (RLS-free reads afterwards).
async function assertConsoleAccess(siteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No has iniciat sessió')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'superadmin') {
    const { data: member } = await supabase
      .from('site_users').select('site_id').eq('site_id', siteId).eq('user_id', user.id).maybeSingle()
    if (!member) throw new Error('No tens accés a aquest lloc')
  }
  return createAdminClient()
}

/** One agent turn: a fresh brief, or a revision of the current draft. */
export async function consoleAgentTurn(
  siteId: string,
  input: { brief?: string; editInstructions?: string; currentDraft?: { title: string; contentHtml: string; excerpt?: string } },
): Promise<ConsoleTurnResult> {
  try {
    const admin = await assertConsoleAccess(siteId)

    const brief = (input.brief ?? '').trim()
    const editing = !!(input.editInstructions?.trim() && input.currentDraft)
    if (!brief && !editing) return { ok: false, error: 'Escriu de què vols l’article.' }

    // Site context for the agent: name, article language, existing categories.
    const [siteRes, themeRes, catRes] = await Promise.all([
      admin.from('sites').select('name').eq('id', siteId).maybeSingle(),
      admin.from('site_themes').select('default_locale').eq('site_id', siteId).maybeSingle(),
      admin.from('posts').select('categories').eq('site_id', siteId).order('created_at', { ascending: false }).limit(40),
    ])
    if (!siteRes.data) return { ok: false, error: 'Lloc no trobat' }

    const locale = normalizeLocale((themeRes.data as { default_locale?: string } | null)?.default_locale)
    const existingCategories = [...new Set(
      (catRes.data ?? []).flatMap((r) => (r.categories as string[] | null) ?? []),
    )].slice(0, 12)

    const result = await runAgent({
      brief,
      articleLanguage: LOCALE_META[locale].native,
      siteName: siteRes.data.name as string,
      existingCategories,
      // A revision must always produce a draft; a fresh brief may ask ONE
      // clarification (same Turn-Budget-1 spirit as the phone channel — the
      // console user can simply answer in the next message).
      mustDraft: editing,
      ...(editing ? { editInstructions: input.editInstructions, currentDraft: input.currentDraft } : {}),
    })

    if (result.kind === 'clarify') return { ok: true, kind: 'clarify', message: result.message }
    return { ok: true, kind: 'draft', draft: result.draft }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}

/** Persist a console draft as a post — published live, or as an editor draft. */
export async function consolePublish(
  siteId: string,
  draft: AgentDraft,
  opts: { publish: boolean; brief?: string },
): Promise<ConsolePublishResult> {
  try {
    const admin = await assertConsoleAccess(siteId)

    const data = {
      title: draft.title,
      slug: draft.slug,
      content: { html: draft.contentHtml },
      excerpt: draft.excerpt,
      categories: draft.categories,
      tags: draft.tags,
      seo_title: draft.seoTitle,
      seo_description: draft.seoDescription,
      focus_keyword: draft.focusKeyword,
      is_published: opts.publish,
    }

    // createPost enforces site access + cross-locale slug uniqueness itself. A
    // slug collision shouldn't bounce the user back to the chat: retry once with
    // a short suffix (same article, unique address).
    let res = await createPost(siteId, data)
    if (res.error && /slug/i.test(res.error)) {
      res = await createPost(siteId, { ...data, slug: `${draft.slug}-${Date.now().toString(36).slice(-4)}` })
    }
    if (res.error || !res.id) return { ok: false, error: res.error ?? 'No s’ha pogut crear l’article' }

    // Live URL: pretty subdomain when configured, /render fallback in dev.
    const { data: site } = await admin.from('sites').select('subdomain').eq('id', siteId).maybeSingle()
    const sub = (site as { subdomain?: string | null } | null)?.subdomain ?? ''
    const path = `/${encodeURIComponent(draft.slug)}`
    const liveUrl = (sub ? publicBlogUrl(sub, { path }) : null) ?? `/render/${siteId}${path}`

    // Outcome row (thread_id null = console channel) so the Activitat feed and
    // the 60-day outcome loop cover both channels. Best-effort: the table only
    // exists after the WhatsApp migrations, and its absence must never block a
    // publish.
    try {
      await admin.from(WA_TABLES.outcomes).insert({
        post_id: res.id,
        site_id: siteId,
        thread_id: null,
        transcript: opts.brief?.slice(0, 4000) ?? null,
        ...(opts.publish ? { published_url: liveUrl, published_at: new Date().toISOString() } : {}),
      })
    } catch { /* pre-migration */ }

    return {
      ok: true,
      postId: res.id,
      editorUrl: `/dashboard/sites/${siteId}/posts/${res.id}/edit`,
      liveUrl,
      published: opts.publish,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconegut' }
  }
}
