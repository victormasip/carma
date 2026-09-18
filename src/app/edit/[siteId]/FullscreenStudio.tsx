// NO 'use client' — this component needs nothing from a browser.
//
// It is a <div> and three children, every one of which declares its own client
// boundary. Marking this file too only moved the boundary one level higher and
// put its JSX in the bundle for nothing. `npm run test:perf` §4 is what noticed:
// a client component with no hook, no handler and no browser API, rendered from
// a server tree. (It is the only one in the repo — Button and friends look like
// candidates until you check who renders them, and the answer is always another
// client component, where the directive changes nothing.)

// Full-screen "edit on your live site" host. Sets up the exact same Theme Studio
// stack as the dashboard tab (provider + capture modal + CarmaStudio), but filling
// the viewport with no dashboard chrome — reached from the render's owner-only
// "Edit this site" button.

import { ThemeStudioProvider, type Theme } from '@/app/(app)/dashboard/sites/[id]/ThemeStudioContext'
import ThemeCaptureModal from '@/app/(app)/dashboard/sites/[id]/ThemeCaptureModal'
import CarmaStudio from '@/app/(app)/dashboard/sites/[id]/studio/CarmaStudio'
import { publicSiteUrl } from '@/lib/sites/domain'

export default function FullscreenStudio({ siteId, subdomain = null, isSuperAdmin, initialTheme, defaultLocale, regenCount, exitHref }: {
  siteId: string
  subdomain?: string | null
  isSuperAdmin: boolean
  initialTheme: Theme | null
  defaultLocale?: string
  regenCount: number
  exitHref?: string
}) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-surface">
      <ThemeStudioProvider
        siteId={siteId}
        subdomain={subdomain}
        initialTheme={initialTheme}
        defaultLocale={defaultLocale}
        canTranslate={isSuperAdmin}
        isPremium={isSuperAdmin}
        initialRegenCount={regenCount}
      >
        <ThemeCaptureModal isSuperAdmin={isSuperAdmin} />
        <CarmaStudio isSuperAdmin={isSuperAdmin} fullscreen exitHref={exitHref ?? publicSiteUrl({ id: siteId, subdomain })} />
      </ThemeStudioProvider>
    </div>
  )
}
