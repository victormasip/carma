'use client'

import { createContext, useContext, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale, type Locale } from './config'
import { MESSAGES } from './messages'

type LocaleContextValue = {
  locale: Locale
  t: (key: string) => string
  setLocale: (l: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((l: Locale) => {
    const next = normalizeLocale(l)
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`
    setLocaleState(next)
    // Re-render server components so any server-localized output updates too.
    router.refresh()
  }, [router])

  const t = useCallback(
    (key: string) => MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key,
    [locale],
  )

  return <LocaleContext.Provider value={{ locale, t, setLocale }}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}

export function useT(): (key: string) => string {
  return useLocale().t
}
