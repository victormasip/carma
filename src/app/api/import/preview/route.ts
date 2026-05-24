import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isValidHttpUrl, isSafeUrl, safeFetchText, detectLangFromUrl } from '@/lib/scrape/http'
import { extractWithSelectors } from '@/lib/scrape/extract'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

  let body: { url?: string; selectors?: Record<string, string> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invàlid' }, { status: 400 }) }

  const rawUrl = body.url?.trim() ?? ''
  if (!isValidHttpUrl(rawUrl)) return NextResponse.json({ error: 'URL no vàlida' }, { status: 400 })
  if (!isSafeUrl(rawUrl)) return NextResponse.json({ error: 'URL no permesa' }, { status: 400 })

  const html = await safeFetchText(rawUrl, { timeout: 15_000 })
  if (!html) return NextResponse.json({ error: 'No s\'ha pogut accedir a la pàgina. Comprova que la URL és correcta.' }, { status: 422 })

  const extracted = extractWithSelectors(html, body.selectors ?? {})
  const language = detectLangFromUrl(rawUrl)

  return NextResponse.json({ ...extracted, language, url: rawUrl })
}
