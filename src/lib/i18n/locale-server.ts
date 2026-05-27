import 'server-only'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './config'

// Read the dashboard UI locale from its cookie (server components / actions).
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value)
}
