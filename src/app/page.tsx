import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies, headers } from 'next/headers'
import { cacheLife } from 'next/cache'
import LandingPage from '@/components/marketing/LandingPage'
import CommunityWall from '@/components/marketing/CommunityWall'
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

/**
 * The landing in ONE locale, cached forever.
 *
 * There are three UI locales, and the marketing copy only changes when we deploy,
 * so this is three cache entries that never need to expire. The locale arrives as
 * a plain argument, which makes it part of the cache key — the documented way to
 * feed a request-time value into a cached component.
 */
async function CachedLanding({ locale }: { locale: UiLocale }) {
  'use cache'
  cacheLife('max')
  // THE WALL IS A SLOT, NOT A CHILD COMPONENT CALL.
  //
  // Everything a cached component imports and renders becomes part of ITS cache
  // entry — so rendering <CommunityWall/> inline here would freeze the real
  // member blogs at 'max' alongside the marketing copy, which is the static
  // placeholder we are removing, rebuilt out of a database.
  //
  // Passed as a prop it is a compositional slot: "anything included as children,
  // or other compositional slots, in the returned JSX will be passed through the
  // cached component without affecting its cache entry" (use-cache docs). So the
  // wall keeps its own hourly life and its own Suspense boundary, and the
  // landing around it stays cached forever.
  return (
    <LandingPage
      locale={locale}
      wall={
        <Suspense fallback={<WallSkeleton />}>
          <CommunityWall locale={locale} />
        </Suspense>
      }
    />
  )
}

/** The wall's own first frame: five cards' worth of quiet, at the right height,
 *  so the section never jumps when the real blogs land. */
function WallSkeleton() {
  return (
    <div className="mt-6 overflow-hidden" aria-hidden>
      <div className="wall">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-[19.5rem] w-[17rem] shrink-0 rounded-2xl border border-border bg-surface-subtle" />
        ))}
      </div>
    </div>
  )
}

/** Reads the request (cookie / Accept-Language), then hands a plain string down. */
async function LocalizedLanding() {
  const locale = await landingLocale()
  return <CachedLanding locale={locale} />
}

export default function Home() {
  // Under Cache Components the locale read is request-time work, so it needs its
  // own boundary — without one it blocks the whole document, which is what the
  // root `loading.tsx` (an opaque full-viewport knot overlay) was papering over.
  //
  // The fallback is the page's own first frame: brand ground plus the gold halos
  // that sit behind the hero. It occupies the same box, so the streamed landing
  // fills in rather than pushing anything around.
  return (
    <Suspense fallback={<LandingCanvas />}>
      <LocalizedLanding />
    </Suspense>
  )
}

function LandingCanvas() {
  // The page's own first frame. It must be the INK ground the hero opens on —
  // a light canvas here would flash white and then go dark the moment the
  // streamed landing arrives, which is worse than no fallback at all.
  return (
    <div className="scene-ink relative min-h-screen overflow-hidden" aria-hidden>
      <div
        className="halo halo-drift-a"
        style={{ width: 520, height: 520, background: 'rgba(245,188,0,0.16)', top: -140, left: -110 }}
      />
      <div
        className="halo halo-drift-b"
        style={{ width: 460, height: 460, background: 'rgba(245,188,0,0.10)', top: 240, right: -120 }}
      />
    </div>
  )
}
