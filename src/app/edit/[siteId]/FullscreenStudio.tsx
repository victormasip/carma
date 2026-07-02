'use client'

// Full-screen "edit on your live site" host. Sets up the exact same Theme Studio
// stack as the dashboard tab (provider + capture modal + CarmaStudio), but filling
// the viewport with no dashboard chrome — reached from the render's owner-only
// "Edit this site" button.

import { ThemeStudioProvider, type Theme } from '@/app/dashboard/sites/[id]/ThemeStudioContext'
import ThemeCaptureModal from '@/app/dashboard/sites/[id]/ThemeCaptureModal'
import CarmaStudio from '@/app/dashboard/sites/[id]/studio/CarmaStudio'

export default function FullscreenStudio({ siteId, isSuperAdmin, initialTheme, defaultLocale, regenCount }: {
  siteId: string
  isSuperAdmin: boolean
  initialTheme: Theme | null
  defaultLocale?: string
  regenCount: number
}) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-surface">
      <ThemeStudioProvider
        siteId={siteId}
        initialTheme={initialTheme}
        defaultLocale={defaultLocale}
        canTranslate={isSuperAdmin}
        isPremium={isSuperAdmin}
        initialRegenCount={regenCount}
      >
        <ThemeCaptureModal isSuperAdmin={isSuperAdmin} />
        <CarmaStudio isSuperAdmin={isSuperAdmin} fullscreen exitHref={`/render/${siteId}`} />
      </ThemeStudioProvider>
    </div>
  )
}
