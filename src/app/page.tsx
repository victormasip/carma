import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import LandingPage from '@/components/marketing/LandingPage'
import { LANDING } from '@/components/marketing/copy'
import { LOCALE_COOKIE, UI_LOCALES, normalizeLocale, uiLocale, type UiLocale } from '@/lib/i18n/config'

// Landing locale: an explicit choice (the switcher cookie, shared with the
// dashboard) wins; first-time visitors get their browser language when we have
// that dictionary; Catalan otherwise (Catalan-first product).
async function landingLocale(): Promise<UiLocale> {
  const store = await cookies()
  const chosen = store.get(LOCALE_COOKIE)?.value
  if (chosen) return uiLocale(normalizeLocale(chosen))

  const accept = (await headers()).get('accept-language') ?? ''
  for (const part of accept.toLowerCase().split(',')) {
    const code = part.trim().slice(0, 2)
    if ((UI_LOCALES as readonly string[]).includes(code)) return code as UiLocale
  }
  return 'ca'
}

export async function generateMetadata(): Promise<Metadata> {
  const c = LANDING[await landingLocale()]
  return { title: c.meta.title, description: c.meta.description }
}

export default async function Home() {
  const locale = await landingLocale()
  return <LandingPage locale={locale} />
}
